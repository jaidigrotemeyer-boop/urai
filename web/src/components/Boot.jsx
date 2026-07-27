import React, { useEffect, useState } from 'react'

/**
 * Erwachen: ein Funke wird zu einem Strich, der Strich zu einem Auge,
 * das Auge blinzelt, dann reißt der Vorhang auf und die App liegt darunter.
 * Dauert 2,3 Sekunden und läuft nur beim Öffnen.
 */
export default function Boot({ onDone }) {
  const [weg, setWeg] = useState(false)

  useEffect(() => {
    const start = Date.now()
    const t1 = setTimeout(() => setWeg(true), 2000)
    const t2 = setTimeout(() => onDone?.(), 2600)

    const ueberspringen = () => {
      setWeg(true)
      setTimeout(() => onDone?.(), 400)
    }

    // Im Hintergrund drosselt der Browser Zeitgeber. Kommt der Tab zurück und
    // die Zeit ist längst um, wird sofort aufgeräumt — sonst klebt der Vorhang.
    const aufwachen = () => {
      if (document.visibilityState === 'visible' && Date.now() - start > 2400) {
        setWeg(true)
        onDone?.()
      }
    }
    document.addEventListener('visibilitychange', aufwachen)

    window.addEventListener('keydown', ueberspringen, { once: true })
    window.addEventListener('pointerdown', ueberspringen, { once: true })

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      document.removeEventListener('visibilitychange', aufwachen)
      window.removeEventListener('keydown', ueberspringen)
      window.removeEventListener('pointerdown', ueberspringen)
    }
  }, [onDone])

  return (
    <div className={`boot ${weg ? 'auf' : ''}`}>
      <div className="boot-stage">
        <span className="boot-spark" />
        <span className="boot-lid" />
        <span className="boot-iris" />
        <span className="boot-pupil" />
      </div>
      <div className="boot-name">
        {['U', 'R', 'A', 'I'].map((c, i) => (
          <span key={i} style={{ animationDelay: `${1180 + i * 55}ms` }}>
            {c}
          </span>
        ))}
      </div>
      <div className="boot-scan" />
    </div>
  )
}
