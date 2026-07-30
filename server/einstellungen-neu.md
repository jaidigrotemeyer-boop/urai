# Neue Einstellungen für URAI — Anleitung für den Integrator

Diese Datei ist reine Anleitung. Sie ändert nichts. Sie sagt dir, was du wo einfügst.

Es geht um drei Klassen von Lücken:

1. **Werte, die schon in `DEFAULTS` stehen und vom Server gelesen werden, aber in
   `Settings.jsx` gar nicht auftauchen.** Wer sie verstellen will, muss heute
   `data/config.json` von Hand editieren. Das sind: `brainOrder`, `geminiFastModel`,
   `groqModel`, `openrouterModel`, `elevenModel`, `agentSteps`, `liveTimeoutMs`,
   `liveRemember`. Kostet null Server-Arbeit — reine UI. **Fang damit an.**
2. **Fest verdrahtete Zahlen** in `agent.js`, `brain.js`, `live.js`, `tools/shell.js`,
   `tools/files.js`, `tools/web.js`, `screen.js`, `crew.js`, `self.js`, `graph.js` —
   genau die Dinge, an denen ein Nutzer real dreht: Kontingent-Verbrauch, Timeouts,
   Ausgabe-Deckel, Mehrmonitor.
3. **Ein echter Sicherheitsschalter fehlt komplett.** `self_edit` / `self_patch` /
   `self_restart` können URAI jederzeit umbauen und neu starten. Es gibt keinen
   Aus-Knopf — nicht mal über `autoApprove`, weil `autoMode` ohnehin alles durchwinkt.

---

## Reihenfolge der Arbeit

1. Block aus **Teil 1** in `server/config.js` einfügen.
2. Schlüssel aus **Teil 2** in `server/index.js` ins `allowed`-Array eintragen.
3. JSX-Blöcke aus **Teil 3** in `web/src/components/Settings.jsx` einsetzen,
   Abschnitte laut **Teil 4**.
4. **Jeden neuen Schlüssel zusätzlich in `save()` eintragen** — siehe Teil 5.
   Ohne das wird der Wert beim Speichern stillschweigend verworfen und das Feld
   sieht in der UI aus, als würde es funktionieren.
5. Erst danach die verdrahteten Zahlen im Server durch `loadConfig()`-Werte
   ersetzen — siehe **Teil 6**. Solange das nicht passiert ist, sind die neuen
   Regler Attrappen.

---

## Teil 1 — Block für `DEFAULTS` in `server/config.js`

Einfügen **nach** `agentSteps: 14,` (Zeile 59), noch innerhalb von `const DEFAULTS = {`.
Kommentare erklären, WOFÜR man dreht — nicht, was die Zahl ist.

```js
  // ── Neu: bisher fest im Code verdrahtet ─────────────────────────────

  // Gehirn-Kette: wie hartnäckig URAI ist, wenn ein Anbieter zickt.
  // Wer nur einen Gratis-Schlüssel hat, will lange warten statt aufgeben.
  brainMaxWaitS: 150,      // brain.js MAX_WARTEN_S
  brainPauseMs: 600000,    // brain.js PAUSE_MS — Sperre nach 401/402/403/404
  brainRunden: 3,          // wie oft die ganze Kette durchprobiert wird

  // Kontext-Haushalt. Der größte Hebel gegen "Kontingent aufgebraucht":
  // was vom Werkzeug zurück ins Gehirn geht, kostet bei JEDEM weiteren Zug erneut.
  toolResultMax: 14000,    // agent.js kuerzen()
  kontextFrisch: 4,        // agent.js eindampfen() — letzte N Ergebnisse im Wortlaut
  kontextAltMax: 400,      // ältere Ergebnisse auf so viel stutzen
  recallTreffer: 4,        // agent.js recall() — Gedächtnis-Zeilen pro Auftrag

  // Werkzeug-Grenzen. Der Standard reicht für Kleinkram, nicht für npm install.
  shellTimeoutMs: 120000,  // tools/shell.js
  shellMaxOutput: 100000,  // ab hier wird der Prozess abgeschossen
  fsMaxBytes: 200000,      // tools/files.js MAX_BYTES
  webMaxChars: 20000,      // tools/web.js web_fetch
  webTimeoutMs: 25000,
  browserSichtbar: true,   // false = Playwright headless, für Arbeit im Hintergrund

  // Live-Mitgucken: Genauigkeit gegen Lüfter, und WELCHER Bildschirm.
  // Bei zwei Monitoren guckt URAI sonst dauerhaft auf den falschen.
  bildschirmNummer: 1,     // screen.js capture(), screencapture -D
  liveOcrBreite: 1280,     // höher = liest kleinen Text, kostet Rechenzeit
  liveVorschauBreite: 900, // nur fürs Auge im Fenster
  liveNotizen: 60,         // wie weit live_report zurückblicken kann
  liveStrafeMaxMs: 900000, // Deckel der Verdopplungs-Strafe nach 429

  // Agenten-Gruppen: agent_team startet sonst ALLE Mitglieder gleichzeitig
  // und reißt mit einem Schlag das Minuten-Kontingent.
  maxAgentsParallel: 3,    // crew.js, Promise.all über members

  // Selbstumbau. Die einzige Fähigkeit, mit der URAI sich selbst zerlegen kann —
  // und bisher die einzige ohne Aus-Knopf. autoMode winkt self_* ohnehin durch.
  selbstumbauErlaubt: true,
  selfBuildTimeoutMs: 180000, // self.js npm run build

  // Obsidian-Graph
  graphMaxKnoten: 400,     // graph.js graphLesen()
```

`publicConfig()` gibt mit `...c` alles ungefiltert an die Seite. Keiner der neuen
Werte ist ein Geheimnis — **`mask()` muss also nicht angefasst werden**. Merk dir
die Stelle trotzdem: sobald jemand einen schlüssel-artigen Wert ergänzt, muss er
dort nachgetragen werden, sonst steht er im Klartext im Browser.

---

## Teil 2 — Schlüssel für das `allowed`-Array in `server/index.js`

In `app.post('/api/config', …)`, Zeile 44–52. Die vorhandenen Einträge bleiben
unverändert; diese Zeilen kommen dazu (vor dem schließenden `]`):

```js
    'brainMaxWaitS', 'brainPauseMs', 'brainRunden',
    'toolResultMax', 'kontextFrisch', 'kontextAltMax', 'recallTreffer',
    'shellTimeoutMs', 'shellMaxOutput', 'fsMaxBytes',
    'webMaxChars', 'webTimeoutMs', 'browserSichtbar',
    'bildschirmNummer', 'liveOcrBreite', 'liveVorschauBreite',
    'liveNotizen', 'liveStrafeMaxMs', 'liveTimeoutMs', 'liveRemember',
    'maxAgentsParallel',
    'selbstumbauErlaubt', 'selfBuildTimeoutMs',
    'graphMaxKnoten',
    'geminiFastModel',
```

Schon im `allowed`-Array vorhanden und **nicht** doppelt eintragen:
`brainOrder`, `groqModel`, `openrouterModel`, `elevenModel`, `agentSteps`.
Genau die fehlen nur in der UI — deshalb Teil 3.

---

## Teil 3 — Fertige JSX-Blöcke für `web/src/components/Settings.jsx`

Stil wie die vorhandenen `<div className="field">`-Blöcke: `<label>`, dann
`<input>` bzw. `.chips`, dann optional `<div className="note">`.
Zahlen kommen als String aus dem `<input>` — das ist gewollt, `save()` macht
`Number(...)` daraus.

### 3.1 · Gehirn-Reihenfolge (`brainOrder`)

Sortierbare Chip-Reihe: Klick schiebt einen Anbieter um einen Platz nach vorn.
`brain.js providerChain()` hört genau darauf.

```jsx
        <div className="field">
          <label>Reihenfolge der Gehirne — wer zuerst gefragt wird</label>
          <div className="chips">
            {(cfg.brainOrder || ['gemini', 'cerebras', 'groq', 'openrouter']).map((p, i) => (
              <button
                key={p}
                className={`chip ${i === 0 ? 'on' : ''}`}
                title="Klick schiebt diesen Anbieter einen Platz nach vorn"
                onClick={() => {
                  const reihe = [...(cfg.brainOrder || ['gemini', 'cerebras', 'groq', 'openrouter'])]
                  if (i > 0) [reihe[i - 1], reihe[i]] = [reihe[i], reihe[i - 1]]
                  setCfg({ ...cfg, brainOrder: reihe })
                }}
              >
                {i + 1}. {p}
              </button>
            ))}
          </div>
          <div className="note">
            Von links nach rechts. Fällt einer aus, kommt der nächste dran.
            Klick auf einen Anbieter schiebt ihn nach vorn.
          </div>
        </div>
```

### 3.2 · Flinkes Gemini-Modell (`geminiFastModel`)

```jsx
        <div className="field">
          <label>Gemini-Modell für Kleinkram (flink)</label>
          <input
            value={cfg.geminiFastModel || ''}
            onChange={(e) => setCfg({ ...cfg, geminiFastModel: e.target.value })}
          />
          <div className="note">
            Für Live-Notizen und Zusammenfassungen. Verbraucht den Großteil deines
            Kontingents — hier lohnt das billigste Modell, das noch lesbar antwortet.
          </div>
        </div>
```

### 3.3 · Groq-Modell (`groqModel`)

```jsx
        <div className="field">
          <label>Groq-Modell (Reserve)</label>
          <input value={cfg.groqModel || ''} onChange={(e) => setCfg({ ...cfg, groqModel: e.target.value })} />
        </div>
```

### 3.4 · OpenRouter-Modell (`openrouterModel`)

```jsx
        <div className="field">
          <label>OpenRouter-Modell (Reserve)</label>
          <input
            value={cfg.openrouterModel || ''}
            onChange={(e) => setCfg({ ...cfg, openrouterModel: e.target.value })}
          />
          <div className="note">Endet der Name auf „:free", kostet er nichts — dafür wartest du öfter.</div>
        </div>
```

### 3.5 · Wie lange auf ein pausiertes Gehirn warten (`brainMaxWaitS`)

```jsx
        <div className="field">
          <label>Höchstens warten, bis ein Gehirn wieder darf (Sekunden)</label>
          <input
            type="number"
            value={cfg.brainMaxWaitS ?? 150}
            onChange={(e) => setCfg({ ...cfg, brainMaxWaitS: e.target.value })}
          />
          <div className="note">
            Wer nur einen Gratis-Schlüssel hat, will hier 600 und Geduld.
            Wer schnell eine Antwort will, 30 und dafür öfter eine Fehlermeldung.
          </div>
        </div>
```

### 3.6 · Sperre nach harter Absage (`brainPauseMs`)

```jsx
        <div className="field">
          <label>Gehirn nach harter Absage überspringen für (ms)</label>
          <input
            type="number"
            value={cfg.brainPauseMs ?? 600000}
            onChange={(e) => setCfg({ ...cfg, brainPauseMs: e.target.value })}
          />
          <div className="note">
            Gilt bei falschem oder abgelaufenem Schlüssel. Wer gerade einen Schlüssel
            repariert, will nicht 10 Minuten warten — dann hier 10000 eintragen.
          </div>
        </div>
```

### 3.7 · Runden durch die Kette (`brainRunden`)

```jsx
        <div className="field">
          <label>Wie oft die ganze Gehirn-Kette durchprobiert wird</label>
          <input
            type="number"
            value={cfg.brainRunden ?? 3}
            onChange={(e) => setCfg({ ...cfg, brainRunden: e.target.value })}
          />
          <div className="note">
            Bei knappem Kontingent ist 1 ehrlicher: schnelle Fehlermeldung statt
            Minuten Stille.
          </div>
        </div>
```

### 3.8 · Sprachmodell (`elevenModel`)

```jsx
        <div className="field">
          <label>ElevenLabs-Modell</label>
          <input value={cfg.elevenModel || ''} onChange={(e) => setCfg({ ...cfg, elevenModel: e.target.value })} />
          <div className="note">
            „flash" ist schnell und billig, „multilingual" klingt besser und kostet mehr Zeichen.
          </div>
        </div>
```

Hinweis: Der Stimmen-Block steht in `Settings.jsx` innerhalb von
`{cfg.hasEleven && ( … )}`. Das Modell-Feld gehört **außerhalb** dieser
Bedingung — direkt nach dem Schlüssel-Feld — damit man es auch einstellen kann,
bevor ein Schlüssel gesetzt ist.

### 3.9 · Schritte pro Unter-Agent (`agentSteps`)

```jsx
        <div className="field">
          <label>Schritte pro Unter-Agent (max)</label>
          <input
            type="number"
            value={cfg.agentSteps ?? 14}
            onChange={(e) => setCfg({ ...cfg, agentSteps: e.target.value })}
          />
          <div className="note">
            Bei 12 Agenten entscheidet dieser Wert über den Kontingent-Verbrauch,
            nicht „Schritte pro Auftrag".
          </div>
        </div>
```

### 3.10 · Gleichzeitig laufende Unter-Agenten (`maxAgentsParallel`)

```jsx
        <div className="field">
          <label>Gleichzeitig laufende Unter-Agenten (Deckel)</label>
          <input
            type="number"
            value={cfg.maxAgentsParallel ?? 3}
            onChange={(e) => setCfg({ ...cfg, maxAgentsParallel: e.target.value })}
          />
          <div className="note">
            Eine Gruppe startet sonst alle Mitglieder auf einen Schlag — bei 12
            Agenten sind das 12 gleichzeitige Gehirn-Ströme und garantiert eine Absage.
          </div>
        </div>
```

### 3.11 · Werkzeug-Ausgabe zurück ins Gehirn (`toolResultMax`)

```jsx
        <div className="field">
          <label>Werkzeug-Ausgabe zurück ans Gehirn (Zeichen)</label>
          <input
            type="number"
            value={cfg.toolResultMax ?? 14000}
            onChange={(e) => setCfg({ ...cfg, toolResultMax: e.target.value })}
          />
          <div className="note">
            Der mit Abstand größte einzelne Kontingent-Posten pro Zug. Weniger heißt:
            URAI sieht von langen Dateien nur den Anfang.
          </div>
        </div>
```

### 3.12 · Frische Ergebnisse im Wortlaut (`kontextFrisch`)

```jsx
        <div className="field">
          <label>Wie viele Werkzeug-Ergebnisse im Wortlaut bleiben</label>
          <input
            type="number"
            value={cfg.kontextFrisch ?? 4}
            onChange={(e) => setCfg({ ...cfg, kontextFrisch: e.target.value })}
          />
          <div className="note">
            Die letzten N bleiben vollständig, ältere werden gestutzt. Bei langen
            Aufträgen entscheidet das, ob URAI den Faden verliert oder das Kontingent reißt.
          </div>
        </div>
```

### 3.13 · Alte Ergebnisse eindampfen auf (`kontextAltMax`)

```jsx
        <div className="field">
          <label>Ältere Werkzeug-Ergebnisse eindampfen auf (Zeichen)</label>
          <input
            type="number"
            value={cfg.kontextAltMax ?? 400}
            onChange={(e) => setCfg({ ...cfg, kontextAltMax: e.target.value })}
          />
        </div>
```

### 3.14 · Gedächtnis-Treffer pro Auftrag (`recallTreffer`)

```jsx
        <div className="field">
          <label>Gedächtnis-Einträge, die jeder Auftrag mitbekommt</label>
          <input
            type="number"
            value={cfg.recallTreffer ?? 4}
            onChange={(e) => setCfg({ ...cfg, recallTreffer: e.target.value })}
          />
          <div className="note">Mehr heißt: URAI erinnert sich besser, zahlt aber bei jedem Auftrag dafür.</div>
        </div>
```

### 3.15 · Terminal-Geduld (`shellTimeoutMs`)

```jsx
        <div className="field">
          <label>Terminal: Geduld pro Befehl (ms)</label>
          <input
            type="number"
            value={cfg.shellTimeoutMs ?? 120000}
            onChange={(e) => setCfg({ ...cfg, shellTimeoutMs: e.target.value })}
          />
          <div className="note">
            Ein npm install oder ein Build braucht regelmäßig länger als 2 Minuten und
            wird sonst hart abgeschossen.
          </div>
        </div>
```

### 3.16 · Terminal-Ausgabedeckel (`shellMaxOutput`)

```jsx
        <div className="field">
          <label>Terminal: Ausgabe-Deckel (Zeichen)</label>
          <input
            type="number"
            value={cfg.shellMaxOutput ?? 100000}
            onChange={(e) => setCfg({ ...cfg, shellMaxOutput: e.target.value })}
          />
          <div className="note">Ab hier wird der laufende Prozess abgeschossen.</div>
        </div>
```

### 3.17 · Größte lesbare Datei (`fsMaxBytes`)

```jsx
        <div className="field">
          <label>Größte Datei, die URAI am Stück lesen darf (Bytes)</label>
          <input
            type="number"
            value={cfg.fsMaxBytes ?? 200000}
            onChange={(e) => setCfg({ ...cfg, fsMaxBytes: e.target.value })}
          />
        </div>
```

### 3.18 · Web-Seiten-Deckel (`webMaxChars`)

```jsx
        <div className="field">
          <label>Web: wie viel von einer Seite gelesen wird (Zeichen)</label>
          <input
            type="number"
            value={cfg.webMaxChars ?? 20000}
            onChange={(e) => setCfg({ ...cfg, webMaxChars: e.target.value })}
          />
        </div>
```

### 3.19 · Web-Geduld (`webTimeoutMs`)

```jsx
        <div className="field">
          <label>Web: Geduld beim Abholen (ms)</label>
          <input
            type="number"
            value={cfg.webTimeoutMs ?? 25000}
            onChange={(e) => setCfg({ ...cfg, webTimeoutMs: e.target.value })}
          />
        </div>
```

### 3.20 · Browser sichtbar (`browserSichtbar`)

```jsx
        <div className="field">
          <label>Ferngesteuerter Browser</label>
          <div className="chips">
            <button
              className={`chip ${cfg.browserSichtbar ? 'on' : ''}`}
              onClick={() => setCfg({ ...cfg, browserSichtbar: !cfg.browserSichtbar })}
            >
              {cfg.browserSichtbar ? 'sichtbar — Fenster geht auf' : 'unsichtbar — arbeitet im Hintergrund'}
            </button>
          </div>
          <div className="note">
            Wer URAI nebenbei arbeiten lässt, will das Fenster nicht auf dem Schirm haben.
          </div>
        </div>
```

### 3.21 · Welcher Bildschirm (`bildschirmNummer`)

```jsx
        <div className="field">
          <label>Welcher Bildschirm angeschaut wird</label>
          <input
            type="number"
            value={cfg.bildschirmNummer ?? 1}
            onChange={(e) => setCfg({ ...cfg, bildschirmNummer: e.target.value })}
          />
          <div className="note">
            1 ist der Hauptbildschirm. Bei zwei Monitoren guckt URAI sonst dauerhaft
            auf den falschen. Ziehst du den Monitor ab, hilft nur zurück auf 1.
          </div>
        </div>
```

### 3.22 · Erkennungsbreite und Vorschaubreite (`liveOcrBreite`, `liveVorschauBreite`)

```jsx
        <div className="field">
          <label>Live: Breite für die Text-Erkennung (Pixel)</label>
          <input
            type="number"
            value={cfg.liveOcrBreite ?? 1280}
            onChange={(e) => setCfg({ ...cfg, liveOcrBreite: e.target.value })}
          />
          <div className="note">
            Auf einem 5K-Schirm sind 1280 zu wenig, um kleinen Text zu lesen — mehr
            liest genauer und lässt den Lüfter angehen.
          </div>
        </div>

        <div className="field">
          <label>Live: Breite der Vorschau im Fenster (Pixel)</label>
          <input
            type="number"
            value={cfg.liveVorschauBreite ?? 900}
            onChange={(e) => setCfg({ ...cfg, liveVorschauBreite: e.target.value })}
          />
          <div className="note">Nur fürs Auge. Beeinflusst die Erkennung nicht.</div>
        </div>
```

### 3.23 · Geduld fürs Augen-Modell (`liveTimeoutMs`)

```jsx
        <div className="field">
          <label>Live: Geduld fürs Augen-Modell (ms)</label>
          <input
            type="number"
            value={cfg.liveTimeoutMs ?? 20000}
            onChange={(e) => setCfg({ ...cfg, liveTimeoutMs: e.target.value })}
          />
          <div className="note">Danach gibt URAI diesen Blick auf und schaut beim nächsten Mal wieder.</div>
        </div>
```

### 3.24 · Länge des Live-Gedächtnisses (`liveNotizen`)

```jsx
        <div className="field">
          <label>Live: wie viele Notizen aufgehoben werden</label>
          <input
            type="number"
            value={cfg.liveNotizen ?? 60}
            onChange={(e) => setCfg({ ...cfg, liveNotizen: e.target.value })}
          />
          <div className="note">Bestimmt, wie weit „Was war los?" zurückblicken kann.</div>
        </div>
```

### 3.25 · Wichtiges merken (`liveRemember`)

```jsx
        <div className="field">
          <label>Wichtiges aus dem Gesehenen ins Gedächtnis</label>
          <div className="chips">
            <button
              className={`chip ${cfg.liveRemember ? 'on' : ''}`}
              onClick={() => setCfg({ ...cfg, liveRemember: !cfg.liveRemember })}
            >
              {cfg.liveRemember ? 'an — merkt sich Wichtiges' : 'aus — vergisst alles beim Neustart'}
            </button>
          </div>
          <div className="note">
            Gespeichert wird nur Text. Bildschirmfotos werden immer sofort gelöscht.
          </div>
        </div>
```

### 3.26 · Deckel der Strafzeit (`liveStrafeMaxMs`)

```jsx
        <div className="field">
          <label>Live: längste Strafpause nach einer Absage (ms)</label>
          <input
            type="number"
            value={cfg.liveStrafeMaxMs ?? 900000}
            onChange={(e) => setCfg({ ...cfg, liveStrafeMaxMs: e.target.value })}
          />
          <div className="note">
            Nach einer Absage wartet URAI immer länger. 15 Minuten Funkstille sind viel —
            hier kürzt du das ab.
          </div>
        </div>
```

### 3.27 · Selbstumbau erlauben (`selbstumbauErlaubt`) — **neuer Abschnitt**

```jsx
        <details className="abschnitt">
          <summary>Selbstumbau</summary>

        <div className="field">
          <label>URAI darf seinen eigenen Code ändern</label>
          <div className="chips">
            <button
              className={`chip ${cfg.selbstumbauErlaubt ? 'on' : ''}`}
              onClick={() => setCfg({ ...cfg, selbstumbauErlaubt: !cfg.selbstumbauErlaubt })}
            >
              {cfg.selbstumbauErlaubt ? 'an — darf sich umbauen und neu starten' : 'aus — Code ist gesperrt'}
            </button>
          </div>
          <div className="note">
            Das ist die einzige Fähigkeit, mit der URAI sich selbst kaputt machen kann.
            Der Auto-Modus winkt sie sonst wortlos durch — dieser Schalter ist die
            einzige Bremse.
          </div>
        </div>

        <div className="field">
          <label>Geduld beim eigenen Bauen (ms)</label>
          <input
            type="number"
            value={cfg.selfBuildTimeoutMs ?? 180000}
            onChange={(e) => setCfg({ ...cfg, selfBuildTimeoutMs: e.target.value })}
          />
          <div className="note">
            Auf langsamen Macs reißt der Bau ins Zeitlimit und der Neustart bricht mittendrin ab.
          </div>
        </div>

        </details>
```

### 3.28 · Knoten im Graph (`graphMaxKnoten`)

```jsx
        <div className="field">
          <label>Notizen im 3D-Graph (Obergrenze)</label>
          <input
            type="number"
            value={cfg.graphMaxKnoten ?? 400}
            onChange={(e) => setCfg({ ...cfg, graphMaxKnoten: e.target.value })}
          />
          <div className="note">Mehr Knoten heißt mehr Übersicht und eine ruckelnde Ansicht.</div>
        </div>
```

---

## Teil 4 — In welchen Abschnitt jeder Block gehört

`Settings.jsx` gliedert sich in `<details className="abschnitt">`-Blöcke.
Neue Felder ans **Ende** des jeweiligen Abschnitts, direkt vor `</details>`.

| Abschnitt (`<summary>`) | Blöcke |
|---|---|
| Sprache | — (unverändert) |
| Gehirne und Schlüssel | 3.1 `brainOrder` · 3.2 `geminiFastModel` · 3.3 `groqModel` · 3.4 `openrouterModel` · 3.5 `brainMaxWaitS` · 3.6 `brainPauseMs` · 3.7 `brainRunden` |
| Revier und Verhalten | 3.11 `toolResultMax` · 3.12 `kontextFrisch` · 3.13 `kontextAltMax` · 3.14 `recallTreffer` · 3.15 `shellTimeoutMs` · 3.16 `shellMaxOutput` · 3.17 `fsMaxBytes` · 3.18 `webMaxChars` · 3.19 `webTimeoutMs` · 3.20 `browserSichtbar` |
| Stimme | 3.8 `elevenModel` (außerhalb von `{cfg.hasEleven && …}`) |
| Live-Mitgucken | 3.21 `bildschirmNummer` · 3.22 `liveOcrBreite`, `liveVorschauBreite` · 3.23 `liveTimeoutMs` · 3.24 `liveNotizen` · 3.25 `liveRemember` · 3.26 `liveStrafeMaxMs` |
| Obsidian | 3.28 `graphMaxKnoten` |
| Agenten | 3.9 `agentSteps` · 3.10 `maxAgentsParallel` |
| **Selbstumbau (NEU)** | 3.27 — kompletter `<details>`-Block, einzufügen zwischen „Agenten" und „Werkzeuge ohne Rückfrage" |
| Werkzeuge ohne Rückfrage | — (unverändert) |

Hinweise zur Platzierung in „Gehirne und Schlüssel": Die Modellfelder gehören
neben ihr jeweiliges Schlüsselfeld (Groq-Modell unter den Groq-Schlüssel,
OpenRouter-Modell unter den OpenRouter-Schlüssel, `geminiFastModel` unter
„Gemini-Modell"). Die drei `brain*`-Regler kommen ganz ans Ende des Abschnitts,
unter das Gedächtnis-Modell, denn sie betreffen die Kette als Ganzes.

---

## Teil 5 — `save()` in `Settings.jsx` (Falle Nummer eins)

`save()` baut ab Zeile 27 ein **handgeschriebenes** `patch`-Objekt. Steht ein
Schlüssel dort nicht drin, wird er beim Speichern stillschweigend verworfen —
das Feld sieht in der UI aus, als würde es funktionieren. Genau das ist
`elevenVoice` fast passiert: es steht als Nachtrag in Zeile 47 außerhalb des
Objekts.

Diese Zeilen ins `patch`-Objekt, vor die schließende `}`:

```js
      brainOrder: cfg.brainOrder,
      geminiFastModel: cfg.geminiFastModel,
      groqModel: cfg.groqModel,
      openrouterModel: cfg.openrouterModel,
      elevenModel: cfg.elevenModel,
      brainMaxWaitS: Number(cfg.brainMaxWaitS) || 150,
      brainPauseMs: Number(cfg.brainPauseMs) || 600000,
      brainRunden: Number(cfg.brainRunden) || 3,
      toolResultMax: Number(cfg.toolResultMax) || 14000,
      kontextFrisch: Number(cfg.kontextFrisch) || 4,
      kontextAltMax: Number(cfg.kontextAltMax) || 400,
      recallTreffer: Number(cfg.recallTreffer) || 4,
      shellTimeoutMs: Number(cfg.shellTimeoutMs) || 120000,
      shellMaxOutput: Number(cfg.shellMaxOutput) || 100000,
      fsMaxBytes: Number(cfg.fsMaxBytes) || 200000,
      webMaxChars: Number(cfg.webMaxChars) || 20000,
      webTimeoutMs: Number(cfg.webTimeoutMs) || 25000,
      browserSichtbar: !!cfg.browserSichtbar,
      bildschirmNummer: Number(cfg.bildschirmNummer) || 1,
      liveOcrBreite: Number(cfg.liveOcrBreite) || 1280,
      liveVorschauBreite: Number(cfg.liveVorschauBreite) || 900,
      liveNotizen: Number(cfg.liveNotizen) || 60,
      liveStrafeMaxMs: Number(cfg.liveStrafeMaxMs) || 900000,
      liveTimeoutMs: Number(cfg.liveTimeoutMs) || 20000,
      liveRemember: !!cfg.liveRemember,
      agentSteps: Number(cfg.agentSteps) || 14,
      maxAgentsParallel: Number(cfg.maxAgentsParallel) || 3,
      selbstumbauErlaubt: !!cfg.selbstumbauErlaubt,
      selfBuildTimeoutMs: Number(cfg.selfBuildTimeoutMs) || 180000,
      graphMaxKnoten: Number(cfg.graphMaxKnoten) || 400,
```

Achtung bei den beiden Schaltern: `Number(x) || fallback` würde bei den
Boolean-Werten `browserSichtbar`, `liveRemember` und `selbstumbauErlaubt`
das Ausschalten unmöglich machen (0 ist falsy → Fallback greift). Deshalb dort
`!!cfg.…` und **nicht** das `||`-Muster.

Dasselbe Problem hat jeder Zahlenwert, bei dem 0 eine sinnvolle Eingabe wäre.
Hier ist das nur bei `kontextFrisch` und `recallTreffer` denkbar (0 = „gar
nichts mitgeben"). Wer das erlauben will, schreibt statt `|| 4`:
`Number.isFinite(Number(cfg.kontextFrisch)) ? Number(cfg.kontextFrisch) : 4`.

---

## Teil 6 — Wo im Server die verdrahteten Zahlen ersetzt werden

Ohne diesen Schritt sind die Regler Attrappen. Die Datei ändert nichts davon —
das ist deine Arbeit. Reihenfolge nach Aufwand:

| Einstellung | Datei · Stelle | heute |
|---|---|---|
| `brainMaxWaitS` | `server/brain.js` Zeile 56 `MAX_WARTEN_S` | `150` |
| `brainPauseMs` | `server/brain.js` Zeile 55 `PAUSE_MS` | `10 * 60 * 1000` |
| `brainRunden` | `server/brain.js` Zeile 152 `for (let runde = 0; runde < 3; …)` | `3` |
| `toolResultMax` | `server/agent.js` Zeile 440 `kuerzen(text, 14000)` | `14000` |
| `kontextFrisch` | `server/agent.js` Zeile 120 `eindampfen(messages, frisch = 4)` | `4` |
| `kontextAltMax` | `server/agent.js` Zeile 126 (`400` steht dort **zweimal** in einer Zeile) | `400` |
| `recallTreffer` | `server/agent.js` Zeile 236 `recall(userText, 4)` | `4` |
| `shellTimeoutMs` | `server/tools/shell.js` Zeile 14 `timeout = 120000` | `120000` |
| `shellMaxOutput` | `server/tools/shell.js` Zeile 24 **und** Zeile 35 | `100_000` |
| `fsMaxBytes` | `server/tools/files.js` Zeile 10 `MAX_BYTES` | `200_000` |
| `webMaxChars` | `server/tools/web.js` Zeile 34 `max_chars = 20000` (und Text in Zeile 30) | `20000` |
| `webTimeoutMs` | `server/tools/web.js` Zeile 38 und Zeile 63 | `25000` / `20000` |
| `browserSichtbar` | `server/tools/web.js` Zeile 107 `chromium.launch({ headless: false })` | `false` |
| `bildschirmNummer` | `server/screen.js` Zeile 67 `['-x', '-D', '1', file]` | `'1'` |
| `liveOcrBreite`, `liveVorschauBreite` | `server/live.js` Zeile 75 `capture({ ocrWidth: 1280, viewWidth: 900 })` | `1280` / `900` |
| `liveNotizen` | `server/live.js` Zeile 123 `if (this.notes.length > 60)` | `60` |
| `liveStrafeMaxMs` | `server/live.js` Zeile 192 `Math.min(…, 15 * 60_000)` | `15 * 60_000` |
| `maxAgentsParallel` | `server/crew.js` Zeile 187 `Promise.all(members.map(…))` | unbegrenzt |
| `selfBuildTimeoutMs` | `server/self.js` Zeilen **350, 414, 441** | `180000` |
| `selbstumbauErlaubt` | `server/self.js` — Prüfung am Anfang von `self_edit`, `self_patch`, `self_restart` | fehlt |
| `graphMaxKnoten` | `server/graph.js` Zeile 20 `graphLesen({ maxKnoten = 400 })` | `400` |

`screen.js` hat in `capture()` außerdem eigene Standardwerte
(`ocrWidth = 1600, viewWidth = 1200`, Zeile 61). Die bleiben, wie sie sind —
sie gelten für Einzel-Aufnahmen über `mac_screenshot`, nicht fürs Live-Mitgucken.
`live.js` übergibt seine eigenen Werte und überschreibt sie damit ohnehin.

Für `maxAgentsParallel` reicht kein Einzeiler: `Promise.all` über alle
`members` muss durch eine Schleife ersetzt werden, die immer nur N Stück
gleichzeitig laufen lässt und die Ergebnisse in der ursprünglichen Reihenfolge
zusammensetzt.

---

## Fallen — vor dem Anfassen lesen

1. **Acht Werte sind schon da, nur unsichtbar.** `brainOrder`, `geminiFastModel`,
   `groqModel`, `openrouterModel`, `elevenModel`, `agentSteps`, `liveTimeoutMs`,
   `liveRemember` stehen in `DEFAULTS` und werden vom Server gelesen — sie fehlen
   nur in `Settings.jsx`. Das ist die billigste Verbesserung überhaupt: reine UI,
   kein Server-Code. Mach sie zuerst, dann hast du sofort etwas Sichtbares.
2. **`save()` verwirft alles, was nicht im `patch`-Objekt steht.** Siehe Teil 5.
   Das ist der Fehler, der garantiert passiert, wenn man ihn nicht bewusst vermeidet.
3. **`publicConfig()` gibt mit `...c` alles ungefiltert an die Seite.** Neue
   schlüssel-artige Werte müssten in `mask()` nachgetragen werden, sonst stehen
   sie im Klartext im Browser. Für die Werte hier trifft das nicht zu — für den
   nächsten vielleicht schon.
4. **`shellMaxOutput` steht zweimal** (`tools/shell.js` Zeile 24 in `push()` und
   Zeile 35 in `resolve()`), **`selfBuildTimeoutMs` dreimal** (`self.js` 350, 414,
   441). Wer nur eine Stelle austauscht, bekommt inkonsistentes Verhalten, das
   erst bei langen Builds oder großer Ausgabe auffällt.
5. **Live-Einstellungen greifen erst nach Aus und wieder An.** `liveIntervalMs`
   wird nur in `start()` gelesen und im `setInterval` eingefroren. `tick()` liest
   `loadConfig()` zwar bei jedem Blick frisch, der Timer aber nicht. Jede neue
   Live-Einstellung hat dasselbe Muster: Was in `tick()` gelesen wird, greift
   sofort; was den Timer betrifft, braucht `stop()` + `start()`. Entweder du
   dokumentierst das im `note`-Text, oder du lässt `start()` beim Speichern neu
   laufen.
6. **`selbstumbauErlaubt` reicht als `DEFAULTS`-Eintrag nicht.** `self.js` muss
   den Wert am Anfang von `self_edit`, `self_patch` und `self_restart`
   tatsächlich prüfen und mit einer klaren Meldung abbrechen. Ein Schalter, den
   niemand liest, ist schlimmer als keiner — er suggeriert Sicherheit, die nicht
   da ist.
7. **Finger weg vom Port.** `3017` steht in `index.js` aus `process.env.PORT` und
   in `screen.js` zweimal als Regex `/urai|localhost:3017/i`. Ihn zur Einstellung
   zu machen klingt naheliegend, bricht aber die Selbst-Erkennung: URAI würde
   seine eigenen Fenster nicht mehr ausfiltern und fängt an, sich selbst zu
   kommentieren. Entweder beide Stellen gemeinsam anfassen — oder gar nicht.
8. **`bildschirmNummer` geht an `screencapture -D`.** Zieht der Nutzer den Monitor
   ab, liefert `screencapture` einen Fehler statt eines Bildes. `live.js` stoppt
   sich darüber **nicht** — die Prüfung dort greift nur bei
   `/nicht erlaubt|Erlaubnis/`. URAI läuft dann endlos in denselben Fehler. Wer
   diese Einstellung einbaut, sollte die Fehlerprüfung in `live.js` gleich mit
   erweitern oder nach N Fehlblicken auf Bildschirm 1 zurückfallen.
9. **Bonus-Fehler, der beim Einbauen auffallen wird:** `crew.js` Zeile 100
   schreibt jedem Unter-Agenten `'Antworte auf Deutsch.'` fest ins System,
   obwohl `config.language` existiert und `sprachName()` in `config.js`
   bereitsteht. Wer URAI auf Englisch stellt, bekommt trotzdem deutsche
   Unter-Agenten-Ergebnisse. Das ist keine fehlende Einstellung, sondern ein
   Fehler — Zeile ersetzen durch `` `Antworte auf ${sprachName()}.` `` und den
   Import ergänzen.
