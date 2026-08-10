import React, { useEffect, useState } from 'react'
import '../mcp-einstellungen.css'

// MCP-Server bedienen, ohne data/config.json von Hand aufzumachen.
//
// Der Kern (server/mcp.js) kann das alles längst — er war nur nicht erreichbar:
// Server eintragen hieß Datei bearbeiten und neu starten. Genau der Neustart
// fällt hier weg, denn POST /api/mcp/neu bindet im Betrieb neu an.
//
// Zwei Quellen, die man nicht verwechseln darf:
//   cfg.mcpServer  — was der Nutzer gerade einstellt, auch ungespeichert
//   GET /api/mcp   — was der Server WIRKLICH angebunden hat
// Die Liste wird aus cfg gezeichnet (sonst verschwände ein frisch angelegter
// Server wieder) und der Zustand je Zeile aus dem Server-Stand dazugelegt.
// Weichen sie ab, sagt die Zeile das — schweigen wäre hier eine Lüge.

/** Beschreibung säubern: server/mcp.js stellt jeder ein "[Servername] " voran.
 *  Innerhalb der Liste genau dieses Servers steht der Name schon drüber. */
function kurz(text) {
  return String(text || '').replace(/^\[[^\]]*\]\s*/, '')
}

/**
 * Formular für einen neuen Server.
 *
 * Meldet erst beim Klick nach oben, nicht bei jedem Tastendruck: ein Server mit
 * halb getippter Adresse stünde sonst in der Liste, und das nächste
 * "Neu verbinden" liefe ihn tatsächlich an.
 */
function ServerFormular({ onHinzu }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')

  // Ohne http(s):// hat fetch() im Server keine Chance. Lieber hier abfangen,
  // als den Nutzer 45 Sekunden auf einen Verbindungsfehler warten zu lassen.
  const gueltig = Boolean(name.trim()) && /^https?:\/\/\S+/i.test(url.trim())

  function hinzu() {
    if (!gueltig) return
    onHinzu({
      id: `m${Date.now().toString(36)}`,
      name: name.trim(),
      url: url.trim(),
      token: token.trim(),
      an: true,
    })
    setName('')
    setUrl('')
    setToken('')
  }

  return (
    <div className="mcp-neu">
      <div className="mcp-neu-titel">Server hinzufügen</div>
      <div className="mcp-neu-felder">
        <input
          placeholder="Name (z.B. Composio)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
        <input
          placeholder="https://…/mcp"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          placeholder="Token (optional)"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && hinzu()}
        />
        <button onClick={hinzu} disabled={!gueltig}>
          Hinzufügen
        </button>
      </div>
      {url.trim() && !/^https?:\/\/\S+/i.test(url.trim()) && (
        <div className="mcp-hinweis mcp-hinweis-fehler">
          Die Adresse muss mit http:// oder https:// anfangen.
        </div>
      )}
    </div>
  )
}

export default function McpEinstellungen({ cfg, setCfg }) {
  // Was der Server angebunden hat. Beim ersten Zeichnen leer — deshalb der
  // Ladezustand, sonst sähe jeder Server für einen Moment wie "nicht verbunden" aus.
  const [stand, setStand] = useState([])
  const [laedt, setLaedt] = useState(true)
  const [verbindet, setVerbindet] = useState(false)
  const [meldung, setMeldung] = useState(null)
  // id -> { vorher, entwurf }: welche Token-Felder gerade offen bearbeitet werden
  const [tokenEdit, setTokenEdit] = useState({})

  const liste = cfg.mcpServer || []

  useEffect(() => {
    let lebt = true
    fetch('/api/mcp')
      .then((r) => r.json())
      .then((j) => lebt && setStand(Array.isArray(j) ? j : []))
      .catch(() => {}) // Server noch nicht oben — die Liste bleibt eben leer
      .finally(() => lebt && setLaedt(false))
    return () => {
      lebt = false
    }
  }, [])

  /** Ein Feld eines Servers ändern. Schreibt in cfg, gespeichert wird oben. */
  function setzen(id, patch) {
    setCfg({ ...cfg, mcpServer: liste.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  function entfernen(id) {
    setCfg({ ...cfg, mcpServer: liste.filter((s) => s.id !== id) })
    setTokenEdit((v) => {
      const n = { ...v }
      delete n[id]
      return n
    })
  }

  // ── Token ──────────────────────────────────────────────────────────────
  // Der Server liefert Token nur maskiert zurück (••••abcd). Der maskierte Wert
  // darf NIE als bearbeitbarer Feldinhalt erscheinen: der Nutzer sieht Punkte,
  // hält das Feld für Platzhalter, tippt drüber oder leert es — und der echte
  // Token wäre weg. Darum: gesetzte Token stehen als Text da ("Token gesetzt"),
  // und wer ihn ändern will, bekommt ein ausdrücklich leeres Feld.

  function tokenStart(s) {
    setTokenEdit((v) => ({ ...v, [s.id]: { vorher: s.token || '', entwurf: '' } }))
  }

  function tokenTippen(id, wert) {
    setTokenEdit((v) => ({ ...v, [id]: { ...v[id], entwurf: wert } }))
    // Ein leeres Feld heißt "noch nichts getippt", nicht "wirf den Token weg".
    // Bei leerem Entwurf wandert deshalb der maskierte Wert zurück in cfg — den
    // erkennt server/index.js und lässt den echten Token unangetastet stehen.
    setzen(id, { token: wert || tokenEdit[id]?.vorher || '' })
  }

  function tokenSchliessen(id, zurueck) {
    if (zurueck) setzen(id, { token: tokenEdit[id]?.vorher || '' })
    setTokenEdit((v) => {
      const n = { ...v }
      delete n[id]
      return n
    })
  }

  function tokenLoeschen(id) {
    // Leerer String ist nicht maskiert, geht durch die Prüfung in
    // server/index.js durch und löscht den Token wirklich.
    setzen(id, { token: '' })
    setTokenEdit((v) => {
      const n = { ...v }
      delete n[id]
      return n
    })
  }

  // ── Neu verbinden ──────────────────────────────────────────────────────
  // Der wichtigste Knopf des Abschnitts: er ersetzt den Neustart. Kann pro
  // Server bis zu 45 Sekunden dauern (so lang ist der Zeitablauf in mcp.js),
  // darum wird der Knopf gesperrt und sagt, dass er arbeitet.
  async function neuVerbinden() {
    setVerbindet(true)
    setMeldung(null)
    try {
      const r = await fetch('/api/mcp/neu', { method: 'POST' })
      const j = await r.json()
      const neu = Array.isArray(j.stand) ? j.stand : []
      setStand(neu)
      const ergebnis = Array.isArray(j.ergebnis) ? j.ergebnis : []
      const gut = ergebnis.filter((e) => e.ok).length
      const schlecht = ergebnis.length - gut
      const anzahl = neu.reduce((summe, x) => summe + (x.anzahl || 0), 0)
      setMeldung(
        ergebnis.length === 0
          ? { fehler: false, text: 'Kein eingeschalteter Server — nichts zu verbinden.' }
          : {
              fehler: schlecht > 0,
              text:
                `${gut} von ${ergebnis.length} verbunden, ${anzahl} Werkzeuge.` +
                (schlecht > 0 ? ` ${schlecht} mit Fehler.` : ''),
            }
      )
    } catch (err) {
      setMeldung({ fehler: true, text: `Der Server antwortet nicht: ${err.message}` })
    } finally {
      setVerbindet(false)
    }
  }

  const nachId = new Map(stand.map((s) => [s.id, s]))

  return (
    <div className="mcp">
      {/* Sachlage, keine Angstmache: wer MCP anschaltet, soll wissen, was er anschaltet. */}
      <div className="mcp-warnung">
        MCP-Werkzeuge laufen auf fremden Rechnern und handeln dort in deinem Namen — darum fragt
        URAI vor jeder Benutzung nach, solange du sie nicht ausdrücklich freischaltest.
      </div>

      <div className="mcp-leiste">
        <button className="primary" onClick={neuVerbinden} disabled={verbindet}>
          {verbindet ? 'Verbinde …' : 'Neu verbinden'}
        </button>
        <span className="mcp-leiste-text">
          {verbindet
            ? 'Jeder Server bekommt bis zu 45 Sekunden. Das Fenster bleibt offen.'
            : 'Bindet alle eingeschalteten Server neu an — ohne Neustart.'}
        </span>
      </div>

      {meldung && (
        <div className={`mcp-meldung ${meldung.fehler ? 'mcp-meldung-fehler' : ''}`}>
          {meldung.text}
        </div>
      )}

      {/* Der Knopf oben arbeitet mit dem GESPEICHERTEN Stand. Wer das nicht weiß,
          klickt nach einer Änderung vergeblich und hält MCP für kaputt. */}
      <div className="mcp-hinweis">
        „Neu verbinden“ nimmt den gespeicherten Stand. Änderungen hier gelten erst nach dem
        Speichern.
      </div>

      {laedt ? (
        <div className="mcp-leer">Zustand wird geholt …</div>
      ) : liste.length === 0 ? (
        <div className="mcp-leer">
          Noch kein Server eingetragen. Ein MCP-Server bringt seine Werkzeuge mit — sie stehen
          danach im selben Topf wie die eingebauten.
        </div>
      ) : (
        <div className="mcp-liste">
          {liste.map((s) => {
            const z = nachId.get(s.id)
            const an = s.an !== false
            const bearbeitet = tokenEdit[s.id]
            const hatToken = bearbeitet ? Boolean(bearbeitet.vorher) : Boolean(s.token)
            // Weicht die Einstellung vom angebundenen Stand ab, ist sie noch nicht
            // gespeichert — dann erklärt das auch, warum die Werkzeuge fehlen.
            const ungespeichert =
              !z || z.an !== an || z.url !== (s.url || '') || z.name !== (s.name || '')

            let zustand = { klasse: 'ruht', text: 'nicht verbunden' }
            if (!an) zustand = { klasse: 'aus', text: 'aus' }
            else if (z?.verbunden)
              zustand = {
                klasse: 'an',
                text: `verbunden · ${z.anzahl} ${z.anzahl === 1 ? 'Werkzeug' : 'Werkzeuge'}`,
              }
            else if (z?.fehler) zustand = { klasse: 'fehler', text: 'Fehler' }

            return (
              <div key={s.id} className={`mcp-server ${an ? '' : 'mcp-server-aus'}`}>
                <div className="mcp-kopf">
                  <div className="mcp-titel">
                    <div className="mcp-name">{s.name || s.id}</div>
                    <div className="mcp-url" title={s.url}>
                      {s.url}
                    </div>
                  </div>
                  <div className={`mcp-zustand mcp-zustand-${zustand.klasse}`}>
                    <span className="mcp-punkt" />
                    {zustand.text}
                  </div>
                </div>

                {ungespeichert && <div className="mcp-marke">noch nicht gespeichert</div>}

                {/* Klartext statt Kürzel: "HTTP 401: …" sagt dem Nutzer mehr als ein rotes Feld */}
                {an && z?.fehler && <div className="mcp-fehler">{z.fehler}</div>}

                <div className="mcp-token">
                  {bearbeitet ? (
                    <>
                      <input
                        type="password"
                        autoFocus
                        placeholder="neuer Token"
                        value={bearbeitet.entwurf}
                        onChange={(e) => tokenTippen(s.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && tokenSchliessen(s.id, false)}
                      />
                      <button onClick={() => tokenSchliessen(s.id, false)}>Übernehmen</button>
                      <button onClick={() => tokenSchliessen(s.id, true)}>Abbrechen</button>
                    </>
                  ) : (
                    <>
                      <span className={`mcp-token-stand ${hatToken ? 'mcp-token-da' : ''}`}>
                        {hatToken ? 'Token gesetzt' : 'kein Token'}
                      </span>
                      <button onClick={() => tokenStart(s)}>
                        {hatToken ? 'Token ändern' : 'Token setzen'}
                      </button>
                      {hatToken && (
                        <button className="danger" onClick={() => tokenLoeschen(s.id)}>
                          Token löschen
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Ohne diese Liste weiß niemand, was er sich da eingekauft hat */}
                {z?.werkzeuge?.length > 0 && (
                  <details className="mcp-werkzeuge">
                    <summary>
                      {z.werkzeuge.length} {z.werkzeuge.length === 1 ? 'Werkzeug' : 'Werkzeuge'}{' '}
                      anzeigen
                    </summary>
                    <div className="mcp-wz-liste">
                      {z.werkzeuge.map((w) => (
                        <div key={w.name} className="mcp-wz">
                          <code className="mcp-wz-name">{w.name}</code>
                          <span className="mcp-wz-text">{kurz(w.beschreibung)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="mcp-knoepfe">
                  <button
                    className={`chip ${an ? 'on' : ''}`}
                    onClick={() => setzen(s.id, { an: !an })}
                  >
                    {an ? 'an' : 'aus'}
                  </button>
                  <button className="danger" onClick={() => entfernen(s.id)}>
                    Entfernen
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ServerFormular onHinzu={(neu) => setCfg({ ...cfg, mcpServer: [...liste, neu] })} />
    </div>
  )
}
