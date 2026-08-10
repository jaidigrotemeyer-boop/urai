// Dauerhaft zuhören: war das überhaupt an mich gerichtet?
//
// Ein Weckwort löst dieses Problem, indem es die Frage dem Menschen aufbürdet
// — sag erst meinen Namen, dann rede. Ohne Weckwort muss die Frage jemand
// anders beantworten, und zwar für JEDEN Satz, der im Raum fällt.
//
// Warum das die ganze Schwierigkeit ist: ein Fehlalarm kostet hier nicht nur
// Peinlichkeit. URAI bedient Maus und Tastatur, öffnet Dateien und schreibt
// Nachrichten. Ein Halbsatz aus einem YouTube-Video, der versehentlich als
// Auftrag durchgeht, ist kein Schönheitsfehler. Darum ist die Grundhaltung
// hier NEIN: im Zweifel nicht gemeint.
//
// Drei Stufen, von billig nach teuer:
//   1. Name gefallen? Dann eindeutig gemeint, kein Modell nötig.
//   2. Zu kurz oder zu leise? Dann verworfen, ohne jemanden zu fragen.
//   3. Sonst entscheidet das lokale Modell — Ollama, auf diesem Rechner.
//      Ohne lokales Modell wird NICHT die Cloud gefragt: das wäre jeder
//      Satz des Tages an einen fremden Dienst, und zwar für eine Frage,
//      die man auch mit "sag meinen Namen" beantworten kann.
import { lokalFragen, darfLokal, ollamaDa } from './lokal.js'

// Wie die Spracherkennung den Namen versteht, ist Glückssache — "URAI" ist
// kein Wort, das ein Erkenner kennt. Darum mehrere Schreibungen.
const NAMEN = ['urai', 'u rai', 'you rai', 'uraj', 'urei', 'hey rai', 'jarvis']

const MIN_WORTE = 3

/**
 * Die Anweisung ans lokale Modell.
 *
 * Zwei Dinge daran sind nicht Geschmack, sondern Ergebnis von Fehlversuchen:
 *
 * 1. "Etikettierer", nicht "entscheide, ob das an dich gerichtet war". Ein 3B-
 *    Modell rutscht bei der zweiten Formulierung aus der Prüfer-Rolle und
 *    antwortet auf den Satz. Auf "kannst du den Ordner aufräumen" kam wörtlich
 *    "NEIN, ich kann dir dabei nicht helfen" — formal ein NEIN, inhaltlich das
 *    genaue Gegenteil der richtigen Antwort.
 * 2. AUFTRAG/GEREDE statt JA/NEIN. Ein Modell, das "ja" oder "nein" sagen soll,
 *    beantwortet damit gern die Frage im Satz statt die gestellte Aufgabe.
 *    Wörter, die im Gespräch nicht vorkommen, machen das unmöglich.
 */
const ETIKETT_ANWEISUNG = [
  'Du bist ein Etikettierer. Du antwortest NIEMALS auf den Inhalt.',
  'Du bekommst einen Satz aus einer Raumaufnahme und vergibst genau ein Etikett:',
  '',
  'AUFTRAG = jemand bittet einen Sprachassistenten um etwas oder fragt ihn etwas.',
  'GEREDE  = alles andere: Gespräche zwischen Menschen, Selbstgespräche, Ton aus',
  '          Videos, Gedankenfetzen, Erzähltes.',
  '',
  'Beispiele:',
  'Satz: "öffne mal die Datei von gestern" -> AUFTRAG',
  'Satz: "kannst du das Licht ausmachen" -> AUFTRAG',
  'Satz: "ich glaub der Zug fährt um halb drei" -> GEREDE',
  'Satz: "nee den Film hab ich schon gesehen" -> GEREDE',
  '',
  'Antworte mit genau einem Wort: AUFTRAG oder GEREDE.',
].join('\n')

/**
 * Antwort auswerten — und zwar streng.
 *
 * Nicht nach "auftrag" im Text suchen: das Modell schrieb einmal "Ich kann
 * nicht antworten, da der Satz keine Auftrag oder Befehl ist" — inhaltlich ein
 * klares GEREDE, per Textsuche ein AUFTRAG. Ein aufgeschnappter Satz wäre so
 * zum Befehl geworden. Darum zählt nur das erste Wort, und alles Unerwartete
 * ist GEREDE. Wer nicht sauber antwortet, hat nicht zugestimmt.
 */
function istAuftrag(antwort) {
  const erstes = String(antwort || '')
    .trim()
    .replace(/^[^\p{L}]+/u, '')
    .split(/[^\p{L}]/u)[0]
  return (erstes || '').toUpperCase() === 'AUFTRAG'
}

function nurLaute(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Steht der Name drin? Das ist die eine Stelle, an der wir sicher sind. */
export function nameGefallen(text) {
  const t = nurLaute(text)
  return NAMEN.some((n) => t.includes(n))
}

/**
 * War der Satz an URAI gerichtet?
 *
 * @param {string} text
 * @returns {Promise<{gemeint: boolean, grund: string}>}
 *   grund ist für die Anzeige und fürs Nachvollziehen gedacht — wer wissen
 *   will, warum nichts passiert ist, soll das nachlesen können, statt zu raten.
 */
export async function istGemeint(text) {
  const roh = String(text || '').trim()
  if (!roh) return { gemeint: false, grund: 'leer' }

  if (nameGefallen(roh)) return { gemeint: true, grund: 'name' }

  // Kurze Fetzen sind fast immer Nebengeräusch, Echo oder ein abgeschnittener
  // Satzanfang. Sie sind auch die schlechteste Grundlage für eine Entscheidung:
  // "mach mal" könnte alles heißen.
  if (nurLaute(roh).split(' ').filter(Boolean).length < MIN_WORTE) {
    return { gemeint: false, grund: 'zu-kurz' }
  }

  if (!darfLokal('jaNein')) {
    return { gemeint: false, grund: 'kein-lokales-gehirn' }
  }
  if (!(await ollamaDa())) {
    return { gemeint: false, grund: 'ollama-aus' }
  }

  try {
    const antwort = await lokalFragen('jaNein', [
      { role: 'system', content: ETIKETT_ANWEISUNG },
      // Der Satz geht bewusst als "Satz: …" hinein und nicht roh. Ein roher
      // Satz in einer user-Nachricht sieht für das Modell aus, als spräche
      // jemand MIT ihm — dann antwortet es darauf, statt zu etikettieren.
      // Genau daran ist die erste Fassung gescheitert: auf "kannst du den
      // Ordner aufräumen" kam "NEIN, ich kann dir dabei nicht helfen."
      { role: 'user', content: `Satz: "${roh.replace(/"/g, "'")}"` },
    ])

    const gemeint = istAuftrag(antwort)
    return { gemeint, grund: gemeint ? 'lokal-auftrag' : 'lokal-gerede' }
  } catch (err) {
    // Auch hier: kaputt heißt still. Ein Fehler im Torwächter darf nicht dazu
    // führen, dass plötzlich alles durchgelassen wird.
    return { gemeint: false, grund: `fehler: ${err.message}` }
  }
}
