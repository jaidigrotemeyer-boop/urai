import React, { useEffect, useRef } from 'react'

/**
 * Eigener Zeiger: ein Auge mit weichem Nachlauf.
 * Der Punkt in der Mitte sitzt genau auf dem Mauszeiger, der Ring hinkt federnd hinterher.
 * Über Knöpfen wird er größer und legt sich um das Element.
 * Während URAI arbeitet, dreht ein Bogen um ihn herum.
 */
export default function Cursor({ busy }) {
  const ring = useRef(null)
  const dot = useRef(null)
  const raf = useRef(0)

  useEffect(() => {
    // Auf Geräten ohne echte Maus bleibt alles wie immer
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    // Wer weniger Bewegung will, bekommt den Zeiger trotzdem — nur ohne Nachlauf
    const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const zaeh = ruhig ? 1 : 0.18

    document.body.classList.add('hat-zeiger')

    const ziel = { x: innerWidth / 2, y: innerHeight / 2 }
    const ist = { x: ziel.x, y: ziel.y }
    let druck = false

    const bewegen = (e) => {
      ziel.x = e.clientX
      ziel.y = e.clientY
      if (dot.current) dot.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`

      const el = e.target
      const fassbar =
        el?.closest?.('button, a, textarea, input, summary, .chip, .notch, [role="button"]') || null
      ring.current?.classList.toggle('fasst', !!fassbar)
      ring.current?.classList.toggle('schreibt', !!el?.closest?.('textarea, input'))
    }

    const runter = () => {
      druck = true
      ring.current?.classList.add('drueckt')
    }
    const hoch = () => {
      druck = false
      ring.current?.classList.remove('drueckt')
    }
    const raus = () => ring.current?.classList.add('weg')
    const rein = () => ring.current?.classList.remove('weg')

    // Feder: je weiter weg, desto schneller zieht der Ring nach
    const schleife = () => {
      ist.x += (ziel.x - ist.x) * zaeh
      ist.y += (ziel.y - ist.y) * zaeh
      const weite = Math.hypot(ziel.x - ist.x, ziel.y - ist.y)
      const zug = ruhig ? 0 : Math.min(weite / 90, 0.5)
      if (ring.current) {
        ring.current.style.transform =
          `translate(${ist.x}px, ${ist.y}px) scale(${1 + zug * (druck ? -0.3 : 0.55)})`
      }
      raf.current = requestAnimationFrame(schleife)
    }
    raf.current = requestAnimationFrame(schleife)

    addEventListener('pointermove', bewegen)
    addEventListener('pointerdown', runter)
    addEventListener('pointerup', hoch)
    document.addEventListener('mouseleave', raus)
    document.addEventListener('mouseenter', rein)

    return () => {
      cancelAnimationFrame(raf.current)
      removeEventListener('pointermove', bewegen)
      removeEventListener('pointerdown', runter)
      removeEventListener('pointerup', hoch)
      document.removeEventListener('mouseleave', raus)
      document.removeEventListener('mouseenter', rein)
      document.body.classList.remove('hat-zeiger')
    }
  }, [])

  return (
    <>
      <div ref={ring} className={`zeiger-ring ${busy ? 'arbeitet' : ''}`} aria-hidden="true">
        <span className="zeiger-bogen" />
      </div>
      <div ref={dot} className="zeiger-punkt" aria-hidden="true" />
    </>
  )
}
