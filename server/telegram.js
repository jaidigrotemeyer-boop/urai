// Telegram als Tür zu URAI: schreiben oder reinsprechen, und der Agent, der
// ohnehin schon den Mac steuert, erledigt es — von unterwegs.
//
// Bewusst KEIN zweiter Assistent. Alles, was URAI im Fenster kann, kann er
// hier auch: Dateien, Obsidian, Kalender über AppleScript, Bildschirm lesen,
// Agenten-Gruppen. Telegram ist nur ein weiterer Eingang in dieselbe Schleife.
//
// Alles gratis und ohne öffentliche Adresse: Long-Polling holt die Nachrichten
// ab, statt auf einen Webhook zu warten. Damit läuft es hinter jedem Router,
// ohne Portfreigabe, ohne Tunnel-Dienst.
//
// SICHERHEIT — der wichtigste Teil dieser Datei:
// Wer hier schreibt, steuert einen fremden Mac. Darum läuft der Bot nur mit
// einer ausdrücklichen Erlaubnisliste. Ist sie leer, startet er gar nicht
// erst. Eine offene Tür wäre hier keine Bequemlichkeit, sondern ein Unfall.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadConfig } from './config.js'
import { Agent } from './agent.js'
import { elevenBereit, sprechen as elevenSprechen } from './eleven.js'

const pexec = promisify(execFile)
const API = (token, methode) => `https://api.telegram.org/bot${token}/${methode}`

/** Telegram schneidet bei 4096 Zeichen ab — lieber selbst sauber teilen. */
const MAX_TEXT = 3800

async function ruf(token, methode, koerper) {
  const r = await fetch(API(token, methode), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(koerper),
    signal: AbortSignal.timeout(70_000), // länger als das Polling-Fenster
  })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) throw new Error(`Telegram ${methode}: ${j.description || r.status}`)
  return j.result
}

/** Datei vom Telegram-Server holen (Sprachnachrichten kommen als Verweis). */
async function dateiHolen(token, fileId) {
  const info = await ruf(token, 'getFile', { file_id: fileId })
  const r = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`Datei-Abruf fehlgeschlagen: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/**
 * Sprachnachricht zu Text. Gemini kann Audio direkt lesen — das spart ein
 * lokales Spracherkennungs-Modell und ist mit dem Gratis-Schlüssel kostenlos.
 */
async function zuText(ogg) {
  const c = loadConfig()
  if (!c.geminiKey) throw new Error('Sprachnachrichten brauchen einen Gemini-Schlüssel (gratis: aistudio.google.com/apikey).')

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${c.geminiFastModel || c.geminiModel}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': c.geminiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Schreib wortwörtlich auf, was in dieser Aufnahme gesagt wird. Nur den Wortlaut, sonst nichts.' },
              { inline_data: { mime_type: 'audio/ogg', data: ogg.toString('base64') } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    }
  )
  const j = await r.json()
  if (!r.ok) throw new Error(`Spracherkennung: ${j.error?.message || r.status}`)
  return String(j.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
}

/**
 * Text zu Sprachnachricht. Erst ElevenLabs (klingt wie ein Mensch), sonst die
 * eingebaute Mac-Stimme — die kostet nichts und ist immer da.
 * Telegram will für die runden Sprachnachrichten OGG/Opus.
 * @returns {Promise<Buffer|null>} null heißt: nur Text schicken
 */
async function zuSprache(text) {
  const tmp = path.join(os.tmpdir(), `urai-tg-${Date.now()}`)
  try {
    let quelle
    if (elevenBereit()) {
      quelle = `${tmp}.mp3`
      await fsp.writeFile(quelle, await elevenSprechen(text))
    } else {
      // `say` ist in macOS eingebaut — keine Installation, kein Schlüssel
      quelle = `${tmp}.aiff`
      await pexec('/usr/bin/say', ['-v', 'Anna', '-o', quelle, text.slice(0, 1500)])
    }
    const ziel = `${tmp}.ogg`
    await pexec('ffmpeg', ['-loglevel', 'error', '-i', quelle, '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', ziel])
    const daten = await fsp.readFile(ziel)
    await Promise.all([fsp.unlink(quelle).catch(() => {}), fsp.unlink(ziel).catch(() => {})])
    return daten
  } catch {
    return null // Ohne Sprache eben nur Text — das ist kein Grund zu scheitern
  }
}

async function sprachnachricht(token, chatId, ogg, bildunterschrift) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('voice', new Blob([ogg], { type: 'audio/ogg' }), 'urai.ogg')
  if (bildunterschrift) form.append('caption', bildunterschrift.slice(0, 1000))
  const r = await fetch(API(token, 'sendVoice'), { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) throw new Error(`sendVoice: ${j.description || r.status}`)
}

/** Langen Text in Stücke schneiden, möglichst an Absätzen. */
function stuecke(text) {
  const raus = []
  let rest = String(text || '')
  while (rest.length > MAX_TEXT) {
    let schnitt = rest.lastIndexOf('\n\n', MAX_TEXT)
    if (schnitt < MAX_TEXT * 0.5) schnitt = rest.lastIndexOf('\n', MAX_TEXT)
    if (schnitt < MAX_TEXT * 0.5) schnitt = MAX_TEXT
    raus.push(rest.slice(0, schnitt))
    rest = rest.slice(schnitt).trimStart()
  }
  if (rest) raus.push(rest)
  return raus
}

export class TelegramTuer {
  constructor({ emit } = {}) {
    this.emit = emit || (() => {})
    this.laeuft = false
    this.offset = 0
    this.beschaeftigt = new Set() // je Chat nur ein Auftrag gleichzeitig
    this.abbruch = null
  }

  /** @returns {{an: boolean, grund?: string}} */
  static pruefen() {
    const c = loadConfig()
    if (!c.telegramAn) return { an: false, grund: 'aus' }
    if (!c.telegramToken) return { an: false, grund: 'kein-token' }
    if (!(c.telegramErlaubteIds || []).length) return { an: false, grund: 'keine-erlaubnis' }
    return { an: true }
  }

  async start() {
    const stand = TelegramTuer.pruefen()
    if (!stand.an) return stand
    if (this.laeuft) return { an: true, schon: true }

    this.laeuft = true
    this.abbruch = new AbortController()
    const token = loadConfig().telegramToken

    try {
      const ich = await ruf(token, 'getMe', {})
      this.name = ich.username
      this.emit({ type: 'telegram_an', name: ich.username })
      console.log(`  Telegram:    @${ich.username} hört zu`)
    } catch (err) {
      this.laeuft = false
      this.emit({ type: 'telegram_fehler', text: err.message })
      return { an: false, grund: 'token-falsch', text: err.message }
    }

    this.schleife().catch((err) => {
      this.laeuft = false
      this.emit({ type: 'telegram_fehler', text: err.message })
    })
    return { an: true }
  }

  stop() {
    this.laeuft = false
    this.abbruch?.abort()
    this.emit({ type: 'telegram_aus' })
  }

  async schleife() {
    while (this.laeuft) {
      const c = loadConfig()
      if (!c.telegramAn || !c.telegramToken) break
      try {
        // 50 Sekunden offen halten: eine Anfrage pro Minute statt Dauerfeuer
        const updates = await ruf(c.telegramToken, 'getUpdates', {
          offset: this.offset,
          timeout: 50,
          allowed_updates: ['message'],
        })
        for (const u of updates) {
          this.offset = u.update_id + 1
          if (u.message) this.nachricht(u.message).catch(() => {})
        }
      } catch (err) {
        if (!this.laeuft) break
        // Netz weg, Telegram zickt: kurz durchatmen statt in einer engen
        // Schleife heißzulaufen
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }

  /** Darf dieser Absender? Alles andere wird still verworfen. */
  erlaubt(msg) {
    const erlaubte = (loadConfig().telegramErlaubteIds || []).map(String)
    return erlaubte.includes(String(msg.from?.id))
  }

  async nachricht(msg) {
    // Kein Hinweis an Unbefugte: wer nicht auf der Liste steht, bekommt
    // schlicht keine Antwort. Ein "du darfst nicht" verrät nur, dass hier
    // etwas läuft, das sich zu suchen lohnt.
    if (!this.erlaubt(msg)) {
      this.emit({ type: 'telegram_abgewiesen', von: msg.from?.id })
      return
    }

    const c = loadConfig()
    const token = c.telegramToken
    const chatId = msg.chat.id

    if (this.beschaeftigt.has(chatId)) {
      await ruf(token, 'sendMessage', { chat_id: chatId, text: 'Bin noch am vorigen dran — einen Moment.' }).catch(() => {})
      return
    }

    let auftrag = String(msg.text || '').trim()
    let warSprache = false

    // ── Sprachnachricht: erst zuhören ──
    if (msg.voice || msg.audio) {
      warSprache = true
      try {
        await ruf(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
        const ogg = await dateiHolen(token, (msg.voice || msg.audio).file_id)
        auftrag = await zuText(ogg)
        if (!auftrag) throw new Error('Nichts verstanden.')
        // Sofort zurückmelden, was angekommen ist — dann sieht man bei einem
        // Hörfehler gleich, woran eine komische Antwort lag
        await ruf(token, 'sendMessage', { chat_id: chatId, text: `verstanden: ${auftrag}` })
      } catch (err) {
        await ruf(token, 'sendMessage', { chat_id: chatId, text: `Konnte die Aufnahme nicht verstehen: ${err.message}` }).catch(() => {})
        return
      }
    }

    if (!auftrag) return
    if (auftrag === '/start') {
      await ruf(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Ich bin URAI. Schreib mir oder sprich mir eine Nachricht — ich mach das dann auf deinem Mac.',
      })
      return
    }

    this.beschaeftigt.add(chatId)
    const tippen = setInterval(
      () => ruf(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {}),
      6000
    )

    try {
      const agent = new Agent({
        session: `telegram-${chatId}`,
        emit: (m) => this.emit({ ...m, telegram: chatId }),
      })
      // Der Agent weiß, dass er nicht im Fenster antwortet: gesprochene
      // Antworten vertragen keine Aufzählungen und keine Codeblöcke.
      agent.messages.push({
        role: 'system',
        content: [
          'Diese Unterhaltung läuft über Telegram, oft per Sprachnachricht.',
          'Antworte darum wie am Telefon: höchstens drei Sätze, keine Aufzählungen,',
          'keine Überschriften, keine Codeblöcke, keine Sonderzeichen zum Formatieren.',
          'Sag knapp, was du getan hast und was dabei herauskam.',
        ].join('\n'),
      })

      const antwort = await agent.send(auftrag)
      const text = String(antwort || '').trim() || 'Fertig.'

      // Auf eine Sprachnachricht wird gesprochen geantwortet — das ist der
      // ganze Sinn: es soll sich wie telefonieren anfühlen.
      if (warSprache && c.telegramSprachantwort) {
        const ogg = await zuSprache(text)
        if (ogg) {
          await sprachnachricht(token, chatId, ogg, text.slice(0, 1000))
          return
        }
      }
      for (const stueck of stuecke(text)) {
        await ruf(token, 'sendMessage', { chat_id: chatId, text: stueck })
      }
    } catch (err) {
      await ruf(token, 'sendMessage', { chat_id: chatId, text: `Das ging schief: ${err.message}`.slice(0, 500) }).catch(() => {})
    } finally {
      clearInterval(tippen)
      this.beschaeftigt.delete(chatId)
    }
  }
}
