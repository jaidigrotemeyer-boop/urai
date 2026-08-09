import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n.js'

/**
 * Die Werkstatt: hier baust du Abläufe.
 *
 * Ein Ablauf ist eine geordnete Liste von Bausteinen, keine freie Fläche.
 * WARUM: die Werkzeuge laufen in server/agent.js sequenziell durch, ein Ablauf
 * IST eine Liste — sie als Wolke zu zeichnen wäre gelogen. Parallelität steckt
 * nicht in Koordinaten, sondern in den Kanten: was in derselben topologischen
 * Welle liegt, steht nebeneinander in EINER Bahnzeile (`.bau-gabel`).
 *
 * Zwei Wahrheiten, die nie auseinanderlaufen dürfen:
 *   kanten[]     bestimmt die REIHENFOLGE (der Nutzer zieht sie)
 *   Platzhalter  bestimmen die DATEN ({{schritt3}})
 * Jeder Platzhalter erzeugt deshalb zusätzlich eine implizite Kante, die
 * gestrichelt gezeichnet wird — so kann die Zeichnung nie vom Lauf abweichen.
 */

// ─────────────────────────────────────────────────────────────────────
// Feste Listen. Spiegeln server/ablauf.js und crew.js wider.
// ─────────────────────────────────────────────────────────────────────

const ARTEN = [
  { art: 'eingabe', name: 'Eingabe', was: 'Was der Ablauf von dir wissen muss' },
  { art: 'text', name: 'Text', was: 'Vorlage ohne Gehirn — klebt Ergebnisse zusammen' },
  { art: 'werkzeug', name: 'Werkzeug', was: 'Ein Werkzeug mit festen Argumenten' },
  { art: 'agent', name: 'Agent', was: 'Ein Unter-Agent mit Rolle und Auftrag' },
  { art: 'gruppe', name: 'Gruppe', was: 'Mehrere Agenten auf einmal' },
  { art: 'bedingung', name: 'Bedingung', was: 'Teilt den Ablauf in ja und nein' },
  { art: 'ausgabe', name: 'Ausgabe', was: 'Antwort, Notiz oder Datei' },
]

const ROLLEN = ['rechercheur', 'programmierer', 'bildschirm', 'schreiber', 'pruefer', 'allrounder']
const VERGLEICHE = ['gleich', 'ungleich', 'enthaelt', 'enthaelt_nicht', 'groesser', 'kleiner', 'leer', 'nicht_leer', 'regex']
const ZIELE = ['antwort', 'obsidian', 'datei']
const BEI_FEHLER = ['stoppen', 'weiter', 'wiederholen']

// Platzhalter, die es immer gibt — die dürfen nie als "loser Verweis" gelten.
const EINGEBAUT = ['jetzt', 'datum', 'ablauf', 'eingabe']

// ─────────────────────────────────────────────────────────────────────
// Reine Helfer. Bewusst hier und nicht im Bauteil — sie sind testbar
// und werden von mehreren Stellen gebraucht.
// ─────────────────────────────────────────────────────────────────────

/**
 * Alle {{…}} eines Textes. Mit \{{ geschrieben bleibt es Text.
 * @returns {{ganz:string, ziel:string, pfad:string[], ersatz:string|null}[]}
 */
export function platzhalter(text) {
  const raus = []
  if (typeof text !== 'string') return raus
  const re = /(\\)?\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g
  let m
  while ((m = re.exec(text))) {
    if (m[1]) continue // \{{ ist gewollter Text
    const teile = m[2].split('.')
    raus.push({ ganz: m[0], ziel: teile[0].trim(), pfad: teile.slice(1), ersatz: m[3] ?? null })
  }
  return raus
}

/** Alle Zeichenketten eines Bausteins einsammeln — Zahlen und Booleans interessieren nicht. */
function texteSammeln(wert, raus = []) {
  if (typeof wert === 'string') raus.push(wert)
  else if (Array.isArray(wert)) wert.forEach((x) => texteSammeln(x, raus))
  else if (wert && typeof wert === 'object') Object.values(wert).forEach((x) => texteSammeln(x, raus))
  return raus
}

/** id oder merker → id. Damit {{recherche}} denselben Baustein trifft wie {{schritt2}}. */
function namenKarte(bausteine) {
  const k = new Map()
  for (const b of bausteine) {
    k.set(b.id, b.id)
    if (b.merker) k.set(b.merker, b.id)
  }
  // WARUM: {{eingabe}} ist die "eine Eingabe", auch wenn der Baustein anders heißt
  if (!k.has('eingabe')) {
    const e = bausteine.find((b) => b.art === 'eingabe')
    if (e) k.set('eingabe', e.id)
  }
  return k
}

/**
 * Gezeichnete Kanten plus die aus Platzhaltern abgeleiteten, doppelte zusammengefasst.
 * @returns {{id:string, von:string, nach:string, zweig?:string, implizit?:boolean}[]}
 */
export function kantenAufloesen(ablauf) {
  const bausteine = ablauf?.bausteine || []
  const gibt = new Set(bausteine.map((b) => b.id))
  const namen = namenKarte(bausteine)
  const raus = new Map()
  const legen = (von, nach, zweig, implizit) => {
    if (!gibt.has(von) || !gibt.has(nach) || von === nach) return
    const id = `${von}->${nach}${zweig ? ':' + zweig : ''}`
    const alt = raus.get(id)
    // Eine gezeichnete Kante schlägt die implizite — sonst wäre sie gestrichelt
    if (alt && !implizit) alt.implizit = false
    if (!alt) raus.set(id, { id, von, nach, zweig, implizit: !!implizit })
  }
  for (const k of ablauf?.kanten || []) legen(k.von, k.nach, k.zweig, false)
  for (const b of bausteine) {
    for (const s of texteSammeln(b.einstellungen)) {
      for (const p of platzhalter(s)) {
        const ziel = namen.get(p.ziel)
        if (ziel) legen(ziel, b.id, undefined, true)
      }
    }
  }
  return [...raus.values()]
}

/** Verweise, die ins Leere zeigen. Die gehören schon im Editor rot markiert. */
function loseVerweise(text, bausteine) {
  const namen = namenKarte(bausteine)
  return platzhalter(text)
    .filter((p) => !namen.has(p.ziel) && !EINGEBAUT.includes(p.ziel))
    .map((p) => p.ganz)
}

/**
 * Kahn-Schichten. Was in einer Welle liegt, läuft gleichzeitig — genau das
 * zeichnen wir als Gabel. Bausteine in einem Zyklus kämen nie dran.
 * @returns {{wellen:string[][], zyklus:string[]}}
 */
export function wellenRechnen(bausteine, kanten) {
  const ordnung = new Map(bausteine.map((b, i) => [b.id, i]))
  const grad = new Map(bausteine.map((b) => [b.id, 0]))
  const raus = new Map(bausteine.map((b) => [b.id, []]))
  for (const k of kanten) {
    if (!grad.has(k.von) || !grad.has(k.nach)) continue
    grad.set(k.nach, grad.get(k.nach) + 1)
    raus.get(k.von).push(k.nach)
  }
  const wellen = []
  let welle = bausteine.filter((b) => grad.get(b.id) === 0).map((b) => b.id)
  const fertig = new Set()
  while (welle.length) {
    welle.sort((a, b) => ordnung.get(a) - ordnung.get(b))
    wellen.push(welle)
    welle.forEach((id) => fertig.add(id))
    const naechste = []
    for (const id of wellen[wellen.length - 1]) {
      for (const zu of raus.get(id) || []) {
        grad.set(zu, grad.get(zu) - 1)
        if (grad.get(zu) === 0) naechste.push(zu)
      }
    }
    welle = naechste
  }
  const zyklus = bausteine.map((b) => b.id).filter((id) => !fertig.has(id))
  return { wellen, zyklus }
}

/**
 * Misst die .baustein-anker relativ zur .ablauf-spur und baut die Pfade.
 * WARUM in der Spur und nicht in der Bahn: die Spur scrollt mit, im
 * Scroll-Container müsste man bei jedem Scroll-Ereignis alles neu setzen.
 * @returns {{id:string, von:string, nach:string, d:string, i:number}[]}
 */
export function adernRechnen(spurEl, kanten) {
  if (!spurEl) return []
  const s = spurEl.getBoundingClientRect()
  const punkt = (id, art) => {
    const karte = spurEl.querySelector(`[data-id="${CSS.escape(id)}"]`)
    const anker = karte?.querySelector(`[data-anker="${art}"]`)
    if (!anker) return null
    const r = anker.getBoundingClientRect()
    let y = (art === 'aus' ? r.bottom : r.top) - s.top
    if (art === 'aus') {
      // WARUM: in einer Gabel sind die Zweige verschieden hoch. Hängt die
      // ausgehende Ader am Kartenrand, baumeln die kurzen Zweige in der Luft.
      const boden = karte.closest('.bau-gabel')?.querySelector(':scope > .bau-gabel-anker')
      if (boden) y = boden.getBoundingClientRect().bottom - s.top
    }
    return [r.left + r.width / 2 - s.left, y]
  }
  const eng = s.width < 520
  return kanten
    .map((k, i) => {
      const a = punkt(k.von, 'aus')
      const b = punkt(k.nach, 'ein')
      if (!a || !b) return null
      const [x1, y1] = a
      const [x2, y2] = b
      // WARUM: der Bug skaliert mit dem Abstand, damit kurze Sprünge nicht ausbeulen.
      // Auf schmalen Spuren geklemmt — dann sind es fast Geraden, das beruhigt das Bild.
      const bug = eng ? 10 : Math.max(18, (y2 - y1) * 0.42)
      return { ...k, i, d: `M ${x1} ${y1} C ${x1} ${y1 + bug} ${x2} ${y2 - bug} ${x2} ${y2}` }
    })
    .filter(Boolean)
}

/** Frische Baustein-Kennung: 'eingabe' einmal, sonst schritt2, schritt3, … */
function frischeId(bausteine, art) {
  const belegt = new Set(bausteine.map((b) => b.id))
  if (art === 'eingabe' && !belegt.has('eingabe')) return 'eingabe'
  let n = bausteine.length + 1
  while (belegt.has(`schritt${n}`)) n++
  return `schritt${n}`
}

/** Vorbelegung je Art — leere Felder sind schlimmer als grobe Vorschläge. */
function frischeEinstellungen(art, werkzeug) {
  switch (art) {
    case 'eingabe':
      return { schluessel: 'thema', typ: 'text', vorgabe: '', pflicht: true }
    case 'text':
      return { vorlage: '' }
    case 'werkzeug':
      return { werkzeug: werkzeug || '', argumente: {} }
    case 'agent':
      return { rolle: 'allrounder', name: 'Agent', auftrag: '' }
    case 'gruppe':
      return { name: 'Gruppe', ziel: '', modus: 'parallel', mitglieder: [] }
    case 'bedingung':
      return { pruefung: 'vergleich', links: '', vergleich: 'enthaelt', rechts: '' }
    case 'ausgabe':
      return { vorlage: '', ziel: 'antwort' }
    default:
      return {}
  }
}

/** Ein leerer Ablauf, damit man nie vor dem Nichts sitzt. */
function leererAblauf() {
  return {
    id: 'neuer-ablauf',
    name: 'Neuer Ablauf',
    beschreibung: '',
    bausteine: [
      { id: 'eingabe', art: 'eingabe', beschriftung: 'Thema', einstellungen: frischeEinstellungen('eingabe') },
    ],
    kanten: [],
  }
}

/** Slug erzwingen: ^[a-z0-9][a-z0-9_-]{1,48}$ — sonst kommt man aus dem Ordner heraus. */
function slug(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[äàâ]/g, 'a').replace(/[öô]/g, 'o').replace(/[üû]/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 49)
  return /^[a-z0-9]/.test(s) ? s : `a${s}`.slice(0, 49)
}

/**
 * Ereignisse zu einem Laufzustand eindampfen.
 * WARUM die Filterung nach lauf: zwei Läufe senden dieselben Ereignisnamen.
 * Ohne Filter mischt die Oberfläche sie zu einem einzigen falschen Lauf.
 */
function laufBauen(ereignisse, startZeit) {
  const roh = []
  for (const e of ereignisse || []) {
    if (!e) continue
    // Über den Agenten kommt {type:'tool_stream', kind:'ablauf_…', data:{…}},
    // über den WebSocket flach {type:'ablauf_…', …}. Beide Wege müssen gehen.
    const art = typeof e.kind === 'string' && e.kind.startsWith('ablauf_') ? e.kind : e.type
    if (typeof art !== 'string' || !art.startsWith('ablauf_')) continue
    roh.push({ art, d: e.data && typeof e.data === 'object' ? e.data : e })
  }
  const letzterStart = [...roh].reverse().find((x) => x.art === 'ablauf_start')
  const laufId = letzterStart?.d?.lauf || null

  const stand = {
    lauf: laufId,
    ablauf: letzterStart?.d?.ablauf || null,
    aktiv: new Set(),
    fertig: new Map(),
    fehler: new Map(),
    uebersprungen: new Set(),
    zweig: new Map(),
    status: null,
    ms: 0,
    ausgabe: '',
  }
  if (!laufId) return stand

  for (const { art, d } of roh) {
    if (d.lauf && d.lauf !== laufId) continue
    switch (art) {
      case 'ablauf_start':
        stand.aktiv.clear()
        stand.fertig.clear()
        stand.fehler.clear()
        stand.uebersprungen.clear()
        stand.zweig.clear()
        stand.status = null
        break
      case 'ablauf_baustein_an': {
        stand.aktiv.add(d.id)
        const k = `${laufId}:${d.id}`
        if (!startZeit.has(k)) startZeit.set(k, Date.now())
        break
      }
      case 'ablauf_baustein_aus':
        stand.aktiv.delete(d.id)
        if (d.ok === false) stand.fehler.set(d.id, String(d.ergebnis || 'Fehler'))
        else stand.fertig.set(d.id, { ms: d.ms || 0, vorschau: String(d.ergebnis ?? ''), tok: d.tokProSek })
        break
      case 'ablauf_zweig':
        stand.zweig.set(d.id, d.zweig)
        break
      case 'ablauf_uebersprungen':
        stand.aktiv.delete(d.id)
        stand.uebersprungen.add(d.id)
        break
      case 'ablauf_ende':
        stand.aktiv.clear()
        stand.status = d.status || (d.ok ? 'fertig' : 'fehler')
        stand.ms = d.ms || 0
        stand.ausgabe = String(d.ausgabe ?? '')
        break
      default:
        break
    }
  }
  return stand
}

// ─────────────────────────────────────────────────────────────────────
// Kleine Bauteile
// ─────────────────────────────────────────────────────────────────────

/**
 * Eine Zahl, deren Stellen rollen statt zu springen.
 * WARUM: eine Zahl, die einfach umspringt, liest sich wie ein Fehler.
 * Jede Stelle ist ein Streifen 0–9, --z schiebt ihn an die richtige Stelle.
 */
function Zahl({ wert, einheit }) {
  const text = String(Math.max(0, Math.round(Number(wert) || 0)))
  return (
    <span className="zahl">
      {text.split('').map((z, i) => (
        <span className="ziffer" key={i} style={{ '--z': Number(z) }}>
          <i>
            {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <b key={d}>{d}</b>
            ))}
          </i>
        </span>
      ))}
      {einheit ? <span className="zahl-einheit">{einheit}</span> : null}
    </span>
  )
}

/**
 * Ein Feld für tief verschachtelte Argumente.
 * WARUM eigener Textstand: beim Tippen ist JSON zwischendurch immer kaputt.
 * Würde man direkt in den Ablauf schreiben, verlöre man nach dem ersten
 * Anschlag alles.
 */
function JsonFeld({ marke, wert, lose, onWert }) {
  const [text, setText] = useState(() => JSON.stringify(wert ?? {}, null, 2))
  const [krumm, setKrumm] = useState(false)
  const letzte = useRef(text)

  useEffect(() => {
    const frisch = JSON.stringify(wert ?? {}, null, 2)
    if (frisch !== letzte.current) {
      letzte.current = frisch
      setText(frisch)
      setKrumm(false)
    }
  }, [wert])

  return (
    <label className={`baustein-feld ${krumm || lose ? 'ist-lose' : ''}`} title={lose ? `Verweis zeigt ins Leere: ${lose}` : krumm ? 'Kein gültiges JSON' : ''}>
      <span className="feld-marke">{marke}</span>
      <textarea
        className="feld-json"
        rows={4}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          try {
            const j = JSON.parse(e.target.value || '{}')
            letzte.current = JSON.stringify(j, null, 2)
            setKrumm(false)
            onWert(j)
          } catch {
            setKrumm(true)
          }
        }}
      />
    </label>
  )
}

/** Ein Textfeld, das lose Platzhalter rot markiert. */
function Feld({ marke, wert, lang, lose, onWert, liste }) {
  const kaputt = lose && lose.length
  return (
    <label className={`baustein-feld ${kaputt ? 'ist-lose' : ''}`} title={kaputt ? `Verweis zeigt ins Leere: ${lose.join(' ')}` : ''}>
      <span className="feld-marke">{marke}</span>
      {liste ? (
        <select value={wert ?? ''} onChange={(e) => onWert(e.target.value)}>
          {liste.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      ) : lang ? (
        <textarea rows={3} value={wert ?? ''} spellCheck={false} onChange={(e) => onWert(e.target.value)} />
      ) : (
        <input value={wert ?? ''} spellCheck={false} onChange={(e) => onWert(e.target.value)} />
      )}
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Der Baustein
// ─────────────────────────────────────────────────────────────────────

function Baustein({
  baustein: b,
  bausteine,
  werkzeuge,
  reihe,
  zustand,
  takt,
  gewaehlt,
  offen,
  bindetVon,
  gezogen,
  onWaehlen,
  onFalten,
  onAendern,
  onEinstellung,
  onLoeschen,
  onSchieben,
  onBinden,
  onGriff,
}) {
  const wz = b.art === 'werkzeug' ? werkzeuge.find((w) => w.name === b.einstellungen?.werkzeug) : null
  const gefahr = !!wz?.danger
  const marke = b.art === 'werkzeug' ? b.einstellungen?.werkzeug || 'werkzeug' : b.art
  const lose = (s) => loseVerweise(s, bausteine)
  const ziel = bindetVon && bindetVon !== b.id

  return (
    <article
      className={[
        'baustein',
        `ist-${zustand}`,
        gewaehlt ? 'ist-gewaehlt' : '',
        offen ? 'ist-offen' : '',
        gefahr ? 'hat-gefahr' : '',
        ziel ? 'ist-ziel' : '',
        gezogen ? 'ist-gezogen' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-id={b.id}
      style={{ '--i': reihe }}
      onClick={() => (ziel ? onBinden(b.id) : onWaehlen(b.id))}
    >
      {/* 0 breit, 1px hoch — reiner Messpunkt für die Adern, nichts zum Anfassen */}
      <span className="baustein-anker" data-anker="ein" aria-hidden="true" />

      <header className="baustein-kopf">
        <span
          className="baustein-griff"
          title="ziehen zum Verschieben"
          onPointerDown={(e) => onGriff(e, b.id)}
          aria-hidden="true"
        />
        <span className="baustein-punkt" data-art={b.art} />
        <span className="baustein-marke">{marke}</span>
        <input
          className="baustein-name"
          value={b.beschriftung ?? ''}
          placeholder={b.id}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onAendern({ beschriftung: e.target.value })}
        />
        <span className="baustein-takt">
          {takt ? (
            <>
              <Zahl wert={takt.ms} einheit="ms" />
              {takt.tok ? (
                <>
                  <span className="takt-trenner">·</span>
                  <Zahl wert={takt.tok} einheit="tok/s" />
                </>
              ) : null}
            </>
          ) : (
            <span className="takt-still">{b.id}</span>
          )}
        </span>
        <button
          className="baustein-falten"
          title={offen ? 'zuklappen' : 'aufklappen'}
          onClick={(e) => {
            e.stopPropagation()
            onFalten()
          }}
        >
          {offen ? '−' : '+'}
        </button>
      </header>

      <div className="baustein-leib">
        <div className="baustein-felder" onClick={(e) => e.stopPropagation()}>
          {b.art === 'eingabe' && (
            <>
              <Feld marke="schluessel" wert={b.einstellungen.schluessel} onWert={(v) => onEinstellung({ schluessel: v })} />
              <Feld marke="typ" wert={b.einstellungen.typ || 'text'} liste={['text', 'zahl', 'ja_nein', 'auswahl']} onWert={(v) => onEinstellung({ typ: v })} />
              <Feld marke="vorgabe" wert={b.einstellungen.vorgabe} onWert={(v) => onEinstellung({ vorgabe: v })} />
            </>
          )}

          {b.art === 'text' && (
            <Feld marke="vorlage" lang wert={b.einstellungen.vorlage} lose={lose(b.einstellungen.vorlage)} onWert={(v) => onEinstellung({ vorlage: v })} />
          )}

          {b.art === 'werkzeug' && (
            <>
              <Feld
                marke="werkzeug"
                wert={b.einstellungen.werkzeug}
                liste={['', ...werkzeuge.map((w) => w.name)]}
                onWert={(v) => onEinstellung({ werkzeug: v })}
              />
              <JsonFeld
                marke="argumente"
                wert={b.einstellungen.argumente}
                lose={loseVerweise(JSON.stringify(b.einstellungen.argumente ?? {}), bausteine).join(' ') || null}
                onWert={(v) => onEinstellung({ argumente: v })}
              />
              {wz?.description ? <p className="baustein-hinweis">{wz.description}</p> : null}
            </>
          )}

          {b.art === 'agent' && (
            <>
              <Feld marke="rolle" wert={b.einstellungen.rolle} liste={ROLLEN} onWert={(v) => onEinstellung({ rolle: v })} />
              <Feld marke="name" wert={b.einstellungen.name} onWert={(v) => onEinstellung({ name: v })} />
              <Feld marke={t('task')} lang wert={b.einstellungen.auftrag} lose={lose(b.einstellungen.auftrag)} onWert={(v) => onEinstellung({ auftrag: v })} />
            </>
          )}

          {b.art === 'gruppe' && (
            <>
              <Feld marke="name" wert={b.einstellungen.name} onWert={(v) => onEinstellung({ name: v })} />
              <Feld marke="ziel" lang wert={b.einstellungen.ziel} lose={lose(b.einstellungen.ziel)} onWert={(v) => onEinstellung({ ziel: v })} />
              <Feld marke="modus" wert={b.einstellungen.modus || 'parallel'} liste={['parallel', 'nacheinander']} onWert={(v) => onEinstellung({ modus: v })} />
              <JsonFeld marke="mitglieder" wert={b.einstellungen.mitglieder || []} onWert={(v) => onEinstellung({ mitglieder: v })} />
            </>
          )}

          {b.art === 'bedingung' && (
            <>
              <Feld marke="pruefung" wert={b.einstellungen.pruefung || 'vergleich'} liste={['vergleich', 'gehirn']} onWert={(v) => onEinstellung({ pruefung: v })} />
              {(b.einstellungen.pruefung || 'vergleich') === 'vergleich' ? (
                <>
                  <Feld marke="links" wert={b.einstellungen.links} lose={lose(b.einstellungen.links)} onWert={(v) => onEinstellung({ links: v })} />
                  <Feld marke="vergleich" wert={b.einstellungen.vergleich} liste={VERGLEICHE} onWert={(v) => onEinstellung({ vergleich: v })} />
                  <Feld marke="rechts" wert={b.einstellungen.rechts} onWert={(v) => onEinstellung({ rechts: v })} />
                </>
              ) : (
                <>
                  <Feld marke="frage" lang wert={b.einstellungen.frage} onWert={(v) => onEinstellung({ frage: v })} />
                  <Feld marke="quelle" wert={b.einstellungen.quelle} lose={lose(b.einstellungen.quelle)} onWert={(v) => onEinstellung({ quelle: v })} />
                </>
              )}
            </>
          )}

          {b.art === 'ausgabe' && (
            <>
              <Feld marke="ziel" wert={b.einstellungen.ziel || 'antwort'} liste={ZIELE} onWert={(v) => onEinstellung({ ziel: v })} />
              <Feld marke="vorlage" lang wert={b.einstellungen.vorlage} lose={lose(b.einstellungen.vorlage)} onWert={(v) => onEinstellung({ vorlage: v })} />
              {b.einstellungen.ziel === 'obsidian' && (
                <Feld marke="notiz" wert={b.einstellungen.notiz} onWert={(v) => onEinstellung({ notiz: v })} />
              )}
              {b.einstellungen.ziel === 'datei' && (
                <Feld marke="pfad" wert={b.einstellungen.pfad} onWert={(v) => onEinstellung({ pfad: v })} />
              )}
            </>
          )}

          <div className="baustein-zeile">
            <Feld marke="merker" wert={b.merker} onWert={(v) => onAendern({ merker: v || undefined })} />
            <Feld marke="bei Fehler" wert={b.beiFehler || 'stoppen'} liste={BEI_FEHLER} onWert={(v) => onAendern({ beiFehler: v })} />
          </div>

          <div className="baustein-werkzeuge">
            <button className="baustein-tat" onClick={() => onSchieben(-1)} title="nach oben">↑</button>
            <button className="baustein-tat" onClick={() => onSchieben(1)} title="nach unten">↓</button>
            <button className={`baustein-tat ${bindetVon === b.id ? 'on' : ''}`} onClick={() => onBinden(b.id)} title="verbinden">
              verbinden
            </button>
            <button className="baustein-tat danger" onClick={onLoeschen} title="löschen">
              löschen
            </button>
          </div>
        </div>
      </div>

      {(zustand === 'fertig' || zustand === 'fehler') && takt?.vorschau ? (
        <footer className="baustein-fuss">{takt.vorschau}</footer>
      ) : null}

      <span className="baustein-anker" data-anker="aus" aria-hidden="true" />
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Die Werkstatt
// ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {(text:string)=>void} p.onSenden  schickt einen Auftrag an URAI
 * @param {boolean} p.busy                  URAI arbeitet schon
 * @param {Array} p.ereignisse              die letzten ablauf_*-Ereignisse
 * @param {()=>void} [p.onStopp]            optional: Stopp über den WebSocket
 */
export default function Werkstatt({ onSenden, busy, ereignisse = [], onStopp }) {
  const [liste, setListe] = useState([])
  const [ablauf, setAblauf] = useState(leererAblauf)
  const [werkzeuge, setWerkzeuge] = useState([])
  const [gruppen, setGruppen] = useState({})
  const [suche, setSuche] = useState('')
  const [gewaehlt, setGewaehlt] = useState(null)
  const [offene, setOffene] = useState(() => new Set())
  const [bindetVon, setBindetVon] = useState(null)
  const [zielLuecke, setZielLuecke] = useState(null)
  const [blattAuf, setBlattAuf] = useState(false)
  const [meldung, setMeldung] = useState('')
  const [schmutzig, setSchmutzig] = useState(false)
  const [pruefung, setPruefung] = useState(null)
  const [adern, setAdern] = useState([])
  const [, setTick] = useState(0)

  const spur = useRef(null)
  const startZeit = useRef(new Map())
  const zug = useRef(null)
  const [gezogen, setGezogen] = useState(null)

  // ── Daten holen ──────────────────────────────────────────────────
  useEffect(() => {
    let lebt = true
    fetch('/api/ablaeufe')
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => lebt && setListe(Array.isArray(j) ? j : []))
      .catch(() => {})
    fetch('/api/tools')
      .then((r) => r.json())
      .then((j) => {
        if (!lebt) return
        setWerkzeuge(j.tools || [])
        setGruppen(j.groups || {})
      })
      .catch(() => {})
    return () => {
      lebt = false
    }
  }, [])

  // ── Laufzustand aus den Ereignissen ──────────────────────────────
  const lauf = useMemo(() => laufBauen(ereignisse, startZeit.current), [ereignisse])
  // Nur mitleuchten, wenn wirklich DIESER Ablauf läuft
  const meiner = lauf.ablauf == null || lauf.ablauf === ablauf.id
  const laeuft = meiner && lauf.aktiv.size > 0

  // Die laufende Zeit tickt hier, nicht auf dem Server — der schickt sein ms
  // erst am Ende. Ohne Ticker stünde die Zahl still, solange es spannend ist.
  useEffect(() => {
    if (!laeuft) return
    const h = setInterval(() => setTick((x) => x + 1), 120)
    return () => clearInterval(h)
  }, [laeuft])

  // ── Kanten, Wellen, Reihen ───────────────────────────────────────
  const kanten = useMemo(() => kantenAufloesen(ablauf), [ablauf])
  const { wellen, zyklus } = useMemo(() => wellenRechnen(ablauf.bausteine, kanten), [ablauf.bausteine, kanten])
  // Bausteine im Zyklus kämen nie dran — sie trotzdem zeigen, sonst sind sie weg
  const reihen = useMemo(() => (zyklus.length ? [...wellen, zyklus] : wellen), [wellen, zyklus])
  const nachId = useMemo(() => new Map(ablauf.bausteine.map((b) => [b.id, b])), [ablauf.bausteine])

  // ── Adern messen ─────────────────────────────────────────────────
  const messen = useCallback(() => {
    const frisch = adernRechnen(spur.current, kanten)
    // WARUM der Vergleich: der MutationObserver feuert sonst auf die eigene
    // Ausgabe zurück und wir messen in einer Endlosschleife.
    setAdern((alt) =>
      alt.length === frisch.length && alt.every((a, i) => a.d === frisch[i].d && a.id === frisch[i].id) ? alt : frisch
    )
  }, [kanten])

  useLayoutEffect(() => {
    const el = spur.current
    if (!el) return
    messen()
    const ro = new ResizeObserver(messen)
    ro.observe(el)
    const mo = new MutationObserver(messen)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [messen])

  // Die Länge kann nur der Browser sagen. --laenge trägt den Durchzeichnen-Strich.
  useLayoutEffect(() => {
    if (!spur.current) return
    for (const p of spur.current.querySelectorAll('.ader-zug')) {
      const l = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 0
      p.style.setProperty('--laenge', String(Math.max(1, Math.round(l))))
    }
  }, [adern])

  // ── Live prüfen, ohne zu speichern ───────────────────────────────
  useEffect(() => {
    if (!ablauf.bausteine.length) return
    const h = setTimeout(() => {
      fetch(`/api/ablaeufe/${encodeURIComponent(ablauf.id)}/pruefen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ablauf),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setPruefung(j))
        .catch(() => {})
    }, 420)
    return () => clearTimeout(h)
  }, [ablauf])

  // ── Bearbeiten ───────────────────────────────────────────────────
  const setzen = useCallback((f) => {
    setAblauf((a) => {
      const neu = f(a)
      return neu === a ? a : neu
    })
    setSchmutzig(true)
  }, [])

  function aendern(id, patch) {
    setzen((a) => ({ ...a, bausteine: a.bausteine.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
  }

  function einstellung(id, patch) {
    setzen((a) => ({
      ...a,
      bausteine: a.bausteine.map((b) => (b.id === id ? { ...b, einstellungen: { ...b.einstellungen, ...patch } } : b)),
    }))
  }

  /** Neuen Baustein an Position `pos` einsetzen und die Kette dort auftrennen. */
  function einfuegen(art, werkzeug, pos) {
    setzen((a) => {
      const id = frischeId(a.bausteine, art)
      const neu = {
        id,
        art,
        beschriftung: werkzeug || ARTEN.find((x) => x.art === art)?.name || art,
        einstellungen: frischeEinstellungen(art, werkzeug),
      }
      const stelle = pos == null ? a.bausteine.length : Math.max(0, Math.min(pos, a.bausteine.length))
      const bausteine = [...a.bausteine.slice(0, stelle), neu, ...a.bausteine.slice(stelle)]
      const vor = a.bausteine[stelle - 1]
      const nach = a.bausteine[stelle]
      let kanten = a.kanten || []
      if (vor && nach) {
        // Die durchtrennte Kante wird zu zwei — sonst hinge der Neue daneben
        kanten = kanten.filter((k) => !(k.von === vor.id && k.nach === nach.id))
      }
      if (vor) kanten = [...kanten, { von: vor.id, nach: id }]
      if (nach) kanten = [...kanten, { von: id, nach: nach.id }]
      return { ...a, bausteine, kanten }
    })
    setZielLuecke(null)
    setBlattAuf(false)
  }

  /** Löschen heilt die Kette: was vorher durchlief, läuft weiter durch. */
  function loeschen(id) {
    setzen((a) => {
      const rein = (a.kanten || []).filter((k) => k.nach === id)
      const raus = (a.kanten || []).filter((k) => k.von === id)
      const heilung = []
      for (const r of rein) for (const s of raus) if (r.von !== s.nach) heilung.push({ von: r.von, nach: s.nach, zweig: r.zweig })
      return {
        ...a,
        bausteine: a.bausteine.filter((b) => b.id !== id),
        kanten: [...(a.kanten || []).filter((k) => k.von !== id && k.nach !== id), ...heilung],
      }
    })
    setGewaehlt((g) => (g === id ? null : g))
  }

  /**
   * Verschieben. WARUM zwei Fälle: bei einer geraden Kette (der Normalfall)
   * müssen die Kanten mitwandern, sonst ändert sich nichts Sichtbares.
   * Bei verzweigten Abläufen bestimmen die Kanten die Reihen — dann ändert
   * die Liste nur, wer innerhalb einer Gabel links steht.
   */
  function verschiebenAuf(id, pos) {
    setzen((a) => {
      const alt = a.bausteine.findIndex((b) => b.id === id)
      if (alt < 0) return a
      const ohne = a.bausteine.filter((b) => b.id !== id)
      const stelle = Math.max(0, Math.min(pos > alt ? pos - 1 : pos, ohne.length))
      const bausteine = [...ohne.slice(0, stelle), a.bausteine[alt], ...ohne.slice(stelle)]
      const kette =
        (a.kanten || []).every((k) => !k.zweig) &&
        a.bausteine.every(
          (b) =>
            (a.kanten || []).filter((k) => k.von === b.id).length <= 1 &&
            (a.kanten || []).filter((k) => k.nach === b.id).length <= 1
        )
      if (!kette) return { ...a, bausteine }
      const kanten = bausteine.slice(0, -1).map((b, i) => ({ von: b.id, nach: bausteine[i + 1].id }))
      return { ...a, bausteine, kanten }
    })
  }

  function schieben(id, richtung) {
    const i = ablauf.bausteine.findIndex((b) => b.id === id)
    if (i < 0) return
    verschiebenAuf(id, Math.max(0, Math.min(i + richtung + (richtung > 0 ? 1 : 0), ablauf.bausteine.length)))
  }

  function binden(id) {
    if (!bindetVon) return setBindetVon(id)
    if (bindetVon === id) return setBindetVon(null)
    setzen((a) => {
      const gibt = (a.kanten || []).some((k) => k.von === bindetVon && k.nach === id)
      return {
        ...a,
        kanten: gibt
          ? (a.kanten || []).filter((k) => !(k.von === bindetVon && k.nach === id))
          : [...(a.kanten || []), { von: bindetVon, nach: id }],
      }
    })
    setBindetVon(null)
  }

  function aderWeg(kante) {
    if (kante.implizit) return setMeldung('Diese Ader kommt aus einem Platzhalter — nimm den Verweis heraus.')
    setzen((a) => ({ ...a, kanten: (a.kanten || []).filter((k) => !(k.von === kante.von && k.nach === kante.nach)) }))
  }

  // ── Ziehen mit dem Zeiger ────────────────────────────────────────
  // WARUM nicht HTML5-Drag-and-Drop: Safari malt daraus ein kaputtes
  // Geisterbild, sobald die Karte gefiltert ist — und Touch geht gar nicht.
  function griffRunter(e, id) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    zug.current = { id, zeiger: e.pointerId, pos: null }
    setGezogen(id)
    const bewegen = (ev) => {
      const el = spur.current
      if (!el || !zug.current) return
      const karten = [...el.querySelectorAll('.baustein')]
      let pos = karten.length
      for (let i = 0; i < karten.length; i++) {
        const r = karten[i].getBoundingClientRect()
        if (ev.clientY < r.top + r.height / 2) {
          pos = i
          break
        }
      }
      zug.current.pos = pos
    }
    const hoch = () => {
      const z = zug.current
      zug.current = null
      setGezogen(null)
      window.removeEventListener('pointermove', bewegen)
      window.removeEventListener('pointerup', hoch)
      window.removeEventListener('pointercancel', hoch)
      if (z && z.pos != null) verschiebenAuf(z.id, z.pos)
    }
    window.addEventListener('pointermove', bewegen)
    window.addEventListener('pointerup', hoch)
    window.addEventListener('pointercancel', hoch)
  }

  // ── Ablegen und Holen ────────────────────────────────────────────
  async function laden(id) {
    try {
      const r = await fetch(`/api/ablaeufe/${encodeURIComponent(id)}`)
      const j = await r.json()
      if (j?.bausteine) {
        setAblauf({ kanten: [], ...j })
        setSchmutzig(false)
        setGewaehlt(null)
        setMeldung('')
      } else setMeldung(j?.fehler || 'Ablauf nicht lesbar.')
    } catch (err) {
      setMeldung(err.message)
    }
  }

  async function speichern() {
    const rein = { ...ablauf, id: slug(ablauf.id) }
    setMeldung(t('saving'))
    try {
      let r = await fetch('/api/ablaeufe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(rein),
      })
      // Ältere Stände kennen nur PUT auf die einzelne Kennung
      if (r.status === 404 || r.status === 405) {
        r = await fetch(`/api/ablaeufe/${encodeURIComponent(rein.id)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(rein),
        })
      }
      const j = await r.json()
      if (!r.ok) throw new Error(j?.fehler || `Server sagt ${r.status}`)
      setAblauf(j.ablauf || rein)
      setSchmutzig(false)
      setMeldung((j.warnungen || []).length ? `Gespeichert · ${j.warnungen.length} Warnung(en)` : 'Gespeichert.')
      const l = await fetch('/api/ablaeufe').then((x) => x.json())
      setListe(Array.isArray(l) ? l : [])
    } catch (err) {
      setMeldung(err.message)
    }
  }

  /**
   * Starten geht über URAI, nicht per REST: nur so laufen die Ereignisse
   * in derselben Verbindung wie alles andere und der Stopp-Knopf greift.
   */
  function starten() {
    const eingaben = {}
    for (const b of ablauf.bausteine) {
      if (b.art !== 'eingabe') continue
      const s = b.einstellungen?.schluessel || b.id
      eingaben[s] = b.einstellungen?.vorgabe ?? ''
    }
    onSenden?.(
      `Starte den gespeicherten Ablauf "${ablauf.id}" mit dem Werkzeug ablauf_starten.\n` +
        `Eingaben: ${JSON.stringify(eingaben)}\n` +
        `Nichts weiter tun, nur starten und danach das Ergebnis zeigen.`
    )
  }

  // ── Palette ──────────────────────────────────────────────────────
  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase()
    if (!s) return werkzeuge
    return werkzeuge.filter((w) => w.name.includes(s) || (w.description || '').toLowerCase().includes(s))
  }, [werkzeuge, suche])

  const gruppenListe = useMemo(() => {
    const drin = new Set(gefiltert.map((w) => w.name))
    return Object.entries(gruppen)
      .map(([name, namen]) => [name, namen.filter((n) => drin.has(n))])
      .filter(([, namen]) => namen.length)
  }, [gruppen, gefiltert])

  // WARUM eine Funktion und kein eigenes Bauteil: ein im Rumpf definiertes
  // Bauteil ist bei jedem Zeichnen ein NEUER Typ — React hängt den Teilbaum
  // dann ab und wieder an, und das Suchfeld verliert nach jedem Anschlag
  // den Fokus. Als Funktion bleibt es derselbe Baum.
  function palette(streifen) {
    return (
      <>
        <input
          className="lade-suche"
          value={suche}
          placeholder="Werkzeug suchen"
          onChange={(e) => setSuche(e.target.value)}
        />
        <div className="lade-gruppe">
          <h4>Bausteine</h4>
          {ARTEN.map((a, i) => (
            <button key={a.art} className="lade-kachel" style={{ '--i': i }} title={a.was} onClick={() => einfuegen(a.art, null, zielLuecke)}>
              <span className="baustein-punkt" data-art={a.art} />
              {a.name}
            </button>
          ))}
        </div>
        {gruppenListe.map(([name, namen]) => (
          <div className="lade-gruppe" key={name}>
            <h4>{name}</h4>
            {namen.map((n, i) => {
              const w = werkzeuge.find((x) => x.name === n)
              return (
                <button
                  key={n}
                  className={`lade-kachel ${w?.danger ? 'hat-gefahr' : ''}`}
                  style={{ '--i': i }}
                  title={w?.description || n}
                  onClick={() => einfuegen('werkzeug', n, zielLuecke)}
                >
                  {n}
                </button>
              )
            })}
          </div>
        ))}
        {streifen ? null : (
          <div className="lade-gruppe">
            <h4>Abläufe</h4>
            <button className="lade-kachel" onClick={() => { setAblauf(leererAblauf()); setSchmutzig(true) }}>
              + neuer Ablauf
            </button>
            {liste.map((a) => (
              <button key={a.id} className={`lade-kachel ${a.id === ablauf.id ? 'on' : ''}`} title={a.beschreibung} onClick={() => laden(a.id)}>
                {a.name || a.id}
              </button>
            ))}
          </div>
        )}
      </>
    )
  }

  // ── Zustand je Baustein ──────────────────────────────────────────
  function zustandVon(id) {
    if (!meiner) return 'ruhe'
    if (lauf.aktiv.has(id)) return 'laeuft'
    if (lauf.fehler.has(id)) return 'fehler'
    if (lauf.uebersprungen.has(id)) return 'uebersprungen'
    if (lauf.fertig.has(id)) return 'fertig'
    if (lauf.lauf) return 'bereit'
    return 'ruhe'
  }

  function taktVon(id) {
    if (!meiner) return null
    if (lauf.aktiv.has(id)) {
      const ab = startZeit.current.get(`${lauf.lauf}:${id}`) || Date.now()
      return { ms: Date.now() - ab }
    }
    const f = lauf.fertig.get(id)
    if (f) return { ms: f.ms, tok: f.tok, vorschau: f.vorschau }
    const e = lauf.fehler.get(id)
    if (e) return { ms: 0, vorschau: e }
    return null
  }

  // Position in der Bausteinliste, an der eine Lücke einsetzt
  function lueckenPos(r) {
    if (r >= reihen.length) return ablauf.bausteine.length
    const erste = reihen[r]?.[0]
    const i = ablauf.bausteine.findIndex((b) => b.id === erste)
    return i < 0 ? ablauf.bausteine.length : i
  }

  const aktiveAdern = useMemo(() => {
    const s = new Set()
    if (!meiner) return s
    for (const k of kanten) if (lauf.fertig.has(k.von) && lauf.aktiv.has(k.nach)) s.add(k.id)
    return s
  }, [kanten, lauf, meiner])

  const fertig = meiner && lauf.status === 'fertig'
  const warnungen = [
    ...(zyklus.length ? [`Kreis: ${zyklus.join(', ')} käme nie dran.`] : []),
    ...((pruefung?.fehler || []).map((f) => `${f.baustein ? f.baustein + ': ' : ''}${f.text}`)),
  ]

  // Fortlaufende Nummer über alle Reihen hinweg — sie füttert --i und damit
  // die Staffelung von bausteinSetzen und blattStaffel.
  let nummer = 0
  function karteZeichnen(id) {
    const b = nachId.get(id)
    if (!b) return null
    const i = nummer++
    return (
      <Baustein
        key={id}
        baustein={b}
        bausteine={ablauf.bausteine}
        werkzeuge={werkzeuge}
        reihe={i}
        zustand={zustandVon(id)}
        takt={taktVon(id)}
        gewaehlt={gewaehlt === id}
        offen={offene.has(id)}
        bindetVon={bindetVon}
        gezogen={gezogen === id}
        onWaehlen={setGewaehlt}
        onFalten={() =>
          setOffene((s) => {
            const n = new Set(s)
            if (n.has(id)) n.delete(id)
            else n.add(id)
            return n
          })
        }
        onAendern={(p) => aendern(id, p)}
        onEinstellung={(p) => einstellung(id, p)}
        onLoeschen={() => loeschen(id)}
        onSchieben={(d) => schieben(id, d)}
        onBinden={binden}
        onGriff={griffRunter}
      />
    )
  }

  return (
    <>
      <div className={`ablauf ${fertig ? 'ist-fertig' : ''} ${laeuft ? 'ist-laufend' : ''}`}>
        {/* ist-streifen greift erst in der Container-Abfrage unter 900px */}
        <aside className="ablauf-lade ist-streifen">{palette(false)}</aside>

        <div className="ablauf-bahn">
          <div className="ablauf-spur" ref={spur}>
            {/* Das SVG liegt IN der Spur — im Scroll-Container müsste man
                bei jedem Scroll alle Pfade nachziehen. */}
            <svg className="ablauf-adern" aria-hidden="true">
              {adern.map((k) => (
                <g key={k.id} className={`ader ${k.implizit ? 'ist-implizit' : ''} ${aktiveAdern.has(k.id) ? 'ist-aktiv' : ''}`}>
                  <path className="ader-grund" d={k.d} id={`ader-${k.i}`} />
                  <path className="ader-zug" d={k.d} style={{ '--i': k.i }} />
                  <path className="ader-fluss" d={k.d} />
                  <path className="ader-griff" d={k.d} onClick={() => aderWeg(k)} />
                  {aktiveAdern.has(k.id) ? (
                    <circle className="paket" r="3" key={`${lauf.lauf}-${k.id}`}>
                      <animateMotion dur="0.7s" fill="freeze">
                        <mpath href={`#ader-${k.i}`} />
                      </animateMotion>
                    </circle>
                  ) : null}
                </g>
              ))}
            </svg>

            {reihen.map((reihe, r) => (
              <React.Fragment key={`reihe-${r}-${reihe[0]}`}>
                <div className="bau-luecke">
                  <button
                    className="bau-einfuegen"
                    title="Baustein einsetzen"
                    onClick={() => {
                      setZielLuecke(lueckenPos(r))
                      setBlattAuf(true)
                    }}
                  >
                    +
                  </button>
                </div>

                {reihe.length > 1 ? (
                  <div className="bau-gabel">
                    {reihe.map((id, z) => (
                      <div className="bau-zweig" key={id} style={{ '--i': z }}>
                        {/* Gestapelt unter 620px bleibt sonst unklar, was parallel lief */}
                        <span className="bau-zweig-marke">
                          Zweig {z + 1} von {reihe.length}
                        </span>
                        {karteZeichnen(id)}
                      </div>
                    ))}
                    {/* Der Zusammenfluss hängt am Boden der GABEL, nicht an der
                        Karte — sonst baumeln kurze Zweige in der Luft. */}
                    <span className="bau-gabel-anker" aria-hidden="true" />
                  </div>
                ) : (
                  karteZeichnen(reihe[0])
                )}
              </React.Fragment>
            ))}

            <div className="bau-luecke">
              <button
                className="bau-einfuegen"
                title="Baustein anhängen"
                onClick={() => {
                  setZielLuecke(ablauf.bausteine.length)
                  setBlattAuf(true)
                }}
              >
                +
              </button>
            </div>

            {!ablauf.bausteine.length && <p className="ablauf-leer">Noch kein Baustein. Links eins aussuchen.</p>}
          </div>
        </div>

        <button className="ablauf-plus" title="Bausteine" onClick={() => setBlattAuf((v) => !v)}>
          +
        </button>

        <div className="ablauf-fuss">
          {/* Handeln (Name, Start/Stopp/Speichern) und Status (Takt, Meldung,
              Warnung) sind zwei verschiedene Anliegen — getrennte Zeilen statt
              einer Reihe aus bis zu neun Elementen wirken deutlich ruhiger. */}
          <div className="ablauf-fuss-haupt">
            <input
              className="ablauf-name"
              value={ablauf.name}
              placeholder="Name"
              onChange={(e) =>
                setzen((a) => ({
                  ...a,
                  name: e.target.value,
                  // WARUM: solange der Ablauf noch nie gespeichert wurde, folgt
                  // die Kennung dem Namen. Danach nicht mehr — sonst wandert
                  // die Datei unter data/ablaeufe/ bei jedem Tippen weiter.
                  id: liste.some((x) => x.id === a.id) ? a.id : slug(e.target.value),
                }))
              }
            />
            <span className="ablauf-kennung">{slug(ablauf.id)}</span>

            <button className="primary" disabled={busy || !ablauf.bausteine.length} onClick={starten}>
              {laeuft ? t('running') : t('go')}
            </button>
            {onStopp && (
              <button className="danger" disabled={!busy && !laeuft} onClick={onStopp}>
                {t('stop')}
              </button>
            )}
            <button disabled={!schmutzig} onClick={speichern}>
              {t('save')}
            </button>
          </div>

          <div className="ablauf-fuss-status">
            <span className="ablauf-tempo">
              {lauf.ms ? <Zahl wert={lauf.ms} einheit="ms" /> : <span className="takt-still">{ablauf.bausteine.length} Bausteine</span>}
            </span>

            {meldung ? <span className="ablauf-meldung">{meldung}</span> : null}
            {warnungen.length ? (
              <span className="ablauf-warnung" title={warnungen.join('\n')}>
                {warnungen.length} Warnung(en)
              </span>
            ) : null}
            {bindetVon ? <span className="ablauf-meldung">Ziel anklicken — von {bindetVon}</span> : null}
          </div>
        </div>

        {fertig && (
          <div className="ablauf-fahne">
            <strong>fertig</strong>
            <Zahl wert={lauf.ms} einheit="ms" />
            {lauf.ausgabe ? <p>{lauf.ausgabe.slice(0, 400)}</p> : null}
          </div>
        )}
      </div>

      {/* WARUM außerhalb von .ablauf: container-type:inline-size macht dort
          einen Containment-Kontext — position:fixed hinge am Container. */}
      {blattAuf && (
        <div className="lade-blatt">
          <div className="blatt-kopf">
            <strong>{zielLuecke == null ? 'Bausteine' : `Einsetzen an Stelle ${zielLuecke + 1}`}</strong>
            <button onClick={() => { setBlattAuf(false); setZielLuecke(null) }}>{t('cancel')}</button>
          </div>
          {palette(true)}
        </div>
      )}
    </>
  )
}
