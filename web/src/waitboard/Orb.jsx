import React, { useEffect, useRef } from 'react'
import { pegel, istAmSprechen } from './stimmpegel.js'

// Der Orb liest pro Bild den Pegel und verformt sich danach. Er kennt keinen
// Timer und keinen Text — deshalb kann er gar nicht aus dem Takt geraten:
// hört die Stimme auf, fällt der Pegel, und der Orb wird ruhig. Ende.

const RINGE = [
  { farbe: '#5b8cff', anteil: 1.0, tempo: 0.00042, wellen: 3 },
  { farbe: '#a06bff', anteil: 0.86, tempo: -0.00061, wellen: 4 },
  { farbe: '#3ad6c4', anteil: 0.72, tempo: 0.00083, wellen: 5 },
]

export default function Orb({ groesse = 132, zuhoeren = false }) {
  const canvas = useRef(null)
  const glatt = useRef(0) // nachgezogener Pegel, damit nichts ruckelt

  useEffect(() => {
    const el = canvas.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    el.width = groesse * dpr
    el.height = groesse * dpr
    const c = el.getContext('2d')
    c.setTransform(dpr, 0, 0, dpr, 0, 0)

    const mitte = groesse / 2
    const grund = groesse * 0.3
    let laeuft = true
    let bild = 0

    const zeichnen = () => {
      if (!laeuft) return
      bild++
      const roh = pegel()
      glatt.current += (roh - glatt.current) * 0.28
      const p = glatt.current
      const wach = istAmSprechen() || zuhoeren

      c.clearRect(0, 0, groesse, groesse)

      // Schein außen herum — wächst mit der Lautstärke
      const schein = c.createRadialGradient(mitte, mitte, grund * 0.4, mitte, mitte, grund * (1.6 + p * 0.9))
      schein.addColorStop(0, `rgba(91,140,255,${0.24 + p * 0.4})`)
      schein.addColorStop(1, 'rgba(91,140,255,0)')
      c.fillStyle = schein
      c.beginPath()
      c.arc(mitte, mitte, grund * (1.7 + p), 0, Math.PI * 2)
      c.fill()

      // Die Ringe. Jeder wellt sich anders und dreht sich anders — dadurch
      // entsteht die Bewegung, ohne dass irgendwo echtes Rauschen nötig wäre.
      const t = performance.now()
      c.lineWidth = 2.1
      for (const ring of RINGE) {
        const r0 = grund * ring.anteil * (1 + p * 0.34)
        const tiefe = grund * (0.045 + p * 0.3)
        c.strokeStyle = ring.farbe
        c.globalAlpha = wach ? 0.62 + p * 0.3 : 0.3
        c.beginPath()
        for (let a = 0; a <= 64; a++) {
          const w = (a / 64) * Math.PI * 2
          const r = r0 + Math.sin(w * ring.wellen + t * ring.tempo * 6) * tiefe + Math.sin(w * (ring.wellen + 2) - t * ring.tempo * 3.4) * tiefe * 0.45
          const x = mitte + Math.cos(w) * r
          const y = mitte + Math.sin(w) * r
          a === 0 ? c.moveTo(x, y) : c.lineTo(x, y)
        }
        c.closePath()
        c.stroke()
      }
      c.globalAlpha = 1

      // Kern. Atmet im Ruhezustand langsam, damit der Orb nicht tot wirkt.
      const atem = wach ? 0 : Math.sin(bild / 46) * 0.028
      const kernR = grund * (0.5 + p * 0.26 + atem)
      const kern = c.createRadialGradient(mitte - kernR * 0.3, mitte - kernR * 0.35, 0, mitte, mitte, kernR)
      kern.addColorStop(0, '#ffffff')
      kern.addColorStop(0.42, '#9fbcff')
      kern.addColorStop(1, '#3f63d8')
      c.fillStyle = kern
      c.beginPath()
      c.arc(mitte, mitte, kernR, 0, Math.PI * 2)
      c.fill()

      requestAnimationFrame(zeichnen)
    }

    requestAnimationFrame(zeichnen)
    return () => { laeuft = false }
  }, [groesse, zuhoeren])

  return (
    <canvas
      ref={canvas}
      className="orb-canvas"
      style={{ width: groesse, height: groesse }}
      aria-hidden="true"
    />
  )
}
