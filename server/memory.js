// Gedächtnis-Truhe: SQLite daheim + Vektoren von nomic-embed-text.
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { DATA_DIR } from './config.js'
import { embed } from './brain.js'

fs.mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(path.join(DATA_DIR, 'urai.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'note',
    text TEXT NOT NULL,
    vec  TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session);
`)

export function logMessage(session, role, content) {
  db.prepare('INSERT INTO messages (session, role, content, created_at) VALUES (?,?,?,?)').run(
    session,
    role,
    String(content ?? ''),
    Date.now()
  )
}

export function history(session, limit = 200) {
  return db
    .prepare('SELECT role, content, created_at FROM messages WHERE session=? ORDER BY id DESC LIMIT ?')
    .all(session, limit)
    .reverse()
}

export function sessions() {
  return db
    .prepare(
      `SELECT session, COUNT(*) n, MAX(created_at) last,
              (SELECT content FROM messages m2 WHERE m2.session=m.session AND m2.role='user' ORDER BY id LIMIT 1) first
       FROM messages m GROUP BY session ORDER BY last DESC LIMIT 50`
    )
    .all()
}

export async function remember(text, kind = 'note') {
  let vec = null
  try {
    vec = JSON.stringify(await embed(text))
  } catch {}
  db.prepare('INSERT INTO memories (kind, text, vec, created_at) VALUES (?,?,?,?)').run(kind, text, vec, Date.now())
  // Zusätzlich als Notiz in Obsidian — spät importiert, sonst drehen sich die Importe im Kreis
  let note = null
  try {
    const { saveKnowledge } = await import('./obsidian.js')
    note = await saveKnowledge(text, kind)
  } catch {}
  return note ? `Gemerkt. Auch in Obsidian: ${note}` : 'Gemerkt.'
}

export async function recall(query, k = 5) {
  const rows = db.prepare('SELECT id, kind, text, vec FROM memories ORDER BY id DESC LIMIT 500').all()
  if (!rows.length) return []
  let qv = null
  try {
    qv = await embed(query)
  } catch {}
  if (!qv) {
    const q = query.toLowerCase()
    return rows.filter((r) => r.text.toLowerCase().includes(q)).slice(0, k)
  }
  return rows
    .map((r) => ({ ...r, score: r.vec ? cosine(qv, JSON.parse(r.vec)) : 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((r) => r.score > 0.3)
}

function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

export const memoryTools = [
  {
    name: 'memory_save',
    description: 'Etwas dauerhaft merken: Vorlieben, Projekt-Wissen, wichtige Fakten.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' }, kind: { type: 'string', description: 'note | user | project' } },
      required: ['text'],
    },
    async run({ text, kind }) {
      return remember(text, kind || 'note')
    },
  },
  {
    name: 'memory_search',
    description: 'Im Gedächtnis suchen. Nutze das, wenn nach Früherem gefragt wird.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    async run({ query }) {
      const hits = await recall(query, 6)
      return hits.length ? hits.map((h) => `[${h.kind}] ${h.text}`).join('\n') : '(nichts im Gedächtnis)'
    },
  },
]
