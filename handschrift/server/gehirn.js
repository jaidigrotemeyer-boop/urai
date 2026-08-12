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

/** Läuft daheim ein Ollama? Kurzer Anklopfer, damit die Oberfläche es weiß. */
export async function ollamaDa() {
  try {
    const a = await AbortSignal.timeout(1200)
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: a })
    if (!r.ok) return null
    const modelle = (await r.json()).models || []
    return { modelle: modelle.map((m) => m.name), url: OLLAMA }
  } catch {
    return null
  }
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
  return t
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

const anfrage = (text, funde, ton, extra, runde) => [
  { role: 'system', content: AUFTRAG },
  {
    role: 'user',
    content: [
      runde > 1
        ? `Das war schon ein Versuch, aber diese Schwächen sind geblieben. Geh sie diesmal wirklich an:`
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

  const vorher = messen(roh)
  const start = bewertung(vorher)
  const versuche = []
  let bester = null
  let aktuell = vorher

  for (let runde = 1; runde <= Math.max(1, runden); runde++) {
    if (signal?.aborted) break
    const nachrichten = anfrage(roh, aktuell.auffaellig, ton, extra, runde)

    let antwort = null
    const fehler = []
    for (const a of stelle) {
      try {
        antwort = { text: saeubern(await a.fragen(nachrichten, signal)), anbieter: a.name }
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
      continue
    }

    const neu = messen(antwort.text)
    const anteil = neu.woerter / Math.max(1, vorher.woerter)
    if (anteil < 0.67 || anteil > 1.4) {
      versuche.push({ runde, verworfen: `Länge ${Math.round(anteil * 100)} % — zusammengefasst statt lektoriert` })
      continue
    }

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
