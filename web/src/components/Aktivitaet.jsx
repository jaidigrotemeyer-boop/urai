import React, { useEffect, useState } from 'react'
import { t } from '../i18n.js'

/**
 * Der Arbeitsstreifen: zeigt in Klartext, was URAI in dieser Sekunde tut.
 * Verb links, Ziel hervorgehoben, rechts die laufende Zeit.
 * Ohne Auftrag ist er unsichtbar — er soll nicht dauernd im Weg sein.
 */
export default function Aktivitaet({ tun, warte, schritt, tempo, queue, agents = [] }) {
  const [sek, setSek] = useState(0)

  useEffect(() => {
    if (!tun?.seit) {
      setSek(0)
      return
    }
    const i = setInterval(() => setSek(Math.floor((Date.now() - tun.seit) / 100) / 10), 100)
    return () => clearInterval(i)
  }, [tun?.seit])

  if (!tun) return null

  return (
    <div className={`arbeit ${warte ? 'wartet' : ''}`}>
      <span className="arbeit-welle" />

      <span className="eye" style={{ '--k': 0.85 }} />
      {agents.map((a) => (
        <span key={a.name} className="eye kid" style={{ '--k': Math.max(0.4, 1 - a.depth * 0.2) }} />
      ))}

      <span className="arbeit-text">
        {tun.verb ? (
          <>
            {tun.verb}
            {tun.ziel && <b> {tun.ziel}</b>}
          </>
        ) : (
          tun.satz
        )}
        <span className="punkte"><i /><i /><i /></span>
      </span>

      <span className="arbeit-zahlen">
        {queue > 0 && <span className="zahl warteschlange">+{queue}</span>}
        {schritt && (
          <span className="zahl">
            {schritt.nr}/{schritt.von}
          </span>
        )}
        {tempo > 0 && !warte && <span className="zahl">{tempo} z/s</span>}
        {sek > 0 && <span className="zahl zeit">{sek.toFixed(1)}s</span>}
      </span>
    </div>
  )
}
