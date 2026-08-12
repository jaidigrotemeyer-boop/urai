// Selbsttest: jedes Werkzeug einmal wirklich laufen lassen und melden, was geht.
//   node --experimental-sqlite --no-warnings pruefe.mjs
//   node --experimental-sqlite --no-warnings pruefe.mjs --alles   (auch die, die etwas verändern)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ALLES = process.argv.includes('--alles')
const tmp = path.join(os.tmpdir(), `urai-pruefung-${Date.now()}`)
fs.mkdirSync(tmp, { recursive: true })

const { TOOL_MAP, ALL_TOOLS, TOOL_GROUPS } = await import('./server/tools/index.js')
const { loadConfig, saveConfig } = await import('./server/config.js')

// Revier kurz erweitern, damit die Datei-Tests im Temp-Ordner laufen dürfen
const altesRevier = loadConfig().workspace
saveConfig({ workspace: '/' })

const ctx = { emit: () => {}, agent: null }
const ergebnisse = []

async function pruefe(name, args, { erwarte, ueberspringen } = {}) {
  const t = TOOL_MAP.get(name)
  if (!t) return ergebnisse.push({ name, stand: 'FEHLT', info: 'Werkzeug nicht registriert' })
  if (ueberspringen) return ergebnisse.push({ name, stand: 'ÜBERSPRUNGEN', info: ueberspringen })

  const start = Date.now()
  try {
    const out = String((await t.run(args, ctx)) ?? '')
    const ms = Date.now() - start
    if (erwarte && !erwarte.test(out)) {
      return ergebnisse.push({ name, stand: 'KOMISCH', ms, info: out.slice(0, 100).replace(/\n/g, ' ') })
    }
    ergebnisse.push({ name, stand: 'OK', ms, info: out.slice(0, 70).replace(/\n/g, ' ') })
  } catch (err) {
    ergebnisse.push({ name, stand: 'FEHLER', ms: Date.now() - start, info: err.message.slice(0, 100) })
  }
}

const datei = path.join(tmp, 'test.txt')

// ── Dateien ──
await pruefe('fs_write', { path: datei, content: 'hallo\nwelt\n' })
await pruefe('fs_read', { path: datei }, { erwarte: /hallo/ })
await pruefe('fs_edit', { path: datei, old_string: 'welt', new_string: 'erde' })
await pruefe('fs_list', { path: tmp }, { erwarte: /test\.txt/ })
await pruefe('fs_search', { pattern: 'erde', path: tmp })
await pruefe('fs_glob', { pattern: '*.txt', path: tmp })

// ── Terminal ──
await pruefe('shell_run', { command: 'echo urai-test' }, { erwarte: /urai-test/ })

// ── Web ──
await pruefe('web_fetch', { url: 'https://example.com', max_chars: 400 }, { erwarte: /Example|Beispiel/i })
await pruefe('web_search', { query: 'Obsidian notes app', count: 3 })
await pruefe('web_browse', {}, { ueberspringen: 'braucht Playwright, extra Installation' })

// ── Bildschirm und Mac ──
await pruefe('mac_check', {})
await pruefe('mac_apps', {})
await pruefe('mac_read_screen', {}, { erwarte: /Bildschirm/ })
await pruefe('mac_screenshot', {})
await pruefe('mac_ui', {})
await pruefe('mac_find_text', { text: 'Datei' })
await pruefe('mac_notify', { message: 'URAI Selbsttest läuft' })
for (const n of ['mac_click', 'mac_click_text', 'mac_move', 'mac_type', 'mac_key', 'mac_scroll', 'mac_drag', 'mac_menu', 'mac_window', 'mac_open_app', 'mac_applescript']) {
  await pruefe(n, {}, { ueberspringen: ALLES ? undefined : 'greift ein — nur mit --alles' })
}

// ── Gedächtnis ──
await pruefe('memory_save', { text: 'URAI-Selbsttest lief am ' + new Date().toISOString().slice(0, 10) })
await pruefe('memory_search', { query: 'Selbsttest' })

// ── Obsidian ──
await pruefe('obsidian_write', { title: 'URAI Selbsttest', content: 'Diese Notiz stammt aus dem Selbsttest.', folder: 'Protokolle' })
await pruefe('obsidian_append', { title: 'URAI Selbsttest', content: 'Noch eine Zeile.', folder: 'Protokolle' })
await pruefe('obsidian_search', { query: 'Selbsttest' })
await pruefe('obsidian_read', { path: 'URAI/Protokolle/URAI Selbsttest.md' })

// ── Selbst-Bearbeitung ──
await pruefe('self_tree', {}, { erwarte: /server\/agent\.js/ })
await pruefe('self_read', { path: 'server/config.js' }, { erwarte: /DEFAULTS/ })
await pruefe('self_diff', {})
await pruefe('self_check', { build: false }, { erwarte: /0 kaputt/ })
await pruefe('self_edit', {}, { ueberspringen: ALLES ? undefined : 'ändert Code — nur mit --alles' })
await pruefe('self_write', {}, { ueberspringen: 'ändert Code' })
await pruefe('self_undo', {}, { ueberspringen: 'ändert Code' })
await pruefe('self_restart', {}, { ueberspringen: 'startet neu' })

// ── Live und Agenten ──
await pruefe('live_report', {})
await pruefe('live_toggle', {}, { ueberspringen: 'schaltet den Live-Modus um' })
for (const n of ['agent_spawn', 'agent_team', 'agent_list']) {
  await pruefe(n, {}, { ueberspringen: 'braucht einen laufenden Agenten' })
}

saveConfig({ workspace: altesRevier })
fs.rmSync(tmp, { recursive: true, force: true })

// ── Bericht ──
const zaehler = { OK: 0, FEHLER: 0, KOMISCH: 0, 'ÜBERSPRUNGEN': 0, FEHLT: 0 }
const zeichen = { OK: '✓', FEHLER: '✗', KOMISCH: '?', 'ÜBERSPRUNGEN': '–', FEHLT: '!' }

console.log('\n  URAI Selbsttest\n')
for (const [gruppe, namen] of Object.entries(TOOL_GROUPS)) {
  const meine = ergebnisse.filter((r) => namen.includes(r.name))
  if (!meine.length) continue
  console.log(`  ${gruppe.toUpperCase()}`)
  for (const r of meine) {
    zaehler[r.stand] = (zaehler[r.stand] || 0) + 1
    const zeit = r.ms != null ? `${String(r.ms).padStart(5)}ms` : '       '
    console.log(`   ${zeichen[r.stand]} ${r.name.padEnd(18)} ${zeit}  ${r.info || ''}`)
  }
  console.log('')
}

const geprueft = zaehler.OK + zaehler.FEHLER + zaehler.KOMISCH + zaehler.FEHLT
console.log(`  ${zaehler.OK}/${geprueft} geprüfte Werkzeuge laufen · ${zaehler['ÜBERSPRUNGEN']} übersprungen`)
if (zaehler.FEHLER || zaehler.FEHLT) console.log(`  ${zaehler.FEHLER + zaehler.FEHLT} kaputt`)
console.log(`  ${ALL_TOOLS.length} Werkzeuge insgesamt\n`)

process.exit(zaehler.FEHLER || zaehler.FEHLT ? 1 : 0)
