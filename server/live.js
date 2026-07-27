// Live-Modus: URAI guckt dauernd mit.
// Alle paar Sekunden ein Blick auf den Bildschirm. Nur wenn sich etwas ändert,
// fragt er das Gehirn — sonst wäre das laut, teuer und langweilig.
//
// Bewegtbild (Video, Scrollen, Spiel) erkennt er daran, dass sich das Bild ändert,
// der Text aber nicht. Dann schaut das Augen-Modell hin statt der Text-Erkennung.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { loadConfig, sprachName } from './config.js'
import { capture, ocr, screenSize, frontContext } from './screen.js'
import { look } from './brain.js'

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)

/** Grob gleich? Damit dasselbe Wichtige nicht zehnmal im Gedächtnis landet. */
function aehnlich(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3)
  const A = new Set(norm(a))
  const B = norm(b)
  if (!A.size || !B.length) return false
  const treffer = B.filter((w) => A.has(w)).length
  return treffer / Math.max(A.size, B.length) > 0.6
}

export class LiveWatcher {
  constructor({ emit }) {
    this.emit = emit
    this.timer = null
    this.running = false
    this.busy = false
    this.last = { textHash: '', bildHash: '', app: '', text: '', at: 0 }
    this.frames = 0
    this.notes = []
    this.fragen = [] // Zeitpunkte der Gehirn-Fragen, für die Stunden-Grenze
    this.strafe = 0 // Zusatz-Pause, wenn das Kontingent zickt
    this.gemerkt = [] // schon Gemerktes, gegen Doppelungen
  }

  /** Darf ich das Gehirn fragen? Kontingent ist begrenzt und teuer. */
  darfFragen(cfg) {
    const jetzt = Date.now()
    this.fragen = this.fragen.filter((t) => jetzt - t < 3600_000)
    if (this.fragen.length >= cfg.liveMaxPerHour) return false
    return jetzt - this.last.at >= cfg.liveTalkGapMs + this.strafe
  }

  start() {
    if (this.running) return
    this.running = true
    const cfg = loadConfig()
    this.emit({ type: 'live_state', on: true, interval: cfg.liveIntervalMs })
    this.tick() // gleich einmal hinschauen
    this.timer = setInterval(() => this.tick(), cfg.liveIntervalMs)
  }

  stop() {
    this.running = false
    clearInterval(this.timer)
    this.timer = null
    this.emit({ type: 'live_state', on: false })
  }

  toggle() {
    this.running ? this.stop() : this.start()
    return this.running
  }

  /** Ein Blick. Läuft nie doppelt. */
  async tick() {
    if (this.busy || !this.running) return
    this.busy = true
    try {
      const cfg = loadConfig()
      const size = await screenSize()
      const shot = await capture({ ocrWidth: 1280, viewWidth: 900 })

      const bildHash = hash(shot.base64)
      let lines = []
      try {
        lines = await ocr(shot.file, size)
      } finally {
        // Datei sofort weg — auch wenn die Text-Erkennung schiefging
        await fs.unlink(shot.file).catch(() => {})
      }

      const text = lines.map((l) => l.text).join(' ')
      const textHash = hash(text)
      const front = await frontContext().catch(() => ({}))

      this.frames++
      this.emit({ type: 'live_frame', data: shot.base64, app: front.app, nr: this.frames })

      const bildNeu = bildHash !== this.last.bildHash
      const textNeu = textHash !== this.last.textHash
      const appNeu = front.app && front.app !== this.last.app

      // Nichts passiert — nicht das Gehirn wecken
      if (!bildNeu && !textNeu && !appNeu) {
        this.busy = false
        return
      }

      // Bild bewegt sich, Text steht still → das ist Bewegtbild
      const bewegtbild = bildNeu && !textNeu && !appNeu

      // Bilder sind gratis (lokal), Fragen ans Gehirn nicht. Also sparsam fragen.
      if (!this.darfFragen(cfg)) {
        this.last = { ...this.last, bildHash, textHash, app: front.app || this.last.app, text }
        this.busy = false
        return
      }

      this.fragen.push(Date.now())
      const note = await this.beschreibe({ shot, front, text, bewegtbild, appNeu })
      this.last = { textHash, bildHash, app: front.app || '', text, at: Date.now() }

      if (note) {
        this.notes.push({ t: Date.now(), app: front.app, note })
        if (this.notes.length > 60) this.notes.shift()
        this.emit({ type: 'live_note', text: note, app: front.app })
      }
    } catch (err) {
      this.emit({ type: 'live_error', message: err.message })
      // Erlaubnis fehlt oder Bildschirm nicht lesbar — nicht endlos weiterprobieren
      if (/nicht erlaubt|Erlaubnis/i.test(err.message)) this.stop()
    } finally {
      this.busy = false
    }
  }

  /** Einen Satz dazu, was gerade passiert. */
  async beschreibe({ shot, front, text, bewegtbild, appNeu }) {
    const cfg = loadConfig()
    const vorher = this.notes.slice(-3).map((n) => `- ${n.note}`).join('\n')

    const frage = [
      bewegtbild
        ? 'Auf dem Bildschirm läuft gerade Bewegtbild (Video, Animation, Spiel). Was passiert darin?'
        : appNeu
          ? `Der Nutzer ist gerade zu "${front.app}" gewechselt. Was macht er dort?`
          : 'Auf dem Bildschirm hat sich etwas geändert. Was ist neu?',
      '',
      `Antworte in EINEM kurzen Satz, höchstens 15 Wörter, in ${sprachName()}.`,
      'Kein "Ich sehe", kein "Auf dem Bild". Einfach sagen, was los ist.',
      'Wiederhol dich nicht.',
      '',
      'Ist etwas dabei, das man sich WIRKLICH merken sollte — ein Ergebnis, eine Entscheidung,',
      'ein Termin, eine Zahl, ein Fehler, eine Zusage —, dann hänge eine zweite Zeile an:',
      'WICHTIG: <die Sache in einem Satz>',
      'Alltägliches (Scrollen, Tippen, Fenster wechseln) ist NICHT wichtig. Im Zweifel weglassen.',
      vorher ? `\nWas du eben schon gesagt hast:\n${vorher}` : '',
      !bewegtbild && text ? `\nText auf dem Bildschirm:\n${text.slice(0, 1500)}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const antwort = await look({
        imageBase64: shot.base64,
        question: frage,
        signal: AbortSignal.timeout(cfg.liveTimeoutMs),
        flink: true, // Mitgucken läuft dauernd — das muss billig und schnell sein
      })
      this.strafe = 0 // ging gut, wieder normal weitermachen
      if (!antwort) return null

      const zeilen = antwort.trim().split('\n').filter((l) => l.trim())
      const note = zeilen[0].slice(0, 200)

      // Nur das Wichtige bleibt. Das Bild ist zu diesem Zeitpunkt schon weg.
      const wichtig = zeilen.find((l) => /^\s*WICHTIG\s*:/i.test(l))
      if (wichtig) {
        const satz = wichtig.replace(/^\s*WICHTIG\s*:\s*/i, '').trim()
        if (satz.length > 8) this.merken(satz, front.app)
      }
      return note
    } catch (err) {
      const m = err.message || ''
      // Kontingent alle oder zu schnell gefragt → deutlich langsamer werden
      if (/429|quota|rate limit/i.test(m)) {
        this.strafe = Math.min((this.strafe || cfg.liveTalkGapMs) * 2, 15 * 60_000)
        this.emit({
          type: 'live_note',
          text: `Kontingent knapp — schaue weiter zu, frage aber erst in ${Math.round(this.strafe / 60000)} Min wieder nach.`,
          app: front.app,
        })
      }
      return null
    }
  }

  /**
   * Etwas Wichtiges festhalten. Nur Text — das Bildschirmfoto ist längst gelöscht.
   * Kein Bild verlässt je diesen Rechner und keines liegt irgendwo herum.
   */
  async merken(satz, app) {
    if (!loadConfig().liveRemember) return
    const schon = this.gemerkt.some((g) => aehnlich(g, satz))
    if (schon) return
    this.gemerkt.push(satz)
    if (this.gemerkt.length > 200) this.gemerkt.shift()

    this.emit({ type: 'live_note', text: satz, app, wichtig: true })
    try {
      const { remember } = await import('./memory.js')
      await remember(`[gesehen${app ? ` in ${app}` : ''}] ${satz}`, 'gesehen')
    } catch {}
  }

  /** Kurzer Bericht fürs Gehirn, wenn der Nutzer fragt „was war grad?“ */
  bericht(n = 12) {
    if (!this.notes.length) return 'Live-Modus hat noch nichts gesehen.'
    return this.notes
      .slice(-n)
      .map((x) => {
        const d = new Date(x.t)
        const p = (v) => String(v).padStart(2, '0')
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} [${x.app || '?'}] ${x.note}`
      })
      .join('\n')
  }
}

// Ein Beobachter pro Verbindung, damit das Werkzeug ihn findet
export const watchers = new Set()

export const liveTools = [
  {
    name: 'live_report',
    description:
      'Was hat der Live-Modus zuletzt auf dem Bildschirm gesehen? Nutze das bei Fragen wie ' +
      '"was ist gerade passiert", "was lief eben", "was hab ich zuletzt gemacht".',
    parameters: { type: 'object', properties: { anzahl: { type: 'number' } } },
    async run({ anzahl = 12 }) {
      const w = [...watchers][0]
      if (!w) return 'Live-Modus läuft nicht.'
      return w.bericht(anzahl)
    },
  },
  {
    name: 'live_toggle',
    description: 'Live-Mitgucken an- oder ausschalten.',
    parameters: { type: 'object', properties: { an: { type: 'boolean' } }, required: ['an'] },
    async run({ an }) {
      const w = [...watchers][0]
      if (!w) return 'Kein Beobachter da.'
      an ? w.start() : w.stop()
      return an ? 'Live-Modus läuft.' : 'Live-Modus aus.'
    },
  },
]
