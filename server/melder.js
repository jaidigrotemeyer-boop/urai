// Von selbst reden.
//
// URAI bemerkt schon eine Menge — der Live-Modus sieht Bildschirmänderungen,
// Auslöser starten Abläufe, der Speicher wird knapp. Bisher landete das alles
// in stillen Listen, die man aufklappen musste. Wer erst nachsehen muss, ob
// etwas passiert ist, hat keinen Assistenten, sondern ein Logbuch.
//
// Das Schwierige daran ist nicht das Melden, sondern das SCHWEIGEN. Ein
// Assistent, der bei jeder Kleinigkeit dazwischenredet, wird nach einem
// halben Tag abgeschaltet — und dann meldet er auch das Wichtige nicht mehr.
// Darum steht hier vor allem, wann er den Mund hält:
//
//   1. Ruhezeit — nachts gar nichts, außer es ist dringend.
//   2. Höchstzahl pro Stunde — ein gleitendes Fenster, kein Zähler, der zur
//      vollen Stunde zurückspringt und dann sechs Meldungen am Stück zulässt.
//   3. Kein Nachplappern — dasselbe in anderen Worten zählt als dasselbe.
//   4. Nicht ins Wort fallen — wer gerade eine Antwort bekommt, braucht keinen
//      Zuruf über den Speicherstand.
//
// Die Regeln liegen absichtlich EINMAL im Modul und nicht pro offener Seite:
// sonst hätte man mit zwei Tabs die doppelte Meldungsmenge, und das Kontingent
// wäre keins.
import { loadConfig } from './config.js'
import { IST_MAC, osa } from './screen.js'

/** Alle offenen Seiten. Jede trägt ihre send-Funktion ein. */
const hoerer = new Set()

/** Zeitpunkte der letzten Meldungen — gleitendes Fenster für die Obergrenze. */
let letzte = []

/** Was zuletzt gesagt wurde, gegen Nachplappern. */
let gesagt = []

/** Läuft gerade eine Antwort? Dann ist Zuhören dran, nicht Melden. */
let beschaeftigt = false

const STUNDE = 3600_000
const NACHPLAPPER_FENSTER = 20 * 60_000

export function hoererDazu(send) {
  hoerer.add(send)
  return () => hoerer.delete(send)
}

/** Vom Hauptprozess gesetzt, solange eine Anfrage läuft. */
export function beschaeftigtSetzen(wert) {
  beschaeftigt = !!wert
}

/**
 * Ruhezeit. Über Mitternacht hinweg ist der Vergleich umgekehrt — 22 bis 8
 * heißt "22 oder später ODER vor 8", nicht "zwischen 22 und 8". Das ist die
 * Stelle, an der so eine Prüfung üblicherweise falsch ist.
 */
function ruhezeit(cfg) {
  const von = Number(cfg.meldungenRuheVon)
  const bis = Number(cfg.meldungenRuheBis)
  if (!Number.isFinite(von) || !Number.isFinite(bis) || von === bis) return false
  const std = new Date().getHours()
  return von < bis ? std >= von && std < bis : std >= von || std < bis
}

/**
 * Grob dasselbe? Wortvergleich statt Zeichenvergleich: "Der Ablauf ist fertig"
 * und "Ablauf fertig" sind für einen Menschen dieselbe Meldung, für === nicht.
 *
 * Die Schwelle stand zuerst bei 0.6 und war damit falsch: bei kurzen Sätzen
 * überstimmt das Beiwerk das eine Wort, auf das es ankommt. "Der Ablauf
 * Rechnungen ist fertig" und "Der Ablauf Steuererklärung ist fertig" teilen
 * sich zwei von drei Wörtern — zwei verschiedene Abläufe, und der zweite wurde
 * verschluckt. Genau das macht ein Meldesystem unglaubwürdig: wer einmal
 * merkt, dass etwas fehlt, glaubt auch dem Rest nicht mehr.
 *
 * 0.85 verlangt praktisch Gleichheit. Das ist der richtige Anspruch, denn die
 * Aufgabe ist "dasselbe Ereignis nicht dreimal melden" — nicht "ähnliche
 * Ereignisse zusammenfassen". Ähnliches zusammenzufassen wäre eine andere
 * Aufgabe und würde hier immer Information kosten.
 */
function schonGesagt(text) {
  const jetzt = Date.now()
  gesagt = gesagt.filter((g) => jetzt - g.at < NACHPLAPPER_FENSTER)
  const worte = (s) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-zäöüß0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    )
  const neu = worte(text)
  if (!neu.size) return false
  for (const g of gesagt) {
    const treffer = [...neu].filter((w) => g.worte.has(w)).length
    if (treffer / Math.max(neu.size, g.worte.size) > 0.85) return true
  }
  return false
}

/**
 * Etwas mitteilen — oder eben nicht.
 *
 * @param {string} text        was gesagt werden soll, ein Satz
 * @param {object} [wahl]
 * @param {string} [wahl.art]  hinweis | erfolg | warnung — steuert nur die Anzeige
 * @param {boolean} [wahl.dringend] umgeht Ruhezeit und Obergrenze, löst eine
 *                                  macOS-Meldung aus. Sparsam benutzen: was
 *                                  immer dringend ist, ist nie dringend.
 * @returns {boolean} ob wirklich gemeldet wurde
 */
export function melden(text, { art = 'hinweis', dringend = false } = {}) {
  const sauber = String(text || '').trim()
  if (!sauber) return false

  const cfg = loadConfig()
  if (!cfg.meldungenAn) return false

  if (!dringend) {
    if (beschaeftigt) return false
    if (ruhezeit(cfg)) return false

    const jetzt = Date.now()
    letzte = letzte.filter((t) => jetzt - t < STUNDE)
    const deckel = Number(cfg.meldungenProStunde) || 6
    if (letzte.length >= deckel) return false

    if (schonGesagt(sauber)) return false
  }

  letzte.push(Date.now())
  gesagt.push({
    at: Date.now(),
    worte: new Set(
      sauber
        .toLowerCase()
        .replace(/[^a-zäöüß0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    ),
  })

  for (const send of hoerer) {
    try {
      send({ type: 'meldung', text: sauber, art, dringend })
    } catch {
      // Eine tote Verbindung darf die anderen nicht mitreißen
    }
  }

  // Nur bei dringend zusätzlich das System benachrichtigen: die Seite kann im
  // Hintergrund liegen, und dann sieht man den Einblender in URAI nicht. Für
  // alles andere wäre eine Systemmeldung zu viel.
  if (dringend && IST_MAC) {
    const raus = sauber.replace(/"/g, "'").slice(0, 200)
    osa(`display notification "${raus}" with title "URAI"`).catch(() => {})
  }

  return true
}

/**
 * Für Tests und den Neustart: alles vergessen.
 * Ohne das schleppt ein langlaufender Prozess Meldungen von gestern mit.
 */
export function zuruecksetzen() {
  letzte = []
  gesagt = []
  beschaeftigt = false
}
