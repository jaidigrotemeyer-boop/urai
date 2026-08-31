// Auslöser: der Zündschlüssel für die Abläufe.
//
// Der Ablauf-Bauer war fertig, aber jemand musste jeden Ablauf von Hand
// anstoßen — dadurch wird er nie benutzt. Hier passt ein Wächter im
// Hintergrund auf vier Arten von Ereignissen auf und startet den Ablauf selbst.
//
// Bewusst nicht heimlich: jeder Start meldet sich vorher und lässt sich
// abbrechen. Ein Agent, der ungefragt am Mac herumklickt, macht Angst.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, loadConfig } from './config.js'
import { ablaufStarten, ablaufLesen } from './ablauf.js'
import { frontContext } from './screen.js'

const DATEI = path.join(DATA_DIR, 'ausloeser.json')

export const ARTEN = ['zeit', 'ordner', 'app', 'start']

/**
 * @typedef {object} Ausloeser
 * @property {string} id
 * @property {string} ablauf    welcher Ablauf gestartet wird
 * @property {string} art       zeit | ordner | app | start
 * @property {string} wann      "08:30" · "~/Downloads" · "Safari" · "" (bei start)
 * @property {boolean} an
 * @property {object} eingaben  feste Eingaben für den Ablauf
 */

export function lesen() {
  try {
    const roh = JSON.parse(fs.readFileSync(DATEI, 'utf8'))
    return Array.isArray(roh) ? roh : []
  } catch {
    return []
  }
}

export function schreiben(liste) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DATEI, JSON.stringify(liste, null, 2))
  return liste
}

/**
 * Wache vor dem Schreiben einer ganzen Liste von außen (HTTP-Endpunkt).
 * Ohne sie würde ein fehlerhafter Body (kein Array, fehlende Felder) beim
 * nächsten `lesen()` still zu `[]` — alle bestehenden Auslöser weg. Prüft
 * dieselben Grundregeln wie das Werkzeug `ausloeser_anlegen`, ohne die dort
 * zusätzlich nötigen (teureren) Prüfungen wie Ordner-/Ablauf-Existenz.
 */
export function pruefenListe(liste) {
  if (!Array.isArray(liste)) throw new Error('Auslöser-Liste muss ein Array sein.')
  const idsGesehen = new Set()
  for (const a of liste) {
    if (!a || typeof a !== 'object') throw new Error('Jeder Auslöser muss ein Objekt sein.')
    if (typeof a.id !== 'string' || !a.id) throw new Error('Auslöser: id fehlt oder ist kein Text.')
    // Ohne diese Prüfung überschreiben sich zwei Einträge mit derselben id
    // gegenseitig bei ausloeser_loeschen/Umschalten (liste.find trifft immer nur den ersten).
    if (idsGesehen.has(a.id)) throw new Error(`Auslöser-Liste: id "${a.id}" kommt mehrfach vor.`)
    idsGesehen.add(a.id)
    if (typeof a.ablauf !== 'string' || !a.ablauf) throw new Error(`Auslöser ${a.id}: ablauf fehlt oder ist kein Text.`)
    if (!ARTEN.includes(a.art)) throw new Error(`Auslöser ${a.id}: art muss eins von ${ARTEN.join(', ')} sein.`)
    if (a.art === 'zeit' && !/^\d{2}:\d{2}$/.test(a.wann)) throw new Error(`Auslöser ${a.id}: bei art "zeit" braucht wann die Form "08:30".`)
    if (a.art === 'app' && (typeof a.wann !== 'string' || !a.wann)) throw new Error(`Auslöser ${a.id}: bei art "app" braucht wann den App-Namen.`)
    // Ein leerer/Whitespace-Pfad würde ordnerBeobachten() bisher still überspringen
    // (fs.existsSync scheitert lautlos) — der Auslöser stünde in der Liste, feuert aber nie.
    if (a.art === 'ordner' && (typeof a.wann !== 'string' || !a.wann.trim())) throw new Error(`Auslöser ${a.id}: bei art "ordner" braucht wann einen Pfad.`)
  }
  return liste
}

function wegAufloesen(p) {
  return String(p || '').replace(/^~/, process.env.HOME)
}

/**
 * Der Wächter. Läuft im Hauptprozess mit und meldet sich über emit,
 * damit die Notch anzeigen kann, was gleich passiert.
 */
export class Waechter {
  constructor({ emit }) {
    this.emit = emit
    this.timer = null
    this.beobachter = []
    this.letzteApp = ''
    this.gelaufen = new Map() // id -> Zeitpunkt, gegen Doppelstarts
    this.laeuft = false
  }

  start() {
    if (this.laeuft) return
    this.laeuft = true

    // Ein Takt für Zeit und App-Wechsel. Zwei Sekunden reichen — feiner
    // aufzulösen bringt nichts und weckt nur den Lüfter.
    this.timer = setInterval(() => this.takt().catch(() => {}), 2500)

    this.ordnerBeobachten()

    // "start" feuert einmal, wenn URAI hochkommt
    for (const a of lesen()) {
      if (a.an !== false && a.art === 'start') this.ausloesen(a, 'URAI gestartet')
    }
  }

  stop() {
    this.laeuft = false
    clearInterval(this.timer)
    this.timer = null
    for (const b of this.beobachter) b.close?.()
    this.beobachter = []
  }

  /** Nach Änderungen an der Liste neu aufsetzen — Ordner-Wächter hängen an Pfaden. */
  neuLaden() {
    for (const b of this.beobachter) b.close?.()
    this.beobachter = []
    if (this.laeuft) this.ordnerBeobachten()
  }

  ordnerBeobachten() {
    for (const a of lesen()) {
      if (a.an === false || a.art !== 'ordner') continue
      const ordner = wegAufloesen(a.wann)
      if (!fs.existsSync(ordner)) continue
      try {
        // Entprellen: ein einziges Herunterladen löst mehrere Ereignisse aus
        let letzte = 0
        const b = fs.watch(ordner, (art, name) => {
          if (!name || name.startsWith('.')) return
          const jetzt = Date.now()
          if (jetzt - letzte < 2000) return
          letzte = jetzt
          this.ausloesen(a, `Neu in ${a.wann}: ${name}`, { datei: path.join(ordner, name) })
        })
        this.beobachter.push(b)
      } catch {}
    }
  }

  async takt() {
    if (!this.laeuft) return
    const liste = lesen().filter((a) => a.an !== false)
    if (!liste.length) return

    const jetzt = new Date()
    const uhr = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`

    for (const a of liste) {
      if (a.art === 'zeit' && a.wann === uhr) {
        // Nur einmal pro Minute, sonst feuert es bei jedem Takt
        if (this.zuletzt(a.id) < 70_000) continue
        this.ausloesen(a, `Es ist ${uhr}`)
      }
    }

    // App-Wechsel: nur prüfen, wenn überhaupt jemand darauf wartet
    if (liste.some((a) => a.art === 'app')) {
      const front = await frontContext({ eigeneUeberspringen: false }).catch(() => ({}))
      const app = front.app || ''
      if (app && app !== this.letzteApp) {
        const vorher = this.letzteApp
        this.letzteApp = app
        if (vorher) {
          for (const a of liste) {
            if (a.art === 'app' && a.wann.toLowerCase() === app.toLowerCase()) {
              if (this.zuletzt(a.id) < 30_000) continue
              this.ausloesen(a, `${app} ist nach vorn gekommen`)
            }
          }
        }
      }
    }
  }

  zuletzt(id) {
    return Date.now() - (this.gelaufen.get(id) || 0)
  }

  /**
   * Melden, warten, starten. Die Karenzzeit ist wichtig: der Nutzer soll
   * sehen, was gleich passiert, und es abwürgen können.
   */
  async ausloesen(a, grund, extra = {}) {
    const cfg = loadConfig()
    this.gelaufen.set(a.id, Date.now())

    let name = a.ablauf
    try {
      name = (await ablaufLesen(a.ablauf))?.name || a.ablauf
    } catch {
      this.emit({ type: 'ausloeser_fehler', id: a.id, text: `Ablauf "${a.ablauf}" gibt es nicht mehr.` })
      return
    }

    this.emit({ type: 'ausloeser_gleich', id: a.id, ablauf: a.ablauf, name, grund, karenzS: cfg.ausloeserKarenzS })

    this.abgebrochen = this.abgebrochen || new Set()
    await new Promise((r) => setTimeout(r, cfg.ausloeserKarenzS * 1000))
    if (this.abgebrochen.has(a.id)) {
      this.abgebrochen.delete(a.id)
      this.emit({ type: 'ausloeser_abgebrochen', id: a.id, name })
      return
    }

    this.emit({ type: 'ausloeser_start', id: a.id, ablauf: a.ablauf, name, grund })
    try {
      const ergebnis = await ablaufStarten(
        a.ablauf,
        { ...(a.eingaben || {}), ...extra, grund },
        { emit: (kind, data) => this.emit({ type: kind, ...data }) }
      )
      this.emit({ type: 'ausloeser_fertig', id: a.id, name, ergebnis: String(ergebnis).slice(0, 400) })
    } catch (err) {
      this.emit({ type: 'ausloeser_fehler', id: a.id, name, text: err.message.slice(0, 200) })
    }
  }

  abbrechen(id) {
    this.abgebrochen = this.abgebrochen || new Set()
    this.abgebrochen.add(id)
  }
}

// ─────────────────────── Werkzeuge fürs Gehirn ───────────────────────

export const ausloeserTools = [
  {
    name: 'ausloeser_anlegen',
    description:
      'Einen Ablauf von selbst starten lassen — zu einer Uhrzeit, wenn etwas in einem Ordner landet, ' +
      'wenn eine App nach vorn kommt, oder beim Start von URAI. ' +
      'Damit muss der Nutzer den Ablauf nicht jedes Mal anstoßen.',
    parameters: {
      type: 'object',
      properties: {
        ablauf: { type: 'string', description: 'Kennung des gespeicherten Ablaufs' },
        art: { type: 'string', description: 'zeit | ordner | app | start' },
        wann: {
          type: 'string',
          description: 'zeit: "08:30" · ordner: "~/Downloads" · app: "Safari" · start: leer lassen',
        },
        eingaben: { type: 'object', description: 'Feste Eingaben für den Ablauf' },
      },
      required: ['ablauf', 'art'],
    },
    async run({ ablauf, art, wann = '', eingaben = {} }) {
      if (!ARTEN.includes(art)) throw new Error(`art muss eins von ${ARTEN.join(', ')} sein.`)
      await ablaufLesen(ablauf) // wirft, wenn es den Ablauf nicht gibt

      if (art === 'zeit' && !/^\d{2}:\d{2}$/.test(wann)) throw new Error('Bei art "zeit" braucht wann die Form "08:30".')
      if (art === 'ordner' && !fs.existsSync(wegAufloesen(wann))) throw new Error(`Ordner gibt es nicht: ${wann}`)
      if (art === 'app' && !wann) throw new Error('Bei art "app" braucht wann den App-Namen.')

      const liste = lesen()
      // Zusatzbuchstaben gegen Kollisionen: zwei Auslöser für denselben Ablauf+Art,
      // in derselben Millisekunde angelegt, hätten sonst dieselbe id — pruefenListe()
      // lehnt so einen Doppelgänger jetzt ab und würde ohne den Zufallsteil jede
      // spätere Änderung über die Einstellungen blockieren, bis er von Hand entfernt wird.
      const id = `${ablauf}-${art}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`
      liste.push({ id, ablauf, art, wann, eingaben, an: true })
      schreiben(liste)

      const wie = {
        zeit: `jeden Tag um ${wann}`,
        ordner: `wenn etwas in ${wann} landet`,
        app: `wenn ${wann} nach vorn kommt`,
        start: 'bei jedem Start von URAI',
      }[art]
      return `Auslöser angelegt: "${ablauf}" läuft ${wie}. (${id})`
    },
  },
  {
    name: 'ausloeser_liste',
    description: 'Welche Abläufe starten von selbst?',
    parameters: { type: 'object', properties: {} },
    async run() {
      const liste = lesen()
      if (!liste.length) return 'Keine Auslöser. Mit ausloeser_anlegen einen einrichten.'
      return liste
        .map((a) => `${a.an === false ? '(aus) ' : ''}${a.id}: "${a.ablauf}" bei ${a.art}${a.wann ? ` ${a.wann}` : ''}`)
        .join('\n')
    },
  },
  {
    name: 'ausloeser_loeschen',
    description: 'Einen Auslöser entfernen oder abschalten.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, nur_aus: { type: 'boolean', description: 'Nur abschalten statt löschen' } },
      required: ['id'],
    },
    async run({ id, nur_aus = false }) {
      const liste = lesen()
      const treffer = liste.find((a) => a.id === id)
      if (!treffer) throw new Error(`Auslöser "${id}" gibt es nicht.`)
      if (nur_aus) {
        treffer.an = false
        schreiben(liste)
        return `Auslöser ${id} ist jetzt aus.`
      }
      schreiben(liste.filter((a) => a.id !== id))
      return `Auslöser ${id} gelöscht.`
    },
  },
]
