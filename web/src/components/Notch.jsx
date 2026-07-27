import React, { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'

/**
 * Die Notch — eine schwebende Kapsel oben in der Mitte.
 * Sie ist im Ruhezustand klein und wächst nur, wenn es etwas zu sagen gibt:
 * beim Arbeiten, beim Mitgucken, wenn eine Zusammenfassung fertig ist.
 * Nichts blinkt ohne Grund. Die Form ist die Nachricht.
 */
export default function Notch({
  busy,
  phase,
  queue = 0,
  warte,
  agents = [],
  liveOn,
  liveApp,
  lastNote,
  brain,
  autoMode,
  onLive,
  onStop,
  onSettings,
  onEye,
  onInstall,
}) {
  const [offen, setOffen] = useState(false)
  const [puls, setPuls] = useState(false)
  const vorherNote = useRef(null)

  // Kurz aufleuchten, wenn eine neue Live-Notiz kommt
  useEffect(() => {
    if (lastNote && lastNote !== vorherNote.current) {
      vorherNote.current = lastNote
      setPuls(true)
      const t = setTimeout(() => setPuls(false), 900)
      return () => clearTimeout(t)
    }
  }, [lastNote])

  const zustand = warte ? 'warte' : busy ? 'arbeit' : offen ? 'offen' : liveOn && lastNote ? 'live' : 'ruhe'

  return (
    <div className="notch-rail">
      <div
        className={`notch is-${zustand} ${puls ? 'puls' : ''}`}
        onClick={() => !busy && setOffen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && setOffen((v) => !v)}
      >
        <div className="notch-core">
          <span className="eye" />
          {agents.map((a) => (
            <span
              key={a.name}
              className="eye kid"
              title={`${a.name} · ${a.role}`}
              style={{ '--k': Math.max(0.42, 1 - a.depth * 0.2) }}
            />
          ))}

          <span className="notch-text">
            {busy ? phase : liveOn && lastNote ? lastNote : liveOn ? t('live') : 'URAI'}
          </span>

          {queue > 0 && <span className="notch-zahl">+{queue}</span>}

          {liveOn && !busy && <span className="rec" />}

          {busy && (
            <button
              className="notch-stop"
              onClick={(e) => {
                e.stopPropagation()
                onStop()
              }}
            >
              {t('stop')}
            </button>
          )}
        </div>

        <div className="notch-more">
          <div className="notch-inner">
          <div className="notch-row">
            <span className="chip-mini">{brain}</span>
            {autoMode && <span className="chip-mini gruen">{t('auto')}</span>}
            <span className={`chip-mini ${liveOn ? 'rot' : ''}`}>{liveOn ? t('live') : t('liveOff')}</span>
          </div>
          <div className="notch-row">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onLive()
              }}
            >
              {liveOn ? `${t('live')} ${t('off')}` : `${t('live')} ${t('on')}`}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEye()
              }}
            >
              {t('eye')}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSettings()
              }}
            >
              {t('settings')}
            </button>
            {onInstall && (
              <button
                className="prim"
                onClick={(e) => {
                  e.stopPropagation()
                  onInstall()
                }}
              >
                {t('install')}
              </button>
            )}
          </div>
          {liveOn && liveApp && <div className="notch-app">{liveApp}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
