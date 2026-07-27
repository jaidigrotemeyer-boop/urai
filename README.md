# URAI

Ein Agent, der auf deinem Mac wirklich handelt. Läuft daheim, kostet nichts.

Web-App im Browser — und über den Knopf **Installieren** wird sie eine eigene App im Dock.

## Starten

```bash
cd ~/urai && npm start
```

Dann `http://localhost:3017` öffnen. Nur dein Rechner kommt dran.

Zum Entwickeln (Web neu laden bei jeder Änderung):

```bash
cd ~/urai && npm run dev
```

## Gehirne

Gefragt wird der Reihe nach, das erste das lebt gewinnt:

| Gehirn | Kosten | Schlüssel holen |
|---|---|---|
| Cerebras | gratis, sehr schnell | cloud.cerebras.ai |
| Gemini | gratis | aistudio.google.com/apikey |
| Groq | gratis | console.groq.com/keys |
| OpenRouter | gratis (`:free`-Modelle) | openrouter.ai |
| Ollama daheim | gratis, offline | läuft lokal, kein Schlüssel |

Schlüssel kommen in **Einstellungen** und liegen in `data/config.json` — nur auf diesem Rechner.
Ohne jeden Schlüssel läuft alles mit `llama3.2:3b` daheim; das ist klein und macht mehr Fehler.

Modelle daheim (passen in 8 GB RAM):
`llama3.2:3b` (denken) · `moondream` (Bilder) · `nomic-embed-text` (Gedächtnis)

## Was URAI kann

**Bildschirm lesen und verstehen** — `mac_read_screen` liefert jeden sichtbaren Text mit Klick-Punkt,
dazu die echten Knöpfe und Felder der vordersten App. Text-Erkennung macht Apples Vision-Framework:
eingebaut, offline, ~2 Sekunden.

**Mac steuern** — klicken (am liebsten auf Text: `mac_click_text`), tippen, Tasten, scrollen,
Apps öffnen, AppleScript für Mail/Notes/Kalender/Finder.

**Dateien und Code** — lesen, schreiben, ändern, suchen, Terminal-Befehle.

**Web** — suchen (DuckDuckGo, kein Schlüssel), Seiten lesen, echter Browser über Playwright.

**Agenten-Gruppen** — URAI stellt selbst Teams auf (`agent_team`) oder erschafft einzelne
Helfer (`agent_spawn`). Unter-Agenten dürfen weitere Agenten erschaffen. Ohne Rückfrage.
Fertige Rollen: `rechercheur`, `programmierer`, `bildschirm`, `schreiber`, `pruefer`, `allrounder`.
Grenzen gegen endloses Vermehren: `maxAgentDepth` (3) und `maxAgentsPerRun` (12).

**Obsidian** — alles wird automatisch als Markdown abgelegt:

```
<Vault>/URAI/
  Sitzungen/   ganze Gespräche
  Agenten/     jeder Agenten-Lauf mit Auftrag und Ergebnis
  Gruppen/     Teams mit Mitgliedern und Gesamtergebnis
  Wissen/      was sich URAI gemerkt hat
```

Der Vault wird automatisch aus Obsidians eigener Liste gefunden.

**Gedächtnis** — SQLite plus Vektoren, merkt sich Vorlieben und Projekt-Wissen über Sitzungen hinweg.

## Notch-Fenster

Unten im Chat auf **Notch-Fenster** tippen — oder direkt `localhost:3017/?hud=1`.

Das ist nur die Kapsel: sie zeigt, was URAI gerade tut, wächst beim Arbeiten,
hat Mikrofon und Eingabefeld. Klein halten und oben an den Bildschirmrand schieben,
dann arbeitest du weiter und siehst nebenbei zu.

Leertaste öffnet die Eingabe, Escape schließt sie.

## Stimme

Mikrofon-Knopf links vom Eingabefeld — reden statt tippen.
Der Text erscheint live im Feld und wird abgeschickt, sobald du fertig bist.
URAI liest seine Antwort vor; mit **Stimme aus** schaltest du das ab.

Beides steckt im Browser (Chrome), kostet nichts und braucht keinen Schlüssel.
Aufgenommen wird nichts — nur der erkannte Text.

## Auto-Modus

Standard: **an**. URAI fragt nie, sondern macht. Auch Klicken, Tippen, Schreiben, Terminal.

Nach jedem Auftrag schreibt URAI von selbst eine Zusammenfassung — Auftrag, Gemacht, Ergebnis, Offen.
Sie steht im Chat, oben in der Sitzungsnotiz und als Zeile in `URAI/Übersicht.md`.

Beides lässt sich in den Einstellungen abschalten.

## Sicherheit

Roter **Stopp**-Knopf bricht sofort alles ab, auch alle Unter-Agenten.
Dateizugriff bleibt im eingestellten **Revier** (Standard: dein Home-Ordner).
Wirklich zerstörerische Befehle (`rm -rf /`, `mkfs`, `dd` auf Platten, Fork-Bomben) sind fest gesperrt.
Ist der Auto-Modus aus, fragen gefährliche Werkzeuge vorher — **Immer erlauben** merkt sich die Antwort.

## Erlaubnisse von macOS

Beim ersten Mal fragt macOS. Wenn nicht, hier per Hand geben —
Systemeinstellungen → Datenschutz & Sicherheit:

- **Bildschirmaufnahme** → für `mac_read_screen` und Fotos
- **Bedienungshilfen** → für Klicken, Tippen und den Knopf-Baum

Angehakt wird das Programm, das URAI startet (Terminal oder Claude), danach URAI neu starten.

Optional für genaueres Klicken: `brew install cliclick`

## Ordner

```
server/
  index.js      Server + WebSocket
  agent.js      Agent-Schleife, Freigaben, Unter-Agenten
  brain.js      Gehirn-Wähler (Cerebras/Gemini/Groq/OpenRouter/Ollama)
  crew.js       Agenten-Gruppen und Rollen
  screen.js     Bildschirm lesen (OCR + Knopf-Baum)
  ocr.jxa.js    Apple Vision Text-Erkennung
  obsidian.js   Vault schreiben, lesen, durchsuchen
  memory.js     SQLite + Vektor-Gedächtnis
  config.js     Einstellungen
  tools/        files, shell, web, computer
web/            React-Oberfläche (Chat links, Live-Auge rechts)
data/           config.json und urai.db — bleibt hier
```
