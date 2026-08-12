// Tippen ins vorderste Fenster — also in das, was gerade offen ist: ein
// Google-Dokument im Browser, ein Textfeld, ein Editor. Handschrift selbst hat
// dabei nichts zu melden; sie schlägt nur Tasten an, wie eine Hand es täte.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'

const pexec = promisify(execFile)
export const SYSTEM = process.platform

const CLICLICK = ['/opt/homebrew/bin/cliclick', '/usr/local/bin/cliclick'].find((p) => fs.existsSync(p))

async function osa(skript) {
  await pexec('osascript', ['-e', skript])
}

/** Kann auf diesem Rechner überhaupt getippt werden? */
export async function bereit() {
  if (SYSTEM === 'darwin')
    return {
      ok: true,
      hinweis: CLICLICK
        ? 'cliclick gefunden — schnell und zuverlässig.'
        : 'Ohne cliclick geht es über AppleScript, das ist langsamer. Schneller mit: brew install cliclick',
      rechte: 'Beim ersten Tippen fragt macOS nach „Bedienungshilfen". Ohne die Erlaubnis kommt kein Zeichen an.',
    }
  if (SYSTEM === 'win32') return { ok: true, hinweis: 'Windows: getippt wird über PowerShell.' }
  const hat = await pexec('which', ['xdotool']).then(() => true).catch(() => false)
  return hat
    ? { ok: true, hinweis: 'Linux: getippt wird über xdotool.' }
    : { ok: false, hinweis: 'Linux braucht xdotool: sudo apt install xdotool' }
}

// SendKeys deutet diese Zeichen als Steuerbefehle — ungeschützt tippt Windows
// statt eines Pluszeichens eine Umschalt-Taste.
const winEscape = (z) => (/[+^%~(){}[\]]/.test(z) ? `{${z}}` : z)

/** Ein einzelnes Zeichen anschlagen. */
export async function zeichen(z) {
  if (SYSTEM === 'darwin') {
    if (z === '\n' || z === '\r') {
      if (CLICLICK) return void (await pexec(CLICLICK, ['kp:return']))
      return void (await osa('tell application "System Events" to keystroke return'))
    }
    // cliclick ist deutlich schneller als ein AppleScript-Aufruf pro Zeichen
    // und hält damit auch flottere Tempi durch.
    if (CLICLICK) return void (await pexec(CLICLICK, [`t:${z}`]))
    const esc = z.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return void (await osa(`tell application "System Events" to keystroke "${esc}"`))
  }

  if (SYSTEM === 'win32') {
    const s = z === '\n' || z === '\r' ? '{ENTER}' : winEscape(z)
    return void (await pexec('powershell', [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([char[]]@(${[...s]
        .map((c) => c.charCodeAt(0))
        .join(',')}) -join '')`,
    ]))
  }

  if (z === '\n' || z === '\r') return void (await pexec('xdotool', ['key', 'Return']))
  await pexec('xdotool', ['type', '--clearmodifiers', '--delay', '0', '--', z])
}
