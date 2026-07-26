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
export async function saveSession(session, entries, extra = {}, summary = null) {
  if (!obsidianReady() || !loadConfig().obsidianAuto) return null
  const s = stamp()
  const first = entries.find((e) => e.role === 'user')?.content || 'Sitzung'
  const title = `${s.date} – ${safeName(first.slice(0, 50))}`
  const verlauf = entries
    .map((e) => {
      const who = { user: '🧑 Du', assistant: '🤖 URAI', tool: '🔧 Werkzeug' }[e.role] || e.role
      return `### ${who}\n\n${e.content}\n`
    })
    .join('\n')
  const body = [
    `# ${title}`,
    '',
    summary ? `## Zusammenfassung\n\n${summary}\n` : '',
    '## Verlauf',
    '',
    verlauf,
  ]
    .filter(Boolean)
    .join('\n')

  return writeNote('session', title, body, {
    typ: 'urai-sitzung',
    sitzung: session,
    aktualisiert: s.iso,
    tags: ['urai', 'sitzung'],
    ...extra,
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
  const body = [
    `# ${name}`,
    '',
    `**Rolle:** ${role}`,
    parent ? `**Erschaffen von:** ${parent}` : '**Erschaffen von:** Nutzer',
    group ? `**Gruppe:** [[${group}]]` : '',
    tools.length ? `**Werkzeuge:** ${tools.join(', ')}` : '',
    '',
    '## Auftrag',
    '',
    task,
    '',
    '## Ergebnis',
    '',
    result || '(kein Ergebnis)',
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
    `# Gruppe: ${name}`,
    '',
    `**Ziel:** ${goal}`,
    '',
    '## Mitglieder',
    '',
    ...members.map((m) => `- **${m.name}** (${m.role}) — ${m.task}`),
    '',
    '## Gemeinsames Ergebnis',
    '',
    result || '(offen)',
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
  return appendNote('knowledge', title, `\n- ${text}  \n  <small>${s.date} ${s.time}</small>\n`, {
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
