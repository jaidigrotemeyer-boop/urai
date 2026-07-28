// Obsidian: alles was URAI tut, landet als Markdown im Vault.
// Struktur:
//   URAI/
//     Sitzungen/2026-07-26 – Erste Worte.md
//     Agenten/2026-07-26 1912 – rechercheur.md
//     Gruppen/2026-07-26 1912 – Marktcheck.md
//     Wissen/<titel>.md
//     Werkzeuge/<log>.md
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import { loadConfig, saveConfig } from './config.js'

const FOLDERS = {
  session: 'Sitzungen',
  agent: 'Agenten',
  group: 'Gruppen',
  knowledge: 'Wissen',
  log: 'Protokolle',
}

/** Vault finden: Einstellung, sonst Obsidians eigene Liste, sonst nichts. */
export function vaultPath() {
  const c = loadConfig()
  if (c.obsidianVault && fssync.existsSync(c.obsidianVault)) return c.obsidianVault
  try {
    const cfgFile = path.join(process.env.HOME, 'Library/Application Support/obsidian/obsidian.json')
    const j = JSON.parse(fssync.readFileSync(cfgFile, 'utf8'))
    const vaults = Object.values(j.vaults || {})
    const open = vaults.find((v) => v.open) || vaults.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0]
    if (open?.path && fssync.existsSync(open.path)) {
      saveConfig({ obsidianVault: open.path })
      return open.path
    }
  } catch {}
  return null
}

export function obsidianReady() {
  return !!vaultPath()
}

function root() {
  const v = vaultPath()
  if (!v) throw new Error('Kein Obsidian-Vault gefunden. Pfad in den Einstellungen eintragen.')
  return path.join(v, loadConfig().obsidianFolder || 'URAI')
}

function safeName(s) {
  return String(s || 'ohne-titel')
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}${p(d.getMinutes())}`,
    iso: d.toISOString(),
  }
}

function frontmatter(obj) {
  const lines = ['---']
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => `"${String(x).replace(/"/g, "'")}"`).join(', ')}]`)
    else lines.push(`${k}: ${typeof v === 'string' && /[:#]/.test(v) ? `"${v.replace(/"/g, "'")}"` : v}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

/** Notiz schreiben (überschreibt). Gibt den Pfad im Vault zurück. */
export async function writeNote(kind, name, body, meta = {}) {
  const folder = path.join(root(), FOLDERS[kind] || String(kind))
  await fs.mkdir(folder, { recursive: true })
  const file = path.join(folder, `${safeName(name)}.md`)
  await fs.writeFile(file, frontmatter(meta) + body)
  return path.relative(vaultPath(), file)
}

/** An eine Notiz anhängen, legt sie bei Bedarf an. */
export async function appendNote(kind, name, body, meta = {}) {
  const folder = path.join(root(), FOLDERS[kind] || String(kind))
  await fs.mkdir(folder, { recursive: true })
  const file = path.join(folder, `${safeName(name)}.md`)
  const exists = fssync.existsSync(file)
  await fs.appendFile(file, (exists ? '\n' : frontmatter(meta)) + body)
  return path.relative(vaultPath(), file)
}

export async function readNote(relPath) {
  const abs = path.resolve(vaultPath(), relPath)
  if (!abs.startsWith(path.resolve(vaultPath()))) throw new Error('Weg liegt außerhalb vom Vault.')
  return fs.readFile(abs, 'utf8')
}

/** Alle Notiz-Titel im URAI-Ordner — Grundlage fürs Verlinken. */
async function titelListe() {
  const out = []
  async function walk(dir, tiefe = 0) {
    if (tiefe > 3 || out.length > 800) return
    let ents = []
    try {
      ents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p, tiefe + 1)
      else if (e.name.endsWith('.md')) out.push(path.basename(e.name, '.md'))
    }
  }
  await walk(root()).catch(() => {})
  return out
}

/**
 * Kommt ein vorhandener Notiz-Titel im Text vor, wird daraus eine Verknüpfung.
 * So wächst der Vault von selbst zusammen, statt aus einzelnen Zetteln zu bestehen.
 */
export async function verknuepfen(text, { ausser = '' } = {}) {
  if (!text) return text
  let titel = []
  try {
    titel = await titelListe()
  } catch {
    return text
  }

  // Lange Titel zuerst, sonst zerschneidet ein kurzer den längeren
  const kandidaten = titel
    .filter((tt) => tt.length >= 5 && tt !== ausser && !/^\d{4}-\d{2}-\d{2}/.test(tt))
    .sort((a, b) => b.length - a.length)
    .slice(0, 120)

  let out = text
  const schonVerlinkt = new Set()
  for (const tt of kandidaten) {
    if (schonVerlinkt.size >= 12) break
    if (out.includes(`[[${tt}`)) continue
    const re = new RegExp(`(?<!\\[\\[)\\b${tt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?!\\]\\])`, 'i')
    if (re.test(out)) {
      out = out.replace(re, `[[${tt}]]`)
      schonVerlinkt.add(tt)
    }
  }
  return out
}

export async function searchVault(query, limit = 25) {
  const v = vaultPath()
  const q = query.toLowerCase()
  const hits = []

  async function walk(dir, depth = 0) {
    if (hits.length >= limit || depth > 8) return
    let ents = []
    try {
      ents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      if (hits.length >= limit) return
      if (e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        await walk(p, depth + 1)
        continue
      }
      if (!e.name.endsWith('.md')) continue
      let text = ''
      try {
        text = await fs.readFile(p, 'utf8')
      } catch {
        continue
      }
      const inName = e.name.toLowerCase().includes(q)
      const idx = text.toLowerCase().indexOf(q)
      if (inName || idx >= 0) {
        const snippet = idx >= 0 ? text.slice(Math.max(0, idx - 90), idx + 160).replace(/\n+/g, ' ') : ''
        hits.push({ file: path.relative(v, p), snippet })
      }
    }
  }

  await walk(v)
  return hits
}

// ─────────────── Automatisch mitschreiben ───────────────

/** Ein ganzer Sitzungs-Verlauf als eine Notiz — Zusammenfassung steht ganz oben. */
export async function saveSession(session, entries, extra = {}, summary = null, thema = null) {
  if (!obsidianReady() || !loadConfig().obsidianAuto) return null
  const s = stamp()
  const first = thema || entries.find((e) => e.role === 'user')?.content || 'Sitzung'
  const title = `${s.date} ${s.time} – ${safeName(first.slice(0, 50))}`
  const verlauf = entries
    .map((e) => {
      const wer = { user: 'Du', assistant: 'URAI', tool: 'Werkzeug' }[e.role] || e.role
      return `**${wer}**\n${e.content}\n`
    })
    .join('\n')

  // Agenten und Gruppen aus diesem Auftrag verlinken, damit die Notizen
  // nicht nebeneinander liegen, sondern aufeinander zeigen
  const verwandte = (extra.notizen || []).filter(Boolean)
  const siehe = verwandte.length
    ? `\n## Dabei entstanden\n\n${verwandte.map((n) => `- [[${path.basename(n, '.md')}]]`).join('\n')}\n`
    : ''

  const kopf = summary
    ? await verknuepfen(summary, { ausser: title })
    : `Am ${s.date} um ${s.time.slice(0, 2)}:${s.time.slice(2)} Uhr ging es um: ${first.slice(0, 120)}`

  const body = [
    `# ${first.slice(0, 80)}`,
    '',
    kopf,
    siehe,
    '## Wie es lief',
    '',
    verlauf,
  ]
    .filter(Boolean)
    .join('\n')

  const { notizen, ...rest } = extra
  return writeNote('session', title, body, {
    typ: 'urai-sitzung',
    sitzung: session,
    aktualisiert: s.iso,
    tags: ['urai', 'sitzung'],
    ...rest,
  })
}

/** Übersichts-Notiz: eine Zeile pro Auftrag, neueste zuerst. */
export async function addToIndex({ note, summary, session, agents = 0 }) {
  if (!obsidianReady() || !loadConfig().obsidianAuto) return null
  const s = stamp()
  const kurz = (summary || '')
    .replace(/\*\*/g, '')
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('#'))
    ?.slice(0, 160)

  const link = `[[${path.basename(note, '.md')}]]`
  const zeile = `- **${s.date} ${s.time}** — ${link}${agents ? ` · ${agents} Agenten` : ''}${kurz ? `  \n  ${kurz}` : ''}`

  const folder = root()
  await fs.mkdir(folder, { recursive: true })
  const file = path.join(folder, 'Übersicht.md')

  let alt = ''
  try {
    alt = await fs.readFile(file, 'utf8')
  } catch {
    alt =
      frontmatter({ typ: 'urai-übersicht', tags: ['urai', 'übersicht'] }) +
      '# URAI — Übersicht\n\nJeder Auftrag, neueste zuerst.\n\n'
  }

  // neue Zeile direkt unter die Überschrift
  const marker = 'neueste zuerst.\n\n'
  const at = alt.indexOf(marker)
  const next = at >= 0 ? alt.slice(0, at + marker.length) + zeile + '\n' + alt.slice(at + marker.length) : alt + zeile + '\n'
  await fs.writeFile(file, next)
  return path.relative(vaultPath(), file)
}

/** Ein einzelner Agenten-Lauf. */
export async function saveAgentRun({ name, role, task, result, parent, tools = [], group }) {
  if (!obsidianReady() || !loadConfig().obsidianAuto) return null
  const s = stamp()
  const title = `${s.date} ${s.time} – ${safeName(name)}`

  const einleitung = group
    ? `${name} war als ${role} in der Gruppe [[${s.date} ${s.time} – ${safeName(group)}|${group}]] unterwegs.`
    : parent
      ? `${name} wurde von ${parent} losgeschickt und hat als ${role} gearbeitet.`
      : `${name} hat als ${role} gearbeitet.`

  const body = [
    `# ${name}`,
    '',
    einleitung,
    '',
    '## Was zu tun war',
    '',
    task,
    '',
    '## Was dabei herauskam',
    '',
    await verknuepfen(result || '_Kein Ergebnis._', { ausser: title }),
    tools.length ? `\n---\n\nGenutzte Werkzeuge: ${tools.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return writeNote('agent', title, body, {
    typ: 'urai-agent',
    agent: name,
    rolle: role,
    eltern: parent || 'nutzer',
    gruppe: group || '',
    zeit: s.iso,
    tags: ['urai', 'agent'],
  })
}

/** Eine Gruppe mit allen Mitgliedern. */
export async function saveGroup({ name, goal, members, result }) {
  if (!obsidianReady() || !loadConfig().obsidianAuto) return null
  const s = stamp()
  const title = `${s.date} ${s.time} – ${safeName(name)}`
  const body = [
    `# ${name}`,
    '',
    `Eine Gruppe aus ${members.length} Agenten hat zusammen daran gearbeitet: ${goal}`,
    '',
    '## Wer was gemacht hat',
    '',
    ...members.map((m) => `- **${m.name}** als ${m.role} — ${m.task}`),
    '',
    '## Was dabei herauskam',
    '',
    await verknuepfen(result || '_Noch offen._', { ausser: title }),
  ].join('\n')
  return writeNote('group', title, body, {
    typ: 'urai-gruppe',
    gruppe: name,
    ziel: goal,
    mitglieder: members.map((m) => m.name),
    zeit: s.iso,
    tags: ['urai', 'gruppe'],
  })
}

/** Gemerktes Wissen. */
export async function saveKnowledge(text, kind = 'note') {
  if (!obsidianReady() || !loadConfig().obsidianAuto) return null
  const s = stamp()
  const title = safeName(text.split('\n')[0].slice(0, 60))
  const verlinkt = await verknuepfen(text, { ausser: title })
  return appendNote('knowledge', title, `\n${verlinkt}  \n*Notiert am ${s.date} um ${s.time.slice(0, 2)}:${s.time.slice(2)} Uhr.*\n`, {
    typ: 'urai-wissen',
    art: kind,
    tags: ['urai', 'wissen'],
  })
}

// ─────────────── Werkzeuge fürs Gehirn ───────────────

export const obsidianTools = [
  {
    name: 'obsidian_write',
    description: 'Notiz in Obsidian anlegen oder überschreiben. Nutze das, um Ergebnisse dauerhaft festzuhalten.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titel der Notiz' },
        content: { type: 'string', description: 'Markdown-Inhalt' },
        folder: { type: 'string', description: 'Sitzungen | Agenten | Gruppen | Wissen | Protokolle' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'content'],
    },
    async run({ title, content, folder = 'Wissen', tags = [] }) {
      const rel = await writeNote(folder, title, content, {
        typ: 'urai-notiz',
        erstellt: new Date().toISOString(),
        tags: ['urai', ...tags],
      })
      return `In Obsidian gespeichert: ${rel}`
    },
  },
  {
    name: 'obsidian_append',
    description: 'An eine bestehende Obsidian-Notiz anhängen (legt sie an, falls sie fehlt).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        folder: { type: 'string' },
      },
      required: ['title', 'content'],
    },
    async run({ title, content, folder = 'Wissen' }) {
      const rel = await appendNote(folder, title, `\n${content}\n`, { typ: 'urai-notiz', tags: ['urai'] })
      return `Angehängt: ${rel}`
    },
  },
  {
    name: 'obsidian_search',
    description: 'Im ganzen Obsidian-Vault nach Text suchen.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
    async run({ query, limit = 20 }) {
      const hits = await searchVault(query, limit)
      if (!hits.length) return `Nichts zu "${query}" im Vault.`
      return hits.map((h, i) => `${i + 1}. ${h.file}\n   …${h.snippet}…`).join('\n')
    },
  },
  {
    name: 'obsidian_read',
    description: 'Eine Obsidian-Notiz lesen. Pfad relativ zum Vault, wie ihn obsidian_search liefert.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async run({ path: p }) {
      const text = await readNote(p)
      return text.slice(0, 40000)
    },
  },
]
