// Themen: die Knoten, an denen die Notizen zusammenwachsen.
//
// Jede Notiz bekommt zwei bis vier Themen. Für jedes Thema gibt es eine
// eigene Notiz, die alles sammelt, was je damit zu tun hatte. So entsteht
// ein Netz statt eines Haufens einzelner Zettel.
import { chat } from './brain.js'
import { sprachName } from './config.js'

// Wörter, die als Thema nichts taugen
const LEER = new Set([
  'urai', 'claude', 'chatgpt', 'ki', 'ai', 'agent', 'agenten', 'notiz', 'notizen', 'obsidian',
  'datei', 'dateien', 'file', 'files', 'test', 'fehler', 'error', 'server', 'code', 'app', 'apps',
  'nutzer', 'user', 'sitzung', 'session', 'zusammenfassung', 'summary', 'ergebnis', 'result',
  'das', 'der', 'die', 'und', 'the', 'and', 'für', 'for', 'mit', 'with',
])

function sauber(s) {
  return String(s || '')
    .replace(/[[\]#*_`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function taugt(t) {
  const k = sauber(t)
  if (k.length < 3 || k.length > 42) return false
  if (LEER.has(k.toLowerCase())) return false
  if (/^\d+$/.test(k)) return false
  return true
}

/**
 * Ohne Gehirn: was auffällt, ist meist wichtig — Eigennamen, Anführungszeichen,
 * Dateinamen. Grob, aber kostenlos und sofort.
 */
function themenRaten(text) {
  const gefunden = new Set()

  // In Anführungszeichen oder «» steht fast immer ein Titel
  for (const m of text.matchAll(/[„"«»']([^„"«»']{3,40})["'»]/g)) gefunden.add(sauber(m[1]))

  // Zwei bis drei großgeschriebene Wörter hintereinander: Namen, Titel, Orte
  for (const m of text.matchAll(/\b([A-ZÄÖÜ][\wäöüß-]{2,}(?: [A-ZÄÖÜ][\wäöüß-]{2,}){0,2})\b/g)) {
    const k = sauber(m[1])
    if (k.split(' ').length >= 2 || k.length >= 6) gefunden.add(k)
  }

  return [...gefunden].filter(taugt).slice(0, 4)
}

/**
 * Themen einer Notiz bestimmen. Fragt kurz das flinke Gehirn und
 * fällt auf reines Raten zurück, wenn das nicht geht.
 */
export async function themenFinden(text, { max = 3 } = {}) {
  const kurz = String(text || '').slice(0, 2500)
  if (kurz.length < 40) return []

  try {
    const res = await chat({
      messages: [
        {
          role: 'system',
          content:
            `Nenne die ${max} wichtigsten Themen dieses Textes, in ${sprachName()}.\n` +
            'Ein Thema ist eine Sache, über die es später mehr geben wird: ein Projekt,\n' +
            'ein Buch, ein Fach, eine Person, ein Werkzeug, ein Ort.\n' +
            'Ein bis drei Wörter pro Thema. Keine allgemeinen Wörter wie "Aufgabe" oder "Notiz".\n' +
            'Nur die Themen, mit Komma getrennt, sonst nichts.',
        },
        { role: 'user', content: kurz },
      ],
      tools: [],
      flink: true,
      onDelta: () => {},
      signal: AbortSignal.timeout(15000),
    })
    const liste = (res.text || '')
      .split(/[,\n;]/)
      .map(sauber)
      .filter(taugt)
      .slice(0, max)
    if (liste.length) return liste
  } catch {}

  return themenRaten(kurz).slice(0, max)
}
