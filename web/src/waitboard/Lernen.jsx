import React, { useRef, useState } from 'react'
import Waitboard from './Waitboard.jsx'
import Orb from './Orb.jsx'
import { sprich, still } from './stimmpegel.js'
import { hoeren, kannHoeren } from '../stimme.js'

// Die Lernseite: Waitboard links, Orb rechts. Der Orb liest den Pegel selbst aus
// stimmpegel.js — hier wird ihm nichts übergeben. Genau deshalb bleibt er im
// Takt, egal wie lang die Antwort ist.

export default function Lernen() {
  const board = useRef(null)
  const [hoert, setHoert] = useState(false)
  const [gesagt, setGesagt] = useState('')
  const lauscher = useRef(null)

  const mikro = () => {
    if (hoert) {
      lauscher.current?.stop()
      setHoert(false)
      return
    }
    still()
    setGesagt('')
    setHoert(true)
    lauscher.current = hoeren({
      onText: (text) => setGesagt(text),
      onEnde: (text) => {
        setHoert(false)
        if (text?.trim().length > 2) board.current?.fragen(text.trim())
      },
      onFehler: (f) => {
        setHoert(false)
        setGesagt(f)
      },
    })
  }

  return (
    <div className="lernen">
      <div className="lernen-board">
        <Waitboard ref={board} onFrage={(text) => sprich(text)} />
      </div>

      <aside className="lernen-seite">
        <Orb groesse={148} zuhoeren={hoert} />
        <button className={`lernen-mikro ${hoert ? 'on' : ''}`} onClick={mikro} disabled={!kannHoeren()}>
          {hoert ? 'hört zu…' : 'Sprechen'}
        </button>
        {gesagt && <p className="lernen-gesagt">{gesagt}</p>}
        <button className="lernen-still" onClick={still}>Ruhe</button>
      </aside>
    </div>
  )
}
