// Stimme: zuhören und sprechen. Beides steckt schon im Browser drin,
// kostet nichts und braucht keinen Schlüssel.
import { sprache } from './i18n.js'

const LOCALE = { de: 'de-DE', en: 'en-US', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR', tr: 'tr-TR' }

export function kannHoeren() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function kannSprechen() {
  return typeof speechSynthesis !== 'undefined'
}

/**
 * Zuhören. Ruft laufend mit dem bisher Verstandenen zurück,
 * am Ende einmal mit fertig=true.
 * @returns {{stop: () => void}}
 */
export function hoeren({ onText, onEnde, onFehler }) {
  const Erkenner = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Erkenner) {
    onFehler?.('Dieser Browser kann nicht zuhören. Chrome kann es.')
    return { stop: () => {} }
  }

  const r = new Erkenner()
  r.lang = LOCALE[sprache()] || 'en-US'
  r.continuous = false
  r.interimResults = true
  r.maxAlternatives = 1

  let letzter = ''
  r.onresult = (e) => {
    let text = ''
    let fertig = false
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript
      if (e.results[i].isFinal) fertig = true
    }
    letzter = text
    onText?.(text, fertig)
  }
  r.onerror = (e) => onFehler?.(e.error === 'not-allowed' ? 'Mikrofon nicht erlaubt.' : e.error)
  r.onend = () => onEnde?.(letzter)

  try {
    r.start()
  } catch (err) {
    onFehler?.(err.message)
  }
  return { stop: () => r.stop() }
}

// ─────────────── Echte Stimme über den Server (ElevenLabs) ───────────────

let echteStimme = null // null = noch nicht geprüft
let laeuft = null // gerade spielendes Audio

export async function pruefeEchteStimme() {
  try {
    const r = await fetch('/api/status')
    const s = await r.json()
    echteStimme = !!s.config?.hasEleven
  } catch {
    echteStimme = false
  }
  return echteStimme
}

/**
 * Vorlesen. Nimmt die echte Stimme, wenn ein ElevenLabs-Schlüssel da ist,
 * sonst die eingebaute Browser-Stimme.
 */
export async function sprechen(text, { onEnde } = {}) {
  if (!text) return
  if (echteStimme === null) await pruefeEchteStimme()

  if (echteStimme) {
    try {
      still()
      const r = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      laeuft = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        laeuft = null
        onEnde?.()
      }
      await audio.play()
      return
    } catch {
      // Ging nicht — dann eben die Browser-Stimme
      echteStimme = false
    }
  }
  browserSprechen(text, { onEnde })
}

/** Die eingebaute Stimme des Browsers. */
function browserSprechen(text, { onEnde } = {}) {
  if (!kannSprechen() || !text) return
  const sauber = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`>|]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700)
  if (!sauber) return

  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(sauber)
  const locale = LOCALE[sprache()] || 'en-US'
  u.lang = locale
  u.rate = 1.05
  u.pitch = 1

  // Die beste passende Stimme nehmen, falls das System mehrere hat
  const stimmen = speechSynthesis.getVoices()
  const passend =
    stimmen.find((v) => v.lang === locale && /siri|premium|enhanced|neural/i.test(v.name)) ||
    stimmen.find((v) => v.lang === locale) ||
    stimmen.find((v) => v.lang?.startsWith(locale.slice(0, 2)))
  if (passend) u.voice = passend

  u.onend = () => onEnde?.()
  speechSynthesis.speak(u)
}

export function still() {
  if (kannSprechen()) speechSynthesis.cancel()
  if (laeuft) {
    laeuft.pause()
    laeuft = null
  }
}

// ─────────────────────────── Weckwort ───────────────────────────

// So kann der Name ankommen — Spracherkennung hört selten genau "URAI"
const WECKWORTE = [
  'hey urai', 'hey uray', 'hey u rai', 'hey你rai', 'hey urei', 'hey urrai', 'hey yurai', 'hey urai,',
  'hey你', 'hey ur ai', 'hey ura', 'hallo urai', 'hola urai', 'ciao urai', 'salut urai',
  'urai', 'uray', 'u rai', 'ur ai',
]

function weckwortTreffer(text) {
  const t = ` ${text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ')} `
  for (const w of WECKWORTE) {
    const i = t.indexOf(` ${w} `)
    if (i >= 0) return { ab: i + w.length + 2 }
    if (t.trim().startsWith(w)) return { ab: t.indexOf(w) + w.length }
  }
  return null
}

/**
 * Dauerhaft im Hintergrund lauschen. Fällt das Weckwort, geht der Rest
 * des Satzes als Befehl raus. Läuft von selbst wieder an, wenn der
 * Browser die Erkennung beendet.
 *
 * Nichts wird aufgenommen oder verschickt — nur der erkannte Text
 * nach dem Weckwort verlässt den Browser.
 *
 * @returns {{stop: () => void}}
 */
export function weckwortHoeren({ onWach, onBefehl, onFehler, onStatus }) {
  const Erkenner = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Erkenner) {
    onFehler?.('Dieser Browser kann nicht zuhören. Chrome kann es.')
    return { stop: () => {} }
  }

  let r = null
  let laeuft = true
  let wach = false
  let neustart = null

  const starten = () => {
    if (!laeuft) return
    r = new Erkenner()
    r.lang = LOCALE[sprache()] || 'en-US'
    r.continuous = true
    r.interimResults = true

    r.onresult = (e) => {
      let text = ''
      let fertig = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        if (e.results[i].isFinal) fertig = true
      }

      const treffer = weckwortTreffer(text)
      if (treffer && !wach) {
        wach = true
        still() // nicht sich selbst zuhören
        onWach?.()
      }
      if (!wach) return

      const befehl = treffer ? text.slice(Math.max(0, treffer.ab - 1)).trim() : text.trim()
      onStatus?.(befehl)

      if (fertig) {
        wach = false
        if (befehl.length > 2) onBefehl?.(befehl)
        else onStatus?.('')
      }
    }

    r.onerror = (e) => {
      if (e.error === 'not-allowed') {
        laeuft = false
        onFehler?.('Mikrofon nicht erlaubt.')
      } else if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'network') {
        // passiert dauernd, ist harmlos — einfach neu anfangen
      } else {
        onFehler?.(e.error)
      }
    }

    // Der Browser stoppt von selbst nach einer Weile. Also gleich wieder an.
    r.onend = () => {
      if (!laeuft) return
      clearTimeout(neustart)
      neustart = setTimeout(starten, 400)
    }

    try {
      r.start()
    } catch {
      clearTimeout(neustart)
      neustart = setTimeout(starten, 800)
    }
  }

  starten()

  return {
    stop: () => {
      laeuft = false
      clearTimeout(neustart)
      try {
        r?.abort()
      } catch {}
    },
  }
}
