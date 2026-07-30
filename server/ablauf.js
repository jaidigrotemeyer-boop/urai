// Abläufe: wiederkehrende Arbeit einmal zusammenstecken, dann immer wieder laufen lassen.
//
// Ein Ablauf ist eine reine JSON-Datei aus Bausteinen und Kanten. Die Kanten bestimmen die
// REIHENFOLGE (die zieht der Nutzer mit der Maus), die Platzhalter {{…}} bestimmen die DATEN.
// Damit die gezeichnete Fassung nie von der echten abweicht, erzeugt jeder Platzhalter zusätzlich
// eine implizite Kante — die Oberfläche malt sie gestrichelt. So kann kein Baustein Daten von
// jemandem ziehen, der erst nach ihm läuft.
//
// Ausgeführt wird in topologischen Wellen: was in einer Welle liegt, läuft gleichzeitig —
// außer schreibenden und Mac-steuernden Bausteinen, die bleiben einzeln und in Reihenfolge.
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, loadConfig } from './config.js'
import { chat } from './brain.js'
import { writeNote } from './obsidian.js'

// tools/index.js lädt UNS (…ablaufTools) und agent.js lädt tools/index.js.
// Würden wir eines von beiden statisch zurückholen, stünde `...ablaufTools` dort im toten
// Winkel (TDZ), sobald irgendwer ablauf.js vor tools/index.js importiert — und der Server
// stürbe beim Start mit "Cannot access 'ablaufTools' before initialization".
// Darum kommt alles, was zurückzeigt, verzögert — genau wie crew.js es mit Agent macht.
let RUECK = null
async function rueckLaden() {
  if (!RUECK) {
    const [werkzeuge, agent] = await Promise.all([import('./tools/index.js'), import('./agent.js')])
    RUECK = { TOOL_MAP: werkzeuge.TOOL_MAP, coerceArgs: agent.coerceArgs }
  }
  return RUECK
}
// Einmal anstoßen, sobald der Kreis geschlossen ist — damit pruefen() (synchron, kommt aus
// der REST-Route) die Werkzeugliste kennt, ohne darauf warten zu müssen.
queueMicrotask(() => rueckLaden().catch(() => {}))

/** Werkzeug nachschlagen, ohne statisch auf tools/index.js zu zeigen. */
function werkzeugFinden(name) {
  return RUECK?.TOOL_MAP?.get(name) ?? null
}

export const ABLAUF_DIR = path.join(DATA_DIR, 'ablaeufe')
const LAUF_DIR = path.join(ABLAUF_DIR, '.laeufe')

export const ARTEN = ['eingabe', 'text', 'werkzeug', 'agent', 'gruppe', 'bedingung', 'ausgabe']

// Diese Werkzeuge verändern etwas oder steuern den Mac: nie nebeneinander, immer der Reihe nach.
// ablauf_ steht mit drin, damit ein geschachtelter Ablauf nie nebenläufig startet.
const HEIKEL = /^(fs_write|fs_edit|shell_run|mac_|self_|ablauf_)/

// Rollennamen nur zum Prüfen — crew.js wird bewusst nicht statisch geladen (Import-Kreis).
const ROLLEN_NAMEN = ['rechercheur', 'programmierer', 'bildschirm', 'schreiber', 'pruefer', 'allrounder']

const SLUG = /^[a-z0-9][a-z0-9_-]{1,48}$/
const MAX_WERT = 8000 // was in werte[] landet
const MAX_EREIGNIS = 2000 // was als Ereignis an die Oberfläche geht
const VORGABE_GRENZEN = { maxBausteine: 60, timeoutMs: 600_000, maxTiefe: 2 }
const VORGABE_SCHRITT_MS = 120_000

/** Ein Fehler mit Code, damit die Oberfläche ihn übersetzen kann statt Text zu raten. */
export class AblaufFehler extends Error {
  constructor(code, text, baustein = null) {
    super(text)
    this.name = 'AblaufFehler'
    this.code = code
    this.baustein = baustein
  }
}
// Codes: ZYKLUS · UNBEKANNT · KEIN_ABLAUF · UNGUELTIG · PFLICHT_FEHLT · WERKZEUG_FEHLT
//        FREIGABE_FEHLT · ZEIT_ABGELAUFEN · GESTOPPT · ZU_TIEF · WERKZEUG_FEHLER · AGENTEN_GRENZE

/** Langen Text stutzen — Kopf und Fuß bleiben, die Mitte fliegt raus (wie in agent.js). */
function kuerzen(text, max) {
  const t = String(text ?? '')
  if (t.length <= max) return t
  const kopf = Math.floor(max * 0.65)
  const fuss = max - kopf
  return `${t.slice(0, kopf)}\n\n… [${t.length - max} Zeichen ausgelassen] …\n\n${t.slice(-fuss)}`
}

/** Ohne harte Slug-Prüfung kommt man mit '../..' aus dem Ordner heraus — und liest die config.json. */
function slugPruefen(id) {
  const s = String(id ?? '')
  if (!SLUG.test(s)) {
    throw new AblaufFehler('UNGUELTIG', `Ungültige Ablauf-Kennung "${s}". Erlaubt: a-z, 0-9, _ und -, 2 bis 49 Zeichen.`)
  }
  return s
}

function jetztStempel() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return {
    datum: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    jetzt: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
    iso: d.toISOString(),
  }
}

// ═════════════════════════════════════════════════════════════════════
// PLATZHALTER
// ═════════════════════════════════════════════════════════════════════

// \{{ bleibt Text. Sonst: {{ziel.pfad.0 | Ersatztext}}
const PLATZ = /(\\?)\{\{\s*([^{}|]*?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g

/** Alle {{…}} eines Textes. Auch für die Oberfläche, um sie einzufärben. */
export function platzhalter(text) {
  const s = String(text ?? '')
  const raus = []
  PLATZ.lastIndex = 0
  let m
  while ((m = PLATZ.exec(s))) {
    if (m[1]) continue // \{{ … }} ist gewollt Text
    const teile = String(m[2] || '').split('.').map((t) => t.trim()).filter(Boolean)
    if (!teile.length) continue
    raus.push({ ganz: m[0], ziel: teile[0], pfad: teile.slice(1), ersatz: m[3] ?? null })
  }
  return raus
}

const EINGEBAUT = new Set(['jetzt', 'datum', 'ablauf'])

/** merker → Baustein-Kennung. Ein Alias darf nie eine echte Kennung überschreiben. */
function aliasKarte(ablauf) {
  const karte = new Map()
  const echte = new Set((ablauf.bausteine || []).map((b) => b?.id).filter(Boolean))
  for (const b of ablauf.bausteine || []) {
    if (b?.merker && !echte.has(b.merker) && !karte.has(b.merker)) karte.set(b.merker, b.id)
  }
  return karte
}

/**
 * Wohin zeigt ein Platzhalter? Liefert die Baustein-Kennung und den Rest-Pfad.
 * {{eingabe.thema}} findet den eingabe-Baustein mit schluessel 'thema' —
 * nur so entsteht die implizite Kante auf den richtigen Baustein.
 */
function zielFinden(ziel, pfad, ablauf, aliase) {
  if (EINGEBAUT.has(ziel)) return null
  const bausteine = ablauf.bausteine || []

  // 'eingabe' zuerst: bei {{eingabe.thema}} ist 'thema' der schluessel, KEIN JSON-Pfad.
  // Andersherum landet man beim Baustein mit der id 'eingabe' und liest 'thema'
  // als Pfad in einen reinen Text hinein — heraus kommt still und leise nichts.
  if (ziel === 'eingabe') {
    const eingaben = bausteine.filter((b) => b?.art === 'eingabe')
    if (eingaben.length) {
      if (pfad.length) {
        const treffer = eingaben.find((b) => b?.einstellungen?.schluessel === pfad[0])
        if (treffer) return { id: treffer.id, restPfad: pfad.slice(1) }
        return null // Wert kommt von außen, kein Baustein — also auch keine Kante
      }
      if (eingaben.length === 1) return { id: eingaben[0].id, restPfad: [] }
    }
  }

  if (aliase.has(ziel)) return { id: aliase.get(ziel), restPfad: pfad }
  if (bausteine.some((b) => b?.id === ziel)) return { id: ziel, restPfad: pfad }
  return null
}

/** Pfad in geparstes JSON hineinlaufen. Nicht lesbar → leer, statt 'undefined' im Bericht. */
function pfadLesen(roh, pfad) {
  let v = roh
  for (const teil of pfad) {
    if (v == null) return ''
    v = Array.isArray(v) && /^\d+$/.test(teil) ? v[Number(teil)] : v[teil]
  }
  if (v == null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** Einen einzelnen Platzhalter zu Text machen. Unbekanntes wird '' — niemals 'undefined'. */
function einsetzen({ ziel, pfad, ersatz }, k) {
  const stempel = k.stempel || jetztStempel()
  let text = ''

  if (ziel === 'jetzt') text = stempel.jetzt
  else if (ziel === 'datum') text = stempel.datum
  else if (ziel === 'ablauf') text = String(k.ablauf?.name || k.ablauf?.id || '')
  else if (ziel === 'eingabe' && pfad.length && !zielFinden(ziel, pfad, k.ablauf || { bausteine: [] }, k.aliase)) {
    // Eingabe, die von außen kommt und keinen eigenen Baustein hat
    const roh = k.eingaben?.[pfad[0]]
    text = pfad.length > 1 ? pfadLesen(roh, pfad.slice(1)) : roh == null ? '' : String(roh)
  } else {
    const treffer = zielFinden(ziel, pfad, k.ablauf || { bausteine: [] }, k.aliase)
    if (treffer) {
      const wert = k.werte?.[treffer.id]
      // Übersprungen ist der Normalfall hinter jeder Bedingung — das ist kein Fehler, nur leer.
      if (wert && !wert.uebersprungen) {
        text = treffer.restPfad.length ? pfadLesen(wert.roh, treffer.restPfad) : wert.text
      }
    } else if (ziel === 'eingabe' && !pfad.length) {
      const werte = Object.values(k.eingaben || {})
      if (werte.length === 1) text = werte[0] == null ? '' : String(werte[0])
    }
  }

  if (!String(text).length && ersatz != null) return ersatz
  return String(text)
}

/**
 * Platzhalter füllen. Nur Strings, rekursiv durch Objekte und Listen —
 * Zahlen und Booleans bleiben unangetastet, sonst zerbricht coerceArgs daran.
 * @param {any} vorlage
 * @param {{werte:object, eingaben:object, ablauf:object, lauf?:object, aliase?:Map}} kontext
 */
export function fuellen(vorlage, kontext) {
  const k = kontext.aliase ? kontext : { ...kontext, aliase: aliasKarte(kontext.ablauf || { bausteine: [] }) }
  if (typeof vorlage === 'string') {
    PLATZ.lastIndex = 0
    return vorlage.replace(PLATZ, (ganz, schraeg, innen, ersatz) => {
      if (schraeg) return ganz.slice(1) // \{{x}} → {{x}}
      const teile = String(innen || '').split('.').map((t) => t.trim()).filter(Boolean)
      if (!teile.length) return ganz
      return einsetzen({ ziel: teile[0], pfad: teile.slice(1), ersatz: ersatz ?? null }, k)
    })
  }
  if (Array.isArray(vorlage)) return vorlage.map((v) => fuellen(v, k))
  if (vorlage && typeof vorlage === 'object') {
    const out = {}
    for (const [schluessel, wert] of Object.entries(vorlage)) out[schluessel] = fuellen(wert, k)
    return out
  }
  return vorlage
}

/** Alle Strings eines Bausteins einsammeln, damit wir seine Platzhalter finden. */
function stringsSammeln(wert, raus = []) {
  if (typeof wert === 'string') raus.push(wert)
  else if (Array.isArray(wert)) for (const v of wert) stringsSammeln(v, raus)
  else if (wert && typeof wert === 'object') for (const v of Object.values(wert)) stringsSammeln(v, raus)
  return raus
}

// ═════════════════════════════════════════════════════════════════════
// KANTEN UND REIHENFOLGE
// ═════════════════════════════════════════════════════════════════════

/**
 * Explizite Kanten plus die aus Platzhaltern abgeleiteten, doppelte zusammengefasst.
 * Gezeichnete Kanten gewinnen: sie dürfen einen zweig tragen, die impliziten nie.
 */
export function kantenAufloesen(ablauf) {
  const bausteine = (ablauf?.bausteine || []).filter((b) => b && b.id)
  const bekannt = new Set(bausteine.map((b) => b.id))
  const aliase = aliasKarte({ bausteine })
  const karte = new Map()
  const schluessel = (k) => `${k.von}→${k.nach}→${k.zweig || ''}`

  for (const k of ablauf?.kanten || []) {
    if (!k || !bekannt.has(k.von) || !bekannt.has(k.nach) || k.von === k.nach) continue
    const kante = { von: k.von, nach: k.nach, ...(k.zweig ? { zweig: k.zweig } : {}) }
    karte.set(schluessel(kante), kante)
  }

  for (const b of bausteine) {
    for (const s of stringsSammeln(b.einstellungen)) {
      for (const p of platzhalter(s)) {
        const treffer = zielFinden(p.ziel, p.pfad, { bausteine }, aliase)
        if (!treffer || treffer.id === b.id || !bekannt.has(treffer.id)) continue
        const kante = { von: treffer.id, nach: b.id, implizit: true }
        // Eine gezeichnete Kante (auch mit zweig) deckt die implizite ab
        const schonDa = [...karte.values()].some((x) => x.von === kante.von && x.nach === kante.nach)
        if (!schonDa) karte.set(schluessel(kante), kante)
      }
    }
  }
  return [...karte.values()]
}

/**
 * Kahn-Schichten. Was in einer Welle liegt, hängt voneinander nicht ab.
 * @returns {{wellen: string[][], zyklus: string[]|null}}
 */
export function reihenfolge(ablauf) {
  const bausteine = (ablauf?.bausteine || []).filter((b) => b && b.id)
  const ids = bausteine.map((b) => b.id)
  const kanten = kantenAufloesen(ablauf)

  const grad = new Map(ids.map((id) => [id, 0]))
  const raus = new Map(ids.map((id) => [id, []]))
  for (const k of kanten) {
    grad.set(k.nach, (grad.get(k.nach) || 0) + 1)
    raus.get(k.von).push(k.nach)
  }

  const offen = new Set(ids)
  const wellen = []
  while (offen.size) {
    // Reihenfolge der Datei behalten — sonst springt die Zeichnung bei jedem Laden herum
    const welle = ids.filter((id) => offen.has(id) && (grad.get(id) || 0) === 0)
    if (!welle.length) return { wellen, zyklus: [...offen] }
    wellen.push(welle)
    for (const id of welle) offen.delete(id)
    for (const id of welle) for (const nach of raus.get(id)) grad.set(nach, grad.get(nach) - 1)
  }
  return { wellen, zyklus: null }
}

// ═════════════════════════════════════════════════════════════════════
// PRÜFEN
// ═════════════════════════════════════════════════════════════════════

/**
 * Prüft, OHNE zu speichern. Die Oberfläche ruft das bei jedem Zeichnen —
 * so sieht der Nutzer den Zyklus schon, während er die Linie zieht.
 * Jeder Fehler nennt seinen Baustein, damit ein kleines Modell gezielt nachbessern kann
 * statt den ganzen Ablauf neu zu raten.
 * @returns {{ok:boolean, fehler:Array, warnungen:Array, wellen:string[][]}}
 */
export function pruefen(ablauf) {
  const fehler = []
  const warnungen = []
  const meckern = (code, baustein, text) => fehler.push({ code, baustein, text })
  const warnen = (code, baustein, text) => warnungen.push({ code, baustein, text })

  if (!ablauf || typeof ablauf !== 'object' || Array.isArray(ablauf)) {
    return { ok: false, fehler: [{ code: 'UNGUELTIG', baustein: null, text: 'Der Ablauf ist kein Objekt.' }], warnungen, wellen: [] }
  }

  try {
    slugPruefen(ablauf.id)
  } catch (err) {
    meckern('UNGUELTIG', null, err.message)
  }
  if (!String(ablauf.name || '').trim()) meckern('UNGUELTIG', null, 'Der Ablauf braucht einen Namen.')

  const grenzen = { ...VORGABE_GRENZEN, ...(ablauf.grenzen || {}) }
  const roh = Array.isArray(ablauf.bausteine) ? ablauf.bausteine : []
  if (!Array.isArray(ablauf.bausteine)) meckern('UNGUELTIG', null, 'bausteine muss eine Liste sein.')
  if (!roh.length) meckern('UNGUELTIG', null, 'Ein Ablauf ohne Bausteine tut nichts.')
  if (roh.length > grenzen.maxBausteine) {
    meckern('UNGUELTIG', null, `${roh.length} Bausteine — erlaubt sind ${grenzen.maxBausteine}.`)
  }

  const gesehen = new Set()
  for (const [i, b] of roh.entries()) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      meckern('UNGUELTIG', null, `Baustein ${i + 1} ist kein Objekt (sondern ${typeof b}).`)
      continue
    }
    if (!b.id || typeof b.id !== 'string') {
      meckern('UNGUELTIG', null, `Baustein ${i + 1} hat keine id. Jeder Baustein braucht eine eigene, z.B. "schritt${i + 1}".`)
      continue
    }
    if (gesehen.has(b.id)) meckern('UNGUELTIG', b.id, `Die id "${b.id}" kommt mehrfach vor.`)
    gesehen.add(b.id)

    if (!ARTEN.includes(b.art)) {
      meckern('UNBEKANNT', b.id, `Art "${b.art}" gibt es nicht. Erlaubt: ${ARTEN.join(', ')}.`)
      continue
    }
    const e = b.einstellungen && typeof b.einstellungen === 'object' ? b.einstellungen : null
    if (!e) {
      meckern('UNGUELTIG', b.id, `"${b.id}" braucht ein Objekt "einstellungen".`)
      continue
    }

    if (b.art === 'eingabe') {
      if (!e.schluessel) meckern('UNGUELTIG', b.id, 'Eine Eingabe braucht einen "schluessel", z.B. "thema".')
      if (e.typ && !['text', 'zahl', 'ja_nein', 'auswahl'].includes(e.typ)) {
        warnen('UNBEKANNT', b.id, `Typ "${e.typ}" ist unbekannt — wird als Text behandelt.`)
      }
      if (e.typ === 'auswahl' && !Array.isArray(e.optionen)) {
        meckern('UNGUELTIG', b.id, 'Typ "auswahl" braucht eine Liste "optionen".')
      }
    }
    if (b.art === 'text' && typeof e.vorlage !== 'string') meckern('UNGUELTIG', b.id, 'Ein Text-Baustein braucht "vorlage".')
    if (b.art === 'werkzeug') {
      // Ist die Werkzeugliste noch nicht da (nur im allerersten Augenblick nach dem Start),
      // wird nicht geraten — laufWerkzeug wirft dann WERKZEUG_FEHLT.
      if (!e.werkzeug) meckern('UNGUELTIG', b.id, 'Ein Werkzeug-Baustein braucht "werkzeug".')
      else if (RUECK && !werkzeugFinden(e.werkzeug)) meckern('WERKZEUG_FEHLT', b.id, `Werkzeug "${e.werkzeug}" gibt es nicht.`)
      if (e.argumente != null && (typeof e.argumente !== 'object' || Array.isArray(e.argumente))) {
        meckern('UNGUELTIG', b.id, '"argumente" muss ein Objekt sein.')
      }
    }
    if (b.art === 'agent') {
      if (!String(e.auftrag || '').trim()) meckern('UNGUELTIG', b.id, 'Ein Agent braucht einen "auftrag".')
      if (e.rolle && !ROLLEN_NAMEN.includes(e.rolle)) {
        warnen('UNBEKANNT', b.id, `Rolle "${e.rolle}" ist unbekannt — es wird "allrounder" genommen.`)
      }
    }
    if (b.art === 'gruppe') {
      if (!Array.isArray(e.mitglieder) || !e.mitglieder.length) {
        meckern('UNGUELTIG', b.id, 'Eine Gruppe braucht "mitglieder" mit je name, rolle und auftrag.')
      } else {
        for (const [j, m] of e.mitglieder.entries()) {
          if (!m || typeof m !== 'object' || !String(m.auftrag || '').trim()) {
            meckern('UNGUELTIG', b.id, `Mitglied ${j + 1} braucht einen "auftrag".`)
          }
        }
      }
    }
    if (b.art === 'bedingung') {
      if (e.pruefung === 'gehirn') {
        if (!String(e.frage || '').trim()) meckern('UNGUELTIG', b.id, 'Eine Gehirn-Bedingung braucht eine "frage".')
      } else if (!e.pruefung || e.pruefung === 'vergleich') {
        if (!VERGLEICHE[e.vergleich]) {
          meckern('UNGUELTIG', b.id, `Vergleich "${e.vergleich}" gibt es nicht. Erlaubt: ${Object.keys(VERGLEICHE).join(', ')}.`)
        }
      } else {
        meckern('UNBEKANNT', b.id, `Prüfung "${e.pruefung}" gibt es nicht. Erlaubt: vergleich, gehirn.`)
      }
    }
    if (b.art === 'ausgabe') {
      if (typeof e.vorlage !== 'string') meckern('UNGUELTIG', b.id, 'Eine Ausgabe braucht "vorlage".')
      const ziel = e.ziel || 'antwort'
      if (!['antwort', 'obsidian', 'datei'].includes(ziel)) {
        meckern('UNBEKANNT', b.id, `Ziel "${ziel}" gibt es nicht. Erlaubt: antwort, obsidian, datei.`)
      }
      if (ziel === 'datei' && !e.pfad) meckern('UNGUELTIG', b.id, 'Ziel "datei" braucht einen "pfad".')
    }

    if (b.beiFehler && !['stoppen', 'weiter', 'wiederholen'].includes(b.beiFehler)) {
      warnen('UNBEKANNT', b.id, `beiFehler "${b.beiFehler}" ist unbekannt — es wird gestoppt.`)
    }
  }

  // Kanten
  const bekannt = new Set(roh.filter((b) => b?.id).map((b) => b.id))
  const bedingungen = new Set(roh.filter((b) => b?.art === 'bedingung').map((b) => b.id))
  if (ablauf.kanten != null && !Array.isArray(ablauf.kanten)) meckern('UNGUELTIG', null, 'kanten muss eine Liste sein.')
  for (const [i, k] of (Array.isArray(ablauf.kanten) ? ablauf.kanten : []).entries()) {
    if (!k || typeof k !== 'object') {
      meckern('UNGUELTIG', null, `Kante ${i + 1} ist kein Objekt.`)
      continue
    }
    if (!bekannt.has(k.von)) meckern('UNGUELTIG', k.von || null, `Kante ${i + 1}: "${k.von}" gibt es nicht.`)
    if (!bekannt.has(k.nach)) meckern('UNGUELTIG', k.nach || null, `Kante ${i + 1}: "${k.nach}" gibt es nicht.`)
    if (k.von && k.von === k.nach) meckern('ZYKLUS', k.von, `"${k.von}" zeigt auf sich selbst.`)
    if (k.zweig) {
      if (!['ja', 'nein'].includes(k.zweig)) meckern('UNGUELTIG', k.von || null, `Zweig "${k.zweig}" gibt es nicht — nur ja oder nein.`)
      else if (!bedingungen.has(k.von)) meckern('UNGUELTIG', k.von || null, `Ein Zweig geht nur von einer Bedingung aus, "${k.von}" ist keine.`)
    }
  }

  // Platzhalter, die ins Leere zeigen: kein Fehler (vielleicht kommt der Wert von außen), aber verdächtig
  const aliase = aliasKarte({ bausteine: roh })
  for (const b of roh) {
    if (!b?.id || !b.einstellungen) continue
    for (const s of stringsSammeln(b.einstellungen)) {
      for (const p of platzhalter(s)) {
        if (EINGEBAUT.has(p.ziel)) continue
        if (zielFinden(p.ziel, p.pfad, { bausteine: roh }, aliase)) continue
        if (p.ziel === 'eingabe') continue // Wert darf von außen kommen
        warnen('UNBEKANNT', b.id, `${p.ganz} zeigt auf "${p.ziel}" — den gibt es nicht.`)
      }
    }
  }

  // Zyklus über die AUFGELÖSTEN Kanten suchen. Sonst sucht der Nutzer minutenlang
  // eine Linie, die es gar nicht gibt — weil der Kreis aus einem Platzhalter kommt.
  const nurGueltig = { bausteine: roh.filter((b) => b?.id && ARTEN.includes(b.art)), kanten: ablauf.kanten }
  const ordnung = reihenfolge(nurGueltig)
  const wellen = ordnung.wellen
  if (ordnung.zyklus) {
    const drin = new Set(ordnung.zyklus)
    const schuldig = kantenAufloesen(nurGueltig)
      .filter((kante) => drin.has(kante.von) && drin.has(kante.nach))
      .map((kante) => `  ${kante.von} → ${kante.nach}${kante.implizit ? ' (aus einem Platzhalter, gestrichelt gezeichnet)' : ' (von dir gezogen)'}`)
    meckern(
      'ZYKLUS',
      ordnung.zyklus[0],
      `Kreis: ${ordnung.zyklus.join(', ')} warten aufeinander und kommen nie dran.\n${schuldig.join('\n')}`
    )
  }

  return { ok: fehler.length === 0, fehler, warnungen, wellen }
}

// ═════════════════════════════════════════════════════════════════════
// ABLEGEN UND HOLEN
// ═════════════════════════════════════════════════════════════════════

function dateiVon(id) {
  return path.join(ABLAUF_DIR, `${slugPruefen(id)}.json`)
}

/** @returns {Promise<Array<{id,name,beschreibung,bausteine:number,geaendert:string}>>} */
export async function ablaufListe() {
  let namen = []
  try {
    namen = await fs.readdir(ABLAUF_DIR)
  } catch {
    return []
  }
  const raus = []
  for (const n of namen) {
    if (n.startsWith('.') || !n.endsWith('.json')) continue
    try {
      const a = JSON.parse(await fs.readFile(path.join(ABLAUF_DIR, n), 'utf8'))
      raus.push({
        id: a.id || path.basename(n, '.json'),
        name: a.name || a.id,
        beschreibung: a.beschreibung || '',
        bausteine: (a.bausteine || []).length,
        geaendert: a.geaendert || a.erstellt || null,
      })
    } catch {} // kaputte Datei überspringen statt die ganze Liste zu verlieren
  }
  return raus.sort((a, b) => String(b.geaendert || '').localeCompare(String(a.geaendert || '')))
}

/** @returns {Promise<object>} wirft KEIN_ABLAUF */
export async function ablaufLesen(id) {
  const datei = dateiVon(id)
  let text
  try {
    text = await fs.readFile(datei, 'utf8')
  } catch {
    throw new AblaufFehler('KEIN_ABLAUF', `Ablauf "${id}" gibt es nicht.`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new AblaufFehler('UNGUELTIG', `Ablauf "${id}" ist kaputtes JSON: ${err.message}`)
  }
}

/**
 * Speichern. modus: 'neu' (nur wenn es ihn nicht gibt) | 'ersetzen' | 'ergaenzen' (anhängen).
 * @returns {Promise<{id:string, ablauf:object, warnungen:Array}>}
 */
export async function ablaufSpeichern(entwurf, { modus = 'neu' } = {}) {
  if (!entwurf || typeof entwurf !== 'object') throw new AblaufFehler('UNGUELTIG', 'Kein Ablauf zum Speichern bekommen.')
  const id = slugPruefen(entwurf.id)
  await fs.mkdir(ABLAUF_DIR, { recursive: true })

  let alt = null
  try {
    alt = await ablaufLesen(id)
  } catch (err) {
    if (err.code !== 'KEIN_ABLAUF') throw err
  }
  if (alt && modus === 'neu') {
    throw new AblaufFehler('UNGUELTIG', `Ablauf "${id}" gibt es schon. Nimm modus "ersetzen" oder "ergaenzen".`)
  }
  if (!alt && modus === 'ergaenzen') throw new AblaufFehler('KEIN_ABLAUF', `Ablauf "${id}" gibt es nicht — nichts zum Ergänzen.`)

  const jetzt = new Date().toISOString()
  let ablauf

  if (modus === 'ergaenzen') {
    // Gleiche Kennung ersetzt den alten Baustein, alles andere kommt dazu
    const bausteine = [...(alt.bausteine || [])]
    for (const neu of entwurf.bausteine || []) {
      if (!neu?.id) continue
      const i = bausteine.findIndex((b) => b.id === neu.id)
      i >= 0 ? (bausteine[i] = neu) : bausteine.push(neu)
    }
    const kanten = [...(alt.kanten || [])]
    for (const k of entwurf.kanten || []) {
      if (!k?.von || !k?.nach) continue
      if (!kanten.some((x) => x.von === k.von && x.nach === k.nach && (x.zweig || '') === (k.zweig || ''))) kanten.push(k)
    }
    ablauf = {
      ...alt,
      name: entwurf.name || alt.name,
      beschreibung: entwurf.beschreibung ?? alt.beschreibung,
      grenzen: { ...VORGABE_GRENZEN, ...(alt.grenzen || {}), ...(entwurf.grenzen || {}) },
      bausteine,
      kanten,
      layout: { ...(alt.layout || {}), ...(entwurf.layout || {}) },
    }
  } else {
    ablauf = {
      id,
      name: entwurf.name || id,
      beschreibung: entwurf.beschreibung || '',
      grenzen: { ...VORGABE_GRENZEN, ...(entwurf.grenzen || {}) },
      bausteine: Array.isArray(entwurf.bausteine) ? entwurf.bausteine : [],
      kanten: Array.isArray(entwurf.kanten) ? entwurf.kanten : [],
      layout: entwurf.layout && typeof entwurf.layout === 'object' ? entwurf.layout : {},
    }
  }

  ablauf.id = id
  ablauf.version = (alt?.version || 0) + 1
  ablauf.erstellt = alt?.erstellt || jetzt
  ablauf.geaendert = jetzt

  await rueckLaden().catch(() => {}) // damit pruefen() die Werkzeugnamen kennt
  const bericht = pruefen(ablauf)
  if (!bericht.ok) {
    const err = new AblaufFehler('UNGUELTIG', fehlerText(bericht.fehler))
    err.fehler = bericht.fehler
    throw err
  }

  await fs.writeFile(dateiVon(id), JSON.stringify(ablauf, null, 2))
  return { id, ablauf, warnungen: bericht.warnungen }
}

export async function ablaufLoeschen(id) {
  try {
    await fs.unlink(dateiVon(id))
    return true
  } catch {
    return false
  }
}

function fehlerText(fehler) {
  return fehler.map((f) => `- ${f.baustein ? `[${f.baustein}] ` : ''}${f.text}`).join('\n')
}

// Läufe: die letzten 20 pro Ablauf bleiben liegen, der Rest fliegt beim Schreiben raus.
async function laufSchreiben(lauf) {
  try {
    await fs.mkdir(LAUF_DIR, { recursive: true })
    await fs.writeFile(path.join(LAUF_DIR, `${lauf.ablauf}__${lauf.lauf}.json`), JSON.stringify(lauf, null, 2))
    const alle = (await fs.readdir(LAUF_DIR)).filter((n) => n.startsWith(`${lauf.ablauf}__`) && n.endsWith('.json')).sort()
    for (const alt of alle.slice(0, Math.max(0, alle.length - 20))) {
      await fs.unlink(path.join(LAUF_DIR, alt)).catch(() => {})
    }
  } catch {} // Protokoll ist Beiwerk — daran darf kein Lauf scheitern
}

// ═════════════════════════════════════════════════════════════════════
// LÄUFER — einer je Art. Alle bekommen (b, k, ctx), alle geben { text, roh?, zweig? }.
// Wirft bei Fehler; beiFehler entscheidet, was daraus wird.
// ═════════════════════════════════════════════════════════════════════

// Winziges Vergleichswerk. KEIN eval — niemals. Ein Ablauf ist Daten, kein Code.
const VERGLEICHE = {
  gleich: (a, b) => a.trim() === b.trim(),
  ungleich: (a, b) => a.trim() !== b.trim(),
  enthaelt: (a, b) => a.toLowerCase().includes(b.toLowerCase()),
  enthaelt_nicht: (a, b) => !a.toLowerCase().includes(b.toLowerCase()),
  groesser: (a, b) => Number(a) > Number(b),
  kleiner: (a, b) => Number(a) < Number(b),
  leer: (a) => !a.trim(),
  nicht_leer: (a) => !!a.trim(),
  regex: (a, b) => {
    try {
      return new RegExp(b, 'i').test(a)
    } catch {
      return false
    }
  },
}

async function laufEingabe(b, k) {
  const e = b.einstellungen || {}
  const roh = k.eingaben?.[e.schluessel]
  return { text: String(roh ?? e.vorgabe ?? ''), roh: roh ?? null }
}

async function laufText(b, k) {
  return { text: fuellen(b.einstellungen?.vorlage ?? '', k) }
}

async function laufWerkzeug(b, k, ctx) {
  const { werkzeug, argumente } = b.einstellungen || {}
  const { TOOL_MAP, coerceArgs } = await rueckLaden()
  const tool = TOOL_MAP.get(werkzeug)
  if (!tool) throw new AblaufFehler('WERKZEUG_FEHLT', `Werkzeug "${werkzeug}" gibt es nicht.`, b.id)
  // Kleine Modelle schicken gern "3" statt 3 — dasselbe Geradebiegen wie in agent.js
  const args = coerceArgs(fuellen(argumente || {}, k), tool.parameters)

  // Freigabe nachbauen: wir rufen tool.run direkt und umgehen damit die Schleife aus agent.js.
  // Ohne das wäre ein Ablauf ein Weg, shell_run ohne Rückfrage laufen zu lassen.
  const cfg = loadConfig()
  if (!cfg.autoMode && tool.danger && !cfg.autoApprove.includes(werkzeug)) {
    if (!ctx.agent) {
      throw new AblaufFehler('FREIGABE_FEHLT', `"${werkzeug}" braucht eine Freigabe, aber niemand kann fragen.`, b.id)
    }
    await ctx.agent.askApproval(werkzeug, args)
  }
  if (ctx.signal?.aborted) throw new AblaufFehler('GESTOPPT', 'Gestoppt.', b.id)

  const text = String((await tool.run(args, ctx)) ?? '')
  return { text }
}

/** Einen Unter-Agenten laufen lassen — wie crew.js spawn(), aber mit dem Zähler DIESES Laufs. */
async function agentLaufen({ name, rolle, auftrag, werkzeuge, gruppe }, b, k, ctx) {
  const { Agent } = await import('./agent.js') // verzögert: sonst Import-Kreis
  const { rollenWerkzeuge, ROLLEN } = await import('./crew.js')
  const cfg = loadConfig()

  // Eigener Zähler pro Lauf — sonst reißt der dritte Ablauf einer Sitzung die Agenten-Grenze
  if (k.lauf.run.count >= cfg.maxAgentsPerRun) {
    throw new AblaufFehler('AGENTEN_GRENZE', `Agenten-Grenze erreicht (${cfg.maxAgentsPerRun} pro Ablauf-Lauf).`, b.id)
  }
  k.lauf.run.count++

  const preset = ROLLEN[rolle] || ROLLEN.allrounder
  const erlaubt = werkzeuge?.length ? werkzeuge : rollenWerkzeuge(rolle)
  const echteRolle = ROLLEN[rolle] ? rolle : 'allrounder'
  const eltern = ctx.agent || null

  const kind = new Agent({
    session: eltern?.session || `ablauf-${k.lauf.ablauf}`,
    // Die Kind-Ereignisse gehen unter ihrem eigenen Namen durch — plus lauf und baustein,
    // damit die Oberfläche sie dem richtigen Kasten zuordnen kann.
    emit: (msg) => ctx.emit?.(msg.type || 'agent_ereignis', { ...msg, lauf: k.lauf.id, baustein: b.id }),
    root: eltern?.root || eltern || null,
    depth: (eltern?.depth ?? 0) + 1,
    name,
    run: k.lauf.run,
  })

  // Eigener Systemtext wie in crew.js: der Agent weiß nicht, was der Nutzer gesagt hat —
  // sein Auftrag steht vollständig im Baustein.
  kind.messages = [
    {
      role: 'system',
      content: [
        `Du bist "${name}", ein Schritt im Ablauf "${k.ablauf.name}".`,
        `Deine Rolle: ${echteRolle} — ${preset.hint}`,
        gruppe ? `Du gehörst zur Gruppe "${gruppe}".` : null,
        '',
        'Du arbeitest allein und meldest am Ende ein Ergebnis zurück. Der Nutzer liest deine Antwort nicht direkt —',
        'sie geht als Text an die nächsten Bausteine weiter. Also: kein Geplauder, nur das Ergebnis, klar und vollständig.',
        '',
        'WICHTIG: Du läufst direkt auf dem Mac des Nutzers, nicht in einer Sandbox.',
        'Du hast echten Zugriff auf Dateien, Terminal und Netz — über deine Werkzeuge.',
        'Sag NIEMALS, du hättest keinen Zugriff. Nimm das Werkzeug und sieh nach.',
        '',
        erlaubt?.length ? `Deine Werkzeuge: ${erlaubt.join(', ')}.` : 'Du hast alle Werkzeuge zur Verfügung.',
        'Fehlt dir eines, sag das im Ergebnis — erfinde nichts.',
        'Antworte auf Deutsch.',
      ]
        .filter((z) => z !== null)
        .join('\n'),
    },
  ]

  // Der Stopp-Knopf bricht die Werkzeug-Promise ab, aber der Unter-Agent hat einen
  // eigenen AbortController. Ohne das hier arbeitet er munter weiter.
  const anhalten = () => kind.stop()
  ctx.signal?.addEventListener('abort', anhalten, { once: true })

  try {
    const text = await kind.send(auftrag, { enabledTools: erlaubt, quiet: true })
    return `[${name} · ${echteRolle}${gruppe ? ` · ${gruppe}` : ''}] ${String(text ?? '')}`.trim()
  } finally {
    ctx.signal?.removeEventListener('abort', anhalten)
  }
}

async function laufAgent(b, k, ctx) {
  const e = b.einstellungen || {}
  const text = await agentLaufen(
    {
      name: e.name || b.beschriftung || b.id,
      rolle: e.rolle || 'allrounder',
      auftrag: fuellen(e.auftrag || '', k),
      werkzeuge: e.werkzeuge,
    },
    b,
    k,
    ctx
  )
  return { text }
}

async function laufGruppe(b, k, ctx) {
  const e = b.einstellungen || {}
  const mitglieder = e.mitglieder || []
  const auftraege = mitglieder.map((m) => ({
    name: m.name || 'Mitglied',
    rolle: m.rolle || 'allrounder',
    auftrag: fuellen(m.auftrag || '', k),
    werkzeuge: m.werkzeuge,
    gruppe: e.name || b.beschriftung || b.id,
  }))

  let ergebnisse = []
  if (e.modus === 'nacheinander' || e.modus === 'sequential') {
    for (const a of auftraege) ergebnisse.push(await agentLaufen(a, b, k, ctx))
  } else {
    // Bewusst parallel — genau wie agent_team es heute macht
    ergebnisse = await Promise.all(auftraege.map((a) => agentLaufen(a, b, k, ctx)))
  }
  const kopf = e.ziel ? `Gruppe "${e.name || b.id}" — Ziel: ${fuellen(e.ziel, k)}\n\n` : ''
  return { text: kopf + ergebnisse.join('\n\n───\n\n') }
}

async function laufBedingung(b, k, ctx) {
  const e = b.einstellungen || {}

  if (e.pruefung === 'gehirn') {
    const frage = fuellen(e.frage || '', k)
    const quelle = fuellen(e.quelle || '', k)
    const res = await chat({
      messages: [
        {
          role: 'system',
          content:
            'Du beantwortest eine einzige Ja/Nein-Frage. Antworte mit genau einem Wort: ja oder nein. ' +
            'Keine Begründung, kein Satz, nichts sonst.',
        },
        { role: 'user', content: `Frage: ${frage}\n\nGrundlage:\n${quelle || '(nichts mitgegeben)'}` },
      ],
      tools: [],
      signal: ctx.signal,
      flink: true, // Ja/Nein ist Fleißarbeit, kein Denken
      onDelta: () => {},
    })
    const zweig = /^\s*(ja|yes|true)/i.test(String(res.text || '')) ? 'ja' : 'nein'
    return { text: zweig, zweig }
  }

  const links = fuellen(String(e.links ?? ''), k)
  const rechts = fuellen(String(e.rechts ?? ''), k)
  const pruefe = VERGLEICHE[e.vergleich]
  if (!pruefe) throw new AblaufFehler('UNGUELTIG', `Vergleich "${e.vergleich}" gibt es nicht.`, b.id)
  const zweig = pruefe(links, rechts) ? 'ja' : 'nein'
  return { text: zweig, zweig }
}

async function laufAusgabe(b, k) {
  const e = b.einstellungen || {}
  const text = fuellen(e.vorlage ?? '', k)
  const ziel = e.ziel || 'antwort'

  if (ziel === 'obsidian') {
    const titel = fuellen(e.notiz || b.beschriftung || k.ablauf.name || 'Ablauf', k)
    const note = await writeNote('knowledge', titel, text, { quelle: 'URAI-Ablauf', ablauf: k.ablauf.id, lauf: k.lauf.id })
    return { text: `${text}\n\n(In Obsidian: ${note})` }
  }
  if (ziel === 'datei') {
    // Nur im Revier schreiben — dieselbe Grenze, die auch fs_write zieht
    const roh = fuellen(String(e.pfad || ''), k)
    const abs = path.resolve(roh.startsWith('~') ? roh.replace(/^~/, process.env.HOME) : roh)
    const revier = path.resolve(loadConfig().workspace || process.env.HOME)
    if (!abs.startsWith(revier)) throw new AblaufFehler('UNGUELTIG', `Weg liegt außerhalb vom Revier (${revier}): ${abs}`, b.id)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, text)
    return { text: `${text}\n\n(Geschrieben: ${abs})` }
  }
  return { text }
}

const LAEUFER = {
  eingabe: laufEingabe,
  text: laufText,
  werkzeug: laufWerkzeug,
  agent: laufAgent,
  gruppe: laufGruppe,
  bedingung: laufBedingung,
  ausgabe: laufAusgabe,
}

// ═════════════════════════════════════════════════════════════════════
// AUSFÜHREN
// ═════════════════════════════════════════════════════════════════════

/** Heikel = verändert etwas oder steuert den Mac. Läuft einzeln, nie nebenher. */
function istHeikel(b) {
  return b.art === 'werkzeug' && HEIKEL.test(String(b.einstellungen?.werkzeug || ''))
}

/** Eine Welle in Gruppen schneiden, die gefahrlos gleichzeitig laufen. */
function wellenGruppen(bausteine) {
  const gruppen = []
  let aktuell = []
  for (const b of bausteine) {
    if (istHeikel(b)) {
      if (aktuell.length) gruppen.push(aktuell)
      gruppen.push([b])
      aktuell = []
    } else {
      aktuell.push(b)
    }
  }
  if (aktuell.length) gruppen.push(aktuell)
  return gruppen
}

/** Eingaben von außen auf die eingabe-Bausteine abbilden, Typen biegen, Pflicht prüfen. */
function eingabenVorbereiten(ablauf, roh) {
  const raus = { ...(roh || {}) }
  for (const b of ablauf.bausteine || []) {
    if (b?.art !== 'eingabe') continue
    const e = b.einstellungen || {}
    let wert = raus[e.schluessel]
    if (wert == null || wert === '') wert = e.vorgabe
    if (wert == null || wert === '') {
      if (e.pflicht) throw new AblaufFehler('PFLICHT_FEHLT', `Die Eingabe "${e.schluessel}" (${b.beschriftung || b.id}) fehlt.`, b.id)
      wert = ''
    }
    if (e.typ === 'zahl') wert = Number(wert)
    else if (e.typ === 'ja_nein') wert = wert === true || /^(true|ja|yes|1)$/i.test(String(wert))
    raus[e.schluessel] = wert
  }
  return raus
}

/** Kleine Wartepause zwischen zwei Versuchen — bricht sofort ab, wenn gestoppt wird. */
function warten(ms, signal) {
  return new Promise((fertig) => {
    const raus = () => {
      clearTimeout(t)
      signal?.removeEventListener('abort', raus)
      fertig()
    }
    const t = setTimeout(raus, ms)
    signal?.addEventListener('abort', raus, { once: true })
  })
}

/**
 * Einen Ablauf laufen lassen.
 * @param {string|object} was    id oder fertiger Ablauf
 * @param {object} eingaben      { thema: 'KI-Werkzeuge' }
 * @param {object} ctx           { emit(kind,data), signal, agent, tiefe } — genau der Werkzeug-ctx
 * @returns {Promise<object>} Lauf
 */
export async function ablaufStarten(was, eingaben = {}, ctx = {}) {
  const ablauf = typeof was === 'string' ? await ablaufLesen(was) : was
  await rueckLaden().catch(() => {}) // damit pruefen() die Werkzeugnamen kennt
  const bericht = pruefen(ablauf)
  if (!bericht.ok) {
    const err = new AblaufFehler('UNGUELTIG', `Der Ablauf ist nicht in Ordnung:\n${fehlerText(bericht.fehler)}`)
    err.fehler = bericht.fehler
    throw err
  }

  const grenzen = { ...VORGABE_GRENZEN, ...(ablauf.grenzen || {}) }
  const tiefe = Number(ctx.tiefe || 0)
  // ablauf_starten steht in TOOL_MAP — ein Ablauf kann sich selbst aufrufen.
  if (tiefe > grenzen.maxTiefe) {
    throw new AblaufFehler('ZU_TIEF', `Zu tief verschachtelt (Grenze ${grenzen.maxTiefe}). Ruft sich ein Ablauf selbst auf?`)
  }

  const laufId = `l-${Math.floor(Date.now() / 1000)}-${Math.random().toString(16).slice(2, 6)}`
  const begonnen = Date.now()
  const melde = (kind, data) => {
    try {
      ctx.emit?.(kind, { lauf: laufId, ...data })
    } catch {} // eine kaputte Verbindung darf keinen Lauf umbringen
  }

  // Zwei Läufe gleichzeitig dürfen sich nicht in die Quere kommen: alles steht hier,
  // nichts auf Modulebene. Jedes Ereignis trägt darum die lauf-Kennung.
  const werte = {}
  const lauf = { id: laufId, ablauf: ablauf.id, run: { count: 0, log: [] } }
  const eingabenFertig = eingabenVorbereiten(ablauf, eingaben)
  const k = { werte, eingaben: eingabenFertig, ablauf, lauf, aliase: aliasKarte(ablauf), stempel: jetztStempel() }

  const { wellen } = reihenfolge(ablauf)
  const kanten = kantenAufloesen(ablauf)
  const bausteinVon = new Map((ablauf.bausteine || []).filter((b) => b?.id).map((b) => [b.id, b]))
  const eingehend = new Map([...bausteinVon.keys()].map((id) => [id, []]))
  for (const kante of kanten) eingehend.get(kante.nach)?.push(kante)

  const uhr = AbortSignal.timeout(grenzen.timeoutMs)
  const laufSignal = ctx.signal ? AbortSignal.any([ctx.signal, uhr]) : uhr

  melde('ablauf_start', {
    ablauf: ablauf.id,
    name: ablauf.name,
    bausteine: (ablauf.bausteine || []).length,
    wellen,
  })

  let fehler = null
  let status = 'fertig'

  try {
    for (const [nr, welle] of wellen.entries()) {
      if (laufSignal.aborted) throw abbruchFehler(ctx, laufSignal)
      melde('ablauf_welle', { nr: nr + 1, ids: welle })

      // Erst entscheiden, wer überhaupt dran ist — Überspringen pflanzt sich fort.
      // Entschieden wird über die GEZOGENEN Kanten: die sind die Reihenfolge.
      // Implizite Kanten sind nur Datenfluss — zählten sie mit, würde ein
      // "Nichts gefunden"-Baustein mit einem {{eingabe.thema}} darin nie übersprungen,
      // weil die Eingabe ja gelaufen ist. Dann wäre jede Bedingung wirkungslos.
      const dran = []
      for (const id of welle) {
        const rein = eingehend.get(id) || []
        const gezogen = rein.filter((kante) => !kante.implizit)
        const istAktiv = (kante) => {
          const quelle = werte[kante.von]
          if (!quelle || quelle.uebersprungen) return false
          return !kante.zweig || kante.zweig === quelle.zweig
        }
        let grund = null
        if (gezogen.length) {
          // Gemischt (eine aktiv, eine nicht) heißt: läuft.
          if (!gezogen.some(istAktiv)) {
            grund = gezogen.some((kante) => werte[kante.von]?.uebersprungen)
              ? 'Der Baustein davor wurde übersprungen.'
              : 'Der andere Zweig der Bedingung wurde genommen.'
          }
        } else if (rein.length && rein.every((kante) => werte[kante.von]?.uebersprungen)) {
          // Nur Platzhalter-Kanten, und alle Quellen sind weg — dann gibt es nichts zu tun.
          grund = 'Alles, woraus er sich speist, wurde übersprungen.'
        }

        if (grund) {
          werte[id] = { text: '', roh: null, ok: true, uebersprungen: true, ms: 0 }
          melde('ablauf_uebersprungen', { id, grund })
        } else {
          dran.push(bausteinVon.get(id))
        }
      }

      for (const gruppe of wellenGruppen(dran)) {
        if (laufSignal.aborted) throw abbruchFehler(ctx, laufSignal)
        await Promise.all(gruppe.map((b) => bausteinLaufen(b, k, ctx, laufSignal, melde, werte, tiefe)))
      }
    }
  } catch (err) {
    // Gestoppt ist kein Fehler, sondern eine Entscheidung des Nutzers — die Oberfläche zeigt beides anders.
    status = err.code === 'GESTOPPT' ? 'gestoppt' : 'fehler'
    fehler = { code: err.code || 'WERKZEUG_FEHLER', baustein: err.baustein || null, text: err.message }
  }

  const ausgabe = (ablauf.bausteine || [])
    .filter((b) => b?.art === 'ausgabe' && werte[b.id] && !werte[b.id].uebersprungen)
    .map((b) => werte[b.id].text)
    .filter((t) => String(t).trim())
    .join('\n\n')

  const ergebnis = {
    lauf: laufId,
    ablauf: ablauf.id,
    status,
    ok: status === 'fertig',
    ms: Date.now() - begonnen,
    ausgabe,
    werte,
    fehler,
  }

  melde('ablauf_ende', { status, ok: ergebnis.ok, ms: ergebnis.ms, ausgabe: kuerzen(ausgabe, MAX_EREIGNIS), fehler })

  // Ins Protokoll kommen gestutzte Werte: 60 Bausteine à 8000 Zeichen mal 20 Läufe
  // wären zehn Megabyte je Ablauf, nur um später mal nachzusehen, was rauskam.
  const schlank = {}
  for (const [id, w] of Object.entries(werte)) schlank[id] = { ...w, roh: undefined, text: kuerzen(w.text, MAX_EREIGNIS) }
  await laufSchreiben({
    ...ergebnis,
    werte: schlank,
    ausgabe: kuerzen(ausgabe, MAX_WERT),
    name: ablauf.name,
    eingaben: eingabenFertig,
    begonnen: new Date(begonnen).toISOString(),
  })
  return ergebnis
}

/** Wurde gestoppt oder ist die Zeit abgelaufen? Der Unterschied zählt für die Meldung. */
function abbruchFehler(ctx, laufSignal, baustein = null, schrittSignal = null) {
  if (ctx.signal?.aborted) return new AblaufFehler('GESTOPPT', 'Vom Nutzer gestoppt.', baustein)
  if (laufSignal.aborted) return new AblaufFehler('ZEIT_ABGELAUFEN', 'Der ganze Ablauf hat zu lange gebraucht.', baustein)
  if (schrittSignal?.aborted) return new AblaufFehler('ZEIT_ABGELAUFEN', `Baustein "${baustein}" hat zu lange gebraucht.`, baustein)
  return new AblaufFehler('GESTOPPT', 'Abgebrochen.', baustein)
}

/**
 * Gegen das Signal antreten. Nicht jedes Werkzeug schaut auf ctx.signal — shell_run
 * zum Beispiel läuft stur weiter. Ohne dieses Rennen würde der Stopp-Knopf gedrückt,
 * die Oberfläche zeigte "gestoppt", und der Ablauf hinge trotzdem noch Minuten fest.
 */
function wettlauf(arbeit, schrittSignal, ctx, laufSignal, id) {
  arbeit.catch(() => {}) // die verwaiste Ablehnung darf Node nicht umbringen
  if (schrittSignal.aborted) return Promise.reject(abbruchFehler(ctx, laufSignal, id, schrittSignal))
  return new Promise((fertig, daneben) => {
    const abbruch = () => daneben(abbruchFehler(ctx, laufSignal, id, schrittSignal))
    schrittSignal.addEventListener('abort', abbruch, { once: true })
    arbeit.then(
      (w) => {
        schrittSignal.removeEventListener('abort', abbruch)
        fertig(w)
      },
      (e) => {
        schrittSignal.removeEventListener('abort', abbruch)
        daneben(e)
      }
    )
  })
}

/** Ein Baustein mit Zeitgrenze, Wiederholung und beiFehler-Verhalten. */
async function bausteinLaufen(b, k, ctx, laufSignal, melde, werte, tiefe) {
  const laeufer = LAEUFER[b.art]
  const begonnen = Date.now()
  melde('ablauf_baustein_an', { id: b.id, art: b.art, beschriftung: b.beschriftung || b.id })

  const beiFehler = ['stoppen', 'weiter', 'wiederholen'].includes(b.beiFehler) ? b.beiFehler : 'stoppen'
  const versuche = beiFehler === 'wiederholen' ? Math.min(5, Math.max(1, Number(b.versuche) || 2)) : 1
  const schrittMs = Number(b.timeoutMs) > 0 ? Number(b.timeoutMs) : VORGABE_SCHRITT_MS

  let letzter = null
  for (let n = 0; n < versuche; n++) {
    if (laufSignal.aborted) throw abbruchFehler(ctx, laufSignal, b.id)
    const schrittSignal = AbortSignal.any([laufSignal, AbortSignal.timeout(schrittMs)])
    const schrittCtx = { ...ctx, signal: schrittSignal, tiefe: tiefe + 1 }
    try {
      const raus = (await wettlauf(Promise.resolve().then(() => laeufer(b, k, schrittCtx)), schrittSignal, ctx, laufSignal, b.id)) || {}
      // Deckeln beim SCHREIBEN, nicht erst beim Füllen — sonst reißt ein fs_read
      // auf eine große Datei den nächsten Agenten sofort ins Kontingent-Limit.
      const text = kuerzen(raus.text ?? '', MAX_WERT)
      werte[b.id] = {
        text,
        roh: raus.roh !== undefined ? raus.roh : jsonOderNull(text),
        ok: true,
        uebersprungen: false,
        ms: Date.now() - begonnen,
        ...(raus.zweig ? { zweig: raus.zweig } : {}),
      }
      if (raus.zweig) melde('ablauf_zweig', { id: b.id, zweig: raus.zweig })
      melde('ablauf_baustein_aus', { id: b.id, ok: true, ms: werte[b.id].ms, ergebnis: kuerzen(text, MAX_EREIGNIS) })
      return
    } catch (err) {
      letzter = err
      if (laufSignal.aborted) throw abbruchFehler(ctx, laufSignal, b.id)
      if (n < versuche - 1) {
        await warten(500 * 2 ** n, laufSignal)
        continue
      }
    }
  }

  const text = `Fehler: ${letzter?.message || 'unbekannt'}`
  werte[b.id] = { text, roh: null, ok: false, uebersprungen: false, ms: Date.now() - begonnen }
  melde('ablauf_baustein_aus', { id: b.id, ok: false, ms: werte[b.id].ms, ergebnis: kuerzen(text, MAX_EREIGNIS) })

  if (beiFehler === 'weiter') return // Ergebnis wird zu 'Fehler: …', der Ablauf macht weiter
  if (letzter instanceof AblaufFehler) throw letzter
  throw new AblaufFehler('WERKZEUG_FEHLER', letzter?.message || 'Unbekannter Fehler.', b.id)
}

/** JSON-Pfade wie {{schritt3.titel.0}} gehen nur, wenn das Ergebnis lesbares JSON ist. */
function jsonOderNull(text) {
  const t = String(text || '').trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

// ═════════════════════════════════════════════════════════════════════
// WERKZEUGE
// Alle vier mit danger:false — gefährlich ist nicht der Ablauf, sondern das
// einzelne Werkzeug darin, und das fragt selbst (siehe laufWerkzeug).
// ═════════════════════════════════════════════════════════════════════

export const ablaufTools = [
  {
    name: 'ablauf_bauen',
    description: 'Einen wiederverwendbaren Ablauf aus Bausteinen speichern. Für Arbeit, die immer wieder gleich läuft.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Kurze Kennung, klein geschrieben, z.B. "morgenbericht"' },
        name: { type: 'string' },
        beschreibung: { type: 'string' },
        bausteine: {
          type: 'array',
          description:
            'je {id, art, beschriftung, einstellungen}. art: eingabe|text|werkzeug|agent|gruppe|bedingung|ausgabe. ' +
            'einstellungen je Art: eingabe{schluessel,typ,vorgabe,pflicht} · text{vorlage} · ' +
            'werkzeug{werkzeug,argumente} · agent{rolle,name,auftrag} · gruppe{name,ziel,modus,mitglieder} · ' +
            'bedingung{pruefung,links,vergleich,rechts} oder {pruefung:"gehirn",frage,quelle} · ' +
            'ausgabe{vorlage,ziel,notiz,pfad}. Platzhalter: {{eingabe.thema}}, {{schritt3}}, {{datum}}.',
          items: { type: 'object' },
        },
        kanten: {
          type: 'array',
          description: 'je {von, nach, zweig?}. zweig ("ja"/"nein") nur hinter einer Bedingung.',
          items: { type: 'object' },
        },
        modus: { type: 'string', description: 'neu | ersetzen | ergaenzen' },
      },
      required: ['id', 'name', 'bausteine'],
    },
    async run({ id, name, beschreibung, bausteine, kanten, modus = 'neu' }) {
      try {
        const { ablauf, warnungen } = await ablaufSpeichern(
          { id, name, beschreibung, bausteine, kanten },
          { modus: ['neu', 'ersetzen', 'ergaenzen'].includes(modus) ? modus : 'neu' }
        )
        const { wellen } = reihenfolge(ablauf)
        return [
          `Ablauf "${ablauf.name}" (${ablauf.id}) gespeichert, Fassung ${ablauf.version}.`,
          `${ablauf.bausteine.length} Bausteine in ${wellen.length} Wellen: ${wellen.map((w) => w.join('+')).join(' → ')}`,
          warnungen.length ? `\nHinweise:\n${fehlerText(warnungen)}` : '',
          `\nStarten mit: ablauf_starten id="${ablauf.id}"`,
        ].join('\n')
      } catch (err) {
        // Fehlerliste als Text zurück, damit das Modell gezielt nachbessert
        return `Ablauf NICHT gespeichert (${err.code || 'FEHLER'}):\n${err.message}`
      }
    },
  },
  {
    name: 'ablauf_starten',
    description: 'Einen gespeicherten Ablauf laufen lassen. Eingaben als Objekt mitgeben.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        eingaben: { type: 'object', description: 'Werte für die Eingabe-Bausteine, nach schluessel' },
      },
      required: ['id'],
    },
    async run({ id, eingaben }, ctx) {
      const lauf = await ablaufStarten(id, eingaben || {}, ctx || {})
      const kopf = `Ablauf "${id}": ${lauf.status} nach ${Math.round(lauf.ms / 1000)}s.`
      const schlecht = lauf.fehler ? `\nFehler (${lauf.fehler.code}${lauf.fehler.baustein ? ` bei ${lauf.fehler.baustein}` : ''}): ${lauf.fehler.text}` : ''
      return `${kopf}${schlecht}\n\n${lauf.ausgabe || '(keine Ausgabe)'}`
    },
  },
  {
    name: 'ablauf_liste',
    description: 'Zeigt alle gespeicherten Abläufe mit Namen und Zweck.',
    parameters: { type: 'object', properties: {} },
    async run() {
      const liste = await ablaufListe()
      if (!liste.length) return 'Noch keine Abläufe gespeichert. Mit ablauf_bauen einen anlegen.'
      return liste
        .map((a) => `- ${a.id} · ${a.name} (${a.bausteine} Bausteine)${a.beschreibung ? ` — ${a.beschreibung}` : ''}`)
        .join('\n')
    },
  },
  {
    name: 'ablauf_lesen',
    description: 'Zeigt einen Ablauf im Einzelnen: Bausteine, Verbindungen, Eingaben.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    async run({ id }) {
      const ablauf = await ablaufLesen(id)
      const bericht = pruefen(ablauf)
      const kanten = kantenAufloesen(ablauf)
      return [
        `${ablauf.name} (${ablauf.id}, Fassung ${ablauf.version || 1})`,
        ablauf.beschreibung || '',
        '',
        'Bausteine:',
        ...(ablauf.bausteine || []).map((b) => {
          const e = b.einstellungen || {}
          const was =
            b.art === 'werkzeug' ? e.werkzeug
              : b.art === 'agent' ? `${e.rolle || 'allrounder'} "${e.name || ''}"`
              : b.art === 'gruppe' ? `${(e.mitglieder || []).length} Mitglieder`
              : b.art === 'eingabe' ? `${e.schluessel}${e.pflicht ? ' (Pflicht)' : ''}`
              : b.art === 'bedingung' ? (e.pruefung || 'vergleich')
              : b.art === 'ausgabe' ? (e.ziel || 'antwort')
              : ''
          return `  ${b.id} [${b.art}] ${b.beschriftung || ''}${was ? ` — ${was}` : ''}`
        }),
        '',
        'Verbindungen:',
        ...kanten.map((kante) => `  ${kante.von} → ${kante.nach}${kante.zweig ? ` (${kante.zweig})` : ''}${kante.implizit ? ' [aus Platzhalter]' : ''}`),
        '',
        `Reihenfolge: ${bericht.wellen.map((w) => w.join('+')).join(' → ')}`,
        bericht.fehler.length ? `\nFehler:\n${fehlerText(bericht.fehler)}` : '',
        bericht.warnungen.length ? `\nHinweise:\n${fehlerText(bericht.warnungen)}` : '',
      ].filter((z) => z !== null).join('\n')
    },
  },
]

// ═════════════════════════════════════════════════════════════════════
// EREIGNISSE · ctx.emit(kind, data)
//
// Über den Agenten kommen sie als {type:'tool_stream', kind:'ablauf_…',
// name:'ablauf_starten', data:{…}} an — die Oberfläche muss in ihrem bestehenden
// case 'tool_stream' auspacken. Über den WebSocket-Start kommen dieselben
// Ereignisse flach als {type:'ablauf_…', …} an. Beide Wege müssen im Empfänger
// abgedeckt sein, sonst ist der eine Startweg live und der andere stumm.
//
// ablauf_start         { lauf, ablauf, name, bausteine, wellen }
// ablauf_welle         { lauf, nr, ids }
// ablauf_baustein_an   { lauf, id, art, beschriftung }
// ablauf_baustein_aus  { lauf, id, ok, ms, ergebnis }
// ablauf_zweig         { lauf, id, zweig }
// ablauf_uebersprungen { lauf, id, grund }
// ablauf_ende          { lauf, status, ok, ms, ausgabe, fehler }
// ═════════════════════════════════════════════════════════════════════
