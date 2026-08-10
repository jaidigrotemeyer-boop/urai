// Kraft: zuhören (macOS).
// Der Bildschirm zeigt, woran gearbeitet wird, die Kamera zeigt den Raum —
// das Ohr zeigt, was darin gesagt wird und was darin klingt.
//
// Mitschreiben und Geräusche erkennen sind ein und dasselbe Problem: Ton
// aufnehmen und ein Modell darüber hören lassen. Nur die Frage ans Modell ist
// eine andere, darum stehen beide Werkzeuge hier und teilen sich den Weg.
//
// Kein lokales Whisper: das Modell will Gigabyte an Arbeitsspeicher, die dieser
// Rechner (8 GB) für alles andere braucht — während der Aufnahme schwimmt sonst
// der ganze Mac. Gemini liest den Ton direkt aus der Anfrage, kostet mit dem
// Gratis-Schlüssel nichts und belegt hier kein einziges Byte.
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { IST_MAC } from '../screen.js'
import { loadConfig } from '../config.js'

const pexec = promisify(execFile)

// Deckel für die Aufnahmedauer. Fünf Minuten sind ein Gespräch, kein Mitschnitt
// des Tages — wer länger lauscht, sollte das jedes Mal neu entscheiden müssen.
const DECKEL = 300

// Wie lange über die bestellte Dauer hinaus gewartet wird, bevor abgebrochen
// wird. Muss über der Aufnahmedauer liegen, sonst würgt die eigene Uhr die
// eigene Aufnahme ab; ffmpeg braucht zum Öffnen des Geräts und zum Schließen
// der Datei ein paar Sekunden obendrauf.
const ZUSCHLAG_MS = 30_000

/**
 * telegram.js zieht agent.js nach und agent.js lädt diese Werkzeugkiste — ein
 * fester Import stünde also im Kreis und ließe `ohrTools` beim Start im toten
 * Winkel stehen. Darum verspätet holen, genau wie crew.js es mit Agent macht.
 */
let leser = null
async function tonLesen(ton, auftrag, wahl) {
  if (!leser) ({ audioLesen: leser } = await import('../telegram.js'))
  return leser(ton, auftrag, wahl)
}

/**
 * Wo liegt ffmpeg? Nicht fest verdrahten: Homebrew legt es auf Apple Silicon
 * nach /opt/homebrew/bin, auf Intel-Macs nach /usr/local/bin, MacPorts wieder
 * woandershin. Dazu startet der Server oft ohne Login-Shell und erbt darum die
 * PATH-Zeile aus der .zshrc nicht — deshalb PATH *und* die bekannten Orte.
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

// Erst beim Gebrauch suchen und das Ergebnis behalten: wer ffmpeg nachträglich
// installiert, soll dafür nicht URAI neu starten müssen.
let ffmpegPfad = null
function ffmpeg() {
  if (!ffmpegPfad) ffmpegPfad = ffmpegSuchen()
  if (!ffmpegPfad) {
    throw new Error(
      'ffmpeg fehlt — ohne das kommt kein Ton herein. Installieren mit: brew install ffmpeg ' +
        '(danach einfach nochmal fragen, ein Neustart ist nicht nötig).'
    )
  }
  return ffmpegPfad
}

function ohrPruefen() {
  if (!IST_MAC) {
    throw new Error(
      'Zuhören geht nur auf macOS — der Weg zum Mikrofon (avfoundation) gehört Apple. ' +
        'Auf diesem System nicht verfügbar.'
    )
  }
}

/**
 * Die Tonquellen, die avfoundation kennt.
 * ffmpeg schreibt diese Liste auf stderr und beendet sich danach mit Fehlercode —
 * das ist so gewollt, es gibt ja keine Eingabedatei. Ein Fehlschlag darf hier
 * also nicht als Fehler durchgehen, sonst sieht URAI nie ein Mikrofon.
 * @returns {Promise<Array<{nummer:string,name:string,fremd:boolean}>>}
 */
async function tonQuellen() {
  let text = ''
  try {
    const { stderr } = await pexec(
      ffmpeg(),
      ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
      { timeout: 15000 }
    )
    text = stderr || ''
  } catch (err) {
    text = err.stderr || ''
    if (!text) throw err // wirklich kaputt: kein Wort Ausgabe
  }

  const quellen = []
  let imTonteil = false
  for (const roh of text.split('\n')) {
    // Jede Zeile trägt einen Kopf wie "[AVFoundation indev @ 0x14f00a2b0] " — weg damit
    const zeile = roh.replace(/^\[AVFoundation indev @ [^\]]*\]\s*/, '').trim()
    if (/^AVFoundation audio devices:/i.test(zeile)) {
      imTonteil = true
      continue
    }
    if (/^AVFoundation video devices:/i.test(zeile)) {
      imTonteil = false // Kameras stehen davor, die interessieren hier nicht
      continue
    }
    if (!imTonteil) continue
    const treffer = zeile.match(/^\[(\d+)\]\s+(.+)$/)
    if (treffer) {
      quellen.push({
        nummer: treffer[1],
        name: treffer[2].trim(),
        // Continuity: das iPhone hängt sich als Mikrofon in die Liste, oft an
        // erster Stelle. Liegt es weggesperrt in der Tasche, liefert es nie
        // einen Ton — und die Aufnahme wartet auf etwas, das nicht kommt.
        fremd: /iphone|ipad/i.test(treffer[2]),
      })
    }
  }
  return quellen
}

/**
 * Aufnehmen — und dabei nicht ewig warten.
 *
 * Normalerweise beendet sich ffmpeg nach -t von selbst. Antwortet die Quelle
 * aber nie (fehlende Mikrofon-Freigabe, schlafendes iPhone-Mikrofon), hängt es
 * unbegrenzt im Öffnen des Geräts fest. Hier gemessen: so ein Hänger überlebt
 * SIGINT, weil er die Abbruch-Behandlung gar nicht erst erreicht. Darum zwei
 * Stufen — erst freundlich, damit eine angefangene Datei sauber geschlossen
 * wird, dann hart. Ohne die zweite Stufe behielte der Prozess das Mikrofon für
 * den Rest der Sitzung.
 *
 * @returns {Promise<{meckern: string, abgewuergt: boolean}>}
 */
function aufnehmen(ziel, sekunden, geraet, zeitlimitMs) {
  return new Promise((fertig, gescheitert) => {
    const kind = spawn(
      ffmpeg(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin', // sonst greift ffmpeg nach der Eingabe des Servers
        '-f',
        'avfoundation',
        '-i',
        `:${geraet}`, // führender Doppelpunkt: nur Ton, keine Kamera anfassen
        '-t',
        String(sekunden),
        '-ac',
        '1', // ein Kanal reicht zum Verstehen und halbiert die Daten
        '-ar',
        '16000', // Sprache trägt nicht höher; mehr würde nur die Anfrage aufblähen
        '-y',
        ziel,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )

    let meckern = ''
    let hart = null
    let abgewuergt = false

    // Nur das Ende behalten: ffmpeg kann bei einem kaputten Gerät pro Sekunde
    // dieselbe Zeile schreiben, und der Speicher soll davon nicht volllaufen.
    kind.stderr.on('data', (d) => {
      meckern = (meckern + d).slice(-2000)
    })

    const uhr = setTimeout(() => {
      abgewuergt = true
      kind.kill('SIGINT')
      hart = setTimeout(() => kind.kill('SIGKILL'), 4000)
    }, zeitlimitMs)

    kind.on('error', (err) => {
      clearTimeout(uhr)
      if (hart) clearTimeout(hart)
      gescheitert(err)
    })
    kind.on('close', () => {
      clearTimeout(uhr)
      if (hart) clearTimeout(hart)
      fertig({ meckern: meckern.trim(), abgewuergt })
    })
  })
}

/** ffmpeg-Gemecker in etwas übersetzen, mit dem der Nutzer etwas anfangen kann. */
function hoerFehler({ meckern, abgewuergt, name, wartete }) {
  if (abgewuergt) {
    return new Error(
      `"${name}" hat in ${wartete} Sekunden keinen Ton geliefert. Meistens fehlt die Freigabe: ` +
        'Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon → das Programm anhaken, das URAI ' +
        'startet (Terminal bzw. Claude), dann URAI neu starten. Sonst hält eine andere App das ' +
        'Mikrofon fest, oder es ist ein iPhone-Mikrofon, das gerade schläft — dann mit mac_mikrofone ' +
        'eine andere Quelle wählen.'
    )
  }
  if (/not authorized|permission|denied|TCC|Operation not permitted/i.test(meckern)) {
    return new Error(
      'Das Mikrofon ist nicht freigegeben. Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon → ' +
        'das Programm anhaken, das URAI startet (Terminal bzw. Claude), dann URAI neu starten.'
    )
  }
  const kern = meckern.split('\n').filter(Boolean).slice(-3).join(' | ')
  return new Error(`Aufnahme mit "${name}" hat nichts ergeben: ${kern || 'kein Grund genannt'}`)
}

// Zwei Fragen an dasselbe Modell — mehr Unterschied ist zwischen Mitschreiben
// und Hinhören nicht. Beide sagen ausdrücklich, was bei Stille zu antworten
// ist: sonst dichtet das Modell in ein Rauschen ein Gespräch hinein.
const FRAGEN = {
  gespraech: [
    'Schreib mit, was in dieser Aufnahme gesprochen wird: wortwörtlich, in der gesprochenen Sprache,',
    'nichts dazuerfinden und nichts zusammenfassen.',
    'Sind mehrere Stimmen sicher zu unterscheiden, stell "Sprecher A:" bzw. "Sprecher B:" voran —',
    'ist es nur eine Stimme oder lassen sie sich nicht trennen, lass die Kennzeichnung weg.',
    'Spricht niemand, antworte genau: (niemand spricht).',
  ].join(' '),
  geraeusche: [
    'Beschreib knapp, was in dieser Aufnahme zu hören ist: etwa Sirene, Hund, Türklingel, Musik,',
    'Tastatur, Schritte, Stimmen im Hintergrund, Straßenlärm oder Stille.',
    'Ein Punkt je Geräusch, mit der ungefähren Stelle in Sekunden, wenn sie sich zuordnen lässt.',
    'Nur was hörbar ist, keine Vermutungen über die Ursache.',
    'Ist es still, antworte genau: (still).',
  ].join(' '),
}

export const ohrTools = [
  {
    name: 'mac_mikrofone',
    description:
      'Zeigt die Tonquellen (Mikrofone) des Macs mit ihrer Nummer für mac_mithoeren. Nimmt nichts auf.',
    parameters: { type: 'object', properties: {} },
    async run() {
      ohrPruefen()
      const quellen = await tonQuellen()
      if (!quellen.length) {
        return (
          'avfoundation meldet keine Tonquelle. Ist ein Mikrofon angeschlossen und freigegeben? ' +
          'Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon.'
        )
      }
      return quellen
        .map((q) => `${q.nummer}: ${q.name}${q.fremd ? ' (Gerät in der Nähe — liefert nur Ton, wenn es wach ist)' : ''}`)
        .join('\n')
    },
  },
  {
    name: 'mac_mithoeren',
    description:
      'Über das Mikrofon zuhören: ein Gespräch im Raum mitschreiben oder beschreiben lassen, was gerade ' +
      'zu hören ist (Sirene, Hund, Türklingel, Musik, Stille). Nimmt echten Ton auf.',
    parameters: {
      type: 'object',
      properties: {
        sekunden: { type: 'number', description: `Wie lange aufnehmen. Vorgabe 30, höchstens ${DECKEL}.` },
        was: {
          type: 'string',
          enum: ['gespraech', 'geraeusche'],
          description: '"gespraech" gibt die Mitschrift, "geraeusche" beschreibt die Klänge. Vorgabe: gespraech.',
        },
        geraet: { type: 'string', description: 'Nummer oder Name aus mac_mikrofone. Vorgabe: "0", die erste Quelle.' },
      },
    },
    danger: true,
    async run({ sekunden = 30, was = 'gespraech', geraet = '0' }) {
      ohrPruefen()

      // Erst den Schlüssel prüfen, dann das Mikrofon anschalten: eine halbe
      // Minute Mitschnitt, die hinterher niemand lesen kann, ist nicht nur
      // verlorene Zeit — es ist eine Aufnahme, die keinen Zweck erfüllt hat.
      const c = loadConfig()
      if (!c.geminiKey) {
        throw new Error(
          'Zuhören braucht einen Gemini-Schlüssel (gratis: aistudio.google.com/apikey) — der liest den Ton. ' +
            'Ohne ihn könnte ich zwar aufnehmen, aber niemand könnte die Aufnahme verstehen; darum nehme ich gar nicht erst auf.'
        )
      }

      const dauer = Math.max(1, Math.min(DECKEL, Math.round(Number(sekunden) || 30)))
      const modus = String(was).toLowerCase() === 'geraeusche' ? 'geraeusche' : 'gespraech'

      // Erst nachsehen, ob es die Quelle gibt. Eine falsche Nummer würde sonst
      // irgendein anderes Mikrofon aufmachen — und stillschweigend den falschen
      // Raum mithören ist das Letzte, was dieses Werkzeug tun darf.
      const gesucht = String(geraet).trim()
      const quellen = await tonQuellen()
      const gefunden =
        quellen.find((q) => q.nummer === gesucht) ||
        quellen.find((q) => q.name.toLowerCase().includes(gesucht.toLowerCase()))
      if (!gefunden) {
        throw new Error(
          `Tonquelle "${geraet}" gibt es nicht. Vorhanden:\n` +
            (quellen.map((q) => `${q.nummer}: ${q.name}`).join('\n') || '(keine)')
        )
      }

      const ordner = await fs.mkdtemp(path.join(os.tmpdir(), 'urai-ohren-'))
      const datei = path.join(ordner, 'ton.ogg')
      try {
        const { meckern, abgewuergt } = await aufnehmen(datei, dauer, gefunden.nummer, dauer * 1000 + ZUSCHLAG_MS)
        const groesse = (await fs.stat(datei).catch(() => ({ size: 0 }))).size
        if (!groesse) {
          throw hoerFehler({ meckern, abgewuergt, name: gefunden.name, wartete: dauer + ZUSCHLAG_MS / 1000 })
        }

        // Das große Modell, nicht das schnelle: ein Raum mit mehreren Stimmen
        // ist schwerer als eine ins Telefon gesprochene Nachricht, und das
        // kleine wirft die Sprecher durcheinander.
        // Zeitlimit mindestens so lang wie die Aufnahme — fünf Minuten Ton
        // sind auch fürs Modell nicht in neunzig Sekunden gehört.
        const antwort = await tonLesen(await fs.readFile(datei), FRAGEN[modus], {
          mime: 'audio/ogg',
          modell: c.geminiModel,
          zeitlimitMs: Math.max(90_000, dauer * 1000),
        })

        const kopf = modus === 'gespraech' ? 'Mitgeschrieben' : 'Gehört'
        return `${kopf} — ${dauer}s über "${gefunden.name}":\n\n${antwort || '(nichts zu hören)'}`
      } finally {
        // Ton verstanden → Ton weg. Ein Mitschnitt aus dem Raum hat nichts im
        // Temp-Ordner verloren, sobald der Satz darüber geschrieben ist.
        await fs.rm(ordner, { recursive: true, force: true }).catch(() => {})
      }
    },
  },
]
