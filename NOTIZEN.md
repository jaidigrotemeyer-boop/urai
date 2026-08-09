# Notizen für die nächste Nacht

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
