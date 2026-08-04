// URAI Server: Express + WebSocket. Läuft nur auf 127.0.0.1 — niemand von außen kommt rein.
import express from 'express'
import { WebSocketServer } from 'ws'
import http from 'node:http'
import { spawn as spawnProc } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Agent } from './agent.js'
import { loadConfig, saveConfig, publicConfig, ANSTRENGUNGSSTUFEN } from './config.js'
import { brainStatus } from './brain.js'
import { TOOL_GROUPS, ALL_TOOLS } from './tools/index.js'
import { history, sessions } from './memory.js'
import { vaultPath, obsidianReady } from './obsidian.js'
import { ROLLEN } from './crew.js'
import { LiveWatcher, watchers } from './live.js'
import { raeumeAuf, bildschirmListe, IST_MAC } from './screen.js'
import { elevenBereit, sprechen as elevenSprechen, stimmenListe } from './eleven.js'
import { graphLesen } from './graph.js'
import { Waechter, lesen as ausloeserLesen, schreiben as ausloeserSchreiben } from './ausloeser.js'
import { einloesen as gutscheinEinloesen, stand as gutscheinStand } from './gutschein.js'
import {
  ablaufListe,
  ablaufLesen,
  ablaufSpeichern,
  ablaufLoeschen,
  pruefen as ablaufPruefen,
} from './ablauf.js'

// Ein Wächter pro offener Seite — beim Ändern der Liste müssen alle neu aufsetzen
const waechterListe = new Set()

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
    unterstuetzer: gutscheinStand(),
  })
})

// Erststart: Profil, Herkunft und Nutzungsbedingungen in einem Zug speichern
app.post('/api/onboarding', (req, res) => {
  const { herkunft = '', agbAkzeptiert = false, profilName = '', profilAlter = null, profilZweck = '' } = req.body || {}
  const patch = {
    onboardingFertig: true,
    herkunft: String(herkunft).slice(0, 60),
    profilName: String(profilName).slice(0, 40),
    profilAlter: Number.isFinite(profilAlter) ? Math.max(1, Math.min(120, profilAlter)) : null,
    profilZweck: String(profilZweck).slice(0, 60),
  }
  if (agbAkzeptiert) {
    patch.agbAkzeptiert = true
    patch.agbVersion = 1
  }
  res.json(saveConfig(patch))
})

app.post('/api/gutschein', (req, res) => {
  try {
    res.json({ ok: true, ...gutscheinEinloesen(req.body?.code) })
  } catch (err) {
    res.status(400).json({ ok: false, fehler: err.message })
  }
})

app.get('/api/bildschirme', async (_req, res) => {
  if (!IST_MAC) return res.json([])
  res.json(await bildschirmListe().catch(() => []))
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
    'brainMaxWaitS', 'brainPauseMs', 'brainRunden',
    'toolResultMax', 'kontextFrisch', 'kontextAltMax', 'recallTreffer',
    'shellTimeoutMs', 'shellMaxOutput', 'fsMaxBytes',
    'webMaxChars', 'webTimeoutMs', 'browserSichtbar',
    'bildschirmNummer', 'liveOcrBreite', 'liveVorschauBreite',
    'liveNotizen', 'liveStrafeMaxMs', 'liveTimeoutMs', 'liveRemember',
    'maxAgentsParallel', 'selbstumbauErlaubt', 'selfBuildTimeoutMs',
    'graphMaxKnoten', 'geminiFastModel', 'customProviders',
    'beweisPflicht', 'beweisWartenMs', 'ausloeserAn', 'ausloeserKarenzS',
    'anstrengung', 'spendenLink', 'onboardingFertig',
  ]
  const patch = {}
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k]
  // Anstrengung ist eine Abkürzung: eine Wahl setzt gleich mehrere Regler
  if (patch.anstrengung && ANSTRENGUNGSSTUFEN[patch.anstrengung]) {
    Object.assign(patch, ANSTRENGUNGSSTUFEN[patch.anstrengung])
  }
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

// ── Abläufe: die Werkstatt spricht über REST, gestartet wird über den WebSocket ──
app.get('/api/ablaeufe', async (_req, res) => {
  try {
    res.json(await ablaufListe())
  } catch (err) {
    res.status(500).json({ fehler: err.message })
  }
})

app.get('/api/ablaeufe/:id', async (req, res) => {
  try {
    res.json(await ablaufLesen(req.params.id))
  } catch (err) {
    res.status(404).json({ fehler: err.message })
  }
})

app.post('/api/ablaeufe', async (req, res) => {
  try {
    res.json(await ablaufSpeichern(req.body, { modus: 'neu' }))
  } catch (err) {
    res.status(400).json({ fehler: err.message, stellen: err.stellen })
  }
})

app.put('/api/ablaeufe/:id', async (req, res) => {
  try {
    res.json(await ablaufSpeichern({ ...req.body, id: req.params.id }, { modus: 'ersetzen' }))
  } catch (err) {
    res.status(400).json({ fehler: err.message, stellen: err.stellen })
  }
})

app.delete('/api/ablaeufe/:id', async (req, res) => {
  try {
    res.json(await ablaufLoeschen(req.params.id))
  } catch (err) {
    res.status(400).json({ fehler: err.message })
  }
})

// Nur prüfen, nicht speichern — damit die Werkstatt beim Zeichnen schon warnen kann
app.post('/api/ablaeufe/:id/pruefen', (req, res) => {
  try {
    res.json(ablaufPruefen({ ...req.body, id: req.params.id }))
  } catch (err) {
    res.json({ ok: false, fehler: [err.message] })
  }
})

app.get('/api/ausloeser', (_req, res) => res.json(ausloeserLesen()))

app.post('/api/ausloeser', (req, res) => {
  try {
    const liste = ausloeserSchreiben(req.body)
    for (const w of waechterListe) w.neuLaden()
    res.json(liste)
  } catch (err) {
    res.status(400).json({ fehler: err.message })
  }
})

app.get('/api/graph', async (_req, res) => {
  try {
    res.json(await graphLesen())
  } catch (err) {
    res.status(500).json({ fehler: err.message, knoten: [], kanten: [] })
  }
})

// Den ganzen Code als Zip — für den Download-Knopf auf der Marketing-Seite.
// Läuft nur lokal, kein Zusatzpaket: das Bordmittel "zip" reicht.
app.get('/api/download', (_req, res) => {
  res.set('content-type', 'application/zip')
  res.set('content-disposition', 'attachment; filename="urai.zip"')
  const zip = spawnProc(
    'zip', ['-r', '-x', 'node_modules/*', '-x', 'data/*', '-x', 'dist/*', '-x', '.git/*', '-', '.'],
    { cwd: root }
  )
  zip.stdout.pipe(res)
  zip.on('error', () => res.status(500).end())
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

  // Auslöser: startet Abläufe von selbst. Meldet sich vorher hier.
  const waechter = new Waechter({ emit: send })
  waechterListe.add(waechter)
  if (loadConfig().ausloeserAn) waechter.start()

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
    if (msg.type === 'ausloeser_abbrechen') return waechter.abbrechen(msg.id)
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
    waechter.stop()
    waechterListe.delete(waechter)
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
