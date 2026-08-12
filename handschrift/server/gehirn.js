// Umschreiben braucht ein Sprachmodell. Vier Anbieter mit Gratis-Kontingent,
// der Reihe nach durchprobiert — das erste, das antwortet, gewinnt. Ohne
// Schlüssel bleibt das Messen trotzdem nutzbar; nur das Umschreiben fehlt dann.
import { lesen } from './config.js'
import { messen } from './messen.js'

const ANBIETER = [
  {
    name: 'gemini',
    schluessel: 'geminiKey',
    hole: '<a href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</a>',
  },
  { name: 'cerebras', schluessel: 'cerebrasKey', hole: 'cloud.cerebras.ai' },
  { name: 'groq', schluessel: 'groqKey', hole: 'console.groq.com/keys' },
  { name: 'openrouter', schluessel: 'openrouterKey', hole: 'openrouter.ai' },
]

const OPENAI_ART = {
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', modell: 'llama-3.3-70b' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', modell: 'llama-3.3-70b-versatile' },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modell: 'meta-llama/llama-3.3-70b-instruct:free',
  },
}

export const einerDa = () => ANBIETER.some((a) => lesen()[a.schluessel])

async function openaiArt(name, schluessel, nachrichten, signal) {
  const { url, modell } = OPENAI_ART[name]
  const antwort = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${schluessel}` },
    body: JSON.stringify({ model: modell, messages: nachrichten, temperature: 0.85 }),
    signal,
  })
  if (!antwort.ok) throw new Error(`${name}: HTTP ${antwort.status} ${(await antwort.text()).slice(0, 200)}`)
  const daten = await antwort.json()
  return daten.choices?.[0]?.message?.content || ''
}

async function gemini(schluessel, nachrichten, signal) {
  const system = nachrichten.find((n) => n.role === 'system')?.content
  const rest = nachrichten.filter((n) => n.role !== 'system')
  const antwort = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${schluessel}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: rest.map((n) => ({ role: 'user', parts: [{ text: n.content }] })),
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: { temperature: 0.85 },
      }),
      signal,
    },
  )
  if (!antwort.ok) throw new Error(`gemini: HTTP ${antwort.status} ${(await antwort.text()).slice(0, 200)}`)
  const daten = await antwort.json()
  return (daten.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
}

const AUFTRAG = `Du bist Lektor. Du überarbeitest einen Text, damit er nicht mehr nach Fließband klingt.

Feste Regeln:
- Der Inhalt bleibt. Keine neue Behauptung, keine neue Zahl, kein neues Beispiel, nichts weglassen.
- Sprache des Originals beibehalten.
- Länge um höchstens ein Zehntel verändern.
- Überschriften, Listen, Zitate, Code und Links bleiben, wie sie sind.
- Antworte ausschließlich mit dem überarbeiteten Text. Keine Vorrede, kein Kommentar.

Woran du arbeitest:
- Satzlängen mischen. Auch mal ein Satz mit drei Wörtern. Auch mal ein langer.
- Floskeln und Übergangswörter streichen oder durch etwas Konkretes ersetzen.
- Wiederholte Satzanfänge auflösen.
- Nicht jeden Absatz gleich lang bauen.
- Aktiv statt Substantivketten. Konkretes Wort statt Allerweltswort.
- Die Stimme des Autors nicht gegen deine eigene tauschen.`

/** Text überarbeiten lassen — mit den gemessenen Schwächen als Auftrag. */
export async function umschreiben(text, { ton, extra, signal } = {}) {
  const roh = String(text || '').trim()
  if (!roh) throw new Error('Kein Text da.')
  const c = lesen()
  const wach = ANBIETER.filter((a) => c[a.schluessel])
  if (!wach.length)
    throw new Error(
      'Kein Schlüssel eingetragen. Einen Gratis-Schlüssel holen (Gemini, Groq, OpenRouter oder Cerebras) und in den Einstellungen eintragen. Das Messen läuft auch ohne.',
    )

  const vorher = messen(roh)
  const beanstandet = vorher.auffaellig.length
    ? `Gemessene Schwächen dieses Textes:\n- ${vorher.auffaellig.join('\n- ')}`
    : 'Der Text ist bereits unauffällig. Fass ihn nur an, wo es wirklich besser wird.'

  const nachrichten = [
    { role: 'system', content: AUFTRAG },
    {
      role: 'user',
      content: [beanstandet, ton ? `Gewünschter Ton: ${ton}` : '', extra || '', '', 'Hier der Text:', '', roh]
        .filter(Boolean)
        .join('\n'),
    },
  ]

  const fehler = []
  for (const a of wach) {
    try {
      const neu =
        a.name === 'gemini'
          ? await gemini(c[a.schluessel], nachrichten, signal)
          : await openaiArt(a.name, c[a.schluessel], nachrichten, signal)
      const sauber = String(neu || '').trim()
      if (!sauber) throw new Error('leere Antwort')
      return { text: sauber, vorher, nachher: messen(sauber), anbieter: a.name }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      fehler.push(`${a.name}: ${err.message}`)
    }
  }
  throw new Error(`Kein Gehirn hat geantwortet.\n${fehler.join('\n')}`)
}
