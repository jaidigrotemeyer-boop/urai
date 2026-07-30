// Einstellungen liegen lokal in ~/urai/data/config.json — nichts verlässt den Rechner.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = path.join(root, 'data')
const FILE = path.join(DATA_DIR, 'config.json')

const DEFAULTS = {
  geminiKey: '',
  cerebrasKey: '',
  groqKey: '',
  openrouterKey: '',
  // Wer zuerst gefragt wird. Fällt einer aus, kommt der nächste.
  brainOrder: ['gemini', 'cerebras', 'groq', 'openrouter'],
  // "latest" statt fester Version — Google nimmt alte Namen für neue Nutzer weg
  geminiModel: 'gemini-flash-latest',
  // Flinkes Modell für Kleinkram: Zusammenfassungen, Live-Notizen, kurze Züge.
  // Spart Zeit und Kontingent — das große Modell bleibt fürs Denken.
  geminiFastModel: 'gemini-flash-lite-latest',
  cerebrasModel: 'zai-glm-4.7',
  groqModel: 'llama-3.3-70b-versatile',
  openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  embedModel: 'text-embedding-004', // Gemini, fürs Gedächtnis
  // ElevenLabs — echte Stimme. Leer = der Browser spricht selbst.
  elevenKey: '',
  elevenVoice: 'JBFqnCBsd6RMkjVDRZzb', // George, ruhig und klar
  elevenModel: 'eleven_flash_v2_5', // schnell und mehrsprachig
  // Werkzeuge, die ohne Rückfrage laufen dürfen
  autoApprove: [
    'fs_read', 'fs_list', 'fs_search', 'fs_glob',
    'web_fetch', 'web_search',
    'mac_read_screen', 'mac_screenshot', 'mac_find_text', 'mac_ui', 'mac_apps', 'mac_notify',
    'memory_search',
  ],
  workspace: process.env.HOME,
  maxSteps: 24,
  language: 'de', // Sprache für Antworten, Zusammenfassungen und Live-Notizen
  // Auto-Modus: nie fragen, einfach machen. Der Stopp-Knopf bleibt.
  autoMode: true,
  autoSummary: true,
  // Live-Modus: dauernd mitgucken. Von Anfang an an.
  liveMode: true,
  liveIntervalMs: 2500, // wie oft hinschauen — kostet nichts, läuft lokal
  liveTalkGapMs: 25000, // wie oft höchstens das Gehirn fragen — DAS kostet Kontingent
  liveMaxPerHour: 80, // harte Obergrenze an Gehirn-Fragen pro Stunde
  liveTimeoutMs: 20000,
  liveRemember: true, // Wichtiges aus dem Gesehenen ins Gedächtnis
  // Bildschirmfotos werden IMMER sofort nach dem Verstehen gelöscht.
  // Gespeichert wird nur Text. Kein Bild liegt je auf der Platte.
  // Obsidian
  obsidianVault: '', // leer = automatisch aus Obsidians eigener Liste
  obsidianFolder: 'URAI',
  obsidianAuto: true, // alles automatisch mitschreiben
  // Agenten-Gruppen
  maxAgentDepth: 3, // wie tief dürfen Agenten Agenten erschaffen
  maxAgentsPerRun: 12, // Notbremse gegen endloses Vermehren
  agentSteps: 14, // Schritte pro Unter-Agent

  // ── Feineinstellung: bisher fest im Code verdrahtet ──────────────────

  // Gehirn-Kette: wie hartnäckig URAI ist, wenn ein Anbieter zickt.
  // Wer nur einen Gratis-Schlüssel hat, wartet lieber, als aufzugeben.
  brainMaxWaitS: 150,
  brainPauseMs: 600000, // Sperre nach 401/402/403/404
  brainRunden: 3, // wie oft die ganze Kette durchprobiert wird

  // Kontext-Haushalt — der größte Hebel gegen "Kontingent aufgebraucht":
  // was vom Werkzeug zurück ins Gehirn geht, kostet bei JEDEM weiteren Zug erneut.
  toolResultMax: 14000,
  kontextFrisch: 4, // letzte N Werkzeug-Ergebnisse im Wortlaut
  kontextAltMax: 400, // ältere auf so viel stutzen
  recallTreffer: 4, // Gedächtnis-Zeilen pro Auftrag

  // Werkzeug-Grenzen. Der Standard reicht für Kleinkram, nicht für npm install.
  shellTimeoutMs: 120000,
  shellMaxOutput: 100000,
  fsMaxBytes: 200000,
  webMaxChars: 20000,
  webTimeoutMs: 25000,
  browserSichtbar: true, // false = Playwright unsichtbar, für Arbeit im Hintergrund

  // Live-Mitgucken: Genauigkeit gegen Lüfter — und WELCHER Bildschirm.
  // Bei zwei Monitoren guckt URAI sonst dauerhaft auf den falschen.
  bildschirmNummer: 1,
  liveOcrBreite: 1280, // höher = liest kleinen Text, kostet Rechenzeit
  liveVorschauBreite: 900,
  liveNotizen: 60, // wie weit live_report zurückblicken kann
  liveStrafeMaxMs: 900000, // Deckel der Verdopplungs-Strafe nach 429

  // agent_team startet sonst ALLE Mitglieder gleichzeitig und reißt
  // mit einem Schlag das Minuten-Kontingent.
  maxAgentsParallel: 3,

  // Selbstumbau — die einzige Fähigkeit, mit der URAI sich selbst zerlegen kann,
  // und bisher die einzige ohne Aus-Knopf.
  selbstumbauErlaubt: true,
  selfBuildTimeoutMs: 180000,

  graphMaxKnoten: 400,
}

let cache = null

const SPRACHNAMEN = {
  de: 'Deutsch',
  en: 'English',
  es: 'español',
  fr: 'français',
  it: 'italiano',
  pt: 'português',
  tr: 'Türkçe',
}

/** Name der eingestellten Sprache, so wie ein Modell ihn versteht. */
export function sprachName() {
  return SPRACHNAMEN[loadConfig().language] || 'English'
}

export function loadConfig() {
  if (cache) return cache
  fs.mkdirSync(DATA_DIR, { recursive: true })
  let onDisk = {}
  try {
    onDisk = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {}
  cache = { ...DEFAULTS, ...onDisk }
  // Umgebungsvariablen gewinnen, falls gesetzt
  if (process.env.GEMINI_API_KEY) cache.geminiKey = process.env.GEMINI_API_KEY
  if (process.env.CEREBRAS_API_KEY) cache.cerebrasKey = process.env.CEREBRAS_API_KEY
  if (process.env.GROQ_API_KEY) cache.groqKey = process.env.GROQ_API_KEY
  if (process.env.OPENROUTER_API_KEY) cache.openrouterKey = process.env.OPENROUTER_API_KEY
  if (process.env.ELEVENLABS_API_KEY) cache.elevenKey = process.env.ELEVENLABS_API_KEY
  return cache
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch }
  cache = next
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2))
  return next
}

// Für die UI: Schlüssel niemals im Klartext zurückgeben
export function publicConfig() {
  const c = loadConfig()
  const mask = (k) => (k ? `••••${k.slice(-4)}` : '')
  return {
    ...c,
    geminiKey: mask(c.geminiKey),
    cerebrasKey: mask(c.cerebrasKey),
    groqKey: mask(c.groqKey),
    openrouterKey: mask(c.openrouterKey),
    elevenKey: mask(c.elevenKey),
    hasEleven: !!c.elevenKey,
    hasGemini: !!c.geminiKey,
    hasCerebras: !!c.cerebrasKey,
    hasGroq: !!c.groqKey,
    hasOpenrouter: !!c.openrouterKey,
  }
}
