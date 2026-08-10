import React, { useEffect, useState } from 'react'
import '../meldungen.css'

/**
 * Die Einblender oben rechts, wenn URAI von sich aus etwas sagt.
 *
 * Absichtlich kein Platz im Gesprächsverlauf: eine Meldung ist keine Antwort
 * auf eine Frage. Stünde sie zwischen den Nachrichten, wäre sie beim nächsten
 * Blick nicht mehr von dem zu unterscheiden, was man selbst angestoßen hat.
 *
 * Sie verschwinden von allein. Wer eine Meldung wegklicken MUSS, hat eine
 * Aufgabe bekommen, keinen Hinweis — und dafür ist das hier nicht gedacht.
 * Nur dringende bleiben stehen, bis man sie ansieht.
 */

const DAUER_MS = 9000

export default function Meldungen({ meldungen, onWeg }) {
  return (
    <div className="mld-stapel" role="status" aria-live="polite">
      {meldungen.map((m) => (
        <Meldung key={m.id} meldung={m} onWeg={() => onWeg(m.id)} />
      ))}
    </div>
  )
}

function Meldung({ meldung, onWeg }) {
  const [raus, setRaus] = useState(false)

  useEffect(() => {
    // Dringendes bleibt stehen. Es kommt selten, und wenn, dann soll man es
    // nicht verpassen, weil man gerade woanders hingesehen hat.
    if (meldung.dringend) return
    const gehen = setTimeout(() => setRaus(true), DAUER_MS)
    const weg = setTimeout(onWeg, DAUER_MS + 400)
    return () => {
      clearTimeout(gehen)
      clearTimeout(weg)
    }
  }, [meldung.dringend, onWeg])

  function schliessen() {
    setRaus(true)
    setTimeout(onWeg, 400)
  }

  return (
    <div className={`mld mld-${meldung.art || 'hinweis'} ${raus ? 'mld-raus' : ''}`}>
      <span className="mld-punkt" aria-hidden="true" />
      <span className="mld-text">{meldung.text}</span>
      <button className="mld-zu" onClick={schliessen} aria-label="Meldung schließen">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
