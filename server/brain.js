// Gehirn-Wähler: nimmt das erste Gehirn, das lebt.
// Reihenfolge: Gemini → Cerebras → Groq → OpenRouter. Alles über API, nichts lokal.
import { loadConfig, saveConfig } from './config.js'
import { zaehle, stand as kontingentStand } from './kontingent.js'

// Modellname, der immer existiert — Rettung, wenn Google einen alten Namen abschaltet
const FALLBACK_GEMINI = 'gemini-flash-latest'

/**
 * Groq zählt streng nach Token pro Minute. Alle 43 Werkzeug-Beschreibungen
 * mitzuschicken frisst allein schon ein Viertel des Kontingents. Für enge
 * Gehirne geht darum nur das Nötigste mit.
 */
const ENGE_GEHIRNE = new Set(['groq'])
const KERN_WERKZEUGE = new Set([
  'fs_list', 'fs_read', 'fs_write', 'fs_edit', 'fs_search',
  'shell_run',
  'web_search', 'web_fetch',
  'mac_read_screen', 'mac_click_text', 'mac_type', 'mac_key', 'mac_open_app', 'mac_apps',
  'memory_search', 'memory_save',
  'obsidian_write', 'obsidian_search',
  'agent_spawn', 'agent_team',
  'live_report',
])

function werkzeugeFuer(provider, tools) {
  if (!ENGE_GEHIRNE.has(provider)) return tools
  const schmal = tools.filter((t) => KERN_WERKZEUGE.has(t.name))
  return schmal.length ? schmal : tools
}

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
// Beides in den Einstellungen verstellbar — wer nur einen Gratis-Schlüssel hat,
// wartet lieber lange, als eine Absage zu bekommen.
const pauseMs = () => loadConfig().brainPauseMs
const maxWartenS = () => loadConfig().brainMaxWaitS

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
  // Der Anbieter sagt oft selbst, wie lange man warten soll — dann darauf hören
  const warte = /try again in ([\d.]+)s/i.exec(grund)
  if (warte) {
    kaputt.set(p, { bis: Date.now() + Math.ceil(Number(warte[1]) * 1000) + 1000, grund })
    return
  }
  // Echte Absagen (Schlüssel, Geld, Modell weg) lang, Netz-Zicken kurz
  const hart = /\b(401|402|403|404)\b/.test(grund)
  kaputt.set(p, { bis: Date.now() + (hart ? pauseMs() : 60_000), grund })
}

/** Schlafen, aber sofort aufwachen, wenn der Nutzer stoppt. */
function warten(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Gestoppt.', 'AbortError'))
    }, { once: true })
  })
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
  // Eigene Anbieter — jeder mit Schlüssel und Adresse kommt hinten dran
  for (const eigener of c.customProviders || []) {
    if (eigener.key && eigener.url) chain.push(`eigen:${eigener.id}`)
  }
  return chain
}

/** Konfiguration eines eigenen Anbieters finden, anhand seiner Kennung. */
function eigenerAnbieter(provider) {
  if (!provider.startsWith('eigen:')) return null
  const id = provider.slice('eigen:'.length)
  return (loadConfig().customProviders || []).find((p) => p.id === id) || null
}

export async function brainStatus() {
  const c = loadConfig()
  return {
    chain: providerChain(),
    kaputt: brokenBrains(),
    kontingent: kontingentStand(providerChain()),
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
/**
 * @param {object}  o
 * @param {boolean} o.flink  Kleinkram — nimm das schnelle, billige Modell
 */
export async function chat({ messages, tools = [], onDelta = () => {}, signal, onWait = () => {}, flink = false }) {
  const chain = providerChain()
  if (!chain.length) {
    throw new Error('Kein Schlüssel eingetragen. Einstellungen öffnen und einen Gratis-Schlüssel eintippen (Gemini, Groq oder OpenRouter).')
  }

  const errors = []

  // Bis zu drei Runden: alle wachen Gehirne durchprobieren, dann warten
  // bis das nächste wieder darf, und nochmal. Aufgeben ist die letzte Wahl.
  const runden = loadConfig().brainRunden
  for (let runde = 0; runde < runden; runde++) {
    const wach = chain.filter((p) => !schlafend(p))

    for (const provider of wach) {
      try {
        const out =
          provider === 'gemini'
            ? await geminiChat({ messages, tools, onDelta, signal, model: flink ? loadConfig().geminiFastModel : undefined })
            : await openaiChat({ provider, messages, tools, onDelta, signal })
        kaputt.delete(provider)
        zaehle(provider, true, out.text?.length || 0)
        return out
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        zaehle(provider, false)
        melde(provider, err.message)
        errors.push(`${provider}: ${err.message}`)
      }
    }

    // Nichts wach. Wann darf das erste wieder?
    const zeiten = chain.map((p) => kaputt.get(p)?.bis ?? 0).filter((b) => b > Date.now())
    if (!zeiten.length) break
    const sekunden = Math.ceil((Math.min(...zeiten) - Date.now()) / 1000)
    if (sekunden > maxWartenS()) break

    const wer = chain.find((p) => (kaputt.get(p)?.bis ?? 0) === Math.min(...zeiten))
    onWait({ sekunden, provider: wer, grund: kaputt.get(wer)?.grund })
    await warten(sekunden * 1000 + 500, signal)
  }

  throw new Error(`Kein Gehirn erreichbar.\n${[...new Set(errors)].join('\n')}`)
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

// ──────────────────── OpenAI-kompatibel (Cerebras / Groq / OpenRouter) ────────────────────

// OpenRouter tauscht seine Gratis-Modelle ständig aus. Also selbst nachsehen,
// welches gerade gratis ist UND Werkzeuge kann, statt einen Namen fest zu verdrahten.
let routerCache = { modell: null, bis: 0 }

async function gratisRouterModell(c) {
  if (routerCache.modell && Date.now() < routerCache.bis) return routerCache.modell
  const fallback = c.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free'
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { authorization: `Bearer ${c.openrouterKey}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return fallback
    const j = await r.json()
    const gratis = (j.data || [])
      .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
      .filter((m) => (m.supported_parameters || []).includes('tools'))
      .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
    const gewaehlt = gratis[0]?.id || fallback
    routerCache = { modell: gewaehlt, bis: Date.now() + 30 * 60_000 }
    return gewaehlt
  } catch {
    return fallback
  }
}

async function openaiChat({ provider, messages, tools, onDelta, signal }) {
  const c = loadConfig()
  const eigener = eigenerAnbieter(provider)
  // Eigener Anbieter trägt Adresse, Schlüssel und Modell selbst mit sich —
  // die eingebauten lesen sie stattdessen aus der Konfiguration.
  const cfg = eigener
    ? { url: eigener.url, key: '__eigen__', modelKey: '__eigen__', model: eigener.model }
    : OPENAI_STYLE[provider]
  const schluessel = eigener ? eigener.key : c[cfg.key]
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
  const model = eigener
    ? eigener.model
    : provider === 'openrouter'
      ? await gratisRouterModell(c)
      : c[cfg.modelKey] || cfg.model
  const body = { model, messages: msgs, stream: true }
  tools = werkzeugeFuer(provider, tools)
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
  }
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${schluessel}` },
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
export async function look({ imageBase64, question, signal, model, flink = false }) {
  const c = loadConfig()
  if (!c.geminiKey) throw new Error('Bilder anschauen braucht einen Gemini-Schlüssel (gratis: aistudio.google.com/apikey).')
  const r = await geminiChat({
    messages: [{ role: 'user', content: question, images: [imageBase64] }],
    tools: [],
    onDelta: () => {},
    signal,
    model: model || (flink ? c.geminiFastModel : undefined),
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
