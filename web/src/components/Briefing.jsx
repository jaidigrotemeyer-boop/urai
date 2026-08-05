import React, { useEffect, useState, useCallback } from 'react'
import { t } from '../i18n.js'

/**
 * Das Tagesbriefing: was beim Öffnen dasteht, bevor man irgendetwas tippt.
 *
 * Es geht einmal pro Tag von selbst auf. Der Inhalt kommt vom Server (dort
 * sucht ein Agent und fasst zusammen) — hier wird nur gezeigt. Solange gebaut
 * wird, steht das Fenster trotzdem schon da: warten vor einem leeren Bildschirm
 * fühlt sich kaputt an, warten vor etwas, das sichtbar arbeitet, nicht.
 */
export default function Briefing({ onSchliessen, onThemaFragen }) {
  const [briefing, setBriefing] = useState(null)
  const [baut, setBaut] = useState(true)
  const [fehler, setFehler] = useState(null)
  const [raus, setRaus] = useState(false)
  const [themenAuf, setThemenAuf] = useState(false)
  const [themen, setThemen] = useState([])
  const [neuesThema, setNeuesThema] = useState('')

  const laden = useCallback(async ({ neu = false } = {}) => {
    setBaut(true)
    setFehler(null)
    try {
      const r = neu
        ? await fetch('/api/briefing', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ neu: true }),
          })
        : await fetch('/api/briefing?warten=1')
      const j = await r.json()
      if (j.fehler) setFehler(j.fehler)
      else setBriefing(j.briefing)
    } catch {
      setFehler(t('briefFehlerVerbindung'))
    }
    setBaut(false)
  }, [])

  useEffect(() => {
    laden()
    fetch('/api/status')
      .then((r) => r.json())
      .then((s) => setThemen(s.config?.briefingThemen || []))
      .catch(() => {})
  }, [laden])

  function schliessen() {
    setRaus(true)
    fetch('/api/briefing/gesehen', { method: 'POST' }).catch(() => {})
    setTimeout(onSchliessen, 420)
  }

  async function themenSpeichern(liste) {
    setThemen(liste)
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ briefingThemen: liste }),
      })
    } catch {}
  }

  function themaDazu() {
    const w = neuesThema.trim()
    if (!w || themen.length >= 6 || themen.some((x) => x.toLowerCase() === w.toLowerCase())) return
    themenSpeichern([...themen, w])
    setNeuesThema('')
  }

  const datum = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const leerGrund = briefing?.leer ? briefing.grund : null

  return (
    <div className={`brf-buehne ${raus ? 'raus' : ''}`}>
      <div className="brf-blatt">
        <header className="brf-kopf">
          <div>
            <div className="brf-datum">{datum}</div>
            <h1>{briefing?.gruss?.trim() || t('briefTitel')}</h1>
          </div>
          <button className="brf-zu" onClick={schliessen} aria-label={t('briefSchliessen')}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="brf-inhalt">
          {/* Ein Gerüst statt eines Kringels: man sieht schon, WAS gleich kommt —
              zwei Themen mit je ein paar Zeilen. Das macht die halbe Minute
              Wartezeit kürzer, als jede Fortschrittsanzeige es könnte. */}
          {baut && (
            <div className="brf-geruest" aria-label={t('briefLaedt')}>
              {[0, 1].map((s) => (
                <div className="brf-g-thema" key={s} style={{ '--i': s }}>
                  <span className="brf-g-titel brf-schimmer" />
                  {[0, 1, 2].map((z) => (
                    <span
                      className={`brf-g-zeile brf-schimmer z${z}`}
                      key={z}
                      style={{ '--d': s * 3 + z }}
                    />
                  ))}
                </div>
              ))}
              <p className="brf-g-text">{t('briefLaedt')}</p>
            </div>
          )}

          {!baut && fehler && (
            <div className="brf-hinweis fehler">
              <p>{fehler}</p>
            </div>
          )}

          {!baut && !fehler && leerGrund === 'keine-themen' && (
            <div className="brf-hinweis">
              <p>{t('briefKeineThemen')}</p>
            </div>
          )}

          {!baut && !fehler && leerGrund === 'kein-gehirn' && (
            <div className="brf-hinweis">
              <p>{t('briefKeinGehirn')}</p>
            </div>
          )}

          {!baut && !fehler && leerGrund && !['keine-themen', 'kein-gehirn'].includes(leerGrund) && (
            <div className="brf-hinweis">
              <p>{t('briefNichtsNeues')}</p>
            </div>
          )}

          {!baut &&
            !fehler &&
            !briefing?.leer &&
            (briefing?.themen || [])
              .filter((th) => th.punkte?.length)
              .map((th, i) => (
                <section className="brf-thema" key={th.thema} style={{ '--i': i }}>
                  <h2>{th.thema}</h2>
                  <ul>
                    {th.punkte.map((p, j) => (
                      // --d zählt über alle Themen durch, damit die Zeilen als eine
                      // Bewegung von oben nach unten laufen statt pro Block neu
                      <li key={j} style={{ '--d': i * 2 + j }}>
                        <span className="brf-text">{p.text}</span>
                        {p.quelle && <span className="brf-quelle">{p.quelle}</span>}
                        <button
                          className="brf-mehr"
                          onClick={() => {
                            schliessen()
                            onThemaFragen?.(`${t('briefMehrFrage')} ${th.thema}: ${p.text}`)
                          }}
                        >
                          {t('briefMehr')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

          {themenAuf && (
            <section className="brf-themenbox">
              <label>{t('briefThemenLabel')}</label>
              <div className="brf-chips">
                {themen.map((th) => (
                  <span className="brf-chip" key={th}>
                    {th}
                    <button onClick={() => themenSpeichern(themen.filter((x) => x !== th))} aria-label="×">
                      ×
                    </button>
                  </span>
                ))}
                {!themen.length && <span className="brf-leerchip">{t('briefNochKeine')}</span>}
              </div>
              {themen.length < 6 && (
                <div className="brf-themen-neu">
                  <input
                    placeholder={t('briefThemaPlatzhalter')}
                    value={neuesThema}
                    onChange={(e) => setNeuesThema(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && themaDazu()}
                    maxLength={40}
                  />
                  <button onClick={themaDazu} disabled={!neuesThema.trim()}>
                    {t('briefThemaDazu')}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="brf-fuss">
          <button className="brf-still" onClick={() => setThemenAuf((a) => !a)}>
            {themenAuf ? t('briefThemenZu') : t('briefThemenAendern')}
          </button>
          <button className="brf-still" onClick={() => laden({ neu: true })} disabled={baut}>
            {t('briefNeuLaden')}
          </button>
          <span className="brf-schub" />
          <button className="primary brf-weiter" onClick={schliessen}>
            {t('briefLosGehts')}
          </button>
        </footer>
      </div>
    </div>
  )
}
