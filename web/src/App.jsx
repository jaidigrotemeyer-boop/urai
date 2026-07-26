import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Settings from './components/Settings.jsx'
import Eye from './components/Eye.jsx'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
const SESSION = `s-${new Date().toISOString().slice(0, 10)}`

export default function App() {
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('denkt')
  const [live, setLive] = useState([]) // Agenten, die gerade arbeiten
  const [liveOn, setLiveOn] = useState(false)
  const [liveNotes, setLiveNotes] = useState([])
  const [liveApp, setLiveApp] = useState('')
  const [connected, setConnected] = useState(false)
  const [brain, setBrain] = useState(null)
  const [status, setStatus] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showEye, setShowEye] = useState(false)
  const [screen, setScreen] = useState(null)
  const [terminal, setTerminal] = useState('')
  const [installEvt, setInstallEvt] = useState(null)

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
      sock.onopen = () => alive && setConnected(true)
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
      .then((s) => alive && setStatus(s))
      .catch(() => {})

    return () => {
      alive = false
      clearTimeout(retry)
      ws.current?.close()
    }
  }, [])

  // ── PWA Installier-Knopf ──
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

  function handle(msg) {
    switch (msg.type) {
      case 'thinking':
        setBusy(true)
        setPhase(msg.agent ? `${msg.agent} denkt` : 'denkt')
        streaming.current = false
        break

      case 'brain':
        setBrain(`${msg.provider} · ${msg.model}`)
        break

      case 'delta':
        if (!streaming.current) {
          streaming.current = true
          push({ kind: 'msg', role: 'assistant', text: msg.text })
        } else {
          setItems((xs) => {
            const next = [...xs]
            const last = next[next.length - 1]
            if (last?.kind === 'msg' && last.role === 'assistant') next[next.length - 1] = { ...last, text: last.text + msg.text }
            return next
          })
        }
        break

      case 'tool_start':
        streaming.current = false
        setPhase(msg.name)
        push({ kind: 'step', name: msg.name, args: msg.args, state: 'run', result: '', agent: msg.agent, depth: msg.depth || 0 })
        break

      case 'agent_start':
        streaming.current = false
        setPhase(`${msg.name} arbeitet`)
        setLive((xs) => [...xs, { name: msg.name, role: msg.role, depth: msg.depth }])
        push({ kind: 'agent', name: msg.name, role: msg.role, parent: msg.parent, task: msg.task, depth: msg.depth, state: 'run' })
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
        patchLast((x) => x.kind === 'group' && x.name === msg.name && x.state === 'run', { state: 'ok', note: msg.note })
        break

      case 'live_state':
        setLiveOn(msg.on)
        break

      case 'live_frame':
        setScreen(msg.data)
        setLiveApp(msg.app || '')
        break

      case 'live_note':
        setLiveNotes((xs) => [...xs.slice(-40), { t: Date.now(), text: msg.text, app: msg.app }])
        break

      case 'live_error':
        setLiveNotes((xs) => [...xs.slice(-40), { t: Date.now(), text: msg.message, err: true }])
        break

      case 'obsidian':
        push({ kind: 'note', text: `In Obsidian gespeichert: ${msg.note}` })
        break

      case 'summarizing':
        streaming.current = false
        setPhase('fasst zusammen')
        break

      case 'summary':
        streaming.current = false
        push({ kind: 'summary', text: msg.text })
        break

      case 'tool_stream':
        if (msg.kind === 'terminal') setTerminal((t) => (t + msg.data).slice(-40000))
        if (msg.kind === 'screen') setScreen(msg.data)
        break

      case 'tool_end':
        patchLast((x) => x.kind === 'step' && x.name === msg.name && x.state === 'run', {
          state: msg.ok ? 'ok' : 'fail',
          result: msg.result,
        })
        break

      case 'approval':
        push({ kind: 'approval', id: msg.id, tool: msg.tool, args: msg.args, open: true })
        break

      case 'screen':
        setScreen(msg.data)
        break

      case 'done':
        setBusy(false)
        setLive([])
        streaming.current = false
        break

      case 'stopped':
        setBusy(false)
        setLive([])
        streaming.current = false
        push({ kind: 'msg', role: 'error', text: 'Gestoppt.' })
        break

      case 'error':
        setBusy(false)
        setLive([])
        streaming.current = false
        push({ kind: 'msg', role: 'error', text: msg.message })
        break

      default:
        break
    }
    // Bildschirmfoto kommt über tool_stream mit kind 'screen'
  }

  function send(override) {
    const text = (override ?? draft).trim()
    if (!text || !connected || busy) return
    push({ kind: 'msg', role: 'user', text })
    setDraft('')
    setBusy(true)
    ws.current.send(JSON.stringify({ type: 'chat', session: SESSION, text }))
  }

  function answerApproval(id, ok, always) {
    ws.current?.send(JSON.stringify({ type: 'approval', id, ok, always }))
    patchLast((x) => x.kind === 'approval' && x.id === id, { open: false, answer: ok ? (always ? 'immer' : 'ja') : 'nein' })
  }

  const brainPill = useMemo(() => {
    if (!connected) return { text: 'getrennt', cls: 'off' }
    if (brain) return { text: brain, cls: 'live' }
    const s = status?.brain
    if (!s) return { text: 'verbinde…', cls: '' }
    if (s.chain?.length) return { text: `${s.chain[0]} bereit`, cls: 'live' }
    return { text: 'kein Schlüssel', cls: 'off' }
  }, [connected, brain, status])

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">UR<span>AI</span></div>
        <span className={`pill ${brainPill.cls}`}>{brainPill.text}</span>
        <button
          className={`pill livebtn ${liveOn ? 'on' : ''}`}
          onClick={() => ws.current?.send(JSON.stringify({ type: 'live', on: !liveOn }))}
          title={liveOn ? 'URAI guckt mit — klick zum Ausschalten' : 'Live-Mitgucken einschalten'}
        >
          <span className="rec" />
          {liveOn ? `LIVE${liveApp ? ` · ${liveApp}` : ''}` : 'Live aus'}
        </button>
        {status?.config?.autoMode && <span className="pill live">Auto</span>}
        <div className="spacer" />
        {installEvt && (
          <button
            className="primary"
            onClick={async () => {
              installEvt.prompt()
              await installEvt.userChoice
              setInstallEvt(null)
            }}
          >
            Installieren
          </button>
        )}
        {busy && (
          <button className="danger" onClick={() => ws.current?.send(JSON.stringify({ type: 'stop' }))}>
            Stopp
          </button>
        )}
        <button className="ghost" onClick={() => setShowEye((v) => !v)}>
          Auge
        </button>
        <button className="ghost" onClick={() => setShowSettings(true)}>
          Einstellungen
        </button>
      </header>

      <div className={`split ${showEye ? 'show-eye' : ''}`}>
        <section className="chat">
          <div className="messages" ref={scroller}>
            {items.length === 0 && (
              <div className="empty">
                Bildschirm lesen · Dateien und Code · Web · Agenten-Gruppen
                <br />
                Alles automatisch, alles nach Obsidian.
              </div>
            )}
            {items.map((it) => (
              <Item key={it.key} item={it} onApprove={answerApproval} />
            ))}
            {busy && (
              <div className="thinking">
                <span className="orb" />
                {live.map((a) => (
                  <span
                    key={a.name}
                    className="orb kid"
                    title={`${a.name} · ${a.role}`}
                    style={{ '--kid': Math.max(0.4, 1 - a.depth * 0.22) }}
                  />
                ))}
                <span>{phase}</span>
                {live.length > 0 && <span className="tail">{live.length} Agenten</span>}
              </div>
            )}
          </div>

          <div className="composer">
            <div className="chips" style={{ marginBottom: 8 }}>
              {[
                ['Bildschirm lesen', 'Lies meinen Bildschirm und sag mir kurz, was da steht und was ich gerade mache.'],
                ['Hilf mir hier', 'Schau auf meinen Bildschirm und sag mir, was ich als Nächstes tun sollte.'],
                ['Was ist offen?', 'Welche Apps laufen gerade und welche ist vorne?'],
              ].map(([label, prompt]) => (
                <button key={label} className="chip" disabled={busy || !connected} onClick={() => send(prompt)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="row">
              <textarea
                value={draft}
                placeholder="Was soll ich tun?"
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
              <button className="primary" onClick={() => send()} disabled={!connected || busy || !draft.trim()}>
                Los
              </button>
            </div>
            <div className="hint">
              <span>Enter = senden · Shift+Enter = neue Zeile</span>
              {!status?.config?.hasGemini && (
                <button className="ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setShowSettings(true)}>
                  Gemini-Schlüssel fehlt
                </button>
              )}
            </div>
          </div>
        </section>

        <Eye screen={screen} terminal={terminal} status={status} liveNotes={liveNotes} liveOn={liveOn} />
      </div>

      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onSaved={(cfg) => setStatus((s) => ({ ...s, config: cfg }))}
        />
      )}
    </div>
  )
}

function Item({ item, onApprove }) {
  if (item.kind === 'msg') return <div className={`msg ${item.role}`}>{item.text}</div>

  if (item.kind === 'note') return <span className="pill live">{item.text}</span>

  if (item.kind === 'summary') {
    return (
      <div className="summary">
        <div className="summary-head">Zusammenfassung</div>
        <div className="summary-body">{item.text}</div>
      </div>
    )
  }

  if (item.kind === 'group') {
    return (
      <div className={`group ${item.state}`}>
        <div className="group-head">
          <span className="dot" />
          <strong>Gruppe: {item.name}</strong>
        </div>
        <div className="group-goal">{item.goal}</div>
        <div className="chips">
          {(item.members || []).map((m) => (
            <span key={m} className="chip">{m}</span>
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
          <span className="tail">{item.role} · von {item.parent}</span>
        </summary>
        <pre>{`Auftrag:\n${item.task}\n\nErgebnis:\n${item.result || '…läuft'}`}</pre>
      </details>
    )
  }

  if (item.kind === 'step') {
    const cls = item.state === 'ok' ? 'ok' : item.state === 'fail' ? 'fail' : ''
    return (
      <details className={`step ${cls}`} style={item.depth ? { marginLeft: item.depth * 16 } : undefined}>
        <summary>
          <span className="dot" />
          <strong>{item.agent ? `${item.agent} · ` : ''}{item.name}</strong>
          <span className="tail">{summarize(item.args)}</span>
        </summary>
        <pre>{item.result || '…'}</pre>
      </details>
    )
  }

  if (item.kind === 'approval') {
    return (
      <div className="approval">
        <h4>Darf ich? · {item.tool}</h4>
        <pre>{JSON.stringify(item.args, null, 2)}</pre>
        {item.open ? (
          <div className="row">
            <button className="primary" onClick={() => onApprove(item.id, true)}>Ja</button>
            <button onClick={() => onApprove(item.id, true, true)}>Immer erlauben</button>
            <button className="danger" onClick={() => onApprove(item.id, false)}>Nein</button>
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
