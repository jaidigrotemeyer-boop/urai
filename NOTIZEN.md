# Notizen für die nächste Nacht

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
