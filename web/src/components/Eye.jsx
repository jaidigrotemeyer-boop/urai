import React, { useEffect, useRef, useState } from 'react'

export default function Eye({ screen, terminal, status, liveNotes = [], liveOn }) {
  const [tab, setTab] = useState('screen')
  const feed = useRef(null)

  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight
  }, [liveNotes])

  const uhr = (t) => {
    const d = new Date(t)
    const p = (v) => String(v).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}`
  }

  return (
    <section className="eye">
      <div className="tabs">
        {[
          ['screen', liveOn ? 'Live' : 'Bildschirm'],
          ['feed', `Mitschrift${liveNotes.length ? ` · ${liveNotes.length}` : ''}`],
          ['terminal', 'Terminal'],
          ['brain', 'Gehirn'],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="eye-body">
        {tab === 'screen' &&
          (screen ? (
            <div className="livewrap">
              <img src={`data:image/png;base64,${screen}`} alt="Bildschirm" />
              {liveOn && <span className="livebadge"><span className="rec" />live</span>}
              {liveNotes.length > 0 && <div className="lastnote">{liveNotes[liveNotes.length - 1].text}</div>}
            </div>
          ) : (
            <div className="empty">
              {liveOn ? 'Erster Blick kommt gleich…' : 'Live ist aus.'}
              <br />
              Oben auf LIVE tippen zum Umschalten.
            </div>
          ))}

        {tab === 'feed' && (
          <div className="feed" ref={feed}>
            {liveNotes.length === 0 && <div className="empty">Noch nichts gesehen.</div>}
            {liveNotes.map((n, i) => (
              <div key={i} className={`feedline ${n.err ? 'err' : ''}`}>
                <span className="feedtime">{uhr(n.t)}</span>
                {n.app && <span className="feedapp">{n.app}</span>}
                <span>{n.text}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'terminal' && (terminal ? <pre>{terminal}</pre> : <div className="empty">Noch nichts gelaufen.</div>)}

        {tab === 'brain' && (
          <pre>
            {status
              ? [
                  `Kette:    ${status.brain.chain.join(' → ')}`,
                  `Gemini:   ${status.brain.gemini ? status.brain.models.gemini : '—'}`,
                  `Cerebras: ${status.brain.cerebras ? status.brain.models.cerebras : '—'}`,
                  `Groq:     ${status.brain.groq ? status.brain.models.groq : '—'}`,
                  `Router:   ${status.brain.openrouter ? status.brain.models.openrouter : '—'}`,
                  `Vektoren: ${status.brain.models.embed}`,
                  ...(status.brain.kaputt?.length
                    ? ['', 'Gerade in Pause:', ...status.brain.kaputt.map((k) => `  ${k.provider}: ${k.grund.slice(0, 90)}`)]
                    : []),
                  '',
                  `Revier:   ${status.config.workspace}`,
                  `Obsidian: ${status.obsidian?.vault || '—'}`,
                  `Live:     alle ${(status.config.liveIntervalMs || 3000) / 1000}s hinschauen`,
                ].join('\n')
              : 'lade…'}
          </pre>
        )}
      </div>
    </section>
  )
}
