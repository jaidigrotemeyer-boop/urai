import React, { useEffect, useRef, useState } from 'react'
import { farbeLesen, useFarbe } from '../theme.js'

/**
 * Der Graph: alle Notizen als Kugeln im Raum, Verknüpfungen als Fäden.
 *
 * Die Knoten stoßen sich gegenseitig ab, verbundene ziehen sich an —
 * nach ein paar Sekunden sortiert sich das von selbst zu Trauben.
 * Ziehen dreht die Ansicht, Scrollen zoomt, Klicken wählt einen Knoten.
 */
export default function Graph3D({ offen }) {
  useFarbe()
  const leinwand = useRef(null)
  const daten = useRef({ knoten: [], kanten: [] })
  const sicht = useRef({ drehX: -0.3, drehY: 0.5, zoom: 1, mitteX: 0, mitteY: 0 })
  const raf = useRef(0)
  const [gewaehlt, setGewaehlt] = useState(null)
  const [stand, setStand] = useState('lädt')
  const [filter, setFilter] = useState('alle')

  // Daten holen
  useEffect(() => {
    if (!offen) return
    let lebt = true
    fetch('/api/graph')
      .then((r) => r.json())
      .then((j) => {
        if (!lebt) return
        if (j.fehler) return setStand(j.fehler)
        const knoten = j.knoten.map((n, i) => {
          // Startlage auf einer Kugelschale — sieht gleich ordentlich aus
          const phi = Math.acos(1 - (2 * (i + 0.5)) / j.knoten.length)
          const theta = Math.PI * (1 + Math.sqrt(5)) * i
          const r = 150
          return {
            ...n,
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi),
            vx: 0,
            vy: 0,
            vz: 0,
          }
        })
        const nach = new Map(knoten.map((n) => [n.id, n]))
        const kanten = j.kanten.map((k) => ({ a: nach.get(k.von), b: nach.get(k.nach) })).filter((k) => k.a && k.b)
        daten.current = { knoten, kanten }
        setStand(`${knoten.length} Notizen · ${kanten.length} Verbindungen`)
      })
      .catch((e) => setStand(e.message))
    return () => {
      lebt = false
    }
  }, [offen])

  // Rechnen und zeichnen
  useEffect(() => {
    if (!offen) return
    const c = leinwand.current
    if (!c) return
    const g = c.getContext('2d')
    let laeuft = true

    const groesse = () => {
      const r = c.parentElement.getBoundingClientRect()
      c.width = r.width * devicePixelRatio
      c.height = r.height * devicePixelRatio
      g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    }
    groesse()
    const beobachter = new ResizeObserver(groesse)
    beobachter.observe(c.parentElement)

    const ARTFARBE = (art, h) =>
      ({
        thema: `hsl(${h} 80% 62%)`,
        sitzung: `hsl(${(h + 200) % 360} 55% 62%)`,
        wissen: `hsl(${(h + 60) % 360} 60% 62%)`,
        agent: `hsl(${(h + 300) % 360} 60% 66%)`,
        gruppe: `hsl(${(h + 330) % 360} 65% 66%)`,
      })[art] || `hsl(${h} 12% 55%)`

    const schleife = () => {
      if (!laeuft) return
      const { knoten, kanten } = daten.current
      const f = farbeLesen()

      // ── Kräfte ──
      for (let i = 0; i < knoten.length; i++) {
        const a = knoten[i]
        for (let j = i + 1; j < knoten.length; j++) {
          const b = knoten[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dz = b.z - a.z
          const d2 = dx * dx + dy * dy + dz * dz + 12
          const kraft = 900 / d2
          const d = Math.sqrt(d2)
          a.vx -= (dx / d) * kraft
          a.vy -= (dy / d) * kraft
          a.vz -= (dz / d) * kraft
          b.vx += (dx / d) * kraft
          b.vy += (dy / d) * kraft
          b.vz += (dz / d) * kraft
        }
        // sanft zur Mitte, damit nichts wegdriftet
        a.vx -= a.x * 0.0016
        a.vy -= a.y * 0.0016
        a.vz -= a.z * 0.0016
      }
      for (const k of kanten) {
        const dx = k.b.x - k.a.x
        const dy = k.b.y - k.a.y
        const dz = k.b.z - k.a.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
        const zug = (d - 70) * 0.006
        k.a.vx += (dx / d) * zug
        k.a.vy += (dy / d) * zug
        k.a.vz += (dz / d) * zug
        k.b.vx -= (dx / d) * zug
        k.b.vy -= (dy / d) * zug
        k.b.vz -= (dz / d) * zug
      }
      for (const n of knoten) {
        n.vx *= 0.82
        n.vy *= 0.82
        n.vz *= 0.82
        n.x += n.vx
        n.y += n.vy
        n.z += n.vz
      }

      // ── Zeichnen ──
      const B = c.width / devicePixelRatio
      const H = c.height / devicePixelRatio
      g.clearRect(0, 0, B, H)

      const { drehX, drehY, zoom } = sicht.current
      const sinY = Math.sin(drehY)
      const cosY = Math.cos(drehY)
      const sinX = Math.sin(drehX)
      const cosX = Math.cos(drehX)
      const tiefe = 560

      const projiziert = knoten.map((n) => {
        const x1 = n.x * cosY - n.z * sinY
        const z1 = n.x * sinY + n.z * cosY
        const y1 = n.y * cosX - z1 * sinX
        const z2 = n.y * sinX + z1 * cosX
        const s = (tiefe / (tiefe + z2 + 300)) * zoom
        return { n, sx: B / 2 + x1 * s, sy: H / 2 + y1 * s, s, z: z2 }
      })
      const nach = new Map(projiziert.map((p) => [p.n.id, p]))

      // Fäden zuerst, damit die Kugeln obenauf liegen
      for (const k of kanten) {
        const a = nach.get(k.a.id)
        const b = nach.get(k.b.id)
        if (!a || !b) continue
        const hell = gewaehlt && (k.a.id === gewaehlt || k.b.id === gewaehlt)
        g.strokeStyle = hell ? `hsl(${f.h} ${f.s}% ${f.l}% / .75)` : `hsl(${f.h} 30% 60% / .13)`
        g.lineWidth = hell ? 1.6 : 0.7
        g.beginPath()
        g.moveTo(a.sx, a.sy)
        g.lineTo(b.sx, b.sy)
        g.stroke()
      }

      projiziert.sort((p, q) => q.z - p.z)
      for (const p of projiziert) {
        if (filter !== 'alle' && p.n.art !== filter) continue
        const r = Math.max(1.6, (2.2 + Math.min(p.n.gewicht, 9) * 0.9) * p.s)
        const aktiv = gewaehlt === p.n.id
        g.globalAlpha = Math.max(0.25, Math.min(1, p.s * 1.15))
        g.fillStyle = ARTFARBE(p.n.art, f.h)
        g.beginPath()
        g.arc(p.sx, p.sy, r, 0, Math.PI * 2)
        g.fill()

        if (aktiv) {
          g.globalAlpha = 1
          g.strokeStyle = `hsl(${f.h} ${f.s}% ${f.l}%)`
          g.lineWidth = 2
          g.beginPath()
          g.arc(p.sx, p.sy, r + 5, 0, Math.PI * 2)
          g.stroke()
        }

        // Namen nur bei den wichtigen, sonst wird es Brei
        if (p.n.gewicht > 2 || aktiv || p.n.art === 'thema') {
          g.globalAlpha = Math.min(1, p.s)
          g.fillStyle = `hsl(${f.h} 15% 88%)`
          g.font = `${Math.max(9, 11 * p.s)}px -apple-system, system-ui, sans-serif`
          g.fillText(p.n.id.slice(0, 26), p.sx + r + 4, p.sy + 3)
        }
        g.globalAlpha = 1
      }

      sicht.current.projiziert = projiziert
      raf.current = requestAnimationFrame(schleife)
    }
    raf.current = requestAnimationFrame(schleife)

    return () => {
      laeuft = false
      cancelAnimationFrame(raf.current)
      beobachter.disconnect()
    }
  }, [offen, gewaehlt, filter])

  // Ziehen, Zoomen, Wählen
  useEffect(() => {
    const c = leinwand.current
    if (!c || !offen) return
    let zieht = false
    let letzteX = 0
    let letzteY = 0
    let bewegt = 0

    const runter = (e) => {
      zieht = true
      bewegt = 0
      letzteX = e.clientX
      letzteY = e.clientY
      c.setPointerCapture(e.pointerId)
    }
    const bewegen = (e) => {
      if (!zieht) return
      const dx = e.clientX - letzteX
      const dy = e.clientY - letzteY
      bewegt += Math.abs(dx) + Math.abs(dy)
      sicht.current.drehY += dx * 0.006
      sicht.current.drehX = Math.max(-1.4, Math.min(1.4, sicht.current.drehX + dy * 0.006))
      letzteX = e.clientX
      letzteY = e.clientY
    }
    const hoch = (e) => {
      zieht = false
      if (bewegt < 4) {
        // Klick statt Drehen: nächsten Knoten suchen
        const r = c.getBoundingClientRect()
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        let beste = null
        let nah = 22
        for (const p of sicht.current.projiziert || []) {
          const d = Math.hypot(p.sx - x, p.sy - y)
          if (d < nah) {
            nah = d
            beste = p.n
          }
        }
        setGewaehlt(beste?.id || null)
      }
    }
    const rollen = (e) => {
      e.preventDefault()
      sicht.current.zoom = Math.max(0.35, Math.min(3.5, sicht.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08)))
    }

    c.addEventListener('pointerdown', runter)
    c.addEventListener('pointermove', bewegen)
    c.addEventListener('pointerup', hoch)
    c.addEventListener('wheel', rollen, { passive: false })
    return () => {
      c.removeEventListener('pointerdown', runter)
      c.removeEventListener('pointermove', bewegen)
      c.removeEventListener('pointerup', hoch)
      c.removeEventListener('wheel', rollen)
    }
  }, [offen])

  const knoten = daten.current.knoten.find((n) => n.id === gewaehlt)

  return (
    <div className="graph">
      <canvas ref={leinwand} className="graph-flaeche" />

      <div className="graph-kopf">
        <span className="chip-mini">{stand}</span>
        {['alle', 'thema', 'sitzung', 'wissen', 'agent'].map((a) => (
          <button key={a} className={`chip ${filter === a ? 'on' : ''}`} onClick={() => setFilter(a)}>
            {a}
          </button>
        ))}
      </div>

      {knoten && (
        <div className="graph-karte">
          <div className="graph-art">{knoten.art}</div>
          <strong>{knoten.id}</strong>
          {knoten.text && <p>{knoten.text}</p>}
          <span className="chip-mini">{knoten.gewicht - 1} Verbindungen</span>
        </div>
      )}

      <div className="graph-hilfe">ziehen dreht · scrollen zoomt · tippen wählt</div>
    </div>
  )
}
