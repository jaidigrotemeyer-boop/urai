import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Settings from './components/Settings.jsx'
import Eye from './components/Eye.jsx'
import Boot from './components/Boot.jsx'
import Notch from './components/Notch.jsx'
import Cursor from './components/Cursor.jsx'
import Aktivitaet from './components/Aktivitaet.jsx'
import Farbrad from './components/Farbrad.jsx'
import Graph3D from './components/Graph3D.jsx'
import Bereiche from './components/Bereiche.jsx'
import Verlauf from './components/Verlauf.jsx'
import Werkstatt from './components/Werkstatt.jsx'
import Onboarding from './components/Onboarding.jsx'
import Briefing from './components/Briefing.jsx'
import { farbeLesen, useFarbe } from './theme.js'
import { t, useSprache, sprache } from './i18n.js'
import { hoeren, sprechen, still, kannHoeren, weckwortHoeren } from './stimme.js'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
const SESSION = `s-${new Date().toISOString().slice(0, 10)}`

export default function App() {
  useSprache() // neu zeichnen, wenn die Sprache wechselt
  useFarbe()

  const [items, setItems] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState(t('thinking'))
  const [connected, setConnected] = useState(false)
  const [brain, setBrain] = useState(null)
  const [status, setStatus] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showEye, setShowEye] = useState(false)
  const [screen, setScreen] = useState(null)
  const [terminal, setTerminal] = useState('')
  const [installEvt, setInstallEvt] = useState(null)
  const [live, setLive] = useState([])
  const [liveOn, setLiveOn] = useState(false)
  const [liveNotes, setLiveNotes] = useState([])
  const [liveApp, setLiveApp] = useState('')
  const [wach, setWach] = useState(false)
  const [tun, setTun] = useState(null) // was er gerade tut, im Klartext
  const [warte, setWarte] = useState(null) // Gehirn überlastet, Sekunden
  const [queue, setQueue] = useState(0) // wie viele Aufträge warten
  const [tempo, setTempo] = useState(null) // Zeichen pro Sekunde
  const [schritt, setSchritt] = useState(null)
  const [hoert, setHoert] = useState(false)
  const [stimmeAn, setStimmeAn] = useState(() => localStorage.getItem('urai-stimme') !== 'aus')
  const [weckAn, setWeckAn] = useState(() => localStorage.getItem('urai-weckwort') === 'an')
  const [geweckt, setGeweckt] = useState(false) // Weckwort gehört, wartet auf den Befehl
  const [ansicht, setAnsicht] = useState('chat') // chat | bereiche | werkstatt | graph
  const [ablaufEreignisse, setAblaufEreignisse] = useState([])
  const [farbradAuf, setFarbradAuf] = useState(false)
  const [verlaufAuf, setVerlaufAuf] = useState(false)
  const [sitzung, setSitzung] = useState(SESSION)
  const [onboardingZeigen, setOnboardingZeigen] = useState(false)
  const [briefingZeigen, setBriefingZeigen] = useState(false)
  const mikro = useRef(null)
  const weck = useRef(null)

  const ws = useRef(null)
  const scroller = useRef(null)
  const streaming = useRef(false)

  const push = useCallback((item) => setItems((xs) => [...xs, { key: crypto.randomUUID(), ...item }]), [])
  const patchLast = useCallback((match, patch) => {
    setItems((xs) => {
      for (let i = xs.length - 1; i >= 0; i--) {
        if (match(xs[i])) {
          const next = [...xs]
          next[i] = { ...xs[i], ...patch }
          return next
        }
      }
      return xs
    })
  }, [])

  // ── Verbindung ──
  useEffect(() => {
    let alive = true
    let retry

    const connect = () => {
      const sock = new WebSocket(WS_URL)
      ws.current = sock
      sock.onopen = () => {
        if (!alive) return
        setConnected(true)
        sock.send(JSON.stringify({ type: 'lang', code: sprache() }))
      }
      sock.onclose = () => {
        if (!alive) return
        setConnected(false)
        setBusy(false)
        retry = setTimeout(connect, 1500)
      }
      sock.onmessage = (e) => handle(JSON.parse(e.data))
    }
    connect()

    fetch('/api/status')
      .then((r) => r.json())
      .then((s) => {
        if (!alive) return
        setStatus(s)
        if (!s.config?.onboardingFertig) {
          setOnboardingZeigen(true)
          return
        }
        // Tagesbriefing: einmal am Tag von selbst. Der Aufruf stößt das Bauen
        // gleich mit an, damit beim Öffnen nicht erst gesucht werden muss.
        if (s.config?.briefingAn) {
          fetch('/api/briefing')
            .then((r) => r.json())
            .then((b) => alive && !b.schonGezeigt && setBriefingZeigen(true))
            .catch(() => {})
        }
      })
      .catch(() => {})

    return () => {
      alive = false
      clearTimeout(retry)
      ws.current?.close()
    }
  }, [])

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setInstallEvt(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  // Die Ampel muss mitlaufen, sonst zeigt sie einen Stand von vor einer Stunde
  useEffect(() => {
    const holen = () =>
      fetch('/api/status')
        .then((r) => r.json())
        .then(setStatus)
        .catch(() => {})
    const i = setInterval(holen, 20000)
    return () => clearInterval(i)
  }, [])

  // Weckwort: lauscht leise mit, bis jemand "Hey URAI" sagt
  useEffect(() => {
    if (!weckAn || !kannHoeren()) return
    weck.current = weckwortHoeren({
      onWach: () => setGeweckt(true),
      onStatus: (text) => setDraft(text),
      onBefehl: (text) => {
        setGeweckt(false)
        setDraft('')
        send(text)
      },
      onFehler: (f) => {
        setGeweckt(false)
        setWeckAn(false)
        localStorage.setItem('urai-weckwort', 'aus')
        push({ kind: 'msg', role: 'error', text: f })
      },
    })
    return () => weck.current?.stop()
  }, [weckAn])

  function handle(msg) {
    switch (msg.type) {
      case 'thinking':
        setBusy(true)
        setWarte(null)
        setSchritt({ nr: msg.step, von: msg.gesamt })
        setTun({ satz: msg.agent ? `${msg.agent} ${t('working')}` : t('thinking'), denkt: true })
        setPhase(msg.agent ? `${msg.agent} ${t('working')}` : t('thinking'))
        streaming.current = false
        break

      case 'waiting':
        setWarte({ sekunden: msg.sekunden, grund: msg.grund })
        setTun({ satz: `${t('waiting')} ${msg.sekunden}s`, warte: true })
        break

      case 'queue':
        setQueue(Math.max(0, (msg.laenge || 0) - (msg.arbeitet ? 1 : 0)))
        break

      case 'brain':
        setBrain(`${msg.provider} · ${msg.model}`)
        if (msg.tempo) setTempo(msg.tempo)
        break

      case 'delta':
        if (!streaming.current) {
          streaming.current = true
          push({ kind: 'msg', role: 'assistant', text: msg.text })
        } else {
          setItems((xs) => {
            const next = [...xs]
            const last = next[next.length - 1]
            if (last?.kind === 'msg' && last.role === 'assistant')
              next[next.length - 1] = { ...last, text: last.text + msg.text }
            return next
          })
        }
        break

      case 'tool_start':
        streaming.current = false
        setPhase(msg.satz || msg.name)
        setTun({ satz: msg.satz || msg.name, verb: msg.verb, ziel: msg.ziel, seit: Date.now() })
        push({
          kind: 'step',
          name: msg.name,
          satz: msg.satz,
          args: msg.args,
          state: 'run',
          result: '',
          agent: msg.agent,
          depth: msg.depth || 0,
        })
        break

      case 'tool_stream':
        if (msg.kind === 'terminal') setTerminal((x) => (x + msg.data).slice(-40000))
        if (msg.kind === 'screen') setScreen(msg.data)
        // Die Werkstatt schaut einem laufenden Ablauf live zu
        if (msg.kind?.startsWith('ablauf_')) {
          if (msg.kind === 'ablauf_start') setAblaufEreignisse([{ type: msg.kind, ...msg.data }])
          else setAblaufEreignisse((xs) => [...xs.slice(-300), { type: msg.kind, ...msg.data }])
        }
        break

      case 'tool_end':
        patchLast((x) => x.kind === 'step' && x.name === msg.name && x.state === 'run', {
          state: msg.ok ? 'ok' : 'fail',
          result: msg.result,
          ms: msg.ms,
        })
        break

      case 'agent_start':
        streaming.current = false
        setPhase(`${msg.name} ${t('working')}`)
        setLive((xs) => [...xs, { name: msg.name, role: msg.role, depth: msg.depth }])
        push({
          kind: 'agent',
          name: msg.name,
          role: msg.role,
          parent: msg.parent,
          task: msg.task,
          depth: msg.depth,
          state: 'run',
        })
        break

      case 'agent_end':
        setLive((xs) => xs.filter((a) => a.name !== msg.name))
        patchLast((x) => x.kind === 'agent' && x.name === msg.name && x.state === 'run', {
          state: msg.ok ? 'ok' : 'fail',
          result: msg.result,
        })
        break

      case 'group_start':
        streaming.current = false
        push({ kind: 'group', name: msg.name, goal: msg.goal, members: msg.members, state: 'run' })
        break

      case 'group_end':
        patchLast((x) => x.kind === 'group' && x.name === msg.name && x.state === 'run', {
          state: 'ok',
          note: msg.note,
        })
        break

      case 'live_state':
        setLiveOn(msg.on)
        break

      case 'live_frame':
        setScreen(msg.data)
        setLiveApp(msg.app || '')
        break

      case 'live_note':
        setLiveNotes((xs) => [...xs.slice(-40), { t: Date.now(), text: msg.text, app: msg.app, wichtig: msg.wichtig }])
        break

      case 'live_error':
        setLiveNotes((xs) => [...xs.slice(-40), { t: Date.now(), text: msg.message, err: true }])
        break

      case 'obsidian':
        push({ kind: 'note', text: `${t('savedTo')}: ${msg.note}` })
        break

      // Ein Auslöser will einen Ablauf starten — mit Karenzzeit zum Abwürgen
      case 'ausloeser_gleich':
        push({
          kind: 'ausloeser',
          id: msg.id,
          name: msg.name,
          grund: msg.grund,
          karenzS: msg.karenzS,
          offen: true,
        })
        break

      case 'ausloeser_abgebrochen':
        patchLast((x) => x.kind === 'ausloeser' && x.id === msg.id, { offen: false, zustand: 'abgebrochen' })
        break

      case 'ausloeser_start':
        patchLast((x) => x.kind === 'ausloeser' && x.id === msg.id, { offen: false, zustand: 'läuft' })
        break

      case 'ausloeser_fertig':
        patchLast((x) => x.kind === 'ausloeser' && x.id === msg.id, { zustand: 'fertig', ergebnis: msg.ergebnis })
        break

      case 'ausloeser_fehler':
        push({ kind: 'msg', role: 'error', text: `Auslöser: ${msg.text}` })
        break

      case 'summarizing':
        streaming.current = false
        setPhase(t('summarizing'))
        break

      case 'summary':
        streaming.current = false
        push({ kind: 'summary', text: msg.text })
        break

      case 'approval':
        push({ kind: 'approval', id: msg.id, tool: msg.tool, args: msg.args, open: true })
        break

      case 'done':
        setBusy(false)
        setLive([])
        setTun(null)
        setWarte(null)
        setSchritt(null)
        streaming.current = false
        if (stimmeAn && msg.text) sprechen(msg.text)
        break

      case 'stopped':
        setBusy(false)
        setLive([])
        setTun(null)
        setWarte(null)
        setQueue(0)
        streaming.current = false
        push({ kind: 'msg', role: 'error', text: t('stopped') })
        break

      case 'error':
        setBusy(false)
        setLive([])
        setTun(null)
        setWarte(null)
        streaming.current = false
        push({ kind: 'msg', role: 'error', text: msg.message })
        break

      default:
        break
    }
  }

  // Während gearbeitet wird, darf man weiter schicken — der Server stellt an.
  function send(override) {
    const text = (override ?? draft).trim()
    if (!text || !connected) return
    push({ kind: 'msg', role: 'user', text, wartet: busy })
    if (override === undefined) setDraft('')
    if (!busy) {
      setBusy(true)
      setPhase(t('thinking'))
    }
    ws.current.send(JSON.stringify({ type: 'chat', session: sitzung, text, lang: sprache() }))
  }

  /**
   * Mikrofon: was du sagst, landet live im Feld. Am Ende geht es von selbst raus.
   * Nichts wird aufgenommen oder gespeichert — nur der erkannte Text.
   */
  function zuhoeren() {
    if (hoert) {
      mikro.current?.stop()
      return
    }
    still()
    setHoert(true)
    mikro.current = hoeren({
      onText: (text) => setDraft(text),
      onEnde: (text) => {
        setHoert(false)
        const fertig = (text || '').trim()
        if (fertig.length > 2) send(fertig)
        setDraft('')
      },
      onFehler: (f) => {
        setHoert(false)
        push({ kind: 'msg', role: 'error', text: f })
      },
    })
  }

  /** Ein altes Gespräch zurückholen und im Chat wieder aufblättern. */
  async function gespraechOeffnen(id) {
    setVerlaufAuf(false)
    setSitzung(id)
    setItems([])
    try {
      const alt = await fetch(`/api/history/${encodeURIComponent(id)}`).then((r) => r.json())
      setItems(
        alt
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ key: crypto.randomUUID(), kind: 'msg', role: m.role, text: m.content }))
      )
    } catch {
      push({ kind: 'msg', role: 'error', text: 'Konnte das Gespräch nicht laden.' })
    }
  }

  function answerApproval(id, ok, always) {
    ws.current?.send(JSON.stringify({ type: 'approval', id, ok, always }))
    patchLast((x) => x.kind === 'approval' && x.id === id, {
      open: false,
      answer: ok ? (always ? t('always') : t('yes')) : t('no'),
    })
  }

  const brainLabel = useMemo(() => {
    if (!connected) return '—'
    if (brain) return brain.split(' · ')[0]
    const s = status?.brain
    if (!s) return t('loading')
    return s.chain?.length ? `${s.chain[0]} ${t('ready')}` : t('noKey')
  }, [connected, brain, status])

  const letzteNotiz = liveNotes.length ? liveNotes[liveNotes.length - 1].text : null

  return (
    <div className={`app ${wach ? 'wach' : ''}`}>
      {!wach && <Boot onDone={() => setWach(true)} />}
      <Cursor busy={busy} />
      {onboardingZeigen && (
        <Onboarding
          onFertig={() => {
            setOnboardingZeigen(false)
            fetch('/api/status')
              .then((r) => r.json())
              .then((s) => {
                setStatus(s)
                // Direkt nach dem Erststart gleich das erste Briefing — dann sieht
                // man sofort, wofür die eben eingetragenen Themen gut sind.
                if (s.config?.briefingAn && (s.config?.briefingThemen || []).length) setBriefingZeigen(true)
              })
              .catch(() => {})
          }}
        />
      )}
      {briefingZeigen && (
        <Briefing onSchliessen={() => setBriefingZeigen(false)} onThemaFragen={(frage) => send(frage)} />
      )}

      <Notch
        busy={busy}
        phase={phase}
        queue={queue}
        warte={warte}
        agents={live}
        liveOn={liveOn}
        liveApp={liveApp}
        lastNote={letzteNotiz}
        brain={brainLabel}
        autoMode={status?.config?.autoMode}
        onLive={() => ws.current?.send(JSON.stringify({ type: 'live', on: !liveOn }))}
        onStop={() => ws.current?.send(JSON.stringify({ type: 'stop' }))}
        onSettings={() => setShowSettings(true)}
        onEye={() => setShowEye((v) => !v)}
        onInstall={
          installEvt
            ? async () => {
                installEvt.prompt()
                await installEvt.userChoice
                setInstallEvt(null)
              }
            : null
        }
      />

      {/* Werkstatt und Graph brauchen die ganze Fläche — der Chat tritt beiseite */}
      <div className={`split ${showEye ? 'show-eye' : ''} ${ansicht === 'werkstatt' || ansicht === 'graph' ? 'voll' : ''}`}>
        <section className="chat">
          <div className="messages" ref={scroller}>
            {items.length === 0 && (
              <div className="empty">
                {status?.config?.profilName ? `${t('gruss')}, ${status.config.profilName}.` : t('emptyTitle')}
                <br />
                {t('emptySub')}
              </div>
            )}
            {items.map((it) => (
              <Item
                key={it.key}
                item={it}
                onApprove={answerApproval}
                onAbbrechen={(id) => ws.current?.send(JSON.stringify({ type: 'ausloeser_abbrechen', id }))}
              />
            ))}
            <Aktivitaet tun={tun} warte={warte} schritt={schritt} tempo={tempo} queue={queue} agents={live} />
          </div>

          <div className="composer">
            <div className="chips">
              {[
                [t('quickRead'), t('promptRead')],
                [t('quickHelp'), t('promptHelp')],
                [t('quickOpen'), t('promptOpen')],
              ].map(([label, prompt]) => (
                <button key={label} className="chip" disabled={!connected} onClick={() => send(prompt)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="row">
              {kannHoeren() && (
                <button
                  className={`mikro ${hoert || geweckt ? 'an' : ''}`}
                  title={t('speak')}
                  onClick={zuhoeren}
                  disabled={!connected}
                >
                  <span className="wellen"><i /><i /><i /><i /></span>
                </button>
              )}
              <textarea
                value={draft}
                placeholder={hoert || geweckt ? `${t('listening')}…` : t('ask')}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <button className="primary" onClick={() => send()} disabled={!connected || !draft.trim()}>
                {busy ? `${t('go')} +` : t('go')}
              </button>
            </div>
            <div className="hint">
              <span>{t('hintSend')}</span>
              <button
                className="linkish"
                onClick={() => {
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
                  className={`linkish ${weckAn ? 'an' : ''}`}
                  onClick={() => {
                    const neu = !weckAn
                    setWeckAn(neu)
                    localStorage.setItem('urai-weckwort', neu ? 'an' : 'aus')
                    if (!neu) {
                      weck.current?.stop()
                      setGeweckt(false)
                    }
                  }}
                >
                  „Hey URAI" {weckAn ? t('on') : t('off')}
                </button>
              )}
              <button
                className="linkish"
                onClick={() =>
                  window.open('/?hud=1', 'urai-hud', 'width=560,height=190,alwaysOnTop=yes,menubar=no,toolbar=no')
                }
              >
                {t('hud')}
              </button>
              {status && !status.config?.hasGemini && (
                <button className="linkish" onClick={() => setShowSettings(true)}>
                  {t('keyMissing')}
                </button>
              )}
            </div>
          </div>
        </section>

        {ansicht === 'graph' ? (
          <Graph3D offen />
        ) : ansicht === 'werkstatt' ? (
          <Werkstatt
            onSenden={send}
            busy={busy}
            ereignisse={ablaufEreignisse}
            onStopp={() => ws.current?.send(JSON.stringify({ type: 'stop' }))}
          />
        ) : ansicht === 'bereiche' ? (
          <Bereiche onSenden={send} busy={busy} />
        ) : (
          <Eye screen={screen} terminal={terminal} status={status} liveNotes={liveNotes} liveOn={liveOn} />
        )}
      </div>

      <Fussleiste
        ansicht={ansicht}
        setAnsicht={setAnsicht}
        status={status}
        brain={brain}
        onFarbe={() => setFarbradAuf(true)}
        onVerlauf={() => setVerlaufAuf(true)}
        onModell={(patch) =>
          fetch('/api/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          })
            .then((r) => r.json())
            .then((cfg) => setStatus((s) => ({ ...s, config: cfg })))
        }
      />

      {farbradAuf && <Farbrad onClose={() => setFarbradAuf(false)} />}

      {verlaufAuf && (
        <Verlauf jetzige={sitzung} onOeffnen={gespraechOeffnen} onClose={() => setVerlaufAuf(false)} />
      )}

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} onSaved={(cfg) => setStatus((s) => ({ ...s, config: cfg }))} />
      )}
    </div>
  )
}

/**
 * Die Leiste ganz unten: welche Ansicht, welches Gehirn, welche Farbe.
 * Immer da, immer gleich — das Fundament unter allem.
 */
/**
 * Kontingent-Ampel: wie voll die Gratis-Stufen sind, bevor es knallt.
 * Ein Balken pro Gehirn — grün ist Luft, gelb wird eng, rot heißt gleich vorbei.
 */
function Ampel({ kontingent }) {
  if (!kontingent?.length) return null
  const eng = kontingent.filter((k) => k.eng)

  return (
    <div className="ampel" title={kontingent.map((k) => `${k.name}: ${k.minute}/${k.minuteMax} pro Minute · ${k.tag}/${k.tagMax} heute`).join('\n')}>
      {kontingent.map((k) => (
        <span key={k.provider} className={`ampel-balken ${k.anteil > 0.9 ? 'rot' : k.eng ? 'gelb' : ''}`}>
          <i style={{ width: `${Math.max(3, k.anteil * 100)}%` }} />
        </span>
      ))}
      {eng.length > 0 && <span className="ampel-warnung">{eng[0].name} wird eng</span>}
    </div>
  )
}

function Fussleiste({ ansicht, setAnsicht, status, brain, onFarbe, onModell, onVerlauf }) {
  const [modellAuf, setModellAuf] = useState(false)
  const f = farbeLesen()
  const kette = status?.brain?.chain || []
  const modelle = status?.brain?.models || {}
  const erstes = kette[0]
  const aktuell = brain?.split(' · ') || []

  const MODELLE = {
    gemini: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest', 'gemini-2.5-flash-lite'],
    cerebras: ['zai-glm-4.7', 'gpt-oss-120b', 'gemma-4-31b'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  }
  const FELD = { gemini: 'geminiModel', cerebras: 'cerebrasModel', groq: 'groqModel' }

  return (
    <>
      <div className="fuss">
        <div className="fuss-tabs">
          {[
            ['chat', t('screen')],
            ['bereiche', t('navBereiche')],
            ['werkstatt', t('navWerkstatt')],
            ['graph', t('navGraph')],
          ].map(([id, label]) => (
            <button key={id} className={ansicht === id ? 'on' : ''} onClick={() => setAnsicht(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="fuss-mitte">
          <button className="fuss-modell" onClick={() => setModellAuf((v) => !v)}>
            <span className="orb" style={{ '--kid': 0.55 }} />
            <span>{aktuell[0] || erstes || t('noKey')}</span>
            <span className="fuss-dim">{aktuell[1] || modelle[erstes] || ''}</span>
          </button>
          <Ampel kontingent={status?.brain?.kontingent} />
        </div>

        <div className="fuss-rechts">
          <button className="fuss-verlauf" onClick={onVerlauf} title={t('navVerlauf')}>
            {t('navVerlauf')}
          </button>
          <button
            className="farbknopf"
            onClick={onFarbe}
            title="Akzentfarbe"
            style={{ background: `hsl(${f.h} ${f.s}% ${f.l}%)` }}
          />
        </div>
      </div>

      {modellAuf && (
        <div className="modellwahl" onClick={() => setModellAuf(false)}>
          <div className="modellkarte" onClick={(e) => e.stopPropagation()}>
            <div className="field">
              <label>Anstrengung — wie viel Mühe sich URAI gibt</label>
              <div className="chips">
                {[
                  ['schnell', 'Schnell', 'Wenige Schritte, kürzerer Kontext'],
                  ['normal', 'Normal', 'Ausgewogen'],
                  ['gruendlich', 'Gründlich', 'Mehr Schritte, mehr Versuche, langsamer'],
                ].map(([id, label, hinweis]) => (
                  <button
                    key={id}
                    className={`chip ${status?.config?.anstrengung === id ? 'on' : ''}`}
                    title={hinweis}
                    onClick={() => onModell({ anstrengung: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sub">Reihenfolge: {kette.join(' → ') || 'kein Schlüssel'}</div>
            {kette
              .filter((p) => MODELLE[p])
              .map((p) => (
                <div className="field" key={p}>
                  <label>{p}</label>
                  <div className="chips">
                    {MODELLE[p].map((m) => (
                      <button
                        key={m}
                        className={`chip ${modelle[p] === m ? 'on' : ''}`}
                        onClick={() => onModell({ [FELD[p]]: m })}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            {status?.brain?.kaputt?.length > 0 && (
              <div className="note">
                Gerade in Pause: {status.brain.kaputt.map((k) => k.provider).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Item({ item, onApprove, onAbbrechen }) {
  if (item.kind === 'msg') {
    return (
      <div className={`msg ${item.role} ${item.wartet ? 'wartet' : ''}`}>
        {item.text}
        {item.wartet && <span className="wartemarke">{t('queued')}</span>}
      </div>
    )
  }

  if (item.kind === 'note') return <span className="pill live">{item.text}</span>

  if (item.kind === 'ausloeser') {
    return (
      <div className={`ausloeser ${item.zustand || ''}`}>
        <div className="ausloeser-kopf">
          <span className="dot" />
          <strong>{item.name}</strong>
          <span className="tail">{item.grund}</span>
        </div>
        {item.offen ? (
          <div className="row">
            <span className="ausloeser-balken" style={{ animationDuration: `${item.karenzS || 10}s` }} />
            <button className="danger" onClick={() => onAbbrechen(item.id)}>
              {t('stop')}
            </button>
          </div>
        ) : (
          <span className="chip-mini">{item.zustand}{item.ergebnis ? ` · ${item.ergebnis.slice(0, 80)}` : ''}</span>
        )}
      </div>
    )
  }

  if (item.kind === 'summary') {
    return (
      <div className="summary">
        <div className="summary-head">{t('summary')}</div>
        <div className="summary-body">{item.text}</div>
      </div>
    )
  }

  if (item.kind === 'group') {
    return (
      <div className={`group ${item.state}`}>
        <div className="group-head">
          <span className="dot" />
          <strong>
            {t('group')}: {item.name}
          </strong>
        </div>
        <div className="group-goal">{item.goal}</div>
        <div className="chips">
          {(item.members || []).map((m) => (
            <span key={m} className="chip">
              {m}
            </span>
          ))}
        </div>
        {item.note && <div className="group-goal">Obsidian: {item.note}</div>}
      </div>
    )
  }

  if (item.kind === 'agent') {
    const cls = item.state === 'ok' ? 'ok' : item.state === 'fail' ? 'fail' : ''
    return (
      <details className={`step agent ${cls}`} style={{ marginLeft: (item.depth - 1) * 16 }}>
        <summary>
          <span className="dot" />
          <strong>{item.name}</strong>
          <span className="tail">
            {item.role} · {t('from')} {item.parent}
          </span>
        </summary>
        <pre>{`${t('task')}:\n${item.task}\n\n${t('result')}:\n${item.result || `…${t('running')}`}`}</pre>
      </details>
    )
  }

  if (item.kind === 'step') {
    const cls = item.state === 'ok' ? 'ok' : item.state === 'fail' ? 'fail' : ''
    return (
      <details className={`step ${cls}`} style={item.depth ? { marginLeft: item.depth * 16 } : undefined}>
        <summary>
          <span className="dot" />
          <strong>
            {item.agent ? `${item.agent} · ` : ''}
            {item.satz || item.name}
          </strong>
          <span className="tail">
            {item.satz ? item.name : summarize(item.args)}
            {item.ms != null && ` · ${(item.ms / 1000).toFixed(1)}s`}
          </span>
        </summary>
        <pre>{item.result || '…'}</pre>
      </details>
    )
  }

  if (item.kind === 'approval') {
    return (
      <div className="approval">
        <h4>
          {t('allowQ')} · {item.tool}
        </h4>
        <pre>{JSON.stringify(item.args, null, 2)}</pre>
        {item.open ? (
          <div className="row">
            <button className="primary" onClick={() => onApprove(item.id, true)}>
              {t('yes')}
            </button>
            <button onClick={() => onApprove(item.id, true, true)}>{t('always')}</button>
            <button className="danger" onClick={() => onApprove(item.id, false)}>
              {t('no')}
            </button>
          </div>
        ) : (
          <span className="pill">{item.answer}</span>
        )}
      </div>
    )
  }
  return null
}

function summarize(args) {
  if (!args) return ''
  const s = Object.entries(args)
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(' ')
  return s.length > 90 ? s.slice(0, 90) + '…' : s
}
