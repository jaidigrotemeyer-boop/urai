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

// ─────────────────────── Ins Wort fallen ───────────────────────

// Bremsen gegen Rückkopplung. Ohne Kopfhörer hört das Mikrofon die eigene
// Ausgabe — ohne diese drei Bremsen unterbricht URAI sich beim ersten Wort
// selbst und bringt keinen Satz mehr zu Ende.
const ANLAUF_MS = 700 // Mikro erst aufmachen, wenn die Ausgabe schon läuft
const MIN_ZEICHEN = 6 // kürzere Fetzen sind fast immer Echo oder Husten
const MIN_WORTE = 2

/** Für den Echo-Vergleich: alles weg außer Buchstaben, Zahlen und einfachen Lücken. */
function nurLaute(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function genugGesagt(text) {
  const t = text.trim()
  if (!t) return false
  return t.length >= MIN_ZEICHEN || t.split(/\s+/).length >= MIN_WORTE
}

/**
 * Hört sich URAI hier gerade selbst?
 *
 * NICHT RAUSWERFEN. Das ist keine Vorsichtsmaßnahme für den Notfall, das ist
 * der Normalfall: Sobald jemand ohne Kopfhörer arbeitet, landet die eigene
 * Ausgabe im Mikrofon und die Erkennung liefert sie als "Sprache" zurück.
 * Ohne diesen Vergleich schneidet URAI sich zuverlässig nach dem ersten
 * halben Wort selbst ab — und zwar so, dass es nach kaputter Erkennung
 * aussieht statt nach fehlender Bremse.
 */
function istEigeneStimme(gehoert, gesprochen) {
  const g = nurLaute(gehoert)
  if (!g) return true
  // Der Anfang des gerade Gesprochenen ist der häufigste Treffer — das Mikro
  // schnappt den Satzbeginn auf. Echo setzt aber auch mittendrin ein, darum
  // wird das Gehörte im ganzen Text gesucht, nicht nur vorn.
  return gesprochen.startsWith(g) || gesprochen.includes(g)
}

/**
 * Sprechen, aber unterbrechbar. Während geredet wird, läuft die Erkennung
 * leise mit; kommt echte Sprache dazwischen, ist die Ausgabe sofort still
 * und onUnterbrochen(text) fällt.
 *
 * Kann der Browser nicht zuhören — oder ist `aus` gesetzt — wird einfach
 * normal gesprochen. Das ist kein Fehler, nur eine Ansage statt einem Gespräch.
 *
 * Wer von außen .stop() ruft, bekommt keinen Rückruf mehr: der weiß selbst,
 * dass er abgebrochen hat.
 *
 * Achtung beim Aufruf: das Weckwort-Lauschen belegt dasselbe Mikrofon. Wer
 * beides gleichzeitig laufen lässt, streitet sich um das Gerät.
 *
 * @param {string} text
 * @param {{onEnde?: () => void, onUnterbrochen?: (text: string) => void, aus?: boolean}} [opt]
 * @returns {{stop: () => void}}
 */
export function sprechenUnterbrechbar(text, { onEnde, onUnterbrochen, aus } = {}) {
  if (!text) {
    queueMicrotask(() => onEnde?.())
    return { stop: () => {} }
  }

  const Erkenner = window.SpeechRecognition || window.webkitSpeechRecognition
  const gesprochen = nurLaute(text)

  let r = null
  let uhr = null // Anlauf, später Neustart
  let beendet = false

  // Der Erkenner muss in JEDEM Ausgang sterben. Einer der weiterläuft, hält
  // das Mikrofon fest und alles danach — Diktat, Weckwort — bleibt taub.
  const erkennerAus = () => {
    clearTimeout(uhr)
    uhr = null
    const alt = r
    r = null
    if (!alt) return
    // Erst die Rückrufe kappen, dann abbrechen: sonst löst abort() gleich
    // wieder onend aus und der Neustart-Reflex startet ihn erneut.
    alt.onresult = null
    alt.onerror = null
    alt.onend = null
    try {
      alt.abort()
    } catch {}
  }

  const beenden = (grund, gehoert) => {
    if (beendet) return
    beendet = true
    erkennerAus()
    if (grund === 'unterbrochen') {
      still()
      onUnterbrochen?.(gehoert)
    } else if (grund === 'fertig') {
      onEnde?.()
    }
  }

  const horchen = () => {
    if (beendet) return
    let erk
    try {
      erk = new Erkenner()
    } catch {
      return // kein Mikro, kein Drama — es wird trotzdem zu Ende gesprochen
    }
    r = erk
    erk.lang = LOCALE[sprache()] || 'en-US'
    erk.continuous = true
    erk.interimResults = true
    erk.maxAlternatives = 1

    erk.onresult = (ev) => {
      if (beendet) return
      let gehoert = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) gehoert += ev.results[i][0].transcript
      if (!genugGesagt(gehoert)) return
      if (istEigeneStimme(gehoert, gesprochen)) return
      beenden('unterbrochen', gehoert.trim())
    }

    erk.onerror = (ev) => {
      // Mikro verboten oder kein Dienst da: dann eben nicht unterbrechbar.
      // Nach außen still bleiben, die Ausgabe läuft ja weiter.
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') erkennerAus()
      // no-speech, aborted, network: harmlos, onend startet gleich neu
    }

    erk.onend = () => {
      if (beendet || r !== erk) return
      r = null
      // Chrome beendet die Erkennung nach kurzer Stille von selbst. Bei einer
      // langen Antwort wäre danach Schluss mit Reinreden — also gleich wieder
      // an. Die kleine Pause ist zugleich ein zweiter Anlauf gegen Echo.
      clearTimeout(uhr)
      uhr = setTimeout(horchen, 300)
    }

    try {
      erk.start()
    } catch {
      erkennerAus()
    }
  }

  // Anlauf: das Mikrofon geht erst auf, wenn die Ausgabe schon angelaufen ist.
  // Direkt beim Start ist der Pegel am höchsten und die Erkennung am
  // gutgläubigsten — genau da entstehen die Selbstunterbrechungen.
  if (!aus && Erkenner) uhr = setTimeout(horchen, ANLAUF_MS)

  sprechen(text, { onEnde: () => beenden('fertig') })
    .then(() => {
      // sprechen() holt bei ElevenLabs erst Audio vom Server. Ein still(),
      // das währenddessen fällt, trifft ins Leere — das Audio startet danach
      // trotzdem. Also nachsetzen, wenn wir inzwischen fertig sind.
      if (beendet) still()
    })
    .catch(() => beenden('fertig'))

  return {
    stop: () => {
      if (beendet) return
      beendet = true
      erkennerAus()
      still()
    },
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
