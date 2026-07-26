// Kraft 3: Computer sehen und steuern (macOS).
// Sehen = OCR (Apple Vision) + Bedienhilfen-Baum + Bild-Modell.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import { look } from '../brain.js'
import { capture, ocr, osa, screenSize, frontContext, uiElements, findText, report } from '../screen.js'

const pexec = promisify(execFile)
const CLICLICK = ['/opt/homebrew/bin/cliclick', '/usr/local/bin/cliclick'].find((p) => fssync.existsSync(p))

// Letzter Blick — damit mac_click_text nicht jedes Mal neu scannen muss
let lastLook = { lines: [], at: 0, size: null }

async function lookAtScreen({ withVision, question, emit } = {}) {
  const size = await screenSize()
  const shot = await capture()
  emit?.('screen', shot.base64)

  let lines = []
  let front = {}
  let ui = { items: [] }
  try {
    ;[lines, front, ui] = await Promise.all([
      ocr(shot.file, size).catch(() => []),
      frontContext().catch(() => ({})),
      uiElements().catch(() => ({ items: [] })),
    ])
  } finally {
    // Bild verstanden → Bild weg. Es bleibt nur Text übrig.
    await fs.unlink(shot.file).catch(() => {})
  }

  lastLook = { lines, at: Date.now(), size }

  let note
  if (withVision) {
    try {
      note = `\nAugen-Modell sagt: ${await look({
        imageBase64: shot.base64,
        question: question || 'Beschreibe knapp, was auf diesem Bildschirm zu sehen ist und was der Nutzer gerade tut.',
      })}`
    } catch (err) {
      note = `\n(Augen-Modell nicht erreichbar: ${err.message})`
    }
  }
  return { size, lines, front, ui, text: report({ size, front, lines, ui, note }) }
}

async function clickAt(x, y, button = 'left') {
  const X = Math.round(x)
  const Y = Math.round(y)
  if (CLICLICK) {
    const cmd = button === 'right' ? `rc:${X},${Y}` : button === 'double' ? `dc:${X},${Y}` : `c:${X},${Y}`
    await pexec(CLICLICK, [cmd])
  } else {
    const how = button === 'right' ? 'right click' : button === 'double' ? 'double click' : 'click'
    await osa(`tell application "System Events" to ${how} at {${X}, ${Y}}`)
  }
  return { x: X, y: Y }
}

export const computerTools = [
  {
    name: 'mac_read_screen',
    description:
      'Bildschirm lesen und verstehen. Gibt JEDEN sichtbaren Text mit Klick-Punkt, dazu die echten Knöpfe und Felder der vordersten App. Das ist das Haupt-Auge — nutze es, bevor du irgendwo klickst.',
    parameters: {
      type: 'object',
      properties: {
        describe: {
          type: 'boolean',
          description: 'Zusätzlich das Bild-Modell beschreiben lassen (langsamer, gut bei Bildern ohne Text)',
        },
        question: { type: 'string', description: 'Was genau willst du auf dem Bildschirm wissen?' },
      },
    },
    async run({ describe = false, question }, ctx) {
      const r = await lookAtScreen({ withVision: describe, question, emit: ctx?.emit })
      return r.text
    },
  },
  {
    name: 'mac_find_text',
    description: 'Text auf dem Bildschirm suchen. Gibt die Klick-Punkte aller Treffer.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Der gesuchte Text' },
        rescan: { type: 'boolean', description: 'Bildschirm neu lesen statt letzten Blick nehmen' },
      },
      required: ['text'],
    },
    async run({ text, rescan = false }, ctx) {
      const stale = Date.now() - lastLook.at > 8000
      const lines = rescan || stale || !lastLook.lines.length
        ? (await lookAtScreen({ emit: ctx?.emit })).lines
        : lastLook.lines
      const hits = findText(lines, text)
      if (!hits.length) return `"${text}" nicht auf dem Bildschirm gefunden.`
      return hits.map((h, i) => `${i + 1}. (${h.x},${h.y}) ${h.text}`).join('\n')
    },
  },
  {
    name: 'mac_click_text',
    description:
      'Auf sichtbaren Text klicken — sicherer als blind auf Koordinaten. Liest den Bildschirm, findet den Text, klickt in die Mitte.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Beschriftung, auf die geklickt werden soll' },
        nth: { type: 'number', description: 'Welcher Treffer, falls mehrere (1 = erster)' },
        button: { type: 'string', description: 'left | right | double' },
      },
      required: ['text'],
    },
    danger: true,
    async run({ text, nth = 1, button = 'left' }, ctx) {
      const fresh = await lookAtScreen({ emit: ctx?.emit })
      // Erst die echten UI-Elemente (verlässlich), dann OCR-Text
      const uiHit = (fresh.ui.items || []).filter(
        (e) => (e.name || e.value || '').toLowerCase().includes(text.toLowerCase())
      )
      const hits = uiHit.length ? uiHit : findText(fresh.lines, text)
      if (!hits.length) return `"${text}" nicht gefunden. Erst mac_read_screen ansehen.`
      const target = hits[Math.min(nth, hits.length) - 1]
      const { x, y } = await clickAt(target.x, target.y, button)
      return `Geklickt auf "${target.name || target.text}" bei ${x},${y}${hits.length > 1 ? ` (${hits.length} Treffer, genommen: ${nth})` : ''}`
    },
  },
  {
    name: 'mac_screenshot',
    description: 'Reines Bildschirmfoto fürs Anschauen. Zum Lesen lieber mac_read_screen nehmen.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Frage ans Bild-Modell' } },
    },
    async run({ question }, ctx) {
      const size = await screenSize()
      const shot = await capture()
      ctx?.emit?.('screen', shot.base64)
      await fs.unlink(shot.file).catch(() => {})
      if (!question) return `Bild gemacht. Bildschirm ${size.width}x${size.height} Punkte.`
      return `Bildschirm ${size.width}x${size.height}.\n${await look({ imageBase64: shot.base64, question })}`
    },
  },
  {
    name: 'mac_ui',
    description:
      'Nur die bedienbaren Elemente der vordersten App holen (Knöpfe, Felder, Links) — schnell, ohne Foto.',
    parameters: { type: 'object', properties: {} },
    async run() {
      const [front, ui] = await Promise.all([frontContext(), uiElements()])
      if (ui.error) return `Bedienhilfen-Baum nicht lesbar: ${ui.error}\nErlaubnis geben: Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen.`
      if (!ui.items.length) return `Vorne: ${front.app}. Keine bedienbaren Elemente gefunden — nimm mac_read_screen.`
      return `Vorne: ${front.app}${front.window ? ` — "${front.window}"` : ''}\n${ui.items
        .map((e) => `(${e.x},${e.y}) [${e.role}] ${e.name || e.value}${e.enabled ? '' : ' (aus)'}`)
        .join('\n')}`
    },
  },
  {
    name: 'mac_click',
    description: 'An genaue Stelle klicken. Punkte zählen von links oben. Vorher mac_read_screen!',
    parameters: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string' } },
      required: ['x', 'y'],
    },
    danger: true,
    async run({ x, y, button = 'left' }) {
      const p = await clickAt(x, y, button)
      return `Geklickt (${button}) bei ${p.x},${p.y}`
    },
  },
  {
    name: 'mac_move',
    description: 'Maus bewegen, ohne klicken.',
    parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
    danger: true,
    async run({ x, y }) {
      if (!CLICLICK) throw new Error('Braucht cliclick: brew install cliclick')
      await pexec(CLICLICK, [`m:${Math.round(x)},${Math.round(y)}`])
      return `Maus bei ${Math.round(x)},${Math.round(y)}`
    },
  },
  {
    name: 'mac_type',
    description: 'Text tippen, ins Fenster das gerade vorne ist.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    danger: true,
    async run({ text }) {
      const esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      await osa(`tell application "System Events" to keystroke "${esc}"`)
      return `Getippt: ${text.slice(0, 80)}`
    },
  },
  {
    name: 'mac_key',
    description: 'Taste drücken: "return", "tab", "escape", "cmd+s", "cmd+shift+4", "down".',
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    danger: true,
    async run({ key }) {
      const parts = key.toLowerCase().split('+')
      const base = parts.pop()
      const mods = parts
        .map((m) => ({ cmd: 'command down', ctrl: 'control down', alt: 'option down', opt: 'option down', shift: 'shift down' }[m]))
        .filter(Boolean)
      const codes = {
        return: 36, enter: 36, tab: 48, space: 49, delete: 51, escape: 53, esc: 53,
        left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121,
      }
      const using = mods.length ? ` using {${mods.join(', ')}}` : ''
      await osa(
        base in codes
          ? `tell application "System Events" to key code ${codes[base]}${using}`
          : `tell application "System Events" to keystroke "${base}"${using}`
      )
      return `Taste: ${key}`
    },
  },
  {
    name: 'mac_scroll',
    description: 'Scrollen: up, down, left, right.',
    parameters: {
      type: 'object',
      properties: { direction: { type: 'string' }, amount: { type: 'number' } },
      required: ['direction'],
    },
    danger: true,
    async run({ direction, amount = 5 }) {
      const codes = { up: 126, down: 125, left: 123, right: 124 }
      const code = codes[direction]
      if (!code) throw new Error('Richtung: up, down, left oder right')
      for (let i = 0; i < amount; i++) await osa(`tell application "System Events" to key code ${code}`)
      return `Gescrollt ${direction} x${amount}`
    },
  },
  {
    name: 'mac_open_app',
    description: 'App öffnen und nach vorn holen, z.B. "Safari", "Notes", "Finder".',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    danger: true,
    async run({ name }) {
      await pexec('open', ['-a', name], { timeout: 15000 })
      await new Promise((r) => setTimeout(r, 800))
      await osa(`tell application "${name.replace(/"/g, '')}" to activate`).catch(() => {})
      return `App vorne: ${name}`
    },
  },
  {
    name: 'mac_apps',
    description: 'Welche Apps laufen, welche ist vorne?',
    parameters: { type: 'object', properties: {} },
    async run() {
      const front = await frontContext()
      const list = await osa(
        'tell application "System Events" to get name of every application process whose background only is false'
      )
      return `Vorne: ${front.app}${front.window ? ` — "${front.window}"` : ''}\nOffen: ${list}`
    },
  },
  {
    name: 'mac_applescript',
    description: 'AppleScript laufen lassen. Für Mail, Notes, Kalender, Finder, Musik — alles was macOS kann.',
    parameters: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] },
    danger: true,
    async run({ script }) {
      return (await osa(script)) || '(ok, keine Ausgabe)'
    },
  },
  {
    name: 'mac_notify',
    description: 'Meldung auf dem Bildschirm zeigen.',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' }, message: { type: 'string' } },
      required: ['message'],
    },
    async run({ title = 'URAI', message }) {
      await osa(`display notification "${message.replace(/"/g, "'")}" with title "${title.replace(/"/g, "'")}"`)
      return 'Meldung gezeigt.'
    },
  },
]
