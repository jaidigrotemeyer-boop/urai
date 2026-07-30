// Der Graph: welche Notiz zeigt auf welche.
// Liest den URAI-Ordner im Vault und macht daraus Knoten und Kanten.
import fs from 'node:fs/promises'
import path from 'node:path'
import { vaultPath } from './obsidian.js'
import { loadConfig } from './config.js'

const ART = {
  Themen: 'thema',
  Sitzungen: 'sitzung',
  Agenten: 'agent',
  Gruppen: 'gruppe',
  Wissen: 'wissen',
  Protokolle: 'protokoll',
}

/**
 * @returns {Promise<{knoten: Array, kanten: Array, stand: string}>}
 */
export async function graphLesen({ maxKnoten } = {}) {
  maxKnoten = maxKnoten || loadConfig().graphMaxKnoten
  const vault = vaultPath()
  if (!vault) return { knoten: [], kanten: [], fehler: 'Kein Obsidian-Vault gefunden.' }

  const wurzel = path.join(vault, loadConfig().obsidianFolder || 'URAI')
  const dateien = []

  async function walk(dir, ordner = '') {
    let ents = []
    try {
      ents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p, ordner || e.name)
      else if (e.name.endsWith('.md')) dateien.push({ p, titel: path.basename(e.name, '.md'), ordner })
    }
  }
  await walk(wurzel)

  // Neueste zuerst, damit bei vielen Notizen das Frische im Graphen landet
  const mitZeit = await Promise.all(
    dateien.map(async (d) => {
      try {
        const st = await fs.stat(d.p)
        return { ...d, zeit: st.mtimeMs }
      } catch {
        return { ...d, zeit: 0 }
      }
    })
  )
  mitZeit.sort((a, b) => b.zeit - a.zeit)
  const genommen = mitZeit.slice(0, maxKnoten)

  const nachTitel = new Map(genommen.map((d) => [d.titel, d]))
  const knoten = []
  const kanten = []

  for (const d of genommen) {
    let text = ''
    try {
      text = await fs.readFile(d.p, 'utf8')
    } catch {}

    const art = ART[d.ordner] || 'notiz'
    const erste = text
      .replace(/^---[\s\S]*?---\n/, '')
      .split('\n')
      .find((l) => l.trim() && !l.startsWith('#'))

    knoten.push({
      id: d.titel,
      art,
      ordner: d.ordner,
      zeit: d.zeit,
      text: (erste || '').slice(0, 140),
      gewicht: 1,
    })

    // [[Verknüpfungen]] herausziehen
    for (const m of text.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
      const ziel = m[1].trim()
      if (ziel === d.titel) continue
      if (!nachTitel.has(ziel)) continue
      kanten.push({ von: d.titel, nach: ziel })
    }
  }

  // Doppelte Kanten zusammenfassen, Knotengröße nach Anzahl Verbindungen
  const gesehen = new Set()
  const sauber = []
  for (const k of kanten) {
    const key = [k.von, k.nach].sort().join('→')
    if (gesehen.has(key)) continue
    gesehen.add(key)
    sauber.push(k)
  }

  const zaehler = new Map()
  for (const k of sauber) {
    zaehler.set(k.von, (zaehler.get(k.von) || 0) + 1)
    zaehler.set(k.nach, (zaehler.get(k.nach) || 0) + 1)
  }
  for (const n of knoten) n.gewicht = 1 + (zaehler.get(n.id) || 0)

  return {
    knoten,
    kanten: sauber,
    gesamt: dateien.length,
    stand: new Date().toISOString(),
  }
}
