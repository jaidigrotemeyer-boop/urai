import React, { useEffect, useState } from 'react'
import '../ausloeser-einstellungen.css'

const ART_LABEL = {
  zeit: 'zu einer Uhrzeit',
  ordner: 'Ordner-Post',
  app: 'App nach vorn',
  start: 'bei URAI-Start',
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

/**
 * Auslöser bedienen, ohne den Agenten bitten zu müssen.
 *
 * Backend (server/ausloeser.js) kennt nur "ganze Liste lesen" und "ganze Liste schreiben" —
 * anders als bei Skills gibt es keine einzelne Anlege-/Lösch-Route. Jede Änderung hier baut
 * darum die neue Gesamtliste im Browser und schickt sie komplett per POST, genau wie es
 * pruefenListe() auf dem Server ohnehin von außen verlangt.
 */
export default function AusloeserEinstellungen() {
  const [liste, setListe] = useState([])
  const [ablaeufe, setAblaeufe] = useState([])
  const [laedt, setLaedt] = useState(true)
  const [listenFehler, setListenFehler] = useState('')
  // Eigener Fehler für die Abläufe-Liste: sonst würde ein Fehler beim einen den
  // erfolgreichen Stand des anderen überschreiben oder umgekehrt verschwiegen.
  const [ablaufFehler, setAblaufFehler] = useState('')
  // 'ruht' | 'speichert' | 'gut' | 'fehler' — eine Zeile, kein Ratespiel
  const [stand, setStand] = useState({ art: 'ruht', text: '' })
  const [loeschFrage, setLoeschFrage] = useState(null)

  const [neuAblauf, setNeuAblauf] = useState('')
  const [neuArt, setNeuArt] = useState('zeit')
  const [neuWann, setNeuWann] = useState('')

  useEffect(() => {
    holen()
  }, [])

  async function holen() {
    setLaedt(true)
    try {
      const r1 = await fetch('/api/ausloeser')
      if (!r1.ok) throw new Error(await fehlerText(r1))
      const j1 = await r1.json()
      setListe(Array.isArray(j1) ? j1 : [])
      setListenFehler('')
    } catch (err) {
      setListenFehler(`Auslöser konnten nicht geholt werden: ${err.message}`)
    }
    try {
      const r2 = await fetch('/api/ablaeufe')
      if (!r2.ok) throw new Error(await fehlerText(r2))
      const j2 = await r2.json()
      const abl = Array.isArray(j2) ? j2 : []
      setAblaeufe(abl)
      setNeuAblauf((vorher) => vorher || abl[0]?.id || '')
      setAblaufFehler('')
    } catch (err) {
      setAblaufFehler(`Abläufe konnten nicht geholt werden: ${err.message}`)
    }
    setLaedt(false)
  }

  /** Baut die Änderung auf dem FRISCH vom Server geholten Stand auf, nicht auf dem im
   *  Browser gehaltenen `liste` — sonst würde ein Auslöser, den der Agent (oder ein zweiter
   *  Tab) zwischenzeitlich über sein eigenes Werkzeug angelegt hat, hier beim nächsten Klick
   *  wieder verschwinden, weil die ganze Liste ja überschrieben wird. Schließt das Zeitfenster
   *  nicht ganz (zwischen diesem Holen und dem Schreiben bleibt eine Lücke), macht es aber
   *  kurz statt "seit dem Öffnen der Einstellungen". */
  async function schreiben(aendern) {
    setStand({ art: 'speichert', text: 'Wird geschrieben …' })
    try {
      const rFrisch = await fetch('/api/ausloeser')
      if (!rFrisch.ok) throw new Error(await fehlerText(rFrisch))
      const frisch = await rFrisch.json()
      const naechsteListe = aendern(Array.isArray(frisch) ? frisch : [])
      const r = await fetch('/api/ausloeser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(naechsteListe),
      })
      if (!r.ok) throw new Error(await fehlerText(r))
      const j = await r.json()
      setListe(Array.isArray(j) ? j : naechsteListe)
      setStand({ art: 'gut', text: 'Gespeichert.' })
      return true
    } catch (err) {
      setStand({ art: 'fehler', text: err.message })
      return false
    }
  }

  function ablaufName(id) {
    return ablaeufe.find((a) => a.id === id)?.name || id
  }

  const wannGueltig =
    neuArt === 'start' ||
    (neuArt === 'zeit' && /^\d{2}:\d{2}$/.test(neuWann)) ||
    ((neuArt === 'ordner' || neuArt === 'app') && Boolean(neuWann.trim()))

  const anlegbar = Boolean(neuAblauf) && wannGueltig && stand.art !== 'speichert'

  async function anlegen() {
    if (!anlegbar) return
    // Dieselbe Form wie das Werkzeug ausloeser_anlegen auf dem Server: lesbar, kein UUID-Wirrwarr.
    const id = `${neuAblauf}-${neuArt}-${Date.now().toString(36).slice(-4)}`
    const eintrag = {
      id,
      ablauf: neuAblauf,
      art: neuArt,
      wann: neuArt === 'start' ? '' : neuWann.trim(),
      eingaben: {},
      an: true,
    }
    if (await schreiben((frisch) => [...frisch, eintrag])) setNeuWann('')
  }

  async function umschalten(id) {
    await schreiben((frisch) => frisch.map((a) => (a.id === id ? { ...a, an: a.an === false } : a)))
  }

  async function loeschen(id) {
    setLoeschFrage(null)
    await schreiben((frisch) => frisch.filter((a) => a.id !== id))
  }

  return (
    <div className="asl">
      <div className="asl-erklaerung">
        Ein Auslöser startet einen fertigen Ablauf von selbst — zu einer Uhrzeit, wenn etwas in
        einem Ordner landet, wenn eine App nach vorn kommt, oder beim Start von URAI. Vor jedem
        Start meldet sich URAI kurz im Chat und lässt sich abbrechen.
      </div>

      {listenFehler && <div className="asl-stand asl-stand-fehler">{listenFehler}</div>}
      {ablaufFehler && <div className="asl-stand asl-stand-fehler">{ablaufFehler}</div>}

      {laedt ? (
        <div className="asl-leer">Auslöser werden geholt …</div>
      ) : (
        <>
          {/* Ohne Ablauf lässt sich nichts Neues anlegen — bestehende Auslöser (auch vom
              Agenten angelegte) bleiben trotzdem sichtbar und bedienbar, siehe Liste unten.
              Beides von derselben Bedingung abhängig zu machen war der Fehler der ersten
              Fassung: eine leere Werkstatt hätte aktive Auslöser aus der Oberfläche geworfen. */}
          {ablaeufe.length === 0 ? (
            <div className="asl-leer">
              Noch kein Ablauf angelegt. Erst in der Werkstatt einen Ablauf bauen, dann hier
              einen Auslöser dafür einrichten.
            </div>
          ) : (
            <div className="asl-neu">
              <select value={neuAblauf} onChange={(e) => setNeuAblauf(e.target.value)}>
                {ablaeufe.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                value={neuArt}
                onChange={(e) => {
                  setNeuArt(e.target.value)
                  setNeuWann('')
                }}
              >
                <option value="zeit">zu einer Uhrzeit</option>
                <option value="ordner">Ordner-Post</option>
                <option value="app">App nach vorn</option>
                <option value="start">bei URAI-Start</option>
              </select>
              {neuArt === 'zeit' && (
                <input type="time" value={neuWann} onChange={(e) => setNeuWann(e.target.value)} />
              )}
              {neuArt === 'ordner' && (
                <input
                  placeholder="~/Downloads"
                  value={neuWann}
                  onChange={(e) => setNeuWann(e.target.value)}
                />
              )}
              {neuArt === 'app' && (
                <input
                  placeholder="Safari"
                  value={neuWann}
                  onChange={(e) => setNeuWann(e.target.value)}
                />
              )}
              <button className="primary" onClick={anlegen} disabled={!anlegbar}>
                Anlegen
              </button>
            </div>
          )}

          {liste.length === 0 ? (
            <div className="asl-leer">Noch keine Auslöser. Oben einen anlegen.</div>
          ) : (
            <div className="asl-liste">
              {liste.map((a) => (
                <div key={a.id} className={`asl-karte ${a.an === false ? 'asl-karte-aus' : ''}`}>
                  <div className="asl-kopf">
                    <div className="asl-name">{ablaufName(a.ablauf)}</div>
                    <button
                      className={`chip ${a.an === false ? '' : 'on'}`}
                      onClick={() => umschalten(a.id)}
                      disabled={stand.art === 'speichert'}
                    >
                      {a.an === false ? 'aus' : 'an'}
                    </button>
                  </div>

                  <div className="asl-wann">
                    <span className="asl-wann-marke">{ART_LABEL[a.art] || a.art}</span>
                    {a.art !== 'start' && a.wann}
                  </div>

                  <div className="asl-fuss">
                    <code className="asl-id">{a.id}</code>
                    {loeschFrage === a.id ? (
                      <span className="asl-karte-knoepfe">
                        <span className="asl-mini">Wirklich löschen?</span>
                        <button className="danger" onClick={() => loeschen(a.id)}>
                          Ja, löschen
                        </button>
                        <button onClick={() => setLoeschFrage(null)}>Abbrechen</button>
                      </span>
                    ) : (
                      <button
                        className="danger"
                        onClick={() => setLoeschFrage(a.id)}
                        disabled={stand.art === 'speichert'}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {stand.art !== 'ruht' && stand.art !== 'speichert' && (
        <div className={`asl-stand asl-stand-${stand.art}`}>{stand.text}</div>
      )}
    </div>
  )
}
