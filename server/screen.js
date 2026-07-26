// Bildschirm lesen und verstehen.
// Drei Wege, zusammen ergeben sie ein klares Bild:
//   1. OCR   — jeder Text mit Klick-Punkt (Apple Vision, gratis, offline)
//   2. UI    — echte Knöpfe/Felder aus dem Bedienhilfen-Baum (System Events)
//   3. Augen — Bild-Modell beschreibt, was zu sehen ist (Gemini oder moondream)
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const pexec = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OCR_SCRIPT = path.join(HERE, 'ocr.jxa.js')

/**
 * Beim Start alle liegengebliebenen Bildschirmfotos wegräumen.
 * Normalerweise löscht jeder Blick sein Bild sofort — falls aber mal
 * ein Prozess abgestürzt ist, bleibt hier nichts zurück.
 */
export async function raeumeAuf() {
  const dir = os.tmpdir()
  let weg = 0
  try {
    for (const f of await fs.readdir(dir)) {
      if (/^urai-\d+-\d+.*\.png$/.test(f)) {
        await fs.unlink(path.join(dir, f)).catch(() => {})
        weg++
      }
    }
  } catch {}
  return weg
}

export async function osa(script, lang = 'AppleScript', timeout = 30000) {
  const args = lang === 'JavaScript' ? ['-l', 'JavaScript', '-e', script] : ['-e', script]
  const { stdout } = await pexec('osascript', args, { timeout, maxBuffer: 8 * 1024 * 1024 })
  return stdout.trim()
}

/** Bildschirmgröße in Punkten (nicht Pixeln). */
export async function screenSize() {
  try {
    const out = await osa('tell application "Finder" to get bounds of window of desktop')
    const nums = out.split(',').map((s) => parseInt(s.trim(), 10))
    if (nums.length === 4 && nums[2] > 0) return { width: nums[2], height: nums[3] }
  } catch {}
  const out = await osa(
    'tell application "System Events" to get size of first desktop'
  ).catch(() => '1512, 982')
  const [w, h] = out.split(',').map((s) => parseInt(s.trim(), 10))
  return { width: w || 1512, height: h || 982 }
}

/**
 * Foto vom Hauptbildschirm.
 * Retina-Bilder sind riesig — OCR auf voller Größe dauert ewig.
 * Darum: eine mittlere Kopie für OCR, eine kleine fürs Anschauen.
 */
export async function capture({ ocrWidth = 1600, viewWidth = 1200 } = {}) {
  const base = path.join(os.tmpdir(), `urai-${process.pid}-${Date.now()}`)
  const file = `${base}.png`

  // Erst Hauptbildschirm, sonst ohne Display-Angabe. Scheitert beides: Erlaubnis fehlt.
  try {
    await pexec('screencapture', ['-x', '-D', '1', file], { timeout: 20000 })
  } catch (first) {
    try {
      await pexec('screencapture', ['-x', file], { timeout: 20000 })
    } catch (second) {
      throw new Error(
        'Bildschirm-Foto nicht erlaubt. Gib die Erlaubnis: Systemeinstellungen → Datenschutz & Sicherheit → ' +
          'Bildschirmaufnahme → das Programm anhaken, das URAI startet (Terminal bzw. Claude), dann URAI neu starten. ' +
          `(${second.message.split('\n').pop() || first.message})`
      )
    }
  }

  const ocrFile = `${base}-o.png`
  const viewFile = `${base}-v.png`
  await fs.copyFile(file, ocrFile)
  await fs.copyFile(file, viewFile)
  await Promise.all([
    pexec('sips', ['-Z', String(ocrWidth), ocrFile], { timeout: 20000 }).catch(() => {}),
    pexec('sips', ['-Z', String(viewWidth), '-s', 'formatOptions', '60', viewFile], { timeout: 20000 }).catch(() => {}),
  ])

  const b64 = (await fs.readFile(viewFile)).toString('base64')
  await Promise.all([fs.unlink(viewFile).catch(() => {}), fs.unlink(file).catch(() => {})])

  // ocrFile muss der Aufrufer löschen
  return { file: ocrFile, base64: b64 }
}

/**
 * Allen Text auf dem Bildschirm lesen.
 * @returns {Promise<Array<{text,x,y,w,h,conf}>>} x/y = Klick-Punkt in Bildschirm-Punkten
 */
export async function ocr(file, size) {
  const { stdout } = await pexec('osascript', ['-l', 'JavaScript', OCR_SCRIPT, file], {
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  })
  let raw = []
  try {
    raw = JSON.parse(stdout.trim() || '[]')
  } catch {
    return []
  }
  const W = size.width
  const H = size.height
  return raw
    .filter((r) => r.t && r.t.trim())
    .map((r) => ({
      text: r.t.trim(),
      conf: Math.round((r.c ?? 0) * 100) / 100,
      // Vision zählt von links UNTEN, der Bildschirm von links OBEN
      x: Math.round((r.x + r.w / 2) * W),
      y: Math.round((1 - r.y - r.h / 2) * H),
      w: Math.round(r.w * W),
      h: Math.round(r.h * H),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Was ist vorne, und welche Fenster gibt es? */
export async function frontContext() {
  const script = `
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      set winName to ""
      try
        tell process frontApp to set winName to name of front window
      end try
      set winPos to ""
      try
        tell process frontApp
          set p to position of front window
          set s to size of front window
          set winPos to ("" & (item 1 of p) & "," & (item 2 of p) & " " & (item 1 of s) & "x" & (item 2 of s))
        end tell
      end try
      return frontApp & "|" & winName & "|" & winPos
    end tell`
  const out = await osa(script)
  const [app, win, geom] = out.split('|')
  return { app, window: win, geometry: geom }
}

/**
 * Bedienbare Elemente der vordersten App: Knöpfe, Felder, Menüs — mit Position.
 * Braucht Bedienhilfen-Erlaubnis (Systemeinstellungen → Datenschutz → Bedienungshilfen).
 */
export async function uiElements(limit = 80, maxDepth = 4, timeout = 6000) {
  const script = `
    function run() {
      const se = Application('System Events')
      const proc = se.applicationProcesses.whose({ frontmost: true })[0]
      const out = []
      function walk(el, depth) {
        if (out.length >= ${limit} || depth > ${maxDepth}) return
        let kids = []
        try { kids = el.uiElements() } catch (e) { return }
        for (const k of kids) {
          if (out.length >= ${limit}) return
          let role = '', name = '', value = '', pos = null, size = null, enabled = true
          try { role = k.role() } catch (e) {}
          try { name = k.title() || k.description() || k.name() || '' } catch (e) {}
          try { const v = k.value(); if (typeof v === 'string' && v.length < 120) value = v } catch (e) {}
          try { pos = k.position() } catch (e) {}
          try { size = k.size() } catch (e) {}
          try { enabled = k.enabled() } catch (e) {}
          const clickable = ['AXButton','AXTextField','AXTextArea','AXCheckBox','AXRadioButton','AXPopUpButton','AXMenuButton','AXLink','AXComboBox','AXSlider','AXTabGroup'].includes(role)
          if (clickable && pos && size && (name || value)) {
            out.push({
              role: role.replace('AX',''),
              name: String(name).slice(0, 80),
              value: String(value).slice(0, 80),
              x: Math.round(pos[0] + size[0] / 2),
              y: Math.round(pos[1] + size[1] / 2),
              enabled
            })
          }
          walk(k, depth + 1)
        }
      }
      try { walk(proc.windows[0], 0) } catch (e) { return JSON.stringify({error: String(e)}) }
      return JSON.stringify(out)
    }`
  try {
    const out = await osa(script, 'JavaScript', timeout)
    const parsed = JSON.parse(out || '[]')
    if (parsed.error) return { error: parsed.error, items: [] }
    return { items: parsed }
  } catch (err) {
    return { error: err.message, items: [] }
  }
}

/** Text auf dem Bildschirm suchen. Gibt Treffer mit Klick-Punkt. */
export function findText(lines, needle, { fuzzy = true } = {}) {
  const q = needle.toLowerCase().trim()
  const exact = lines.filter((l) => l.text.toLowerCase() === q)
  if (exact.length) return exact
  const contains = lines.filter((l) => l.text.toLowerCase().includes(q))
  if (contains.length || !fuzzy) return contains
  // letzter Versuch: alle Wörter kommen vor
  const words = q.split(/\s+/)
  return lines.filter((l) => {
    const t = l.text.toLowerCase()
    return words.every((w) => t.includes(w))
  })
}

/** Alles zusammen als lesbarer Bericht fürs Gehirn. */
export function report({ size, front, lines, ui, note }) {
  const parts = []
  parts.push(`Bildschirm: ${size.width}x${size.height} Punkte (0,0 = links oben)`)
  if (front?.app) parts.push(`Vorne: ${front.app}${front.window ? ` — Fenster "${front.window}"` : ''}${front.geometry ? ` @ ${front.geometry}` : ''}`)
  if (note) parts.push(note)

  if (ui?.items?.length) {
    parts.push('\n── Bedienbare Elemente (verlässlich, direkt anklickbar) ──')
    parts.push(
      ui.items
        .slice(0, 60)
        .map((e) => `(${e.x},${e.y}) [${e.role}] ${e.name || e.value}${e.enabled ? '' : ' (aus)'}`)
        .join('\n')
    )
  } else if (ui?.error) {
    parts.push(`\n(Bedienhilfen-Baum nicht lesbar: ${ui.error})`)
  }

  if (lines?.length) {
    parts.push('\n── Text auf dem Bildschirm (x,y = Mitte des Textes) ──')
    parts.push(lines.slice(0, 220).map((l) => `(${l.x},${l.y}) ${l.text}`).join('\n'))
    if (lines.length > 220) parts.push(`… und ${lines.length - 220} weitere Zeilen`)
  } else {
    parts.push('\n(Kein Text erkannt.)')
  }
  return parts.join('\n')
}
