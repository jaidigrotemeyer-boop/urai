import React from 'react'
import '../auftraege.css'

/**
 * Was gerade im Hintergrund läuft.
 *
 * Steht unten rechts und nur dann da, wenn wirklich etwas läuft oder gerade
 * fertig wurde. Eine dauerhaft sichtbare, meist leere Liste wäre eine
 * Erinnerung an eine Funktion, die man selten braucht — und würde die Fläche
 * kosten, die sie in den seltenen Fällen verdient.
 */
export default function Auftraege({ auftraege, onAbbrechen, onOeffnen }) {
  if (!auftraege.length) return null

  return (
    <div className="auf">
      <div className="auf-kopf">Im Hintergrund</div>
      {auftraege.map((a) => (
        <div key={a.id} className={`auf-zeile auf-${a.zustand}`}>
          <span className="auf-punkt" aria-hidden="true" />
          <div className="auf-mitte">
            <div className="auf-text" title={a.text}>
              {a.text}
            </div>
            <div className="auf-stand">
              {a.zustand === 'laeuft' && (a.schritt ? `läuft · ${a.schritt}` : 'läuft …')}
              {a.zustand === 'fertig' && 'fertig'}
              {a.zustand === 'fehler' && (a.fehler || 'gescheitert')}
              {a.zustand === 'abgebrochen' && 'abgebrochen'}
            </div>
          </div>
          {a.zustand === 'fertig' && (
            <button className="auf-knopf" onClick={() => onOeffnen(a)}>
              Ansehen
            </button>
          )}
          <button
            className="auf-knopf auf-weg"
            onClick={() => onAbbrechen(a.id)}
            aria-label={a.zustand === 'laeuft' ? 'Abbrechen' : 'Wegräumen'}
          >
            {a.zustand === 'laeuft' ? 'Stopp' : '×'}
          </button>
        </div>
      ))}
    </div>
  )
}
