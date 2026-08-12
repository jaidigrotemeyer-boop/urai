#!/usr/bin/env node
// Messen ohne Oberfläche — für die Kommandozeile.
//
//   node messen.mjs aufsatz.md
//   cat text.txt | node messen.mjs -
import fs from 'node:fs'
import path from 'node:path'
import { messen } from './server/messen.js'

const quelle = process.argv[2]
if (!quelle || quelle === '--hilfe') {
  console.log('\n  node messen.mjs <datei>     Text abklopfen')
  console.log('  node messen.mjs -          von der Standardeingabe\n')
  process.exit(quelle ? 0 : 1)
}

try {
  const roh = quelle === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(quelle, 'utf8')
  const m = messen(roh)
  console.log(`\n  ${quelle === '-' ? 'Standardeingabe' : path.basename(quelle)}`)
  console.log(`  ${m.woerter} Wörter · ${m.satz.anzahl} Sätze`)
  console.log(`  Satzlänge ∅ ${m.satz.mittel} (${m.satz.min}–${m.satz.max}), Streuung ${m.satz.streuung}, Gleichmaß ${m.satz.gleichmass}`)
  console.log(`  Mittelbau ${m.mittelbauProzent} % · Floskeln ${m.floskeln.anzahl} (${m.floskeln.proTausend} je 1000 Wörter)`)
  if (m.floskeln.beispiele.length) {
    console.log('')
    for (const b of m.floskeln.beispiele) console.log(`    ${b}`)
  }
  if (m.auffaellig.length) {
    console.log('\n  Auffällig:')
    for (const a of m.auffaellig) console.log(`    – ${a}`)
  }
  console.log(`\n  ${m.urteil}\n`)
} catch (err) {
  console.error(`\n  ${err.message}\n`)
  process.exit(1)
}
