// Aufträge im Hintergrund.
//
// Bisher lief alles in einer Reihe: Auftrag rein, warten, Antwort, nächster.
// Bei "such mir drei Angebote und vergleich sie" sitzt man zwei Minuten davor
// und kann nichts anderes machen. Agenten liefen zwar schon parallel
// (server/crew.js), aber nur INNERHALB einer Anfrage — man wartete trotzdem.
//
// Ein Hintergrundauftrag bekommt einen EIGENEN Agenten. Das ist Absicht und
// nicht Bequemlichkeit: Er teilt sich den Gesprächsverlauf nicht mit dem Chat.
// Täte er es, würden zwei Unterhaltungen ineinanderlaufen, und die Antwort auf
// die Frage von eben stünde plötzlich mitten in einer anderen Aufgabe.
//
// Fertig wird über den Melder gesagt — dieselbe Stelle, die auch Ruhezeit und
// Obergrenze kennt. Ein Hintergrundauftrag, der um drei Uhr nachts laut wird,
// wäre genau der Fehler, den melder.js schon einmal verhindert.
import { Agent } from './agent.js'
import { melden } from './melder.js'
import { loadConfig } from './config.js'

/** id -> Auftrag. Modulweit, nicht pro Seite: ein Auftrag überlebt das Neuladen. */
const auftraege = new Map()

let zaehler = 0

/** Wer über Änderungen Bescheid bekommen will (jede offene Seite). */
const hoerer = new Set()

export function auftragHoererDazu(send) {
  hoerer.add(send)
  return () => hoerer.delete(send)
}

function rufen(nachricht) {
  for (const send of hoerer) {
    try {
      send(nachricht)
    } catch {
      // eine tote Verbindung darf die anderen nicht mitreißen
    }
  }
}

/** Was nach außen sichtbar ist — ohne den inneren Agenten. */
function nachAussen(a) {
  return {
    id: a.id,
    text: a.text,
    zustand: a.zustand,
    gestartet: a.gestartet,
    beendet: a.beendet || null,
    schritt: a.schritt || null,
    ergebnis: a.ergebnis || null,
    fehler: a.fehler || null,
  }
}

export function auftragListe() {
  return [...auftraege.values()].map(nachAussen)
}

/**
 * Wie viele gleichzeitig laufen dürfen.
 *
 * Der Deckel ist niedrig, und das aus einem handfesten Grund: jeder Auftrag
 * ist ein eigener Agent mit eigenem Kontext, eigenen Werkzeugaufrufen und
 * eigenem Verbrauch am Gratis-Kontingent. Drei parallele Aufträge sind drei
 * parallele Gehirn-Ströme — auf einem 8-GB-Rechner mit gedeckeltem Kontingent
 * ist das die Grenze zwischen "läuft nebenher" und "alles steht".
 */
function deckel() {
  const n = Number(loadConfig().maxHintergrund)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 5) : 2
}

export function laufende() {
  return [...auftraege.values()].filter((a) => a.zustand === 'laeuft').length
}

/**
 * Einen Auftrag im Hintergrund starten.
 *
 * @param {string} text
 * @returns {{id: string} | {fehler: string}}
 */
export function auftragStarten(text) {
  const sauber = String(text || '').trim()
  if (!sauber) return { fehler: 'Kein Auftrag angegeben.' }
  if (laufende() >= deckel()) {
    return {
      fehler: `Es laufen schon ${laufende()} Aufträge im Hintergrund. Warte einen ab oder brich einen ab.`,
    }
  }

  const id = `a${Date.now().toString(36)}${++zaehler}`
  const auftrag = {
    id,
    text: sauber,
    zustand: 'laeuft',
    gestartet: Date.now(),
    schritt: null,
    // Eigene Sitzung, damit der Verlauf sich nicht mit dem Chat vermischt
    agent: null,
  }
  auftraege.set(id, auftrag)

  // Der Agent redet viel (delta, tool_start, …). Davon geht nichts an die
  // Oberfläche: ein Hintergrundauftrag, der den Chat vollschreibt, ist kein
  // Hintergrundauftrag. Nur der grobe Schritt wird durchgereicht, damit man
  // sieht, dass etwas passiert.
  const leise = (msg) => {
    if (msg.type === 'tool_start') {
      auftrag.schritt = msg.tool
      rufen({ type: 'auftrag_stand', auftrag: nachAussen(auftrag) })
    } else if (msg.type === 'done' && msg.text) {
      // Der Rückgabewert von send() ist derselbe Text, aber nicht in jedem
      // Ausgang (Abbruch nach maxSteps liefert eine andere Zeile). Hier
      // mitzuschreiben ist der verlässlichere Weg.
      auftrag.ergebnis = String(msg.text).slice(0, 4000)
    }
  }

  auftrag.agent = new Agent({ session: `hintergrund-${id}`, emit: leise })

  rufen({ type: 'auftrag_stand', auftrag: nachAussen(auftrag) })

  // Bewusst NICHT awaiten: die Funktion kehrt sofort zurück, das ist ja der
  // ganze Zweck. Fehler landen darum im .catch und nicht bei einem Aufrufer.
  auftrag.agent
    .send(sauber)
    .then((antwort) => {
      auftrag.zustand = 'fertig'
      if (!auftrag.ergebnis) auftrag.ergebnis = String(antwort ?? '').slice(0, 4000)
      auftrag.beendet = Date.now()
      auftrag.schritt = null
      rufen({ type: 'auftrag_stand', auftrag: nachAussen(auftrag) })
      melden(`Hintergrundauftrag fertig: ${kurz(sauber)}`, { art: 'erfolg' })
    })
    .catch((err) => {
      auftrag.zustand = 'fehler'
      auftrag.fehler = err.message
      auftrag.beendet = Date.now()
      auftrag.schritt = null
      rufen({ type: 'auftrag_stand', auftrag: nachAussen(auftrag) })
      melden(`Hintergrundauftrag gescheitert: ${kurz(sauber)} — ${err.message}`, { art: 'warnung' })
    })

  return { id }
}

function kurz(s) {
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}

/** Abbrechen. Ein laufender Agent hört auf, ein fertiger verschwindet aus der Liste. */
export function auftragAbbrechen(id) {
  const a = auftraege.get(id)
  if (!a) return { ok: false }
  if (a.zustand === 'laeuft') {
    try {
      a.agent?.stop()
    } catch {}
    a.zustand = 'abgebrochen'
    a.beendet = Date.now()
    a.schritt = null
    rufen({ type: 'auftrag_stand', auftrag: nachAussen(a) })
  } else {
    auftraege.delete(id)
    rufen({ type: 'auftrag_weg', id })
  }
  return { ok: true }
}

/**
 * Fertige aufräumen. Wird beim Abfragen der Liste mitgemacht, damit alte
 * Ergebnisse nicht ewig Speicher belegen — eine Stunde ist lange genug, um
 * etwas nachzulesen, und kurz genug, dass die Liste nicht zumüllt.
 */
export function altesWeg(maxAlterMs = 3600_000) {
  const jetzt = Date.now()
  for (const [id, a] of auftraege) {
    if (a.zustand !== 'laeuft' && a.beendet && jetzt - a.beendet > maxAlterMs) {
      auftraege.delete(id)
      rufen({ type: 'auftrag_weg', id })
    }
  }
}
