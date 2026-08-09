// Die Akzentfarbe. Alles andere im Aussehen leitet sich daraus ab.
import { useSyncExternalStore } from 'react'

const SCHLUESSEL = 'urai-akzent'
const STANDARD = { h: 152, s: 72, l: 66 } // das ursprüngliche Minzgrün

let farbe = laden()
const hoerer = new Set()

function laden() {
  try {
    const roh = JSON.parse(localStorage.getItem(SCHLUESSEL))
    if (roh && typeof roh.h === 'number') return roh
  } catch {}
  return { ...STANDARD }
}

function hsl(h, s, l, a) {
  return a == null ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`
}

/** Aus einer Farbe die ganze Familie bauen und in die Seite schreiben. */
export function anwenden(f = farbe) {
  const { h, s, l } = f
  const w = document.documentElement.style
  w.setProperty('--accent', hsl(h, s, l))
  w.setProperty('--accent-soft', hsl(h, s, l, 0.14))
  w.setProperty('--accent-line', hsl(h, s, l, 0.34))
  w.setProperty('--accent-tief', hsl(h, Math.min(100, s + 8), Math.max(12, l - 44)))
  // Neutrale Töne ganz leicht in Richtung der Akzentfarbe ziehen —
  // dadurch wirkt die Oberfläche wie aus einem Guss statt wie graues Blech
  w.setProperty('--tint', hsl(h, 30, l, 0.05))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hsl(h, 20, 6))
}

export function farbeSetzen(neu) {
  farbe = { ...farbe, ...neu }
  localStorage.setItem(SCHLUESSEL, JSON.stringify(farbe))
  anwenden(farbe)
  hoerer.forEach((f) => f())
}

export function farbeLesen() {
  return farbe
}

export function zurueckSetzen() {
  farbeSetzen(STANDARD)
}

export function useFarbe() {
  return useSyncExternalStore(
    (f) => {
      hoerer.add(f)
      return () => hoerer.delete(f)
    },
    () => `${farbe.h}-${farbe.s}-${farbe.l}`
  )
}

/** Ein paar Farben, die erfahrungsgemäß gut aussehen. */
export const VORSCHLAEGE = [
  { name: 'Minze', h: 152, s: 72, l: 66 },
  { name: 'Himmel', h: 205, s: 85, l: 64 },
  { name: 'Veilchen', h: 268, s: 72, l: 70 },
  { name: 'Koralle', h: 8, s: 82, l: 68 },
  { name: 'Bernstein', h: 38, s: 92, l: 62 },
  { name: 'Lagune', h: 178, s: 70, l: 58 },
  { name: 'Magenta', h: 322, s: 76, l: 68 },
  { name: 'Limette', h: 88, s: 68, l: 60 },
]

anwenden()


// ── Haut: die normale, ruhige Fassung oder das JARVIS-HUD ──────────────
// Bewusst über ein Attribut am <html> statt über React-State: so greift
// die Wahl schon beim ersten Bild, ohne dass die Seite kurz falsch aussieht.
const HAUT_SCHLUESSEL = 'urai-haut'

export function hautLesen() {
  try {
    return localStorage.getItem(HAUT_SCHLUESSEL) === 'jarvis' ? 'jarvis' : 'normal'
  } catch {
    return 'normal'
  }
}

export function hautSetzen(haut) {
  const wert = haut === 'jarvis' ? 'jarvis' : 'normal'
  try {
    localStorage.setItem(HAUT_SCHLUESSEL, wert)
  } catch {}
  // JARVIS ist Cyan — sonst sieht das HUD aus wie ein Fremdkörper in einer
  // anderen Farbe. Das Farbrad bleibt danach frei: wer weiterdreht, behält
  // das HUD und bekommt seine Farbe.
  if (wert === 'jarvis') farbeSetzen({ h: 196, s: 78, l: 62 })
  hautAnwenden()
}

export function hautAnwenden() {
  const el = document.documentElement
  if (hautLesen() === 'jarvis') el.setAttribute('data-haut', 'jarvis')
  else el.removeAttribute('data-haut')
}

hautAnwenden()
