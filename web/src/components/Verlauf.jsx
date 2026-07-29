import React, { useEffect, useState } from 'react'
import { t } from '../i18n.js'

/**
 * Alte Gespräche: jede Sitzung, die je gelaufen ist.
 * Anklicken holt sie zurück in den Chat — mit allem, was damals passiert ist.
 */
export default function Verlauf({ onOeffnen, onClose, jetzige }) {
  const [liste, setListe] = useState(null)
  const [suche, setSuche] = useState('')

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then(setListe)
      .catch(() => setListe([]))
  }, [])

  const datum = (ms) => {
    const d = new Date(ms)
    const p = (v) => String(v).padStart(2, '0')
    const heute = new Date()
    const gleicherTag = d.toDateString() === heute.toDateString()
    return gleicherTag ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${p(d.getDate())}.${p(d.getMonth() + 1)}.`
  }

  const gefiltert = (liste || []).filter(
    (s) => !suche.trim() || (s.first || s.session).toLowerCase().includes(suche.toLowerCase())
  )

  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-card">
        <h3>Alte Gespräche</h3>
        <div className="sub">Anklicken holt eins zurück. Es geht dort weiter, wo ihr aufgehört habt.</div>

        <div className="field">
          <input placeholder="Suchen…" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>

        {liste === null && <div className="empty">{t('loading')}</div>}
        {liste !== null && gefiltert.length === 0 && <div className="empty">Noch keine Gespräche.</div>}

        <div className="verlauf">
          {gefiltert.map((s) => (
            <button
              key={s.session}
              className={`verlauf-zeile ${s.session === jetzige ? 'jetzt' : ''}`}
              onClick={() => onOeffnen(s.session)}
            >
              <span className="verlauf-zeit">{datum(s.last)}</span>
              <span className="verlauf-text">{s.first || s.session}</span>
              <span className="chip-mini">{s.n}</span>
            </button>
          ))}
        </div>

        <div className="sheet-actions">
          <button onClick={onClose}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}
