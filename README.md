# URAI

Ein Agent, der auf deinem Mac wirklich handelt. Läuft daheim, kostet nichts.
Er kann sich sogar selbst umbauen.

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

**Text entmaschinen** — `text_messen` zeigt mit Zahlen, was einen Text nach Fließband klingen lässt,
`text_menschlich` schreibt ihn um. Mehr dazu unten.

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

## Text-Humanizer

KI-Prosa liest sich flach. Alle Sätze gleich lang, immer dieselben Übergänge,
immer dieselben Floskeln. Zwei Werkzeuge dagegen — eins misst, eins schreibt um.

`text_messen` rechnet lokal und braucht kein Gehirn. Es zeigt jede Stelle mit Zahl
und Beispiel:

```bash
node vermenschlichen.mjs aufsatz.md
```

```
  100 Wörter · 8 Sätze
  Satzlänge ∅ 12.5 (11–15), Streuung 1.3, Gleichmaß 0.11
  Mittelbau 75 % · Floskeln 11 (110 je 1000 Wörter)

    Zeitgeist-Einstieg: „In der heutigen Zeit"
    Überleitung: „Darüber hinaus"
    Mengen-Floskel: „eine Vielzahl von"

  Auffällig:
    – Satzlängen zu gleichmäßig: ∅ 12.5 Wörter, Streuung nur 1.3 (11–15).
    – 75 % aller Sätze liegen zwischen 12 und 25 Wörtern — es fehlen kurze und lange.
    – Absätze fast gleich lang (∅ 33.3 Wörter, Streuung 7.6).

  Klingt maschinell: 4 Auffälligkeiten, vor allem gleichförmige Sätze und Floskeln.
```

Worauf geschaut wird: **Satzlängen-Gleichmaß** (Streuung im Verhältnis zur Länge —
erst dadurch sind kurze und lange Texte vergleichbar), der **Mittelbau** (Anteil der
Sätze zwischen 12 und 25 Wörtern; hoch heißt: es fehlen die kurzen und die langen),
**Floskeln** nach Art sortiert, wiederholte **Satzanfänge**, **Wortwiederholung**,
**Gedankenstriche** und **Dreier-Aufzählungen**, dazu das **Gleichmaß der Absätze**.

`text_menschlich` gibt diese Messwerte als Auftrag ans Gehirn — nicht ein vages
„mach es menschlicher", sondern die konkreten Stellen:

```bash
node vermenschlichen.mjs aufsatz.md --schreiben --ziel neu.md --ton sachlich
```

Inhalt, Sprache und Länge bleiben; Überschriften, Listen, Zitate und Code auch.
Hinterher stehen die Messwerte von vorher und nachher nebeneinander.

Das ist ein Lektorat-Werkzeug. Es macht Text besser lesbar. Es sagt nichts darüber,
was irgendein Erkennungsdienst hinterher meldet, und verspricht das auch nicht.

## Tipp-Effekt

`tipp_effekt` schreibt Text ins vorderste Fenster — Zeichen für Zeichen, im Rhythmus
einer Hand. Für Screencasts, Demos und Vorführungen, auch in ein offenes
Google-Dokument.

Eine Maschine tippt mit gleichem Abstand, und das sieht sofort falsch aus. Der
Rhythmus hier ist im Wort schnell, stockt vor dem Komma, hält nach dem Punkt an,
macht ab und zu eine Denkpause und wird über die Zeit schneller oder müder.

```
Dauer 10m auf diesen Absatz:
  ∅ im Wort 282 ms · nach Punkt 1338 ms · am Umbruch 1584 ms
```

| Regler | Was er macht |
|---|---|
| `dauer` | Gesamtdauer: `45s`, `10m`, `1h30m` |
| `zeichenProMinute` | statt `dauer` ein festes Tempo (260 ≈ geübte Hand) |
| `probe` | nur schätzen, nichts tippen |
| `saat` | gleicher Wert, gleicher Rhythmus |

Die Wunschdauer streckt oder staucht den fertigen Rhythmus als Ganzes — die Form
bleibt, nur der Maßstab ändert sich. Der rote **Stopp**-Knopf bricht mitten im Text ab.

Zwei Grenzen sind eingebaut. Nach unten: unter ~45 ms je Anschlag verweigert das
Werkzeug, weil ein einzelner Tastendruck das Betriebssystem selbst schon so viel
kostet — dafür gibt es `mac_type`, das alles auf einmal einfügt. Nach oben: vier
Stunden. Was länger läuft, ist kein sichtbarer Tipp-Effekt mehr; dann ist die
Schreibgeschichte des Dokuments das eigentliche Ergebnis, und die wäre erfunden.

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

### Echte Stimme (ElevenLabs)

Die Browser-Stimme klingt blechern. Mit einem ElevenLabs-Schlüssel klingt URAI wie ein Mensch.

Einstellungen → **ElevenLabs-Schlüssel** einfügen → Speichern.
Dann **Stimmen holen**, eine aussuchen, **Anhören** zum Probieren.

Der Schlüssel liegt in `data/config.json` auf dem Server. Die Seite bekommt ihn nie —
sie schickt nur Text an `/api/speak` und bekommt fertiges MP3 zurück.

Ohne Schlüssel spricht weiter der Browser. Geht ElevenLabs mal nicht, schaltet URAI
von selbst zurück auf die Browser-Stimme.

### „Hey URAI"

Schalter unten im Chat oder im Notch-Fenster. Dann lauscht URAI leise mit.
Sagst du **„Hey URAI, mach ein Bildschirmfoto"**, geht alles nach dem Weckwort
als Auftrag raus — ohne Klick.

Die Erkennung hört den Namen selten genau, darum zählen auch „Hey Uray",
„Hey Ur AI" und ähnliches. Der Browser beendet das Lauschen alle paar Minuten
von selbst; URAI fängt dann sofort wieder an.

Nur der Satz nach dem Weckwort verlässt den Browser. Alles davor wird verworfen.

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
  vermenschlichen.js  Text messen und lektorieren
  tippen.js     Tipp-Rhythmus einer Hand
  config.js     Einstellungen
  tools/        files, shell, web, computer, text
web/            React-Oberfläche (Chat links, Live-Auge rechts)
data/           config.json und urai.db — bleibt hier
```
