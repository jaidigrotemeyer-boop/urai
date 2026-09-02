// Aus einem Werkzeug-Aufruf einen Satz machen, den ein Mensch versteht.
// Statt "web_search {query: …}" steht da "sucht im Netz nach Versandkosten".
import { loadConfig } from './config.js'

const WORTE = {
  de: {
    fs_list: (a) => ['schaut in den Ordner', kurz(a.path)],
    fs_read: (a) => ['liest', datei(a.path)],
    fs_write: (a) => ['schreibt', datei(a.path)],
    fs_edit: (a) => ['ändert', datei(a.path)],
    fs_delete: (a) => ['löscht', datei(a.path)],
    fs_move: (a) => ['verschiebt', datei(a.path)],
    fs_search: (a) => ['sucht in Dateien nach', a.pattern],
    fs_glob: (a) => ['sucht Dateien', a.pattern],
    shell_run: (a) => ['führt aus', a.command],
    web_search: (a) => ['sucht im Netz nach', a.query],
    web_fetch: (a) => ['liest die Seite', host(a.url)],
    web_browse: (a) => ['steuert den Browser auf', host(a.url)],
    mac_read_screen: () => ['liest den Bildschirm', ''],
    mac_find_text: (a) => ['sucht auf dem Bildschirm', a.text],
    mac_click_text: (a) => ['klickt auf', a.text],
    mac_click: (a) => ['klickt bei', `${a.x},${a.y}`],
    mac_type: (a) => ['tippt', a.text],
    mac_key: (a) => ['drückt', a.key],
    mac_scroll: (a) => ['scrollt', a.direction],
    mac_open_app: (a) => ['öffnet', a.name],
    mac_apps: () => ['schaut, was läuft', ''],
    mac_applescript: () => ['steuert macOS', ''],
    mac_notify: () => ['meldet sich', ''],
    mac_screenshot: () => ['macht ein Bild', ''],
    memory_save: () => ['merkt sich etwas', ''],
    memory_search: (a) => ['sucht im Gedächtnis nach', a.query],
    obsidian_write: (a) => ['schreibt die Notiz', a.title],
    obsidian_append: (a) => ['ergänzt die Notiz', a.title],
    obsidian_search: (a) => ['durchsucht Obsidian nach', a.query],
    obsidian_read: (a) => ['liest die Notiz', datei(a.path)],
    agent_spawn: (a) => ['schickt', `${a.name} los`],
    agent_team: (a) => ['stellt das Team auf', a.name],
    agent_list: () => ['schaut nach seinen Agenten', ''],
    live_report: () => ['schaut zurück', ''],
    live_toggle: () => ['schaltet das Mitgucken um', ''],
    self_tree: () => ['schaut sich seinen Code an', ''],
    self_read: (a) => ['liest seinen Code', datei(a.path)],
    self_edit: (a) => ['baut sich um in', datei(a.path)],
    self_write: (a) => ['schreibt sich neu', datei(a.path)],
    self_check: () => ['prüft sich selbst', ''],
    self_diff: () => ['schaut auf seine Änderungen', ''],
    self_undo: () => ['nimmt die Änderung zurück', ''],
    self_restart: () => ['startet sich neu', ''],
  },
  en: {
    fs_list: (a) => ['looking in', kurz(a.path)],
    fs_read: (a) => ['reading', datei(a.path)],
    fs_write: (a) => ['writing', datei(a.path)],
    fs_edit: (a) => ['editing', datei(a.path)],
    fs_delete: (a) => ['deleting', datei(a.path)],
    fs_move: (a) => ['moving', datei(a.path)],
    fs_search: (a) => ['searching files for', a.pattern],
    fs_glob: (a) => ['finding files', a.pattern],
    shell_run: (a) => ['running', a.command],
    web_search: (a) => ['searching the web for', a.query],
    web_fetch: (a) => ['reading', host(a.url)],
    web_browse: (a) => ['browsing', host(a.url)],
    mac_read_screen: () => ['reading the screen', ''],
    mac_find_text: (a) => ['looking on screen for', a.text],
    mac_click_text: (a) => ['clicking', a.text],
    mac_click: (a) => ['clicking at', `${a.x},${a.y}`],
    mac_type: (a) => ['typing', a.text],
    mac_key: (a) => ['pressing', a.key],
    mac_scroll: (a) => ['scrolling', a.direction],
    mac_open_app: (a) => ['opening', a.name],
    mac_apps: () => ['checking what runs', ''],
    mac_applescript: () => ['driving macOS', ''],
    mac_notify: () => ['sending a notice', ''],
    mac_screenshot: () => ['taking a shot', ''],
    memory_save: () => ['remembering something', ''],
    memory_search: (a) => ['searching memory for', a.query],
    obsidian_write: (a) => ['writing the note', a.title],
    obsidian_append: (a) => ['adding to the note', a.title],
    obsidian_search: (a) => ['searching Obsidian for', a.query],
    obsidian_read: (a) => ['reading the note', datei(a.path)],
    agent_spawn: (a) => ['sending off', a.name],
    agent_team: (a) => ['assembling the team', a.name],
    agent_list: () => ['checking its agents', ''],
    live_report: () => ['looking back', ''],
    live_toggle: () => ['toggling live', ''],
    self_tree: () => ['looking at its own code', ''],
    self_read: (a) => ['reading its own', datei(a.path)],
    self_edit: (a) => ['rebuilding itself in', datei(a.path)],
    self_write: (a) => ['rewriting itself', datei(a.path)],
    self_check: () => ['checking itself', ''],
    self_diff: () => ['reviewing its changes', ''],
    self_undo: () => ['undoing the change', ''],
    self_restart: () => ['restarting itself', ''],
  },
}

function datei(p) {
  if (!p) return ''
  const teile = String(p).split('/')
  return teile[teile.length - 1] || p
}

function kurz(p) {
  if (!p) return ''
  const teile = String(p).split('/').filter(Boolean)
  return teile.slice(-2).join('/')
}

function host(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return String(u || '').slice(0, 40)
  }
}

/**
 * @returns {{verb: string, ziel: string, satz: string}}
 */
export function beschreiben(werkzeug, args = {}) {
  const lang = loadConfig().language
  const tabelle = WORTE[lang] || WORTE.en
  const bauer = tabelle[werkzeug] || WORTE.en[werkzeug]
  if (!bauer) return { verb: werkzeug, ziel: '', satz: werkzeug }

  let [verb, ziel] = bauer(args)
  ziel = String(ziel ?? '').replace(/\s+/g, ' ').trim()
  if (ziel.length > 64) ziel = ziel.slice(0, 63) + '…'
  return { verb, ziel, satz: ziel ? `${verb} ${ziel}` : verb }
}
