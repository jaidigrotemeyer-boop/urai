// Kraft: durch die Kamera schauen (macOS).
// Der Bildschirm zeigt, woran du arbeitest — die Kamera zeigt, wo du sitzt.
// Aufnahme über ffmpeg mit avfoundation, Beschreibung über dasselbe Augen-Modell,
// das auch den Bildschirm beschreibt (brain.look). Ein zweiter Weg zum Gehirn
// wäre eine zweite Stelle, an der es kaputtgehen kann.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { look } from '../brain.js'
import { IST_MAC } from '../screen.js'
import { loadConfig } from '../config.js'

// Wie viele Bilder geholt werden, bevor eines behalten wird. Das erste Bild einer
// Mac-Kamera ist fast immer schwarz oder ausgebrannt — Belichtung und Weißabgleich
// regeln erst über mehrere Bilder nach. Zwölf sind bei 30 Bildern/s knapp eine
// halbe Sekunde und reichen zuverlässig, ohne dass die Leuchte lange brennt.
const BILDER = 12

// Die Kamera braucht selbst ein bis zwei Sekunden zum Aufwachen. Wer nach zwanzig
// Sekunden nicht da ist, kommt nicht mehr — dann ist sie meist von einer anderen
// App belegt, und weiter zu warten hilft niemandem.
const ZEITLIMIT = 20_000

/**
 * Wo liegt ffmpeg? Nicht fest verdrahten: Homebrew legt es auf Apple Silicon nach
 * /opt/homebrew/bin, auf Intel-Macs nach /usr/local/bin, MacPorts wieder woandershin.
 * Dazu startet der Server oft ohne Login-Shell und erbt darum nicht die PATH-Zeile
 * aus der .zshrc des Nutzers — deshalb PATH *und* die bekannten Orte absuchen.
 */
function ffmpegSuchen() {
  const orte = [
    ...String(process.env.PATH || '')
      .split(':')
      .filter(Boolean),
    '/opt/homebrew/bin', // Homebrew auf Apple Silicon
    '/usr/local/bin', // Homebrew auf Intel
    '/opt/local/bin', // MacPorts
  ]
  for (const ort of orte) {
    const p = path.join(ort, 'ffmpeg')
    if (fssync.existsSync(p)) return p
  }
  return null
}

// Gesucht wird erst beim Gebrauch und das Ergebnis dann behalten: wer ffmpeg
// nachinstalliert, soll dafür nicht URAI neu starten müssen.
let ffmpegPfad = null
function ffmpeg() {
  if (!ffmpegPfad) ffmpegPfad = ffmpegSuchen()
  if (!ffmpegPfad) {
    throw new Error(
      'ffmpeg fehlt — ohne das kommt kein Kamerabild. Installieren mit: brew install ffmpeg ' +
        '(danach einfach nochmal fragen, ein Neustart ist nicht nötig).'
    )
  }
  return ffmpegPfad
}

function kameraPruefen() {
  if (!IST_MAC) {
    throw new Error(
      'Durch die Kamera schauen geht nur auf macOS — der Weg dahin (avfoundation) gehört Apple. ' +
        'Auf diesem System nicht verfügbar.'
    )
  }
}

/**
 * ffmpeg laufen lassen und auf jeden Fall wieder loswerden.
 *
 * Gemessen und wehgetan: execFile mit `timeout` schickt nur SIGTERM, und ffmpeg
 * hängt beim Öffnen der Kamera tief im AVFoundation-Runloop — dort kommt das
 * Signal nicht an. Der Aufruf lief statt 20 Sekunden endlos, und mit ihm stand
 * URAI. Darum wird die Zusage hier umgedreht: nach Ablauf der Zeit antwortet
 * dieser Aufruf, ob ffmpeg das nun einsieht oder nicht. Das Aufräumen (SIGTERM,
 * kurz darauf SIGKILL) läuft im Hintergrund weiter.
 *
 * @returns {Promise<string>} was ffmpeg auf stderr gesagt hat
 */
function ffmpegLauf(args, zeitlimit = ZEITLIMIT) {
  return new Promise((fertig, schief) => {
    let kind
    try {
      kind = spawn(ffmpeg(), args)
    } catch (err) {
      return schief(err)
    }
    let gemeckert = ''
    let erledigt = false
    const antworten = (fn, wert) => {
      if (erledigt) return
      erledigt = true
      clearTimeout(uhr)
      fn(wert)
    }

    // stdout landet in Dateien; der Kanal muss trotzdem leergelesen werden,
    // sonst blockiert ffmpeg irgendwann an einer vollen Pipe.
    kind.stdout.on('data', () => {})
    kind.stderr.on('data', (d) => {
      if (gemeckert.length < 8000) gemeckert += d.toString()
    })

    const uhr = setTimeout(() => {
      const fehler = new Error('Zeit abgelaufen')
      fehler.abgelaufen = true
      fehler.stderr = gemeckert
      antworten(schief, fehler)
      kind.kill('SIGTERM')
      setTimeout(() => kind.kill('SIGKILL'), 1500).unref()
    }, zeitlimit)

    kind.on('error', (err) => antworten(schief, err))
    kind.on('close', (code) => {
      if (code === 0) return antworten(fertig, gemeckert)
      const fehler = new Error(`ffmpeg endete mit Code ${code}`)
      fehler.stderr = gemeckert
      antworten(schief, fehler)
    })
  })
}

/**
 * Die Videoquellen, die avfoundation kennt.
 * ffmpeg schreibt diese Liste auf stderr und beendet sich danach mit Fehlercode —
 * das ist so gewollt, es gibt ja keine Eingabedatei. Ein Fehlschlag darf hier also
 * nicht als Fehler durchgehen, sonst sieht URAI nie eine Kamera.
 * @returns {Promise<Array<{nummer:string,name:string,bildschirm:boolean}>>}
 */
async function videoQuellen() {
  let text = ''
  try {
    text = await ffmpegLauf(['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], 15000)
  } catch (err) {
    text = err.stderr || ''
    if (!text) throw err // wirklich kaputt: kein Wort Ausgabe
  }

  const quellen = []
  let imVideoteil = false
  for (const roh of text.split('\n')) {
    // Jede Zeile trägt einen Kopf wie "[AVFoundation indev @ 0x14f00a2b0] " — weg damit
    const zeile = roh.replace(/^\[AVFoundation indev @ [^\]]*\]\s*/, '').trim()
    if (/^AVFoundation video devices:/i.test(zeile)) {
      imVideoteil = true
      continue
    }
    if (/^AVFoundation audio devices:/i.test(zeile)) {
      imVideoteil = false // ab hier kommen Mikrofone, die interessieren hier nicht
      continue
    }
    if (!imVideoteil) continue
    const treffer = zeile.match(/^\[(\d+)\]\s+(.+)$/)
    if (treffer) {
      quellen.push({
        nummer: treffer[1],
        name: treffer[2].trim(),
        // avfoundation zählt den Bildschirm als Videoquelle mit — das ist aber
        // keine Kamera, und wer ihn meint, ist bei mac_read_screen besser dran.
        bildschirm: /capture screen/i.test(treffer[2]),
      })
    }
  }
  return quellen
}

/** ffmpeg-Gemecker in etwas übersetzen, mit dem der Nutzer etwas anfangen kann. */
function kameraFehler(err, geraet) {
  const roh = String(err.stderr || err.message || '').trim()
  if (err.abgelaufen) {
    // Beobachtet: ohne erteilte Kamera-Erlaubnis bleibt ffmpeg einfach stehen,
    // statt sich zu beschweren — macOS wartet auf eine Antwort im Nachfrage-Fenster,
    // das niemand zu sehen bekommt. Darum steht die Erlaubnis hier mit im Text.
    return new Error(
      `Die Kamera "${geraet}" hat sich in ${ZEITLIMIT / 1000} Sekunden nicht gemeldet. Zwei Gründe kommen infrage:\n` +
        '1. Die Erlaubnis fehlt: Systemeinstellungen → Datenschutz & Sicherheit → Kamera → das Programm ' +
        'anhaken, das URAI startet (Terminal bzw. Claude), dann URAI neu starten.\n' +
        '2. Eine andere App hält die Kamera fest — FaceTime, Zoom oder Photo Booth zumachen.'
    )
  }
  if (/not authorized|permission|denied|TCC|Operation not permitted/i.test(roh)) {
    return new Error(
      'Die Kamera ist nicht freigegeben. Systemeinstellungen → Datenschutz & Sicherheit → Kamera → ' +
        'das Programm anhaken, das URAI startet (Terminal bzw. Claude), dann URAI neu starten.'
    )
  }
  const kern = roh.split('\n').filter(Boolean).slice(-3).join(' | ')
  return new Error(`Kamera "${geraet}" ließ sich nicht öffnen: ${kern || 'kein Grund genannt'}`)
}

/**
 * Ein Bild aufnehmen. Es werden mehrere geholt und nur das letzte behalten (siehe BILDER).
 * Den Ordner muss der Aufrufer wieder wegräumen.
 * @returns {Promise<{ordner:string, datei:string}>}
 */
async function bildAufnehmen(geraet) {
  const ordner = await fs.mkdtemp(path.join(os.tmpdir(), 'urai-kamera-'))
  // Nummerierte Ausgabe statt einer festen Datei: so liegt jedes Bild einzeln vor
  // und das letzte ist garantiert vollständig geschrieben.
  const muster = path.join(ordner, 'bild-%02d.png')

  // PNG und nicht JPEG, obwohl JPEG kleiner wäre: das Gehirn hängt Bilder fest als
  // image/png an (brain.js, toGeminiContents). Ein JPEG mit PNG-Etikett wäre eine
  // Lüge, an der Gemini sich zu Recht verschluckt.
  const kopf = ['-hide_banner', '-loglevel', 'error', '-f', 'avfoundation']
  // Auf 1024 Punkte Breite herunterrechnen — mehr braucht niemand, um "welches
  // Kabel ist das" zu beantworten, und das Bild geht als Base64 durch die Leitung.
  const rumpf = [
    '-i',
    String(geraet),
    '-frames:v',
    String(BILDER),
    '-vf',
    "scale=w='min(1024,iw)':h=-2",
    '-y',
    muster,
  ]

  try {
    await ffmpegLauf([...kopf, '-framerate', '30', ...rumpf])
  } catch (err) {
    const meldung = String(err.stderr || err.message || '')
    // Nicht jede Kamera kann genau 30 Bilder/s; ffmpeg lehnt dann rundheraus ab und
    // listet die möglichen Werte. Einmal ohne feste Bildrate nachfassen ist freundlicher,
    // als den Nutzer diese Liste lesen zu lassen. Nach einer abgelaufenen Zeit wird
    // NICHT nachgefasst — dann hält jemand anders die Kamera fest, und ein zweiter
    // Versuch kostet nur weitere zwanzig Sekunden.
    if (!err.abgelaufen && /framerate|frame rate|not supported|Selected/i.test(meldung)) {
      await ffmpegLauf([...kopf, ...rumpf]).catch((zweiter) => {
        throw kameraFehler(zweiter, geraet)
      })
    } else {
      throw kameraFehler(err, geraet)
    }
  }

  const dateien = (await fs.readdir(ordner)).filter((f) => f.endsWith('.png')).sort()
  if (!dateien.length) {
    await fs.rm(ordner, { recursive: true, force: true }).catch(() => {})
    throw new Error(
      `Die Kamera "${geraet}" hat kein Bild geliefert. Ist sie abgedeckt oder gerade von einer anderen App belegt?`
    )
  }
  return { ordner, datei: path.join(ordner, dateien[dateien.length - 1]) }
}

export const kameraTools = [
  {
    name: 'mac_kameras',
    description:
      'Zeigt, welche Kameras und Videoquellen der Mac hat, mit Nummer für mac_kamera. Schaltet nichts ein.',
    parameters: { type: 'object', properties: {} },
    async run() {
      kameraPruefen()
      const quellen = await videoQuellen()
      if (!quellen.length) {
        return (
          'avfoundation meldet keine Videoquelle. Ist eine Kamera angeschlossen und freigegeben? ' +
          'Systemeinstellungen → Datenschutz & Sicherheit → Kamera.'
        )
      }
      return quellen
        .map(
          (q) =>
            `${q.nummer}: ${q.name}${q.bildschirm ? ' (Bildschirmaufnahme, keine Kamera — dafür ist mac_read_screen da)' : ''}`
        )
        .join('\n')
    },
  },
  {
    name: 'mac_kamera',
    description:
      'Durch die Webcam schauen und beschreiben lassen: was steht hier vor mir, welches Kabel ist das, ' +
      'ist jemand im Raum. Schaltet die Kamera ein, die Leuchte geht dabei an.',
    parameters: {
      type: 'object',
      properties: {
        frage: { type: 'string', description: 'Was willst du über das Bild wissen? Vorgabe: allgemeine Beschreibung.' },
        geraet: { type: 'string', description: 'Nummer oder Name aus mac_kameras. Vorgabe: "0", die eingebaute.' },
      },
    },
    danger: true,
    async run({ frage = 'Was ist auf dem Bild zu sehen?', geraet = '0' }, ctx) {
      kameraPruefen()

      // Erst nachsehen, ob es die Quelle überhaupt gibt. Eine falsche Nummer würde
      // sonst irgendeine andere Kamera anschalten, und eine Leuchte, die ohne
      // erkennbaren Grund angeht, erklärt sich beim Nutzer nicht von selbst.
      const gesucht = String(geraet).trim()
      const quellen = await videoQuellen()
      const gefunden =
        quellen.find((q) => q.nummer === gesucht) ||
        quellen.find((q) => q.name.toLowerCase().includes(gesucht.toLowerCase()))
      if (!gefunden) {
        throw new Error(
          `Videoquelle "${geraet}" gibt es nicht. Vorhanden:\n` +
            (quellen.map((q) => `${q.nummer}: ${q.name}`).join('\n') || '(keine)')
        )
      }
      if (gefunden.bildschirm) {
        throw new Error(
          `"${gefunden.name}" ist der Bildschirm, keine Kamera. Für den Bildschirm gibt es mac_read_screen, ` +
            'die echten Kameras zeigt mac_kameras.'
        )
      }

      const { ordner, datei } = await bildAufnehmen(gefunden.nummer)
      let behalten = false
      try {
        const base64 = (await fs.readFile(datei)).toString('base64')
        ctx?.emit?.('screen', base64) // derselbe Bild-Kanal, über den auch der Bildschirm läuft

        // Ohne Gemini-Schlüssel gibt es kein Auge. Dann ehrlich sagen, dass das Bild
        // existiert, und es liegen lassen — der Nutzer kann selbst hineinschauen.
        if (!loadConfig().geminiKey) {
          behalten = true
          return [
            `Bild aufgenommen mit "${gefunden.name}" — aber niemand kann es ansehen:`,
            'Bilder beschreiben braucht einen Gemini-Schlüssel (gratis: aistudio.google.com/apikey).',
            `Das Bild bleibt liegen: ${datei}`,
          ].join('\n')
        }

        try {
          const antwort = await look({ imageBase64: base64, question: frage })
          return `Kamera "${gefunden.name}" — ${frage}\n${antwort}`
        } catch (err) {
          // Das Bild ist echt und war Aufwand (Kamera an, Leuchte an). Wenn nur das
          // Augen-Modell schweigt, wird es nicht weggeworfen.
          behalten = true
          return (
            `Bild aufgenommen mit "${gefunden.name}", aber das Augen-Modell antwortet nicht: ${err.message}\n` +
            `Das Bild bleibt liegen: ${datei}`
          )
        }
      } finally {
        // Bild verstanden → Bild weg. Eine Kameraaufnahme hat nichts verloren,
        // das länger im Temp-Ordner liegt als der Satz, der sie beschreibt.
        if (!behalten) await fs.rm(ordner, { recursive: true, force: true }).catch(() => {})
      }
    },
  },
]
