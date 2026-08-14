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

Entscheidend ist, was danach passiert: **die Antwort wird nachgemessen.** Ein
Modell, das „weniger Fließband" hört, liefert oft dieselben Floskeln in neuer
Reihenfolge. Darum zählt hier nicht die Absicht, sondern das Ergebnis.

- Wird es nicht besser, wird noch einmal gefragt — mit dem, was übrig geblieben
  ist. Bis zu drei Runden.
- Behalten wird die **beste** Fassung, nicht die letzte.
- Wird es in keiner Runde besser, sagt Handschrift das, statt eine schlechtere
  Fassung als Erfolg zu verkaufen.

Hinterher stehen die Punkte da: klein ist gut. `212 → 0` heißt, es hat gewirkt.

### Er schaut erst, was für ein Text das ist

Ein Merkblatt aus Stichpunkten will anders lektoriert werden als ein Aufsatz.
Handschrift bestimmt die Art vorher und schreibt sie dem Modell in den Auftrag:

| Art | Was dem Modell gesagt wird |
|---|---|
| **Fließtext** | Bleibt Fließtext — keine Überschriften, keine Aufzählungen einbauen. |
| **Aufzählung** | Bleibt Aufzählung. Jeder Stichpunkt in einer eigenen Zeile. |
| **Mit Überschriften** | Überschriften bleiben, samt Ebene: aus `#` darf kein `###` werden. |
| **Dokument** | Beides bleibt, mit denselben Ebenen und derselben Anzahl. |
| **Mit Code** | Der Code bleibt Zeichen für Zeichen; überarbeitet wird nur der Text drumherum. |

Die erkannte Art steht in der Oberfläche über den Zahlen.

### Damit es nicht komisch aussieht

Ein Modell kann inhaltlich liefern und formal Unsinn bauen. Jede Fassung muss
darum durch fünf Tore, sonst fliegt sie raus und es wird neu gefragt — mit der
Beanstandung als Auftrag:

| Tor | Was auffliegt |
|---|---|
| **Länge** | Unter zwei Dritteln oder über 140 %: zusammengefasst statt lektoriert. |
| **Gerüst** | Überschriften, Listenpunkte und Code-Zäune müssen exakt gleich viele sein — und die Überschriften auf derselben Ebene stehen. |
| **Absätze** | Verlorene Absätze heißt: der Text ist zur Wand zusammengelaufen. |
| **Sprache** | Deutsch rein, Englisch raus — der Klassiker kleiner Modelle. |
| **Ende** | Endet das Original sauber und die Fassung mitten im Satz, war sie abgeschnitten. |

Dazu wird geputzt, was sonst sofort ins Auge fällt: Leerzeichen am Zeilenende,
drei Leerzeilen am Stück, ein als Zitat verpackter Text, krumme
Anführungszeichen in einem Text, der vorher gerade hatte — und vor allem
**Stichpunkte, die nebeneinander statt untereinander landen.** Modelle geben
Listen gern als eine Zeile zurück (`- eins - zwei - drei`); daraus werden wieder
drei Zeilen. Ein Gedankenstrich mitten im Fließtext bleibt dabei in Ruhe, weil
nur Zeilen aufgeteilt werden, die schon mit einem Aufzählungszeichen beginnen.

Über **A−** und **A+** lässt sich der Text größer und kleiner stellen; die
Einstellung bleibt über Neustarts erhalten.

Die verworfenen Runden stehen hinterher in der Oberfläche. Ein langsames
Umschreiben soll nicht wie ein Hänger wirken, sondern zeigen, was aussortiert
wurde.

### Woher das Modell kommt

Läuft **Ollama** auf deinem Rechner, wird es zuerst gefragt — kein Schlüssel,
kein Netz, keine Kosten:

```bash
ollama serve
ollama pull llama3.2:3b
```

Sonst genügt ein Gratis-Schlüssel, einer reicht. Er liegt in
`data/einstellungen.json` auf deinem Rechner:

| Anbieter | Schlüssel holen |
|---|---|
| Gemini | aistudio.google.com/apikey |
| Cerebras | cloud.cerebras.ai |
| Groq | console.groq.com/keys |
| OpenRouter | openrouter.ai |

Messen und Tippen laufen auch ohne beides.

### Warum es keinen Umschreiber ohne Modell gibt

Naheliegend wäre, die Floskeln einfach per Regel zu streichen. Im Deutschen
geht das nicht: „In der heutigen Zeit **spielt** KI eine Rolle." wird dabei zu
„**Spielt** KI eine Rolle." Ein vorangestelltes Adverbial dreht Verb und Subjekt
um, und wer es entfernt, muss zurückdrehen — das braucht Satzbau-Analyse, keine
Ersetzung. Ausprobiert, die Messwerte wurden besser, der Text kaputt. Darum
wieder ausgebaut.

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
  gehirn.js    Umschreiben mit Nachmessen (Ollama oder Gratis-Anbieter)
  config.js    Einstellungen in data/
web/index.html Oberfläche, eine Datei, kein Bauschritt
data/          Schlüssel und Einstellungen — bleibt hier
```

## Prüfen

```bash
node pruefe.mjs
```

Misst flachen gegen lebendigen Text, prüft den Rhythmus, die Dauer-Eingaben,
die Grenzen, den Stopp, die Umschreib-Schleife, alle Form-Tore und die
Textart-Erkennung — 65 Prüfungen, ohne dass eine Taste angeschlagen oder ein
Modell angerufen wird.
