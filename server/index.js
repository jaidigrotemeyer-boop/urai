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
import { TOOL_GROUPS, ALL_TOOLS, alleWerkzeuge, mcpQuelleSetzen } from './tools/index.js'
import { history, sessions } from './memory.js'
import { vaultPath, obsidianReady } from './obsidian.js'
import { ROLLEN } from './crew.js'
import { LiveWatcher, watchers } from './live.js'
import { raeumeAuf, bildschirmListe, IST_MAC } from './screen.js'
import { elevenBereit, sprechen as elevenSprechen, stimmenListe } from './eleven.js'
import { graphLesen } from './graph.js'
import { Waechter, lesen as ausloeserLesen, schreiben as ausloeserSchreiben } from './ausloeser.js'
import { einloesen as gutscheinEinloesen, stand as gutscheinStand } from './gutschein.js'
import { holen as briefingHolen, bereit as briefingBereit, heute as briefingHeute } from './briefing.js'
import { TelegramTuer } from './telegram.js'
import { stand as lokalStand, ollamaModelle, modellCacheLeeren } from './lokal.js'
import { alleVerbinden as mcpVerbinden, mcpWerkzeuge, mcpStand } from './mcp.js'
import { hoererDazu, melden, beschaeftigtSetzen } from './melder.js'
import { istGemeint } from './zuhoeren.js'
import { skillListe, skillLesen, skillSchreiben, skillLoeschen } from './skills.js'

// Die Werkzeugliste muss wissen, wo sie die MCP-Werkzeuge herbekommt
mcpQuelleSetzen(mcpWerkzeuge)
import { waitboardRouten } from './waitboard.js'
import {
  ablaufListe,
  ablaufLesen,
  ablaufSpeichern,
  ablaufLoeschen,
  pruefen as ablaufPruefen,
} from './ablauf.js'

// Ein Wächter pro offener Seite — beim Ändern der Liste müssen alle neu aufsetzen
const waechterListe = new Set()

// Genau eine Telegram-Tür für den ganzen Server. Pro Seite eine zu öffnen
// hieße, dieselbe Nachricht mehrfach zu beantworten.
const telegram = new TelegramTuer({ emit: (m) => waechterListe.forEach((w) => w.emit?.(m)) })

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
  const { herkunft = '', agbAkzeptiert = false, email = '', profilName = '', profilAlter = null, profilZweck = '', briefingThemen = [], geminiKey = '' } = req.body || {}
  const patch = {
    onboardingFertig: true,
    herkunft: String(herkunft).slice(0, 60),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()) ? String(email).trim().slice(0, 120) : '',
    profilName: String(profilName).slice(0, 40),
    profilAlter: Number.isFinite(profilAlter) ? Math.max(1, Math.min(120, profilAlter)) : null,
    profilZweck: String(profilZweck).slice(0, 60),
    briefingThemen: (Array.isArray(briefingThemen) ? briefingThemen : [])
      .map((th) => String(th).trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 6),
  }
  if (agbAkzeptiert) {
    patch.agbAkzeptiert = true
    patch.agbVersion = 1
  }
  // Nur setzen, wenn wirklich einer eingetippt wurde — ein leeres Feld darf
  // einen schon vorhandenen Schlüssel nicht auslöschen.
  const key = String(geminiKey).trim()
  if (key && !key.startsWith('••••')) patch.geminiKey = key
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

// Tagesbriefing. Der GET-Weg antwortet SOFORT — entweder mit dem fertigen
// Briefing oder mit "wird gebaut". Nie warten lassen: die Oberfläche soll das
// Fenster gleich zeigen und den Inhalt nachtragen, wenn er da ist.
app.get('/api/briefing', async (req, res) => {
  const cfg = loadConfig()
  const heute = briefingHeute()
  const schonGezeigt = cfg.briefingZuletztGezeigt === heute

  if (req.query.warten === '1') {
    try {
      return res.json({ briefing: await briefingHolen(), schonGezeigt })
    } catch (err) {
      return res.status(502).json({ fehler: err.message })
    }
  }

  if (briefingBereit()) {
    return res.json({ briefing: await briefingHolen(), schonGezeigt })
  }
  // Bauen anstoßen, aber nicht darauf warten
  briefingHolen().catch(() => {})
  res.json({ briefing: null, baut: true, schonGezeigt })
})

app.post('/api/briefing', async (req, res) => {
  try {
    res.json({ briefing: await briefingHolen({ neu: !!req.body?.neu }) })
  } catch (err) {
    res.status(502).json({ fehler: err.message })
  }
})

// Der Nutzer hat es gesehen — heute nicht nochmal von selbst aufgehen
app.post('/api/briefing/gesehen', (_req, res) => {
  res.json(saveConfig({ briefingZuletztGezeigt: briefingHeute() }))
})

// Dauerlauschen: war dieser Satz an URAI gerichtet? Die Entscheidung gehört
// auf den Server, weil dort das lokale Modell liegt — und weil die Grundhaltung
// "im Zweifel nein" an EINER Stelle stehen muss, nicht in jeder Oberfläche neu.
app.post('/api/gemeint', async (req, res) => {
  try {
    res.json(await istGemeint(req.body?.text))
  } catch (err) {
    // Auch der Fehlerfall sagt nein: ein kaputter Torwächter darf nicht
    // plötzlich alles durchlassen.
    res.json({ gemeint: false, grund: `fehler: ${err.message}` })
  }
})

app.get('/api/telegram', (_req, res) => {
  const c = loadConfig()
  res.json({ ...TelegramTuer.pruefen(), laeuft: telegram.laeuft, name: telegram.name || '', erlaubte: (c.telegramErlaubteIds || []).length })
})

// Nach dem Speichern neuer Zugangsdaten neu aufsetzen
app.post('/api/telegram/neu', async (_req, res) => {
  telegram.stop()
  res.json(await telegram.start())
})

// Lokales Gehirn: Stand, RAM-Druck, Schlange — die Oberfläche fragt im Takt nach
app.get('/api/lokal', async (_req, res) => {
  res.json({ ...(await lokalStand()), modelle: await ollamaModelle() })
})

app.get('/api/tools', (_req, res) => {
  res.json({
    groups: { ...TOOL_GROUPS, mcp: mcpWerkzeuge().map((t) => t.name) },
    tools: alleWerkzeuge().map((t) => ({ name: t.name, description: t.description, danger: !!t.danger })),
  })
})

// MCP: welche Server sind angebunden, was können sie
app.get('/api/mcp', (_req, res) => res.json(mcpStand()))

// Nach dem Speichern neu anbinden — sonst gälte ein neuer Server erst nach Neustart
app.post('/api/mcp/neu', async (_req, res) => {
  const ergebnis = await mcpVerbinden()
  res.json({ ergebnis, stand: mcpStand() })
})

// ── Skills: Anleitungen, die das Gehirn nur bei Bedarf holt ──
// Die Liste kommt bewusst ohne den Anleitungstext. Wer den will, holt den einzelnen Skill —
// dieselbe Sparsamkeit wie im Systemprompt, nur hier für die Oberfläche.
app.get('/api/skills', (_req, res) => res.json(skillListe()))

app.get('/api/skills/:id', (req, res) => {
  try {
    res.json(skillLesen(req.params.id))
  } catch (err) {
    res.status(err.code === 'KEIN_SKILL' ? 404 : 400).json({ fehler: err.message })
  }
})

app.post('/api/skills', (req, res) => {
  try {
    res.json(skillSchreiben(req.body || {}))
  } catch (err) {
    res.status(400).json({ fehler: err.message })
  }
})

app.delete('/api/skills/:id', (req, res) => {
  try {
    res.json({ ok: skillLoeschen(req.params.id) })
  } catch (err) {
    res.status(400).json({ fehler: err.message })
  }
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
    'briefingAn', 'briefingThemen', 'briefingZuletztGezeigt', 'schluessel',
    'meldungenAn', 'meldungenProStunde', 'meldungenRuheVon', 'meldungenRuheBis',
    'telegramAn', 'telegramToken', 'telegramErlaubteIds', 'telegramSprachantwort',
    'mausGleiten', 'mausGleitenStaerke', 'lokalBudgetGb', 'lokalModell', 'mcpServer',
  ]
  const patch = {}
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k]
  // Anstrengung ist eine Abkürzung: eine Wahl setzt gleich mehrere Regler
  if (patch.anstrengung && ANSTRENGUNGSSTUFEN[patch.anstrengung]) {
    Object.assign(patch, ANSTRENGUNGSSTUFEN[patch.anstrengung])
  }

  // Die Oberfläche bekommt Schlüssel nur maskiert (••••1234) und schickt sie so
  // auch zurück. Würde das durchgehen, wäre nach dem ersten Speichern jeder
  // echte Schlüssel durch vier Punkte ersetzt. Also: maskierte Einträge lassen
  // den bisherigen Schlüssel stehen.
  const istMaskiert = (k) => typeof k === 'string' && k.startsWith('••••')
  const alt = loadConfig()
  if (istMaskiert(patch.telegramToken)) delete patch.telegramToken
  for (const feld of ['customProviders', 'schluessel']) {
    if (!Array.isArray(patch[feld])) continue
    patch[feld] = patch[feld].map((eintrag) => {
      if (!istMaskiert(eintrag?.key)) return eintrag
      const frueher = (alt[feld] || []).find((x) => x.id === eintrag.id)
      return { ...eintrag, key: frueher?.key || '' }
    })
  }
  // MCP-Server tragen ihr Geheimnis unter "token" statt "key"
  if (Array.isArray(patch.mcpServer)) {
    patch.mcpServer = patch.mcpServer.map((eintrag) => {
      if (!istMaskiert(eintrag?.token)) return eintrag
      const frueher = (alt.mcpServer || []).find((x) => x.id === eintrag.id)
      return { ...eintrag, token: frueher?.token || '' }
    })
  }

  if ('lokalModell' in patch) modellCacheLeeren()
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

// Waitboard: Bild rein, Text raus — geschrieben wird im Browser.
waitboardRouten(app)

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
    // Solange eine Antwort läuft, schweigt der Melder: wer gerade bedient wird,
    // braucht keinen Zuruf über den Speicherstand dazwischen.
    beschaeftigtSetzen(true)
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
    beschaeftigtSetzen(false)
    send({ type: 'queue', laenge: 0, arbeitet: false })
  }

  // Von selbst reden: diese Seite trägt sich als Zuhörer ein. Die Regeln
  // (Ruhezeit, Obergrenze, kein Nachplappern) liegen im Modul und gelten für
  // alle Seiten gemeinsam — sonst meldete URAI bei zwei Tabs doppelt.
  const melderWeg = hoererDazu(send)

  // Was der Meldung wert ist, entscheidet sich hier und nicht im Melder:
  // der kennt nur die Regeln, nicht die Bedeutung.
  const sendUndMelden = (nachricht) => {
    send(nachricht)
    if (nachricht.type === 'live_note' && nachricht.wichtig) {
      melden(nachricht.text, { art: 'hinweis' })
    } else if (nachricht.type === 'ausloeser_fertig') {
      melden(`Der Ablauf "${nachricht.name || nachricht.ablauf}" ist durch.`, { art: 'erfolg' })
    } else if (nachricht.type === 'ausloeser_fehler') {
      // Ein fehlgeschlagener Ablauf ist dringend: er läuft von selbst los,
      // also merkt es sonst niemand — auch nicht nachts.
      melden(`Auslöser gescheitert: ${nachricht.text}`, { art: 'warnung', dringend: true })
    }
  }

  // Auslöser: startet Abläufe von selbst. Meldet sich vorher hier.
  const waechter = new Waechter({ emit: sendUndMelden })
  waechterListe.add(waechter)
  if (loadConfig().ausloeserAn) waechter.start()

  // Live-Modus: guckt von selbst mit, solange die Seite offen ist
  const watcher = new LiveWatcher({ emit: sendUndMelden })
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
    // Ohne das sammelt der Melder tote Verbindungen und redet ins Leere
    melderWeg()
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
  // Telegram nur, wenn Token UND Erlaubnisliste stehen — pruefen() entscheidet
  // MCP-Server anbinden. Fehlschläge sind kein Grund zum Abbruch — dann fehlen
  // eben die Werkzeuge dieses Dienstes, alles andere läuft weiter.
  mcpVerbinden().then((liste) => {
    const gut = liste.filter((l) => l.ok)
    if (gut.length) console.log(`  MCP:         ${gut.map((g) => `${g.name} (${g.anzahl})`).join(', ')}`)
    for (const schlecht of liste.filter((l) => !l.ok)) {
      console.log(`  MCP:         ${schlecht.name} nicht erreichbar — ${schlecht.fehler}`)
    }
  })
  telegram.start().then((st) => {
    if (!st.an && st.grund && st.grund !== 'aus') console.log(`  Telegram:    aus (${st.grund})`)
  })
  if (!fs.existsSync(dist)) console.log(`  Web-App:     noch nicht gebaut — im Dev auf http://localhost:5173\n`)
  else console.log('')
})
