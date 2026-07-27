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

/** Vorlesen. Bricht ab, was vorher lief. */
export function sprechen(text, { onEnde } = {}) {
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
}
