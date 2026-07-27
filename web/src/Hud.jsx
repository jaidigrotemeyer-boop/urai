import React, { useEffect, useRef, useState } from 'react'
import { t, sprache, useSprache } from './i18n.js'
import { hoeren, sprechen, still, kannHoeren, weckwortHoeren } from './stimme.js'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
const SESSION = `s-${new Date().toISOString().slice(0, 10)}`

/**
 * HUD: nur die Notch, sonst nichts. Für ein kleines Fenster, das oben
 * am Bildschirm klebt, während du woanders arbeitest.
 *
 * Die Kapsel wächst und schrumpft mit dem, was gerade passiert —
 * eine Zeile im Ruhezustand, mehrere beim Arbeiten.
 */
export default function Hud() {
  useSprache()
  const [busy, setBusy] = useState(false)
  const [tun, setTun] = useState(null)
  const [agents, setAgents] = useState([])
  const [liveOn, setLiveOn] = useState(false)
  const [liveApp, setLiveApp] = useState('')
  const [note, setNote] = useState(null)
  const [antwort, setAntwort] = useState(null)
  const [queue, setQueue] = useState(0)
  const [warte, setWarte] = useState(null)
  const [offen, setOffen] = useState(false)
  const [draft, setDraft] = useState('')
  const [verbunden, setVerbunden] = useState(false)

  const [hoert, setHoert] = useState(false)
  const [stimmeAn, setStimmeAn] = useState(() => localStorage.getItem('urai-stimme') !== 'aus')
  const [weckAn, setWeckAn] = useState(() => localStorage.getItem('urai-weckwort') === 'an')
  const [wach, setWach] = useState(false)
  const [gehoert, setGehoert] = useState('')
  const weck = useRef(null)

  const ws = useRef(null)
  const feld = useRef(null)
  const streaming = useRef(false)
  const mikro = useRef(null)
  const gesprochen = useRef('')

  // Mikrofon an: gesprochenes landet im Feld und wird am Ende gleich abgeschickt
  function zuhoeren() {
    if (hoert) {
      mikro.current?.stop()
      return
    }
    still()
    setHoert(true)
    setOffen(true)
    mikro.current = hoeren({
      onText: (text) => setDraft(text),
      onEnde: (text) => {
        setHoert(false)
        const fertig = (text || '').trim()
        if (fertig.length > 2) {
          ws.current?.send(JSON.stringify({ type: 'chat', session: SESSION, text: fertig, lang: sprache() }))
          setDraft('')
          setOffen(false)
          setBusy(true)
          setTun({ satz: t('thinking'), seit: Date.now() })
        }
      },
      onFehler: (f) => {
        setHoert(false)
        setAntwort(f)
      },
    })
  }

  // Weckwort: lauscht im Hintergrund, bis jemand "Hey URAI" sagt
  useEffect(() => {
    if (!weckAn || !kannHoeren()) return
    weck.current = weckwortHoeren({
      onWach: () => {
        setWach(true)
        setGehoert('')
      },
      onStatus: (text) => setGehoert(text),
      onBefehl: (text) => {
        setWach(false)
        setGehoert('')
        ws.current?.send(JSON.stringify({ type: 'chat', session: SESSION, text, lang: sprache() }))
        setBusy(true)
        setTun({ satz: t('thinking'), seit: Date.now() })
      },
      onFehler: (f) => {
        setWach(false)
        setAntwort(f)
        setWeckAn(false)
        localStorage.setItem('urai-weckwort', 'aus')
      },
    })
    return () => weck.current?.stop()
  }, [weckAn])

  useEffect(() => {
    let lebt = true
    let retry
    const connect = () => {
      const s = new WebSocket(WS_URL)
      ws.current = s
      s.onopen = () => lebt && (setVerbunden(true), s.send(JSON.stringify({ type: 'lang', code: sprache() })))
      s.onclose = () => {
        if (!lebt) return
        setVerbunden(false)
        retry = setTimeout(connect, 1500)
      }
      s.onmessage = (e) => nachricht(JSON.parse(e.data))
    }
    connect()
    return () => {
      lebt = false
      clearTimeout(retry)
      ws.current?.close()
    }
  }, [])

  // Tastenkürzel: Leertaste öffnet das Eingabefeld
  useEffect(() => {
    const taste = (e) => {
      if (e.key === 'Escape') return setOffen(false)
      if (!offen && (e.key === ' ' || e.key === 'Enter') && document.activeElement === document.body) {
        e.preventDefault()
        setOffen(true)
        setTimeout(() => feld.current?.focus(), 60)
      }
    }
    addEventListener('keydown', taste)
    return () => removeEventListener('keydown', taste)
  }, [offen])

  function nachricht(m) {
    switch (m.type) {
      case 'thinking':
        setBusy(true)
        setWarte(null)
        setAntwort(null)
        setTun({ satz: m.agent ? `${m.agent} ${t('working')}` : t('thinking'), seit: Date.now() })
        streaming.current = false
        break
      case 'waiting':
        setWarte(m.sekunden)
        setTun({ satz: `${t('waiting')} ${m.sekunden}s`, seit: Date.now() })
        break
      case 'queue':
        setQueue(Math.max(0, (m.laenge || 0) - (m.arbeitet ? 1 : 0)))
        break
      case 'tool_start':
        setTun({ satz: m.satz || m.name, verb: m.verb, ziel: m.ziel, seit: Date.now() })
        break
      case 'agent_start':
        setAgents((x) => [...x, { name: m.name, depth: m.depth }])
        break
      case 'agent_end':
        setAgents((x) => x.filter((a) => a.name !== m.name))
        break
      case 'delta':
        if (!streaming.current) {
          streaming.current = true
          setAntwort(m.text)
        } else setAntwort((a) => (a || '') + m.text)
        break
      case 'live_state':
        setLiveOn(m.on)
        break
      case 'live_frame':
        setLiveApp(m.app || '')
        break
      case 'live_note':
        setNote(m.text)
        break
      case 'summary':
        setAntwort(m.text)
        break
      case 'done':
        setBusy(false)
        setTun(null)
        setAgents([])
        setWarte(null)
        streaming.current = false
        if (stimmeAn && m.text) sprechen(m.text)
        setTimeout(() => setAntwort(null), 9000)
        break
      case 'stopped':
      case 'error':
        setBusy(false)
        setTun(null)
        setAgents([])
        setWarte(null)
        if (m.message) setAntwort(m.message.slice(0, 200))
        break
      default:
        break
    }
  }

  function senden() {
    const text = draft.trim()
    if (!text || !verbunden) return
    ws.current.send(JSON.stringify({ type: 'chat', session: SESSION, text, lang: sprache() }))
    setDraft('')
    setOffen(false)
    setBusy(true)
    setTun({ satz: t('thinking'), seit: Date.now() })
  }

  const zustand = wach
    ? 'wach'
    : warte
      ? 'warte'
      : busy
        ? 'arbeit'
        : offen
          ? 'offen'
          : antwort
            ? 'antwort'
            : liveOn
              ? 'live'
              : 'ruhe'

  const kopfzeile =
    zustand === 'wach'
      ? [gehoert || `${t('listening')}…`, '']
      : zustand === 'arbeit' || zustand === 'warte'
        ? tun?.verb
          ? [tun.verb, tun.ziel]
          : [tun?.satz, '']
        : zustand === 'antwort'
          ? [antwort?.split('\n')[0].slice(0, 90), '']
          : zustand === 'live'
            ? [note || t('live'), '']
            : ['URAI', '']

  return (
    <div className={`hud is-${zustand}`}>
      <div className="hud-kapsel" onClick={() => !busy && setOffen((v) => !v)}>
        <div className="hud-kopf">
          <span className="orb" />
          {agents.map((a) => (
            <span key={a.name} className="orb kid" style={{ '--kid': Math.max(0.42, 1 - a.depth * 0.2) }} />
          ))}

          <span className="hud-text">
            {kopfzeile[0]}
            {kopfzeile[1] && <b> {kopfzeile[1]}</b>}
            {busy && <span className="punkte"><i /><i /><i /></span>}
          </span>

          {queue > 0 && <span className="notch-zahl">+{queue}</span>}
          {liveOn && !busy && <span className="rec" />}

          {kannHoeren() && (
            <button
              className={`mikro ${hoert ? 'an' : ''}`}
              title={t('speak')}
              onClick={(e) => {
                e.stopPropagation()
                zuhoeren()
              }}
            >
              <span className="wellen"><i /><i /><i /><i /></span>
            </button>
          )}
          {busy && (
            <button
              className="notch-stop"
              onClick={(e) => {
                e.stopPropagation()
                ws.current?.send(JSON.stringify({ type: 'stop' }))
              }}
            >
              {t('stop')}
            </button>
          )}
        </div>

        <div className="hud-bauch">
          <div className="hud-innen">
            {zustand === 'antwort' && <div className="hud-antwort">{antwort}</div>}

            {offen && (
              <div className="hud-eingabe">
                <input
                  ref={feld}
                  value={draft}
                  placeholder={t('ask')}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && senden()}
                  onClick={(e) => e.stopPropagation()}
                />
                <button className="prim" onClick={(e) => (e.stopPropagation(), senden())}>
                  {t('go')}
                </button>
              </div>
            )}

            {offen && (
              <div className="hud-zeile">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    ws.current?.send(JSON.stringify({ type: 'live', on: !liveOn }))
                  }}
                >
                  {liveOn ? `${t('live')} ${t('off')}` : `${t('live')} ${t('on')}`}
                </button>
                <button onClick={(e) => (e.stopPropagation(), window.open('/', '_blank'))}>{t('eye')}</button>
                <button
                  className={stimmeAn ? 'an' : ''}
                  onClick={(e) => {
                    e.stopPropagation()
                    const neu = !stimmeAn
                    setStimmeAn(neu)
                    localStorage.setItem('urai-stimme', neu ? 'an' : 'aus')
                    if (!neu) still()
                  }}
                >
                  {t('voice')} {stimmeAn ? t('on') : t('off')}
                </button>
                {kannHoeren() && (
                  <button
                    className={weckAn ? 'an' : ''}
                    onClick={(e) => {
                      e.stopPropagation()
                      const neu = !weckAn
                      setWeckAn(neu)
                      localStorage.setItem('urai-weckwort', neu ? 'an' : 'aus')
                      if (!neu) {
                        weck.current?.stop()
                        setWach(false)
                      }
                    }}
                  >
                    „Hey URAI" {weckAn ? t('on') : t('off')}
                  </button>
                )}
                {liveApp && <span className="hud-app">{liveApp}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
