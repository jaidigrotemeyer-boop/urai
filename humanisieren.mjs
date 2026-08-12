#!/usr/bin/env node
// Humanizer von Hand — ohne Server, ohne Agent, ohne Schlüssel.
//
//   node humanisieren.mjs beat.mid                       neben die Vorlage legen
//   node humanisieren.mjs beat.mid groove.mid --expressiv
//   node humanisieren.mjs beat.mid --timing 14 --swing 0.4 --saat 7
//   node humanisieren.mjs --muster roh.mid --takte 8 --bpm 92
//   node humanisieren.mjs --messen groove.mid
import fs from 'node:fs'
import path from 'node:path'
import { humanisieren, messen, muster, VORLAGEN } from './server/humanizer.js'

const argv = process.argv.slice(2)

// Schalter, die einen Wert nach sich ziehen. Ohne diese Liste weiß niemand,
// ob "beat.mid" hinter --swing der Zielname oder der Reglerwert sein soll.
const MIT_WERT = new Set([
  'muster', 'messen', 'takte', 'bpm', 'timing', 'velocity', 'swing', 'swingRaster',
  'spreizung', 'laenge', 'stabilitaet', 'akzent', 'kanaele', 'saat',
])

const werte = {}
const freie = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) freie.push(a)
  else if (MIT_WERT.has(a.slice(2))) werte[a.slice(2)] = argv[++i]
  else werte[a.slice(2)] = true
}

const dabei = (name) => werte[name] !== undefined
const wert = (name) => (typeof werte[name] === 'string' ? werte[name] : undefined)
const zahl = (name, ersatz) => {
  if (werte[name] === undefined) return ersatz
  const v = Number(werte[name])
  if (!Number.isFinite(v)) {
    console.error(`\n  --${name} braucht eine Zahl.\n`)
    process.exit(1)
  }
  return v
}

const hilfe = `
  URAI Humanizer — starre MIDI menschlich machen

  node humanisieren.mjs <datei.mid> [ziel.mid] [Regler]
  node humanisieren.mjs --muster <datei.mid> [--takte 4] [--bpm 100]
  node humanisieren.mjs --messen <datei.mid>

  Vorlagen:  ${Object.keys(VORLAGEN).map((v) => '--' + v).join('  ')}
  Regler:    --timing <ms>  --velocity <n>  --swing <0-1>  --swingRaster <8|16>
             --spreizung <ms>  --laenge <0-1>  --stabilitaet <0-1>  --akzent <0-1>
             --kanaele 9,10  --saat <zahl>
`

if (!argv.length || dabei('hilfe') || dabei('help')) {
  console.log(hilfe)
  process.exit(0)
}

try {
  if (dabei('muster')) {
    const ziel = wert('muster')
    if (!ziel) throw new Error('--muster braucht einen Dateinamen.')
    const datei = muster({ takte: zahl('takte', 4), bpm: zahl('bpm', 100) })
    fs.writeFileSync(ziel, datei)
    const m = messen(datei)
    console.log(`\n  Testmuster: ${path.resolve(ziel)}  (${m.noten} Noten, ${m.bpm} bpm)`)
    console.log(`  ${m.urteil}\n`)
  } else if (dabei('messen')) {
    const quelle = wert('messen')
    if (!quelle) throw new Error('--messen braucht einen Dateinamen.')
    const m = messen(fs.readFileSync(quelle))
    console.log(`\n  ${path.basename(quelle)} — ${m.noten} Noten · ${m.bpm} bpm · ${m.ppq} ppq`)
    console.log(`  Timing    ∅ ${m.timing.mittel} ms neben dem Raster (σ ${m.timing.streuung}, bis ${m.timing.max})`)
    console.log(`  Anschlag  ∅ ${m.velocity.mittel} (σ ${m.velocity.streuung} gesamt, σ ${m.velocity.jeInstrument} je Instrument, ${m.velocity.stufen} Stufen)`)
    console.log(`  Länge     ∅ ${m.laenge.mittel} Ticks (σ ${m.laenge.streuung})`)
    console.log(`  ${m.urteil}\n`)
  } else {
    const [quelle, zielArg] = freie
    if (!quelle) throw new Error('Welche MIDI-Datei? ' + hilfe)
    const ziel = zielArg || quelle.replace(/(\.midi?)$/i, '') + '-menschlich.mid'
    const vorlage = Object.keys(VORLAGEN).find(dabei)
    const kanaele = wert('kanaele')?.split(',').map(Number).filter(Number.isFinite)
    const roh = fs.readFileSync(quelle)
    const { datei, bericht } = humanisieren(roh, {
      vorlage,
      timing: zahl('timing'),
      velocity: zahl('velocity'),
      swing: zahl('swing'),
      swingRaster: zahl('swingRaster'),
      spreizung: zahl('spreizung'),
      laenge: zahl('laenge'),
      stabilitaet: zahl('stabilitaet'),
      akzent: zahl('akzent'),
      saat: zahl('saat'),
      kanaele: kanaele?.length ? kanaele : undefined,
    })
    fs.writeFileSync(ziel, datei)
    const vorher = messen(roh)
    const nachher = messen(datei)
    console.log(`\n  ${path.resolve(ziel)}`)
    console.log(`  ${bericht.noten} Noten, ${bericht.bewegt} verschoben · Vorlage ${vorlage || 'eigene Regler'} · Saat ${bericht.saat}`)
    console.log(`  Verschiebung ∅ ${bericht.verschiebungMs.mittel} ms (σ ${bericht.verschiebungMs.streuung}, ${bericht.verschiebungMs.min}…${bericht.verschiebungMs.max})`)
    console.log(`\n  vorher   ${vorher.urteil}`)
    console.log(`  nachher  ${nachher.urteil}\n`)
  }
} catch (err) {
  console.error(`\n  ${err.message}\n`)
  process.exit(1)
}
