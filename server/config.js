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

  // Beweis-Pflicht: nach jedem Klick nachsehen, ob er gewirkt hat.
  // Kostet einen halben Blick pro Handlung, verhindert dafür,
  // dass URAI Erfolg meldet, den es nie gab.
  beweisPflicht: true,
  beweisWartenMs: 450,

  // Anstrengung: eine Wahl statt zehn Regler. Wirkt auf Schrittzahl,
  // wie viel Kontext frisch bleibt und wie hartnäckig das Gehirn wechselt.
  anstrengung: 'normal', // schnell | normal | gruendlich

  // Auslöser: Abläufe starten von selbst. Die Karenzzeit ist Absicht —
  // der Nutzer soll sehen, was gleich passiert, und es abwürgen können.
  ausloeserAn: true,
  ausloeserKarenzS: 10,

  // Erststart: Willkommen, Herkunft, Nutzungsbedingungen, Unterstützen.
  // Läuft genau einmal, lässt sich in den Einstellungen erneut abspielen.
  onboardingFertig: false,
  herkunft: '', // woher der Nutzer URAI kennt — nur fürs eigene Interesse
  agbAkzeptiert: false,
  agbVersion: 0,
  // Kein echtes Konto, keine Bestätigung — bleibt nur lokal in dieser Datei.
  email: '',
  // Kurzes, freiwilliges Profil aus dem Erststart — nur zur Personalisierung,
  // bleibt komplett lokal in dieser Datei, geht nirgendwo hin.
  profilName: '',
  profilAlter: null,
  profilZweck: '',

  // Tagesbriefing: einmal am Tag beim Öffnen zeigen, was in diesen Themen los ist.
  // Ohne Themen bleibt es leer — geraten wird hier nichts.
  briefingAn: true,
  briefingThemen: [], // z.B. ['Bitcoin', 'KI-Modelle', 'Bundesliga']
  briefingZuletztGezeigt: '', // YYYY-MM-DD, damit es genau einmal pro Tag aufgeht

  // Von selbst reden: URAI meldet sich ungefragt, wenn ihm etwas auffällt.
  // Die Zahlen sind bewusst knauserig. Ein Assistent, der zu oft dazwischen-
  // redet, wird abgeschaltet — und meldet dann auch das Wichtige nicht mehr.
  // Lieber sechs gute Meldungen am Tag als vierzig, die man wegklickt.
  meldungenAn: true,
  meldungenProStunde: 6,
  meldungenRuheVon: 22, // Stunde, ab der geschwiegen wird
  meldungenRuheBis: 8, // Stunde, ab der wieder geredet werden darf

  // Telegram als zweiter Eingang: schreiben oder reinsprechen, unterwegs.
  // Wer hier schreibt, steuert diesen Mac — darum läuft es nur mit einer
  // ausdrücklichen Erlaubnisliste. Leer heißt aus, nicht "jeder darf".
  telegramAn: false,
  telegramToken: '',
  telegramErlaubteIds: [], // deine Telegram-Kennung, z.B. ['123456789']
  telegramSprachantwort: true, // auf Sprachnachricht wird gesprochen geantwortet

  // MCP-Server: fremde Werkzeug-Dienste anbinden (Composio, Notion, Linear, …).
  // Ein Eintrag genügt, und die Werkzeuge dieses Dienstes stehen URAI zur
  // Verfügung. Sie gelten als gefährlich und fragen vorher — es sind fremde
  // Dienste, die in deinem Namen handeln.
  // je { id, name, url, token?, an }
  mcpServer: [],

  // Lokales Gehirn: wie viel Arbeitsspeicher URAI sich fürs eigene Denken
  // nehmen darf, in GB. 0 = aus, sonst 2 bis 100. Daraus ergibt sich, wie viel
  // gleichzeitig läuft und welche Arten Arbeit lokal bleiben. Wird der Speicher
  // knapp, drosselt server/lokal.js von selbst — der Nutzer hat Vorrang.
  lokalBudgetGb: 0,
  lokalModell: 'llama3.2:3b',

  // Den Zeiger sichtbar zum Ziel führen, statt ihn hinzubeamen. Kostet pro
  // Klick ein paar Zehntelsekunden — dafür sieht man, was URAI gleich anfasst,
  // und kann eingreifen, bevor er klickt.
  mausGleiten: true,
  mausGleitenStaerke: 60, // cliclick -e: 30 ≈ 190 ms, 60 ≈ 230 ms, 100 ≈ 330 ms

  // Zusätzliche Schlüssel — beliebig viele, auch mehrere fürs selbe Gehirn.
  // Der Sinn: Gratis-Kontingente sind pro Schlüssel gedeckelt. Wer drei
  // Gemini-Schlüssel einträgt, hat das dreifache Tageskontingent — ist einer
  // leer, springt der nächste ein, ohne dass jemand etwas merkt.
  // je {id, anbieter: 'gemini'|'cerebras'|'groq'|'openrouter', key, model?}
  schluessel: [],

  // Unterstützen: kein Bezahlsystem — der Nutzer trägt seinen EIGENEN
  // Spenden-Link ein (Ko-fi, PayPal.me, GitHub Sponsors, was auch immer).
  // URAI erfindet hier keine Adresse.
  spendenLink: '',
  unterstuetzerStufe: 'keine', // keine | unterstuetzer | lebenslang
  unterstuetzerBis: null, // Zeitstempel, nur bei "unterstuetzer"

  // Eigene Gehirne: jeder OpenAI-kompatible Anbieter geht — Together, Fireworks,
  // Mistral, DeepSeek, Perplexity, ein eigener lokaler Server, was auch immer.
  // je { id, name, url, key, model }
  customProviders: [],
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
// Feste Werte je Anstrengungsstufe. Wechselt der Nutzer die Stufe,
// werden diese Werte direkt in die Konfiguration geschrieben.
export const ANSTRENGUNGSSTUFEN = {
  schnell: { maxSteps: 10, agentSteps: 6, kontextFrisch: 2, brainRunden: 1, maxAgentsParallel: 4 },
  normal: { maxSteps: 24, agentSteps: 14, kontextFrisch: 4, brainRunden: 3, maxAgentsParallel: 3 },
  gruendlich: { maxSteps: 48, agentSteps: 24, kontextFrisch: 8, brainRunden: 5, maxAgentsParallel: 2 },
}

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
    telegramToken: mask(c.telegramToken),
    // Die Listen tragen ihre Schlüssel im Klartext — die dürfen genauso wenig
    // an die Seite wie die eingebauten. Der Server behält sie, die Oberfläche
    // sieht nur die letzten vier Zeichen und kann trotzdem alles verwalten.
    customProviders: (c.customProviders || []).map((p) => ({ ...p, key: mask(p.key) })),
    schluessel: (c.schluessel || []).map((s) => ({ ...s, key: mask(s.key) })),
    mcpServer: (c.mcpServer || []).map((s) => ({ ...s, token: mask(s.token) })),
    hasTelegram: !!c.telegramToken,
    hasEleven: !!c.elevenKey,
    hasGemini: !!c.geminiKey,
    hasCerebras: !!c.cerebrasKey,
    hasGroq: !!c.groqKey,
    hasOpenrouter: !!c.openrouterKey,
  }
}
