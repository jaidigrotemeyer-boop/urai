// Handschrift — kleiner lokaler Server, damit die Oberfläche im Browser laufen
// kann. Bewusst mit dem eingebauten http-Modul und ohne ein einziges Paket:
// „npm install" lädt so gar nichts, und die App bleibt für sich.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { messen } from './messen.js'
import { zeichenPlan, aufDauer, dauerLesen, abspielen, zeitText, MAX_DAUER_MS } from './tippen.js'
import { umschreiben, einerDa } from './gehirn.js'
import { zeichen, bereit, SYSTEM } from './schreiben.js'
import { lesen, schreiben, oeffentlich } from './config.js'

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 3018

// Immer nur ein Tipp-Lauf. Zwei gleichzeitig würden sich im selben Fenster
// die Zeichen ineinander schreiben.
let lauf = null

async function tippenStarten({ text, dauer, zeichenProMinute, vorlauf = 5 }) {
  if (lauf?.laeuft) throw new Error('Es läuft schon ein Tipp-Lauf. Erst stoppen.')
  const plan = aufDauer(zeichenPlan(text, { zeichenProMinute }), dauerLesen(dauer))
  const schnitt = plan.gesamtMs / Math.max(1, plan.schritte.length)
  if (schnitt < 45)
    throw new Error(
      `Zu schnell für Tastendruck um Tastendruck (∅ ${Math.round(schnitt)} ms). Nimm eine längere Dauer.`,
    )

  const abbruch = new AbortController()
  lauf = {
    laeuft: true,
    phase: 'vorlauf',
    getippt: 0,
    gesamt: plan.schritte.length,
    gesamtMs: plan.gesamtMs,
    bis: Date.now() + vorlauf * 1000,
    abbruch,
    fehler: null,
  }

  // Erst der Vorlauf: Zeit, ins Zielfenster zu klicken. Ohne den landet der
  // Anfang des Textes in Handschrift selbst statt im Dokument.
  ;(async () => {
    try {
      const warte = (ms) =>
        new Promise((fertig, schief) => {
          const t = setTimeout(fertig, ms)
          abbruch.signal.addEventListener('abort', () => {
            clearTimeout(t)
            schief(Object.assign(new Error('Gestoppt.'), { name: 'AbortError' }))
          })
        })
      await warte(vorlauf * 1000)
      lauf.phase = 'tippt'
      lauf.bis = Date.now() + plan.gesamtMs
      await abspielen(plan, {
        tippe: zeichen,
        warte,
        signal: abbruch.signal,
        melde: ({ getippt }) => (lauf.getippt = getippt),
      })
      lauf.getippt = lauf.gesamt
    } catch (err) {
      if (err?.name !== 'AbortError') lauf.fehler = err.message
    } finally {
      lauf.laeuft = false
      lauf.phase = 'fertig'
    }
  })()

  return { gesamt: plan.schritte.length, dauer: zeitText(plan.gesamtMs), vorlauf }
}

const TYPEN = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }

function json(res, code, daten) {
  const text = JSON.stringify(daten)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

function koerper(req) {
  return new Promise((fertig, schief) => {
    let roh = ''
    req.on('data', (stueck) => {
      roh += stueck
      // Ohne Deckel könnte ein versehentlicher Riesen-Upload den Speicher füllen.
      if (roh.length > 5_000_000) schief(new Error('Text zu groß (über 5 MB).'))
    })
    req.on('end', () => {
      try {
        fertig(roh ? JSON.parse(roh) : {})
      } catch {
        schief(new Error('Konnte die Anfrage nicht lesen.'))
      }
    })
    req.on('error', schief)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const weg = url.pathname

  try {
    if (req.method === 'GET' && (weg === '/' || weg === '/index.html')) {
      const datei = path.join(WURZEL, 'web', 'index.html')
      const inhalt = fs.readFileSync(datei)
      res.writeHead(200, { 'content-type': TYPEN['.html'], 'content-length': inhalt.length })
      return res.end(inhalt)
    }

    if (req.method === 'GET' && weg === '/api/stand') {
      return json(res, 200, {
        einstellungen: oeffentlich(),
        gehirn: einerDa(),
        tippen: await bereit(),
        system: SYSTEM,
        maxStunden: MAX_DAUER_MS / 3600000,
        lauf: lauf && {
          laeuft: lauf.laeuft,
          phase: lauf.phase,
          getippt: lauf.getippt,
          gesamt: lauf.gesamt,
          restMs: Math.max(0, lauf.bis - Date.now()),
          fehler: lauf.fehler,
        },
      })
    }

    if (req.method === 'POST' && weg === '/api/messen') {
      const { text } = await koerper(req)
      return json(res, 200, messen(String(text || '')))
    }

    if (req.method === 'POST' && weg === '/api/umschreiben') {
      const { text, ton, extra } = await koerper(req)
      return json(res, 200, await umschreiben(text, { ton: ton || lesen().ton, extra }))
    }

    if (req.method === 'POST' && weg === '/api/tippen') {
      const daten = await koerper(req)
      if (!String(daten.text || '').length) throw new Error('Kein Text da.')
      return json(res, 200, await tippenStarten(daten))
    }

    if (req.method === 'POST' && weg === '/api/stopp') {
      lauf?.abbruch?.abort()
      return json(res, 200, { gestoppt: true, getippt: lauf?.getippt ?? 0 })
    }

    if (req.method === 'POST' && weg === '/api/einstellungen') {
      const daten = await koerper(req)
      // Leere Felder sollen einen gespeicherten Schlüssel nicht löschen — sonst
      // wäre er nach jedem Speichern der Oberfläche weg.
      const sauber = Object.fromEntries(Object.entries(daten).filter(([, v]) => v !== '' && v != null))
      schreiben(sauber)
      return json(res, 200, oeffentlich())
    }

    json(res, 404, { fehler: 'Gibt es hier nicht.' })
  } catch (err) {
    json(res, 400, { fehler: err.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Handschrift läuft auf http://localhost:${PORT}`)
  console.log('  Nur dieser Rechner kommt dran. Beenden mit Strg+C\n')
})
