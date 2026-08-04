// Bildschirm lesen und steuern — Windows-Seite.
//
// WICHTIG, ehrlich gesagt: Das hier ist mit PowerShell und .NET geschrieben,
// nach der Windows-Dokumentation — aber nie auf einem echten Windows-Rechner
// gelaufen. Ich habe keinen zum Testen. Anders als die macOS-Seite (die
// tatsächlich geklickt, getippt und nachgesehen hat), ist das hier ungeprüft.
// Bricht etwas: bitte melden, dann wird's repariert.
//
// Absichtlich nur Bordmittel — kein Zusatz-Programm nötig:
//   - Bildschirmfoto: System.Drawing (in .NET/Windows eingebaut)
//   - Klicken/Tippen: user32.dll über P/Invoke (SendInput, SetCursorPos)
//   - Text erkennen: KEIN eigenes OCR — stattdessen das Bild-Modell (Gemini),
//     das sowieso schon da ist. Liefert Beschreibung, aber keine Klick-Boxen
//     wie beim Mac. mac_click_text mit genauer Text-Position bleibt Mac-only.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const pexec = promisify(execFile)

async function ps(script, timeout = 20000) {
  const { stdout } = await pexec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout, maxBuffer: 8 * 1024 * 1024 }
  )
  return stdout.trim()
}

// Ein einziges Add-Type für alle user32-Aufrufe, in jedem Skript wiederverwendet
const USER32 = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class UraiWin {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder s, int n);
}
"@
`

export async function screenSizeWin() {
  const out = await ps(`Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "$($b.Width),$($b.Height)"`)
  const [w, h] = out.split(',').map((n) => parseInt(n.trim(), 10))
  return { width: w || 1920, height: h || 1080 }
}

export async function captureWin({ viewWidth = 1200 } = {}) {
  const datei = path.join(os.tmpdir(), `urai-win-${process.pid}-${Date.now()}.png`)
  const winPfad = datei.replace(/\\/g, '\\\\')
  await ps(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save("${winPfad}", [System.Drawing.Imaging.ImageFormat]::Png)
`, 30000)

  const bytes = await fs.readFile(datei)
  await fs.unlink(datei).catch(() => {})
  // Keine eigene Verkleinerung ohne Zusatzwerkzeug — das Bild-Modell verkraftet volle Größe
  return { base64: bytes.toString('base64') }
}

/** Vorderstes Fenster: Titel und der Prozessname, so gut es ohne UI Automation geht. */
export async function frontContextWin() {
  const out = await ps(`
${USER32}
$h = [UraiWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[UraiWin]::GetWindowText($h, $sb, 256) | Out-Null
$pid = 0
[UraiWin]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
$p = Get-Process -Id $pid -ErrorAction SilentlyContinue
"$($p.ProcessName)|$($sb.ToString())"
`)
  const [app, fenster] = out.split('|')
  return { app: app || '', window: fenster || '', geometry: '' }
}

export async function appsWin() {
  const out = await ps(`Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object -ExpandProperty ProcessName | Sort-Object -Unique`)
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

export async function openAppWin(name) {
  await ps(`Start-Process "${name.replace(/"/g, '')}"`, 15000)
  return `Gestartet: ${name}`
}

/** Linksklick an eine Bildschirmstelle — SetCursorPos + mouse_event, reines user32. */
export async function clickWin(x, y, button = 'left') {
  const runter = button === 'right' ? 0x0008 : 0x0002
  const hoch = button === 'right' ? 0x0010 : 0x0004
  await ps(`
${USER32}
[UraiWin]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 40
[UraiWin]::mouse_event(${runter}, 0, 0, 0, [UIntPtr]::Zero)
[UraiWin]::mouse_event(${hoch}, 0, 0, 0, [UIntPtr]::Zero)
`)
  return `Geklickt (${button}) bei ${Math.round(x)},${Math.round(y)}`
}

export async function moveWin(x, y) {
  await ps(`${USER32}\n[UraiWin]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})`)
  return `Maus bei ${Math.round(x)},${Math.round(y)}`
}

/** Tippen über SendKeys — verkraftet normalen Text, keine komplexen Tastenkombinationen. */
export async function typeWin(text) {
  const escaped = text
    .replace(/([+^%~(){}])/g, '{$1}') // SendKeys-Sonderzeichen einklammern
    .replace(/"/g, '""')
  await ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${escaped}")`)
  return `Getippt: ${text.slice(0, 80)}`
}

const TASTEN_SENDKEYS = {
  return: '{ENTER}', enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}', esc: '{ESC}',
  delete: '{DEL}', backspace: '{BACKSPACE}', space: ' ',
  left: '{LEFT}', right: '{RIGHT}', up: '{UP}', down: '{DOWN}',
  home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
}

export async function keyWin(kombi) {
  const teile = kombi.toLowerCase().split('+')
  const basis = teile.pop()
  const mods = teile.map((m) => ({ ctrl: '^', alt: '%', shift: '+', cmd: '^', strg: '^' }[m] || '')).join('')
  const taste = TASTEN_SENDKEYS[basis] || basis
  await ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${mods}${taste}")`)
  return `Taste: ${kombi}`
}

export async function scrollWin(direction, amount = 5) {
  const taste = { up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}' }[direction]
  if (!taste) throw new Error('Richtung: up, down, left oder right')
  await ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${taste.repeat(amount)}")`)
  return `Gescrollt ${direction} x${amount}`
}
