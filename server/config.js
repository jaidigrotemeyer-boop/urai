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
  cerebrasModel: 'zai-glm-4.7',
  groqModel: 'llama-3.3-70b-versatile',
  openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  embedModel: 'text-embedding-004', // Gemini, fürs Gedächtnis
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
    hasGemini: !!c.geminiKey,
    hasCerebras: !!c.cerebrasKey,
    hasGroq: !!c.groqKey,
    hasOpenrouter: !!c.openrouterKey,
  }
}
