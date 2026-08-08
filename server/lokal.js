// Lokales Gehirn: Kleinkram auf dem eigenen Rechner erledigen statt in der Cloud.
//
// Der Sinn ist nicht Geiz, sondern Unabhängigkeit: Zusammenfassungen, Live-Notizen
// und Ja/Nein-Fragen sind Fleißarbeit. Wenn die daheim laufen, bleibt das
// Gratis-Kontingent der großen Gehirne für das, was wirklich Denken braucht.
//
// Das Problem dabei: ein 8-GB-Mac hat keine Reserven. Zwei gleichzeitige Läufe
// eines 3B-Modells, und das ganze System fängt an zu swappen — dann ruckelt
// alles, auch das, woran der Nutzer gerade selbst arbeitet. Ein Assistent, der
// den Rechner lahmlegt, ist schlimmer als keiner.
//
// Darum zwei Bremsen ineinander:
//   1. Das BUDGET (2 bis 100 GB, der Schieber) sagt, wie viel Speicher URAI
//      sich fürs lokale Denken nehmen darf. Daraus ergibt sich, wie viele
//      Läufe gleichzeitig passen — Budget geteilt durch Modellgröße.
//   2. Der echte RAM-DRUCK überschreibt das jederzeit nach unten.
// Kleines Budget heißt: einer nach dem anderen, die Schlange wird lang, aber
// nichts überlastet. Großes Budget heißt: mehrere gleichzeitig, solange der
// Speicher mitspielt. Wird es eng, drosselt er sich von selbst — der Nutzer
// hat immer Vorrang vor dem Assistenten.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import { loadConfig } from './config.js'

const pexec = promisify(execFile)

/**
 * Was darf lokal laufen, abhängig vom Budget? Je mehr Speicher der Nutzer
 * freigibt, desto mehr Arten Arbeit wandern vom Cloud-Gehirn nach Hause.
 *
 * Die Reihenfolge ist nicht beliebig: oben steht, was ein kleines Modell
 * wirklich gut kann (kurze Notizen), unten das, woran es zu scheitern
 * beginnt (Werkzeuge auswählen). So bekommt man bei kleinem Budget zwar
 * wenig, aber Brauchbares — statt viel Unbrauchbares.
 */
const ARTEN_AB_GB = [
  { ab: 2, art: 'notiz', was: 'Live-Notizen' },
  { ab: 4, art: 'zusammenfassung', was: 'Zusammenfassungen' },
  { ab: 6, art: 'jaNein', was: 'Ja/Nein-Entscheidungen' },
  { ab: 10, art: 'briefing', was: 'Tagesbriefing' },
  { ab: 16, art: 'werkzeugwahl', was: 'Werkzeug-Auswahl' },
]

export const BUDGET_MIN = 2
export const BUDGET_MAX = 100

/** Das eingestellte Budget in GB. 0 heißt aus. */
function budgetLesen() {
  const roh = Number(loadConfig().lokalBudgetGb)
  if (!Number.isFinite(roh) || roh <= 0) return 0
  return Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, Math.round(roh)))
}

/** Wie groß ist das eingestellte Modell, in GB? Zum Rechnen, nicht zum Anzeigen. */
let modellGroesseCache = new Map()
async function modellGroesseGb() {
  const name = loadConfig().lokalModell || 'llama3.2:3b'
  if (modellGroesseCache.has(name)) return modellGroesseCache.get(name)
  const gefunden = (await ollamaModelle()).find((m) => m.name === name)
  // Ohne Fund lieber großzügig schätzen: zu klein geschätzt hieße, zu viele
  // Läufe gleichzeitig zu starten — genau das, was den Rechner umbringt.
  const gb = gefunden ? gefunden.groesse / 1073741824 : 4
  modellGroesseCache.set(name, gb)
  return gb
}

/** Welche Arten Arbeit deckt das aktuelle Budget ab? */
export function artenFuerBudget(gb = budgetLesen()) {
  return ARTEN_AB_GB.filter((a) => gb >= a.ab)
}

/**
 * Wie viel Speicher ist frei, in Prozent?
 *
 * `memory_pressure` ist die ehrlichste Quelle auf macOS: es zählt nicht bloß
 * freie Seiten, sondern was das System tatsächlich noch hergeben kann. Freie
 * Seiten allein täuschen, weil macOS Speicher absichtlich als Cache belegt —
 * danach sähe ein gesunder Mac immer "voll" aus.
 *
 * @returns {Promise<number|null>} 0–100, oder null wenn nicht messbar
 */
export async function ramFrei() {
  if (process.platform !== 'darwin') {
    // Auf anderen Systemen der grobe Weg — besser als gar keine Bremse
    const frei = os.freemem() / os.totalmem()
    return Math.round(frei * 100)
  }
  try {
    const { stdout } = await pexec('/usr/bin/memory_pressure', [], { timeout: 4000 })
    const treffer = stdout.match(/free percentage:\s*(\d+)%/i)
    return treffer ? Number(treffer[1]) : null
  } catch {
    return null
  }
}

/**
 * Wie viele Läufe sind JETZT vertretbar? Das Budget sagt das Maximum, der
 * freie Speicher zieht es nach unten.
 *
 * Die Schwellen sind bewusst vorsichtig: unter etwa 15 % frei fängt macOS an
 * zu swappen, und ab da merkt der Nutzer jede weitere Last sofort an der Maus.
 * Lieber eine längere Schlange als ein hakeliger Rechner.
 */
export async function erlaubteGleichzeitig() {
  const budget = budgetLesen()
  if (!budget) return 0

  // Wie viele Läufe passen rechnerisch ins Budget? Ein Modell belegt grob
  // seine Dateigröße; zwei gleichzeitige Läufe belegen sie zweimal.
  const proLauf = await modellGroesseGb()
  const ausBudget = Math.max(1, Math.floor(budget / Math.max(0.5, proLauf)))
  const deckel = Math.min(8, ausBudget) // mehr als acht bringt nichts, kostet nur

  const frei = await ramFrei()
  if (frei === null) return 1 // Nicht messbar → vorsichtig
  if (frei < 12) return 0 // Kritisch: alles in die Cloud, der Nutzer hat Vorrang
  if (frei < 20) return 1
  if (frei < 35) return Math.min(2, deckel)
  return deckel
}

/** Darf diese Art Arbeit beim eingestellten Budget lokal laufen? */
export function darfLokal(art) {
  return artenFuerBudget().some((a) => a.art === art)
}

/**
 * Die Schlange. Sie hält so viele Läufe gleichzeitig, wie gerade vertretbar
 * sind — und misst vor JEDEM Start neu. Ein Lauf, der vor zehn Minuten noch
 * gepasst hätte, ist bei vollem Speicher heute keine gute Idee mehr.
 */
class Schlange {
  constructor() {
    this.wartend = []
    this.laufend = 0
    this.gesamt = 0 // wie viel schon lokal erledigt wurde, fürs Anzeigen
    this.abgelehnt = 0 // wie oft der Speicher nein gesagt hat
  }

  stand() {
    return { wartend: this.wartend.length, laufend: this.laufend, gesamt: this.gesamt, abgelehnt: this.abgelehnt }
  }

  /**
   * Arbeit einreihen. Löst auf, sobald sie dran war.
   * @param {() => Promise<any>} arbeit
   * @returns {Promise<any>}
   */
  einreihen(arbeit) {
    return new Promise((fertig, daneben) => {
      this.wartend.push({ arbeit, fertig, daneben })
      this.weiter()
    })
  }

  async weiter() {
    if (!this.wartend.length) return

    const platz = await erlaubteGleichzeitig()
    if (platz === 0) {
      // Speicher am Limit: die Wartenden nicht ewig hinhalten, sondern
      // ehrlich absagen. Der Aufrufer weicht dann in die Cloud aus —
      // das ist besser, als den Nutzer minutenlang warten zu lassen.
      this.abgelehnt++
      const abgewiesen = this.wartend.splice(0)
      for (const w of abgewiesen) w.daneben(new Error('Zu wenig freier Speicher — läuft in der Cloud.'))
      return
    }
    if (this.laufend >= platz) return

    const naechste = this.wartend.shift()
    if (!naechste) return
    this.laufend++
    try {
      naechste.fertig(await naechste.arbeit())
      this.gesamt++
    } catch (err) {
      naechste.daneben(err)
    } finally {
      this.laufend--
      this.weiter() // Platz frei — den nächsten holen
    }
  }
}

export const schlange = new Schlange()

/**
 * Läuft überhaupt ein lokales Gehirn? Ollama meldet sich auf 11434.
 * Wird gecacht: bei jedem Aufruf nachzufragen kostet mehr als es bringt.
 */
let ollamaBekannt = null
let ollamaGeprueft = 0

export async function ollamaDa() {
  if (ollamaBekannt !== null && Date.now() - ollamaGeprueft < 60_000) return ollamaBekannt
  try {
    const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2500) })
    const j = await r.json()
    ollamaBekannt = Array.isArray(j.models) && j.models.length > 0
  } catch {
    ollamaBekannt = false
  }
  ollamaGeprueft = Date.now()
  return ollamaBekannt
}

/** Welche Modelle liegen lokal bereit? Für die Auswahl in den Einstellungen. */
export function modellCacheLeeren() {
  modellGroesseCache = new Map()
}

export async function ollamaModelle() {
  try {
    const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
    const j = await r.json()
    return (j.models || []).map((m) => ({ name: m.name, groesse: m.size }))
  } catch {
    return []
  }
}

/**
 * Einen Auftrag lokal erledigen — wenn die Stufe es erlaubt, Ollama läuft und
 * der Speicher mitspielt. Sonst wirft es, und der Aufrufer nimmt die Cloud.
 *
 * Bewusst so herum: lokal ist der Versuch, die Cloud der verlässliche Rückfall.
 * Andersherum würde ein hängendes lokales Modell den ganzen Ablauf blockieren.
 *
 * @param {string} art  notiz | zusammenfassung | jaNein | briefing | werkzeugwahl
 * @param {Array}  messages
 * @returns {Promise<string>}
 */
export async function lokalFragen(art, messages, { signal } = {}) {
  if (!darfLokal(art)) throw new Error(`"${art}" ist auf dieser Stufe nicht für lokal vorgesehen.`)
  if (!(await ollamaDa())) throw new Error('Kein lokales Modell erreichbar (Ollama läuft nicht).')

  const modell = loadConfig().lokalModell || 'llama3.2:3b'
  return schlange.einreihen(async () => {
    const r = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: modell, messages, stream: false }),
      signal: signal || AbortSignal.timeout(120_000),
    })
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`)
    const j = await r.json()
    return String(j.message?.content || '')
  })
}

/** Alles auf einen Blick — für den Regler in den Einstellungen. */
export async function stand() {
  const budget = budgetLesen()
  const [frei, platz, da, proLauf] = await Promise.all([
    ramFrei(),
    erlaubteGleichzeitig(),
    ollamaDa(),
    modellGroesseGb(),
  ])
  const arten = artenFuerBudget(budget)
  const rechnerisch = budget ? Math.min(8, Math.max(1, Math.floor(budget / Math.max(0.5, proLauf)))) : 0
  return {
    budgetGb: budget,
    min: BUDGET_MIN,
    max: BUDGET_MAX,
    arten: arten.map((a) => a.art),
    artenText: arten.map((a) => a.was),
    naechsteStufe: ARTEN_AB_GB.find((a) => budget < a.ab) || null,
    ramFrei: frei,
    ramGesamt: os.totalmem(),
    modellGb: Number(proLauf.toFixed(1)),
    gleichzeitigMoeglich: platz,
    gleichzeitigRechnerisch: rechnerisch,
    gedrosselt: budget > 0 && platz < rechnerisch,
    ollama: da,
    modell: loadConfig().lokalModell || 'llama3.2:3b',
    ...schlange.stand(),
  }
}
