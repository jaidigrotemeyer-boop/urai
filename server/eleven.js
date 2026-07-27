// ElevenLabs: echte Stimme statt Browser-Stimme.
// Der Schlüssel bleibt hier auf dem Server — der Browser bekommt ihn nie zu sehen.
import { loadConfig } from './config.js'

const API = 'https://api.elevenlabs.io/v1'

export function elevenBereit() {
  return !!loadConfig().elevenKey
}

/** Welche Stimmen hat das Konto? */
export async function stimmenListe() {
  const c = loadConfig()
  if (!c.elevenKey) return { ok: false, fehler: 'Kein ElevenLabs-Schlüssel eingetragen.' }
  const r = await fetch(`${API}/voices`, {
    headers: { 'xi-api-key': c.elevenKey },
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) return { ok: false, fehler: `HTTP ${r.status} ${(await r.text()).slice(0, 200)}` }
  const j = await r.json()
  return {
    ok: true,
    stimmen: (j.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      art: v.labels?.accent || v.labels?.description || v.category || '',
    })),
  }
}

/**
 * Text zu Sprache. Gibt MP3-Bytes zurück.
 * Fällt still aus, wenn kein Schlüssel da ist — dann spricht der Browser selbst.
 */
export async function sprechen(text, { voice, signal } = {}) {
  const c = loadConfig()
  if (!c.elevenKey) throw new Error('Kein ElevenLabs-Schlüssel.')

  const sauber = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`>|]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
  if (!sauber) throw new Error('Nichts zu sagen.')

  const stimme = voice || c.elevenVoice
  const r = await fetch(`${API}/text-to-speech/${stimme}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': c.elevenKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: sauber,
      model_id: c.elevenModel,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.05 },
    }),
    signal: signal || AbortSignal.timeout(30000),
  })

  if (!r.ok) {
    const t = await r.text()
    throw new Error(`ElevenLabs HTTP ${r.status}: ${t.slice(0, 200)}`)
  }
  return Buffer.from(await r.arrayBuffer())
}
