import React, { useEffect, useState } from 'react'
import '../skill-einstellungen.css'

// Skills bedienen, ohne data/skills/ im Finder aufzumachen.
//
// Ein Skill ist eine Anleitung in Worten, die das Gehirn NUR holt, wenn sie passt. Im
// Systemprompt steht dauerhaft bloß eine Zeile pro Skill: Name und das "wann". Genau daran
// entscheidet URAI, ob es die volle Anleitung nachschlägt. Deshalb ist das "wann" hier die
// wichtigste Eingabe von allen — ein Skill mit vagem "wann" wird nie geholt, und niemand
// merkt, warum. Es steht darum in der Liste als Hauptzeile und nicht als Kleingedrucktes.
//
// Diese Ansicht redet direkt mit /api/skills und hält NICHTS in cfg: Skills sind Dateien,
// nicht Konfiguration. Es gibt hier kein "Speichern" weiter oben, das man vergessen könnte —
// jeder Knopf hier wirkt sofort auf die Datei.
//
// Die Liste kommt absichtlich ohne den Anleitungstext (so liefert sie der Server), der volle
// Text wird erst beim Bearbeiten einzeln geholt. Bei zwanzig Skills à 20 kB wäre alles andere
// Verschwendung — und dieselbe Sparsamkeit ist ja der ganze Sinn der Sache.

const LEER = { id: null, name: '', wann: '', text: '' }

/** Zeitstempel der Datei, kurz. Nicht "vor 3 Tagen": die Datei kann von Hand geändert
 *  worden sein, und dann ist ein absolutes Datum die ehrlichere Auskunft. */
function datum(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Fehlertext aus einer Antwort ziehen. Der Server schickt {fehler}; kommt etwas anderes
 *  (Proxy, HTML-Fehlerseite), darf das nicht als leerer roter Kasten enden. */
async function fehlerText(r) {
  try {
    const j = await r.json()
    if (j?.fehler) return j.fehler
  } catch {}
  return `Der Server antwortet mit ${r.status}.`
}

export default function SkillEinstellungen() {
  const [liste, setListe] = useState([])
  const [laedt, setLaedt] = useState(true)
  // Fehler beim Holen der Liste — getrennt vom Speicher-Fehler, sonst überschreibt der eine
  // den anderen und der Nutzer sieht "gespeichert", während die Liste in Wahrheit veraltet ist.
  const [listenFehler, setListenFehler] = useState('')

  // null = Liste sichtbar. Sonst der Entwurf, der gerade bearbeitet wird.
  const [entwurf, setEntwurf] = useState(null)
  // Der Stand, wie er aus dem Server kam — daran hängt "geändert?" und damit die Rückfrage
  // beim Abbrechen. Eine halb getippte Anleitung wegzuwerfen darf kein einzelner Klick sein.
  const [urstand, setUrstand] = useState(LEER)
  const [holt, setHolt] = useState(false)

  // 'ruht' | 'speichert' | 'gut' | 'fehler' — ein Zustand, eine Zeile, kein Ratespiel
  const [stand, setStand] = useState({ art: 'ruht', text: '' })
  const [loeschFrage, setLoeschFrage] = useState(null) // id, die gerade nachgefragt wird
  const [verwerfFrage, setVerwerfFrage] = useState(false)

  useEffect(() => {
    holenListe()
  }, [])

  async function holenListe() {
    setLaedt(true)
    try {
      const r = await fetch('/api/skills')
      if (!r.ok) throw new Error(await fehlerText(r))
      const j = await r.json()
      setListe(Array.isArray(j) ? j : [])
      setListenFehler('')
    } catch (err) {
      setListenFehler(`Skills konnten nicht geholt werden: ${err.message}`)
    } finally {
      setLaedt(false)
    }
  }

  // ── Bearbeiten ─────────────────────────────────────────────────────────
  // Der Text kommt einzeln nach, weil die Liste ihn nicht mitbringt. Bis er da ist, steht
  // der Ladezustand im Feld — ein leeres Textfeld sähe aus wie ein leerer Skill, und wer
  // dann tippt, überschreibt seine Anleitung.

  async function bearbeiten(id) {
    setStand({ art: 'ruht', text: '' })
    setVerwerfFrage(false)
    setHolt(true)
    setEntwurf({ ...LEER, id })
    try {
      const r = await fetch(`/api/skills/${encodeURIComponent(id)}`)
      if (!r.ok) throw new Error(await fehlerText(r))
      const j = await r.json()
      const geladen = { id: j.id, name: j.name || '', wann: j.wann || '', text: j.text || '' }
      setEntwurf(geladen)
      setUrstand(geladen)
    } catch (err) {
      setEntwurf(null)
      setStand({ art: 'fehler', text: err.message })
    } finally {
      setHolt(false)
    }
  }

  function anlegen() {
    setStand({ art: 'ruht', text: '' })
    setVerwerfFrage(false)
    setEntwurf({ ...LEER })
    setUrstand(LEER)
  }

  const geaendert =
    entwurf &&
    (entwurf.name !== urstand.name || entwurf.wann !== urstand.wann || entwurf.text !== urstand.text)

  function feld(name, wert) {
    setEntwurf((e) => ({ ...e, [name]: wert }))
    // Ein "Gespeichert" über einem Feld, in dem gerade wieder getippt wird, ist gelogen.
    setStand((s) => (s.art === 'gut' ? { art: 'ruht', text: '' } : s))
  }

  /** Zurück zur Liste — aber nicht über einen ungespeicherten Aufsatz hinweg. */
  function zurueck() {
    if (geaendert) {
      setVerwerfFrage(true)
      return
    }
    schliessen()
  }

  function schliessen() {
    setEntwurf(null)
    setVerwerfFrage(false)
    setStand({ art: 'ruht', text: '' })
  }

  // Name und Text sind Pflicht (so prüft es auch der Server). Das "wann" ist es formal nicht —
  // ohne "wann" wird der Skill aber praktisch nie geholt, darum steht unten die Warnung.
  const speicherbar = Boolean(entwurf?.name.trim() && entwurf?.text.trim())

  async function speichern() {
    if (!speicherbar || stand.art === 'speichert') return
    setStand({ art: 'speichert', text: 'Wird geschrieben …' })
    try {
      const r = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // id nur mitschicken, wenn wir einen bestehenden Skill bearbeiten: sonst bildet der
        // Server die Kennung aus dem Namen, und genau das soll beim Anlegen passieren.
        body: JSON.stringify({
          ...(entwurf.id ? { id: entwurf.id } : {}),
          name: entwurf.name,
          wann: entwurf.wann,
          text: entwurf.text,
        }),
      })
      if (!r.ok) throw new Error(await fehlerText(r))
      const j = await r.json()
      const gespeichert = { id: j.id, name: j.name || '', wann: j.wann || '', text: j.text || '' }
      setEntwurf(gespeichert)
      setUrstand(gespeichert)
      setStand({
        art: 'gut',
        // j.neu kommt vom Server. Beim Anlegen kann aus zwei ähnlichen Namen dieselbe Kennung
        // werden ("Mails sortieren" und "Mails Sortieren!") — dann hat das Speichern in
        // Wahrheit einen fremden Skill überschrieben. Das muss dastehen, nicht verschwiegen.
        text: j.neu
          ? `Angelegt als data/skills/${j.id}.md`
          : `Gespeichert in data/skills/${j.id}.md`,
      })
      holenListe()
    } catch (err) {
      setStand({ art: 'fehler', text: err.message })
    }
  }

  async function loeschen(id) {
    setLoeschFrage(null)
    setStand({ art: 'speichert', text: 'Wird gelöscht …' })
    try {
      const r = await fetch(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await fehlerText(r))
      const j = await r.json()
      // {ok:false} heißt: die Datei war schon weg. Kein Erfolg, aber auch kein Drama —
      // beides zu verschweigen wäre falsch, denn die Liste ändert sich sichtbar.
      setStand(
        j.ok
          ? { art: 'gut', text: `Skill "${id}" gelöscht.` }
          : { art: 'fehler', text: `Skill "${id}" gab es nicht mehr.` }
      )
      holenListe()
    } catch (err) {
      setStand({ art: 'fehler', text: err.message })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Bearbeiten füllt das ganze Blatt statt sich in die Karte zu quetschen: eine Anleitung
  // ist ein Aufsatz, und der braucht das Feld unten in voller Breite und Höhe.
  // ═══════════════════════════════════════════════════════════════════════
  if (entwurf) {
    return (
      <div className="skl">
        <div className="skl-kopfzeile">
          {verwerfFrage ? (
            <>
              <span className="skl-mini skl-mini-warn">Ungespeicherte Änderungen verwerfen?</span>
              <button className="danger" onClick={schliessen}>
                Ja, verwerfen
              </button>
              <button onClick={() => setVerwerfFrage(false)}>Weiter bearbeiten</button>
            </>
          ) : (
            <>
              <button onClick={zurueck}>Zurück zur Liste</button>
              <span className="skl-kopf-titel">
                {urstand.id ? `Skill bearbeiten · ${urstand.id}` : 'Neuer Skill'}
              </span>
            </>
          )}
        </div>

        {holt ? (
          <div className="skl-leer">Anleitung wird geholt …</div>
        ) : (
          <>
            <label className="skl-label">
              <span className="skl-label-text">Name</span>
              <input
                autoFocus={!urstand.id}
                placeholder="z.B. Rechnungen prüfen"
                value={entwurf.name}
                maxLength={200}
                onChange={(e) => feld('name', e.target.value)}
              />
            </label>

            {/* Das Herzstück. Die Erklärung steht direkt am Feld und nicht in einer Hilfe,
                die niemand aufmacht — hiervon hängt ab, ob der Skill je benutzt wird. */}
            <label className="skl-label skl-label-wann">
              <span className="skl-label-text">Wann passt das?</span>
              <input
                autoFocus={Boolean(urstand.id)}
                placeholder="Wenn es um Rechnungen, Belege oder Mahnungen geht"
                value={entwurf.wann}
                maxLength={200}
                onChange={(e) => feld('wann', e.target.value)}
              />
              <span className="skl-label-hilfe">
                Der einzige Satz, den URAI dauerhaft im Kopf hat. Nur wenn er zur Aufgabe passt,
                wird die Anleitung überhaupt geholt — also die Wörter nennen, die dann fallen.
              </span>
            </label>

            <label className="skl-label skl-label-text-feld">
              <span className="skl-label-text">Anleitung</span>
              <textarea
                className="skl-anleitung"
                placeholder={
                  'Worauf achten, in welcher Reihenfolge, welche Werkzeuge — und vor allem: ' +
                  'welche Fallen. Markdown ist erlaubt.\n\n' +
                  'Keine festen Schritte erzwingen: dafür gibt es Abläufe in der Werkstatt.'
                }
                value={entwurf.text}
                maxLength={20000}
                spellCheck={false}
                onChange={(e) => feld('text', e.target.value)}
                onKeyDown={(e) => {
                  // Cmd/Strg+Enter speichert: bei einem Feld dieser Größe will niemand nach
                  // jedem Absatz zur Maus greifen.
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    speichern()
                  }
                }}
              />
              <span className="skl-label-hilfe">
                {entwurf.text.length.toLocaleString('de-DE')} von 20.000 Zeichen · ⌘↵ speichert
              </span>
            </label>

            <div className="skl-knoepfe">
              <button className="primary" onClick={speichern} disabled={!speicherbar || stand.art === 'speichert'}>
                {stand.art === 'speichert' ? 'Speichere …' : 'Speichern'}
              </button>
              {!entwurf.name.trim() && <span className="skl-mini">Ohne Namen geht es nicht.</span>}
              {entwurf.name.trim() && !entwurf.text.trim() && (
                <span className="skl-mini">Ein Skill ohne Anleitung nützt niemandem.</span>
              )}
              {speicherbar && !entwurf.wann.trim() && (
                <span className="skl-mini skl-mini-warn">
                  Ohne „wann“ wird dieser Skill praktisch nie geholt.
                </span>
              )}
            </div>

            {stand.art !== 'ruht' && stand.art !== 'speichert' && (
              <div className={`skl-stand skl-stand-${stand.art}`}>{stand.text}</div>
            )}
          </>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Die Liste
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="skl">
      {/* Der eine Absatz, ohne den niemand je einen Skill anlegt: was das ist, und warum es
          nicht dasselbe ist wie ein Ablauf. Beides steht in den Einstellungen nebeneinander,
          und ohne diesen Satz wäre die Verwechslung sicher. */}
      <div className="skl-erklaerung">
        Ein Skill ist Wissen in Worten: worauf bei einer wiederkehrenden Aufgabe zu achten ist,
        welche Werkzeuge sich bewähren, welche Fallen es gibt. URAI hat dauerhaft nur Name und
        „wann“ im Kopf und liest die volle Anleitung erst, wenn sie zur Aufgabe passt.
        <span className="skl-erklaerung-ab">
          Kein Ablauf: ein Ablauf ist ein fester Graph, der Schritt für Schritt abläuft. Ein Skill
          führt nichts aus — er sagt nur, was jemand wissen sollte, der die Aufgabe anfasst.
        </span>
      </div>

      <div className="skl-leiste">
        <button className="primary" onClick={anlegen}>
          Neuer Skill
        </button>
        <span className="skl-leiste-text">
          Liegt als Markdown in <code>data/skills/</code> — deine Datei, auch ohne URAI lesbar.
        </span>
      </div>

      {listenFehler && <div className="skl-stand skl-stand-fehler">{listenFehler}</div>}

      {stand.art !== 'ruht' && stand.art !== 'speichert' && (
        <div className={`skl-stand skl-stand-${stand.art}`}>{stand.text}</div>
      )}
      {stand.art === 'speichert' && <div className="skl-stand">{stand.text}</div>}

      {laedt ? (
        <div className="skl-leer">Skills werden geholt …</div>
      ) : liste.length === 0 ? (
        <div className="skl-leer">
          Noch keine Skills. Der erste lohnt sich dort, wo du dich beim Erklären wiederholst —
          alles, was du URAI zum zweiten Mal sagst, gehört hierher.
        </div>
      ) : (
        <div className="skl-liste">
          {liste.map((s) => (
            <div key={s.id} className="skl-karte">
              <div className="skl-kopf">
                <div className="skl-name">{s.name}</div>
                <div className="skl-datum" title={s.geaendert}>
                  {datum(s.geaendert)}
                </div>
              </div>

              {/* Das "wann" ist hier die Hauptzeile, nicht die Fußnote: es ist das Einzige,
                  woran das Gehirn den Skill erkennt. Wer es klein setzt, versteckt genau
                  die Angabe, die man beim Durchsehen prüfen will. */}
              {s.wann ? (
                <div className="skl-wann">
                  <span className="skl-wann-marke">passt</span>
                  {s.wann}
                </div>
              ) : (
                <div className="skl-wann skl-wann-fehlt">
                  <span className="skl-wann-marke">kein „wann“</span>
                  wird so praktisch nie geholt
                </div>
              )}

              <div className="skl-fuss">
                <code className="skl-id">{s.id}.md</code>
                <div className="skl-karte-knoepfe">
                  {loeschFrage === s.id ? (
                    <>
                      <span className="skl-mini">Wirklich löschen?</span>
                      <button className="danger" onClick={() => loeschen(s.id)}>
                        Ja, löschen
                      </button>
                      <button onClick={() => setLoeschFrage(null)}>Abbrechen</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => bearbeiten(s.id)}>Bearbeiten</button>
                      <button className="danger" onClick={() => setLoeschFrage(s.id)}>
                        Löschen
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
