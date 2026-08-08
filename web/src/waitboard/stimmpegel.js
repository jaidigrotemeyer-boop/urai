// Sprechen mit messbarer Lautstärke.
//
// Der Orb soll sich zur Stimme bewegen, nicht zu einem Timer. Timer driften
// nach ein paar Sekunden sichtbar auseinander — deshalb gibt es hier genau
// eine Wahrheit: pegel(). Der Orb liest sie pro Bild, sonst nichts.
//
// Zwei Wege, ein Unterschied, den man kennen muss:
//   • Server-Stimme (ElevenLabs) → echtes Audio, echte Messung per AnalyserNode.
//   • speechSynthesis des Browsers → gibt seine Audiodaten NICHT heraus. Da
//     lässt sich nichts messen. Wir bauen die Hüllkurve aus den Wortgrenzen
//     (onboundary) nach. Sieht richtig aus, ist aber geschätzt.

let hall = null // AudioContext
let messer = null // AnalyserNode
let puffer = null // Float32Array
let quellen = new WeakMap() // <audio> -> MediaElementSourceNode (jedes Element nur einmal)

let aktuellerPegel = 0
let spricht = false
let laufendesAudio = null
let kunstHuelle = null // Schätzwert für die Browser-Stimme
let echteStimme = null // null = noch nicht nachgesehen

function audioHall() {
  if (!hall) {
    hall = new (window.AudioContext || window.webkitAudioContext)()
    messer = hall.createAnalyser()
    messer.fftSize = 1024
    messer.smoothingTimeConstant = 0.75
    puffer = new Float32Array(messer.fftSize)
    messer.connect(hall.destination)
  }
  if (hall.state === 'suspended') hall.resume()
  return hall
}

/** Lautstärke gerade jetzt, 0..1. Bereits geglättet — direkt benutzbar. */
export function pegel() {
  return aktuellerPegel
}

export function istAmSprechen() {
  return spricht
}

// Läuft nur, solange gesprochen wird. Sonst kein rAF im Leerlauf.
function messen() {
  if (!spricht) {
    aktuellerPegel *= 0.82
    if (aktuellerPegel > 0.002) requestAnimationFrame(messen)
    else aktuellerPegel = 0
    return
  }

  let roh = 0
  if (messer && laufendesAudio) {
    messer.getFloatTimeDomainData(puffer)
    let summe = 0
    for (let i = 0; i < puffer.length; i++) summe += puffer[i] * puffer[i]
    // Effektivwert, dann gestaucht: Sprache ist leise, der Orb soll trotzdem leben.
    roh = Math.min(1, Math.sqrt(summe / puffer.length) * 3.2)
  } else if (kunstHuelle) {
    roh = kunstHuelle()
  }

  // Schnell hoch, langsam runter — so wirken Silben als Anschlag, nicht als Flimmern.
  aktuellerPegel = roh > aktuellerPegel ? aktuellerPegel + (roh - aktuellerPegel) * 0.5 : aktuellerPegel * 0.86
  requestAnimationFrame(messen)
}

async function hatServerStimme() {
  if (echteStimme !== null) return echteStimme
  try {
    const r = await fetch('/api/status')
    echteStimme = !!(await r.json()).config?.hasEleven
  } catch {
    echteStimme = false
  }
  return echteStimme
}

/**
 * Vorlesen. Nimmt die Server-Stimme, wenn es eine gibt, sonst die des Browsers.
 * @returns {Promise<void>} erfüllt sich, wenn zu Ende gesprochen wurde
 */
export async function sprich(text, { sprache = 'de-DE' } = {}) {
  const sauber = fuerDieStimme(text)
  if (!sauber) return
  still()

  if (await hatServerStimme()) {
    try {
      const r = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: sauber }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const url = URL.createObjectURL(await r.blob())
      const el = new Audio(url)
      el.crossOrigin = 'anonymous'

      audioHall()
      if (!quellen.has(el)) quellen.set(el, hall.createMediaElementSource(el))
      quellen.get(el).connect(messer)

      laufendesAudio = el
      spricht = true
      requestAnimationFrame(messen)

      await el.play()
      await new Promise((fertig) => {
        el.onended = fertig
        el.onerror = fertig
      })
      URL.revokeObjectURL(url)
      return
    } catch {
      echteStimme = false // einmal daneben, ab jetzt Browser-Stimme
    } finally {
      spricht = false
      laufendesAudio = null
    }
  }

  await browserSprechen(sauber, sprache)
}

/**
 * Die Browser-Stimme. Ihre Audiodaten sind nicht auslesbar, also bauen wir die
 * Hüllkurve aus den Wortgrenzen: bei jedem Wort ein Anschlag, dazwischen ein
 * leises Wabern. Nah genug dran, dass niemand es merkt.
 */
function browserSprechen(text, sprache) {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve()

  return new Promise((fertig) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = sprache
    u.rate = 1.05

    const stimmen = speechSynthesis.getVoices()
    const passend =
      stimmen.find((v) => v.lang === sprache && /siri|premium|enhanced|neural/i.test(v.name)) ||
      stimmen.find((v) => v.lang === sprache)
    if (passend) u.voice = passend

    let letzterAnschlag = 0
    kunstHuelle = () => {
      const seit = (performance.now() - letzterAnschlag) / 1000
      const anschlag = Math.max(0, 1 - seit * 3.4) // Wort klingt ~0,3 s nach
      const waber = 0.22 + 0.1 * Math.sin(performance.now() / 90)
      return Math.min(1, waber + anschlag * 0.75)
    }

    u.onboundary = () => { letzterAnschlag = performance.now() }
    u.onstart = () => {
      spricht = true
      letzterAnschlag = performance.now()
      requestAnimationFrame(messen)
    }
    const ende = () => {
      spricht = false
      kunstHuelle = null
      fertig()
    }
    u.onend = ende
    u.onerror = ende

    speechSynthesis.speak(u)
  })
}

export function still() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (laufendesAudio) {
    laufendesAudio.pause()
    laufendesAudio = null
  }
  spricht = false
  kunstHuelle = null
}

/** Markdown, Code und Links machen vorgelesen keinen Sinn. */
function fuerDieStimme(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' — Code steht auf dem Bildschirm — ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
}
