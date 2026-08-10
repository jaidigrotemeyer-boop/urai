// Smart Home, ohne Smart-Home-Anbindung.
//
// HomeKit hat keine offene Schnittstelle für uns — Licht, Heizung, Steckdosen,
// Türschlösser und Szenen hängen an Siri. Der Nutzer hat aber längst
// Kurzbefehle gebaut, die genau das schalten, und seit macOS 12 gibt es dafür
// ein CLI. Also bauen wir nichts nach, sondern ziehen an der Schnur, die schon
// da ist: was in der Kurzbefehle-App steht, kann URAI ab jetzt auslösen.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { IST_MAC, macPruefen } from '../screen.js'

const pexec = promisify(execFile)

// Ein Kurzbefehl, der auf ein Gerät wartet — Rollo, Türschloss, Lautsprecher —
// braucht schon mal ein paar Sekunden. Gemessen: ein Timer-Kurzbefehl läuft
// minutenlang und kehrt nie zurück. Ohne harte Grenze steht der Agent still,
// darum nach einer Minute Schluss.
const ZEITLIMIT = 60000

// Wer 200 Kurzbefehle hat, braucht sie nicht alle im Gehirn — die Liste dient
// nur dazu, den richtigen Namen zu finden. Der Rest wird gezählt statt genannt.
const MAX_LISTE = 80

// Ausgabe eines Kurzbefehls kann ein ganzes Dokument sein. Das Gehirn braucht
// davon den Anfang, nicht das Kilo.
const MAX_AUSGABE = 4000

function tempPfad(zweck) {
  return path.join(os.tmpdir(), `urai-kurzbefehl-${zweck}-${randomUUID()}`)
}

/**
 * Fehler des CLI in etwas übersetzen, mit dem der Nutzer etwas anfangen kann.
 *
 * `shortcuts` meldet sich auf Deutsch oder Englisch, je nach Systemsprache —
 * darum wird auf beide Wortlaute geprüft, statt sich auf einen zu verlassen.
 */
function fehlerText(err, name) {
  if (err.code === 'ENOENT') {
    return IST_MAC
      ? 'Das Kommando "shortcuts" gibt es auf diesem Mac nicht. Ein CLI hat die ' +
        'Kurzbefehle-App erst ab macOS 12 (Monterey) — auf älteren Systemen lässt ' +
        'sich von hier aus kein Kurzbefehl starten.'
      : 'Kurzbefehle gibt es nur auf macOS — auf diesem System ist nichts zu holen.'
  }
  // execFile bricht bei Zeitüberschreitung per Signal ab — das ist kein
  // Kurzbefehl-Fehler, sondern unsere eigene Reißleine.
  if (err.killed || err.signal) {
    return (
      `"${name}" lief länger als ${ZEITLIMIT / 1000} Sekunden und wurde abgebrochen. ` +
      'Wartet der Kurzbefehl auf eine Eingabe oder auf ein Gerät, das nicht antwortet?'
    )
  }
  const meldung = String(err.stderr || err.message || '').trim().replace(/^Error:\s*/, '') || 'unbekannter Fehler'
  if (/nicht gefunden|not be found|not found/i.test(meldung)) {
    return `${meldung} — der Name muss genau so lauten wie in der Kurzbefehle-App. Mit mac_kurzbefehle nachsehen, wie er wirklich heißt.`
  }
  return meldung
}

export const kurzbefehlTools = [
  {
    name: 'mac_kurzbefehle',
    description:
      'Zeigt die Kurzbefehle, die auf diesem Mac liegen. Darüber laufen Smart Home (Licht, Heizung, Steckdosen, Szenen) und alles andere, was sich der Nutzer gebaut hat.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Nur Namen zeigen, die das enthalten (z.B. "licht")' },
      },
    },
    async run({ search } = {}) {
      macPruefen('Kurzbefehle')
      let stdout
      try {
        ;({ stdout } = await pexec('shortcuts', ['list'], { timeout: ZEITLIMIT }))
      } catch (err) {
        throw new Error(fehlerText(err, 'shortcuts list'))
      }
      const alle = stdout.split('\n').map((z) => z.trim()).filter(Boolean)
      if (!alle.length) {
        return 'Auf diesem Mac liegt kein einziger Kurzbefehl. In der Kurzbefehle-App einen anlegen — dann kann URAI ihn auslösen.'
      }
      const treffer = search
        ? alle.filter((n) => n.toLowerCase().includes(String(search).toLowerCase()))
        : alle
      if (!treffer.length) return `Kein Kurzbefehl enthält "${search}". Insgesamt sind ${alle.length} da.`
      const gezeigt = treffer.slice(0, MAX_LISTE)
      const kopf = `${treffer.length} Kurzbefehl(e)${search ? ` für "${search}"` : ''}${
        treffer.length > gezeigt.length ? `, die ersten ${gezeigt.length}` : ''
      }:`
      return `${kopf}\n${gezeigt.join('\n')}`
    },
  },
  {
    name: 'mac_kurzbefehl',
    description:
      'Führt einen Kurzbefehl aus — damit Licht, Heizung, Steckdosen, Türschloss oder eine Szene schalten. Name genau wie in der Liste von mac_kurzbefehle.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name des Kurzbefehls, exakt' },
        input: { type: 'string', description: 'Text, den der Kurzbefehl als Eingabe bekommt' },
      },
      required: ['name'],
    },
    danger: true,
    async run({ name, input }) {
      macPruefen('Kurzbefehle')
      const kurz = String(name || '').trim()
      if (!kurz) throw new Error('Welcher Kurzbefehl? Mit mac_kurzbefehle nachsehen, wie er heißt.')

      // Ein- und Ausgabe laufen über Dateien statt über die Pipe: das CLI kennt
      // nur -i/-o, und über Dateien geht auch mehrzeiliger Text heil durch.
      const ausgabeDatei = tempPfad('aus')
      let eingabeDatei
      const args = ['run', kurz]
      try {
        if (input != null && String(input) !== '') {
          eingabeDatei = tempPfad('ein')
          await fs.writeFile(eingabeDatei, String(input), 'utf8')
          args.push('-i', eingabeDatei)
        }
        args.push('-o', ausgabeDatei)
        await pexec('shortcuts', args, { timeout: ZEITLIMIT })

        // Geprüft: das CLI legt die Ausgabedatei nur an, wenn der Kurzbefehl
        // wirklich etwas zurückgibt. Eine fehlende Datei ist also kein Fehler,
        // sondern der Normalfall beim Schalten.
        const roh = await fs.readFile(ausgabeDatei, 'utf8').catch(() => '')
        const text = roh.trim()
        if (!text) return `"${kurz}" ausgeführt. (keine Rückgabe)`
        const gekuerzt = text.length > MAX_AUSGABE ? `${text.slice(0, MAX_AUSGABE)}\n… (gekürzt)` : text
        return `"${kurz}" ausgeführt:\n${gekuerzt}`
      } catch (err) {
        throw new Error(fehlerText(err, kurz))
      } finally {
        // Temp-Dateien liegen im Systemordner und keiner räumt sie sonst weg.
        for (const datei of [ausgabeDatei, eingabeDatei]) {
          if (datei) await fs.unlink(datei).catch(() => {})
        }
      }
    },
  },
]
