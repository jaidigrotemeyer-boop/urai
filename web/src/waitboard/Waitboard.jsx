import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { schreibe, zeichenProZeile } from './handschrift.js'

// Das Waitboard hält Striche, keine Pixel. Das kostet fast nichts und bringt drei
// Sachen umsonst: Radieren ohne Bildrauschen, Rückgängig, und Speichern als
// kleines JSON (dafür ist Drive später da). Gemalt wird trotzdem auf Canvas —
// SVG mit tausend Pfaden wird beim Schreiben zäh.

const FARBEN = {
  ich: '#101319',
  ki: '#2f6bff',
  rot: '#e0344b',
  gruen: '#12a150',
}

/** Ein Strich: {id, wer, farbe, breite, punkte:[{x,y,d}]} — d ist der Stiftdruck 0..1 */
let laufendeId = 1

export default forwardRef(function Waitboard({ onFrage, hintergrund = '#fdfdfb' }, ref) {
  const wrap = useRef(null)
  const canvas = useRef(null)
  const ctx = useRef(null)
  const striche = useRef([])
  const rueckgaengig = useRef([]) // zurückgenommene Striche, für Wiederherstellen
  const aktiv = useRef(null) // Strich, der gerade gezogen wird
  const letzterStift = useRef(0) // wann zuletzt ein echter Stift da war (Handballen-Sperre)
  const groesse = useRef({ b: 0, h: 0 })

  const [werkzeug, setWerkzeug] = useState('stift') // stift | radierer
  const [farbe, setFarbe] = useState('ich')
  const [denkt, setDenkt] = useState(false)
  const [fehler, setFehler] = useState('')

  // ───────────────────────────── Malen ─────────────────────────────

  const strichMalen = useCallback((s, ab = 0) => {
    const c = ctx.current
    if (!c || s.punkte.length < 2) return
    c.strokeStyle = s.farbe
    c.lineCap = 'round'
    c.lineJoin = 'round'
    for (let i = Math.max(1, ab); i < s.punkte.length; i++) {
      const a = s.punkte[i - 1]
      const b = s.punkte[i]
      // Zwischen zwei Punkten wird die Breite weich überblendet — dadurch wirkt
      // der Strich lebendig statt wie ein gleichmäßiges Rohr.
      c.lineWidth = s.breite * (0.45 + 0.55 * ((a.d + b.d) / 2))
      c.beginPath()
      c.moveTo(a.x, a.y)
      c.lineTo(b.x, b.y)
      c.stroke()
    }
  }, [])

  const allesMalen = useCallback(() => {
    const c = ctx.current
    if (!c) return
    c.fillStyle = hintergrund
    c.fillRect(0, 0, groesse.current.b, groesse.current.h)
    for (const s of striche.current) strichMalen(s)
  }, [hintergrund, strichMalen])

  // ──────────────────────── Größe & Auflösung ────────────────────────

  useEffect(() => {
    const el = canvas.current
    const behaelter = wrap.current
    if (!el || !behaelter) return

    const anpassen = () => {
      const r = behaelter.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      groesse.current = { b: r.width, h: r.height }
      el.width = Math.round(r.width * dpr)
      el.height = Math.round(r.height * dpr)
      el.style.width = `${r.width}px`
      el.style.height = `${r.height}px`
      const c = el.getContext('2d')
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.current = c
      allesMalen()
    }

    anpassen()
    const beobachter = new ResizeObserver(anpassen)
    beobachter.observe(behaelter)
    return () => beobachter.disconnect()
  }, [allesMalen])

  // ───────────────────────────── Eingabe ─────────────────────────────

  const punktVon = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      // Mäuse melden 0 oder 0.5 — dann nehmen wir einen festen mittleren Druck.
      d: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.55,
    }
  }

  const ignorieren = (e) => {
    if (e.pointerType === 'pen') {
      letzterStift.current = performance.now()
      return false
    }
    // Liegt der Handballen auf, während der Stift schreibt, kommen Touch-Events
    // dazwischen. Kurz nach einem Stift-Event glauben wir Touch schlicht nicht.
    return e.pointerType === 'touch' && performance.now() - letzterStift.current < 1500
  }

  // Ein echter Radierer nimmt weg, was er berührt — nicht den ganzen Strich.
  // Wer in einer langen Zeile einen Buchstaben wegwischt, will nicht die Zeile
  // verlieren. Also schneiden wir den Strich auf und behalten beide Enden.
  const radiere = (p, radius = 14) => {
    const r2 = radius * radius
    const neu = []
    let veraendert = false

    for (const s of striche.current) {
      let lauf = []
      let getroffen = false
      for (const q of s.punkte) {
        const dx = q.x - p.x
        const dy = q.y - p.y
        if (dx * dx + dy * dy <= r2) {
          getroffen = true
          if (lauf.length > 1) neu.push({ ...s, id: laufendeId++, punkte: lauf })
          lauf = []
        } else {
          lauf.push(q)
        }
      }
      if (!getroffen) {
        neu.push(s)
        continue
      }
      veraendert = true
      // Ein einzelner übrig gebliebener Punkt ergibt keinen Strich mehr.
      if (lauf.length > 1) neu.push({ ...s, id: laufendeId++, punkte: lauf })
    }

    if (veraendert) {
      striche.current = neu
      allesMalen()
    }
  }

  const runter = (e) => {
    if (ignorieren(e)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = punktVon(e)

    // Radiergummi-Ende des Stifts meldet sich als buttons-Bit 32.
    const radiert = werkzeug === 'radierer' || (e.buttons & 32) !== 0
    if (radiert) {
      aktiv.current = { radierer: true }
      radiere(p)
      return
    }

    aktiv.current = {
      id: laufendeId++,
      wer: 'ich',
      farbe: FARBEN[farbe] || FARBEN.ich,
      breite: 3.4,
      punkte: [p],
    }
    striche.current.push(aktiv.current)
    rueckgaengig.current = []
  }

  const bewegen = (e) => {
    if (!aktiv.current || ignorieren(e)) return
    // getCoalescedEvents liefert die Zwischenpunkte, die der Browser gebündelt
    // hat. Ohne sie werden schnelle Striche eckig.
    const roh = e.getCoalescedEvents?.() || [e]
    if (aktiv.current.radierer) {
      for (const r of roh) radiere(punktVon(r))
      return
    }
    const s = aktiv.current
    const ab = s.punkte.length
    for (const r of roh) {
      const p = punktVon(r)
      const letzter = s.punkte[s.punkte.length - 1]
      // Punkte, die praktisch aufeinander liegen, bringen nichts außer Arbeit.
      if (Math.hypot(p.x - letzter.x, p.y - letzter.y) < 0.7) continue
      s.punkte.push(p)
    }
    strichMalen(s, ab)
  }

  const hoch = () => {
    if (aktiv.current && !aktiv.current.radierer && aktiv.current.punkte.length < 2) {
      // Ein Tippen ohne Bewegung: als kurzer Punkt sichtbar machen.
      const p = aktiv.current.punkte[0]
      aktiv.current.punkte.push({ ...p, x: p.x + 0.6 })
      strichMalen(aktiv.current, 1)
    }
    aktiv.current = null
  }

  // ─────────────────────── Was die KI zurückschreibt ───────────────────────

  /** Malt fertige Striche Punkt für Punkt — genau das macht es zu Handschrift. */
  const animiertMalen = (rohStriche, { farbe: f = FARBEN.ki, breite = 2.8, tempo = 1 } = {}) =>
    new Promise((fertig) => {
      let nr = 0
      let i = 0
      let laufender = null

      // Eine feste Punktzahl pro Bild hieße: kurze Antwort huscht vorbei, lange
      // dauert eine halbe Minute. Also andersherum rechnen — erst die Dauer
      // festlegen, dann das Budget daraus ableiten.
      const gesamt = rohStriche.reduce((n, s) => n + s.length, 0)
      const zielSekunden = Math.min(6, Math.max(1.6, gesamt / 900)) / tempo
      const proBild = Math.max(2, Math.ceil(gesamt / (zielSekunden * 60)))

      const schritt = () => {
        let budget = proBild
        while (budget-- > 0) {
          if (nr >= rohStriche.length) return fertig()
          if (!laufender) {
            laufender = { id: laufendeId++, wer: 'ki', farbe: f, breite, punkte: [] }
            striche.current.push(laufender)
            i = 0
          }
          const quelle = rohStriche[nr]
          laufender.punkte.push({ x: quelle[i].x, y: quelle[i].y, d: 0.6 })
          if (laufender.punkte.length > 1) strichMalen(laufender, laufender.punkte.length - 1)
          i++
          if (i >= quelle.length) {
            nr++
            laufender = null
          }
        }
        requestAnimationFrame(schritt)
      }
      requestAnimationFrame(schritt)
    })

  /** Wo ist Platz? Am liebsten rechts neben dem, was schon dasteht. */
  const freierPlatz = () => {
    const { b, h } = groesse.current
    const meine = striche.current.filter((s) => s.wer === 'ich')
    const rand = 28
    if (!meine.length) return { x: rand, y: 90, breite: Math.min(b - 2 * rand, 620) }

    let rechts = 0
    let oben = Infinity
    for (const s of meine) {
      for (const p of s.punkte) {
        if (p.x > rechts) rechts = p.x
        if (p.y < oben) oben = p.y
      }
    }
    const platzRechts = b - rechts - 2 * rand
    if (platzRechts > 260) return { x: rechts + rand * 1.5, y: Math.max(70, oben + 18), breite: platzRechts }

    // Sonst drunter — dafür brauchen wir den tiefsten Punkt.
    let unten = 0
    for (const s of striche.current) for (const p of s.punkte) if (p.y > unten) unten = p.y
    return { x: rand, y: Math.min(unten + 70, h - 60), breite: b - 2 * rand }
  }

  /** Bild des Waitboards für das Sehen-Modell. Weiß hinterlegt, sonst sieht Gemini nichts. */
  const alsBild = (maxKante = 1280) => {
    const { b, h } = groesse.current
    const skala = Math.min(1, maxKante / Math.max(b, h))
    const off = document.createElement('canvas')
    off.width = Math.round(b * skala)
    off.height = Math.round(h * skala)
    const c = off.getContext('2d')
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, off.width, off.height)
    c.scale(skala, skala)
    c.lineCap = 'round'
    c.lineJoin = 'round'
    for (const s of striche.current) {
      c.strokeStyle = s.farbe
      for (let i = 1; i < s.punkte.length; i++) {
        c.lineWidth = s.breite * (0.45 + 0.55 * ((s.punkte[i - 1].d + s.punkte[i].d) / 2))
        c.beginPath()
        c.moveTo(s.punkte[i - 1].x, s.punkte[i - 1].y)
        c.lineTo(s.punkte[i].x, s.punkte[i].y)
        c.stroke()
      }
    }
    return off.toDataURL('image/png').split(',')[1]
  }

  /** Anschauen, fragen, per Hand danebenschreiben. */
  const fragen = async (frage) => {
    if (denkt) return
    setDenkt(true)
    setFehler('')
    try {
      const platz = freierPlatz()
      const groesseText = 26
      const spalten = zeichenProZeile(platz.breite, groesseText)
      const r = await fetch('/api/waitboard/frage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bild: alsBild(), frage, spalten }),
      })
      const daten = await r.json()
      if (!r.ok) throw new Error(daten.fehler || `Server ${r.status}`)

      const { striche: neue } = schreibe(daten.text, {
        x: platz.x,
        y: platz.y,
        groesse: groesseText,
        maxBreite: platz.breite,
        saat: daten.text.length,
      })
      onFrage?.(daten.text) // z. B. zum Vorlesen — den Orb füttert das auch
      await animiertMalen(neue)
    } catch (e) {
      setFehler(String(e.message || e))
    } finally {
      setDenkt(false)
    }
  }

  // ────────────────────────── Nach außen ──────────────────────────

  useImperativeHandle(ref, () => ({
    fragen,
    alsBild,
    /** Striche als JSON — genau das, was später in Drive liegt. */
    speichern: () => ({ v: 1, striche: striche.current }),
    laden: (daten) => {
      striche.current = daten?.striche || []
      laufendeId = striche.current.reduce((m, s) => Math.max(m, s.id + 1), 1)
      allesMalen()
    },
    leeren: (wer) => {
      striche.current = wer ? striche.current.filter((s) => s.wer !== wer) : []
      allesMalen()
    },
  }))

  const zurueck = () => {
    const s = striche.current.pop()
    if (s) {
      rueckgaengig.current.push(s)
      allesMalen()
    }
  }
  const vor = () => {
    const s = rueckgaengig.current.pop()
    if (s) {
      striche.current.push(s)
      strichMalen(s)
    }
  }

  useEffect(() => {
    const taste = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        zurueck()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        vor()
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])

  return (
    <div className="waitboard">
      <div className="waitboard-leiste">
        <button className={werkzeug === 'stift' ? 'on' : ''} onClick={() => setWerkzeug('stift')}>Stift</button>
        <button className={werkzeug === 'radierer' ? 'on' : ''} onClick={() => setWerkzeug('radierer')}>Radierer</button>
        <span className="waitboard-farben">
          {Object.entries(FARBEN).filter(([k]) => k !== 'ki').map(([k, v]) => (
            <button
              key={k}
              className={`waitboard-farbe ${farbe === k ? 'on' : ''}`}
              style={{ '--f': v }}
              onClick={() => { setFarbe(k); setWerkzeug('stift') }}
              aria-label={k}
            />
          ))}
        </span>
        <span className="waitboard-luecke" />
        <button onClick={zurueck}>Zurück</button>
        <button onClick={() => { striche.current = striche.current.filter((s) => s.wer !== 'ki'); allesMalen() }}>
          KI weg
        </button>
        <button
          className="waitboard-fragen"
          disabled={denkt}
          onClick={() => fragen('Schau dir das Waitboard an und hilf mir weiter.')}
        >
          {denkt ? 'schaut hin…' : 'KI fragen'}
        </button>
      </div>

      <div className="waitboard-flaeche" ref={wrap}>
        <canvas
          ref={canvas}
          onPointerDown={runter}
          onPointerMove={bewegen}
          onPointerUp={hoch}
          onPointerCancel={hoch}
          onPointerLeave={hoch}
        />
        {fehler && <div className="waitboard-fehler">{fehler}</div>}
      </div>
    </div>
  )
})
