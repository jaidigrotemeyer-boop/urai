// Beweis-Pflicht: nach jeder Handlung am Mac nachsehen, ob sie wirklich passiert ist.
//
// Das ist die Wurzel von "er erzählt, statt zu machen": ein Klick auf veraltete
// Koordinaten meldet Erfolg, obwohl er ins Leere ging. URAI kann das ohne
// Nachkontrolle gar nicht unterscheiden — er weiß nur, dass er geklickt HAT,
// nicht, dass es gewirkt hat.
//
// Also: vorher den Zustand merken, handeln, kurz warten, nochmal hinsehen.
// Hat sich nichts geändert, ist das ein ehrliches "nicht bestätigt".
import { frontContext, uiElements } from './screen.js'
import { loadConfig } from './config.js'

/** Werkzeuge, die etwas am Bildschirm bewirken sollen — nur die werden geprüft. */
const WIRKT = new Set([
  'mac_click',
  'mac_click_text',
  'mac_type',
  'mac_key',
  'mac_menu',
  'mac_open_app',
  'mac_window',
  'mac_drag',
])

/**
 * Ein billiger Fingerabdruck des Bildschirms: welche App ist vorne,
 * wie heißt ihr Fenster, welche Knöpfe gibt es.
 *
 * Absichtlich ohne Bildschirmfoto — das kostet zwei Sekunden pro Blick.
 * Der Bedienhilfen-Baum reicht, um Veränderung zu erkennen, und ist schnell.
 */
export async function abdruck() {
  const [front, ui] = await Promise.all([
    frontContext({ eigeneUeberspringen: false }).catch(() => ({})),
    uiElements(40, 3, 3500).catch(() => ({ items: [] })),
  ])
  return {
    app: front.app || '',
    fenster: front.window || '',
    geometrie: front.geometry || '',
    elemente: (ui.items || []).map((e) => `${e.role}:${e.name || e.value}`).join('|'),
    anzahl: (ui.items || []).length,
  }
}

/**
 * Hat sich zwischen zwei Abdrücken etwas getan?
 * @returns {{geaendert: boolean, was: string[]}}
 */
export function vergleiche(vorher, nachher) {
  const was = []
  if (!vorher || !nachher) return { geaendert: false, was: ['nicht messbar'] }

  if (vorher.app !== nachher.app) was.push(`App: ${vorher.app || '—'} → ${nachher.app || '—'}`)
  if (vorher.fenster !== nachher.fenster) was.push(`Fenster: "${vorher.fenster}" → "${nachher.fenster}"`)
  if (vorher.geometrie !== nachher.geometrie) was.push('Fenster bewegt oder in der Größe geändert')
  if (vorher.elemente !== nachher.elemente) {
    const dazu = nachher.anzahl - vorher.anzahl
    was.push(dazu === 0 ? 'Bedienelemente verändert' : `${Math.abs(dazu)} Element(e) ${dazu > 0 ? 'dazu' : 'weg'}`)
  }
  return { geaendert: was.length > 0, was }
}

/**
 * Eine Handlung mit Nachkontrolle umschließen.
 *
 * Wichtig: Ein unbestätigter Klick ist kein Fehler. Manche Handlungen ändern
 * sichtbar nichts (Text in ein Feld tippen, das schon gefüllt aussieht).
 * Darum wird nicht abgebrochen, sondern ehrlich angehängt, was gemessen wurde —
 * und der Systemtext verbietet, Erfolg zu behaupten, wenn da "nicht bestätigt" steht.
 *
 * @param {string} werkzeug
 * @param {() => Promise<string>} handeln
 * @returns {Promise<string>}
 */
export async function mitBeweis(werkzeug, handeln) {
  const cfg = loadConfig()
  if (!cfg.beweisPflicht || !WIRKT.has(werkzeug)) return handeln()

  const vorher = await abdruck().catch(() => null)
  const ergebnis = await handeln()

  // Kurz Luft lassen: Fenster brauchen einen Moment, bis sie reagieren
  await new Promise((r) => setTimeout(r, cfg.beweisWartenMs))

  const nachher = await abdruck().catch(() => null)
  const { geaendert, was } = vergleiche(vorher, nachher)

  if (geaendert) {
    return `${ergebnis}\n[bestätigt: ${was.join('; ')}]`
  }
  return (
    `${ergebnis}\n[NICHT BESTÄTIGT — auf dem Bildschirm hat sich nichts geändert. ` +
    `Behaupte keinen Erfolg. Sieh mit mac_read_screen nach, wo du wirklich gelandet bist.]`
  )
}
