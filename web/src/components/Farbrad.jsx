import React, { useEffect, useRef, useState } from 'react'
import { farbeLesen, farbeSetzen, useFarbe, VORSCHLAEGE, zurueckSetzen } from '../theme.js'
import { t } from '../i18n.js'

/**
 * Farbrad: Winkel ist der Farbton, Abstand zur Mitte die Sättigung.
 * Der Regler darunter macht heller oder dunkler.
 * Alles ändert sich sofort — man sieht das Ergebnis, während man zieht.
 */
export default function Farbrad({ onClose }) {
  useFarbe()
  const rad = useRef(null)
  const [zieht, setZieht] = useState(false)
  const f = farbeLesen()

  // Das Rad einmal zeichnen: Farbton im Kreis, Sättigung nach außen
  useEffect(() => {
    const c = rad.current
    if (!c) return
    const g = c.getContext('2d')
    const R = c.width / 2
    const bild = g.createImageData(c.width, c.height)

    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const dx = x - R
        const dy = y - R
        const abstand = Math.sqrt(dx * dx + dy * dy)
        const i = (y * c.width + x) * 4
        if (abstand > R) {
          bild.data[i + 3] = 0
          continue
        }
        const winkel = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
        const [r, gr, b] = hslZuRgb(winkel, Math.min(1, abstand / R), 0.6)
        bild.data[i] = r
        bild.data[i + 1] = gr
        bild.data[i + 2] = b
        // Rand weich auslaufen lassen
        bild.data[i + 3] = abstand > R - 1.5 ? 255 * (R - abstand) : 255
      }
    }
    g.putImageData(bild, 0, 0)
  }, [])

  function ausPunkt(e) {
    const c = rad.current
    const r = c.getBoundingClientRect()
    const R = r.width / 2
    const dx = e.clientX - r.left - R
    const dy = e.clientY - r.top - R
    const abstand = Math.min(Math.sqrt(dx * dx + dy * dy), R)
    const winkel = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
    farbeSetzen({ h: Math.round(winkel), s: Math.round(Math.max(0.18, abstand / R) * 100) })
  }

  const R = 96
  const rad0 = (f.h * Math.PI) / 180
  const r0 = (f.s / 100) * R
  const punktX = R + Math.cos(rad0) * r0
  const punktY = R + Math.sin(rad0) * r0

  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-card farbkarte">
        <h3>Akzentfarbe</h3>
        <div className="sub">Alles im Aussehen richtet sich danach.</div>

        <div className="radwrap">
          <canvas
            ref={rad}
            width={192}
            height={192}
            className="farbrad"
            onPointerDown={(e) => {
              setZieht(true)
              e.currentTarget.setPointerCapture(e.pointerId)
              ausPunkt(e)
            }}
            onPointerMove={(e) => zieht && ausPunkt(e)}
            onPointerUp={() => setZieht(false)}
          />
          <span className="radzeiger" style={{ left: punktX, top: punktY }} />
        </div>

        <div className="field">
          <label>Helligkeit</label>
          <input
            type="range"
            min="35"
            max="85"
            value={f.l}
            onChange={(e) => farbeSetzen({ l: Number(e.target.value) })}
          />
        </div>

        <div className="field">
          <label>Fertige Farben</label>
          <div className="chips">
            {VORSCHLAEGE.map((v) => (
              <button
                key={v.name}
                className={`chip ${f.h === v.h ? 'on' : ''}`}
                style={{ borderColor: `hsl(${v.h} ${v.s}% ${v.l}% / .5)`, color: `hsl(${v.h} ${v.s}% ${v.l}%)` }}
                onClick={() => farbeSetzen(v)}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>

        <div className="probe">
          <span className="orb" />
          <span className="probe-text">So sieht es aus</span>
          <button className="chip on">Beispiel</button>
          <button className="primary">{t('go')}</button>
        </div>

        <div className="sheet-actions">
          <button onClick={zurueckSetzen}>Zurücksetzen</button>
          <button className="primary" onClick={onClose}>
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function hslZuRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}
