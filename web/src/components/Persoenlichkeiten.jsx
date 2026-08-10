import React, { useEffect, useState } from 'react'
import '../persoenlichkeiten.css'

/**
 * Auswahl, wie URAI spricht.
 *
 * Die Liste kommt vom Server und wird hier NICHT nochmal geführt. Eine zweite
 * Liste im Frontend wäre der sichere Weg dahin, dass die Auswahl etwas anderes
 * verspricht als der Systemprompt tut.
 */
export default function Persoenlichkeiten({ cfg, setCfg }) {
  const [liste, setListe] = useState([])
  const [fehler, setFehler] = useState(null)

  useEffect(() => {
    fetch('/api/persoenlichkeiten')
      .then((r) => r.json())
      .then(setListe)
      .catch(() => setFehler('Die fertigen Persönlichkeiten ließen sich nicht laden.'))
  }, [])

  const gewaehlt = cfg.persoenlichkeit || 'assistent'
  const eigen = cfg.persoenlichkeitEigen || ''

  return (
    <div className="prs">
      <div className="note prs-vorwort">
        Bestimmt nur den <strong>Ton</strong> — wie URAI formuliert. Was er darf und wann er vor
        heiklen Schritten nachfragt, hängt bewusst nicht daran. Sonst könnte man sich mit „red frei
        heraus" aus den Rückfragen herausreden.
      </div>

      {fehler && <div className="prs-fehler">{fehler}</div>}

      <div className="prs-gitter">
        {liste.map((p) => (
          <button
            key={p.id}
            className={`prs-karte ${gewaehlt === p.id ? 'prs-an' : ''}`}
            onClick={() => setCfg({ ...cfg, persoenlichkeit: p.id })}
          >
            <span className="prs-name">{p.name}</span>
            <span className="prs-text">{p.beschreibung}</span>
          </button>
        ))}
      </div>

      <div className="field prs-eigen">
        <label>Eigene Anweisung</label>
        <textarea
          rows={4}
          maxLength={1200}
          placeholder={'z.B. „Antworte immer auf Schweizerdeutsch." oder „Nenn mich Chef."'}
          value={eigen}
          onChange={(e) => setCfg({ ...cfg, persoenlichkeitEigen: e.target.value })}
        />
        <div className="prs-zaehler">{eigen.length}/1200</div>
        <div className="note">
          Kommt <em>zusätzlich</em> zur gewählten Persönlichkeit und schlägt sie im Zweifel. Leer
          lassen, wenn die fertige reicht.
        </div>
      </div>
    </div>
  )
}
