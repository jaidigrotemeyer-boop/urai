// Kraft 3: Computer sehen und steuern (macOS).
// Sehen = OCR (Apple Vision) + Bedienhilfen-Baum + Bild-Modell.
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import { look } from '../brain.js'
import {
  capture,
  ocr,
  osa,
  screenSize,
  bildschirmListe,
  frontContext,
  uiElements,
  findText,
  report,
  eigeneFenster,
  ohneEigene,
  IST_MAC,
  macPruefen,
} from '../screen.js'
import { loadConfig } from '../config.js'
import { zeichenPlan, aufDauer, dauerLesen, abspielen, zeitText } from '../tippen.js'
import {
  screenSizeWin,
  captureWin,
  frontContextWin,
  appsWin,
  openAppWin,
  clickWin,
  moveWin,
  typeWin,
  keyWin,
  scrollWin,
} from '../screen.win.js'

const pexec = promisify(execFile)
const CLICLICK = ['/opt/homebrew/bin/cliclick', '/usr/local/bin/cliclick'].find((p) => fssync.existsSync(p))

// Letzter Blick — damit mac_click_text nicht jedes Mal neu scannen muss
let lastLook = { lines: [], at: 0, size: null }

async function lookAtScreen({ withVision, question, emit } = {}) {
  // Windows hat keine Vision-OCR und keinen Bedienhilfen-Baum — dafür
  // reicht das Bild-Modell. Ungenauer (keine Klick-Boxen), aber ehrlich.
  if (!IST_MAC) {
    const size = await screenSizeWin()
    const shot = await captureWin()
    emit?.('screen', shot.base64)
    const front = await frontContextWin().catch(() => ({}))
    const note = `Augen-Modell sagt: ${await look({
      imageBase64: shot.base64,
      question: question || 'Beschreibe knapp, was auf diesem Bildschirm zu sehen ist und was der Nutzer gerade tut.',
    }).catch((e) => `(nicht erreichbar: ${e.message})`)}`
    const lines = []
    const ui = { items: [] }
    lastLook = { lines, at: Date.now(), size }
    return { size, lines, front, ui, text: report({ size, front, lines, ui, note }) }
  }

  const size = await screenSize()
  const shot = await capture()
  emit?.('screen', shot.base64)

  let lines = []
  let front = {}
  let ui = { items: [] }
  let eigen = []
  try {
    ;[lines, front, ui, eigen] = await Promise.all([
      ocr(shot.file, size).catch(() => []),
      frontContext().catch(() => ({})),
      uiElements().catch(() => ({ items: [] })),
      eigeneFenster().catch(() => []),
    ])
  } finally {
    // Bild verstanden → Bild weg. Es bleibt nur Text übrig.
    await fs.unlink(shot.file).catch(() => {})
  }

  // Sein eigenes Fenster interessiert ihn nicht — es steht ja nur sein
  // eigener Chat drin. Weg damit, sonst liest er sich selbst vor.
  const vorher = lines.length
  lines = ohneEigene(lines, eigen)
  const selbstWeg = vorher - lines.length

  lastLook = { lines, at: Date.now(), size }

  let note = selbstWeg > 5 ? `(${selbstWeg} Zeilen aus dem eigenen URAI-Fenster übersprungen)` : undefined
  if (withVision) {
    try {
      note = `${note ? note + '\n' : ''}Augen-Modell sagt: ${await look({
        imageBase64: shot.base64,
        question: question || 'Beschreibe knapp, was auf diesem Bildschirm zu sehen ist und was der Nutzer gerade tut.',
      })}`
    } catch (err) {
      note = `${note ? note + '\n' : ''}(Augen-Modell nicht erreichbar: ${err.message})`
    }
  }
  return { size, lines, front, ui, text: report({ size, front, lines, ui, note }) }
}

/**
 * Den Zeiger sichtbar zum Ziel führen, statt ihn hinzubeamen.
 *
 * cliclick setzt die Maus sonst in einem Sprung — man sieht nur, dass sich
 * plötzlich etwas geändert hat, aber nicht WAS URAI tut. Eine geführte Bahn
 * macht sein Handeln nachvollziehbar: man erkennt das Ziel, bevor er klickt,
 * und kann rechtzeitig eingreifen.
 *
 * Gemessen: cliclicks eingebautes -e ist der einzig brauchbare Weg. Die Bahn
 * selbst aus vielen m:/w:-Schritten zu bauen dauerte 5,3 Sekunden statt 0,4 —
 * -w hat 20 ms Mindestwartezeit und jedes Event kostet extra. Mit -e sind es
 * ~230 ms bei Faktor 60. Unter 30 verfehlt die Bewegung ihr Ziel, darum die
 * Untergrenze; hinterher wird zur Sicherheit exakt gesetzt.
 */
async function mausGleiten(zielX, zielY) {
  const cfg = loadConfig()
  if (!cfg.mausGleiten || !CLICLICK) return
  const faktor = Math.max(30, Math.min(200, Number(cfg.mausGleitenStaerke) || 60))
  try {
    await pexec(CLICLICK, ['-e', String(faktor), `m:${zielX},${zielY}`])
  } catch {} // Eine misslungene Bewegung darf den Klick nicht verhindern
}

async function clickAt(x, y, button = 'left') {
  const X = Math.round(x)
  const Y = Math.round(y)
  if (!IST_MAC) {
    await clickWin(X, Y, button)
    return { x: X, y: Y }
  }
  if (CLICLICK) {
    await mausGleiten(X, Y) // erst sichtbar hinfahren, dann klicken
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
      if (!IST_MAC) {
        throw new Error(
          'Auf Windows gibt es noch keine Text-Erkennung mit Klick-Punkten. ' +
            'Nimm mac_read_screen mit describe=true für eine Beschreibung, dann mac_click mit geschätzten Koordinaten.'
        )
      }
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
      if (!IST_MAC) {
        throw new Error(
          'Auf Windows fehlt die Text-Erkennung mit Klick-Punkten. Nimm mac_click mit Koordinaten.'
        )
      }
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
      if (!IST_MAC) {
        const size = await screenSizeWin()
        const shot = await captureWin()
        ctx?.emit?.('screen', shot.base64)
        if (!question) return `Bild gemacht. Bildschirm ${size.width}x${size.height} Punkte.`
        return `Bildschirm ${size.width}x${size.height}.\n${await look({ imageBase64: shot.base64, question })}`
      }
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
      macPruefen('Der Bedienhilfen-Baum')
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
      if (!IST_MAC) return moveWin(x, y)
      if (!CLICLICK) throw new Error('Braucht cliclick: brew install cliclick')
      await mausGleiten(Math.round(x), Math.round(y))
      await pexec(CLICLICK, [`m:${Math.round(x)},${Math.round(y)}`])
      return `Maus bei ${Math.round(x)},${Math.round(y)}`
    },
  },
  {
    name: 'mac_type',
    description:
      'Text tippen, ins Fenster das gerade vorne ist. Umlaute, Zeilenumbrüche und langer Text ' +
      'gehen über die Zwischenablage — das ist zuverlässiger als Zeichen für Zeichen.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        langsam: { type: 'boolean', description: 'Wirklich Taste für Taste tippen (für Felder, die Einfügen sperren)' },
      },
      required: ['text'],
    },
    danger: true,
    async run({ text, langsam = false }) {
      if (!IST_MAC) return typeWin(text)
      const heikel = /[^\x20-\x7E]/.test(text) || text.length > 60 || text.includes('\n')

      if (!langsam && heikel) {
        // Über die Zwischenablage: schnell, und Umlaute kommen richtig an
        const alt = await pexec('pbpaste', [], { maxBuffer: 4 * 1024 * 1024 })
          .then((r) => r.stdout)
          .catch(() => null)

        await new Promise((fertig, schief) => {
          const p = spawn('pbcopy')
          p.on('error', schief)
          p.on('close', () => fertig())
          p.stdin.end(text)
        })

        await osa('tell application "System Events" to keystroke "v" using {command down}')
        await new Promise((r) => setTimeout(r, 250))

        // Zwischenablage zurückgeben, wie sie war
        if (alt !== null) {
          await new Promise((fertig) => {
            const p = spawn('pbcopy')
            p.on('close', fertig)
            p.on('error', fertig)
            p.stdin.end(alt)
          })
        }
        return `Eingefügt (${text.length} Zeichen): ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`
      }

      const esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      await osa(`tell application "System Events" to keystroke "${esc}"`)
      return `Getippt: ${text.slice(0, 80)}`
    },
  },
  {
    name: 'mac_drag',
    description: 'Von einer Stelle zur anderen ziehen — Dateien, Regler, Fenster, Auswahlrahmen.',
    parameters: {
      type: 'object',
      properties: {
        von_x: { type: 'number' },
        von_y: { type: 'number' },
        nach_x: { type: 'number' },
        nach_y: { type: 'number' },
      },
      required: ['von_x', 'von_y', 'nach_x', 'nach_y'],
    },
    danger: true,
    async run({ von_x, von_y, nach_x, nach_y }) {
      macPruefen('Ziehen')
      const r = (n) => Math.round(n)
      if (!CLICLICK) throw new Error('Ziehen braucht cliclick: brew install cliclick')
      // Erst hin, drücken, in Schritten rüber, loslassen — sonst merkt macOS das Ziehen nicht
      await pexec(CLICLICK, [`m:${r(von_x)},${r(von_y)}`, `dd:${r(von_x)},${r(von_y)}`])
      const schritte = 12
      const weg = []
      for (let i = 1; i <= schritte; i++) {
        weg.push(`m:${r(von_x + ((nach_x - von_x) * i) / schritte)},${r(von_y + ((nach_y - von_y) * i) / schritte)}`)
      }
      await pexec(CLICLICK, [...weg, `du:${r(nach_x)},${r(nach_y)}`])
      return `Gezogen von ${r(von_x)},${r(von_y)} nach ${r(nach_x)},${r(nach_y)}`
    },
  },
  {
    name: 'mac_menu',
    description:
      'Menüpunkt der vordersten App wählen, z.B. Menü "Ablage" → "Sichern". ' +
      'Zuverlässiger als klicken, weil der Weg fest steht.',
    parameters: {
      type: 'object',
      properties: {
        menue: { type: 'string', description: 'Name des Menüs, z.B. Ablage / File' },
        punkt: { type: 'string', description: 'Name des Eintrags, z.B. Sichern' },
        unterpunkt: { type: 'string', description: 'Falls der Eintrag ein Untermenü öffnet' },
      },
      required: ['menue', 'punkt'],
    },
    danger: true,
    async run({ menue, punkt, unterpunkt }) {
      macPruefen('Menü-Steuerung')
      const q = (s) => String(s).replace(/"/g, '\\"')
      const front = await frontContext({ eigeneUeberspringen: false })
      const script = unterpunkt
        ? `tell application "System Events" to tell process "${q(front.app)}" to tell menu bar 1 to tell menu bar item "${q(menue)}" to tell menu 1 to tell menu item "${q(punkt)}" to tell menu 1 to click menu item "${q(unterpunkt)}"`
        : `tell application "System Events" to tell process "${q(front.app)}" to tell menu bar 1 to tell menu bar item "${q(menue)}" to tell menu 1 to click menu item "${q(punkt)}"`
      await osa(script)
      return `Menü gewählt: ${menue} → ${punkt}${unterpunkt ? ` → ${unterpunkt}` : ''} (in ${front.app})`
    },
  },
  {
    name: 'mac_window',
    description: 'Fenster der vordersten App bewegen, in der Größe ändern, schließen oder ganz füllen.',
    parameters: {
      type: 'object',
      properties: {
        was: { type: 'string', description: 'bewegen | groesse | vollbild | links | rechts | schliessen | minimieren' },
        x: { type: 'number' },
        y: { type: 'number' },
        breite: { type: 'number' },
        hoehe: { type: 'number' },
      },
      required: ['was'],
    },
    danger: true,
    async run({ was, x = 0, y = 0, breite, hoehe }) {
      macPruefen('Fenster-Steuerung')
      const front = await frontContext({ eigeneUeberspringen: false })
      const size = await screenSize()
      const q = (s) => String(s).replace(/"/g, '\\"')
      const P = `tell application "System Events" to tell process "${q(front.app)}" to tell front window`

      const halb = Math.round(size.width / 2)
      const oben = 25 // unter der Menüleiste

      const plan = {
        bewegen: `${P} to set position to {${Math.round(x)}, ${Math.round(y)}}`,
        groesse: `${P} to set size to {${Math.round(breite || size.width)}, ${Math.round(hoehe || size.height)}}`,
        vollbild: `${P} to set {position, size} to {{0, ${oben}}, {${size.width}, ${size.height - oben}}}`,
        links: `${P} to set {position, size} to {{0, ${oben}}, {${halb}, ${size.height - oben}}}`,
        rechts: `${P} to set {position, size} to {{${halb}, ${oben}}, {${halb}, ${size.height - oben}}}`,
        schliessen: `${P} to click button 1`,
        minimieren: `${P} to set value of attribute "AXMinimized" to true`,
      }[was]

      if (!plan) throw new Error('was: bewegen, groesse, vollbild, links, rechts, schliessen oder minimieren')
      await osa(plan)
      return `Fenster von ${front.app}: ${was}`
    },
  },
  {
    name: 'mac_check',
    description:
      'Prüfen, ob URAI den Mac wirklich steuern darf: Bildschirmaufnahme, Bedienungshilfen, Klick-Hilfsmittel. ' +
      'Nutze das, wenn Klicken oder Bildschirmlesen scheitert.',
    parameters: { type: 'object', properties: {} },
    async run() {
      if (!IST_MAC) {
        return [
          'Windows-Modus: eingeschränkt.',
          'Bildschirm lesen und Grundsteuerung (Klick/Tipp/Taste/Scroll/App öffnen) gehen über',
          'PowerShell-Bordmittel — ungetestet auf echtem Windows, bitte einmal ausprobieren.',
          'Nicht verfügbar: Text-Klick-Punkte (OCR), Bedienhilfen-Baum, Menü- und Fenster-Steuerung, Ziehen.',
        ].join('\n')
      }
      const zeilen = []

      // Bildschirmaufnahme: klappt ein Foto?
      let sehen = false
      try {
        const shot = await capture({ ocrWidth: 300, viewWidth: 200 })
        await fs.unlink(shot.file).catch(() => {})
        sehen = true
      } catch (err) {
        zeilen.push(`Bildschirmaufnahme: NEIN — ${err.message.split('.')[0]}`)
      }
      if (sehen) zeilen.push('Bildschirmaufnahme: ja')

      // Bedienungshilfen: kommt der Knopf-Baum?
      const ui = await uiElements(5, 2, 4000).catch((e) => ({ error: e.message, items: [] }))
      if (ui.error) zeilen.push(`Bedienungshilfen: NEIN — ${String(ui.error).slice(0, 90)}`)
      else zeilen.push(`Bedienungshilfen: ja (${ui.items.length} Elemente gefunden)`)

      zeilen.push(CLICLICK ? `Klicken: cliclick (${CLICLICK}) — genau` : 'Klicken: über System Events — ok, cliclick wäre genauer')

      const bildschirme = await bildschirmListe().catch(() => [])
      if (bildschirme.length) {
        zeilen.push(
          `Bildschirme: ${bildschirme.map((b) => `${b.nummer}${b.haupt ? ' (Haupt)' : ''}: ${b.width}x${b.height}`).join(' · ')}` +
            ` — eingestellt: ${loadConfig().bildschirmNummer || 1}`
        )
      }

      const fehlt = zeilen.some((z) => z.includes('NEIN'))
      if (fehlt) {
        zeilen.push('')
        zeilen.push('So gibst du die Erlaubnis:')
        zeilen.push('Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme bzw. Bedienungshilfen')
        zeilen.push('→ das Programm anhaken, das URAI startet (Terminal oder Claude) → URAI neu starten.')
      }
      if (!CLICLICK) zeilen.push('Genaueres Klicken und Ziehen: brew install cliclick')

      return zeilen.join('\n')
    },
  },
  {
    name: 'mac_key',
    description: 'Taste drücken: "return", "tab", "escape", "cmd+s", "cmd+shift+4", "down".',
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    danger: true,
    async run({ key }) {
      if (!IST_MAC) return keyWin(key)
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
      if (!IST_MAC) return scrollWin(direction, amount)
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
      if (!IST_MAC) return openAppWin(name)
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
      if (!IST_MAC) {
        const front = await frontContextWin()
        const list = await appsWin()
        return `Vorne: ${front.app}${front.window ? ` — "${front.window}"` : ''}\nOffen: ${list.join(', ')}`
      }
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
      macPruefen('AppleScript')
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
      if (!IST_MAC) {
        console.log(`[URAI] ${title}: ${message}`)
        return 'Meldung im Terminal ausgegeben (Windows-Systembenachrichtigung noch nicht angebunden).'
      }
      await osa(`display notification "${message.replace(/"/g, "'")}" with title "${title.replace(/"/g, "'")}"`)
      return 'Meldung gezeigt.'
    },
  },
  {
    name: 'tipp_effekt',
    description:
      'Text ins vorderste Fenster tippen — Zeichen für Zeichen im Rhythmus einer Hand: schnell im Wort, ' +
      'Pause nach Punkt und Komma, ab und zu eine Denkpause. Für Screencast, Demo, Vorführung, ' +
      'auch in ein offenes Google-Dokument. Dauer einstellbar (45s, 10m, 2h), höchstens vier Stunden. ' +
      'Mit probe=true wird nur geschätzt, ohne zu tippen. Der Stopp-Knopf bricht jederzeit ab.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Was getippt werden soll' },
        dauer: { type: 'string', description: 'Wie lange insgesamt, z.B. 45s, 10m, 1h30m' },
        zeichenProMinute: { type: 'number', description: 'Statt dauer: Tempo, z.B. 260 für geübte Hand' },
        probe: { type: 'boolean', description: 'Nur schätzen, nichts tippen' },
        saat: { type: 'number', description: 'Zufalls-Saat — gleicher Wert, gleicher Rhythmus' },
      },
      required: ['text'],
    },
    danger: true,
    async run({ text, dauer, zeichenProMinute, probe = false, saat }, ctx) {
      if (typeof text !== 'string' || !text) throw new Error('text fehlt.')
      const plan = aufDauer(zeichenPlan(text, { zeichenProMinute, saat }), dauerLesen(dauer))
      const schnitt = plan.gesamtMs / Math.max(1, plan.schritte.length)
      if (probe)
        return `Schätzung: ${plan.schritte.length} Zeichen in ${zeitText(plan.gesamtMs)} (∅ ${Math.round(schnitt)} ms je Anschlag).`

      // Jeder einzelne Tastendruck kostet das Betriebssystem schon ~20-40 ms.
      // Wer schneller tippen lässt, bekommt am Ende einen längeren Lauf als
      // bestellt — das lieber vorher sagen als hinterher erklären.
      if (schnitt < 45)
        throw new Error(
          `Zu schnell für Tastendruck um Tastendruck (∅ ${Math.round(schnitt)} ms). ` +
            'Nimm eine längere Dauer, ein kleineres zeichenProMinute — oder mac_type, das fügt alles auf einmal ein.',
        )

      ctx?.emit?.('tippen', `${plan.schritte.length} Zeichen, ~${zeitText(plan.gesamtMs)}`)
      const r = await abspielen(plan, {
        tippe: zeichenTippen,
        warte: (ms) => new Promise((fertig) => setTimeout(fertig, ms)),
        signal: ctx?.signal,
        melde: ({ getippt, gesamt }) => ctx?.emit?.('tippen', `${getippt}/${gesamt} Zeichen`),
      })
      const gestoppt = r.getippt < r.gesamt ? ` — abgebrochen nach ${r.getippt} von ${r.gesamt}` : ''
      return `Getippt: ${r.getippt} Zeichen in ${zeitText(r.ms)}${gestoppt}.`
    },
  },
]

/** Ein einzelnes Zeichen anschlagen — das, was der Tipp-Effekt hundertfach braucht. */
async function zeichenTippen(z) {
  if (!IST_MAC) return typeWin(z)
  if (z === '\n' || z === '\r') {
    if (CLICLICK) return void (await pexec(CLICLICK, ['kp:return']))
    return void (await osa('tell application "System Events" to keystroke return'))
  }
  // cliclick ist deutlich schneller als ein AppleScript-Aufruf pro Zeichen und
  // hält damit auch flottere Tempi durch.
  if (CLICLICK) return void (await pexec(CLICLICK, [`t:${z}`]))
  const esc = z.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  await osa(`tell application "System Events" to keystroke "${esc}"`)
}
