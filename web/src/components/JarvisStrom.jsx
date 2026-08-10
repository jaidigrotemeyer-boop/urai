import React, { useEffect, useRef, useState } from 'react'
import '../jarvis-strom.css'

/**
 * Die Schicht, die den Bildschirm lebendig macht: Spalten aus Zeichen, die
 * langsam nach oben laufen, und ein paar Messwerte am Rand.
 *
 * Warum das überhaupt hier steht: die Vorlage ist ein Standbild und wirkt
 * darum wie ein Poster. Was JARVIS im Film ausmacht, ist nicht das Raster,
 * sondern dass ständig etwas läuft — auch wenn gerade niemand etwas will.
 *
 * Und warum es trotzdem so zurückhaltend ist: der Rechner hier hat 8 GB und
 * einen Lüfter, den man hört. Darum ausschließlich CSS-Transformationen und
 * kein einziger Zeitgeber pro Bild — die Spalten laufen über transform, das
 * macht der Compositor nebenbei. Die einzige Uhr in dieser Datei tickt alle
 * paar Sekunden für die Messwerte, nicht 60-mal pro Sekunde.
 */

// Aus diesen Zeichen bestehen die Spalten. Ziffern und Großbuchstaben, weil
// Kleinbuchstaben in Monospace unruhig wirken — die Unterlängen zerfransen
// die Zeile, und genau die Ruhe ist hier der Punkt.
const ZEICHEN = 'ABCDEF0123456789/\\|<>[]{}·+-='

// Feste Spalten statt zufälliger: Math.random() bei jedem Bild würde die
// Spalten bei jedem Neuzeichnen umschreiben lassen. Einmal gebaut, reicht.
function spalteBauen(laenge, versatz) {
  let s = ''
  for (let i = 0; i < laenge; i++) {
    // Kein echter Zufall — ein billiger, aber unregelmäßig genug aussehender
    // Schritt. Reproduzierbar, also flackert beim Neuaufbau nichts.
    s += ZEICHEN[(i * 7 + versatz * 13) % ZEICHEN.length]
  }
  return s
}

const SPALTEN = Array.from({ length: 7 }, (_, i) => ({
  text: spalteBauen(60, i),
  links: [4, 17, 31, 48, 63, 79, 92][i],
  dauer: [38, 52, 44, 61, 47, 55, 41][i],
  verzoegerung: [0, -12, -25, -6, -33, -18, -41][i],
}))

/**
 * @param {string} zustand  ruht | hoert | denkt | spricht — steuert Tempo und Helligkeit
 * @param {boolean} an      wird von App.jsx gesetzt; ohne JARVIS-Haut gar nicht erst gerendert
 */
export default function JarvisStrom({ zustand = 'ruht' }) {
  const [werte, setWerte] = useState(null)
  const lebt = useRef(true)

  useEffect(() => {
    lebt.current = true
    const holen = async () => {
      try {
        const r = await fetch('/api/lokal', { cache: 'no-store' })
        const j = await r.json()
        if (lebt.current) setWerte(j)
      } catch {
        // Bei Fehler die alten Zahlen stehen lassen. Eine Zierschicht, die
        // beim ersten Netzschluckauf auf "—" springt, ist unruhiger als eine,
        // die kurz veraltet ist.
      }
    }
    holen()
    const takt = setInterval(holen, 8000)
    return () => {
      lebt.current = false
      clearInterval(takt)
    }
  }, [])

  return (
    <div className={`jst jst-${zustand}`} aria-hidden="true">
      {SPALTEN.map((s, i) => (
        <div
          className="jst-spalte"
          key={i}
          // Die Dauer geht als Variable rein, nicht als animationDuration:
          // sonst stünde sie fest im style-Attribut und der Zustand könnte das
          // Tempo nicht mehr ändern. Das CSS rechnet --dauer mal --jst-tempo.
          style={{
            left: `${s.links}%`,
            '--dauer': `${s.dauer}s`,
            animationDelay: `${s.verzoegerung}s`,
          }}
        >
          {s.text.split('').map((z, j) => (
            <span key={j}>{z}</span>
          ))}
        </div>
      ))}

      {/* Die Messwerte sind echt oder gar nicht da. Erfundene Telemetrie wäre
          genau die Sorte Zierde, die ein Instrument zum Spielzeug macht. */}
      {werte && (
        <div className="jst-werte">
          <span>MEM {typeof werte.ramFrei === 'number' ? `${werte.ramFrei}%` : '—'}</span>
          <span>LOC {werte.laufend ?? '—'}/{werte.wartend ?? '—'}</span>
        </div>
      )}
    </div>
  )
}
