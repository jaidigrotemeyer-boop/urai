// Gehirn-Wähler: nimmt das erste Gehirn, das lebt.
// Reihenfolge: Gemini → Cerebras → Groq → OpenRouter. Alles über API, nichts lokal.
import { loadConfig, saveConfig } from './config.js'

// Modellname, der immer existiert — Rettung, wenn Google einen alten Namen abschaltet
const FALLBACK_GEMINI = 'gemini-flash-latest'

const OPENAI_STYLE = {
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    key: 'cerebrasKey',
    modelKey: 'cerebrasModel',
    model: 'llama-3.3-70b',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: 'groqKey',
    modelKey: 'groqModel',
    model: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: 'openrouterKey',
    modelKey: 'openrouterModel',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
  },
}

// Gehirn, das grad Fehler wirft, wird eine Weile übersprungen — sonst
// wartet jeder Zug erst auf dieselbe Absage.
const kaputt = new Map() // provider -> { bis, grund }
const PAUSE_MS = 10 * 60 * 1000

function schlafend(p) {
  const k = kaputt.get(p)
  if (!k) return false
  if (Date.now() > k.bis) {
    kaputt.delete(p)
    return false
  }
  return true
}

function melde(p, grund) {
  // Netz-Zicken kurz, echte Absagen (Schlüssel, Geld, Modell weg) lang
  const hart = /\b(401|402|403|404)\b/.test(grund)
  kaputt.set(p, { bis: Date.now() + (hart ? PAUSE_MS : 60_000), grund })
}

export function brokenBrains() {
  return [...kaputt.entries()]
    .filter(([p]) => schlafend(p))
    .map(([p, k]) => ({ provider: p, grund: k.grund.slice(0, 200), bis: k.bis }))
}

export function providerChain() {
  const c = loadConfig()
  const chain = []
  // Reihenfolge kommt aus den Einstellungen; nur was einen Schlüssel hat, kommt rein
  for (const p of c.brainOrder || ['gemini', 'cerebras', 'groq', 'openrouter']) {
    if (p === 'gemini' && c.geminiKey) chain.push('gemini')
    if (p === 'cerebras' && c.cerebrasKey) chain.push('cerebras')
    if (p === 'groq' && c.groqKey) chain.push('groq')
    if (p === 'openrouter' && c.openrouterKey) chain.push('openrouter')
  }
  return chain
}

export async function brainStatus() {
  const c = loadConfig()
  return {
    chain: providerChain(),
    kaputt: brokenBrains(),
    gemini: !!c.geminiKey,
    cerebras: !!c.cerebrasKey,
    groq: !!c.groqKey,
    openrouter: !!c.openrouterKey,
    models: {
      gemini: c.geminiModel,
      cerebras: c.cerebrasModel,
      groq: c.groqModel,
      openrouter: c.openrouterModel,
      embed: c.embedModel,
    },
  }
}

/**
 * Ein Zug des Gehirns.
 * @param {object}   o
 * @param {Array}    o.messages  [{role:'system'|'user'|'assistant'|'tool', content, toolCalls?, toolCallId?, name?}]
 * @param {Array}    o.tools     [{name, description, parameters}]
 * @param {Function} o.onDelta   (textStück) => void
 * @param {AbortSignal} o.signal
 * @returns {Promise<{text:string, toolCalls:Array, provider:string, model:string}>}
 */
export async function chat({ messages, tools = [], onDelta = () => {}, signal }) {
  const chain = providerChain()
  if (!chain.length) {
    throw new Error('Kein Schlüssel eingetragen. Einstellungen öffnen und einen Gratis-Schlüssel eintippen (Gemini, Groq oder OpenRouter).')
  }
  const wach = chain.filter((p) => !schlafend(p))
  const errors = []

  // Alle in Pause? Dann doch alle probieren, sonst steht URAI still.
  for (const provider of (wach.length ? wach : chain)) {
    try {
      const out =
        provider === 'gemini'
          ? await geminiChat({ messages, tools, onDelta, signal })
          : await openaiChat({ provider, messages, tools, onDelta, signal })
      kaputt.delete(provider)
      return out
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      melde(provider, err.message)
      errors.push(`${provider}: ${err.message}`)
    }
  }
  throw new Error(`Kein Gehirn erreichbar.\n${errors.join('\n')}`)
}

// ─────────────────────────── Gemini ───────────────────────────

function toGeminiContents(messages) {
  const contents = []
  let system = ''
  for (const m of messages) {
    if (m.role === 'system') {
      system += (system ? '\n\n' : '') + m.content
      continue
    }
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name, response: { result: String(m.content ?? '') } } }],
      })
      continue
    }
    if (m.role === 'assistant') {
      const parts = []
      if (m.content) parts.push({ text: m.content })
      for (const tc of m.toolCalls || []) parts.push({ functionCall: { name: tc.name, args: tc.args || {} } })
      if (parts.length) contents.push({ role: 'model', parts })
      continue
    }
    const parts = [{ text: m.content || '' }]
    for (const img of m.images || []) parts.push({ inlineData: { mimeType: 'image/png', data: img } })
    contents.push({ role: 'user', parts })
  }
  return { contents, system }
}

async function geminiChat({ messages, tools, onDelta, signal, model }) {
  const c = loadConfig()
  const useModel = model || c.geminiModel
  const { contents, system } = toGeminiContents(messages)
  const body = { contents }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  if (tools.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: stripSchema(t.parameters),
        })),
      },
    ]
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:streamGenerateContent?alt=sse`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': c.geminiKey },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text()
    // Google nimmt alte Modellnamen für neue Nutzer weg — dann heilt sich das hier selbst
    const veraltet = res.status === 404 && /no longer available|not found/i.test(text)
    if (veraltet && useModel !== FALLBACK_GEMINI) {
      saveConfig({ geminiModel: FALLBACK_GEMINI })
      return geminiChat({ messages, tools, onDelta, signal, model: FALLBACK_GEMINI })
    }
    throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`)
  }

  let text = ''
  const toolCalls = []
  for await (const evt of sseLines(res)) {
    let j
    try {
      j = JSON.parse(evt)
    } catch {
      continue
    }
    for (const part of j?.candidates?.[0]?.content?.parts || []) {
      if (part.text) {
        text += part.text
        onDelta(part.text)
      }
      if (part.functionCall) {
        toolCalls.push({ id: `c${toolCalls.length}`, name: part.functionCall.name, args: part.functionCall.args || {} })
      }
    }
  }
  return { text, toolCalls, provider: 'gemini', model: c.geminiModel }
}

// Gemini mag kein $schema / additionalProperties
function stripSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(stripSchema)
  const out = {}
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$schema' || k === 'additionalProperties' || k === 'default') continue
    out[k] = stripSchema(v)
  }
  return out
}

// ──────────────────── OpenAI-kompatibel (Groq / OpenRouter) ────────────────────

async function openaiChat({ provider, messages, tools, onDelta, signal }) {
  const c = loadConfig()
  const cfg = OPENAI_STYLE[provider]
  const msgs = messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: String(m.content ?? '') }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.args || {}) },
        })),
      }
    }
    return { role: m.role, content: m.content || '' }
  })
  const model = c[cfg.modelKey] || cfg.model
  const body = { model, messages: msgs, stream: true }
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
  }
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${c[cfg.key]}` },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)

  let text = ''
  const acc = new Map()
  for await (const evt of sseLines(res)) {
    if (evt === '[DONE]') break
    let j
    try {
      j = JSON.parse(evt)
    } catch {
      continue
    }
    const d = j.choices?.[0]?.delta
    if (!d) continue
    if (d.content) {
      text += d.content
      onDelta(d.content)
    }
    for (const tc of d.tool_calls || []) {
      const cur = acc.get(tc.index) || { id: tc.id, name: '', argText: '' }
      if (tc.id) cur.id = tc.id
      if (tc.function?.name) cur.name = tc.function.name
      if (tc.function?.arguments) cur.argText += tc.function.arguments
      acc.set(tc.index, cur)
    }
  }
  const toolCalls = [...acc.values()].map((t, i) => ({
    id: t.id || `c${i}`,
    name: t.name,
    args: safeJson(t.argText),
  }))
  return { text, toolCalls, provider, model }
}

// ─────────────────────────── Augen & Gedächtnis ───────────────────────────

/** Bild anschauen. Braucht ein Gehirn, das Bilder kann — das ist Gemini. */
export async function look({ imageBase64, question, signal, model }) {
  const c = loadConfig()
  if (!c.geminiKey) throw new Error('Bilder anschauen braucht einen Gemini-Schlüssel (gratis: aistudio.google.com/apikey).')
  const r = await geminiChat({
    messages: [{ role: 'user', content: question, images: [imageBase64] }],
    tools: [],
    onDelta: () => {},
    signal,
    model,
  })
  return r.text
}

/** Vektor fürs Gedächtnis — über die Gemini-API. */
export async function embed(text) {
  const c = loadConfig()
  if (!c.geminiKey) throw new Error('Gedächtnis-Vektoren brauchen einen Gemini-Schlüssel.')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${c.embedModel}:embedContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': c.geminiKey },
      body: JSON.stringify({ model: `models/${c.embedModel}`, content: { parts: [{ text: text.slice(0, 8000) }] } }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!res.ok) throw new Error(`Embed kaputt: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  return j.embedding?.values || j.embedding
}

// ─────────────────────────── Helfer ───────────────────────────

async function* sseLines(res) {
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
}

async function* ndjsonLines(res) {
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) yield line
    }
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}
