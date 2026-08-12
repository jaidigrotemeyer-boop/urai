#!/usr/bin/env node
// Text-Lektorat von Hand — ohne Server, ohne Agent.
//
//   node vermenschlichen.mjs aufsatz.md              nur messen, ohne Gehirn
//   node vermenschlichen.mjs aufsatz.md --schreiben  überarbeiten (braucht Schlüssel)
//   node vermenschlichen.mjs aufsatz.md --schreiben --ziel neu.md --ton sachlich
//   cat text.txt | node vermenschlichen.mjs -
import fs from 'node:fs'
import path from 'node:path'
import { messen } from './server/vermenschlichen.js'

const argv = process.argv.slice(2)
const MIT_WERT = new Set(['ziel', 'ton', 'extra'])
const werte = {}
const freie = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) freie.push(a)
  else if (MIT_WERT.has(a.slice(2))) werte[a.slice(2)] = argv[++i]
  else werte[a.slice(2)] = true
}

const hilfe = `
  URAI Text-Lektorat — zeigt, was einen Text maschinell klingen lässt

  node vermenschlichen.mjs <datei>              messen
  node vermenschlichen.mjs <datei> --schreiben  überarbeiten lassen
  node vermenschlichen.mjs - < text.txt         von der Standardeingabe

  --ziel <datei>   wohin das Ergebnis geschrieben wird
  --ton <wort>     gewünschter Ton, z.B. sachlich, locker
  --extra <satz>   zusätzliche Anweisung ans Lektorat
`

if (!freie.length || werte.hilfe || werte.help) {
  console.log(hilfe)
  process.exit(0)
}

function ausgeben(m) {
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
}

try {
  const quelle = freie[0]
  const roh = quelle === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(quelle, 'utf8')

  if (!werte.schreiben) {
    console.log(`\n  ${quelle === '-' ? 'Standardeingabe' : path.basename(quelle)}`)
    ausgeben(messen(roh))
    process.exit(0)
  }

  // Erst hier laden: das Gehirn zieht die Einstellungen nach, und wer nur
  // messen will, soll dafür keinen Schlüssel brauchen.
  const { humanisieren } = await import('./server/vermenschlichen.js')
  const { text, vorher, nachher, provider, model } = await humanisieren(roh, {
    ton: typeof werte.ton === 'string' ? werte.ton : undefined,
    extra: typeof werte.extra === 'string' ? werte.extra : undefined,
  })

  console.log(`\n  Lektoriert mit ${provider}${model ? ' / ' + model : ''}\n`)
  console.log('  vorher')
  ausgeben(vorher)
  console.log('  nachher')
  ausgeben(nachher)

  if (typeof werte.ziel === 'string') {
    fs.writeFileSync(werte.ziel, text, 'utf8')
    console.log(`  Gespeichert: ${path.resolve(werte.ziel)}\n`)
  } else {
    console.log('─'.repeat(60) + '\n')
    console.log(text + '\n')
  }
} catch (err) {
  console.error(`\n  ${err.message}\n`)
  process.exit(1)
}
