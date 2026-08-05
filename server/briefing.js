// Tagesbriefing: einmal am Tag nachsehen, was in den Themen des Nutzers los ist.
//
// Das ist bewusst KEIN Chat. Beim Öffnen soll etwas Fertiges dastehen, das man
// in zwanzig Sekunden liest — nicht ein leeres Feld, in das man erst tippen muss.
//
// Gebaut wird über die normalen Werkzeuge: web_search pro Thema, dann fasst das
// Gehirn zusammen. Wichtig dabei: es darf NUR wiedergeben, was in den Treffern
// steht. Ein Briefing, das Kurse oder Ereignisse erfindet, ist schlimmer als gar
// keines — darum steht zu jedem Punkt die Quelle, und Unbelegtes fliegt raus.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, loadConfig, sprachName } from './config.js'
import { chat } from './brain.js'

const DATEI = path.join(DATA_DIR, 'briefing.json')

/** Heute als YYYY-MM-DD in Ortszeit — danach entscheidet sich, ob neu gebaut wird. */
export function heute() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Was auf der Platte liegt. Kaputte Datei = einfach keins, kein Absturz. */
export function gespeichertes() {
  try {
    const j = JSON.parse(fs.readFileSync(DATEI, 'utf8'))
    return j && typeof j === 'object' ? j : null
  } catch {
    return null
  }
}

function speichern(briefing) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DATEI, JSON.stringify(briefing, null, 2))
  } catch {} // Ein Briefing, das sich nicht speichern lässt, ist trotzdem gültig
}

/**
 * Themen, über die berichtet wird. Hat der Nutzer keine eingetragen, wird nicht
 * geraten — dann kommt ein leeres Briefing mit der Bitte, welche zu wählen.
 * Erfundene Themen wären nur Rauschen.
 */
export function themen() {
  const c = loadConfig()
  return (c.briefingThemen || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
}

/** Ein Thema durchsuchen. Fehler sind hier normal — dann eben ohne Treffer weiter. */
async function suchen(thema, signal) {
  const { TOOL_MAP } = await import('./tools/index.js')
  const werkzeug = TOOL_MAP.get('web_search')
  if (!werkzeug) return ''
  try {
    const heuteWort = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
    const roh = await werkzeug.run({ query: `${thema} Nachrichten ${heuteWort}`, count: 6 }, { signal })
    return String(roh ?? '').slice(0, 4000)
  } catch {
    return ''
  }
}

/**
 * Rückfallweg für schwache Gehirne: ein Thema, ein Aufruf, KEIN JSON — nur
 * ein paar Zeilen Text. Ein 3B-Modell daheim scheitert zuverlässig an
 * verschachteltem JSON, schafft aber "schreib mir drei Sätze" mühelos.
 * Kostet mehr Aufrufe, darum läuft es erst, wenn der eine große Versuch nichts ergab.
 */
async function themaEinzeln(thema, treffer, signal) {
  const res = await chat({
    messages: [
      {
        role: 'system',
        content: [
          `Du fasst Nachrichten zum Thema "${thema}" zusammen.`,
          'Schreib 2 bis 3 kurze Sätze — jeden Satz in eine eigene Zeile, mit "- " davor.',
          'Hinter jedem Satz in Klammern die Quelle, z.B. (reuters.com).',
          'Nimm nur, was in den Treffern steht. Erfinde keine Zahlen und keine Ereignisse.',
          'Steht nichts Brauchbares drin, antworte mit einem einzigen Strich: -',
        ].join('\n'),
      },
      { role: 'user', content: treffer },
    ],
    tools: [],
    signal,
    flink: true,
    onDelta: () => {},
  })

  return String(res.text || '')
    .split('\n')
    .map((z) => z.trim())
    .filter((z) => z.startsWith('-') && z.length > 12)
    .slice(0, 4)
    .map((z) => {
      const ohneStrich = z.replace(/^[-•*]\s*/, '')
      const quelleTreffer = ohneStrich.match(/\(([^)]{3,60})\)\s*$/)
      return {
        text: ohneStrich.replace(/\s*\([^)]*\)\s*$/, '').slice(0, 400),
        quelle: quelleTreffer ? quelleTreffer[1].slice(0, 60) : '',
      }
    })
    .filter((p) => p.text.length > 10)
}

/** Aus der Antwort des Gehirns JSON herausklauben — Modelle packen gern ``` drumherum. */
function jsonLesen(text) {
  const t = String(text || '').trim()
  const ohneZaun = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = ohneZaun.indexOf('{')
  const ende = ohneZaun.lastIndexOf('}')
  if (start < 0 || ende <= start) return null
  try {
    return JSON.parse(ohneZaun.slice(start, ende + 1))
  } catch {
    return null
  }
}

/**
 * Das Briefing wirklich bauen. Dauert je nach Themenzahl 10–40 Sekunden,
 * darum läuft es im Hintergrund und die Oberfläche fragt nach.
 * @returns {Promise<object>}
 */
export async function bauen({ signal } = {}) {
  const cfg = loadConfig()
  const liste = themen()
  const datum = heute()

  if (!liste.length) {
    return {
      datum,
      gebautAm: new Date().toISOString(),
      leer: true,
      grund: 'keine-themen',
      fuerThemen: [],
      themen: [],
    }
  }

  // Nacheinander suchen, nicht alle auf einmal: DuckDuckGo mag keine Salven,
  // und sechs gleichzeitige Anfragen bringen bloß leere Antworten.
  const funde = []
  for (const thema of liste) {
    if (signal?.aborted) throw new Error('Abgebrochen.')
    funde.push({ thema, treffer: await suchen(thema, signal) })
  }

  const mitTreffern = funde.filter((f) => f.treffer.trim())
  if (!mitTreffern.length) {
    return {
      datum,
      gebautAm: new Date().toISOString(),
      leer: true,
      grund: 'nichts-gefunden',
      fuerThemen: liste,
      themen: liste.map((thema) => ({ thema, punkte: [] })),
    }
  }

  const name = String(cfg.profilName || '').trim()
  const nutzerText = [
    name ? `Der Nutzer heißt ${name}.` : '',
    `Heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
    '',
    ...mitTreffern.map((f) => `═══ THEMA: ${f.thema} ═══\n${f.treffer}`),
  ]
    .filter(Boolean)
    .join('\n')

  let res
  try {
    res = await chat({
      messages: [
        {
          role: 'system',
          content: [
            `Du schreibst ein kurzes Tagesbriefing in ${sprachName()}.`,
            '',
            'Du bekommst Suchtreffer zu mehreren Themen. Fasse je Thema die 2 bis 4',
            'wichtigsten Punkte zusammen — je ein Satz, klar und konkret.',
            '',
            'EISERNE REGEL: Nimm ausschließlich, was in den Treffern steht. Erfinde keine',
            'Zahlen, keine Kurse, keine Ereignisse, keine Daten. Steht zu einem Thema nichts',
            'Brauchbares in den Treffern, gib für dieses Thema eine leere Punkte-Liste zurück.',
            'Lieber weniger sagen als etwas behaupten, das du nicht gelesen hast.',
            '',
            'Zu jedem Punkt gehört die Quelle: der Domain-Name aus dem Treffer (z.B. "reuters.com").',
            'Findest du keine Domain, lass "quelle" leer.',
            '',
            // "Antworte mit nichts als …" hat ein 3B-Modell schon wörtlich als
            // "sag nichts" gelesen und mit einem einzigen Wort geantwortet.
            // Darum unmissverständlich: NUR, und ein Beispiel gleich daneben.
            'Deine ganze Antwort ist ein einziges JSON-Objekt. Kein Fließtext, keine Erklärung,',
            'keine Code-Zäune davor oder danach. Beginne mit { und höre mit } auf.',
            '',
            'Genau diese Form:',
            '{"gruss":"ein Satz Begrüßung","themen":[{"thema":"Name","punkte":[{"text":"ein Satz","quelle":"domain.de"}]}]}',
          ].join('\n'),
        },
        { role: 'user', content: nutzerText },
      ],
      tools: [],
      signal,
      flink: true, // Zusammenfassen ist Fleißarbeit — das billige Modell reicht
      onDelta: () => {},
    })
  } catch (err) {
    // Ohne Gehirn kein Briefing. Das ist kein Absturz, sondern ein Zustand —
    // die Oberfläche soll dann sagen "trag einen Schlüssel ein", nicht einen
    // roten Fehlertext zeigen.
    return {
      datum,
      gebautAm: new Date().toISOString(),
      leer: true,
      grund: /Schlüssel/i.test(err.message) ? 'kein-gehirn' : 'fehler',
      meldung: err.message.slice(0, 200),
      fuerThemen: liste,
      themen: liste.map((thema) => ({ thema, punkte: [] })),
    }
  }

  let roh = jsonLesen(res.text)

  // Kleine Modelle (llama3.2:3b und Verwandte) treffen die Form nicht immer beim
  // ersten Mal. Ein einziger Nachfasser mit der eigenen Fehlantwort im Rücken
  // holt die meisten davon noch ein — das ist billiger als ein leeres Briefing.
  if (!roh) {
    try {
      const zweiter = await chat({
        messages: [
          {
            role: 'system',
            // Die ursprüngliche Aufgabe NOCHMAL stellen, knapper. Beim ersten
            // Versuch wurde die kaputte Antwort zum Reparieren mitgeschickt —
            // daraufhin berichtete das Modell über "JSON-Konformität" statt über
            // Bitcoin. Es nahm die Meta-Aufgabe für den Inhalt. Also: kein Wort
            // über den Fehlversuch, nur die Aufgabe.
            content: [
              'Fasse die Suchtreffer je Thema in 2 bis 4 kurzen Sätzen zusammen.',
              'Nimm nur, was in den Treffern steht — erfinde nichts.',
              `Benutze genau diese Themen-Namen: ${liste.join(', ')}.`,
              '',
              'Deine ganze Antwort ist ein JSON-Objekt, beginnend mit { und endend mit }:',
              '{"gruss":"ein Satz","themen":[{"thema":"Name","punkte":[{"text":"ein Satz","quelle":"domain.de"}]}]}',
            ].join('\n'),
          },
          { role: 'user', content: nutzerText },
        ],
        tools: [],
        signal,
        flink: true,
        onDelta: () => {},
      })
      roh = jsonLesen(zweiter.text)
    } catch {} // Klappt der zweite Anlauf auch nicht, bleibt es eben leer
  }

  if (!roh) {
    return {
      datum,
      gebautAm: new Date().toISOString(),
      leer: true,
      grund: 'unlesbar',
      fuerThemen: liste,
      themen: liste.map((thema) => ({ thema, punkte: [] })),
    }
  }

  // Streng nachputzen: was das Modell zurückgibt, landet ungefiltert im Fenster.
  //
  // Der wichtigste Filter ist der letzte: nur Themen, die der Nutzer WIRKLICH
  // eingetragen hat. Ein schwaches Modell hat hier schon über "JSON-Konformität"
  // berichtet, weil es die Anweisung für den Inhalt hielt. So etwas darf nie
  // durchrutschen — es sähe aus wie eine echte Nachricht.
  const passendesThema = (roh) => {
    const r = String(roh || '').trim().toLowerCase()
    if (!r) return null
    return liste.find((th) => {
      const l = th.toLowerCase()
      return l === r || l.includes(r) || r.includes(l)
    }) || null
  }

  const sauber = {
    datum,
    gebautAm: new Date().toISOString(),
    leer: false,
    fuerThemen: liste,
    gruss: String(roh.gruss || '').slice(0, 200),
    themen: (Array.isArray(roh.themen) ? roh.themen : [])
      .slice(0, 8)
      .map((t) => ({
        // Der eingetragene Name gewinnt — nicht die Schreibweise des Modells
        thema: passendesThema(t?.thema),
        punkte: (Array.isArray(t?.punkte) ? t.punkte : []).slice(0, 4).map((p) => ({
          text: String(p?.text || '').slice(0, 400),
          quelle: String(p?.quelle || '').slice(0, 60),
        })).filter((p) => p.text),
      }))
      .filter((t) => t.thema)
      .slice(0, 6),
  }
  // Kam beim großen Versuch nichts Verwertbares heraus, aber es LAGEN Treffer vor,
  // dann lag es am Gehirn, nicht an der Nachrichtenlage — also einzeln nachfassen.
  if (!sauber.themen.some((t) => t.punkte.length)) {
    const einzeln = []
    for (const f of mitTreffern) {
      if (signal?.aborted) break
      try {
        const punkte = await themaEinzeln(f.thema, f.treffer, signal)
        if (punkte.length) einzeln.push({ thema: f.thema, punkte })
      } catch {} // ein zickiges Thema kippt nicht das ganze Briefing
    }
    if (einzeln.length) {
      sauber.themen = einzeln
      sauber.einzelweg = true // fürs Nachvollziehen, wenn mal etwas komisch aussieht
    }
  }

  sauber.leer = !sauber.themen.some((t) => t.punkte.length)
  if (sauber.leer) sauber.grund = 'nichts-gefunden'
  return sauber
}

// Läuft gerade ein Bau? Zwei gleichzeitige wären doppelte Suchen fürs gleiche Ergebnis.
let laeuft = null

/**
 * Das Briefing für heute holen. Ist es schon gebaut, kommt es sofort.
 * Sonst wird gebaut — wer währenddessen fragt, hängt sich an denselben Lauf.
 * @param {{neu?: boolean}} opt  neu:true baut auch dann, wenn heute schon eines da ist
 */
export async function holen({ neu = false } = {}) {
  if (!neu && bereit()) return gespeichertes()
  if (laeuft) return laeuft

  laeuft = (async () => {
    try {
      const b = await bauen({})
      // Vorübergehendes NICHT wegschreiben: wer gerade keinen Schlüssel hat und
      // gleich einen einträgt, bekäme sonst bis Mitternacht dasselbe leere Blatt.
      if (!FLUECHTIG.has(b.grund)) speichern(b)
      return b
    } finally {
      laeuft = null
    }
  })()
  return laeuft
}

// Gründe, die sich von selbst erledigen können — die werden nie zwischengespeichert.
// 'keine-themen' gehört dazu: trägt der Nutzer gleich danach Themen ein, wäre ein
// gemerktes leeres Blatt sofort falsch und bliebe es bis Mitternacht.
const FLUECHTIG = new Set(['kein-gehirn', 'fehler', 'unlesbar', 'keine-themen'])

/**
 * Steht für heute schon eines bereit, ohne dass gebaut werden müsste?
 * Nein, wenn es von gestern ist, aus einem flüchtigen Grund leer blieb — oder
 * für andere Themen gebaut wurde als die, die jetzt eingetragen sind.
 */
export function bereit() {
  const da = gespeichertes()
  if (!da || da.datum !== heute() || FLUECHTIG.has(da.grund)) return false
  const jetzt = themen().join(' ')
  const damals = (da.fuerThemen || []).join(' ')
  return jetzt === damals
}
