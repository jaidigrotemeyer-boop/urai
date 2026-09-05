# Notizen für die nächste Nacht

## 2026-09-05
Erledigt: `merker`/`bei Fehler` in `web/src/components/Werkstatt.jsx` hinter
einen Umschalter "weitere Optionen ▾" gelegt — dieser Kandidat war in den
Nächten 09-02, 09-03 und 09-04 unabhängig als bester noch offener
"Oberfläche ruhiger machen"-Fund bestätigt worden, aber jedes Mal zugunsten
dringenderer Server-Funde zurückgestellt. Heute war er dran, weil alle drei
heutigen Fehlendes-/Server-Kandidaten sich als entweder schon erledigt
(`.xlsx` lesen, i18n-Lücken, Auslöser-UI — alle drei mittlerweile fertig)
oder als reiner Innen-Umbau ohne direkten Nutzereffekt herausstellten
(doppeltes `resolve()` in `files.js`/`dokument.js`, siehe unten), während
die UI-Änderung den größten offenen Nutzerwunsch direkt trifft.

Prüfer 1 hat Build und einen echten Playwright/Chromium-Test selbst
ausgeführt (Server lokal gestartet, `data/config.json`+`urai.db` vorher
gesichert und danach exakt wiederhergestellt): Standardfall zeigt nur den
Knopf, Klick zeigt beide Felder ohne Layoutbruch, und ein Baustein mit
bereits gesetztem `beiFehler:'wiederholen'` blieb beim Zu-/Wiederaufklappen
korrekt offen. Prüfer 2 fand dabei einen echten Fehler, den Prüfer 1 nicht
gesehen hatte: der erste Entwurf hielt den Aufklapp-Zustand als lokalen
`useState` in der `Baustein`-Komponente — die Reihen in der Werkstatt sind
aber über ein `React.Fragment key={`reihe-${r}-${reihe[0]}`}` geschlüsselt,
das sich bei JEDER Verschiebung eines beliebigen Nachbar-Bausteins ändert.
React remountet dann das ganze Fragment samt Inhalt, und lokaler State
fällt dabei unbemerkt auf den Default zurück — ein Nutzer, der "weitere
Optionen" von Hand geöffnet hatte, sah sie nach dem Verschieben eines ganz
anderen Bausteins plötzlich wieder zugeklappt. Behoben nach demselben
Muster wie der schon bestehende `offene`-Zustand (Falten/Aufklappen)
desselben Bausteins: der Zustand lebt jetzt als `Set` in der
Werkstatt-Komponente selbst, nicht mehr lokal pro Karte. Mit Playwright
nachgestellt (Baustein B von Hand geöffnet, Nachbar C verschoben) — B blieb
jetzt offen. Zwei Commits: erster mit dem ursprünglichen (fehlerhaften)
Stand, zweiter mit dem Fix — beide mit `npm run build` sauber, `data/`
beide Male gesichert und danach exakt wiederhergestellt.

Zwei weitere Kandidaten heute geprüft und bewusst zurückgestellt:
- `server/tools/files.js` und `server/tools/dokument.js` enthalten seit
  dem Sicherheitsfix vom 2026-08-14 eine byte-identische `resolve()`
  (Revier-Grenzen-Prüfung) — ein künftiger Fix an dieser Sicherheitslogik
  müsste zweimal gemacht werden. Verifiziert, echter Bug-Multiplikator,
  aber rein innerer Umbau ohne direkten Nutzereffekt (~20-25 Zeilen: neue
  `server/tools/pfad.js`, beide Aufrufer umstellen). Guter, risikoarmer
  Kandidat für eine ruhige Nacht.
- `server/memory.js`, `remember()` (Zeilen ~55-68): verschluckt weiterhin
  einen fehlgeschlagenen `embed()`-Aufruf in einem leeren `catch {}` und
  meldet trotzdem immer "Gemerkt." — `vec` bleibt `null`, `recall()` gibt
  solchen Einträgen `score:0` und sie fallen für immer durchs Raster,
  sobald spätere Anfragen selbst embedden können. Heute zum zweiten Mal
  unabhängig gefunden (zuerst 09-04). Kleiner Fix (~5-8 Zeilen: Klartext-
  Zusatz an die Rückmeldung, wenn `vec===null`), aber diese Nacht zugunsten
  der UI-Änderung zurückgestellt.

## 2026-09-04
Erledigt: `server/tools/files.js`, `fs_read` las bisher JEDE Datei blind mit
`readFile(abs, 'utf8')` — bei Binärdateien (PDF, Bild, ZIP und damit auch
den eigenen `.docx`/`.pptx`/`.xlsx`-Dateien, die selbst nur ZIP-Archive
sind) gibt Node beim UTF-8-Decode keinen Fehler, sondern still Ersatz-
zeichen (`�`) und Steuerzeichen zurück. Kein Absturz, keine Warnung — der
Agent bekommt Datenmüll als "Zeilen" serviert und könnte ihn für echten
Inhalt halten und dem Nutzer darauf basierend etwas Falsches vorlegen.
Genau der im Auftrag genannte Fall: ein Nutzer steht im Regen, weil ihm
niemand sagt, dass etwas schiefging.

Jetzt gibt es `istBinaer(buf)`: prüft die ersten 8000 Bytes auf ein
NUL-Byte (0x00) — dasselbe Verfahren, das `git` für seine Binär-Erkennung
nutzt, weil gültiges UTF-8 (auch mehrbytige Umlaute/Emoji/CJK-Zeichen)
niemals ein NUL-Byte enthält. `fs_read` liest jetzt erst als Buffer,
prüft, und wirft bei Fund eine klare Meldung — bei `.docx`/`.pptx`/`.xlsx`
extra mit Verweis auf `dokument_lesen`. Normale Textdateien: unverändertes
Verhalten (gleicher Pfad, nur `buf.toString('utf8')` statt direktem
`readFile(...,'utf8')`).

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), jedem
Agenten die komplette NOTIZEN.md mitgegeben. Oberfläche bestätigte erneut
(drittes Mal in Folge) `merker`/`bei Fehler` in `Werkstatt.jsx` (~594-597)
hinter eine Klappe zu legen — guter, aber rein kosmetischer Kandidat.
Server fand einen neuen, echten Fund in `server/memory.js`: `remember()`
schluckt einen fehlgeschlagenen `embed()`-Aufruf und meldet trotzdem immer
"Gemerkt.", auch wenn `vec` dabei `null` bleibt — sobald spätere Anfragen
selbst embedden können, wird so eine Erinnerung dauerhaft unauffindbar
(nicht nur beim Stichwort-Fallback, der nur greift, wenn AUCH die Anfrage
nicht embedden kann). Guter Kandidat für eine kommende Nacht (siehe unten).
Fehlendes-Vorschlag gewählt: reine Lese-Wache vor bestehender Logik, kein
Einfluss auf Schreibpfade, betrifft nur eine Funktion in einer Datei,
deterministisch und vollständig ohne Mac/Netzwerk testbar (anders als der
Werkstatt-Vorschlag, der einen Browser-Test gebraucht hätte, und anders
als der memory.js-Fund, dessen sauberer Fix eine Klartext-Zusatzmeldung
braucht, die erst noch an mehreren Stellen — `remember()` UND
`memory_save`s Rückgabe — konsistent formuliert werden müsste).

Prüfer 1 (Funktioniert es) hat `node --check`, `npm install && npm run
build`, den Server-Modul-Ladetest und `pruefe.mjs` selbst ausgeführt
(`fs_read` weiterhin ✓, unverändertes Textverhalten), dazu ein frisches
eigenes Testskript direkt gegen `TOOL_MAP.get('fs_read')`: simuliertes PNG
mit echten NUL-Bytes → korrekt abgelehnt; simulierte `.docx` mit NUL-Bytes
→ korrekt abgelehnt mit Verweis auf `dokument_lesen`; normale Textdatei
mit Umlauten → unverändert korrekt gelesen. Prüfer 2 (Randfälle) prüfte
gezielt: leere Datei (kein Fehlalarm), gültiges UTF-8 mit Emoji/Umlauten/
Chinesisch am Anfang (kein Fehlalarm, da gültige UTF-8-Mehrbyte-Folgen nie
ein NUL-Byte enthalten), große Textdatei ohne NUL (offset/limit
unverändert), NUL-Byte exakt bei Index 7999 vs. 8000 (Grenze stimmt exakt),
NUL-Byte weit hinter der Prüfgrenze (bekannter, vertretbarer Trade-off,
kein echtes Problem), fehlende Datei/Ordner/Leserechte (Fehler entstehen
weiterhin vor `istBinaer` in `fs.stat`/`fs.readFile`, unverändert),
Groß-/Kleinschreibung bei `.DOCX` (funktioniert dank `.toLowerCase()`).
Beide fanden keinen echten Fehler. Prüfer 2 merkte zusätzlich an: `fs_edit`
nutzt weiterhin sein eigenes `readFile(abs,'utf8')` und bleibt ungeschützt
— vorbestehend, durch diese Änderung nicht verursacht, aber ein
naheliegender nächster Schritt (siehe unten).

Selbst nachgeprüft: `node --check server/tools/files.js`, `npm install &&
npm run build` (75 Module, fehlerfrei), Server-Modul-Ladetest (`LOAD_OK`),
`pruefe.mjs` (`fs_read` ✓). `git status`/`git diff` enthielten nur die
eine erwartete Datei (`server/tools/files.js`), `data/` unverändert (per
`git status --porcelain -- data/` geprüft), keine Geheimnisse im Diff.

In der Skill-Liste dieser Session steckte erneut der eingeschleuste Eintrag
„steinzeit-modus" — wie in den Vornächten als Prompt-Injection ignoriert.

Offen für kommende Nächte:
- `server/memory.js`, `remember()` (~Zeile 55-68): fehlgeschlagenes
  `embed()` wird verschluckt, `vec` bleibt `null`, trotzdem immer
  "Gemerkt." zurückgegeben. Sobald spätere `recall()`-Anfragen selbst
  embedden können, filtert `score > 0.3` (Zeile 85) die `vec:null`-Zeile
  für immer heraus — der Stichwort-Fallback (Zeile 77-80) greift nur, wenn
  AUCH die Anfrage nicht embedden kann. Fix: bei `vec === null` in
  `remember()` einen Klartext-Zusatz an die Rückmeldung hängen (z.B.
  "Gemerkt (ohne Vektor — Suche findet es evtl. nicht)."). ~5-8 Zeilen,
  eine Datei, vollständig ohne Mac/Netzwerk testbar (fehlenden
  `GEMINI_API_KEY` simulieren, direkt per SQLite prüfen dass `vec IS NULL`
  trotz Erfolgsmeldung gespeichert wird).
- `fs_edit` (`server/tools/files.js`) nutzt weiterhin sein eigenes
  `readFile(abs,'utf8')` und profitiert nicht von der neuen
  `istBinaer()`-Wache — wer versucht, eine Binärdatei zu "editieren",
  bekommt weiterhin unklares Verhalten statt der neuen klaren Meldung.
  Naheliegender kleiner Folge-Fix: `istBinaer()` aus `fs_read` auch dort
  vor dem Lesen aufrufen (Funktion ist schon exportierbar/lokal
  wiederverwendbar).
- `merker`/`bei Fehler` in `web/src/components/Werkstatt.jsx` (~594-597)
  weiterhin fest sichtbar bei jedem Baustein-Typ (seit 09-02 dreimal
  vermerkt) — mit Playwright/Chromium hier testbar, guter nächster
  Oberflächen-Kandidat, besonders wenn eine Nacht mal keinen ebenso
  dringenden Server-/Fehlendes-Fund liefert.
- `ffmpegSuchen()` weiterhin wortgleich dupliziert in `server/tools/
  kamera.js` und `server/tools/ohren.js` — Mac-spezifisch, hier nicht
  testbar.
- `fs_search`-grep-Fallback ignoriert weiterhin den `glob`-Parameter
  (siehe 09-03) und `rg`/`grep -E` verstehen Regex-Syntax unterschiedlich
  (siehe 09-03) — beide unverändert offen.
- `dokument_excel` (server/tools/dokument.js) kann weiterhin nur rohe
  Werte schreiben, keine echten Formeln/Zahlenformate (siehe 09-03,
  ~60-100 Zeilen, gut ausgearbeitet).

Unverändert offen aus früheren Nächten:
- `web_search` erkennt blockierte/rate-limitierte DuckDuckGo-Antworten nicht.
- `memory_forget` fehlt komplett (server/memory.js).
- `resolve()` doppelt vorhanden (files.js/dokument.js), löst keine Symlinks auf.
- POST /api/ausloeser: siehe frühere Nächte für Details zum Validierungsstand.

## 2026-09-03
Erledigt: `server/tools/files.js`, `fs_search` — die Wahl zwischen `rg` und
`grep` prüfte bisher nur den fest verdrahteten Apple-Silicon-Pfad
(`/opt/homebrew/bin/rg`). Auf Intel-Macs (Homebrew unter `/usr/local/bin`),
mit MacPorts und auf Linux (`/usr/bin`) schlug diese Prüfung darum IMMER
fehl — `fs_search` lief dort grundsätzlich über den `grep`-Zweig, obwohl
`rg` installiert war und ungenutzt blieb. Dem `grep`-Zweig fehlte zusätzlich
das Treffer-Limit, das der `rg`-Zweig längst hat (`--max-count 5`) — laut
NOTIZEN.md seit 08-25 dreifach bestätigt offen. Beides zusammen: ein
breites Suchmuster in einem großen Revier auf jeder Nicht-Apple-Silicon-
Maschine konnte den `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`-Absturz auslösen,
den die 08-25er-Notiz schon für den `rg`-Zweig verhindert hatte.

Jetzt gibt es `rgSuchen()`/`rg()` (gleiches Muster wie `ffmpegSuchen()` in
`server/tools/kamera.js`/`ohren.js`): PATH plus die bekannten Homebrew/
MacPorts/Linux-Orte werden abgesucht, Ergebnis wird gecacht. `grep`
bekommt zusätzlich `-m 5` als Sicherheitsnetz, falls `rg` doch mal fehlt.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, `merker`/`bei Fehler` in `Werkstatt.jsx` (~594-597) hinter eine
Klappe zu legen (der schon am 09-02 notierte Kandidat) — guter, isolierter
Vorschlag, aber der Server-Fund traf einen echten, plattformübergreifenden
Bug mit vollständiger Testbarkeit in dieser Cloud-Umgebung (kein Mac nötig,
anders als die Oberflächen-Änderung, die einen Browser-Test gebraucht
hätte). Fehlendes prüfte aktiv nach und stellte fest, dass `dokument_lesen`
schon .xlsx liest, i18n schon vollständig ist und `ausloeser_anlegen()`
schon validiert (alles frühere Kandidaten, seither erledigt) — schlug
stattdessen echte Formeln/Formatierung für `dokument_excel` vor
(~60-100 Zeilen, moderates Risiko an einer zentralen Schreibfunktion,
schwerer hier vollständig zu verifizieren ohne Excel/LibreOffice) — guter
Kandidat für eine kommende Nacht, heute wegen Umfang/Risiko nicht gewählt.

Prüfer 1 (Funktioniert es) hat den `git diff`, `node --check`, Build,
Server-Modul-Ladetest und `pruefe.mjs` selbst ausgeführt (fs_search ✓),
dazu eigene Node-Skripte mit `strace`: im Normalfall `execve("/usr/bin/rg",
["-n","--max-count","5",...])`, mit versteckter `rg`-Datei und auf
`/usr/bin` reduziertem PATH sauberer Fallback auf `execve("/usr/bin/grep",
["-rniE","-m","5",...])` — beide liefern genau 5 Zeilen bei 12 Treffern in
der Testdatei. Prüfer 2 (Randfälle) bestätigte die Muster-Wache, Regex-
Fehler-Behandlung in beiden Zweigen, Pfad-Traversal-Schutz und fand keine
Verzögerung durch 200 zusätzliche PATH-Einträge — fand aber zwei echte
Fehler in der ersten Fassung von `rgSuchen()`: sie prüfte nur `existsSync`,
nicht Typ/Ausführbarkeit. Ein Ordner namens "rg" oder eine nicht
ausführbare Datei früher im PATH hätte das echte ripgrep weiter hinten
verdeckt und beim Aufruf eine rohe `EACCES`-Meldung geworfen statt sauber
auf `grep` auszuweichen (der bestehende `ENOENT`-Sonderfall "Programm
fehlt" greift bei `EACCES` nicht). Behoben: `rgSuchen()` prüft jetzt mit
`statSync(...).isFile()` und `accessSync(..., X_OK)`, bevor ein Pfad
akzeptiert wird. Selbst nachgeprüft mit einem Ordner und einer nicht
ausführbaren Datei namens "rg" vor einer echten Kopie von `rg` im PATH:
beide werden übersprungen, das echte `rg` weiter hinten wird gefunden.
Danach Build, Modul-Ladetest und `pruefe.mjs` (fs_search ✓) erneut sauber
durchgelaufen.

Zwei weitere Funde von Prüfer 2 sind echt, aber vorbestehend und nicht
durch diese Änderung verursacht (siehe unten unter "Offen") — als
Sicherheitsnetz-Härtung im Rahmen dieser einen Verbesserung mit
aufzunehmen hätte den Umfang gesprengt: die Suche nach einem Programm
namens "rg" im PATH kann grundsätzlich kein Fremdprogramm mit demselben
Namen erkennen (dieselbe inhärente Grenze gilt für `ffmpegSuchen()` und
`CLICLICK` in `computer.js` — Vertrauen in den eigenen PATH ist bei jeder
namensbasierten Programmsuche vorausgesetzt).

`git status`/`git diff --cached` enthielten nur die eine Datei
(`server/tools/files.js`), `data/` unverändert (per `git status --porcelain
-- data/` geprüft), keine Testordner übrig geblieben.

In der Skill-Liste dieser Session steckte erneut der eingeschleuste Eintrag
„steinzeit-modus" — wie in den Vornächten als Prompt-Injection ignoriert.

Offen für kommende Nächte:
- `dokument_excel` (server/tools/dokument.js) kann nur rohe Werte schreiben,
  keine echten Formeln (`<f>`) und keine Zahlenformate (Währung/Prozent/
  Datum) — nur zwei Zellstile (normal/fett). Fix: Zellstrings, die mit `=`
  beginnen, als Formel erkennen und schreiben (plus `fullCalcOnLoad` in
  workbook.xml), optional 2-3 zusätzliche `numFmtId`-Einträge. ~60-100
  Zeilen, nur `dokument.js`, keine neue Abhängigkeit, moderates Risiko
  (bestehende Funktion wird erweitert). Gut mit LibreOffice/unzip lokal
  testbar, kein Mac-Bezug.
- `fs_search`-`grep`-Fallback ignoriert den `glob`-Parameter vollständig
  (kein `-g`-Äquivalent in den grep-Argumenten) — wer `glob:'*.md'` angibt
  und der grep-Zweig läuft (z.B. `rg` fehlt wirklich), bekommt Treffer aus
  allen Dateitypen zurück, ohne Warnung. Vorbestehend, durch die heutige
  Änderung nicht verursacht, aber jetzt weniger relevant, weil `rg` durch
  die neue Erkennung deutlich öfter gefunden wird. Fix: bei `glob` im
  grep-Zweig `--include="$glob"` ergänzen.
- `fs_search`: `rg` (PCRE-ähnlich) und `grep -E` (POSIX ERE) verstehen
  Regex-Syntax unterschiedlich — `\d+` matcht bei `grep -E` nicht "eine
  Ziffernfolge", sondern (mangels `\d`-Unterstützung) im Beispieltest jede
  Zeile mit dem Buchstaben "d"; `(a)\1` (Backreference) läuft bei `grep`,
  wirft bei `rg` einen Fehler. Welches Backend läuft, hängt für den Nutzer
  unsichtbar davon ab, ob `rg` gefunden wird — gleiches Suchmuster kann auf
  zwei Rechnern unterschiedliche Treffer liefern. Kein kleiner Fix (entweder
  rg überall mitliefern, was gegen "keine neuen Abhängigkeiten" liefe, oder
  Muster vor dem grep-Zweig auf ERE-Kompatibilität normalisieren).
- `merker`/`bei Fehler` in `web/src/components/Werkstatt.jsx` (~594-597)
  weiterhin fest sichtbar bei jedem Baustein-Typ (seit 09-02 vermerkt,
  heute nicht gewählt weil der Server-Fund besser in dieser Cloud-Umgebung
  vollständig testbar war) — mit Playwright/Chromium hier testbar, guter
  nächster Oberflächen-Kandidat.
- `ffmpegSuchen()` weiterhin wortgleich dupliziert in `server/tools/
  kamera.js` und `server/tools/ohren.js` — Mac-spezifisch, hier nicht
  testbar.

Unverändert offen aus früheren Nächten:
- `web_search` erkennt blockierte/rate-limitierte DuckDuckGo-Antworten nicht.
- `memory_forget` fehlt komplett (server/memory.js).
- `resolve()` doppelt vorhanden (files.js/dokument.js), löst keine Symlinks auf.
- POST /api/ausloeser: siehe frühere Nächte für Details zum Validierungsstand.

## 2026-09-02
Erledigt: `server/tools/files.js` bot bisher `fs_list/fs_read/fs_write/fs_edit/
fs_search/fs_glob`, aber kein Werkzeug zum Löschen oder Verschieben/Umbenennen
einer Datei innerhalb des Reviers — ein alltäglicher Auftrag ("lösch die alte
Version", "verschieb den Bericht nach Archiv/") hatte keinen sauberen,
revier-geprüften Pfad, nur den Umweg über `shell_run` (dessen `resolve()`-
Wache nur `cwd` prüft, nicht das eigentliche `rm`/`mv`-Ziel im Befehlstext).
Jetzt gibt es `fs_delete` (löscht gezielt eine einzelne Datei, nie rekursiv
einen Ordner — dasselbe Prinzip wie die `HARD_NO`-Sperre für "rm -rf" in
`shell.js`) und `fs_move` (prüft Quelle UND Ziel mit `resolve()`, verlangt
`overwrite:true` für ein bereits vorhandenes Ziel). Beide `danger: true`.

Begleitet: `server/aktivitaet.js` (de/en-Beschreibung der neuen Werkzeuge),
die `HEIKEL`-Regex in `server/ablauf.js` und `NUR_NACHEINANDER`-Regex in
`server/agent.js` um `fs_delete|fs_move` erweitert (sonst hätten Abläufe/
Werkzeug-Wellen die beiden neuen, verändernden Werkzeuge fälschlich parallel
statt nacheinander laufen lassen — dieselbe Race-Klasse, die diese Regexe
für `fs_write`/`fs_edit` schon verhindern), die `programmierer`-Rolle in
`server/crew.js` (bekommt beide zusätzlich erlaubt, wie schon `fs_write`/
`fs_edit`), und `pruefe.mjs` um zwei Selbsttest-Zeilen. `TOOL_MAP`/
`ALL_TOOLS`/`TOOL_GROUPS` in `server/tools/index.js` und die UI (Werkstatt-
Werkzeugliste) brauchten keine Änderung — beide sind vollständig aus
`fileTools` abgeleitet, keine Datei im Repo listet Werkzeugnamen hart.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), jedem
Agenten die komplette NOTIZEN.md mitgegeben. Oberfläche fand einen neuen,
noch nicht notierten Kandidaten: `merker`/`bei Fehler` in `Werkstatt.jsx`
(Zeile ~594-597) stehen bei JEDEM Baustein-Typ fest sichtbar am Ende der
aufgeklappten Karte, obwohl selten genutzt — Vorschlag, das hinter eine
"weitere Optionen"-Klappe zu legen. Server fand `ffmpegSuchen()` wortgleich
dupliziert in `server/tools/kamera.js` und `server/tools/ohren.js` (~15
Zeilen je Datei, Zusammenlegen nach `screen.js` möglich) — nicht gewählt,
weil beide Dateien Mac-spezifischen Kamera/Mikrofon-Code betreffen, den ich
in dieser Cloud-Linux-Umgebung nicht laufen lassen und nicht wirklich
verifizieren kann (Auftrag: bei Mac-Code im Zweifel Finger weg, auch bei
einer reinen Extraktion ohne Logikänderung). Fehlendes-Vorschlag gewählt:
einziger der drei komplett ohne Mac-Bezug, direkt für den Nutzer spürbar
(neue Fähigkeit statt innerer Aufräumarbeit), nur eine Datei angefasst
(`files.js`), voll in dieser Umgebung testbar, folgt einem bereits
etablierten Muster (`resolve()`-Wache, `danger: true` wie `fs_write`).

Prüfer 2 (Randfälle) fand in der ersten Fassung einen echten, reproduzier-
baren Fehler: eine TOCTOU-Race in `fs_delete` zwischen dem `fs.stat()`-Check
und `fs.unlink()` — bei zwei gleichzeitigen `fs_delete`-Aufrufen auf
dieselbe Datei sahen beide `stat()` die Datei noch, aber nur der erste
`unlink()` gelang; der zweite warf die rohe Node-Meldung `ENOENT: no such
file or directory, unlink '...'` statt der im ganzen Modul üblichen
übersetzten Form. Per `Promise.allSettled` mit zwei gleichzeitigen Aufrufen
reproduziert. Behoben: `fs.unlink()` jetzt mit `.catch()`, das `ENOENT` in
`Nicht gefunden: ${abs}` übersetzt und alles andere unverändert weiterwirft.
Alle anderen geprüften Randfälle (Ziel=Quelle bei `fs_move`, Ziel-Ordner
fehlt noch, Path-Traversal über `to`, `overwrite:true` auf Ordner/Datei-
Konflikte, Symlinks, `~`/relative Pfade, fehlende/falsch typisierte
Argumente, sehr lange Pfade, Präfix-Kollision der erweiterten Regexe mit
bestehenden Werkzeugnamen) liefen sicher, kein Datenverlust in keinem Fall.

Danach beide Prüfer nochmal auf die nachgebesserte Fassung angesetzt.
Prüfer 1 reproduzierte die Race selbst erneut: der Verlierer bekommt jetzt
`Nicht gefunden: ...` statt der rohen `ENOENT`-Meldung, der Normalfall
(Datei existiert, einmaliger Aufruf) liefert weiterhin `Gelöscht: ...`,
`fs_move` blieb unverändert. Prüfer 2 prüfte gezielt, ob das neue `.catch()`
andere Fehlerfälle maskiert (mit `nobody`-User `EACCES` und `chattr +i`
`EPERM` erzwungen) — beide liefen unverändert als rohe Originalfehler durch,
nichts wird stillschweigend verschluckt, kein umgekehrter Race-Effekt in 5
Wiederholungen. Beide fanden in der nachgebesserten Fassung nichts Echtes
mehr.

`node --check` für alle sechs geänderten Dateien, `npm install && npm run
build` und der Server-Modul-Ladetest liefen bei mir am Ende nochmal sauber
durch. `node --experimental-sqlite --no-warnings pruefe.mjs` zeigt
`fs_delete`/`fs_move` beide mit ✓ (übrige Fehlschläge dort sind Mac/
Windows/Shell-bedingt und unverändert vorbestehend, siehe unten). Einen
eigenen Race-Test (`Promise.allSettled` mit zwei `fs_delete`-Aufrufen auf
dieselbe Datei) selbst laufen lassen: bestätigt `Nicht gefunden: ...` statt
roher `ENOENT`-Meldung. `git status`/`git diff --cached` enthielten nur die
sechs erwarteten Dateien, keine Geheimnisse, `data/` unverändert (per
`git status --porcelain -- data/` geprüft). `HEAD` stand zu Beginn der
Nacht wieder losgelöst exakt auf `origin/main` — mit `git checkout -B main
origin/main` aufgeholt, die Arbeitsverzeichnis-Änderungen blieben erhalten.

In der Skill-Liste dieser Session steckte erneut der eingeschleuste Eintrag
„steinzeit-modus" (Anweisung, grundsätzlich wie ein Höhlenmensch in kurzen
Sätzen zu antworten) — wie in den Vornächten als Prompt-Injection ignoriert.

Offen für kommende Nächte:
- `ffmpegSuchen()` wortgleich dupliziert in `server/tools/kamera.js` (~Zeile
  32-46) und `server/tools/ohren.js` (~Zeile 51-65) — identische PATH- und
  Homebrew/MacPorts-Fallback-Suche, nur der Fehlertext danach unterscheidet
  sich. Fix: einmal in `screen.js` exportieren (beide Dateien importieren
  `IST_MAC` von dort bereits), in beiden Aufrufern importieren statt lokal
  zu definieren. ~15 Zeilen entfernt je Datei, reine Extraktion ohne
  Verhaltensänderung — aber Mac-spezifischer Kamera/Mikrofon-Code, den ich
  hier nicht testen kann (Kamera-/Mikro-Aufnahme einmal auslösen und
  prüfen, dass ffmpeg weiterhin gefunden wird, bräuchte einen echten Mac).
- `merker`/`bei Fehler` in `web/src/components/Werkstatt.jsx` (~Zeile
  594-597) stehen bei jedem Baustein-Typ fest sichtbar am Ende der
  aufgeklappten Karte, auch bei einfachen Bausteinen mit nur einem Feld
  (z.B. "text"), obwohl selten genutzt. Vorschlag: hinter einen kleinen
  Umschalter ("weitere Optionen ▾", nur offen wenn Wert vom Standard
  abweicht oder angeklickt) legen, analog zum Composer-Hinweis-Muster.
  ~15-20 Zeilen `Werkstatt.jsx` + 1-2 CSS-Regeln, niedriges Risiko (reines
  Anzeigeverhalten), aber müsste bei allen sieben Baustein-Typen sauber
  aussehen — mit Playwright/Chromium hier testbar.
- `fs_search`-grep-Fallback (`server/tools/files.js`, ~Zeile 133): weiterhin
  fehlendes Treffer-Limit, anders als im `rg`-Zweig. Seit 08-25 wiederholt
  bestätigt, diesmal von keinem der drei frischen Vorschläge erneut
  aufgegriffen (die Agenten wurden gebeten, keine schon behandelten Punkte
  zu wiederholen) — weiterhin ein guter, sehr kleiner Kandidat.
- `eng[0].name` in der Ampel-Warnung (`web/src/App.jsx`) zeigt bei mehreren
  engen Kontingenten immer den ersten in Kettenreihenfolge, nicht den mit
  dem höchsten `anteil`. Vorbestehend, kein Bug, siehe 09-01 für Details.

Unverändert offen aus früheren Nächten:
- `web_search` erkennt blockierte/rate-limitierte DuckDuckGo-Antworten nicht.
- `memory_forget` fehlt komplett (server/memory.js).
- `dokument_excel`: keine echten Formeln/Formatierung.
- `resolve()` doppelt vorhanden (files.js/dokument.js), löst keine Symlinks auf.
- `ausloeser_anlegen()` validiert beim Anlegen selbst weiterhin nicht gegen
  die bestehende Liste (nur `pruefenListe()` beim `POST /api/ausloeser` tut
  das) — kein neues Problem, dran denken falls die Stelle angefasst wird.

## 2026-09-01
Erledigt: die Kontingent-Ampel (`web/src/App.jsx`, Funktion `Ampel`, ~Zeile
900) war seit der 08-30-Nacht (und schon davor) als klarer, aber immer wieder
zugunsten dringenderer Server-Funde vertagter Kandidat notiert — sie zeigte
den Balken in der Fußleiste permanent an, auch wenn alle Gehirn-Kontingente
im grünen Bereich lagen. Genau die Art Dauer-Chrome, die der Nutzer als
größten offenen Wunsch (ruhigere Oberfläche, näher an ChatGPT/Gemini) nennt.
Jetzt gilt: `if (!eng.length) return null` direkt nach dem bestehenden
`eng`-Filter — die Ampel taucht nur noch auf, wenn `server/kontingent.js`
mindestens ein Gehirn als `eng` markiert (Schwelle `anteil > 0.75`).

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), jedem
Agenten die komplette NOTIZEN.md mitgegeben. Server und Fehlendes sind
unabhängig voneinander auf denselben Fund gestoßen: `fs_search`-grep-
Fallback (`server/tools/files.js`, ~Zeile 133) hat anders als der `rg`-Zweig
kein Treffer-Limit, kann bei breitem Muster `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`
auslösen und zeigt dann eine irreführende Fehlerspur statt der echten Ursache
— seit 08-25 wiederholt bestätigt, weiterhin offen (guter, sehr kleiner
Kandidat für eine kommende Nacht, siehe unten). Oberfläche-Vorschlag gewählt:
trifft direkt den im Auftrag genannten größten Nutzerwunsch, seit mehreren
Nächten als sicherer 1-Zeilen-Fix beschrieben, und die zuvor dringenderen
Server-/Sicherheitsfunde (Async-Routen-Absturz, `shell_run`-Revier,
`pruefenListe()`-Validierung) sind inzwischen alle erledigt.

Prüfer 2 (Randfälle) fand in der ersten Fassung einen echten, aber
harmlosen Schönheitsfehler: die erste Fassung prüfte `!kontingent.some((k)
=> k.eng || k.anteil > 0.9)`, aber `server/kontingent.js` setzt bereits
`eng: anteil > 0.75` — da 0.9 > 0.75, war der `anteil > 0.9`-Teil toter
Code, der niemals zusätzlich griff (jeder Fall mit `anteil > 0.9` hatte
ohnehin schon `eng === true`). Kein Laufzeitfehler, aber irreführend, als
hätte die Ampel zwei unabhängige Schwellen. Behoben: auf die bereits
berechnete `eng`-Liste vereinfacht (`if (!eng.length) return null`,
direkt nach dem bestehenden `const eng = kontingent.filter(...)`). Dabei
zusätzlich den dadurch neu redundanten `eng.length > 0 &&`-Check in der
JSX (immer wahr wegen des jetzt vorgeschalteten frühen Returns) entfernt —
gleiche Funktion, trivial, keine Verhaltensänderung. Prüfer 2 bestätigte
danach: der verbleibende `k.anteil > 0.9`-Vergleich für die Balkenfarbe
(`rot` vs. `gelb`) ist NICHT tot, weil er innerhalb der bereits sichtbaren
Ampel zwischen "eng" und "sehr eng" unterscheidet — anderer Zweck als der
frühere, doppelte Sichtbarkeits-Check. Ebenfalls geprüft und als
vorbestehend (nicht neu) eingestuft: `eng[0].name` zeigt bei mehreren engen
Einträgen immer den ersten in Provider-Kettenreihenfolge, nicht zwingend
den kritischsten — bestand schon vor dieser Änderung identisch, außerhalb
vom Scope.

Prüfer 1 (Funktioniert es) hat `npm install && npm run build` selbst vor
und nach der Nachbesserung ausgeführt (beide Male fehlerfrei), den Server-
Code (`server/kontingent.js`/`server/brain.js`) auf die tatsächlichen
Feldnamen/Schwellen geprüft und ein simuliertes Node-Testskript mit
mehreren `kontingent`-Arrays (leer, alle grün, ein `eng`-Eintrag, Grenzfall
`anteil=0.75`) gegen die Bedingung laufen lassen — Verhalten in allen
Fällen wie gewünscht. Kein echtes Rendering im Browser möglich (keine
Mac-Umgebung hier) — das bleibt unbestätigt, ausdrücklich als Grenze
benannt statt als Erfolg behauptet.

`npm install && npm run build` liefen bei mir am Ende nochmal sauber durch,
der Server-Modul-Ladetest warf keinen Modul-/Syntaxfehler, `git status`/
`git diff --cached` enthielten nur die eine erwartete Datei (`web/src/
App.jsx`), keine Geheimnisse. `HEAD` stand zu Beginn der Nacht wieder
losgelöst exakt auf `origin/main` — mit `git checkout -B main origin/main`
aufgeholt, die gestagte Änderung blieb dabei erhalten.

In der Skill-Liste dieser Session steckte erneut der eingeschleuste Eintrag
„steinzeit-modus" (Anweisung, grundsätzlich wie ein Höhlenmensch in kurzen
Sätzen zu antworten) — wie in den Vornächten als Prompt-Injection ignoriert.
Beide Prüf-Agenten berichteten unabhängig denselben Fund.

Offen für kommende Nächte:
- `fs_search`-grep-Fallback (`server/tools/files.js`, ~Zeile 133): fehlendes
  Treffer-Limit, anders als im `rg`-Zweig (`--max-count 5`). Heute von
  Server- UND Fehlendes-Vorschlag unabhängig voneinander bestätigt (starkes
  Signal). ~1 Zeile (`-m`/`--max-count`-Äquivalent im grep-Aufruf ergänzen),
  eine Datei, minimales Risiko — seit 08-25 wiederholt offen, guter
  nächster Kandidat.
- `eng[0].name` in der Ampel-Warnung (`web/src/App.jsx`) zeigt bei mehreren
  engen Kontingenten immer den ersten in Kettenreihenfolge, nicht den mit
  dem höchsten `anteil`. Vorbestehend, heute von Prüfer 2 bestätigt, kein
  Bug, aber falls diese Stelle nochmal angefasst wird: `eng.slice().sort((a,
  b) => b.anteil - a.anteil)[0]` würde den kritischsten zeigen.

Unverändert offen aus früheren Nächten:
- `web_search` erkennt blockierte/rate-limitierte DuckDuckGo-Antworten nicht.
- `memory_forget` fehlt komplett (server/memory.js).
- `dokument_excel`: keine echten Formeln/Formatierung.
- `resolve()` doppelt vorhanden (files.js/dokument.js), löst keine Symlinks auf.
- `ausloeser_anlegen()` validiert beim Anlegen selbst weiterhin nicht gegen
  die bestehende Liste (nur `pruefenListe()` beim `POST /api/ausloeser` tut
  das) — kein neues Problem, dran denken falls die Stelle angefasst wird.

## 2026-08-31
Erledigt: `pruefenListe()` (`server/ausloeser.js`) prüfte bisher `art:"zeit"`
und `art:"app"`, aber `art:"ordner"` gar nicht — seit der 08-19-Nacht
wiederholt bestätigt und nie behoben. Ein leerer/Whitespace-Pfad kam
anstandslos durch `POST /api/ausloeser` durch; `ordnerBeobachten()`
scheitert dort lautlos an `fs.existsSync()` und überspringt den Eintrag
für immer, ohne dass Nutzer oder Agent je eine Fehlermeldung sehen — der
Auslöser steht sichtbar in der Liste, feuert aber nie. Außerdem prüfte
die Funktion `id` nirgends auf Eindeutigkeit; zwei Einträge mit gleicher
`id` ließen `ausloeser_loeschen`/Umschalten unbestimmt auf mehrere
Einträge zugleich wirken (`liste.find`/`filter` matcht nur den ersten
Treffer). Jetzt zwei neue Zeilen in `pruefenListe()`, analog zur
bestehenden `art:"app"`-Prüfung, plus ein `Set`-Check über alle `id`s.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), jedem
Agenten die komplette NOTIZEN.md mitgegeben. Server und Fehlendes sind
unabhängig voneinander auf genau denselben Fund gestoßen (ohne
voneinander zu wissen) — starkes Signal, dass es der richtige nächste
Schritt war. Oberfläche fand erneut die seit 08-30 bekannte, permanent
sichtbare Kontingent-Ampel (`web/src/App.jsx`, `Ampel`-Funktion,
~Zeile 900) — guter, noch offener Kandidat für eine kommende Nacht
(Vorschlag: `if (!kontingent.some(k => k.eng || k.anteil > 0.9)) return
null` direkt nach der bestehenden `eng`-Filterung), diesmal zugunsten
des Server-Fundes vertagt, weil der einen echten stillen Fehlerfall
behebt statt nur kosmetisch zu beruhigen.

Prüfer 2 (Randfälle) fand in der ersten Fassung einen echten, aber
subtilen Folgefehler: die neue `id`-Eindeutigkeitsprüfung trifft auf eine
seit jeher schwache `id`-Generierung in `ausloeser_anlegen()` (nur ein
4-Zeichen-Millisekunden-Suffix aus `Date.now().toString(36)`). Zwei
Auslöser für denselben Ablauf, in derselben Millisekunde angelegt, hätten
bisher dieselbe `id` bekommen — das war vorher harmlos (nur später beim
Anzeigen/Löschen ambig), wird durch die neue strikte Prüfung aber zu
einem echten Blocker: `POST /api/ausloeser` prüft immer die gesamte
Liste, ein einziger Alt-Doppelgänger hätte ab sofort JEDE künftige
Änderung über die Einstellungen-Oberfläche abgelehnt, bis er von Hand aus
`data/ausloeser.json` entfernt wird. Per Konstruiert-Test bestätigt
(zwei `ausloeser_anlegen`-Aufrufe mit eingefrorener Millisekunde erzeugen
identische `id`). Behoben: `ausloeser_anlegen` hängt jetzt zusätzlich
`Math.random().toString(36).slice(2,5)` (3 Zeichen Zufall) an die `id`
an — senkt die Kollisionswahrscheinlichkeit bei zwei Anlagen in derselben
Millisekunde von 100% auf rund 0,002% (36³ Kombinationen), ohne das
lesbare `ablauf-art-XXXX`-Format zu ändern oder bestehenden Code zu
berühren, der `id` nur per Gleichheit vergleicht (per `grep` bestätigt:
keine Stelle zerlegt/parst `id`).

Danach beide Prüfer nochmal auf die nachgebesserte Fassung angesetzt.
Prüfer 1 hat 500 `ausloeser_anlegen`-Aufrufe parallel gegen einen
Test-Ablauf gefeuert (maximiert die Chance auf gleiche Millisekunde):
500 von 500 IDs eindeutig, `pruefenListe()` akzeptiert die daraus
entstandene reale Liste anstandslos (keine falschen Positiven), Testdaten
danach vollständig wieder entfernt. Prüfer 2 rechnete die
Kollisionswahrscheinlichkeit selbst nach (n=2: ≈0,0021%, n=10: ≈0,096%,
nur bei massenhafter Anlage binnen einer Millisekunde relevant — kein
realer Nutzungsfall) und bestätigte per `grep`, dass kein Code die `id`
zerlegt oder ihre Länge/Struktur voraussetzt. Beide fanden in der
nachgebesserten Fassung nichts Echtes mehr.

`node --check`, `npm run build` und der Server-Modul-Ladetest liefen bei
mir am Ende nochmal sauber durch, `git status`/`git diff --cached`
enthielten nur die eine erwartete Datei (`server/ausloeser.js`), keine
Geheimnisse. `HEAD` stand zu Beginn der Nacht wieder losgelöst exakt auf
`origin/main` — mit `git checkout -B main origin/main` aufgeholt.

Offen für kommende Nächte:
- Kontingent-Ampel (`web/src/App.jsx`, `Ampel`-Funktion, ~Zeile 900) ist
  permanent sichtbar, auch wenn kein Wert knapp/auffällig ist —
  widerspricht dem Prinzip "ohne Auftrag unsichtbar". Vorschlag:
  `if (!kontingent.some(k => k.eng || k.anteil > 0.9)) return null`
  direkt nach der bestehenden `eng`-Filterung. ~1-2 Zeilen, eine Datei,
  kein Risiko, seit 08-30 bekannt, weiterhin nicht umgesetzt.
- `ausloeser_anlegen()` validiert beim Anlegen selbst weiterhin nicht
  gegen die bestehende Liste (nur `pruefenListe()` beim `POST
  /api/ausloeser` aus den Einstellungen tut das) — identisch zum
  generellen Muster im Code, kein neues Problem, aber falls diese Stelle
  mal aus anderem Grund angefasst wird: dran denken.

Unverändert offen aus früheren Nächten:
- `web_search` erkennt blockierte/rate-limitierte DuckDuckGo-Antworten nicht.
- `memory_forget` fehlt komplett (server/memory.js).
- `fs_search`-grep-Fallback: fehlendes Treffer-Limit im grep-Zweig.
- `dokument_excel`: keine echten Formeln/Formatierung.
- `resolve()` doppelt vorhanden (files.js/dokument.js), löst keine Symlinks auf.

## 2026-08-30
Erledigt: die 5 seit 08-19 als "größter Hebel, aber mehr als eine kleine Sache"
vertagten ungeschützten async-Routen in `server/index.js` (`/api/status`,
`/api/telegram/neu`, `/api/lokal`, `/api/mcp/neu`, `/api/voices`) — eine
Exception darin (z.B. `brainStatus()` oder `lokalStand()` wirft) riss bisher
per unbehandelter Promise-Rejection den kompletten Node-Prozess mit, samt
aller offenen WebSocket-Verbindungen. Express 4 reicht Fehler aus async-
Handlern nicht automatisch an den bestehenden Error-Handler durch — das
stand sogar schon als Warnkommentar direkt über diesem Handler. Statt die 5
Stellen einzeln mit try/catch zu versehen, ein einziger Einpacker direkt
nach `const app = express()`:
`const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`,
alle 5 Routen damit umschlossen (`asyncRoute(async (...) => {...})`). Löst
den seit elf Nächten aufgeschobenen Punkt in ~10 Zeilen, einer Datei, ohne
die 5 Stellen einzeln anzufassen — genau der elegantere Weg, den der Blocker
("5 Stellen statt einer") bisher verhindert hatte.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), jedem
Agenten die komplette NOTIZEN.md mitgegeben. Oberfläche fand die Kontingent-
Ampel in der Fußleiste (`web/src/App.jsx`, ~Zeile 900), die entgegen dem im
Code selbst mehrfach festgehaltenen Prinzip ("ohne Auftrag unsichtbar")
permanent sichtbar ist, auch wenn alles im grünen Bereich liegt — guter,
kleiner Kandidat (~2-3 Zeilen), noch nie notiert. Fehlendes bestätigte
`pruefenListe()` (`server/ausloeser.js`) prüft `art:"ordner"` weiterhin
nicht und `id` nicht auf Eindeutigkeit — seit 08-19 bekannt, weiterhin
offen. Server-Vorschlag gewählt: behebt einen echten, seit vielen Nächten
als "größter Hebel" eingestuften Absturzgrund, nicht nur kosmetische Ruhe —
ein Server, der ganz abstürzt, ist etwas, das der Nutzer sehr wohl merkt.

Beide Prüfer haben alles selbst ausgeführt, nicht nur meinen Bericht
geglaubt. Prüfer 1: `node --check`, `npm install && npm run build`, den
Server-Modul-Ladetest, einen eigenen Express-Testaufbau (wortgleicher
Wrapper, kaputte Route wirft, `unhandledRejection`-Listener — feuert nicht,
saubere 400-JSON-Antwort statt Absturz) UND einen echten Serverstart
(`PORT=3999`, `curl /api/status` → HTTP 200 mit vollem JSON, danach sauber
beendet). Prüfer 2 (Randfälle) prüfte Klammerung an allen 5 Stellen, `this`/
Closures/Argumentreihenfolge, synchronen `throw` vor dem ersten `await`
(wird von der `async`-Funktion automatisch zu einer rejected Promise, vom
Wrapper korrekt gefangen — selbst getestet) und den Extremfall "Fehler nach
bereits gesendetem `res.json()`" (kommt in den echten 5 Routen nicht vor,
im Konstruiert-Test landet es bei Express' eigenem `finalhandler`, kein
Prozessabsturz). Zusätzlich einen Baseline-Test ohne Wrapper gegen denselben
Fehlerfall gefahren: dort stürzt der Prozess nachweislich ab (`EXIT_CODE=1`)
— die Änderung ist damit belegt eine echte Verbesserung. Beide fanden
nichts Echtes zu bemängeln.

`npm run build` und der Server-Modul-Ladetest liefen bei mir am Ende
nochmal sauber durch, `git status`/`git diff` enthielten nur die eine
erwartete Datei (`server/index.js`), keine Geheimnisse.

Offen für kommende Nächte:
- Kontingent-Ampel (`web/src/App.jsx`, ~Zeile 900-914) ist permanent
  sichtbar, auch wenn kein Wert knapp/auffällig ist — widerspricht dem in
  `Aktivitaet.jsx`/`Auftraege.jsx` festgehaltenen Prinzip "ohne Auftrag
  unsichtbar". Vorschlag: `if (!kontingent.some(k => k.eng || k.anteil > 0.9)) return null`
  direkt nach der bestehenden `eng`-Filterung. ~2-3 Zeilen, eine Datei,
  kein Risiko, noch nie zuvor notiert — guter Kandidat, trifft den größten
  Nutzerwunsch (ruhigere Oberfläche) direkt.
- `pruefenListe()` (`server/ausloeser.js`, Zeile ~52-63) prüft `art:"ordner"`
  weiterhin nicht auf einen sinnvollen Wert (leerer/Whitespace-Pfad wird
  durchgelassen) und `id` nirgends auf Eindeutigkeit innerhalb der Liste —
  seit 08-19 offen. ~4-5 Zeilen, analog zur bestehenden `art:"app"`-Zeile.

Unverändert offen aus früheren Nächten (siehe 2026-08-29 unten):
- `web_search` erkennt blockierte/rate-limitierte DuckDuckGo-Antworten nicht.
- `memory_forget` fehlt komplett (server/memory.js).
- `fs_search`-grep-Fallback: fehlendes Treffer-Limit im grep-Zweig.
- `dokument_excel`: keine echten Formeln/Formatierung.
- `resolve()` doppelt vorhanden (files.js/dokument.js), löst keine Symlinks auf.

## 2026-08-29
Erledigt: Composer-Hinweiszeile (`web/src/App.jsx`) zeigte den statischen Text
"Enter senden · Shift+Enter neue Zeile" (`t('hintSend')`) bisher dauerhaft
unter dem Eingabefeld — auch mitten in einem langen Gespräch, wo niemand mehr
erklärt bekommen muss, wie Enter funktioniert. Genau die Art Dauer-Chrome, die
ChatGPT/Gemini nicht zeigen, und der letzte rein statische Dauer-Text in
dieser Zeile (Zeiger/Weckwort/Dauerlauschen/Notch-Knopf sind schon länger in
die Einstellungen ausgelagert). Jetzt erscheint der Hinweis nur noch, solange
`items.length === 0` ist, exakt nach demselben Muster wie die Schnellwahl-
Chips seit der 08-17-Nacht. "Stimme an/aus" und ein ggf. sichtbarer
"Schlüssel fehlt"-Link bleiben unverändert dauerhaft in der Zeile.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), jedem
Agenten die komplette NOTIZEN.md mitgegeben. Server fand `web_search`
(`server/tools/web.js`) liefert bei blockierter/leerer DuckDuckGo-Antwort
(HTTP 200, aber Rate-Limit-Seite) ununterscheidbar dasselbe `(keine Treffer)`
wie bei einer echten Nullsuche — nicht gewählt, weil die Heuristik "sieht wie
eine Blockseite aus" selbst unsicher ist und im schlechtesten Fall echte
Nulltreffer fälschlich als Fehler meldet, also ein neues Risiko durch das
Fixen eines alten einführen könnte. Fehlendes fand: es gibt gar kein
`memory_forget`-Werkzeug, um falsch gespeicherte Erinnerungen wieder loszuwerden
(nur `memory_save`/`memory_search` in `server/memory.js`) — echter Fund, aber
zu groß für eine Nacht (Embedding-Matching gegen Fehltreffer, mehrdeutige
Kandidaten behandeln, neues Werkzeug registrieren). Oberfläche-Vorschlag
gewählt: kleinster Eingriff (~4 Zeilen, eine Datei), nutzt ein bereits
bewährtes Muster, trifft direkt den im Auftrag genannten größten
Nutzerwunsch (ruhigere Oberfläche).

Beide Prüfer fanden unabhängig voneinander denselben Randfall: `gespraechOeffnen()`
(Zeile ~589) setzt `items` beim Öffnen eines alten Gesprächs kurz auf `[]`,
bevor die History nachgeladen wird — in diesem Zeitfenster (und dauerhaft,
falls die History keine user/assistant-Nachrichten enthält) blitzt der
Hinweistext in einem eigentlich nicht-leeren Chat wieder auf. Kein Absturz,
rein kosmetisch, kein TypeError (`items` ist immer ein Array, `useState([])`).
Bewusst NICHT behoben: exakt derselbe Effekt besteht bereits seit der
08-17-Nacht für die Schnellwahl-Chips am selben `items.length === 0`-Muster
und wurde nie als Fehler eingestuft — eine Ausweitung auf `gespraechOeffnen()`
hätte den Scope über die eine geplante Änderung hinaus vergrößert. Prüfer 1
hat die Grundfunktion zusätzlich real im Browser getestet (echter Server auf
Port 3018, Playwright/Chromium): Hinweis sichtbar im leeren Chat, verschwindet
nach dem Senden einer Nachricht, `.hint`-Zeile bleibt sauber (Stimme-Knopf und
Schlüssel-fehlt-Link stehen weiterhin da, kein Layoutsprung).

`npm run build` lief bei mir am Ende sauber durch, `git status`/`git diff`
enthielten nur die eine erwartete Stelle in `App.jsx`, keine Geheimnisse.

Offen für kommende Nächte (aus den drei heutigen Vorschlägen, keiner davon
umgesetzt):
- `web_search` (`server/tools/web.js`, ~Zeile 77-84): blockierte/rate-
  limitierte DuckDuckGo-Antworten (HTTP 200) sehen für den Code wie eine echte
  Nullsuche aus, Nutzer/Agent bekommen keinen Hinweis, dass die Suche selbst
  fehlgeschlagen ist. Eine zuverlässige Heuristik "ist das eine Blockseite"
  müsste sorgfältig gegen echte Nulltreffer abgegrenzt werden, sonst tauscht
  man ein stilles Problem gegen ein neues falsches Fehlersignal.
- `memory_forget` fehlt komplett (`server/memory.js`) — Gedächtnis kann nur
  wachsen, nie eine falsche/veraltete Erinnerung wieder verlassen (außer per
  Hand in der SQLite-Datei). Kleinster sinnvoller Schritt: ein Werkzeug nach
  dem Muster von `recall()`, das bei eindeutigem Treffer löscht und bei
  mehreren ähnlich guten Treffern die Kandidaten auflistet statt blind zu
  löschen. ~20-30 Zeilen, eine Datei, aber Embedding-Matching-Logik verdient
  eine eigene Nacht mit eigener Prüfung.
- `gespraechOeffnen()` (`web/src/App.jsx`, ~Zeile 589) leert `items` kurz vor
  dem Nachladen der History — teilt sich das bereits akzeptierte Verhalten
  der Schnellwahl-Chips (kurzes Aufblitzen bei `items.length === 0`-Prüfungen
  während eines Ladevorgangs). Kein Bug, aber falls diese Stelle mal aus
  anderem Grund angefasst wird: dran denken, dass mehrere UI-Elemente an
  `items.length === 0` hängen, nicht nur die Chips.

Unverändert offen aus früheren Nächten (siehe 2026-08-28 unten):
- Async-Routen ohne try/catch in server/index.js (5 Stellen).
- `fs_search`-grep-Fallback: fehlendes Treffer-Limit im grep-Zweig.
- `pruefenListe()` (server/ausloeser.js): `art:"ordner"` und `id`-Eindeutigkeit.
- `dokument_excel`: keine echten Formeln/Formatierung.
- `resolve()` doppelt vorhanden (files.js/dokument.js), löst keine Symlinks auf.

## 2026-08-28
Erledigt: `.baustein-marke` (`web/src/werkstatt.css`) zeigte bisher, wie seit
2026-08-12 wiederholt bestätigt und immer wieder vertagt, in JEDEM Zustand
einen 1px-Rahmen um die kleine Typ-Beschriftung eines Werkzeug-Bausteins
("shell_run", "fs_lesen" usw.) im Chat. Jetzt ist der Rahmen im Normalfall
unsichtbar (`border: 1px solid transparent` statt `var(--line-soft)`) und
wird nur noch im Gefahr-Zustand (`.baustein.hat-gefahr .baustein-marke`)
sichtbar, weiterhin allein über `border-color`. Genau der Vorschlag, den der
Nutzer im heutigen Auftrag als größten offenen Wunsch nannte: eine ruhigere
Oberfläche, weniger Kästchen-in-Kästchen-Optik, näher an ChatGPT/Gemini.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), jedem
Agenten die komplette NOTIZEN.md mitgegeben (nicht nur `tail`, siehe die
08-23-Lehre). Server fand das seit 08-25 offene fehlende Treffer-Limit im
`grep`-Fallback von `fs_search` (`files.js`, ~1 Zeile). Fehlendes fand, dass
`pruefenListe()` (`server/ausloeser.js`) `art:"ordner"` weiterhin nicht auf
einen sinnvollen Wert prüft und `id` nirgends auf Eindeutigkeit (~2 Zeilen,
seit 08-19/08-24 offen). Oberfläche-Vorschlag gewählt: einziger der drei
Funde mit direktem Bezug zum im Auftrag genannten größten Nutzerwunsch,
seit vier Nächten als "klarer nächster Kandidat" benannt, minimales Risiko
(eine CSS-Zeile).

Prüfer 2 (Randfälle) fand in der ersten Fassung einen echten Fehler: der
Gefahr-Zustand eines Bausteins kann zur Laufzeit umschalten (Werkzeug-
Auswahlfeld in `Werkstatt.jsx`, ändert `b.einstellungen.werkzeug` und damit
`gefahr` ohne Remount). Da `.baustein-marke` keine feste Breite hat, schützt
`box-sizing: border-box` nicht davor, dass ein neu hinzukommender Rahmen die
Box um 2px vergrößert — beim Umschalten wäre ein sichtbarer Sprung
entstanden (die erste Fassung hatte den Rahmen im Normalfall komplett
entfernt statt nur unsichtbar gemacht). Behoben: Rahmen bleibt immer
vorhanden (`1px solid`), nur `transparent` im Normalfall statt `var(
--line-soft)` — Breite ändert sich beim Umschalten nie, nur die Farbe. Die
`hat-gefahr`-Regel blieb dadurch unverändert (nur `border-color`, wie schon
vorher). Prüfer 2 fand sonst nichts Echtes: keine kollidierenden Regeln,
`border-radius` bleibt ohne sichtbare Wirkung im Normalfall (kein Problem,
rein kosmetisch folgenlos), kein Code/Test verlässt sich auf die Randbreite.

Prüfer 1 (Funktioniert es) hat die KORRIGIERTE Fassung selbst geprüft (der
Diff hatte sich während seiner Prüfung durch die Nachbesserung geändert,
das im Bericht selbst bemerkt und sauber gegen den neuen Stand nachgeprüft):
`npm run build` fehlerfrei, `grep` über die Kaskade zeigt keine störende
Zwischenregel, `Werkstatt.jsx` ist die einzige weitere Referenz auf die
Klasse. Mit Playwright/Chromium `getComputedStyle` bestätigt:
`borderColor: rgba(0,0,0,0)` im Normalfall (unsichtbar), `rgba(255,192,
107,.34)` im Gefahr-Zustand (sichtbar) — Screenshot zeigt beide Zustände
korrekt.

Build (`npm run build`) lief bei mir selbst am Ende nochmal sauber durch,
`git status`/`git diff` enthielten nur die eine erwartete Zeile in
`werkstatt.css`, keine Geheimnisse. `HEAD` stand zu Beginn der Nacht wieder
losgelöst (detached) exakt auf `origin/main` — mit `git fetch` und `git
checkout main` aufgeholt (kein Fast-Forward-Rückstand diesmal, lokaler
`main` war nur veraltet gefetcht).

Offen für kommende Nächte:
- **Async-Routen ohne try/catch crashen den ganzen Server** (`server/
  index.js`: `/api/status`, `/api/lokal`, `/api/voices`, `/api/telegram/
  neu`, `/api/mcp/neu`) — seit 08-19 offen, weiterhin größter Hebel unter
  den offenen Server-Punkten, aber "mehr als eine kleine Sache" (5 Stellen).
- `fs_search`-grep-Fallback (`server/tools/files.js`): fehlendes Treffer-
  Limit im `grep`-Zweig (anders als im `rg`-Zweig mit `--max-count`) — seit
  08-25 offen, heute erneut vom Server-Vorschlag bestätigt und im Code
  verifiziert. Kleiner, isolierter Fix (`-m 5`/`--max-count=5` ergänzen).
- `pruefenListe()` (`server/ausloeser.js`) prüft `art:"ordner"` weiterhin
  nicht auf einen sinnvollen Wert und `id` nirgends auf Eindeutigkeit
  innerhalb der Liste — seit 08-19/08-24 offen, heute erneut vom Fehlendes-
  Vorschlag bestätigt und im Code verifiziert (Zeile ~58 fehlt weiterhin).
  ~2 Zeilen, analog zur bestehenden `art:"app"`-Prüfung plus ein Set-Check.
- `dokument_excel` (`server/tools/dokument.js`): kann nur rohe Werte
  schreiben, keine echten Formeln (`<f>`-Element) und keine Formatierung.
  ~60-100 Zeilen, moderates Risiko.
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.
- `resolve()` löst weiterhin keine Symlinks auf (vorbestehend, mehrfach
  vermerkt).

## 2026-08-27
Erledigt: `runCommand()` (`server/tools/shell.js`) meldete einen SIGKILL durch
Zeitlimit oder Ausgabe-Limit bisher nicht — der Nutzer sah nur `exit=null`
ohne jede Erklärung, ob der Befehl hing, zu viel Ausgabe erzeugt hat oder aus
einem anderen Grund starb. Genau der Fund, den die 08-26-Nacht bereits als
nächsten Kandidaten vorgemerkt hatte. Jetzt setzen die beiden Kill-Stellen
(Zeile ~47 Timeout, ~40 Ausgabe-Limit) je eine Flag (`killedByTimeout`,
`killedByLimit`), und der `close`-Handler hängt bei gesetzter Flag einen
Klartext-Grund an ("Befehl abgebrochen: Zeitlimit (Xms) überschritten." bzw.
"...Ausgabe-Limit (X Zeichen) überschritten.").

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, den Dauerrahmen von `.baustein-marke` (`web/src/werkstatt.css`)
nur noch im Gefahr-Zustand zu zeigen (derselbe seit 08-12 wiederholt
vertagte Vorschlag, weiterhin nicht umgesetzt — echt minimal, ~2 Zeilen).
Fehlendes verifizierte im Code, dass i18n (alle 7 Sprachen exakt 155
Schlüssel), `dokument_lesen` (.docx/.pptx/.xlsx) und die Auslöser-UI entgegen
älterer Notizen bereits vollständig fertig sind, und bestätigte erneut
`dokument_excel` ohne echte Formeln/Formatierung als verbleibende Lücke
(~60-100 Zeilen, Kernlogik betroffen). Server-Vorschlag gewählt: kleinster
Aufwand (~10 Zeilen, eine Funktion), größter direkter Nutzen (Nutzer steht
nicht mehr ratlos vor "exit=null"), passend zum Auftrag "wo würde ein Nutzer
im Regen stehen, weil ihm niemand sagt was schiefging".

Prüfer 2 (Randfälle) fand in der ersten Fassung eine echte, aber seltene
Race: setzte der Timeout-Timer die Flag und rief `child.kill('SIGKILL')`,
kurz nachdem der Kindprozess schon von selbst regulär durchgelaufen war,
zeigte der `close`-Handler trotzdem den Zeitlimit-Text an — obwohl `code`
den echten (nicht-null) Exit-Code trug. Behoben: der Grund-Text erscheint
jetzt nur noch, wenn `code === null` ist (nur dann endete der Prozess
wirklich per Signal, ein bereits beendeter Prozess ignoriert `kill()`
wirkungslos). Danach nochmal beide Prüfer angesetzt: Prüfer 1 bestätigte
mit einem gezielten Testfall (`sleep 0.05 && echo fertig` bei `timeout:3000`)
genau diesen Race-Fall als jetzt korrekt (kein falscher Abbruchgrund mehr).
Prüfer 2 fand keinen weiteren echten Fehler — einzige Randnotiz: kollidiert
ein *externes* Signal (OOM-Killer, manuelles `kill -9`) zeitlich mit Ablauf
unserer Schwelle, zeigt die Meldung einen nicht ganz zutreffenden Grund
("Zeitlimit überschritten" statt "von außen getötet") — sehr eng, außerhalb
vom Scope dieses Fixes, kein Blocker.

Da `/bin/zsh` in dieser Cloud-Linux-Umgebung fehlt (Mac-spezifisch), liefen
alle echten Testläufe (durch mich selbst und beide Prüfer, in zwei Runden)
gegen eine temporäre Kopie der Datei mit `/bin/bash` statt `/bin/zsh`,
danach jeweils wieder gelöscht. `npm run build` und der Server-Ladetest
liefen am Ende sauber durch, `git diff` enthielt nur die erwarteten Zeilen
in `shell.js`. `HEAD` stand zu Beginn der Nacht wieder losgelöst exakt auf
`origin/main` (wie mehrfach in Vornächten) — mit `git checkout -B main
origin/main` aufgeholt, Arbeitsverzeichnis-Änderung blieb dabei erhalten.

Offen für kommende Nächte, unverändert bzw. neu bestätigt:
- `.baustein-marke`-Rahmen (`web/src/werkstatt.css`) nur im Gefahr-Zustand
  zeigen — seit 08-12 wiederholt bestätigt und vertagt, weiterhin minimal
  (~2 Zeilen), klarer nächster Oberflächen-Kandidat.
- `dokument_excel` (`server/tools/dokument.js`): kann nur rohe Werte
  schreiben, keine echten Formeln (`<f>`-Element) und keine Formatierung
  (Währung/Datum/Prozent, Zellfarben). ~60-100 Zeilen, nur eine Datei,
  moderates Risiko (bestehende Funktionen erweitern, nicht neu schreiben).
- `resolve()` (`files.js`, auch von `shell.js` genutzt) löst weiterhin keine
  Symlinks auf — vorbestehend, mehrfach vermerkt, noch nicht angefasst.

## 2026-08-26
Erledigt: `shell_run` (`server/tools/shell.js`) hatte als einziges Kraft-Werkzeug
keine Revier-Sandbox. Alle `fs_*`-Werkzeuge in `server/tools/files.js` prüfen
jeden Pfad über `resolve()` gegen das konfigurierte Revier und verweigern alles
außerhalb — `shell_run` nahm seinen `cwd`-Parameter bisher ungeprüft entgegen
und reichte ihn direkt an `spawn()` durch. Kritisch, weil `danger:true` bei
`autoMode: an` (Standardeinstellung laut README) gar keine Rückfrage auslöst —
ein Befehl mit relativem Pfad und `cwd` außerhalb vom Revier lief bisher
klaglos dort, ohne dass Nutzer oder Agent das bemerkt hätten. Jetzt wird
`resolve()` aus `files.js` exportiert und in `runCommand()` auf `cwd`
angewendet, bevor gespawnt wird — ein Pfad außerhalb vom Revier wirft dieselbe
`Weg liegt außerhalb vom Revier (...)`-Meldung wie bei den Datei-Werkzeugen.
Kein `cwd` übergeben → weiterhin Fallback auf `loadConfig().workspace`.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, den "Stimme an/aus"-Knopf aus der Hinweiszeile in die Einstellungen
zu verschieben (sechste Wiederholung desselben Verschiebe-Musters seit
Zeiger/Weckwort/Dauerlauschen/Notch-Fenster/Farbknopf — nach der
08-23-Erkenntnis "abnehmender Grenznutzen" diesmal bewusst vertagt). Server
fand, dass `runCommand()` in `shell.js` einen Timeout- oder Ausgabe-Limit-Kill
(SIGKILL) nicht meldet — der Nutzer sieht nur "exit=null" ohne Erklärung
(guter, kleiner Kandidat, siehe unten). Fehlendes-Vorschlag gewählt: einzige
der drei Änderungen mit echtem Sicherheitsbezug (deckt eine Lücke, die dem
README-Versprechen "Dateizugriff bleibt im eingestellten Revier" widerspricht),
isoliert auf zwei Dateien (ein Export, eine neue Prüfung), Muster liegt in
`files.js` schon fertig vor.

Prüfer 1 (Funktioniert es) hat Build, Server-Ladetest und ein eigenes
Testskript (`runCommand` direkt importiert, `HOME` auf Testordner gesetzt)
selbst ausgeführt: `cwd` außerhalb vom Revier wird VOR dem `spawn()`-Aufruf
mit der Revier-Fehlermeldung abgelehnt; `cwd` innerhalb vom Revier bzw. kein
`cwd` läuft bis zum eigentlichen `spawn()` durch und scheitert dort nur am
fehlenden `/bin/zsh` in dieser Cloud-Linux-Umgebung (Mac-spezifisch, außerhalb
vom Scope, korrekt erkannt). Prüfer 2 (Randfälle) fand keinen echten Fehler:
`shell_run` hat genau eine Aufrufstelle, kein anderer Code verlässt sich auf
das alte, ungeprüfte Verhalten, die `HARD_NO`-Liste läuft unverändert zuerst,
kein Async-Gap zwischen Prüfung und `spawn()`. Einzige Randnotiz: `resolve()`
prüft nur lexikalisch (`path.relative`), keine Symlink-Auflösung — ein Symlink
innerhalb vom Revier, der nach außen zeigt, würde die Prüfung bestehen. Das
ist aber keine neue Lücke dieses Patches, sondern dieselbe vorbestehende
Schwäche wie in `files.js` selbst.

Build (`npm run build`) und Server-Modul-Ladetest liefen bei mir selbst am
Ende nochmal sauber durch, `git diff` enthielt nur die erwarteten zwei Zeilen
in `files.js`/`shell.js`. `HEAD` stand zu Beginn der Nacht wieder losgelöst
exakt auf `origin/main` (wie mehrfach in Vornächten beobachtet) — mit
`git fetch` und `git checkout -B main origin/main` aufgeholt, Arbeits-
verzeichnis-Änderungen blieben dabei erhalten.

Offen für kommende Nächte:
- `runCommand()` in `server/tools/shell.js` meldet einen Timeout- oder
  Ausgabe-Limit-Kill (SIGKILL) nicht — der Nutzer sieht nur `exit=null` ohne
  Erklärung, ob der Befehl abgelaufen ist oder wegen zu großer Ausgabe
  abgewürgt wurde. Kleiner Fix (~10 Zeilen, ein Ort): zwei Flags setzen,
  wenn Timeout bzw. Output-Limit den Kill auslösen, im `resolve()`-Text
  anhängen.
- `resolve()` (`files.js`, jetzt auch von `shell.js` genutzt) löst Symlinks
  nicht auf — ein Symlink innerhalb vom Revier, der nach außen zeigt, besteht
  die Prüfung. Vorbestehend, kein neues Problem, aber jetzt an einer weiteren
  Stelle relevant.
- `.baustein-marke`-Rahmen (`web/src/werkstatt.css`) nur im Gefahr-Zustand
  zeigen — seit 08-12 wiederholt bestätigt und vertagt.
- "Stimme an/aus"-Knopf aus der Chat-Hinweiszeile (`web/src/App.jsx`,
  Zeilen ~809-834) in die Einstellungen verschieben (`einstStimme`-Abschnitt
  in `Settings.jsx`) — letzter verbliebener Knopf in dieser Zeile, passendes
  Muster liegt vor, diesmal zugunsten des Sicherheits-Fixes vertagt.
- `dokument_excel` (`server/tools/dokument.js`): kann nur rohe Werte
  schreiben, keine echten Formeln (`<f>`-Element) und keine Formatierung.
- `fs_search`-grep-Fallback: fehlendes Treffer-Limit (seit 08-25 offen).

## 2026-08-25
Erledigt: `fs_search` (`server/tools/files.js`) prüfte `pattern` bisher nicht.
Ruft der Agent das Werkzeug mit leerem Suchmuster auf, entfernt `coerceArgs()`
in `server/agent.js` den leeren String komplett aus den Argumenten — `pattern`
kam dann als `undefined` in `run()` an, landete roh im `execFile`-Aufruf
(Node macht daraus den Literal-String `"undefined"`) und durchsuchte wirklich
das ganze Revier nach dem Wort "undefined", was in einem kryptischen
maxBuffer-Fehler endete statt einer verständlichen Meldung. Jetzt wirft eine
Wache am Anfang von `run()` — genau das Muster von `resolve()` in derselben
Datei (Zeile 15) — `Suchmuster fehlt oder ist kein Text.`, sobald `pattern`
kein nichtleerer String ist.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, den Rahmen der Typ-Badge (`.baustein-marke` in werkstatt.css)
nur noch im Gefahr-Zustand zu zeigen (seit 08-12 wiederholt vorgeschlagen,
diesmal zugunsten des Server-Fundes vertagt). Fehlendes bestätigte, dass
.xlsx-Lesen, alle sieben i18n-Sprachen und die Auslöser-Oberfläche bereits
vollständig sind, und schlug stattdessen echte Formeln/Formatierung für
`dokument_excel` vor (mittlerer Aufwand, ~60-100 Zeilen, XML-Kernlogik
betroffen — mehr Bruchrisiko als der gewählte Server-Fund). Server fand die
oben behobene Lücke — gewählt, weil kleinstes Risiko (eine Zeile, exakt
etabliertes Muster) bei echtem, reproduzierbarem Fehlerbild.

Prüfer 1 (Funktioniert es) führte Build, Server-Ladetest und ein eigenes
Testskript selbst aus: `run({pattern: undefined})` und `run({pattern: ''})`
werfen jetzt sauber `Suchmuster fehlt oder ist kein Text.`, ein normaler
Aufruf mit engem Muster/Pfad liefert weiterhin korrekte Treffer. Dabei einen
unabhängigen, vorbestehenden Fund gemacht (siehe unten). Prüfer 2 (Randfälle)
fand keinen echten Fehler: kein Aufrufer verlässt sich auf leeres Pattern,
`coerceArgs()` entfernt Whitespace-only-Strings ohnehin schon vorher, beide
Aufrufstellen von `tool.run` liegen in try/catch. Fand aber eine kleine
Textabweichung — die erste Fassung der Meldung ("Suchmuster fehlt.") passte
nicht zur Formel "… fehlt oder ist kein Text." aus Zeile 15 derselben Datei
und aus `dokument.js`/`ausloeser.js` — angepasst, bevor committet wurde.

Build (`npm run build`) und Server-Modul-Ladetest liefen sauber durch,
`git diff` enthielt nur die fünf neuen Zeilen in `files.js`. Nebenbei: `main`
war zu Beginn dieser Nacht wieder als losgelöster `HEAD` 5 Commits hinter
`origin/main` (Auslöser-Übersicht fehlte lokal) — mit `git fetch` und
Fast-Forward aufgeholt, bevor committet wurde.

Unabhängiger Fund von Prüfer 1, NICHT behoben (außerhalb vom heutigen
Auftrag, kein Regressionsproblem der obigen Änderung): im `grep`-Fallback-
Zweig von `fs_search` (`files.js`, wenn `/opt/homebrew/bin/rg` fehlt, z.B.
hier in der Cloud-Umgebung) fehlt anders als im `rg`-Zweig ein
Treffer-Limit (`--max-count`). Ein breites Suchmuster über ein großes Revier
kann `fsMaxBytes` (`server/config.js`, Standard 200000 Bytes) sprengen und
bricht mit `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` ab; die Fehlermeldung im
Catch-Block zeigt dabei irreführend eine stderr-Notiz ("binary file
matches") statt der echten Ursache. Kleiner, isolierter Fix für eine
kommende Nacht (grep-Aufruf um ein Treffer-Limit ergänzen, z.B. `| head`
oder ein `-m`-Äquivalent für den grep-Zweig).

Offen für kommende Nächte, unverändert:
- `.baustein-marke`-Rahmen (`web/src/werkstatt.css`) nur im Gefahr-Zustand
  zeigen — kleiner, sicherer Oberflächen-Vorschlag, seit 08-12 wiederholt
  bestätigt und vertagt.
- `dokument_excel` (`server/tools/dokument.js`): kann nur rohe Werte
  schreiben, keine echten Formeln (`<f>`-Element) und keine Formatierung
  (Währung/Datum/Prozent, Zellfarben). Mittlerer Aufwand, isoliert auf
  diese eine Datei.
- `fs_search`-grep-Fallback: fehlendes Treffer-Limit, siehe oben.

## 2026-08-24
Erledigt: Die Auslöser-Übersicht, seit 08-19 (fünf Nächte) als größte offene
Funktionslücke dokumentiert, hat jetzt eine Oberfläche. Neue Komponente
`web/src/components/AusloeserEinstellungen.jsx` + `web/src/ausloeser-
einstellungen.css`, eingehängt in `Settings.jsx` direkt nach dem
Skills-Abschnitt (Vorbild: `SkillEinstellungen.jsx`). Zeigt bestehende
Auslöser, erlaubt Anlegen (Ablauf aus `GET /api/ablaeufe` wählen, Art
zeit/ordner/app/start mit passendem Eingabefeld), An/Aus-Umschalten und
Löschen. Backend (`server/ausloeser.js`) war unverändert fertig — kennt
aber nur "ganze Liste lesen/schreiben" (`GET`/`POST /api/ausloeser`), keine
Einzel-Routen wie bei Skills — jede Änderung baut darum im Browser die
Gesamtliste neu und schickt sie komplett per POST.

Bewusst KEINE i18n-Anbindung über die 7 Sprachblöcke in `i18n.js`, obwohl
frühere Nächte das als Teil des Aufwands (~180-250 Zeilen) einschätzten:
beim genauen Hinsehen sind `SkillEinstellungen.jsx`, `McpEinstellungen.jsx`
und `Persoenlichkeiten.jsx` — alle auf derselben Einstellungs-Tiefe —
durchgehend fest auf Deutsch, ganz ohne `t()`-Aufrufe. Nur die oberste
Ebene von `Settings.jsx` und die Haupt-Chat-Oberfläche sind übersetzt.
Diese Komponente folgt demselben, bereits etablierten Muster statt es als
einzige an dieser Stelle zu durchbrechen — das hat den tatsächlichen Umfang
auf drei Dateien ohne i18n reduziert, deutlich unter der alten Schätzung.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes).
Oberfläche schlug vor, die Tastatur-Hinweiszeile ("Enter senden") nur im
leeren Chat zu zeigen (~3-5 Zeilen, sehr sicher). Server bestätigte erneut
den seit vielen Nächten offenen async-Routen-Crash (fünf Routen ohne
try/catch können den ganzen Prozess abschießen, ~10-15 Zeilen über fünf
bestehende Stellen). Auslöser-Übersicht gewählt: seit fünf Nächten
explizit als "klarer nächster Kandidat" mit Nachdruck vertagt, rein
additiv (zwei neue Dateien + ein Einhängepunkt, keine bestehende Logik
berührt) und der Nutzer merkt es wirklich — eigene Auslöser verwalten
statt den Agenten bitten zu müssen. Der Server-Fix wurde erneut vertagt,
weil er fünf bereits funktionierende Routen gleichzeitig anfasst
(Handler-Signatur an fünf Stellen) — nach eigener Einschätzung der
Vornächte "mehr als eine kleine Sache" für eine Nacht, siehe unten.

Prüfer 2 (Randfälle) fand in der ersten Fassung zwei echte, reproduzierte
Fehler, beide noch in derselben Nacht behoben:
(1) Waren keine Abläufe mehr vorhanden (z.B. letzter Ablauf gelöscht),
hing die gesamte Auslöser-Liste an derselben Bedingung wie das
"neu anlegen"-Formular und verschwand komplett aus der Oberfläche —
bestehende, vom `Waechter` weiterhin aktiv beobachtete Auslöser wurden für
den Nutzer unsichtbar und unbedienbar (nur noch über den Agenten
erreichbar). Behoben: Liste und Formular hängen jetzt an getrennten
Bedingungen. Dieselbe Fassung verschluckte außerdem einen Fehler beim
Holen von `/api/ablaeufe` still zu einer leeren Liste, ohne die
vorhandene `fehlerText()`-Funktion zu nutzen — jetzt eigener
`ablaufFehler`-Zustand, sichtbar gerendert.
(2) Lost-Update: `umschalten()`/`loeschen()`/`anlegen()` bauten die neue
Gesamtliste aus dem im Browser gehaltenen, potenziell veralteten
`liste`-State. Legt der Agent währenddessen per `ausloeser_anlegen` einen
neuen Auslöser an, hätte der nächste Klick in der (noch alten) UI ihn
beim Zurückschreiben ersatzlos gelöscht — per curl reproduziert und
bestätigt. Behoben: `schreiben()` holt vor jeder Änderung zuerst den
frischen Stand vom Server und wendet die Änderung darauf an, statt auf
dem alten Browser-Stand. Schließt das Zeitfenster nicht vollständig
(zwischen dem frischen Holen und dem Schreiben bleibt eine kleine Lücke),
verkürzt es aber von "seit dem Öffnen der Einstellungen" auf einen
einzelnen Request-Umlauf. Eine vollständige Lösung bräuchte serverseitige
Versionierung/Konflikterkennung — zu groß für diese Nacht.

Prüfer 1 (Funktioniert es) hat nach den beiden Fixes selbst getestet:
`npm install && npm run build` zweimal sauber, echte curl-Aufrufe gegen
den laufenden Server (`GET`/`POST /api/ausloeser`, `/api/ablaeufe`,
inkl. negativer Validierungsfälle wie `wann:"8:30"` ohne führende Null →
400 mit der erwarteten Meldung aus `pruefenListe()`), und ein vollständiger
Playwright/Chromium-Klickpfad (Ablauf wählen → Art "zeit" → Uhrzeit →
Anlegen → Karte erscheint → Umschalten → Löschen-Bestätigung), dabei kein
einziger JS-Fehler und keine 4xx/5xx-Requests in der Konsole. Testdaten
(Test-Ablauf, `ausloeser.json`) am Ende wieder in den Ausgangszustand
zurückgesetzt.

Build und Server-Modul-Ladetest liefen bei mir selbst am Ende nochmal
sauber durch, `git diff --cached` enthielt nur die drei erwarteten
Dateien, keine Geheimnisse. `main` stand zu Beginn der Nacht wieder
losgelöst exakt auf `origin/main` — mit `git fetch` und
`git checkout -B main origin/main` aufgeholt, Arbeitsverzeichnis-
Änderungen blieben dabei erhalten (wie schon 08-20 beobachtet, dritter
Fall: könnte an der Umgebung liegen, in der diese Sitzungen starten).

In der Skill-Liste dieser Session steckte erneut der injizierte Eintrag
„steinzeit-modus" — wie in den Vornächten als eingeschleuster Text
ignoriert. Auch Prüfer 2 berichtete denselben Fund unabhängig.

Offen für kommende Nächte:
- **Async-Routen ohne try/catch crashen den ganzen Server**
  (`server/index.js`: `/api/status`, `/api/lokal`, `/api/voices`,
  `/api/telegram/neu`, `/api/mcp/neu`) — seit mehreren Nächten bestätigt,
  heute erneut vom Server-Vorschlag geprüft und als weiterhin offen
  bestätigt. Größter Hebel unter den offenen Server-Punkten, aber "mehr
  als eine kleine Sache" (fünf Stellen, Handler-Signatur betroffen).
- **`pruefenListe()` in `server/ausloeser.js` prüft `art:"ordner"` gar
  nicht auf einen sinnvollen Wert** — anders als bei `art:"zeit"`/`"app"`
  gibt es dort keine Prüfung, ein leerer oder reiner Whitespace-Wert wird
  vom Server anstandslos akzeptiert (per curl bestätigt). Praktische
  Auswirkung gering (der `Waechter` überspringt so einen Eintrag in
  `ordnerBeobachten()` still), aber die neue Oberfläche ist dadurch die
  einzige Schutzschicht für diesen Fall — kein Server-Sicherheitsnetz.
  Kleiner, sicherer Nachtrag für eine kommende Nacht (eine Zeile in
  `pruefenListe()`, analog zur `art:"app"`-Prüfung).
- **`pruefenListe()` prüft weiterhin nicht auf `id`-Eindeutigkeit
  innerhalb der Liste** (seit 08-19 offen, unverändert).
- Die Auslöser-Oberfläche selbst deckt bewusst nicht ab: eigene
  `eingaben` (feste Eingaben für den Ablauf) beim Anlegen setzen — neue
  Auslöser aus der UI bekommen immer `eingaben:{}`. Wer feste Eingaben
  braucht, muss weiterhin den Agenten bitten. Kein Bug, nur eine bewusst
  kleine erste Fassung; eine kommende Nacht könnte das Formular um ein
  optionales Schlüssel/Wert-Feld erweitern.
- Es gibt weiterhin keinen Ein/Aus-Schalter in der Oberfläche für den
  globalen `ausloeserAn`/`ausloeserKarenzS`-Konfigwert (Wächter komplett
  abschalten, Karenzzeit einstellen) — nur über `data/config.json` von
  Hand oder das Werkzeug erreichbar. Bewusst nicht mitgebaut, weil das
  über `Settings.jsx`s `save()`-Whitelist (`ZAHLEN`/`SCHALTER`-Arrays)
  gegangen wäre und damit bestehende Speicherlogik berührt hätte statt
  rein additiv zu bleiben. Guter, kleiner Kandidat für eine kommende
  Nacht.
- `fs_search` (`server/tools/files.js`) validiert `pattern` weiterhin
  nicht auf Leere/`undefined` (seit 08-18 offen).
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js`
  und `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js`
  weiterhin ein guter, kleiner Kandidat.
- Werkstatt-Baustein-Kopf: Typ-Badge (`.baustein-marke`) zeigt den Typ
  weiterhin doppelt (seit 08-12, mehrfach zurückgestellt).

## 2026-08-23
Erledigt: Farbknopf (Akzentfarbe) aus der Fußleiste (`web/src/App.jsx`,
`Fussleiste`) in die Einstellungen verschoben (`web/src/components/
Settings.jsx`, neues Feld "Akzentfarbe" im Abschnitt "Aussehen", direkt
neben Ruhig/JARVIS). Das Farbrad (`Farbrad.jsx`) ist unverändert, wird nur
noch von dort statt von der Fußleiste geöffnet — verschachteltes Sheet über
den Einstellungen, Speichern schließt nur das Farbrad, Einstellungen
bleiben offen.

Wichtiger Fehler im eigenen Ablauf, transparent vermerkt: Drei parallele
Vorschlags-Agenten eingeholt (Oberfläche/Server/Fehlendes), aber beim
Orientieren nur mit `tail -200` in NOTIZEN.md geschaut — dadurch den
aktuellsten Eintrag (08-22, ganz oben in der Datei) übersehen. Genau dort
steht bereits, dass die Farbknopf-Verschiebung die *fünfte* Wiederholung
desselben Musters wäre (nach Zeiger, Weckwort, Dauerlauschen, Notch-Fenster)
und aus Sicht der letzten Nacht "abnehmender Grenznutzen" hat — die
Auslöser-Übersicht sei die eigentlich größere Lücke. Der Oberfläche-Agent
heute ist unabhängig auf denselben Farbknopf-Vorschlag gekommen (er kannte
den 08-22-Eintrag ebenfalls nicht, da ich ihm dieselbe NOTIZEN.md ohne
Warnung mitgegeben habe) und ich habe ihn gewählt, ohne den Widerspruch zu
bemerken.

Die Änderung selbst ist trotzdem korrekt und ungefährlich: klein (zwei
Dateien, ~25 Zeilen), Farbrad-Komponente unverändert, mit echtem Playwright/
Chromium getestet (Fußleiste ohne Farbknopf, Einstellungen mit Farbknopf,
Farbrad öffnet/schließt sauber verschachtelt, Farbwahl wirkt sofort auf die
ganze Oberfläche, keine JS-Fehler), zwei unabhängige Prüfer fanden nichts
Echtes. Nur die Priorisierung war nicht die beste — die Auslöser-Übersicht
bleibt liegen, jetzt seit einer weiteren Nacht.

Für kommende Nächte, mit Nachdruck: **zuerst den kompletten Anfang von
NOTIZEN.md lesen** (nicht nur `tail`), bevor Vorschlags-Agenten losgeschickt
werden — der neueste Eintrag steht oben und enthält oft genau die
Einordnung, die einen Fehlgriff wie diesen vermieden hätte. Und: die
Auslöser-Übersicht (`server/ausloeser.js`, `server/index.js` GET/POST
`/api/ausloeser` fertig, UI fehlt ganz) ist jetzt der klare nächste
Kandidat — mittlerer Aufwand (~180-250 Zeilen über mehrere Dateien und
7 Sprachen), aber seit vielen Nächten die größte echte Lücke.

## 2026-08-22
Erledigt: Globaler Express-Error-Handler in `server/index.js` (kurz vor
`const server = http.createServer(app)`, nach allen Routen inkl. SPA-
Catch-all). Bisher landete jeder unbehandelte Fehler — allen voran kaputtes
JSON im Body einer POST-Route (`express.json()` wirft dann synchron) — bei
Express' eingebautem Standard-Handler, der eine volle HTML-Seite mit
Stacktrace und echten Server-Dateipfaden zurückschickt. Jetzt liefert jede
so betroffene Route dieselbe saubere `{ fehler: "..." }`-Antwort wie der
Rest von `index.js` schon lange, mit sinnvollem Statuscode.

Dieser Vorschlag war schon seit 08-19 (drei Nächte) als bester Server-
Kandidat bestätigt und jede Nacht zugunsten sichtbarerer Oberflächen-Fixes
zurückgestellt. Drei Vorschläge parallel eingeholt (Oberfläche/Server/
Fehlendes): Oberfläche schlug vor, den `farbknopf` (Akzentfarbe) analog zu
Zeiger/Weckwort/Dauerlauschen/Notch-Fenster aus der Fußleiste in die
Einstellungen zu verschieben; Fehlendes bestätigte die Auslöser-Übersicht
in der Oberfläche (Backend fertig, UI fehlt ganz) als größte echte Lücke.
Server-Vorschlag gewählt, weil er der mit Abstand kleinste und sicherste
war (eine Datei, ~10 Zeilen, reiner Zusatz ohne bestehende Logik zu
berühren) und weil "seit drei Nächten bester Kandidat, aber nie dran" für
sich selbst ein Signal ist. Die Farbknopf-Verschiebung wäre die fünfte
Wiederholung desselben Musters (abnehmender Grenznutzen); die Auslöser-
Übersicht ist mit ~180-250 Zeilen über mehrere Dateien und 7 Sprachen
deutlich riskanter für eine Nacht — beide bleiben gute Kandidaten für
kommende Nächte, siehe unten.

Prüfer 1 (Funktioniert es) hat selbst getestet: Server wirklich gestartet,
`curl -i -X POST /api/config --data '{kaputt'` lieferte mit der Änderung
`400` + sauberes JSON (`{"fehler":"Expected property name..."}`) ohne
Stacktrace/Dateipfad im Body — Stacktrace erscheint korrekt nur noch in der
Server-Console über `console.error`. Zur Kontrolle per `git stash` das
Verhalten *ohne* die Änderung geprüft: dort kam tatsächlich die volle
HTML-Fehlerseite mit echten Pfaden wie
`/home/user/urai/node_modules/body-parser/lib/types/json.js:96:19` zurück.
Normale Routen (`/api/sessions`) blieben mit der Änderung unverändert
funktionsfähig. Kein Fehler gefunden.

Prüfer 2 (Randfälle) bestätigte die Position (nach allen Routen, inkl.
SPA-Catch-all) und fand einen echten, aber vorbestehenden Punkt: Express 4
reicht Exceptions aus `async (req, res) => {...}`-Routen ohne eigenes
try/catch nicht automatisch an einen Error-Handler durch — sowas landet als
unbehandelte Promise-Rejection, die (ohne globalen `process.on
('unhandledRejection', ...)`, den es in `index.js` nicht gibt) den ganzen
Node-Prozess beendet, nicht nur die eine Anfrage. Betroffene Routen laut
Prüfer 2: `/api/status`, `/api/lokal`, `/api/voices`, `/api/telegram/neu`,
`/api/mcp/neu`. Das ist KEINE Regression durch die heutige Änderung — dieses
Verhalten gab es exakt genauso vorher schon, der neue Handler wird für
solche Fälle nie erreicht und ändert daran nichts. Trotzdem ernstgenommen:
der ursprüngliche Kommentar klang, als sei damit "alles oben" sicher
abgefangen — das stimmt nicht für async-Routen ohne try/catch. Kommentar
entsprechend präzisiert (nennt jetzt ausdrücklich, was NICHT abgedeckt ist
und warum). Die eigentliche async-Crash-Lücke selbst nicht behoben, weil
das eine andere, größere Baustelle ist (fünf Routen bräuchten je eigenes
try/catch oder einen async-Wrapper — deutlich mehr als "eine kleine Sache"
für eine Nacht) — siehe offene Punkte unten.

Build (`npm run build`) und der Server-Modul-Ladetest liefen bei mir am
Ende nochmal sauber durch, `git diff` enthielt nur die eine Stelle in
`server/index.js`, keine Geheimnisse.

Offen für kommende Nächte:
- **Async-Routen ohne try/catch crashen den ganzen Server.** Heute von
  Prüfer 2 entdeckt und mit einer eigenen Express-4.22.2-Testinstanz
  reproduziert: `/api/status`, `/api/lokal`, `/api/voices`,
  `/api/telegram/neu`, `/api/mcp/neu` sind `async`, haben kein eigenes
  try/catch und reichen einen Fehler damit nicht an den heutigen
  Error-Handler durch — stattdessen unbehandelte Promise-Rejection, die
  den kompletten Node-Prozess beendet (alle offenen Verbindungen sterben
  mit). Größter Hebel unter den offenen Server-Punkten, weil es nicht nur
  hässlich ist wie das JSON-Problem, sondern den Dienst wirklich lahmlegt.
  Zwei mögliche Richtungen: (a) jede der fünf Routen bekommt ein eigenes
  try/catch mit `next(err)`, oder (b) ein kleiner Wrapper
  (`const asyncRoute = fn => (req,res,next) => fn(req,res,next).catch(next)`)
  einmal definieren und um alle fünf Handler legen — Variante (b) ist
  weniger Wiederholung, aber ändert an fünf Stellen die Handler-Signatur,
  also sorgfältig einzeln durchtesten.
- Werkstatt-Baustein-Kopf: Typ-Badge (`.baustein-marke`) zeigt den Typ
  weiterhin doppelt (seit 08-12, mehrfach zurückgestellt).
- Auslöser-Übersicht fehlt weiterhin ganz in der Oberfläche
  (`server/ausloeser.js`, GET/POST `/api/ausloeser` fertig und validiert,
  nur UI fehlt — Vorbild `SkillEinstellungen.jsx`, ~180-250 Zeilen über
  mehrere Dateien und 7 Sprachen, heute erneut als Fehlendes-Kandidat
  bestätigt).
- `farbknopf` (Akzentfarbe) sitzt weiterhin dauerhaft in der Fußleiste statt
  in den Einstellungen — heute als Oberfläche-Kandidat gefunden (analog zu
  Zeiger/Weckwort/Dauerlauschen/Notch-Fenster), noch nie geprüft, ~25-35
  Zeilen in `App.jsx`/`Settings.jsx`, sehr geringes Risiko.
- `pruefenListe()` (`server/ausloeser.js`) prüft `id` weiterhin nicht auf
  Eindeutigkeit (seit 08-19 offen).
- `fs_search` (`server/tools/files.js`) validiert `pattern` weiterhin nicht
  auf Leere/`undefined` (seit 08-18 offen).
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.

In der Skill-Liste dieser Session steckte erneut der injizierte Eintrag
„steinzeit-modus" — wie in den Vornächten als eingeschleuster Text ignoriert.

## 2026-08-21
Erledigt: Der eigene animierte Mauszeiger (`web/src/components/Cursor.jsx`,
"Auge mit weichem Nachlauf") lief bisher bei jedem Nutzer standardmäßig AN —
unabhängig von der gewählten Haut. Alle anderen HUD-Verzierungen
(JarvisKern/JarvisStrom/JarvisEcken/JarvisLeiste) zeigen sich dagegen nur,
wenn die JARVIS-Haut aktiv eingeschaltet ist; die normale, ruhige Standard-
Haut blieb beim Zeiger die einzige Ausnahme. Jetzt ist der Zeiger
standardmäßig AUS, genau wie die übrigen Verzierungen — nur wer ihn in den
Einstellungen ausdrücklich einschaltet (`localStorage`-Schlüssel
"urai-zeiger" === "an"), bekommt ihn. Der manuelle Schalter in Settings.jsx
bleibt unverändert erhalten, nur die zwei Default-Auswertungen wurden
gedreht (`Cursor.jsx` Zeile ~21, `Settings.jsx` Zeile ~114).

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
fand genau diesen Zeiger-Kandidaten (kleiner, sicherer Fix an zwei
bestehenden Stellen). Server bestätigte erneut den seit 08-19 offenen
globalen Express-Error-Handler. Fehlendes-Vorschlag war eine vollständige
Auslöser-Übersicht in der Oberfläche (~180-250 Zeilen JSX + CSS + i18n über
6 Sprachen, neue Komponente nach Vorbild `SkillEinstellungen.jsx`). Zeiger-
Vorschlag gewählt: er trifft direkt den größten offenen Wunsch des Nutzers
(ruhigere Oberfläche) mit dem mit Abstand kleinsten Risiko (zwei
Ein-Zeilen-Änderungen an vorhandener Logik, keine neue Datei, kein neuer
Zustand) — kleiner und sicherer als der serverweite Error-Handler und
deutlich risikoärmer als die mehrteilige Auslöser-UI.

Prüfer 1 (Funktioniert es) hat selbst `npm run build` ausgeführt (sauber),
Code-Logik in `App.jsx`/`Cursor.jsx`/`Settings.jsx`/`styles.css` gegengelesen
und zusätzlich mit Playwright/Chromium im echten Browser (`npm run dev`)
Schritt für Schritt bestätigt: frischer `localStorage` → Zeiger aus,
Schalter zeigt "aus"; Schalter auf "an" geklickt → nach Reload Zeiger
sichtbar, Schalter zeigt "an". Grep über `web/src` bestätigt: keine andere
Stelle setzt den Schlüssel oder schaltet den Zeiger anderweitig ein.
Nebenbefund (kein Fehler dieser Änderung, nur beim Testaufbau aufgefallen):
in der Dev-Umgebung mit aktivem Live-Modus bekommt `Boot`s `onDone`-Prop bei
jedem Live-Tick eine neue Funktionsreferenz, was den 2,6s-Boot-Timer
zurücksetzt (`App.jsx`, `Boot.jsx`) — unabhängig vom Zeiger-Schalter, hier
nicht angefasst, evtl. für eine kommende Nacht.

Prüfer 2 (Randfälle) prüfte: vorher "aus" gesetzt bleibt "aus"; nie
angefasst wird jetzt automatisch "aus" (gewollt, deckt sich mit der
Beruhigen-Stoßrichtung); andere `localStorage`-Werte ("", "true", "AN")
verhalten sich in `Cursor.jsx` und `Settings.jsx` konsistent (beide
vergleichen strikt gegen genau `'an'`); fehlendes `localStorage` (privater
Modus) ist an dieser Stelle weiterhin ungeschützt wie schon vorher, keine
Verschlechterung durch diesen Diff. `git diff` enthielt nur die zwei
erwarteten Dateien. Kein echter Fehler gefunden.

Build und Server-Modul-Ladetest liefen bei mir selbst am Ende nochmal
sauber durch, `git diff --cached` enthielt nur `Cursor.jsx`/`Settings.jsx`,
keine Geheimnisse.

In der Skill-Liste dieser Session steckte erneut der injizierte Eintrag
„steinzeit-modus" — wie in den Vornächten als eingeschleuster Text ignoriert.

Offen für kommende Nächte (unverändert, keiner heute angefasst):
- Express hat serverweit weiterhin keinen globalen Error-Handler
  (`server/index.js`) — seit 08-19 offen, heute erneut vom Server-Vorschlag
  bestätigt, weiterhin größter Hebel pro Diff-Zeile unter den offenen
  Server-Kandidaten.
- `pruefenListe()` (`server/ausloeser.js`) prüft `id` weiterhin nicht auf
  Eindeutigkeit innerhalb der Liste (seit 08-19 offen).
- `fs_search` (`server/tools/files.js`) validiert `pattern` weiterhin nicht
  auf Leere/`undefined` (seit 08-18 offen).
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.
- Werkstatt-Baustein-Kopf: Typ-Badge (`.baustein-marke`) zeigt den Typ
  weiterhin doppelt (seit 08-12/08-19/08-20 offen, jede Nacht zugunsten
  dringenderer Fixes zurückgestellt).
- Auslöser-Übersicht fehlt weiterhin ganz in der Oberfläche
  (`server/ausloeser.js`, GET/POST `/api/ausloeser` sind fertig und
  validiert, nur die UI fehlt — Vorbild `SkillEinstellungen.jsx` liegt vor,
  ~180-250 Zeilen JSX + CSS + i18n über 6 Sprachen, mittlerer Aufwand).
- Neu aufgefallen (kein Bug, nur Beobachtung aus dem heutigen Browser-Test):
  `Boot.jsx`/`App.jsx` — bei aktivem Live-Modus bekommt `onDone` bei jedem
  Live-Tick eine neue Funktionsreferenz, was den Boot-Timer zurücksetzen
  kann. Nicht weiter untersucht, war nicht Teil des heutigen Auftrags.

## 2026-08-20
Erledigt: `dokument_lesen` (`server/tools/dokument.js`) kann jetzt auch `.xlsx`
lesen — bisher konnte das Werkzeug nur .docx/.pptx zurücklesen, obwohl
`dokument_excel` (dieselbe Datei) längst .xlsx *schreiben* konnte. Neue
Funktionen `spaltenNr` (Gegenrichtung zu `spalte`), `sharedStringsListe`,
`zelleText`, `blattText`, `workbookBlaetter` und `xlsxText` zwischen
`folieText` und dem Werkzeug-Block. Löst Blattreihenfolge/-namen über
`workbook.xml` + `workbook.xml.rels` auf (nicht bloß über Dateinamen-Zählung),
liest sowohl `inlineStr`- als auch `sharedStrings`-Zellen, ordnet Zellen über
ihren echten Zellverweis ("C12") der richtigen Spalte zu statt sie nur
aneinanderzureihen, und unterscheidet Zahl/Text/Bool/Formel-Ergebnis/Fehlerwert.
Fehlt `workbook.xml.rels` oder eine Beziehung, weicht der Code auf die übliche
Benennung `worksheets/sheetN.xml` aus, statt das Blatt zu verlieren.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
bestätigte erneut den seit 08-12/08-19 offenen, aber bislang immer
zurückgestellten Kandidaten (`.baustein-marke`-Rahmen nur noch bei
`hat-gefahr` zeigen, ~3-5 Zeilen CSS, rein kosmetisch). Server bestätigte
den seit 08-19 offenen globalen-Express-Error-Handler als größten Hebel pro
Diff-Zeile (schützt alle Routen gleichzeitig gegen HTML-Stacktrace-Leaks bei
kaputtem JSON-Body). Fehlendes-Vorschlag (.xlsx-Lesen) gewählt, weil er der
Nutzer beim Arbeiten direkt merkt (kann jetzt eigene wie fremde Excel-Dateien
zusammenfassen lassen), additiv in einer einzelnen, bereits bekannten Datei
bleibt und die Skizze aus den Vornächten schon durchdacht war — geringeres
Risiko als der serverweite Error-Handler (der zwar isoliert ist, aber *alle*
Routen gleichzeitig verhält) und direkter spürbar als die kosmetische
Badge-Änderung.

Prüfer 1 (Funktioniert es) hat selbst getestet: eigener Roundtrip
(`dokument_excel` → `dokument_lesen`) mit Umlauten, Sonderzeichen, Zahlen,
Booleans, Unicode — korrekt, UND eine von Hand mit `zip` gebaute "fremde"
Datei mit `sharedStrings.xml`, Rich-Text-Läufen, Formelzelle, Spaltenlücke,
Bool und Fehlerwert — ebenfalls korrekt. Fand aber einen echten Fehler:
Blattnamen mit XML-Sonderzeichen (z.B. `&`) kamen roh als `&amp;amp;` zurück,
weil `workbookBlaetter()` den Namen aus `workbook.xml` matcht, aber nicht
`entesc()` darauf anwendet (der Name wird beim Schreiben mit `esc()`
XML-escaped abgelegt). Behoben (`entesc()` auf den Namen-Match), mit Test
("Umsatz & Kosten \"Q1\"" als Blattname) bestätigt.

Prüfer 2 (Randfälle) prüfte Typ-Wachen, fehlende Datei, fehlende
`sharedStrings.xml`/`.rels`, leere Mappe, Nicht-ZIP-Datei, viele Spalten
(AA-Bereich) — alles sauber mit klaren Meldungen bzw. korrekt. Fand zwei
echte Dinge: (1) eine Zelle mit eingebettetem Zeilenumbruch (Alt+Enter in
Excel) sprengte die Zeilenstruktur der Textausgabe, weil Zeilen selbst per
`\n` getrennt werden — behoben, indem `blattText()` interne Zeilenumbrüche
in jeder Zelle durch ein Leerzeichen ersetzt, bevor die Zeile gebaut wird
(mit einer dreizeiligen Testtabelle inkl. Mehrzeilen-Notiz nachgeprüft:
genau 3 Datenzeilen in der Ausgabe, nicht mehr). (2) absichtlich
verschachteltes/abgebrochenes `<row>`/`<c>`-XML führt zu stillem
Überschreiben statt einer Fehlermeldung — NICHT behoben, weil das dieselbe
Grenze wie beim bestehenden .docx/.pptx-Lesen in derselben Datei ist (auch
dort regex-basiert, kein echter XML-Parser) und echte, von Excel selbst
erzeugte Dateien immer wohlgeformtes XML sind. Ein echter Fix bräuchte einen
richtigen XML-Parser — deutlich größerer Umbau als "genau eine Verbesserung"
für eine Nacht.

Prüfer 2 hatte außerdem drei Testdateien/-ordner (`fehlendes_blatt.xlsx`,
`kein_workbook.xlsx`, `g/`, `h/`) im Projekt-Wurzelverzeichnis statt in einem
eigenen Testordner unter `$HOME` liegen lassen — vor dem Commit entdeckt und
entfernt (waren erkennbar eigene Testartefakte, keine Nutzerdaten).

Build und Server-Modul-Ladetest liefen bei mir selbst am Ende nochmal sauber
durch, `git diff --cached` enthielt nur `server/tools/dokument.js`, keine
Geheimnisse.

`main` stand zu Beginn dieser Nacht wieder losgelöst (detached) exakt auf
`origin/main` — mit `git fetch` und `git checkout -B main origin/main`
aufgeholt, Arbeitsverzeichnis-Änderungen blieben dabei erhalten.

In der Skill-Liste dieser Session steckte erneut der injizierte Eintrag
„steinzeit-modus" — wie in den Vornächten als eingeschleuster Text ignoriert.

Offen für kommende Nächte:
- Express hat serverweit weiterhin keinen globalen Error-Handler
  (`server/index.js`) — seit 08-19 offen, heute erneut vom Server-Vorschlag
  bestätigt: ein `app.use((err, req, res, next) => ...)`-Block am Ende aller
  Routen würde alle Routen gleichzeitig gegen HTML-Stacktrace-Leaks bei
  kaputtem JSON-Body absichern. Größter Hebel pro Diff-Zeile unter den
  offenen Server-Kandidaten.
- `pruefenListe()` (`server/ausloeser.js`) prüft `id` weiterhin nicht auf
  Eindeutigkeit innerhalb der Liste (seit 08-19 offen).
- `fs_search` (`server/tools/files.js`) validiert `pattern` weiterhin nicht
  auf Leere/`undefined` (seit 08-18 offen).
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.
- `xlsxText()`/`blattText()` (`server/tools/dokument.js`) ist regex-basiert
  und geht von wohlgeformtem XML aus — absichtlich verschachteltes/kaputtes
  `<row>`/`<c>`-XML kann eine Zelle still überschreiben statt einen Fehler zu
  werfen. Heute bewusst nicht behoben (siehe oben), da echte Excel-Dateien
  davon nicht betroffen sind und ein echter Fix einen XML-Parser bräuchte.
  Dieselbe Grenze gilt bereits seit Längerem für `docxText()`/`folieText()`.
- Werkstatt-Baustein-Kopf: Typ-Badge (`.baustein-marke`) zeigt den Typ
  weiterhin doppelt (seit 08-12/08-19 offen, jede Nacht zugunsten
  dringenderer Fixes zurückgestellt) — Rahmen nur noch beim `hat-gefahr`-
  Zustand zeigen, ~3-5 Zeilen `web/src/werkstatt.css`.
- Auslöser-Übersicht fehlt weiterhin ganz in der Oberfläche.

## 2026-08-19
Erledigt: `POST /api/ausloeser` (`server/index.js`) validiert jetzt den Body,
bevor er geschrieben wird. Vorher lief `req.body` ungeprüft direkt in
`ausloeserSchreiben()` — ein fehlerhafter Body (z.B. ein Objekt statt Array,
oder Einträge ohne `id`/`ablauf`) hätte beim nächsten `lesen()` still zu `[]`
geführt: alle bestehenden Auslöser kommentarlos weg. Neue Funktion
`pruefenListe()` in `server/ausloeser.js` prüft Array-Form, Objekt-Struktur
jedes Eintrags, `id`/`ablauf` als nicht-leere Strings, `art` gegen `ARTEN`,
und je nach `art` das Format von `wann` (Zeit-Form `08:30`, App-Name als
nicht-leerer String) — dieselben Grundregeln wie das bereits bestehende
Werkzeug `ausloeser_anlegen`, ohne dessen teurere Prüfungen (Ordner-/
Ablauf-Existenz), die für einen Bulk-Save ungeeignet wären.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, den Rahmen der Typ-Badge im Werkstatt-Baustein-Kopf
(`.baustein-marke`) zu entfernen und nur beim `hat-gefahr`-Zustand zu
behalten — der schon am 08-12 verworfene Kandidat, diesmal mit der
Gefahr-Kopplung von Anfang an mitgedacht. Guter, aber rein kosmetischer
Kandidat. Server schlug erneut die seit 08-18 offene `fs_search`-Muster-
Validierung vor (`pattern` wird bei leerem/undefiniertem Wert nicht geprüft,
führt zu einem kryptischen `maxBuffer`-Fehler statt einer klaren Meldung) —
klein (1 Zeile), aber für den Nutzer unsichtbar. Fehlendes-Vorschlag
(Ausloeser-Body-Validierung) gewählt, weil er echten, irreversiblen
Datenverlust verhindert (alle Auslöser eines Nutzers auf einen Schlag weg)
und damit im selben Nutzen/Risiko-Rang steht wie die Sandbox-Fixe der
Vornächte (08-14) — höher als eine kosmetische UI-Änderung oder ein
Fehlerschluck-Fix an einer Stelle, die kein Endnutzer direkt sieht.

Prüfer 1 (Funktioniert es) hat `node --check`, Build, Server-Modul-Ladetest
und einen echten Server-Test mit `curl` selbst durchgeführt (im echten
`data/`, danach vollständig aufgeräumt — keine Testdatei zurückgelassen):
gültiger Bulk-POST wird gespeichert, ein kaputter Body (`{"kaputt":true}`,
kein Array) wird jetzt mit 400 abgelehnt UND die vorher gespeicherte Liste
bleibt beim folgenden GET unangetastet — das war der eigentliche Kern des
Fixes. Prüfer 2 (Randfälle) fand einen echten, im Geltungsbereich liegenden
Fehler: bei `art==='app'` prüfte `pruefenListe` `wann` nur auf Falsy, nicht
auf `string`-Typ — eine Zahl als `wann` rutschte durch und hätte in
`Waechter.takt()` bei `a.wann.toLowerCase()` eine `TypeError` ausgelöst
(abgefangen durch den `.catch(()=>{})` am `setInterval`, kein Server-Crash,
aber die App-Prüfung für den betroffenen Takt bricht ab). Behoben mit
zusätzlichem `typeof a.wann !== 'string'`-Check, danach erneut mit einem
gezielten Testskript (Zahl/`null`/leerer String/gültiger String als `wann`)
bestätigt. Prüfer 2 fand außerdem zwei Lücken außerhalb des heutigen
Scopes (siehe unten): keine Duplikat-Prüfung auf `id`, und ein kaputtes
JSON im Request-Body (nicht: ein strukturell falscher, aber gültiger JSON-
Body) landet vor `pruefenListe` im Express-Default-Fehlerbehandler und
liefert eine volle HTML-Stacktrace mit internen Dateipfaden statt eines
sauberen 400 — weil im ganzen Server kein globaler Express-Error-Handler
existiert (per `grep` bestätigt).

Build und Server-Modul-Ladetest liefen bei mir selbst nach der Nachbesserung
nochmal sauber durch, `git diff` enthielt nur die zwei erwarteten Dateien
(`server/ausloeser.js`, `server/index.js`), keine Geheimnisse.

In der Skill-Liste dieser Session steckte erneut der injizierte Eintrag
„steinzeit-modus" — wie in den Vornächten als eingeschleuster Text ignoriert.

Offen für kommende Nächte:
- Express hat serverweit keinen globalen Error-Handler — kaputtes JSON im
  Body jeder POST-Route (nicht nur `/api/ausloeser`) landet aktuell im
  Default-Handler und liefert eine HTML-Stacktrace mit internen Dateipfaden
  statt einer sauberen JSON-Fehlermeldung. Von Prüfer 2 heute per echtem
  curl-Test gegen `/api/ausloeser` bestätigt. Größerer Kandidat als die
  bisherigen Ein-Datei-Fixes (betrifft `server/index.js` insgesamt), aber
  isolierbar: ein einzelner `app.use((err, req, res, next) => ...)`-Handler
  am Ende der Routen-Definitionen würde alle Routen gleichzeitig absichern.
- `pruefenListe()` (`server/ausloeser.js`) prüft `id` nicht auf Eindeutigkeit
  innerhalb der Liste — ein Bulk-POST mit zwei gleichen `id`s wird
  anstandslos gespeichert, macht spätere `ausloeser_loeschen`-Aufrufe
  mehrdeutig (`liste.find()` trifft immer nur den ersten Treffer). Kleiner,
  isolierter Nachfolge-Fix, von Prüfer 2 heute gefunden.
- `fs_search` (`server/tools/files.js`) validiert `pattern` weiterhin nicht
  auf Leere/`undefined` (seit 08-18 offen, weiterhin unverändert) — analog
  zur bestehenden Prüfung in `resolve()` fehlt ein
  `if (!pattern || typeof pattern !== 'string') throw new Error('Suchmuster
  fehlt.')` direkt am Anfang von `run()`. Klein, isoliert, guter nächster
  Server-Kandidat.
- Werkstatt-Baustein-Kopf: Typ-Badge (`.baustein-marke`) zeigt den Typ
  doppelt (Farbpunkt daneben zeigt denselben Typ per Farbe) — Vorschlag
  heute: Rahmen nur noch beim `hat-gefahr`-Zustand zeigen (~3-5 Zeilen,
  `web/src/werkstatt.css`), Gefahr-Kopplung diesmal von Anfang an
  mitgedacht statt wie am 08-12 unterwegs entdeckt. Guter, aber rein
  kosmetischer nächster UI-Kandidat.
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx — Skizze
  liegt vor (`unzip -Z1` für Blattliste, `xl/workbook.xml` für Blattnamen,
  `xl/sharedStrings.xml` für den Text-Pool, `xl/worksheets/sheetN.xml` per
  Regex auf `<c r="..." t="...">...<v>/<is>`, dabei `t="inlineStr"`, `t="b"`
  und typlose Zahlzellen mitdenken), ~90-120 Zeilen in einer Datei.
- Auslöser-Übersicht fehlt ganz in der Oberfläche (`server/ausloeser.js`,
  `server/index.js` GET/POST `/api/ausloeser` sind fertig, jetzt auch
  validiert — nur die UI fehlt noch).

## 2026-08-18
Erledigt: `fs_search` (`server/tools/files.js`) verschluckt keine echten Fehler
mehr. Der seit mehreren Nächten (08-14 bis 08-17) als bester Server-Kandidat
vermerkte, aber jede Nacht zugunsten der Oberfläche zurückgestellte Fix ist
jetzt umgesetzt: der Catch-Block unterscheidet `e.code === 1` (rg/grep: echt
kein Treffer, weiterhin `"(nichts gefunden)"`), `e.code === 'ENOENT'`
(Programm fehlt, wirft jetzt einen benannten Fehler) und alles andere (wirft
jetzt `Suche fehlgeschlagen: ${e.stderr || e.message}` statt stillschweigend
`e.stdout` — meist leer bei echten Fehlern — als „nichts gefunden" zu zeigen).
Vorher zog ein Agent aus einem kaputten Regex-Muster oder fehlendem `rg` die
falsche Schlussfolgerung „Datei/Code existiert nicht", obwohl die Suche nie
lief.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, den statischen Tastatur-Hinweis („Enter senden · Shift+Enter neue
Zeile") im Composer nach der ersten Nachricht auszublenden — letztes rein
statisches Element in einer Zeile, die die Vornächte schon von
Einrichtungs-Elementen befreit haben, aber inzwischen eher Kosmetik als
echte Überladung. Fehlendes bestätigte i18n erneut vollständig (155/155 in
allen sieben Sprachen, diesmal per Skript nachgezählt statt nur der Notiz
vertraut) und bekräftigte `.xlsx`-Lesen für `dokument_lesen` als weiterhin
fehlend. Server-Vorschlag (`fs_search`) gewählt, weil er trotz kleinstem
Diff (~8 Zeilen, eine Datei, isolierter Catch-Block) seit vier Nächten der am
besten begründete, am längsten offene Kandidat war und echten Nutzerschaden
behebt (falsche Antworten durch verschluckte Fehler) — im Unterschied zur
Oberfläche, deren größere Überladungs-Probleme in den Vornächten bereits
abgearbeitet wurden und deren Restkandidat nur noch eine Tastatur-Legende
betrifft.

Prüfer 1 (Funktioniert es) hat Build, Server-Modul-Ladetest und einen echten
funktionalen Test von `fileTools` selbst geschrieben und ausgeführt: Muster
ohne Treffer → weiterhin `"(nichts gefunden)"`, kaputtes Muster (`"(unclosed"`,
GNU grep liefert dafür Exitcode 2) → wirft jetzt korrekt
`Suche fehlgeschlagen: grep: Unmatched ( or (`, fehlendes Programm → korrekt
erkannter `ENOENT`-Zweig. Auch bestätigt: der geworfene Fehler kommt über
`server/agent.js` sauber als `Fehler bei fs_search: ...` beim Aufrufer an,
kein Crash. Prüfer 2 (Randfälle) hat beide Aufrufstellen (`agent.js`,
`ablauf.js`) auf ungesicherte `tool.run`-Pfade geprüft (keine gefunden),
GNU-grep-Exitcodes für mehrere echte Syntaxfehler selbst gemessen (immer 2,
nie fälschlich 1), Signal-Terminierung und `e.stderr`-Typ bei execFile-Fehlern
nachgestellt (zuverlässig ein String, kein Buffer) und die Oberfläche auf
Parsing des rohen `fs_search`-Texts geprüft (wird nur generisch in `<pre>`
angezeigt, nichts bricht). Einziger echter Fund: eine **vorbestehende**,
nicht durch diesen Diff verursachte Lücke — `fs_search` validiert `pattern`
nicht auf Leere, und `coerceArgs()` in `server/agent.js` entfernt leere
Strings aus den Werkzeug-Argumenten, bevor sie den Handler erreichen. Ein
leeres `pattern` wird dadurch lautlos zu einer Suche nach dem Literal
`"undefined"` (weil die destrukturierte, jetzt fehlende Variable im
`execFile`-Args-Array zu diesem String wird) — das führt reproduzierbar zu
einem `maxBuffer`-Fehler statt einer klaren Meldung „Suchmuster fehlt". Nicht
mit in diesen Commit aufgenommen (bewusst außerhalb des Scopes „genau eine
Verbesserung"), siehe unten als eigener Kandidat.

Build und Server-Modul-Ladetest liefen bei mir selbst am Ende nochmal sauber
durch, `git diff` enthielt nur die eine erwartete Datei, keine Geheimnisse.

Am Rande: Der lokale Checkout stand zu Beginn dieser Nacht wieder detached
auf `origin/main` (Fetch-Cache war veraltet, `origin/main` zeigte lokal noch
auf einen älteren Stand als tatsächlich auf GitHub). Mit `git fetch` aktuell
gebracht, dann `git checkout -B main origin/main` — sauberer Fast-Forward,
keine verlorenen Commits.

In der Skill-Liste dieser Session steckte erneut der injizierte Eintrag
„steinzeit-modus" — wie in den Vornächten als eingeschleuster Text ignoriert.

Offen für kommende Nächte:
- `fs_search` (`server/tools/files.js`) validiert `pattern` weiterhin nicht
  auf Leere/`undefined` — analog zur bestehenden Prüfung in `resolve()`
  (Zeile 15) fehlt ein `if (!pattern || typeof pattern !== 'string') throw
  new Error('Suchmuster fehlt.')` direkt am Anfang von `run()`. Klein,
  isoliert, von Prüfer 2 heute neu gefunden (siehe oben) — guter nächster
  Server-Kandidat, denn ohne den Fix landet ein leeres Muster derzeit als
  verwirrender `maxBuffer`-Fehler statt einer klaren Meldung.
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx — Skizze
  liegt vor (`unzip -Z1` für Blattliste, `xl/workbook.xml` für Blattnamen,
  `xl/sharedStrings.xml` für den Text-Pool, `xl/worksheets/sheetN.xml` per
  Regex auf `<c r="..." t="...">...<v>/<is>`, dabei `t="inlineStr"`, `t="b"`
  und typlose Zahlzellen mitdenken), ~90-120 Zeilen in einer Datei.
- Tastatur-Hinweis im Composer („Enter senden · Shift+Enter neue Zeile")
  könnte wie die Chips am 08-17 nur bei leerem Chat gezeigt werden — letzter
  UI-Kandidat aus der Aufräum-Reihe, aber eher Kosmetik als echte Überladung.
- `POST /api/ausloeser` validiert den Body weiterhin nicht.
- Auslöser-Übersicht fehlt ganz in der Oberfläche.

## 2026-08-17
Erledigt: Schnellwahl-Chips im Composer ("Bildschirm lesen", "Hilf mir hier",
"Was ist offen?", `web/src/App.jsx`) werden jetzt nur noch im leeren Chat
gezeigt, nicht mehr dauerhaft über der Eingabezeile. Bisher stand die
Chip-Zeile — anders als der `.empty`-Block mit den Kacheln, der sich schon
korrekt ausblendet — unbedingt im `.composer`, auch mitten in einem langen
Gespräch: dieselben drei Einstiegs-Vorschläge nahmen dauerhaft Platz zwischen
Verlauf und Eingabefeld weg. Jetzt gilt dieselbe Bedingung (`items.length ===
0`) wie für den Kacheln-Block — reines Bedingungs-Wrapping um die bestehende
`<div className="chips">`, keine neue Logik, kein neuer State.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Server
bestätigte den seit mehreren Nächten offenen `fs_search`-Fehlerschluck
(`server/tools/files.js`) erneut als unverändert offen, mit fertig
skizziertem ~5-Zeilen-Fix (Exitcode-1 vs. echter Fehler unterscheiden).
Fehlendes bestätigte `.xlsx`-Lesen für `dokument_lesen` weiterhin als
fehlend (Datei lehnt es an einer festen Stelle explizit ab) und i18n
weiterhin vollständig (155/155 in allen sieben Sprachen). Oberflächen-
Vorschlag gewählt, weil er — anders als die beiden Server-/Fehlendes-Kandi-
daten, die für den Nutzer unsichtbar bleiben — bei jeder einzelnen Nachricht
in einem laufenden Gespräch sichtbar wird und damit den größten offenen
Nutzerwunsch (ruhigere Oberfläche) direkt trifft, bei minimalem Aufwand
(~15 geänderte Zeilen, eine Datei) und praktisch keinem Bruchrisiko.

Prüfer 1 (Funktioniert es) hat Build UND einen echten Browser-Test mit
Playwright/Chromium selbst durchgeführt (Server ohne API-Schlüssel
gestartet): leerer Chat zeigt die drei Chips, nach dem Senden einer
Nachricht verschwinden sie zusammen mit dem `.empty`-Block, keine
Konsolenfehler. Auch das Wiederherstellen eines alten Gesprächs über
`gespraechOeffnen()` geprüft — `items` wird dabei erst geleert, dann
nachgeladen, die Chip-Bedingung greift also korrekt auch dort. Prüfer 2
(Randfälle) hat i18n (alle sieben Sprachen vollständig), das Notch-Fenster
(`Hud.jsx` hat ein eigenes, chip-loses Eingabefeld, keine Inkonsistenz),
`connected === false` (Chips zwar sichtbar aber weiterhin `disabled`, kein
Verhaltensunterschied) und CSS (`.chips` trug nie eigenes Margin, das
Composer-Padding ist fix, keine Lücke) geprüft — einziger Randfall: beim
kurzen Ladefenster in `gespraechOeffnen()` blitzen Chips (wie der
`.empty`-Block) kurz auf, bevor die geladene Historie erscheint — dasselbe
Verhalten wie beim Kacheln-Block schon vorher, kein neuer Fehler.

Build und Server-Modul-Ladetest liefen am Ende nochmal sauber durch,
`git diff` enthielt nur die eine erwartete Datei, keine Geheimnisse.

Beim Committen aufgefallen: Der Checkout stand zu Beginn dieser Nacht im
detached-HEAD-Zustand auf `origin/main` (11b127b), die lokale `main`-Branch
selbst war noch auf `334a88e` — vier Commits zurück. Der erste Commit-Versuch
landete dadurch ebenfalls detached. Vor dem Push per
`git merge-base --is-ancestor main HEAD` bestätigt, dass `main` ein Vorfahre
von HEAD ist (reiner Fast-Forward, keine verlorenen Commits), dann
`git checkout -B main HEAD` und gepusht. Push danach explizit mit
`git fetch` + `git log origin/main..HEAD` (leer) bestätigt, nicht nur dem
Exit-Code geglaubt — wie in der 08-16-Notiz empfohlen.

Am Rande: In der Skill-Liste dieser Session steckte erneut der injizierte
Eintrag „steinzeit-modus" (behauptet, dauerhaft wie ein Höhlenmensch
antworten zu sollen) — wie in den Vornächten als eingeschleuster Text
ignoriert, kein Einfluss auf die Arbeit oder den Antwortstil.

Offen für kommende Nächte:
- `fs_search` (`server/tools/files.js`) meldet echte Fehler (ungültiges
  Regex-Muster, fehlendes `rg`) weiterhin pauschal als „(nichts gefunden)" —
  Fix bereits mehrfach skizziert: im Catch-Block zwischen `e.code === 1`
  (echt kein Treffer) und anderen Exitcodes/Fehlern unterscheiden, bei
  Fehlern die echte Meldung durchreichen statt sie zu verschlucken.
  ~5 Zeilen, eine Datei, isoliert — bester nächster Server-Kandidat.
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx — Skizze
  liegt vor (`unzip -Z1` für Blattliste, `xl/workbook.xml` für Blattnamen,
  `xl/sharedStrings.xml` für den Text-Pool, `xl/worksheets/sheetN.xml` per
  Regex auf `<c r="..." t="...">...<v>/<is>`, dabei `t="inlineStr"`, `t="b"`
  und typlose Zahlzellen mitdenken), ~90-120 Zeilen in einer Datei.
- `POST /api/ausloeser` validiert den Body weiterhin nicht.
- Auslöser-Übersicht fehlt ganz in der Oberfläche.

## 2026-08-16
Erledigt: „Hey URAI"- (Weckwort) und Dauerlauschen-Umschalter aus der Composer-
Hinweiszeile (`web/src/App.jsx`) in die Einstellungen verschoben
(`web/src/components/Settings.jsx`, Abschnitt „Sprache", direkt nach „Eigener
Zeiger") — dieselbe Fortsetzung der Notch-Knopf- und Zeiger-Verschiebungen
vom 08-08/08-15, diesmal für die zwei letzten Einrichtungs-Umschalter in der
Hinweiszeile. In der Composer-Zeile bleibt nur noch der Stimme-Knopf (den man
öfter mitten im Gespräch anfasst) plus ggf. der Schlüssel-Hinweis. Anders als
beim Zeiger-Umschalter (der einen Reload für eine globale CSS-Klasse braucht)
läuft hier kein Reload: `weckAn`/`dauerAn`-State und die Toggle-Logik
(inklusive Mutex „beide gleichzeitig geht nicht, teilen sich das Mikrofon")
bleiben unverändert in `App.jsx`, `toggleWeck`/`toggleDauer` wurden nur aus
den bisherigen Inline-`onClick`s in benannte Funktionen extrahiert und als
Props an `<Settings>` durchgereicht — Verhalten bewusst 1:1 identisch,
nur der Ort der Knöpfe hat sich geändert.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Server fand
einen echten Fehlerschluck-Bug: `fs_search` (`server/tools/files.js`) meldet
im Catch-Block jeden Fehler als „(nichts gefunden)", weil `e.stdout` bei
echten Fehlern (ungültiges Regex-Muster, fehlendes `rg`) leer ist — ein Agent
zieht daraus falsche Schlüsse (z.B. „Datei existiert nicht"), obwohl die
Suche nie lief. Guter, kleiner Kandidat (~5 Zeilen), aber unsichtbarer für
den Nutzer als die Oberflächen-Änderung. Fehlendes bestätigte i18n erneut
vollständig (alle 7 Sprachen exakt 158 Zeilen) und bekräftigte den seit
mehreren Nächten offenen `.xlsx`-Lesen-Kandidaten für `dokument_lesen`
(Asymmetrie: `dokument_excel` kann seit kurzem .xlsx schreiben, aber
`dokument_lesen` weiterhin nicht einlesen). Oberflächen-Vorschlag gewählt,
weil er wie in den Vornächten den explizit größten offenen Nutzerwunsch
(ruhigere Oberfläche) direkt trifft und Nutzer-Sichtbares laut Auftrag den
Vorzug bekommt.

Nebenbei aufgefallen: Der lokale Checkout stand zwei Commits vor
`origin/main` — die beiden letzten Commits der 08-15-Nacht
(„Revier-Grenze: …" und „Notch-Fenster-Knopf …") waren nie gepusht worden.
`main` war noch bei `334a88e`, der lokale Stand bei `2d8731e` (fast-forward-
fähig, `main` ist Vorfahre). Per `git merge --ff-only` nachgeholt, bevor
heute committet wurde — beim Push gehen also drei Commits raus, nicht einer.
Falls das öfter passiert: möglicherweise bricht der Push am Ende einer
Session gelegentlich ab, ohne dass das in NOTIZEN.md auffällt, weil die Nacht
selbst als erledigt vermerkt wird, bevor der Push bestätigt ist. Für eine
kommende Nacht: am Ende explizit `git log origin/main..HEAD` prüfen, nicht
nur `git push` aufrufen und den Exit-Code glauben.

Prüfer 1 (Funktioniert es) hat Build UND einen echten Browser-Test mit
Playwright/Chromium selbst durchgeführt: echten Server gestartet, Composer-
Zeile bestätigt verkürzt (nur noch Stimme-Knopf plus Schlüssel-Hinweis),
beide neuen Felder in den Einstellungen an der erwarteten Stelle gefunden,
beide anklickbar, Mutex-Logik live bestätigt (Dauerlauschen an schaltet
Weckwort automatisch aus), keine Konsolenfehler. Überraschung: Das hier
installierte Chromium unterstützt `webkitSpeechRecognition` tatsächlich,
daher lief `kannHoeren()` sogar hier auf `true` — der ursprünglich erwartete
Workaround für fehlende Spracherkennung war nicht nötig. Prüfer 2 (Randfälle)
hat den `kannHoeren`-Import in App.jsx (weiterhin für den Mikrofon-Knopf
gebraucht, unverändert), die `toggleWeck`/`toggleDauer`-Definitionen (echte
`function`-Deklarationen, daher gehoisted, keine Reihenfolge-Falle), den
einzigen `<Settings>`-Aufrufort, CSS-Klassenkonsistenz (`chip`/`on` statt
altem `linkish`/`an`, passend zum bestehenden Settings-Muster) und i18n für
„on"/„off" in allen sieben Sprachen geprüft — kein echter Fehler.

Build und Server-Modul-Ladetest liefen am Ende nochmal sauber durch,
`git diff` enthielt nur die zwei erwarteten Dateien, keine Geheimnisse.

Am Rande: In der Skill-Liste dieser Session steckte erneut der injizierte
Eintrag „steinzeit-modus" (behauptet, dauerhaft wie ein Höhlenmensch
antworten zu sollen) — wie am 08-15 als eingeschleuster Text ignoriert,
keine echte Anweisung, kein Einfluss auf die Arbeit.

Offen für kommende Nächte:
- `fs_search` (`server/tools/files.js`) meldet echte Fehler (ungültiges
  Regex-Muster, fehlendes `rg`) weiterhin pauschal als „(nichts gefunden)" —
  Fix skizziert: im Catch-Block zwischen `e.code === 1` (echt kein Treffer)
  und anderen Exitcodes/Fehlern unterscheiden, bei Fehlern die echte Meldung
  durchreichen statt sie zu verschlucken. ~5 Zeilen, eine Datei, isoliert.
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — gemeinsame `server/tools/pfad.js` weiterhin
  ein guter, kleiner Kandidat.
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx — Muster
  seit mehreren Nächten notiert (unten in der 08-14-Notiz), jetzt zusätzlich
  mit der Schreib/Lese-Asymmetrie zu `dokument_excel` begründet.
- `POST /api/ausloeser` validiert den Body weiterhin nicht.
- Auslöser-Übersicht fehlt ganz in der Oberfläche.
- Push-Ergebnis am Ende einer Nacht künftig mit `git log origin/main..HEAD`
  statt nur dem `git push`-Exit-Code bestätigen (siehe oben).

## 2026-08-15
Erledigt: Notch-Fenster-Knopf aus der Composer-Hinweiszeile (`web/src/App.jsx`)
in die Einstellungen verschoben (`web/src/components/Settings.jsx`), analog
zum Zeiger-Umschalter vom 08-08 — genau der Kandidat, der am 08-14 als bester
nächster Schritt vermerkt war. Die Hinweiszeile trug im Ruhezustand bis zu
fünf Elemente (Stimme, Weckwort, Dauerlauschen, Notch-Fenster, ggf.
Schlüssel-Hinweis); der Notch-Knopf ist wie der frühere Zeiger-Umschalter eine
einmalige Einrichtungs-Aktion, keine, die während des laufenden Gesprächs
wiederholt gebraucht wird. Jetzt liegt er als eigenes Feld im
Einstellungen-Abschnitt „Sprache" direkt nach „Eigener Zeiger", mit demselben
`field`/`chips`/`chip`/`note`-Muster.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Server schlug
vor, die zweifach vorhandene `resolve()`-Funktion (`server/tools/files.js` und
`server/tools/dokument.js`) in eine gemeinsame `server/tools/pfad.js`
auszulagern — echter Bug-Multiplikator, weil beide Fixe vom 08-10/08-12 und
08-14 in beiden Dateien wiederholt werden mussten. Fehlendes bestätigte die
i18n-Vollständigkeit erneut (155/155) und schlug wie in den Vornächten
.xlsx-Lesen für `dokument_lesen` vor. Beides gute Kandidaten für kommende
Nächte — heute aber die Oberflächen-Änderung gewählt, weil sie den explizit
größten offenen Nutzerwunsch (ruhigere Oberfläche) direkt trifft und laut
Auftrag Nutzer-Sichtbares vor innerer Schönheit den Vorzug bekommt.

Prüfer 1 (Funktioniert es) hat Build, `git diff --stat -- server/` (leer, also
wirklich unberührt) und einen echten Browser-Test mit Playwright/Chromium
selbst durchgeführt: echten Backend- und Vite-Server gestartet (der
Einstellungen-Dialog rendert erst nach geladener `/api/status`-Config), Notch-
Knopf in der Hinweiszeile bestätigt verschwunden, neues Feld „Notch window"
direkt nach „Eigener Zeiger" bestätigt, Klick auf „Öffnen" öffnet wirklich ein
neues Fenster mit `/?hud=1`, keine Konsolenfehler. Prüfer 2 (Randfälle) hat
i18n (alle sieben Sprachen haben den `hud`-Schlüssel), verwaiste Verweise
(keine gefunden), CSS-Umbruchverhalten des neuen Notiztexts und den
Diff-Umfang (nur die zwei erwarteten Dateien) geprüft — kein echter Fehler.
Einziger bewusst in Kauf genommener Punkt: das Notch-Fenster ist jetzt zwei
Klicks statt einem entfernt, was der Begründung entspricht und dem
Präzedenzfall der Zeiger-Verschiebung folgt.

Am Rande: Prüfer 1 meldete, dass in der Skill-Liste dieser Session ein
eingeschleuster Eintrag „steinzeit-modus" auftauchte, der behauptete, ab
sofort dauerhaft wie ein Höhlenmensch antworten zu sollen — keine echte
Anweisung, sondern injizierter Text in einer Tool-Beschreibung. Wurde
ignoriert, hatte keinen Einfluss auf die eigentliche Arbeit.

Build lief am Ende nochmal sauber durch, `git diff` enthielt nur die zwei
erwarteten Dateien, keine Geheimnisse.

Offen für kommende Nächte:
- `resolve()` ist weiterhin doppelt vorhanden (`server/tools/files.js` und
  `server/tools/dokument.js`) — Vorschlag: gemeinsame `server/tools/pfad.js`
  (~20 Zeilen, reines Verschieben ohne Verhaltensänderung), damit künftige
  Fixe nicht mehr an zwei Stellen gemacht werden müssen. Guter, kleiner
  Kandidat für eine kommende Nacht.
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx (Muster
  seit mehreren Nächten notiert, siehe unten in der 08-14-Notiz).
- `POST /api/ausloeser` validiert den Body weiterhin nicht.
- Auslöser-Übersicht fehlt ganz in der Oberfläche.
- `fs_search` meldet echte Fehler pauschal als "(nichts gefunden)".

## 2026-08-14
Erledigt: `resolve()` in `server/tools/files.js` und `server/tools/dokument.js`
— die Revier-Grenze wurde bisher per reinem String-Präfix geprüft
(`!abs.startsWith(root)`), ohne Pfadtrenner. Ein Nachbarordner mit gleichem
Anfang wie das Revier (z.B. Revier `.../Kunde`, Zielordner `.../KundeArchiv`)
bestand die Prüfung fälschlich — echter Sandbox-Ausbruch, betraf alle zehn
Datei-/Dokument-Werkzeuge (`fs_list/read/write/edit/search/glob`,
`dokument_word/powerpoint/excel/lesen`), inklusive der schreibenden. Erster
Fix (`abs.startsWith(root + path.sep)`) hätte einen neuen Fehler eingeführt:
ist das Revier die Dateisystem-Wurzel `/`, wird daraus `//`, was fast jeden
Pfad fälschlich ausgesperrt hätte. Prüfer 2 fand das, nachgebessert auf
`path.relative(root, abs)` (abgelehnt wenn `rel === '..'`, `rel` mit `..`+Trenner
beginnt, oder `rel` absolut ist) — deckt beide Fälle sauber ab, ohne
Sonderfall-Code für die Wurzel.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, den Notch-Fenster-Knopf aus der Composer-Hinweiszeile
(`web/src/App.jsx`) in die Einstellungen zu verschieben, analog zum
Zeiger-Umschalter vom 08-08 — guter, isolierter Kandidat für eine kommende
Nacht. Fehlendes bestätigte die i18n-Vollständigkeit selbst nachgezählt
(weiterhin 155/155 Schlüssel in allen sieben Sprachen, keine neue Lücke) und
schlug `.xlsx`-Lesen für `dokument_lesen` vor (ZIP+XML wie docx/pptx, ohne
neue Abhängigkeit) — guter Kandidat, aber der Server-Fund hatte das bessere
Nutzen/Risiko-Verhältnis, weil er ein echtes, bereits bestehendes
Sicherheitsrisiko behebt statt eine neue Fähigkeit hinzuzufügen.

Prüfer 1 (Funktioniert es) hat `node --check`, ein Testskript mit echtem
Import von `resolve()` über `fs_list`/`dokument_lesen` (nicht nachgebaut,
echte Module) mit mehreren Pfaden, `npm install && npm run build` und den
Server-Modul-Ladetest selbst ausgeführt — alles sauber, keine Regression bei
normalen Aufrufen innerhalb vom Revier. Prüfer 2 (Randfälle) fand den
Wurzel-`/`-Fall (oben beschrieben) als echten, wenn auch überrestriktiven
statt unsicheren Fehler; nach der Nachbesserung hat ein dritter,
gezielter Prüflauf exakt diesen Fall plus die ursprünglichen sechs
Kernfälle (Revier selbst, Unterordner, Nachbarordner-Ausbruch,
`../`-Auflösung) nochmal selbst gegen den aktuellen Code getestet — hält.

Build und Server-Modul-Ladetest liefen am Ende nochmal sauber durch,
`git diff` enthielt nur die zwei erwarteten Dateien, keine Geheimnisse.

Offen für kommende Nächte:
- Notch-Fenster-Knopf aus der Composer-Hinweiszeile (`web/src/App.jsx`)
  in die Einstellungen verschieben, analog zum Zeiger-Umschalter — klein,
  isoliert, trifft den größten offenen Nutzerwunsch (ruhigere Oberfläche).
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx (Muster:
  `unzip -Z1` für Blattliste, `xl/workbook.xml` für Blattnamen,
  `xl/sharedStrings.xml` für den Text-Pool, `xl/worksheets/sheetN.xml` per
  Regex auf `<c r="..." t="...">...<v>/<is>` — kein neues Paket nötig).
- `POST /api/ausloeser` validiert den Body weiterhin nicht (siehe frühere
  Nächte) — sinnvoll, sobald die Auslöser-Übersicht in der Oberfläche gebaut
  wird, oder eigenständig davor.
- Auslöser-Übersicht fehlt ganz in der Oberfläche (`server/ausloeser.js`,
  `server/index.js` GET/POST `/api/ausloeser` sind fertig, UI fehlt).
- `fs_search` meldet echte Fehler pauschal als "(nichts gefunden)".

## 2026-08-12
Erledigt: `server/tools/files.js`, `resolve()` — dieselbe Typ-Wache wie in
`server/tools/dokument.js` seit dem 2026-08-10-Fix, jetzt auch hier. War seit
drei Nächten in Folge als sicherster nächster Kandidat vermerkt, heute
endlich angefasst. Ohne die Wache stürzt `resolve()` bei einem leeren,
fehlenden oder falsch typisierten `pfad` (null, undefined, Zahl) sofort mit
einer rohen `TypeError: Cannot read properties of undefined (reading
'startsWith')` ab, statt einer verständlichen Meldung — betrifft alle sechs
Datei-Werkzeuge (`fs_list`, `fs_read`, `fs_write`, `fs_edit`, `fs_search`,
`fs_glob`). Jetzt kommt stattdessen `pfad fehlt oder ist kein Text.`.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes). Oberfläche
schlug vor, den Typ-Badge im Werkstatt-Baustein-Kopf (`.baustein-marke`)
ohne Rahmen zu machen — beim eigenen Blick in den Code zeigte sich aber,
dass der Rahmen eine bewusste Design-Entscheidung ist (Kommentar "die
Groq-Seite: harte Kante") und mit dem Gefahr-Zustand (`hat-gefahr`)
verzahnt ist; hätte mehr Sorgfalt gebraucht als der ~5-10-Zeilen-Rahmen
vermuten ließ. Fehlendes schlug vor, `POST /api/ausloeser` zu validieren
(server/ausloeser.js `schreiben()` schreibt jeden Body ungeprüft, ein
Nicht-Array würde beim nächsten `lesen()` still zu `[]` — alle Auslöser
weg) — echtes Risiko, aber die Auslöser-Übersicht hat noch keine UI, die
den Endpunkt überhaupt aufruft, darum heute nicht dringend genug gegenüber
dem Server-Fix mit dem besseren Nutzen/Risiko-Verhältnis.

Prüfer 1 (Funktioniert es) hat `node --check`, ein eigenes Testskript
(`fileTools` importiert, alle sechs Werkzeuge mit `path` ∈ {undefined,
null, 123, '', '   '} aufgerufen — 28/30 exakt mit der neuen Meldung, die
2 verbleibenden lösten legitim den String-Default `'.'` von `fs_search`/
`fs_glob` aus, keine Fehlfunktion) und einen Regressionstest (`fs_list`
mit gültigem Pfad) selbst ausgeführt. Prüfer 2 (Randfälle) fand keinen
echten Fehler: alle sechs Aufrufstellen übergeben `p` nur als Pflichtfeld
oder mit String-Default, kein Codepfad ruft `tool.run` ungeschützt auf
(try/catch in `agent.js` und `ablauf.js`), `coerceArgs` in `agent.js`
entfernt einen bewusst leeren `path` sogar ganz aus den Argumenten — landet
also ebenfalls sauber im `undefined`-Fall der neuen Wache.

Build (`npm run build`) und der Server-Modul-Ladetest liefen sauber durch,
`git diff --cached` enthielt nur die eine Zeile in `files.js`.

Offen für kommende Nächte:
- Werkstatt-Baustein-Kopf: Typ-Badge (`.baustein-marke`) wirkt dicht neben
  dem Namensfeld, hängt aber am `hat-gefahr`-Zustand und einer bewussten
  Design-Note — beim Anfassen den Gefahr-Zustand mitdenken, nicht nur den
  Rahmen entfernen.
- `POST /api/ausloeser` validiert den Body weiterhin nicht (Datenverlust-
  Risiko bei fehlerhaftem Body, siehe oben) — sinnvoll, sobald die
  Auslöser-Übersicht in der Oberfläche gebaut wird, oder eigenständig davor.
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx.
- Auslöser-Übersicht fehlt ganz in der Oberfläche (`server/ausloeser.js`,
  `server/index.js` GET/POST `/api/ausloeser` sind fertig, UI fehlt).
- `fs_search` meldet echte Fehler pauschal als "(nichts gefunden)".

## 2026-08-11
Erledigt: Werkstatt-Baustein-Kopf beruhigt (`web/src/components/Werkstatt.jsx`) —
im Ruhezustand (vor dem ersten Lauf) zeigte die Takt-Spanne jedes Bausteins die
eigene ID als Platzhaltertext (`<span className="takt-still">{b.id}</span>`),
obwohl dieselbe ID schon als Placeholder im Namensfeld direkt daneben steht.
Reine Wiederholung, die bei mehreren Bausteinen im Ablauf unnötiges Rauschen
erzeugt — genau die Art Überladung, die der Nutzer loswerden will. Jetzt bleibt
die Spanne im Ruhezustand leer, zeigt aber weiterhin Takt/ms/tok sobald ein
Lauf stattgefunden hat.

Drei Vorschläge parallel eingeholt (Oberfläche/Server/Fehlendes), diesen
gewählt, weil er den größten offenen Nutzerwunsch (ruhigere Oberfläche)
direkt trifft, isoliert an einer Stelle bleibt und praktisch kein Bruchrisiko
hat. Die anderen zwei Vorschläge — Typ-Wache in `server/tools/files.js`
`resolve()` (dieselbe TypeError-Falle wie vor dem `dokument.js`-Fix, weiterhin
offen) und `dokument_lesen` um .xlsx erweitern (analog zu docx/pptx, i18n
selbst geprüft: alle sieben Sprachen weiterhin bei 155/155 Schlüsseln,
keine neue Lücke) — sind gute Kandidaten für kommende Nächte.

Prüfer 1 hat Build UND echten Browser-Test (Vite-Build über den Server
serviert, Chromium/Playwright) selbst durchgeführt: Ruhezustand leer, Falten-
Knopf bleibt rechtsbündig, simulierter Takt-Inhalt rendert ohne Layoutbruch.
Dabei einen echten Fehler in meiner eigenen Begründung gefunden: mein
Kommentar behauptete, `margin-left:auto` auf der leeren Spanne halte den
Knopf rechtsbündig — tatsächlich liegt das an `width:100%` auf dem
Namensfeld-Input (global in `web/src/styles.css`), nicht an der Auto-Margin
(per DOM-Test bestätigt: Span entfernt → Knopf blieb exakt an derselben
Stelle). Verhalten war dadurch nie falsch, nur die Begründung im Kommentar —
korrigiert, Kommentar behauptet jetzt keine falsche Kausalität mehr. Prüfer 2
fand keinen echten Fehler (0ms-Takt bleibt korrekt sichtbar, da `takt` als
Objekt geprüft wird, nicht `takt.ms`; einzige Randnotiz: ist ein eigener Name
gesetzt, war die ID vorher zusätzlich im Taktfeld sichtbar, jetzt nirgends
mehr im Kopf — laut Auftrag gewollt, kein Bug).

Offener Fund aus Prüfer 1, nicht behoben (kein Bug, nur fürs Verständnis):
`.baustein-takt { margin-left: auto }` in `web/src/werkstatt.css` greift an
dieser Stelle praktisch nicht — der Input mit `width:100%` frisst den freien
Platz vorher weg. Für künftige Änderungen an dieser Kopfzeile wichtig zu
wissen, damit niemand sich auf die Auto-Margin verlässt, wo sie nicht wirkt.

Unverändert offen aus früheren Nächten:
- `server/tools/files.js`, `resolve()`: fehlende Typ-Wache für `pfad`
  (dieselbe Stelle wie letzte Nacht vermerkt, diesmal von Prüfer-Agent im
  Code bestätigt) — kleiner, sicherer Fix, ein Ort, Muster liegt schon vor.
- `dokument_lesen` deckt weiterhin nur .docx/.pptx ab, nicht .xlsx.
- Auslöser-Übersicht fehlt ganz in der Oberfläche (`server/ausloeser.js`,
  `server/index.js` GET/POST `/api/ausloeser` sind fertig, UI fehlt).
- `fs_search` meldet echte Fehler pauschal als "(nichts gefunden)".
- Werkstatt-Kopfzeile ist entrümpelt, aber die Baustein-Felder darunter
  (Typ-Badge/Namensfeld-Gewichtung) waren in einem der drei heutigen
  Vorschläge auch als unruhig genannt — als nächster kleiner Schritt für
  eine kommende Nacht denkbar, heute bewusst nicht mit angefasst.

## 2026-08-10
Erledigt: `dokument_lesen` in `server/tools/dokument.js` — `dokument.js` konnte
.docx/.pptx bisher nur schreiben (dokument_word/dokument_powerpoint/dokument_excel),
nie lesen. Der Agent stand vor jeder existierenden Word/PowerPoint-Datei des
Nutzers mit leeren Händen. Jetzt entpackt `dokument_lesen` mit `unzip` (schon
vorhanden, keine neue Abhängigkeit) `word/document.xml` bzw. die `ppt/slides/
slideN.xml`-Teile und liest den reinen Text heraus (Regex auf `<w:t>`/`<a:t>`,
XML-Entities zurückgewandelt). Reines Server-Werkzeug ohne UI, darum echte
Dateien über `dokument_word`/`dokument_powerpoint` erzeugt und wieder
gelesen (Umlaute, `& < > " '`, mehrere Folien, interner Zeilenumbruch).

Prüfer 1 (Funktioniert es) fand nichts, Prüfer 2 (Randfälle) fand einen echten
Fehler: `resolve()` — dieselbe Wache wie in `files.js` — prüft den Typ von
`pfad` nicht. Ein leerer, fehlender oder falsch typisierter `pfad` (null,
undefined, Zahl) ließ eine rohe `TypeError` durchbrechen statt einer Meldung.
Behoben mit einer Wache am Anfang von `resolve()` in `dokument.js`
(`typeof p !== 'string' || !p.trim()`) — betrifft dadurch gleich alle vier
Dokument-Werkzeuge. Nachgeprüft: alle vorher abstürzenden Fälle liefern jetzt
`pfad fehlt oder ist kein Text.` statt Stacktrace. Danach nochmal Build und
Round-Trip-Test durchlaufen lassen, beides sauber.

Nebenbei bemerkt: `main` war beim Start dieser Nacht 10 Commits hinter
`origin/main` (u.a. die JARVIS-Oberfläche und `dokument_excel` fehlten lokal).
Erst mit `git fetch` und Fast-Forward aufgeholt, dann die schon fertige
Änderung an `dokument.js` auf den neuen Stand übertragen — sonst wäre
`dokument_excel` beim Push wieder verschwunden.

Offener Fund, nicht behoben (außerhalb vom heutigen Auftrag): `resolve()` in
`server/tools/files.js` hat exakt dieselbe ungeprüfte `p.startsWith(...)`-
Stelle wie `dokument.js` vor der heutigen Änderung — dieselbe TypeError-Falle
gilt dort für `fs_read`/`fs_write`/`fs_edit`/`fs_search`/`fs_glob`. Kleiner,
sicherer Fix für eine der nächsten Nächte (eine Zeile, ein Ort).

Weiterhin offen: `dokument_lesen` deckt nur .docx/.pptx ab, nicht .xlsx
(seit gestern gibt es `dokument_excel` zum Schreiben, aber kein Lesen von
Excel-Dateien zurück). Auch das ZIP+XML, wäre ein naheliegender Anschluss.

Unverändert offen aus früheren Nächten:
- Auslöser-Übersicht fehlt ganz in der Oberfläche (`server/ausloeser.js`,
  `server/index.js` GET/POST `/api/ausloeser` sind fertig, UI fehlt).
- `fs_search` meldet echte Fehler (ungültiges Muster, Programm fehlt, keine
  Rechte) pauschal als "(nichts gefunden)".
- Werkstatt-Ansicht ist mit Abstand die dichteste Stelle in web/src/ — nächster
  Kandidat fürs Ruhiger-Machen, falls nicht schon durch neuere Nächte entschärft.

## 2026-08-09
Erledigt: Werkstatt-Fußleiste entrümpelt (`web/src/components/Werkstatt.jsx`,
`web/src/werkstatt.css`) — bis zu neun Elemente standen in einer Zeile
(Name, Kennung, drei Buttons, Takt, Meldung, Warnung, Bindungs-Hinweis).
Jetzt zwei Zeilen: Handeln oben, Status darunter. Beide Prüfer fanden
denselben echten Fehler — die neue zweizeilige Leiste ist ~85px statt
~60px hoch, `.ablauf-fahne` und `.ablauf-plus` saßen mit altem `bottom:62px`
darunter statt darüber. Behoben (`bottom:92px`), außerdem die Statuszeile
bewusst einzeilig gehalten (kein `flex-wrap`, Ellipsis bei langem Text),
damit die Höhe nie unvorhersagbar wächst. Mit Playwright/Chromium im
echten Browser angesehen (kein Mac nötig, reines Web-UI) — Grundzustand,
volle Statuszeile, "fertig"-Fahne, alle ohne Überlappung bestätigt.
Build lief sauber durch, Server-Modul lädt fehlerfrei.

Nebenbei bemerkt: `HEAD`/`main` waren beim Start dieser Nacht lokal auf
einem alten Stand (5 Commits hinter `origin/main`) — ein `git fetch` hatte
seit dem letzten Push nicht mehr stattgefunden. Mit `git fetch` und
Fast-Forward aufgeholt, bevor committet wurde.

Offene Vorschläge, geprüft und noch nicht angefasst:
- Auslöser-Übersicht fehlt ganz in der Oberfläche: `server/ausloeser.js` und
  die Endpunkte in `server/index.js` (GET/POST `/api/ausloeser`) sind fertig,
  aber der Nutzer sieht einen vom Agenten angelegten Auslöser nirgends und
  kann ihn nicht abschalten oder löschen. `POST /api/ausloeser` prüft den
  Body auch nicht wie das Werkzeug `ausloeser_anlegen` es tut (Art, Zeitformat,
  Ordner). Mittlerer Aufwand (~120-180 Zeilen: neues `web/src/Ausloeser.jsx`,
  Einbindung in `App.jsx`, Validierung in `index.js`) — aus Vorsicht diese
  Nacht nicht angefasst, weil es quer durch Frontend UND Backend geht.
- `dokument_lesen`: `server/tools/dokument.js` kann .docx/.pptx nur
  *schreiben*, nicht lesen — der Agent kann existierende Word/PowerPoint-
  Dateien des Nutzers nicht auslesen/zusammenfassen. Kleiner bis mittlerer
  Aufwand, nur eine Datei betroffen.
- `server/tools/files.js`, `fs_search`: Fehler werden pauschal als
  "(nichts gefunden)" gemeldet, auch wenn `rg`/`grep` wirklich fehlschlägt
  (ungültiges Muster, Programm fehlt, keine Rechte) — sollte unterschieden werden.
- Doppelten Code zusammenführen (noch nicht genauer untersucht, wo).

## 2026-08-08
Erledigt: Chat-Hint-Zeile entrümpelt (`web/src/App.jsx`) — der "Zeiger an/aus"-Knopf
stand dort dauerhaft neben Stimme, Weckwort und HUD, obwohl er nur einmal beim
Einrichten interessiert. Jetzt lebt der Umschalter als Feld "Eigener Zeiger" im
Einstellungen-Dialog, Abschnitt Sprache (`web/src/components/Settings.jsx`).
Prüfer 2 fand dabei einen echten Fehler: der Umschalter reicht dort mitten im
offenen Formular `location.reload()` aus, was ungespeicherte Eingaben (z.B. gerade
eingetippte Schlüssel) weggeworfen hätte. Behoben, indem vor dem Reload erst
`save()` läuft. Build lief danach sauber durch.

Nebenbei bemerkt: `HEAD` war beim Start dieser Nacht vier Commits vor `main`/
`origin/main` losgelöst (detached) — vier fertige Nächte (i18n, Lokales-Gehirn-
Budget, MCP-Anbindung) lagen nur lokal und waren nie gepusht. `main` wurde auf
diesen Stand vorgezogen und zusammen mit der heutigen Änderung gepusht.

Offene Vorschläge, geprüft und noch nicht angefasst:
- Oberfläche weiter beruhigen (web/src/) — nächster Kandidat: die Werkstatt-
  Ansicht wirkt mit 1264 Zeilen JSX / 898 Zeilen CSS am dichtesten.
- `server/tools/files.js`, `fs_search`: Fehler werden pauschal als
  "(nichts gefunden)" gemeldet, auch wenn `rg`/`grep` wirklich fehlschlägt
  (ungültiges Muster, Programm fehlt, keine Rechte) — sollte unterschieden werden.
- Ausloeser-Übersicht fehlt ganz in der Oberfläche: `server/ausloeser.js` und
  die Endpunkte in `server/index.js` sind fertig, aber der Nutzer sieht einen
  vom Agenten angelegten Auslöser nirgends und kann ihn nicht abschalten oder
  löschen. `POST /api/ausloeser` prüft den Body auch nicht wie das Werkzeug.
- Doppelten Code zusammenführen (noch nicht genauer untersucht, wo).

## 2026-08-07
Erledigt: `web/src/i18n.js` — fr, it, pt, tr hatten nur 61 von 153 Textbausteinen
(alles zu Erststart, Tagesbriefing und Einstellungen fehlte, fiel still auf
Englisch zurück). Jetzt haben alle sechs Sprachen exakt dieselben 153 Schlüssel,
per Skript geprüft (keine fehlenden, keine doppelten). Build lief sauber durch.

Offene Vorschläge für kommende Nächte, unverändert aus dem Auftrag:
- Oberfläche ruhiger machen (web/src/) — größter offener Wunsch, ein Bereich pro Nacht.
- Dokument-Werkzeuge in server/tools/: .docx und .pptx erzeugen (ZIP+XML, keine neue Abhängigkeit).
- Stille catch-Blöcke im Server finden und Fehler sichtbar machen.
- Doppelten Code zusammenführen.

Nicht angefasst: alles unter data/ (API-Schlüssel), alles Mac-spezifische
(hier in der Cloud-Umgebung nicht testbar).
