// Kraft: Text lektorieren. Das Messen steckt in ../vermenschlichen.js,
// hier steht nur, wie URAI es bedienen darf.
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '../config.js'
import { messen, humanisieren } from '../vermenschlichen.js'

// Gleiche Wache wie in files.js: nichts wird außerhalb vom Revier angefasst.
function resolve(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('pfad fehlt oder ist kein Text.')
  const c = loadConfig()
  const abs = path.resolve(p.startsWith('~') ? p.replace(/^~/, process.env.HOME) : p)
  const root = path.resolve(c.workspace || process.env.HOME)
  if (!abs.startsWith(root)) throw new Error(`Weg liegt außerhalb vom Revier (${root}): ${abs}`)
  return abs
}

async function holen({ text, pfad }) {
  if (typeof text === 'string' && text.trim()) return text
  if (pfad) return await fs.readFile(resolve(pfad), 'utf8')
  throw new Error('Gib text an oder pfad zu einer Datei.')
}

function bericht(m) {
  const zeilen = [
    `${m.woerter} Wörter · ${m.satz.anzahl} Sätze · ∅ ${m.satz.mittel} Wörter (${m.satz.min}–${m.satz.max}, Streuung ${m.satz.streuung})`,
    `Gleichmaß ${m.satz.gleichmass} · ${m.mittelbauProzent} % der Sätze im Mittelbau (12–25 Wörter)`,
    `Floskeln: ${m.floskeln.anzahl} (${m.floskeln.proTausend} je 1000 Wörter)`,
  ]
  if (m.floskeln.beispiele.length) zeilen.push('  ' + m.floskeln.beispiele.join('\n  '))
  if (m.auffaellig.length) zeilen.push('', 'Auffällig:', ...m.auffaellig.map((a) => '– ' + a))
  zeilen.push('', `Urteil: ${m.urteil}`)
  return zeilen.join('\n')
}

export const textTools = [
  {
    name: 'text_messen',
    description:
      'Text darauf abklopfen, was ihn maschinell klingen lässt: gleichförmige Satzlängen, Floskeln, ' +
      'wiederholte Satzanfänge, Wortwiederholung, Gedankenstriche, Dreier-Aufzählungen. ' +
      'Nennt jede Stelle mit Zahl und Beispiel. Rechnet lokal, braucht kein Gehirn.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Der Text selbst' },
        pfad: { type: 'string', description: 'Oder eine Datei, z.B. ~/Schreibtisch/aufsatz.md' },
      },
    },
    async run(args) {
      return bericht(messen(await holen(args)))
    },
  },
  {
    name: 'text_menschlich',
    description:
      'Text lektorieren: Satzlängen mischen, Floskeln streichen, wiederholte Satzanfänge auflösen, ' +
      'Substantivketten aktivieren. Inhalt und Sprache bleiben, die Länge auch. ' +
      'Nutzt das Gehirn und schreibt vorher/nachher die Messwerte dazu.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Der Text selbst' },
        pfad: { type: 'string', description: 'Oder eine Datei, die gelesen wird' },
        ziel: { type: 'string', description: 'Wohin speichern. Ohne Angabe kommt der Text nur zurück.' },
        ton: { type: 'string', description: 'Gewünschter Ton, z.B. „sachlich", „locker", „wissenschaftlich"' },
        extra: { type: 'string', description: 'Zusätzliche Anweisung ans Lektorat' },
      },
    },
    async run({ ziel, ton, extra, ...quelle }, ctx) {
      const roh = await holen(quelle)
      const { text, vorher, nachher, provider, model } = await humanisieren(roh, { ton, extra, signal: ctx?.signal })
      const kopf = [
        `Lektoriert mit ${provider}${model ? ' / ' + model : ''}`,
        `vorher:  ${vorher.urteil} (Gleichmaß ${vorher.satz.gleichmass}, ${vorher.floskeln.anzahl} Floskeln)`,
        `nachher: ${nachher.urteil} (Gleichmaß ${nachher.satz.gleichmass}, ${nachher.floskeln.anzahl} Floskeln)`,
      ]
      if (ziel) {
        const abs = resolve(ziel)
        await fs.writeFile(abs, text, 'utf8')
        return [...kopf, '', `Gespeichert: ${abs}`].join('\n')
      }
      return [...kopf, '', text].join('\n')
    },
  },
]
