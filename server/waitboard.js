// Das Waitboard anschauen und eine Antwort liefern, die man von Hand hinschreiben kann.
//
// Der ganze Trick steckt im Prompt: ein Modell antwortet von sich aus in
// Markdown-Absätzen. Auf ein Waitboard geschrieben ist das unlesbar. Also fragen
// wir nach kurzen Zeilen ohne Auszeichnung — und schneiden nach, falls das
// Modell sich nicht daran hält.

import { look } from './brain.js'

const MAX_ZEILEN = 14

/**
 * @param {string} spalten wie viele Zeichen in eine Zeile passen — kommt aus
 *   dem Browser, weil nur der weiß, wie breit der freie Platz gerade ist
 */
function anweisung({ frage, spalten }) {
  return [
    'Du schaust auf ein Whiteboard, auf das ein Schüler von Hand geschrieben hat.',
    'Deine Antwort wird daneben in Handschrift auf dasselbe Waitboard geschrieben.',
    '',
    'Halte dich streng daran:',
    `• höchstens ${MAX_ZEILEN} Zeilen, höchstens ${spalten} Zeichen pro Zeile`,
    '• reiner Text. Kein Markdown, keine Sternchen, keine Rauten, keine Tabellen',
    '• kein Vorwort wie "Klar!" oder "Gerne" — fang direkt mit der Sache an',
    '• Rechenschritte je einer pro Zeile, untereinander',
    '• wenn etwas falsch ist: erst hinschreiben was falsch ist, dann der richtige Weg',
    '• deutsche Sprache, du-Form, so knapp wie ein Tafelanschrieb',
    '',
    `Aufgabe: ${frage}`,
  ].join('\n')
}

/** Sicherheitsnetz: was trotzdem an Markdown durchkommt, fliegt hier raus. */
function fuerDasWaitboard(text, spalten) {
  const zeilen = String(text || '')
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```\w*\n?/g, ''))
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[*`_]/g, '')
    .split('\n')
    .map((z) => z.replace(/\s+$/, ''))

  // Zu lange Zeilen umbrechen wir hier, nicht erst beim Schreiben — sonst
  // stimmt die Zeilenzahl nicht mehr, mit der wir den Platz berechnet haben.
  const fertig = []
  for (const zeile of zeilen) {
    if (zeile.length <= spalten) {
      fertig.push(zeile)
      continue
    }
    let rest = zeile
    while (rest.length > spalten) {
      let schnitt = rest.lastIndexOf(' ', spalten)
      if (schnitt < spalten * 0.5) schnitt = spalten
      fertig.push(rest.slice(0, schnitt))
      rest = rest.slice(schnitt).trimStart()
    }
    if (rest) fertig.push(rest)
  }

  return fertig
    .slice(0, MAX_ZEILEN)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function waitboardRouten(app) {
  app.post('/api/waitboard/frage', async (req, res) => {
    const { bild, frage, spalten } = req.body || {}
    if (!bild) return res.status(400).json({ fehler: 'Kein Bild des Waitboards dabei.' })

    const breite = Math.max(12, Math.min(Number(spalten) || 34, 60))
    try {
      const roh = await look({
        imageBase64: bild,
        question: anweisung({ frage: frage || 'Schau dir das Waitboard an und hilf weiter.', spalten: breite }),
      })
      const text = fuerDasWaitboard(roh, breite)
      if (!text) return res.status(502).json({ fehler: 'Das Modell hat nichts geschickt.' })
      res.json({ text })
    } catch (e) {
      // look() wirft mit Klartext, wenn der Gemini-Schlüssel fehlt — den
      // Satz will der Nutzer sehen, nicht "500".
      res.status(502).json({ fehler: String(e.message || e) })
    }
  })
}
