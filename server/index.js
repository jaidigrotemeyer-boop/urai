// URAI Server: Express + WebSocket. Läuft nur auf 127.0.0.1 — niemand von außen kommt rein.
import express from 'express'
import { WebSocketServer } from 'ws'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Agent } from './agent.js'
import { loadConfig, saveConfig, publicConfig } from './config.js'
import { brainStatus } from './brain.js'
import { TOOL_GROUPS, ALL_TOOLS } from './tools/index.js'
import { history, sessions } from './memory.js'
import { vaultPath, obsidianReady } from './obsidian.js'
import { ROLLEN } from './crew.js'
import { LiveWatcher, watchers } from './live.js'
import { raeumeAuf } from './screen.js'
import { elevenBereit, sprechen as elevenSprechen, stimmenListe } from './eleven.js'
import { graphLesen } from './graph.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 3017)

const app = express()
app.use(express.json({ limit: '10mb' }))

app.get('/api/status', async (_req, res) => {
  res.json({
    ok: true,
    brain: await brainStatus(),
    config: publicConfig(),
    obsidian: { vault: vaultPath(), ready: obsidianReady() },
    rollen: Object.keys(ROLLEN),
  })
})

app.get('/api/tools', (_req, res) => {
  res.json({
    groups: TOOL_GROUPS,
    tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, danger: !!t.danger })),
  })
})

app.post('/api/config', (req, res) => {
  const allowed = [
    'geminiKey', 'cerebrasKey', 'groqKey', 'openrouterKey',
    'elevenKey', 'elevenVoice', 'elevenModel',
    'geminiModel', 'cerebrasModel', 'groqModel', 'openrouterModel', 'embedModel', 'brainOrder',
    'autoApprove', 'autoMode', 'autoSummary', 'workspace', 'maxSteps', 'language',
    'liveMode', 'liveIntervalMs', 'liveTalkGapMs', 'liveMaxPerHour',
    'obsidianVault', 'obsidianFolder', 'obsidianAuto',
    'maxAgentDepth', 'maxAgentsPerRun', 'agentSteps',
  ]
  const patch = {}
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k]
  saveConfig(patch)
  res.json(publicConfig())
})

// Stimme: der Browser schickt Text, bekommt fertiges MP3 zurück.
// Der ElevenLabs-Schlüssel bleibt dabei hier und geht nie an die Seite.
app.post('/api/speak', async (req, res) => {
  if (!elevenBereit()) return res.status(400).json({ fehler: 'kein-schluessel' })
  try {
    const mp3 = await elevenSprechen(req.body?.text || '', { voice: req.body?.voice })
    res.set('content-type', 'audio/mpeg').send(mp3)
  } catch (err) {
    res.status(502).json({ fehler: err.message })
  }
})

app.get('/api/voices', async (_req, res) => res.json(await stimmenListe()))

app.get('/api/graph', async (_req, res) => {
  try {
    res.json(await graphLesen())
  } catch (err) {
    res.status(500).json({ fehler: err.message, knoten: [], kanten: [] })
  }
})

app.get('/api/sessions', (_req, res) => res.json(sessions()))
app.get('/api/history/:session', (req, res) => res.json(history(req.params.session)))

// Gebaute Web-App ausliefern (nach `npm run build`)
const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg))
  let agent = null

  // Warteschlange: kommt ein Auftrag, während noch gearbeitet wird,
  // wird er angestellt statt abgewiesen. Der Nutzer sieht seine Position.
  const schlange = []
  let arbeitet = false

  async function abarbeiten() {
    if (arbeitet) return
    arbeitet = true
    while (schlange.length) {
      const job = schlange[0]
      send({ type: 'queue', laenge: schlange.length, arbeitet: true, jetzt: job.text?.slice(0, 60) })
      if (!agent || agent.session !== job.session) {
        agent = new Agent({ session: job.session || 'default', emit: send })
      }
      try {
        await agent.send(job.text, { enabledTools: job.enabledTools })
      } catch (err) {
        send({ type: 'error', message: err.message })
      }
      schlange.shift()
    }
    arbeitet = false
    send({ type: 'queue', laenge: 0, arbeitet: false })
  }

  // Live-Modus: guckt von selbst mit, solange die Seite offen ist
  const watcher = new LiveWatcher({ emit: send })
  watchers.add(watcher)
  if (loadConfig().liveMode) watcher.start()

  send({ type: 'hello', config: publicConfig() })

  ws.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.type === 'chat') {
      schlange.push(msg)
      send({ type: 'queue', laenge: schlange.length, arbeitet })
      abarbeiten()
      return
    }
    if (msg.type === 'approval') return agent?.approve(msg.id, msg.ok, msg.always)
    if (msg.type === 'stop') {
      schlange.length = 0 // Wartende Aufträge auch wegwerfen
      return agent?.stop()
    }
    if (msg.type === 'lang') {
      if (msg.code && msg.code !== loadConfig().language) saveConfig({ language: msg.code })
      return
    }
    if (msg.type === 'live') {
      const an = msg.on ?? !watcher.running
      an ? watcher.start() : watcher.stop()
      saveConfig({ liveMode: an })
      return
    }
    if (msg.type === 'ping') return send({ type: 'pong' })
  })

  ws.on('close', () => {
    agent?.stop()
    watcher.stop()
    watchers.delete(watcher)
  })
})

// ws wirft denselben Fehler nochmal — sonst stirbt Node trotz Handler unten
wss.on('error', () => {})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Platz ${PORT} ist besetzt. URAI läuft schon.`)
    console.error(`  Aufmachen:   http://localhost:${PORT}`)
    console.error(`  Oder töten:  lsof -ti:${PORT} | xargs kill`)
    console.error(`  Oder woanders: PORT=3018 npm start\n`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, '127.0.0.1', () => {
  const c = loadConfig()
  const brains = [
    c.geminiKey && 'Gemini',
    c.cerebrasKey && 'Cerebras',
    c.groqKey && 'Groq',
    c.openrouterKey && 'OpenRouter',
  ].filter(Boolean)
  console.log(`\n  URAI läuft:  http://localhost:${PORT}`)
  console.log(`  Gehirne:     ${brains.join(' → ') || 'KEINER — Schlüssel in den Einstellungen eintragen'}`)
  console.log(`  Revier:      ${c.workspace}`)
  console.log(`  Obsidian:    ${vaultPath() || 'kein Vault gefunden'}`)
  raeumeAuf().then((n) => n && console.log(`  Aufgeräumt:  ${n} altes Bildschirmfoto gelöscht`))
  if (!fs.existsSync(dist)) console.log(`  Web-App:     noch nicht gebaut — im Dev auf http://localhost:5173\n`)
  else console.log('')
})
