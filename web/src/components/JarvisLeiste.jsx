import React, { useEffect, useState } from 'react'
import '../jarvis-leiste.css'

/**
 * Die HUD-Statusleiste und die vier Ecken-Winkel der JARVIS-Haut.
 *
 * Beides ist Zierde mit Anspruch: Es sieht aus wie ein Instrument, also muss
 * es sich auch wie eins verhalten. Darum steht hier keine einzige erfundene
 * Zahl. Was nicht feststeht, ist ein Strich — ein HUD, das sich Werte
 * ausdenkt, ist ein Spielzeug und man glaubt ihm hinterher auch das nicht
 * mehr, was stimmt.
 *
 * Die Leiste baut bewusst KEINE zweite Verbindung auf. Den Zustand des
 * WebSockets kennt App.jsx bereits; ein eigener Socket nur fürs Anzeigen
 * würde den Server doppelt belegen und könnte obendrein etwas anderes
 * behaupten als der Rest der Oberfläche.
 */

// Zehn Sekunden. Die Zahl ist Schmuck, kein Messgerät — häufiger zu messen
// kostet Strom und Serverzeit für einen Wert, den niemand so genau braucht.
const MESSTAKT = 10000

/**
 * Horcht am <html>, ob die JARVIS-Haut an ist.
 *
 * Die Haut hängt an einem Attribut und nicht an React-State (siehe theme.js),
 * damit sie schon beim ersten Bild sitzt. Der Beobachter ist der Preis dafür:
 * ohne ihn würde das HUD beim Umschalten erst nach einem Neuladen auftauchen,
 * und genau in dem Moment schaut man ja hin.
 */
export function useJarvisHaut() {
  const [an, setAn] = useState(() => document.documentElement.dataset.haut === 'jarvis')

  useEffect(() => {
    const el = document.documentElement
    const pruefen = () => setAn(el.dataset.haut === 'jarvis')
    // Zwischen erstem Zeichnen und diesem Effekt kann bereits umgeschaltet
    // worden sein — einmal nachfassen, sonst bleibt der Erststand hängen.
    pruefen()
    const beobachter = new MutationObserver(pruefen)
    beobachter.observe(el, { attributes: true, attributeFilter: ['data-haut'] })
    return () => beobachter.disconnect()
  }, [])

  return an
}

/**
 * Aus "gemini · gemini-2.0-flash" wird "GEMINI".
 * Auf der Leiste ist Platz für ein Wort, nicht für eine Modellkennung.
 */
function kuerzel(gehirn) {
  const wort = String(gehirn ?? '').split(/[·\s]+/).filter(Boolean)[0]
  return wort ? wort.toUpperCase().slice(0, 12) : '—'
}

/**
 * Die Leiste am oberen Rand.
 *
 * @param {boolean} verbunden  hängt der WebSocket? Kommt aus App.jsx.
 * @param {string}  gehirn     aktives Gehirn; fehlt der Prop, entfällt das Feld
 */
export default function JarvisLeiste({ verbunden = false, gehirn }) {
  const haut = useJarvisHaut()
  const [lat, setLat] = useState(null)

  useEffect(() => {
    // Ohne Haut ist die Leiste unsichtbar, ohne Verbindung ist der Server
    // ohnehin nicht da: in beiden Fällen wäre die Messung nur Netzlärm.
    if (!haut || !verbunden) {
      setLat(null)
      return
    }

    let lebt = true
    const abbruch = new AbortController()

    const messen = async () => {
      const start = performance.now()
      try {
        const antwort = await fetch('/api/status', { cache: 'no-store', signal: abbruch.signal })
        const dauer = performance.now() - start
        // Gemessen wird die Zeit bis zur Antwort, der Inhalt interessiert
        // nicht. Verwerfen statt liegenlassen, damit die Verbindung frei wird.
        antwort.body?.cancel().catch(() => {})
        if (lebt) setLat(antwort.ok ? Math.round(dauer) : null)
      } catch {
        // Fehlgeschlagen heißt: wir wissen es nicht. Der letzte Wert wäre
        // jetzt eine Lüge, also lieber ein Strich.
        if (lebt) setLat(null)
      }
    }

    messen()
    const takt = setInterval(messen, MESSTAKT)
    return () => {
      lebt = false
      clearInterval(takt)
      abbruch.abort()
    }
  }, [haut, verbunden])

  if (!haut) return null

  return (
    <div className={`jl-leiste ${verbunden ? '' : 'jl-ist-weg'}`}>
      <span className="jl-marke">U R A I</span>

      <span className="jl-werte">
        <span className="jl-feld jl-link">
          <i className="jl-punkt" aria-hidden="true" />
          {verbunden ? 'CORE.LINK STABLE' : 'CORE.LINK LOST'}
        </span>

        <span className="jl-feld">LAT {lat == null ? '—' : `${lat}MS`}</span>

        {gehirn !== undefined && <span className="jl-feld">{kuerzel(gehirn)}</span>}
      </span>
    </div>
  )
}

/**
 * Die vier Ecken-Winkel.
 *
 * Vier dünne Striche, mehr nicht — aber sie machen aus einem Fenster ein
 * Instrument. Als eigene Komponente statt als Pseudo-Elemente, weil ein
 * Element nur zwei davon hat und drei Ecken schlimmer aussehen als keine.
 */
export function JarvisEcken() {
  const haut = useJarvisHaut()
  if (!haut) return null

  return (
    <div className="jl-ecken" aria-hidden="true">
      <i className="jl-ecke jl-ecke-ol" />
      <i className="jl-ecke jl-ecke-or" />
      <i className="jl-ecke jl-ecke-ul" />
      <i className="jl-ecke jl-ecke-ur" />
    </div>
  )
}
