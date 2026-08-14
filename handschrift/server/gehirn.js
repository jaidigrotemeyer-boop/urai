// Umschreiben braucht ein Sprachmodell.
//
// Ollama läuft daheim und kostet nichts — es wird zuerst gefragt und braucht
// keinen Schlüssel. Danach vier Anbieter mit Gratis-Kontingent. Ohne alles
// bleibt das Messen nutzbar; nur das Umschreiben fehlt dann.
//
// Wichtiger als der Anbieter ist, was danach passiert: die Antwort wird
// nachgemessen. Ein Modell, das "mach es weniger nach Fließband" hört, liefert
// oft dieselben Floskeln in neuer Reihenfolge. Darum zählt hier nicht die
// Absicht, sondern das Ergebnis — und wenn es nicht besser ist, wird noch
// einmal gefragt, diesmal mit dem, was übrig geblieben ist.
import { lesen } from './config.js'
import { messen } from './messen.js'

const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

const OPENAI_ART = {
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', modell: 'llama-3.3-70b', schluessel: 'cerebrasKey' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', modell: 'llama-3.3-70b-versatile', schluessel: 'groqKey' },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modell: 'meta-llama/llama-3.3-70b-instruct:free',
    schluessel: 'openrouterKey',
  },
}

async function openaiArt(name, nachrichten, signal) {
  const { url, modell, schluessel } = OPENAI_ART[name]
  const antwort = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${lesen()[schluessel]}` },
    body: JSON.stringify({ model: modell, messages: nachrichten, temperature: 0.85 }),
    signal,
  })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} ${(await antwort.text()).slice(0, 160)}`)
  return (await antwort.json()).choices?.[0]?.message?.content || ''
}

async function gemini(nachrichten, signal) {
  const system = nachrichten.find((n) => n.role === 'system')?.content
  const antwort = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${lesen().geminiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: nachrichten.filter((n) => n.role !== 'system').map((n) => ({ role: 'user', parts: [{ text: n.content }] })),
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: { temperature: 0.85 },
      }),
      signal,
    },
  )
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} ${(await antwort.text()).slice(0, 160)}`)
  const daten = await antwort.json()
  return (daten.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
}

async function ollama(nachrichten, signal) {
  const modell = lesen().ollamaModell || 'llama3.2:3b'
  const antwort = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: modell, messages: nachrichten, stream: false, options: { temperature: 0.85 } }),
    signal,
  })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} ${(await antwort.text()).slice(0, 160)}`)
  return (await antwort.json()).message?.content || ''
}

// Die Oberfläche fragt den Stand alle 400 ms ab, solange getippt wird. Ohne
// dieses kurze Gedächtnis klopfte jeder dieser Abrufe bei Ollama an — zweieinhalb
// Netzanfragen pro Sekunde, nur um dieselbe Antwort zu bekommen.
let ollamaMerker = { bis: 0, wert: null }

/** Läuft daheim ein Ollama? Kurzer Anklopfer, damit die Oberfläche es weiß. */
export async function ollamaDa() {
  if (Date.now() < ollamaMerker.bis) return ollamaMerker.wert
  let wert = null
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1200) })
    if (r.ok) {
      const modelle = (await r.json()).models || []
      wert = { modelle: modelle.map((m) => m.name), url: OLLAMA }
    }
  } catch {
    wert = null
  }
  // Gefunden: fünf Sekunden glauben. Nicht gefunden: nur zwei, damit ein frisch
  // gestartetes Ollama nicht lange unsichtbar bleibt.
  ollamaMerker = { bis: Date.now() + (wert ? 5000 : 2000), wert }
  return wert
}

/** Wer gerade antworten könnte, in der Reihenfolge, in der gefragt wird. */
export async function anbieter() {
  const c = lesen()
  const liste = []
  const o = await ollamaDa()
  if (o?.modelle.length) liste.push({ name: `ollama (${c.ollamaModell || o.modelle[0]})`, fragen: ollama })
  if (c.geminiKey) liste.push({ name: 'gemini', fragen: gemini })
  for (const n of ['cerebras', 'groq', 'openrouter'])
    if (c[OPENAI_ART[n].schluessel]) liste.push({ name: n, fragen: (m, s) => openaiArt(n, m, s) })
  return liste
}

export const einerDa = async () => (await anbieter()).length > 0

// ────────────────────────────────────────────────────────────────────────────
// Bewerten
// ────────────────────────────────────────────────────────────────────────────

/**
 * Eine Zahl für "wie sehr klingt das nach Fließband" — klein ist gut.
 * Ohne sie ließe sich nicht entscheiden, ob eine Überarbeitung etwas gebracht
 * hat oder nur anders schlecht ist.
 */
export function bewertung(m) {
  if (!m.satz.anzahl) return 0
  const gleichmassStrafe = Math.max(0, 0.35 - m.satz.gleichmass) * 100
  const mittelbauStrafe = Math.max(0, m.mittelbauProzent - 60) * 0.4
  return +(m.auffaellig.length * 6 + m.floskeln.proTausend * 1.5 + gleichmassStrafe + mittelbauStrafe).toFixed(1)
}

// ────────────────────────────────────────────────────────────────────────────
// Antwort säubern
// ────────────────────────────────────────────────────────────────────────────

const VORREDE =
  /^(?:hier ist(?: der)?[^\n:]{0,60}:|überarbeitete[rn]? (?:fassung|text)[^\n:]{0,30}:|here(?:'s| is)[^\n:]{0,60}:|sure[,!][^\n]{0,60}:?)\s*/i

/**
 * Modelle liefern gern eine Vorrede oder packen alles in einen Code-Block,
 * obwohl im Auftrag steht, dass sie das nicht sollen. Das hier räumt auf,
 * statt die Antwort deswegen zu verwerfen.
 */
export function saeubern(roh) {
  let t = String(roh || '').trim()
  const block = t.match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  if (block) t = block[1].trim()
  t = t.replace(VORREDE, '').trim()
  // Ein nachgeschobener Kommentar hinter einer Trennlinie gehört nicht zum Text.
  t = t.replace(/\n+(?:---+|___+)\n[\s\S]*$/, '').trim()
  // Manche Modelle legen den ganzen Text in Anführungszeichen, als würden sie
  // ihn zitieren.
  const zitat = t.match(/^["„»“](.*)["“«”]$/s)
  if (zitat && !/["„»]/.test(zitat[1])) t = zitat[1].trim()
  return t
}

/**
 * Stichpunkte gehören untereinander, nicht nebeneinander.
 *
 * Modelle geben Listen gern als eine einzige Zeile zurück
 * ("- Punkt eins - Punkt zwei - Punkt drei"). Gesplittet wird nur, wenn die
 * Zeile schon mit einem Aufzählungszeichen beginnt — dann sind die weiteren
 * Zeichen mit Sicherheit auch welche und kein Gedankenstrich im Fließtext.
 */
export function listenAufraeumen(text) {
  const zeilen = String(text).split('\n')
  const raus = []
  for (const zeile of zeilen) {
    if (/^\s*[-*+]\s+\S/.test(zeile)) {
      raus.push(...zeile.trimEnd().split(/\s+(?=[-*+]\s+\S)/))
    } else if (/^\s*\d+\.\s+\S/.test(zeile)) {
      raus.push(...zeile.trimEnd().split(/\s+(?=\d+\.\s+\S)/))
    } else {
      raus.push(zeile)
    }
  }

  // Überschrift und Listenblock brauchen Luft, sonst klebt in Markdown alles
  // aneinander und die Liste wird gar nicht als Liste erkannt.
  const fertig = []
  for (const [i, zeile] of raus.entries()) {
    const vorher = raus[i - 1]
    const istPunkt = /^\s*(?:[-*+]|\d+\.)\s+/.test(zeile)
    const istKopf = /^#{1,6}\s/.test(zeile)
    const vorherPunkt = vorher !== undefined && /^\s*(?:[-*+]|\d+\.)\s+/.test(vorher)
    const vorherLeer = vorher === undefined || !vorher.trim()
    if ((istKopf || (istPunkt && !vorherPunkt)) && !vorherLeer) fertig.push('')
    if (!istKopf && !istPunkt && vorherPunkt && zeile.trim()) fertig.push('')
    fertig.push(zeile)
    if (istKopf && raus[i + 1]?.trim()) fertig.push('')
  }
  return fertig.join('\n')
}

/**
 * Kleinkram glätten, der sonst sofort als "komisch" ins Auge fällt: Leerzeichen
 * am Zeilenende, drei Leerzeilen am Stück, Überschriften ohne Leerzeichen hinter
 * der Raute, nebeneinander geklebte Stichpunkte, und typografische
 * Anführungszeichen in einem Text, der vorher gerade hatte (oder umgekehrt).
 */
export function putzen(neu, original) {
  let t = String(neu || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    // "#Titel" ohne Leerzeichen ist keine Überschrift, sieht aber wie eine aus.
    .replace(/^(#{1,6})(\S)/gm, '$1 $2')

  t = listenAufraeumen(t)
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const krumm = (s) => (s.match(/[„“”»«]/g) || []).length
  const gerade = (s) => (s.match(/"/g) || []).length
  if (krumm(original) === 0 && krumm(t) > 0) t = t.replace(/[„“”]/g, '"').replace(/[»«]/g, '"')
  else if (gerade(original) === 0 && krumm(original) > 0 && gerade(t) > 0) {
    // Zurück auf deutsche Anführungszeichen, paarweise von links nach rechts.
    let auf = true
    t = t.replace(/"/g, () => ((auf = !auf) ? '“' : '„'))
  }
  return t
}

// ────────────────────────────────────────────────────────────────────────────
// Sieht das noch aus wie der Text, den man reingegeben hat?
// ────────────────────────────────────────────────────────────────────────────

const geruest = (t) => ({
  absaetze: t.split(/\n\s*\n/).filter((a) => a.trim()).length,
  // Nicht nur zählen, sondern die Ebenen merken: eine H1, die als H3
  // zurückkommt, ist plötzlich klein — der Text sieht anders aus, obwohl die
  // Anzahl stimmt.
  ebenen: (t.match(/^#{1,6} /gm) || []).map((h) => h.trim().length).join(''),
  ueberschriften: (t.match(/^#{1,6} /gm) || []).length,
  listen: (t.match(/^\s*(?:[-*+]|\d+\.)\s+/gm) || []).length,
  code: (t.match(/^```/gm) || []).length,
})

// Grobe Sprachprobe über die häufigsten Funktionswörter. Reicht völlig, um
// zu merken, dass ein Modell auf Englisch geantwortet hat — ein Fehler, den
// kleine Modelle regelmäßig machen und der sofort auffällt.
const DE = /\b(?:der|die|das|und|ist|nicht|ein|eine|zu|von|mit|sich|auf|für|dass|den|dem|im|als|auch|wird|sind)\b/gi
const EN = /\b(?:the|and|is|not|a|an|to|of|with|for|that|in|as|are|this|it|on|be|by|from)\b/gi
const anteil = (t, muster) => (t.match(muster) || []).length / Math.max(1, (t.match(/\S+/g) || []).length)

/**
 * 'de', 'en' — oder null, wenn die Probe zu dünn ist. Das null ist wichtig:
 * "Anderer Absatz. Eins. Zwei." enthält kein einziges Funktionswort, und ein
 * erzwungenes Urteil darüber meldete früher einen Sprachwechsel, wo keiner war.
 */
export function sprache(t) {
  const woerter = (t.match(/\S+/g) || []).length
  const de = (t.match(DE) || []).length
  const en = (t.match(EN) || []).length
  if (woerter < 8 || de + en < 3 || de === en) return null
  return de > en ? 'de' : 'en'
}

export const istDeutsch = (t) => sprache(t) === 'de'

/**
 * Was am Ergebnis formal kaputt ist. Leere Liste heißt: sieht aus wie vorher,
 * nur besser geschrieben.
 */
export function strukturPruefen(original, neu) {
  const a = geruest(original)
  const b = geruest(neu)
  const klagen = []

  if (a.ueberschriften !== b.ueberschriften)
    klagen.push(`Überschriften: ${a.ueberschriften} vorher, ${b.ueberschriften} nachher`)
  else if (a.ebenen !== b.ebenen) klagen.push('Überschriften-Ebenen verschoben (aus groß wurde klein oder umgekehrt)')
  if (a.listen !== b.listen) klagen.push(`Listenpunkte: ${a.listen} vorher, ${b.listen} nachher`)
  if (a.code !== b.code) klagen.push(`Code-Zäune: ${a.code} vorher, ${b.code} nachher`)
  // Absätze dazu sind kein Schaden, verlorene schon: dann ist der Text zur
  // Wand zusammengelaufen.
  if (b.absaetze < a.absaetze) klagen.push(`Absätze verloren: ${a.absaetze} vorher, ${b.absaetze} nachher`)

  const a1 = sprache(original)
  const b1 = sprache(neu)
  if (a1 && b1 && a1 !== b1) klagen.push(`Sprache gewechselt: ${a1} → ${b1}`)

  // Abbruch mitten im Satz — beim Original zählt das letzte echte Zeichen.
  const endetSauber = (t) => /[.!?…:;"'“”»)\]\d]$/.test(t.trim())
  if (endetSauber(original) && !endetSauber(neu)) klagen.push('endet mitten im Satz')

  return klagen
}

// ────────────────────────────────────────────────────────────────────────────
// Was für ein Text ist das überhaupt?
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ein Merkblatt aus Stichpunkten will anders lektoriert werden als ein Aufsatz.
 * Ohne diese Unterscheidung macht das Modell aus jeder Liste Fließtext — und
 * das ist die häufigste Art, wie eine Überarbeitung "komisch" wird.
 */
export function textArt(t) {
  const g = geruest(t)
  const zeilen = t.split('\n').filter((z) => z.trim()).length
  if (g.code > 0) return 'code'
  if (g.ueberschriften > 0 && g.listen > 0) return 'dokument'
  if (g.ueberschriften > 0) return 'gegliedert'
  if (g.listen >= Math.max(3, zeilen * 0.5)) return 'liste'
  return 'fliesstext'
}

const FORMHINWEIS = {
  fliesstext: 'Es ist Fließtext ohne Gliederung. Lass ihn Fließtext — bau keine Überschriften und keine Aufzählungen ein.',
  liste:
    'Es ist eine Aufzählung. Sie bleibt eine Aufzählung: jeder Stichpunkt steht in einer eigenen Zeile, mit demselben Zeichen davor. Mach daraus keinen Fließtext und häng die Punkte nicht aneinander.',
  gegliedert:
    'Der Text hat Überschriften. Behalte sie und ihre Ebene: aus einer großen Überschrift (#) darf keine kleine (###) werden und umgekehrt.',
  dokument:
    'Der Text hat Überschriften und Aufzählungen. Beides bleibt, mit denselben Ebenen und derselben Anzahl. Stichpunkte stehen untereinander, jeder in einer eigenen Zeile.',
  code: 'Im Text stehen Code-Blöcke. Der Code bleibt Zeichen für Zeichen, wie er ist — überarbeitet wird nur der Text drumherum.',
}

// ────────────────────────────────────────────────────────────────────────────
// Umschreiben
// ────────────────────────────────────────────────────────────────────────────

const AUFTRAG = `Du bist Lektor. Du überarbeitest einen Text, damit er nicht mehr nach Fließband klingt.

Feste Regeln:
- Der Inhalt bleibt. Keine neue Behauptung, keine neue Zahl, kein neues Beispiel, nichts weglassen.
- Sprache des Originals beibehalten.
- Länge um höchstens ein Zehntel verändern.
- Überschriften, Listen, Zitate, Code und Links bleiben, wie sie sind.
- Antworte ausschließlich mit dem überarbeiteten Text. Keine Vorrede, kein Kommentar, keine Code-Blöcke.

Woran du arbeitest:
- Satzlängen mischen. Auch mal ein Satz mit drei Wörtern. Auch mal ein langer.
- Floskeln und Übergangswörter streichen. Achtung im Deutschen: fällt ein
  vorangestelltes "Darüber hinaus" oder "Zudem" weg, muss der Satz zurück in
  die normale Stellung ("Zudem bietet die Technik X" wird "Die Technik bietet X").
- Wiederholte Satzanfänge auflösen.
- Nicht jeden Absatz gleich lang bauen.
- Aktiv statt Substantivketten. Konkretes Wort statt Allerweltswort.
- Die Stimme des Autors nicht gegen deine eigene tauschen.`

const anfrage = (text, funde, ton, extra, runde, nachtrag) => [
  { role: 'system', content: AUFTRAG },
  {
    role: 'user',
    content: [
      FORMHINWEIS[textArt(text)],
      '',
      nachtrag
        ? `Dein letzter Versuch war formal unbrauchbar: ${nachtrag}. Gib den Text diesmal in genau derselben Form zurück — gleiche Absätze, gleiche Überschriften, gleiche Listen, gleiche Sprache, vollständig bis zum letzten Satz.`
        : '',
      runde > 1 && !nachtrag
        ? 'Das war schon ein Versuch, aber diese Schwächen sind geblieben. Geh sie diesmal wirklich an:'
        : 'Gemessene Schwächen dieses Textes:',
      funde.length ? `- ${funde.join('\n- ')}` : '(keine — fass den Text nur an, wo es wirklich besser wird)',
      ton ? `\nGewünschter Ton: ${ton}` : '',
      extra ? `\n${extra}` : '',
      '',
      'Hier der Text:',
      '',
      text,
    ]
      .filter(Boolean)
      .join('\n'),
  },
]

/**
 * Text überarbeiten lassen und nachmessen. Bis zu `runden` Versuche; behalten
 * wird der beste, nicht der letzte. Verliert eine Fassung mehr als ein Drittel
 * des Textes oder bläht ihn auf, wird sie verworfen — dann hat das Modell
 * zusammengefasst statt lektoriert.
 */
export async function umschreiben(text, { ton, extra, signal, runden = 3, fragen } = {}) {
  const roh = String(text || '').trim()
  if (!roh) throw new Error('Kein Text da.')

  let stelle = fragen ? [{ name: 'prüfstand', fragen }] : await anbieter()
  if (!stelle.length)
    throw new Error(
      'Kein Gehirn erreichbar. Entweder Ollama daheim starten (ollama serve, kein Schlüssel nötig) ' +
        'oder einen Gratis-Schlüssel in den Einstellungen eintragen. Das Messen läuft auch ohne.',
    )

  const vorher = { ...messen(roh), art: textArt(roh) }
  const start = bewertung(vorher)
  const versuche = []
  let bester = null
  let aktuell = vorher
  let nachtrag = null

  for (let runde = 1; runde <= Math.max(1, runden); runde++) {
    if (signal?.aborted) break
    const nachrichten = anfrage(roh, aktuell.auffaellig, ton, extra, runde, nachtrag)

    let antwort = null
    const fehler = []
    for (const a of stelle) {
      try {
        antwort = { text: putzen(saeubern(await a.fragen(nachrichten, signal)), roh), anbieter: a.name }
        break
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        fehler.push(`${a.name}: ${err.message}`)
      }
    }
    if (!antwort) {
      if (bester) break
      throw new Error(`Kein Gehirn hat geantwortet.\n${fehler.join('\n')}`)
    }
    if (!antwort.text) {
      versuche.push({ runde, verworfen: 'leere Antwort' })
      nachtrag = 'die Antwort war leer'
      continue
    }

    const neu = { ...messen(antwort.text), art: textArt(antwort.text) }
    const anteil = neu.woerter / Math.max(1, vorher.woerter)
    if (anteil < 0.67 || anteil > 1.4) {
      versuche.push({ runde, verworfen: `Länge ${Math.round(anteil * 100)} % — zusammengefasst statt lektoriert` })
      nachtrag = `der Text hatte danach ${Math.round(anteil * 100)} % der ursprünglichen Länge`
      continue
    }

    // Inhaltlich besser, formal kaputt zählt nicht als besser. Genau daran
    // erkennt man eine Überarbeitung, die "komisch aussieht".
    const formfehler = strukturPruefen(roh, antwort.text)
    if (formfehler.length) {
      versuche.push({ runde, verworfen: `Form: ${formfehler.join(', ')}` })
      nachtrag = formfehler.join(', ')
      continue
    }
    nachtrag = null

    const punkte = bewertung(neu)
    versuche.push({ runde, anbieter: antwort.anbieter, punkte, auffaellig: neu.auffaellig.length })
    if (!bester || punkte < bester.punkte) bester = { ...antwort, messung: neu, punkte }
    aktuell = neu
    // Nichts mehr zu holen: keine Beanstandung übrig, oder schon deutlich besser.
    if (!neu.auffaellig.length || punkte <= start * 0.4) break
  }

  if (!bester) throw new Error(`Keine brauchbare Fassung. ${versuche.map((v) => v.verworfen).filter(Boolean).join(' · ')}`)
  if (bester.punkte >= start)
    throw new Error(
      `Die Überarbeitung wurde nicht besser (${start} → ${bester.punkte} Punkte). ` +
        'Ein größeres Modell hilft hier mehr als noch ein Versuch.',
    )

  return {
    text: bester.text,
    vorher,
    nachher: bester.messung,
    anbieter: bester.anbieter,
    punkte: { vorher: start, nachher: bester.punkte },
    versuche,
  }
}
