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
import { loadConfig } from './config.js'

const pexec = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OCR_SCRIPT = path.join(HERE, 'ocr.jxa.js')

// Bildschirm lesen und steuern läuft über AppleScript, Vision-Framework und
// System Events — alles reine macOS-Bordmittel. Auf anderen Systemen soll
// das ehrlich scheitern statt kryptisch abzustürzen. Chat, Abläufe, Dateien,
// Web und Obsidian sind reines Node und laufen überall gleich.
export const IST_MAC = process.platform === 'darwin'

export function macPruefen(was) {
  if (!IST_MAC) {
    throw new Error(
      `${was} geht nur auf macOS — dafür braucht es AppleScript und Apples Vision-Framework. ` +
        'Auf diesem System nicht verfügbar.'
    )
  }
}

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

/**
 * Ehrlich gesagt: screencapture zählt "1 ist Hauptbildschirm, 2 zweiter, ..."
 * genau wie hier NSScreen.screens[0] als Hauptbildschirm zählt — bei zwei
 * Bildschirmen passt das zuverlässig. Bei drei oder mehr kann die Reihenfolge
 * abweichen, weil Apple für beide Listen keine identische Sortierung zusagt.
 * Nie an echter Mehr-Bildschirm-Hardware getestet — bei einem Monitor ist das
 * hier exakt der alte, geprüfte Weg (Bildschirm 1, 0,0-Ursprung).
 *
 * Alle Bildschirme mit Größe UND Position in globalen Klick-Koordinaten
 * (oben links = 0,0, wie screencapture/cliclick sie erwarten — nicht das
 * Cocoa-Koordinatensystem, das unten links anfängt und nach oben zählt).
 * Bildschirm 1 ist immer der Hauptbildschirm (mit der Menüleiste).
 */
export async function bildschirmListe() {
  macPruefen('Bildschirme auflisten')
  const script = `
    ObjC.import('AppKit')
    function run() {
      const screens = $.NSScreen.screens
      const out = []
      const hauptHoehe = screens.objectAtIndex(0).frame.size.height
      for (let i = 0; i < screens.count; i++) {
        const f = screens.objectAtIndex(i).frame
        out.push({
          nummer: i + 1,
          x: Math.round(f.origin.x),
          y: Math.round(hauptHoehe - (f.origin.y + f.size.height)),
          width: Math.round(f.size.width),
          height: Math.round(f.size.height),
          haupt: i === 0,
        })
      }
      return JSON.stringify(out)
    }`
  try {
    const out = await osa(script, 'JavaScript', 8000)
    const liste = JSON.parse(out || '[]')
    if (liste.length) return liste
  } catch {}
  return [{ nummer: 1, x: 0, y: 0, width: 1512, height: 982, haupt: true }]
}

/** Größe UND Position des eingestellten Bildschirms, in globalen Klick-Koordinaten. */
export async function screenSize() {
  macPruefen('Bildschirm-Größe lesen')
  const nummer = loadConfig().bildschirmNummer || 1
  const liste = await bildschirmListe()
  const treffer = liste.find((b) => b.nummer === nummer) || liste[0]
  return { width: treffer.width, height: treffer.height, x: treffer.x, y: treffer.y }
}

/**
 * Foto vom Hauptbildschirm.
 * Retina-Bilder sind riesig — OCR auf voller Größe dauert ewig.
 * Darum: eine mittlere Kopie für OCR, eine kleine fürs Anschauen.
 */
export async function capture({ ocrWidth = 1600, viewWidth = 1200 } = {}) {
  macPruefen('Bildschirmfoto')
  const base = path.join(os.tmpdir(), `urai-${process.pid}-${Date.now()}`)
  const file = `${base}.png`

  // Erst Hauptbildschirm, sonst ohne Display-Angabe. Scheitert beides: Erlaubnis fehlt.
  try {
    await pexec('screencapture', ['-x', '-D', String(loadConfig().bildschirmNummer || 1), file], { timeout: 20000 })
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
  // size.x/y verschieben auf den globalen Klick-Punkt, wenn der gewählte
  // Bildschirm nicht der Hauptbildschirm ist (der bei 0,0 anfängt)
  const OX = size.x || 0
  const OY = size.y || 0
  return raw
    .filter((r) => r.t && r.t.trim())
    .map((r) => ({
      text: r.t.trim(),
      conf: Math.round((r.c ?? 0) * 100) / 100,
      // Vision zählt von links UNTEN, der Bildschirm von links OBEN
      x: Math.round((r.x + r.w / 2) * W) + OX,
      y: Math.round((1 - r.y - r.h / 2) * H) + OY,
      w: Math.round(r.w * W),
      h: Math.round(r.h * H),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Fenstertitel, an denen URAI sich selbst erkennt. */
const EIGENE = /urai|localhost:3017/i

/**
 * Alle Fenster, die URAI selbst gehören — mit Position und Größe.
 * Braucht er, um sich beim Bildschirmlesen selbst zu übersehen.
 */
export async function eigeneFenster() {
  const script = `
    function run() {
      const se = Application('System Events')
      const out = []
      for (const p of se.applicationProcesses.whose({ backgroundOnly: false })()) {
        let name = ''
        try { name = p.name() } catch (e) { continue }
        let fenster = []
        try { fenster = p.windows() } catch (e) { continue }
        for (const w of fenster) {
          let titel = ''
          try { titel = w.title() || w.name() || '' } catch (e) {}
          if (!/urai|localhost:3017/i.test(titel)) continue
          let pos = null, groesse = null
          try { pos = w.position() } catch (e) {}
          try { groesse = w.size() } catch (e) {}
          if (pos && groesse) out.push({ app: name, titel, x: pos[0], y: pos[1], w: groesse[0], h: groesse[1] })
        }
      }
      return JSON.stringify(out)
    }`
  try {
    return JSON.parse((await osa(script, 'JavaScript', 8000)) || '[]')
  } catch {
    return []
  }
}

/**
 * Was ist vorne? Das eigene Fenster überspringt er dabei —
 * ihn interessiert, woran DU arbeitest, nicht seine eigene Oberfläche.
 */
export async function frontContext({ eigeneUeberspringen = true } = {}) {
  const script = `
    function run() {
      const se = Application('System Events')
      const raus = []
      for (const p of se.applicationProcesses.whose({ backgroundOnly: false })()) {
        let name = '', vorne = false
        try { name = p.name(); vorne = p.frontmost() } catch (e) { continue }
        let titel = '', geom = ''
        try {
          const w = p.windows()[0]
          titel = w.title() || w.name() || ''
          const pos = w.position(), gr = w.size()
          geom = pos[0] + ',' + pos[1] + ' ' + gr[0] + 'x' + gr[1]
        } catch (e) {}
        raus.push({ app: name, titel, geom, vorne })
      }
      return JSON.stringify(raus)
    }`
  let liste = []
  try {
    liste = JSON.parse((await osa(script, 'JavaScript', 8000)) || '[]')
  } catch {}

  const eigen = (f) => EIGENE.test(f.titel || '')
  const vorne = liste.find((f) => f.vorne)

  if (eigeneUeberspringen && vorne && eigen(vorne)) {
    // URAI schaut an sich vorbei auf das, was dahinter liegt
    const dahinter = liste.find((f) => !f.vorne && !eigen(f) && f.titel)
    if (dahinter) {
      return { app: dahinter.app, window: dahinter.titel, geometry: dahinter.geom, hinterUrai: true }
    }
  }
  if (!vorne) return { app: '', window: '', geometry: '' }
  return { app: vorne.app, window: vorne.titel, geometry: vorne.geom, eigenes: eigen(vorne) }
}

/** Zeilen wegwerfen, die im eigenen Fenster liegen. */
export function ohneEigene(lines, fenster) {
  if (!fenster?.length) return lines
  return lines.filter(
    (l) => !fenster.some((f) => l.x >= f.x && l.x <= f.x + f.w && l.y >= f.y && l.y <= f.y + f.h)
  )
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
  const wo = size.x || size.y ? ` ab (${size.x},${size.y})` : ''
  parts.push(`Bildschirm: ${size.width}x${size.height} Punkte${wo} (0,0 = links oben vom Hauptbildschirm)`)
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
