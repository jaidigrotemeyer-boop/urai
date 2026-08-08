// MCP: fremde Werkzeug-Server anbinden — Composio, Notion, Linear, was auch immer.
//
// MCP (Model Context Protocol) ist ein offener Standard: ein Server sagt, welche
// Werkzeuge er hat, und führt sie auf Zuruf aus. Damit muss URAI nicht für jeden
// Dienst eigenen Code bekommen — man trägt eine Adresse ein, und die Werkzeuge
// dieses Dienstes stehen im selben Topf wie die eingebauten.
//
// Bewusst nur der Client-Teil und nur über HTTP: das ist der Weg, den die
// gehosteten Server (Composio & Co.) sprechen, und er braucht keine
// Zusatzbibliothek — JSON-RPC über fetch reicht.
//
// SICHERHEIT: Ein MCP-Server ist fremder Code am anderen Ende. Seine Werkzeuge
// laufen zwar nicht auf diesem Rechner, aber sie können in deinem Namen bei
// einem Dienst handeln. Darum sind sie NICHT automatisch freigegeben — sie
// landen wie jedes gefährliche Werkzeug in der Rückfrage, solange der Nutzer
// sie nicht ausdrücklich freischaltet.
import { loadConfig } from './config.js'

/** Was gerade verbunden ist: id -> { name, werkzeuge[], fehler } */
const verbunden = new Map()

let zaehler = 1

/**
 * Ein JSON-RPC-Aufruf an einen MCP-Server.
 *
 * Die Server antworten mal als reines JSON, mal als Ereignisstrom (SSE) —
 * beides ist erlaubt. Darum wird die Antwort danach unterschieden, statt auf
 * eine Form zu wetten.
 */
async function rufen(server, methode, params, sitzung) {
  const kopf = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (server.token) kopf.authorization = `Bearer ${server.token}`
  if (sitzung) kopf['mcp-session-id'] = sitzung

  const r = await fetch(server.url, {
    method: 'POST',
    headers: kopf,
    body: JSON.stringify({ jsonrpc: '2.0', id: zaehler++, method: methode, params: params || {} }),
    signal: AbortSignal.timeout(45_000),
  })

  const neueSitzung = r.headers.get('mcp-session-id') || sitzung
  const roh = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${roh.slice(0, 200)}`)

  // Ereignisstrom: die Nutzlast steht in den "data:"-Zeilen
  let text = roh
  if (roh.startsWith('event:') || roh.includes('\ndata:') || roh.startsWith('data:')) {
    text = roh
      .split('\n')
      .filter((z) => z.startsWith('data:'))
      .map((z) => z.slice(5).trim())
      .join('')
  }
  if (!text.trim()) return { ergebnis: null, sitzung: neueSitzung }

  let j
  try {
    j = JSON.parse(text)
  } catch {
    throw new Error(`Unlesbare Antwort: ${text.slice(0, 200)}`)
  }
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error).slice(0, 200))
  return { ergebnis: j.result, sitzung: neueSitzung }
}

/** Nur benachrichtigen, keine Antwort erwarten (der Handschlag verlangt das). */
async function melden(server, methode, sitzung) {
  const kopf = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (server.token) kopf.authorization = `Bearer ${server.token}`
  if (sitzung) kopf['mcp-session-id'] = sitzung
  await fetch(server.url, {
    method: 'POST',
    headers: kopf,
    body: JSON.stringify({ jsonrpc: '2.0', method: methode, params: {} }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {}) // Manche Server antworten hier gar nicht — das ist erlaubt
}

/**
 * Namen entschärfen. Gehirne erwarten Werkzeugnamen aus [a-zA-Z0-9_-], und zwei
 * Server könnten dasselbe Werkzeug anbieten — darum bekommt jedes den Server
 * vorangestellt.
 */
function werkzeugName(serverId, roh) {
  const sauber = String(roh).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
  return `mcp_${String(serverId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 16)}_${sauber}`
}

/**
 * Einen Server anbinden: Handschlag, dann fragen was er kann.
 * @returns {Promise<{ok: boolean, anzahl?: number, fehler?: string}>}
 */
export async function serverVerbinden(server) {
  try {
    const start = await rufen(server, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'URAI', version: '0.1.0' },
    })
    const sitzung = start.sitzung
    await melden(server, 'notifications/initialized', sitzung)

    const liste = await rufen(server, 'tools/list', {}, sitzung)
    const roh = liste.ergebnis?.tools || []

    const werkzeuge = roh.map((w) => ({
      name: werkzeugName(server.id, w.name),
      // Wo der Aufruf hingeht, steht im Namen nicht drin — darum merken
      mcpServer: server.id,
      mcpName: w.name,
      description: `[${server.name}] ${w.description || w.name}`.slice(0, 400),
      parameters: w.inputSchema || { type: 'object', properties: {} },
      // Fremder Dienst, der in deinem Namen handelt: nicht ungefragt durchwinken
      danger: true,
      async run(args) {
        const antwort = await rufen(server, 'tools/call', { name: w.name, arguments: args || {} }, sitzung)
        const inhalt = antwort.ergebnis?.content
        if (!Array.isArray(inhalt)) return JSON.stringify(antwort.ergebnis ?? '').slice(0, 8000)
        // MCP gibt Blöcke zurück (Text, Bilder, …) — für das Gehirn zählt der Text
        return inhalt
          .map((teil) => (teil.type === 'text' ? teil.text : `[${teil.type}]`))
          .join('\n')
          .slice(0, 12000)
      },
    }))

    verbunden.set(server.id, { name: server.name, werkzeuge, fehler: null, sitzung })
    return { ok: true, anzahl: werkzeuge.length }
  } catch (err) {
    verbunden.set(server.id, { name: server.name, werkzeuge: [], fehler: err.message.slice(0, 300) })
    return { ok: false, fehler: err.message.slice(0, 300) }
  }
}

/** Alle eingeschalteten Server anbinden. Läuft beim Start und nach dem Speichern. */
export async function alleVerbinden() {
  const server = (loadConfig().mcpServer || []).filter((s) => s?.an !== false && s?.url)
  verbunden.clear()
  const ergebnisse = await Promise.all(
    server.map(async (s) => ({ id: s.id, name: s.name, ...(await serverVerbinden(s)) }))
  )
  return ergebnisse
}

/** Alle Werkzeuge aller verbundenen Server — kommen zu den eingebauten dazu. */
export function mcpWerkzeuge() {
  const raus = []
  for (const eintrag of verbunden.values()) raus.push(...eintrag.werkzeuge)
  return raus
}

/** Für die Anzeige in den Einstellungen. */
export function mcpStand() {
  const cfg = loadConfig()
  return (cfg.mcpServer || []).map((s) => {
    const v = verbunden.get(s.id)
    return {
      id: s.id,
      name: s.name,
      url: s.url,
      an: s.an !== false,
      hatToken: !!s.token,
      verbunden: !!v && !v.fehler,
      anzahl: v?.werkzeuge?.length || 0,
      werkzeuge: (v?.werkzeuge || []).map((w) => ({ name: w.name, beschreibung: w.description })),
      fehler: v?.fehler || null,
    }
  })
}
