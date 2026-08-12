// Kraft: Rhythmus menschlich machen. Alles Rechnen steckt in ../humanizer.js,
// hier steht nur, wie URAI die Regler bedienen darf.
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '../config.js'
import { humanisieren, messen, muster, VORLAGEN } from '../humanizer.js'

// Gleiche Wache wie in files.js: nichts wird außerhalb vom Revier angefasst.
function resolve(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('pfad fehlt oder ist kein Text.')
  const c = loadConfig()
  const abs = path.resolve(p.startsWith('~') ? p.replace(/^~/, process.env.HOME) : p)
  const root = path.resolve(c.workspace || process.env.HOME)
  if (!abs.startsWith(root)) throw new Error(`Weg liegt außerhalb vom Revier (${root}): ${abs}`)
  return abs
}

const endung = (p) => (p.toLowerCase().endsWith('.mid') || p.toLowerCase().endsWith('.midi') ? p : p + '.mid')

// Ohne Zielpfad neben die Vorlage legen, statt sie zu überschreiben: ein
// Humanizer, der sein eigenes Original frisst, ist einmal zu oft ausgeführt.
const danebenLegen = (p) => p.replace(/(\.midi?)$/i, '') + '-menschlich.mid'

function bericht(m) {
  return [
    `${m.noten} Noten · ${m.bpm} bpm · ${m.ppq} Ticks pro Viertel`,
    `Timing: ∅ ${m.timing.mittel} ms neben dem Raster (σ ${m.timing.streuung}, bis ${m.timing.max} ms)`,
    `Anschlag: ∅ ${m.velocity.mittel} (σ ${m.velocity.jeInstrument} je Instrument, ${m.velocity.stufen} Stufen, ${m.velocity.min}–${m.velocity.max})`,
    `Urteil: ${m.urteil}`,
  ].join('\n')
}

export const midiTools = [
  {
    name: 'midi_humanisieren',
    description:
      'Eine MIDI-Datei menschlich machen: Timing leicht verschieben, Anschlagstärke variieren, Swing geben, ' +
      'Akkorde spreizen, Notenlängen atmen lassen. Starre Sequencer- und Drum-Computer-Muster klingen danach gespielt. ' +
      'Vorlagen: subtil, expressiv, stark.',
    parameters: {
      type: 'object',
      properties: {
        pfad: { type: 'string', description: 'Welche MIDI-Datei, z.B. ~/Musik/beat.mid' },
        ziel: { type: 'string', description: 'Wohin speichern. Ohne Angabe: <name>-menschlich.mid daneben.' },
        vorlage: { type: 'string', description: `Fertige Einstellung: ${Object.keys(VORLAGEN).join(', ')}` },
        timing: { type: 'number', description: 'Streuung der Anschlagszeit in Millisekunden, z.B. 10' },
        velocity: { type: 'number', description: 'Streuung der Anschlagstärke, z.B. 10 (MIDI 0-127)' },
        swing: { type: 'number', description: '0 = gerade, 0.35 = angenehm, 1 = volle Triole' },
        swingRaster: { type: 'number', description: '8 für Achtel-Swing (Standard), 16 für Sechzehntel' },
        spreizung: { type: 'number', description: 'Akkord-Spreizung in Millisekunden, z.B. 12' },
        laenge: { type: 'number', description: 'Streuung der Notenlänge als Anteil, z.B. 0.1 für ±10 %' },
        stabilitaet: { type: 'number', description: '0-1: wie ruhig die Eins bleibt (Standard 0.6)' },
        akzent: { type: 'number', description: '0-1: wie stark betonte Zählzeiten lauter werden' },
        kanaele: { type: 'array', items: { type: 'number' }, description: 'Nur diese MIDI-Kanäle (0-15)' },
        saat: { type: 'number', description: 'Zufalls-Saat. Gleiche Saat = exakt gleiches Ergebnis.' },
      },
      required: ['pfad'],
    },
    danger: true,
    async run({ pfad, ziel, ...optionen }) {
      const abs = resolve(pfad)
      const roh = await fs.readFile(abs)
      const { datei, bericht: b } = humanisieren(roh, optionen)
      const zielAbs = resolve(ziel ? endung(ziel) : danebenLegen(abs))
      await fs.writeFile(zielAbs, datei)
      const vorher = messen(roh)
      const nachher = messen(datei)
      return [
        `Humanisiert: ${zielAbs} (${b.noten} Noten, ${b.bewegt} verschoben, Saat ${b.saat})`,
        `Verschiebung: ∅ ${b.verschiebungMs.mittel} ms, σ ${b.verschiebungMs.streuung} ms, ${b.verschiebungMs.min}…${b.verschiebungMs.max} ms`,
        '',
        `Vorher:  ${vorher.urteil}`,
        `Nachher: ${nachher.urteil}`,
      ].join('\n')
    },
  },
  {
    name: 'midi_messen',
    description:
      'Eine MIDI-Datei auf Menschlichkeit prüfen: Abweichung vom Raster, Verteilung der Anschlagstärke, ' +
      'Notenlängen. Sagt, ob das Material maschinell oder gespielt wirkt.',
    parameters: {
      type: 'object',
      properties: { pfad: { type: 'string', description: 'Welche MIDI-Datei' } },
      required: ['pfad'],
    },
    async run({ pfad }) {
      return bericht(messen(await fs.readFile(resolve(pfad))))
    },
  },
  {
    name: 'midi_muster',
    description:
      'Einen absichtlich stocksteifen Schlagzeug-Loop als MIDI-Datei erzeugen (Bassdrum 1+3, Snare 2+4, Hi-Hat auf Achteln). ' +
      'Zum Ausprobieren des Humanizers, wenn noch keine eigene Datei da ist.',
    parameters: {
      type: 'object',
      properties: {
        pfad: { type: 'string', description: 'Wohin speichern, z.B. ~/Musik/roh.mid' },
        takte: { type: 'number', description: 'Wie viele Takte (Standard 4)' },
        bpm: { type: 'number', description: 'Tempo (Standard 100)' },
      },
      required: ['pfad'],
    },
    danger: true,
    async run({ pfad, takte, bpm }) {
      const abs = resolve(endung(pfad))
      const datei = muster({ takte, bpm })
      await fs.writeFile(abs, datei)
      const m = messen(datei)
      return `Testmuster geschrieben: ${abs} (${m.noten} Noten, ${m.bpm} bpm)\n${m.urteil}`
    },
  },
]
