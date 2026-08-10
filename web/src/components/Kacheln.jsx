import React, { useEffect, useState } from 'react'
import '../kacheln.css'

/**
 * Das Kachel-Armaturenbrett der JARVIS-Haut.
 *
 * Die Vorlage legt rundherum kleine Kacheln aus: Beschriftung in gesperrter
 * Monospace, ein großer Wert, eine Nebenzeile. Genau das macht ein HUD aus —
 * man sieht den Zustand, ohne zu fragen.
 *
 * Was hier NICHT steht, ist der Grund, warum man ihm glauben darf: kein
 * Wetter, keine Börse, kein Nahverkehr. URAI kennt diese Dinge nicht, und
 * eine hübsche Kachel mit einer ausgedachten Zahl entwertet auch alle
 * anderen daneben. Übrig bleiben sechs Werte, die der Server wirklich
 * liefert — plus die Uhr, die der Rechner selbst weiß. Steht ein Wert
 * gerade nicht fest, steht dort ein Strich, so wie in der HUD-Leiste.
 *
 * Ein einziger Takt für alle Kacheln. Vier Endpunkte einzeln zu pollen
 * hieße vier Wecker, die sich gegenseitig ins Wort fallen; so gibt es
 * genau ein Bild pro Runde und die Kacheln springen nie einzeln.
 */

// Dreißig Sekunden. Häufiger bringt nichts: Abläufe, Auslöser und das
// Speicherbudget ändern sich in Minuten, nicht in Sekunden — und der
// Server hier ist derselbe Rechner, den der Nutzer gerade benutzt.
const TAKT = 30000

// Die paar Wörter, die wirklich Wörter sind. Bewusst hier und nicht in
// i18n.js: sechs Fragen und vier Vokabeln rechtfertigen keinen Eintrag im
// großen Wörterbuch, und die Sprache steht ohnehin schon in der Antwort
// von /api/status.
const WORTE = {
  de: {
    gehirn: 'Welches Gehirn benutzt du gerade?',
    speicher: 'Wie viel Arbeitsspeicher ist gerade frei?',
    lokal: 'Was läuft gerade lokal?',
    ablaeufe: 'Welche Abläufe habe ich?',
    ausloeser: 'Welche Auslöser sind gesetzt?',
    zuege: 'Züge in 24 h',
    gesamt: 'gesamt',
    wartend: 'wartend',
    keine: 'noch keine',
  },
  en: {
    gehirn: 'Which brain are you using right now?',
    speicher: 'How much memory is free right now?',
    lokal: 'What is running locally right now?',
    ablaeufe: 'Which routines do I have?',
    ausloeser: 'Which triggers are set?',
    zuege: 'calls in 24 h',
    gesamt: 'total',
    wartend: 'queued',
    keine: 'none yet',
  },
}

/**
 * Horcht am <html>, ob die JARVIS-Haut an ist.
 *
 * Wortgleich zu JarvisLeiste.jsx, und das mit Absicht: die Haut hängt an
 * einem Attribut statt an React-State (siehe theme.js), damit sie schon
 * beim ersten Bild sitzt. Ein zweiter, klügerer Weg dafür wäre ein zweiter
 * Weg, der irgendwann anders entscheidet als der erste.
 */
function useJarvisHaut() {
  const [an, setAn] = useState(() => document.documentElement.dataset.haut === 'jarvis')

  useEffect(() => {
    const el = document.documentElement
    const pruefen = () => setAn(el.dataset.haut === 'jarvis')
    // Zwischen erstem Zeichnen und diesem Effekt kann bereits umgeschaltet
    // worden sein — einmal nachfassen, sonst bleibt der Erststand hängen.
    pruefen()
    const beobachter = new MutationObserver(pruefen)
    beobachter.observe(el, { attributes: true, attributeFilter: ['data-haut'] })
    return () => beobachter.disconnect()
  }, [])

  return an
}

/** Holt JSON. Wirft bei allem, was keine 2xx-Antwort ist. */
async function holen(pfad, signal) {
  const antwort = await fetch(pfad, { cache: 'no-store', signal })
  if (!antwort.ok) throw new Error(String(antwort.status))
  return antwort.json()
}

/**
 * Welches Gehirn kommt JETZT dran?
 *
 * Nicht einfach das erste der Kette: ein Anbieter, der gerade schläft
 * (Kontingent leer, Fehler), wird übersprungen. Die Kachel soll dasselbe
 * behaupten wie der Agent im nächsten Zug tatsächlich tut.
 */
function aktivesGehirn(status) {
  const kette = status?.brain?.chain
  if (!Array.isArray(kette) || !kette.length) return null
  const schlafend = new Set((status.brain.kaputt || []).map((k) => k.provider))
  return kette.find((p) => !schlafend.has(p)) ?? null
}

/**
 * Aus der Kennung einen Namen machen: "eigen:ollamatest" → "OLLAMA".
 * Die Klartextnamen stehen in derselben Antwort, also raten wir nicht.
 */
function gehirnName(id, config) {
  if (!id) return null
  if (id.startsWith('eigen:')) {
    const eigener = (config?.customProviders || []).find((p) => p.id === id.slice(6))
    return (eigener?.name || id.slice(6)).toUpperCase().slice(0, 14)
  }
  if (id.startsWith('key:')) {
    // Zusatz-Schlüssel gehören zu einem der bekannten Anbieter — der Name
    // des Anbieters sagt mehr als die interne Schlüsselkennung.
    const s = (config?.schluessel || []).find((x) => x.id === id.slice(4))
    return (s?.anbieter || id.slice(4)).toUpperCase().slice(0, 14)
  }
  return id.toUpperCase().slice(0, 14)
}

/** Zahl oder Strich — nie eine leere Kachel und nie eine geratene Null. */
function zahl(wert) {
  return wert == null ? '—' : String(wert)
}

function gigabyte(bytes) {
  return typeof bytes === 'number' && bytes > 0 ? Math.round(bytes / 1024 ** 3) : null
}

/**
 * Eine Kachel.
 *
 * Bewusst ein <div> mit role="button" statt eines echten <button>: die
 * Oberfläche hat globale Knopf-Stile (Rahmen, Radius, Polsterung), gegen
 * die eine Kachel sonst mit lauter Ausnahmen ankämpfen müsste. Tastatur
 * und Vorlesehilfen bekommen sie über Rolle, Tabstopp und Tastendruck
 * trotzdem vollständig.
 */
function Kachel({ marke, neben, wert, unter, anteil, warnung, frage, onFrage }) {
  const klickbar = typeof onFrage === 'function' && !!frage
  const ausloesen = klickbar ? () => onFrage(frage) : undefined

  return (
    <div
      className={`ka-kachel${warnung ? ' ka-ist-warnung' : ''}${klickbar ? ' ka-ist-klickbar' : ''}`}
      role={klickbar ? 'button' : undefined}
      tabIndex={klickbar ? 0 : undefined}
      aria-label={klickbar ? frage : undefined}
      onClick={ausloesen}
      onKeyDown={
        klickbar
          ? (e) => {
              // Leertaste würde sonst die Seite scrollen statt zu fragen
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                ausloesen()
              }
            }
          : undefined
      }
    >
      <div className="ka-kopf">
        <span className="ka-marke">{marke}</span>
        {neben ? <span className="ka-neben">{neben}</span> : null}
      </div>

      <div className="ka-wert">{wert}</div>

      {anteil != null && (
        <div className="ka-schiene">
          <div className="ka-balken" style={{ width: `${Math.max(0, Math.min(100, anteil))}%` }} />
        </div>
      )}

      <div className="ka-unter">{unter}</div>
    </div>
  )
}

/**
 * @param {(text: string) => void} [onFrage]  Klick auf eine Kachel stellt
 *        die passende Frage. Fehlt der Prop, sind die Kacheln reine Anzeige.
 */
export default function Kacheln({ onFrage }) {
  const haut = useJarvisHaut()
  const [jetzt, setJetzt] = useState(() => new Date())
  const [daten, setDaten] = useState({})

  useEffect(() => {
    // Ohne Haut ist das Brett unsichtbar — dann wäre jede Runde nur Netzlärm.
    if (!haut) return

    let lebt = true
    const abbruch = new AbortController()

    const runde = async () => {
      const [status, lokal, ablaeufe, ausloeser] = await Promise.all([
        holen('/api/status', abbruch.signal).catch(() => undefined),
        holen('/api/lokal', abbruch.signal).catch(() => undefined),
        holen('/api/ablaeufe', abbruch.signal).catch(() => undefined),
        holen('/api/ausloeser', abbruch.signal).catch(() => undefined),
      ])
      if (!lebt) return

      setJetzt(new Date())
      // Der Kern der Sache: nur überschreiben, was tatsächlich ankam. Ein
      // kurzer Aussetzer des Servers darf keine Kachel auf Strich zurück-
      // werfen — flackernde Kacheln sind schlimmer als leicht veraltete,
      // und wer beim Blinken zweimal hinsehen muss, sieht bald gar nicht
      // mehr hin.
      setDaten((alt) => ({
        status: status ?? alt.status,
        lokal: lokal ?? alt.lokal,
        ablaeufe: ablaeufe ?? alt.ablaeufe,
        ausloeser: ausloeser ?? alt.ausloeser,
      }))
    }

    runde()
    const takt = setInterval(runde, TAKT)
    return () => {
      lebt = false
      clearInterval(takt)
      abbruch.abort()
    }
  }, [haut])

  if (!haut) return null

  const { status, lokal, ablaeufe, ausloeser } = daten
  const W = WORTE[status?.config?.language === 'de' ? 'de' : 'en']

  // ── Gehirn ──────────────────────────────────────────────────────────
  const aktiv = aktivesGehirn(status)
  const kontingent = (status?.brain?.kontingent || []).find((k) => k.provider === aktiv)
  const schlafend = (status?.brain?.kaputt || []).length
  const kette = status?.brain?.chain?.length ?? null

  // ── Speicher ────────────────────────────────────────────────────────
  // ramFrei ist 0–100 (auf dem Mac aus memory_pressure) oder null, wenn
  // es nicht messbar war. Der zweite Fall ist ein Strich, keine Null.
  const frei = typeof lokal?.ramFrei === 'number' ? lokal.ramFrei : null
  const gesamtGb = gigabyte(lokal?.ramGesamt)

  // ── Abläufe und Auslöser ────────────────────────────────────────────
  // Die Liste kommt nach letzter Änderung sortiert, der erste ist der jüngste.
  const ablaufListe = Array.isArray(ablaeufe) ? ablaeufe : null
  const ausloeserListe = Array.isArray(ausloeser) ? ausloeser : null
  const scharf = ausloeserListe?.filter((a) => a.an !== false) ?? null
  const abgeschaltet = ausloeserListe && scharf ? ausloeserListe.length - scharf.length : 0
  const erster = scharf?.[0]

  return (
    <div className="ka-gitter">
      <Kachel
        marke="TIME"
        // Der Wochentag kommt aus der Systemsprache des Nutzers, nicht aus
        // einer eigenen Tabelle — die Uhr ist der einzige Wert hier, den
        // der Browser selbst kennt, also darf er ihn auch selbst schreiben.
        neben={jetzt.toLocaleDateString(undefined, { weekday: 'short' })}
        wert={jetzt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        unter={jetzt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
      />

      <Kachel
        marke="BRAIN"
        neben={schlafend ? `${schlafend} DOWN` : kette ? `${kette} IN CHAIN` : null}
        wert={gehirnName(aktiv, status?.config) ?? '—'}
        unter={kontingent ? `${kontingent.tag} ${W.zuege}` : '—'}
        // Kein einziges Gehirn übrig heißt: der nächste Auftrag geht schief.
        // Das ist die eine Kachel, die laut werden darf.
        warnung={!!status && !aktiv}
        frage={W.gehirn}
        onFrage={onFrage}
      />

      <Kachel
        marke="MEMORY"
        neben="FREE"
        wert={frei == null ? '—' : `${frei}%`}
        unter={gesamtGb == null ? '—' : `${gesamtGb} GB ${W.gesamt}`}
        anteil={frei}
        // Unter 20 % frei fängt der Mac an zu swappen — ab da drosselt der
        // Server selbst (siehe lokal.js), also darf die Kachel das zeigen.
        warnung={frei != null && frei < 20}
        frage={W.speicher}
        onFrage={onFrage}
      />

      <Kachel
        marke="LOCAL"
        neben={lokal?.gedrosselt ? 'THROTTLED' : lokal?.ollama ? 'OLLAMA' : lokal ? 'OFFLINE' : null}
        wert={zahl(lokal?.laufend)}
        unter={
          lokal
            ? `${lokal.wartend ?? 0} ${W.wartend}${lokal.modell ? ` · ${lokal.modell}` : ''}`
            : '—'
        }
        warnung={!!lokal?.gedrosselt}
        frage={W.lokal}
        onFrage={onFrage}
      />

      <Kachel
        marke="ROUTINES"
        wert={zahl(ablaufListe?.length)}
        unter={ablaufListe == null ? '—' : ablaufListe[0]?.name || W.keine}
        frage={W.ablaeufe}
        onFrage={onFrage}
      />

      <Kachel
        marke="TRIGGERS"
        neben={abgeschaltet ? `${abgeschaltet} OFF` : null}
        wert={zahl(scharf?.length)}
        unter={
          scharf == null
            ? '—'
            : erster
              // "wann" trägt die Aussage: Uhrzeit, Ordner oder App-Name.
              // Bei art "start" ist es leer — dann sagt die Art selbst genug.
              ? `${erster.ablauf} · ${erster.wann || erster.art}`
              : W.keine
        }
        frage={W.ausloeser}
        onFrage={onFrage}
      />
    </div>
  )
}
