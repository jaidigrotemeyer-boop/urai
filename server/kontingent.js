// Kontingent: mitzählen, wie viel von den Gratis-Stufen schon weg ist.
//
// Der häufigste Ärger im Alltag ist "Kontingent aufgebraucht" — und zwar
// ohne Vorwarnung, mitten in der Arbeit. Hier wird jeder Zug mitgeschrieben,
// damit die Leiste unten zeigt, wie viel noch da ist, BEVOR es knallt.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.js'

const DATEI = path.join(DATA_DIR, 'kontingent.json')

// Was die Gratis-Stufen ungefähr hergeben. Anbieter ändern das ständig,
// darum sind es Richtwerte — verstellbar in den Einstellungen.
export const GRENZEN = {
  gemini: { tag: 1000, minute: 12, name: 'Gemini' },
  cerebras: { tag: 14400, minute: 30, name: 'Cerebras' },
  groq: { tag: 14400, minute: 28, name: 'Groq' },
  openrouter: { tag: 50, minute: 18, name: 'OpenRouter' },
}

let buch = laden()

function laden() {
  try {
    const roh = JSON.parse(fs.readFileSync(DATEI, 'utf8'))
    if (roh?.zuege) return roh
  } catch {}
  return { zuege: [], zuletztGespeichert: 0 }
}

/** Nur alle paar Sekunden schreiben — sonst rattert die Platte bei jedem Zug. */
function sichern() {
  const jetzt = Date.now()
  if (jetzt - buch.zuletztGespeichert < 5000) return
  buch.zuletztGespeichert = jetzt
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DATEI, JSON.stringify(buch))
  } catch {}
}

/** Alles älter als 25 Stunden fliegt raus — mehr braucht niemand. */
function aufraeumen() {
  const grenze = Date.now() - 25 * 3600_000
  if (buch.zuege.length > 20 && buch.zuege[0].t < grenze) {
    buch.zuege = buch.zuege.filter((z) => z.t >= grenze)
  }
}

/**
 * Einen Zug eintragen.
 * @param {string} provider
 * @param {boolean} ok        hat er geantwortet?
 * @param {number} zeichen    wie viel Text kam zurück
 */
export function zaehle(provider, ok, zeichen = 0) {
  buch.zuege.push({ t: Date.now(), p: provider, ok: ok ? 1 : 0, z: zeichen })
  aufraeumen()
  sichern()
}

/** Wie viele Züge in den letzten ms Millisekunden? */
function zaehlen(provider, ms) {
  const ab = Date.now() - ms
  return buch.zuege.filter((z) => z.p === provider && z.t >= ab).length
}

/**
 * Stand für die Anzeige: pro Gehirn, wie voll die Minute und der Tag sind.
 * @returns {Array<{provider, name, minute, minuteMax, tag, tagMax, anteil, eng}>}
 */
export function stand(ketten = Object.keys(GRENZEN)) {
  return ketten.map((p) => {
    const g = GRENZEN[p] || { tag: 1000, minute: 20, name: p }
    const minute = zaehlen(p, 60_000)
    const tag = zaehlen(p, 24 * 3600_000)
    const anteilMinute = g.minute ? minute / g.minute : 0
    const anteilTag = g.tag ? tag / g.tag : 0
    const anteil = Math.max(anteilMinute, anteilTag)
    return {
      provider: p,
      name: g.name,
      minute,
      minuteMax: g.minute,
      tag,
      tagMax: g.tag,
      anteil: Math.min(1, Math.round(anteil * 100) / 100),
      eng: anteil > 0.75, // ab hier lohnt es sich, den Nutzer zu warnen
    }
  })
}

/** Wie viel Text heute insgesamt durchgegangen ist — grobes Gefühl für den Verbrauch. */
export function heute() {
  const ab = Date.now() - 24 * 3600_000
  const von = buch.zuege.filter((z) => z.t >= ab)
  return {
    zuege: von.length,
    fehler: von.filter((z) => !z.ok).length,
    zeichen: von.reduce((s, z) => s + (z.z || 0), 0),
  }
}

export function zuruecksetzen() {
  buch = { zuege: [], zuletztGespeichert: 0 }
  try {
    fs.unlinkSync(DATEI)
  } catch {}
}
