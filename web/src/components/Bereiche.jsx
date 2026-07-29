import React, { useState } from 'react'
import { t } from '../i18n.js'

/**
 * Drei Bereiche, jeder für etwas anderes gut.
 *
 * Allein arbeitet jeder mit seinen eigenen Werkzeugen — das hält ihn schnell
 * und lenkt ihn nicht ab. Schaltest du "zusammen" ein, stellt URAI aus allen
 * dreien eine Gruppe auf, die sich die Arbeit teilt.
 */
export const BEREICHE = [
  {
    id: 'mac',
    name: 'Mac',
    was: 'Bildschirm lesen, klicken, tippen, Apps bedienen',
    rolle: 'bildschirm',
    beispiele: [
      'Lies meinen Bildschirm und sag, was ich gerade mache.',
      'Öffne Safari und such nach dem Wetter für morgen.',
      'Räum meinen Schreibtisch auf: sortier die Dateien in Ordner.',
    ],
  },
  {
    id: 'code',
    name: 'Code',
    was: 'Dateien lesen und schreiben, Terminal, Projekte bauen',
    rolle: 'programmierer',
    beispiele: [
      'Zeig mir, was in meinem Projekt-Ordner liegt.',
      'Finde alle TODOs in meinem Code.',
      'Bau dir selbst ein neues Werkzeug ein.',
    ],
  },
  {
    id: 'wissen',
    name: 'Wissen',
    was: 'Im Netz suchen, lesen, in Obsidian festhalten',
    rolle: 'rechercheur',
    beispiele: [
      'Such drei Quellen zu meinem Thema und leg eine Notiz an.',
      'Was habe ich letzte Woche gemacht?',
      'Fass meine Notizen zu einem Thema zusammen.',
    ],
  },
]

export default function Bereiche({ onSenden, busy }) {
  const [aktiv, setAktiv] = useState('mac')
  const [zusammen, setZusammen] = useState(false)
  const [text, setText] = useState('')

  const b = BEREICHE.find((x) => x.id === aktiv)

  function los(vorlage) {
    const auftrag = (vorlage || text).trim()
    if (!auftrag) return

    // Zusammen: URAI stellt selbst eine Gruppe aus allen drei Bereichen auf
    const nachricht = zusammen
      ? `Stelle mit agent_team eine Gruppe aus drei Mitgliedern auf, die sich das hier teilen:\n\n` +
        `${auftrag}\n\n` +
        BEREICHE.map((x) => `- ${x.name} (Rolle ${x.rolle}): ${x.was}`).join('\n') +
        `\n\nJeder macht seinen Teil, danach fasst du zusammen.`
      : `[Bereich ${b.name}] ${auftrag}`

    onSenden(nachricht)
    setText('')
  }

  return (
    <div className="bereiche">
      <div className="bereich-kopf">
        {BEREICHE.map((x) => (
          <button
            key={x.id}
            className={`bereich-tab ${aktiv === x.id && !zusammen ? 'on' : ''}`}
            onClick={() => {
              setAktiv(x.id)
              setZusammen(false)
            }}
          >
            <span className="bereich-punkt" data-b={x.id} />
            {x.name}
          </button>
        ))}
        <button className={`bereich-tab zusammen ${zusammen ? 'on' : ''}`} onClick={() => setZusammen((v) => !v)}>
          <span className="bereich-punkt" data-b="mac" />
          <span className="bereich-punkt" data-b="code" />
          <span className="bereich-punkt" data-b="wissen" />
          zusammen
        </button>
      </div>

      <div className={`bereich-buehne ${zusammen ? 'alle' : ''}`}>
        {zusammen ? (
          <>
            <div className="bereich-was">
              Alle drei arbeiten gleichzeitig an einer Sache. URAI teilt den Auftrag auf und führt die
              Ergebnisse am Ende zusammen.
            </div>
            <div className="bereich-drei">
              {BEREICHE.map((x) => (
                <div key={x.id} className="bereich-karte">
                  <span className="bereich-punkt" data-b={x.id} />
                  <strong>{x.name}</strong>
                  <span>{x.was}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bereich-was">{b.was}</div>
            <div className="chips">
              {b.beispiele.map((v) => (
                <button key={v} className="chip" disabled={busy} onClick={() => los(v)}>
                  {v.length > 42 ? v.slice(0, 42) + '…' : v}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bereich-eingabe">
        <input
          value={text}
          placeholder={zusammen ? 'Was sollen alle drei zusammen tun?' : `Was soll ${b.name} tun?`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && los()}
        />
        <button className="primary" onClick={() => los()} disabled={!text.trim()}>
          {t('go')}
        </button>
      </div>
    </div>
  )
}
