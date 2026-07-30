import React, { useEffect, useState } from 'react'
import { t, SPRACHEN, sprache, setzeSprache, useSprache } from '../i18n.js'

export default function Settings({ onClose, onSaved }) {
  useSprache()
  const [cfg, setCfg] = useState(null)
  const [tools, setTools] = useState([])
  const [keys, setKeys] = useState({ geminiKey: '', cerebrasKey: '', groqKey: '', openrouterKey: '', elevenKey: '' })
  const [stimmen, setStimmen] = useState(null)
  const [probeLaeuft, setProbeLaeuft] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then((s) => setCfg(s.config))
    fetch('/api/tools').then((r) => r.json()).then((t) => setTools(t.tools))
  }, [])

  if (!cfg) return null

  const toggleAuto = (name) => {
    const on = cfg.autoApprove.includes(name)
    setCfg({ ...cfg, autoApprove: on ? cfg.autoApprove.filter((t) => t !== name) : [...cfg.autoApprove, name] })
  }

  async function save() {
    setSaving(true)
    const patch = {
      geminiModel: cfg.geminiModel,
      cerebrasModel: cfg.cerebrasModel,
      workspace: cfg.workspace,
      maxSteps: Number(cfg.maxSteps) || 24,
      embedModel: cfg.embedModel,
      language: sprache(),
      autoApprove: cfg.autoApprove,
      autoMode: cfg.autoMode,
      autoSummary: cfg.autoSummary,
      liveMode: cfg.liveMode,
      liveIntervalMs: Number(cfg.liveIntervalMs) || 2500,
      liveTalkGapMs: Number(cfg.liveTalkGapMs) || 25000,
      liveMaxPerHour: Number(cfg.liveMaxPerHour) || 80,
      obsidianVault: cfg.obsidianVault,
      obsidianFolder: cfg.obsidianFolder,
      obsidianAuto: cfg.obsidianAuto,
      maxAgentDepth: Number(cfg.maxAgentDepth) || 3,
      maxAgentsPerRun: Number(cfg.maxAgentsPerRun) || 12,
    }

    // Feineinstellung: alles, was vorher fest im Code stand.
    // Zahlenfelder liefern Strings — hier werden sie zu echten Zahlen,
    // sonst landet "14000" als Text in der Konfiguration und Vergleiche kippen.
    const ZAHLEN = [
      'brainMaxWaitS', 'brainPauseMs', 'brainRunden',
      'toolResultMax', 'kontextFrisch', 'kontextAltMax', 'recallTreffer',
      'shellTimeoutMs', 'shellMaxOutput', 'fsMaxBytes',
      'webMaxChars', 'webTimeoutMs',
      'bildschirmNummer', 'liveOcrBreite', 'liveVorschauBreite',
      'liveNotizen', 'liveStrafeMaxMs', 'liveTimeoutMs',
      'maxAgentsParallel', 'selfBuildTimeoutMs', 'graphMaxKnoten', 'agentSteps',
    ]
    for (const k of ZAHLEN) if (cfg[k] !== undefined && cfg[k] !== '') patch[k] = Number(cfg[k])

    const SCHALTER = ['browserSichtbar', 'selbstumbauErlaubt', 'liveRemember']
    for (const k of SCHALTER) if (cfg[k] !== undefined) patch[k] = !!cfg[k]

    const TEXTE = ['brainOrder', 'geminiFastModel', 'groqModel', 'openrouterModel', 'elevenModel']
    for (const k of TEXTE) if (cfg[k] !== undefined) patch[k] = cfg[k]
    patch.elevenVoice = cfg.elevenVoice
    for (const k of ['geminiKey', 'cerebrasKey', 'groqKey', 'openrouterKey', 'elevenKey'])
      if (keys[k].trim()) patch[k] = keys[k].trim()
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const next = await res.json()
    setSaving(false)
    onSaved?.(next)
    onClose()
  }

  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-card">
        <h3>{t('settings')}</h3>
        <div className="sub">{t('setLocal')}</div>

        <details className="abschnitt" open>
          <summary>Sprache</summary>

        <div className="field">
          <label>{t('language')}</label>
          <div className="chips">
            {Object.entries(SPRACHEN).map(([code, name]) => (
              <button
                key={code}
                className={`chip ${sprache() === code ? 'on' : ''}`}
                onClick={() => {
                  setzeSprache(code)
                  setCfg({ ...cfg, language: code })
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="note">Gilt für die Oberfläche und für URAIs Antworten.</div>
        </div>

        </details>

        <details className="abschnitt">
          <summary>Gehirne und Schlüssel</summary>

        <div className="field">
          <label>
            Cerebras-Schlüssel {cfg.hasCerebras && <span style={{ color: 'var(--accent)' }}>· gesetzt {cfg.cerebrasKey}</span>}
          </label>
          <input
            type="password"
            placeholder={cfg.hasCerebras ? 'neuen Schlüssel eintippen zum Ersetzen' : 'csk-…'}
            value={keys.cerebrasKey}
            onChange={(e) => setKeys({ ...keys, cerebrasKey: e.target.value })}
          />
          <div className="note">
            Gratis holen bei <a href="https://cloud.cerebras.ai" target="_blank" rel="noreferrer">cloud.cerebras.ai</a> — sehr
            schnell, wird zuerst gefragt.
          </div>
        </div>

        <div className="field">
          <label>Cerebras-Modell</label>
          <input value={cfg.cerebrasModel || ''} onChange={(e) => setCfg({ ...cfg, cerebrasModel: e.target.value })} />
        </div>

        <div className="field">
          <label>Gemini-Schlüssel {cfg.hasGemini && <span style={{ color: 'var(--accent)' }}>· gesetzt {cfg.geminiKey}</span>}</label>
          <input
            type="password"
            placeholder={cfg.hasGemini ? 'neuen Schlüssel eintippen zum Ersetzen' : 'AIza…'}
            value={keys.geminiKey}
            onChange={(e) => setKeys({ ...keys, geminiKey: e.target.value })}
          />
          <div className="note">
            Gratis holen bei <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>
          </div>
        </div>

        <div className="field">
          <label>Groq-Schlüssel (Reserve) {cfg.hasGroq && <span style={{ color: 'var(--accent)' }}>· gesetzt</span>}</label>
          <input
            type="password"
            placeholder="gsk_…"
            value={keys.groqKey}
            onChange={(e) => setKeys({ ...keys, groqKey: e.target.value })}
          />
          <div className="note">
            Gratis bei <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>
          </div>
        </div>

        <div className="field">
          <label>OpenRouter-Schlüssel (Reserve) {cfg.hasOpenrouter && <span style={{ color: 'var(--accent)' }}>· gesetzt</span>}</label>
          <input
            type="password"
            placeholder="sk-or-…"
            value={keys.openrouterKey}
            onChange={(e) => setKeys({ ...keys, openrouterKey: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Gemini-Modell</label>
          <input value={cfg.geminiModel} onChange={(e) => setCfg({ ...cfg, geminiModel: e.target.value })} />
        </div>

        <div className="field">
          <label>Modell fürs Gedächtnis (Gemini-Vektoren)</label>
          <input value={cfg.embedModel || ''} onChange={(e) => setCfg({ ...cfg, embedModel: e.target.value })} />
        </div>

        </details>

        <details className="abschnitt">
          <summary>Revier und Verhalten</summary>

        <div className="field">
          <label>Revier — hier darf URAI Dateien anfassen</label>
          <input value={cfg.workspace} onChange={(e) => setCfg({ ...cfg, workspace: e.target.value })} />
        </div>

        <div className="field">
          <label>Auto-Modus</label>
          <div className="chips">
            <button className={`chip ${cfg.autoMode ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, autoMode: !cfg.autoMode })}>
              {cfg.autoMode ? 'an — macht alles ohne zu fragen' : 'aus — fragt bei gefährlichen Werkzeugen'}
            </button>
            <button
              className={`chip ${cfg.autoSummary ? 'on' : ''}`}
              onClick={() => setCfg({ ...cfg, autoSummary: !cfg.autoSummary })}
            >
              {cfg.autoSummary ? 'Zusammenfassung: an' : 'Zusammenfassung: aus'}
            </button>
          </div>
          <div className="note">Der Stopp-Knopf bricht auch im Auto-Modus sofort alles ab.</div>
        </div>

        </details>

        <details className="abschnitt">
          <summary>Stimme</summary>

        <div className="field">
          <label>
            ElevenLabs-Schlüssel — echte Stimme{' '}
            {cfg.hasEleven && <span style={{ color: 'var(--accent)' }}>· gesetzt {cfg.elevenKey}</span>}
          </label>
          <input
            type="password"
            placeholder={cfg.hasEleven ? 'neuen Schlüssel eintippen zum Ersetzen' : 'sk_…'}
            value={keys.elevenKey}
            onChange={(e) => setKeys({ ...keys, elevenKey: e.target.value })}
          />
          <div className="note">
            Ohne Schlüssel spricht der Browser selbst — kostet nichts, klingt aber blechern.
            Schlüssel holen bei <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">elevenlabs.io</a>.
            Er bleibt auf dem Server und geht nie an diese Seite.
          </div>
        </div>

        {cfg.hasEleven && (
          <div className="field">
            <label>Stimme</label>
            <div className="chips">
              <button
                className="chip"
                onClick={async () => {
                  setStimmen('lade')
                  const r = await fetch('/api/voices').then((x) => x.json())
                  setStimmen(r.ok ? r.stimmen : [])
                  if (!r.ok) alert(r.fehler)
                }}
              >
                {stimmen === 'lade' ? 'lädt…' : 'Stimmen holen'}
              </button>
              <button
                className="chip"
                disabled={probeLaeuft}
                onClick={async () => {
                  setProbeLaeuft(true)
                  try {
                    const r = await fetch('/api/speak', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ text: 'Hallo, ich bin URAI.', voice: cfg.elevenVoice }),
                    })
                    if (!r.ok) throw new Error((await r.json()).fehler)
                    new Audio(URL.createObjectURL(await r.blob())).play()
                  } catch (e) {
                    alert(e.message)
                  }
                  setProbeLaeuft(false)
                }}
              >
                {probeLaeuft ? '…' : 'Anhören'}
              </button>
            </div>

            {Array.isArray(stimmen) && stimmen.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {stimmen.map((s) => (
                  <button
                    key={s.id}
                    className={`chip ${cfg.elevenVoice === s.id ? 'on' : ''}`}
                    title={s.art}
                    onClick={() => setCfg({ ...cfg, elevenVoice: s.id })}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            <input
              style={{ marginTop: 8 }}
              value={cfg.elevenVoice || ''}
              onChange={(e) => setCfg({ ...cfg, elevenVoice: e.target.value })}
            />
            <div className="note">Stimmen-Kennung. Über „Stimmen holen" bekommst du die Liste deines Kontos.</div>
          </div>
        )}

        </details>

        <details className="abschnitt">
          <summary>Live-Mitgucken</summary>

        <div className="field">
          <label>Live-Mitgucken</label>
          <div className="chips">
            <button className={`chip ${cfg.liveMode ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, liveMode: !cfg.liveMode })}>
              {cfg.liveMode ? 'an — guckt immer mit' : 'aus'}
            </button>
          </div>
          <div className="note">
            Alle {(cfg.liveIntervalMs || 2500) / 1000}s ein Blick — das ist gratis, Text-Erkennung läuft lokal.
            <br />
            Das Gehirn wird höchstens alle {(cfg.liveTalkGapMs || 25000) / 1000}s gefragt, maximal{' '}
            {cfg.liveMaxPerHour || 80}× pro Stunde. Zu oft fragen frisst dein Gratis-Kontingent.
          </div>
        </div>

        <div className="field">
          <label>Live: wie oft hinschauen (ms)</label>
          <input
            type="number"
            value={cfg.liveIntervalMs ?? 3000}
            onChange={(e) => setCfg({ ...cfg, liveIntervalMs: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Live: wie oft höchstens das Gehirn fragen (ms)</label>
          <input
            type="number"
            value={cfg.liveTalkGapMs ?? 25000}
            onChange={(e) => setCfg({ ...cfg, liveTalkGapMs: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Live: Gehirn-Fragen pro Stunde (Obergrenze)</label>
          <input
            type="number"
            value={cfg.liveMaxPerHour ?? 80}
            onChange={(e) => setCfg({ ...cfg, liveMaxPerHour: e.target.value })}
          />
        </div>

        </details>

        <details className="abschnitt">
          <summary>Obsidian</summary>

        <div className="field">
          <label>Obsidian-Vault — hier landet alles automatisch</label>
          <input
            value={cfg.obsidianVault || ''}
            placeholder="wird automatisch gefunden"
            onChange={(e) => setCfg({ ...cfg, obsidianVault: e.target.value })}
          />
          <div className="note">Unterordner: {cfg.obsidianFolder || 'URAI'} → Sitzungen, Agenten, Gruppen, Wissen</div>
        </div>

        <div className="field">
          <label>Automatisch mitschreiben</label>
          <div className="chips">
            <button
              className={`chip ${cfg.obsidianAuto ? 'on' : ''}`}
              onClick={() => setCfg({ ...cfg, obsidianAuto: !cfg.obsidianAuto })}
            >
              {cfg.obsidianAuto ? 'an — alles geht nach Obsidian' : 'aus'}
            </button>
          </div>
        </div>

        </details>

        <details className="abschnitt">
          <summary>Agenten</summary>

        <div className="field">
          <label>Agenten dürfen Agenten erschaffen — wie tief?</label>
          <input
            type="number"
            value={cfg.maxAgentDepth ?? 3}
            onChange={(e) => setCfg({ ...cfg, maxAgentDepth: e.target.value })}
          />
          <div className="note">Ebenen tief. 0 = keine Unter-Agenten.</div>
        </div>

        <div className="field">
          <label>Agenten pro Auftrag (Notbremse)</label>
          <input
            type="number"
            value={cfg.maxAgentsPerRun ?? 12}
            onChange={(e) => setCfg({ ...cfg, maxAgentsPerRun: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Schritte pro Auftrag (max)</label>
          <input type="number" value={cfg.maxSteps} onChange={(e) => setCfg({ ...cfg, maxSteps: e.target.value })} />
        </div>

        </details>

        <details className="abschnitt">
          <summary>Feineinstellung</summary>

          <div className="field">
            <label>Reihenfolge der Gehirne — antippen schiebt nach vorn</label>
            <div className="chips">
              {(cfg.brainOrder || ['gemini', 'cerebras', 'groq', 'openrouter']).map((p, i) => (
                <button
                  key={p}
                  className={`chip ${i === 0 ? 'on' : ''}`}
                  onClick={() => {
                    const o = [...(cfg.brainOrder || ['gemini', 'cerebras', 'groq', 'openrouter'])]
                    if (i > 0) [o[i - 1], o[i]] = [o[i], o[i - 1]]
                    setCfg({ ...cfg, brainOrder: o })
                  }}
                >
                  {i + 1}. {p}
                </button>
              ))}
            </div>
            <div className="note">Nur wer einen Schlüssel hat, kommt überhaupt in die Kette.</div>
          </div>

          {[
            ['toolResultMax', 'Werkzeug-Ergebnis: Zeichen zurück ins Gehirn', 'Der größte Hebel gegen aufgebrauchtes Kontingent — jedes Zeichen kostet bei jedem weiteren Zug erneut.'],
            ['kontextFrisch', 'Wie viele Ergebnisse im Wortlaut bleiben', 'Ältere werden gestutzt.'],
            ['kontextAltMax', 'Ältere Ergebnisse stutzen auf … Zeichen', ''],
            ['recallTreffer', 'Gedächtnis-Zeilen pro Auftrag', ''],
            ['brainMaxWaitS', 'Höchstens warten, wenn alle Gehirne dicht sind (s)', 'Danach gibt URAI auf statt dich hinzuhalten.'],
            ['brainPauseMs', 'Sperre nach harter Absage (ms)', 'Schlüssel falsch, Geld alle, Modell weg.'],
            ['brainRunden', 'Wie oft die ganze Kette durchprobiert wird', ''],
            ['shellTimeoutMs', 'Terminal-Befehl: Abbruch nach (ms)', 'npm install braucht mehr als zwei Minuten.'],
            ['shellMaxOutput', 'Terminal-Ausgabe: Zeichen bis Abbruch', ''],
            ['fsMaxBytes', 'Datei lesen: Bytes bis Verweigerung', ''],
            ['webMaxChars', 'Webseite: Zeichen die gelesen werden', ''],
            ['webTimeoutMs', 'Webseite: Abbruch nach (ms)', ''],
            ['bildschirmNummer', 'Welcher Bildschirm', 'Bei zwei Monitoren guckt URAI sonst dauerhaft auf den falschen.'],
            ['liveOcrBreite', 'Live: Bildbreite für die Texterkennung', 'Höher liest kleinen Text, kostet Rechenzeit.'],
            ['liveVorschauBreite', 'Live: Bildbreite fürs Fenster', ''],
            ['liveNotizen', 'Live: wie weit zurückgeblickt wird', ''],
            ['liveStrafeMaxMs', 'Live: längste Pause nach Kontingent-Absage (ms)', ''],
            ['liveTimeoutMs', 'Live: Abbruch beim Hinschauen (ms)', ''],
            ['maxAgentsParallel', 'Agenten gleichzeitig in einer Gruppe', 'Alle auf einmal reißen das Minuten-Kontingent.'],
            ['agentSteps', 'Schritte pro Unter-Agent', ''],
            ['selfBuildTimeoutMs', 'Selbstumbau: Abbruch beim Bauen (ms)', ''],
            ['graphMaxKnoten', 'Graph: höchstens so viele Notizen', ''],
          ].map(([k, label, note]) => (
            <div className="field" key={k}>
              <label>{label}</label>
              <input type="number" value={cfg[k] ?? ''} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
              {note && <div className="note">{note}</div>}
            </div>
          ))}

          <div className="field">
            <label>Schalter</label>
            <div className="chips">
              {[
                ['selbstumbauErlaubt', 'Selbstumbau'],
                ['browserSichtbar', 'Browser sichtbar'],
                ['liveRemember', 'Live merkt sich Wichtiges'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={`chip ${cfg[k] ? 'on' : ''}`}
                  onClick={() => setCfg({ ...cfg, [k]: !cfg[k] })}
                >
                  {label}: {cfg[k] ? t('on') : t('off')}
                </button>
              ))}
            </div>
            <div className="note">
              Selbstumbau aus heißt: self_edit, self_patch, self_write und self_restart verweigern den Dienst.
              Das ist die einzige Fähigkeit, mit der URAI sich selbst zerlegen kann.
            </div>
          </div>

          <div className="field">
            <label>Flinkes Gemini-Modell (Zusammenfassungen, Live-Notizen)</label>
            <input
              value={cfg.geminiFastModel || ''}
              onChange={(e) => setCfg({ ...cfg, geminiFastModel: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Groq-Modell</label>
            <input value={cfg.groqModel || ''} onChange={(e) => setCfg({ ...cfg, groqModel: e.target.value })} />
          </div>

          <div className="field">
            <label>OpenRouter-Modell</label>
            <input
              value={cfg.openrouterModel || ''}
              onChange={(e) => setCfg({ ...cfg, openrouterModel: e.target.value })}
            />
            <div className="note">Leer lassen: URAI sucht sich selbst das beste Gratis-Modell mit Werkzeugen.</div>
          </div>

          <div className="field">
            <label>ElevenLabs-Modell</label>
            <input value={cfg.elevenModel || ''} onChange={(e) => setCfg({ ...cfg, elevenModel: e.target.value })} />
          </div>

          <div className="note">
            Live-Einstellungen greifen erst nach Aus und wieder An — der Zeitgeber liest sie nur beim Start.
          </div>
        </details>

        <details className="abschnitt">
          <summary>Werkzeuge ohne Rückfrage</summary>

        <div className="field">
          <label>Ohne Rückfrage erlauben — Rot = fragt sonst immer</label>
          <div className="chips">
            {tools.map((t) => (
              <button
                key={t.name}
                className={`chip ${cfg.autoApprove.includes(t.name) ? 'on' : ''}`}
                title={t.description}
                onClick={() => toggleAuto(t.name)}
              >
                {t.danger ? '⚠︎ ' : ''}
                {t.name}
              </button>
            ))}
          </div>
        </div>

        </details>

        <div className="sheet-actions">
          <button onClick={onClose}>{t('cancel')}</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
