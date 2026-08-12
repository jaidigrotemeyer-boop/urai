# Notizen für die nächste Nacht

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
