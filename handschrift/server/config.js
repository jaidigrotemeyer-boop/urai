// Einstellungen liegen in data/einstellungen.json neben der App — nicht in der
// Cloud, nicht im Browser. Wer den Ordner löscht, ist die Schlüssel los, und
// sonst passiert nichts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORDNER = path.join(WURZEL, 'data')
const DATEI = path.join(ORDNER, 'einstellungen.json')

const STANDARD = {
  geminiKey: '',
  groqKey: '',
  openrouterKey: '',
  cerebrasKey: '',
  ton: '',
  zeichenProMinute: 260,
  vorlauf: 5, // Sekunden bis zum ersten Anschlag — Zeit, ins Zielfenster zu klicken
}

export function lesen() {
  try {
    return { ...STANDARD, ...JSON.parse(fs.readFileSync(DATEI, 'utf8')) }
  } catch {
    return { ...STANDARD }
  }
}

export function schreiben(teil) {
  const neu = { ...lesen(), ...teil }
  fs.mkdirSync(ORDNER, { recursive: true })
  // 0600: die Datei enthält Schlüssel. Andere Konten auf demselben Rechner
  // haben darin nichts zu suchen.
  fs.writeFileSync(DATEI, JSON.stringify(neu, null, 2), { mode: 0o600 })
  return neu
}

/** Was die Oberfläche sehen darf — Schlüssel nur als "ist gesetzt". */
export function oeffentlich() {
  const c = lesen()
  return {
    ton: c.ton,
    zeichenProMinute: c.zeichenProMinute,
    vorlauf: c.vorlauf,
    schluessel: {
      gemini: !!c.geminiKey,
      groq: !!c.groqKey,
      openrouter: !!c.openrouterKey,
      cerebras: !!c.cerebrasKey,
    },
  }
}
