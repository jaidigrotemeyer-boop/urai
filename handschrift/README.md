# Handschrift

Text messen, lektorieren — und Zeichen für Zeichen tippen, im Rhythmus einer Hand.

Läuft auf deinem Rechner. Kein Konto, keine Anmeldung, keine Abhängigkeiten:
`npm install` lädt nichts, weil es nichts zu laden gibt.

## Installieren

Ein Befehl im Terminal. Braucht [Node 20 oder neuer](https://nodejs.org):

```bash
curl -fsSL https://raw.githubusercontent.com/jaidigrotemeyer-boop/handschrift/main/scripts/install.sh | bash
```

Danach liegt **Handschrift.app** im Programme-Ordner und startet per Doppelklick.
Ohne Mac — oder wenn du lieber selbst nachschaust, was läuft:

```bash
git clone https://github.com/jaidigrotemeyer-boop/handschrift.git ~/handschrift
cd ~/handschrift && npm start
```

Dann `http://localhost:3018` öffnen. Nur dein Rechner kommt dran.

## Messen

KI-Prosa liest sich flach. Alle Sätze etwa gleich lang, immer dieselben
Übergänge, immer dieselben Floskeln. **Messen** zeigt jede Stelle mit Zahl und
Beispiel — lokal gerechnet, ohne Netz, ohne Schlüssel.

```bash
node messen.mjs aufsatz.md
```

```
  100 Wörter · 8 Sätze
  Satzlänge ∅ 12.5 (11–15), Streuung 1.3, Gleichmaß 0.10
  Mittelbau 75 % · Floskeln 11 (110 je 1000 Wörter)

    Zeitgeist-Einstieg: „In der heutigen Zeit"
    Überleitung: „Darüber hinaus"
    Mengen-Floskel: „eine Vielzahl von"

  Auffällig:
    – Satzlängen zu gleichmäßig: ∅ 12.5 Wörter, Streuung nur 1.3 (11–15).
    – 75 % aller Sätze liegen zwischen 12 und 25 Wörtern — es fehlen kurze und lange.

  Klingt maschinell: 3 Auffälligkeiten, vor allem gleichförmige Sätze und Floskeln.
```

Worauf geschaut wird:

| Maß | Was es bedeutet |
|---|---|
| **Gleichmaß** | Streuung der Satzlängen im Verhältnis zur Länge. Klein heißt gleichförmig. |
| **Mittelbau** | Anteil der Sätze zwischen 12 und 25 Wörtern. Hoch heißt: es fehlen kurze und lange. |
| **Floskeln** | Nach Art sortiert — Überleitung, Fazit-Floskel, Werbe-Wort, Zeitgeist-Einstieg … |
| **Satzanfänge** | Dasselbe Wort dreimal am Satzanfang erzeugt den Leiern-Ton. |
| **Wortwiederholung** | Inhaltswörter, die zu oft kommen. |
| **Gedankenstriche** | Als Satzzeichen auffällig oft. |
| **Absatz-Gleichmaß** | Ab vier Absätzen: sind alle gleich lang? |

Unter fünf Sätzen sagt die Messung bewusst nichts über Satzlängen. Vier Zahlen
sind keine Verteilung.

## Lektorieren

**Umschreiben** gibt genau diese Funde an ein Sprachmodell weiter — nicht ein
vages „mach es menschlicher", sondern die konkreten Stellen. Inhalt, Sprache und
Länge bleiben; Überschriften, Listen, Zitate und Code auch.

Dafür braucht es einen Gratis-Schlüssel, einer genügt. Er liegt in
`data/einstellungen.json` auf deinem Rechner:

| Anbieter | Schlüssel holen |
|---|---|
| Gemini | aistudio.google.com/apikey |
| Cerebras | cloud.cerebras.ai |
| Groq | console.groq.com/keys |
| OpenRouter | openrouter.ai |

Messen und Tippen laufen auch ohne.

Das ist ein Lektorat-Werkzeug. Es macht Text besser lesbar. Es sagt nichts
darüber, was irgendein Erkennungsdienst hinterher meldet, und verspricht das
auch nicht.

## Tippen

Der Regler stellt die Dauer ein, von zehn Sekunden bis vier Stunden. Dann läuft
ein Vorlauf — Zeit, ins Zielfenster zu klicken — und Handschrift tippt Zeichen
für Zeichen hinein: in ein Google-Dokument, einen Editor, ein Textfeld.

Eine Maschine tippt mit gleichem Abstand, und das sieht sofort falsch aus. Hier
ist der Rhythmus im Wort schnell, stockt vor dem Komma, hält nach dem Punkt an,
macht ab und zu eine Denkpause und wird über den Text schneller oder müder.

```
∅ im Wort 282 ms · nach Punkt 1338 ms · am Umbruch 1584 ms
```

**Stopp** hält jederzeit an.

Zwei Grenzen sind eingebaut. Nach unten: unter ~45 ms je Anschlag verweigert
Handschrift, weil ein einzelner Tastendruck das Betriebssystem selbst schon so
viel kostet. Nach oben: vier Stunden. Was länger läuft, ist kein sichtbarer
Tipp-Effekt mehr; dann ist die Schreibgeschichte des Dokuments das eigentliche
Ergebnis, und die wäre erfunden. Dafür ist Handschrift nicht gebaut.

**macOS** fragt beim ersten Tippen nach *Bedienungshilfen* — ohne die Erlaubnis
kommt kein Zeichen an. Schneller tippt es mit `brew install cliclick`.
**Windows** tippt über PowerShell, **Linux** über `xdotool`.

## Ordner

```
server/
  index.js     kleiner HTTP-Server, nur node:http
  messen.js    die Messung — reine Rechnung, kein Netz
  tippen.js    der Tipp-Rhythmus — reine Rechnung, keine Tastatur
  schreiben.js schlägt die Tasten an (macOS, Windows, Linux)
  gehirn.js    Umschreiben über einen Gratis-Anbieter
  config.js    Einstellungen in data/
web/index.html Oberfläche, eine Datei, kein Bauschritt
data/          Schlüssel und Einstellungen — bleibt hier
```

## Prüfen

```bash
node pruefe.mjs
```

Misst flachen gegen lebendigen Text, prüft den Rhythmus, die Dauer-Eingaben,
die Grenzen und den Stopp — 22 Prüfungen, ohne dass eine Taste angeschlagen wird.
