import React, { useEffect, useState, useCallback } from 'react'

/**
 * Der Schieber fürs lokale Gehirn.
 *
 * Zwei Dinge müssen hier gleichzeitig sichtbar sein, sonst versteht niemand,
 * was der Regler tut: WAS bei dieser Stufe lokal läuft, und WIE VIEL davon
 * gleichzeitig. Dazu der echte Speicherstand — denn die Stufe ist nur das
 * Maximum. Ist der Rechner voll, drosselt URAI von selbst, und das soll man
 * sehen, statt sich zu wundern, warum es langsam ist.
 */
export default function LokalRegler({ budgetGb, modell, onBudget, onModell }) {
  const [stand, setStand] = useState(null)

  const holen = useCallback(() => {
    fetch('/api/lokal')
      .then((r) => r.json())
      .then(setStand)
      .catch(() => {})
  }, [])

  useEffect(() => {
    holen()
    // Der Speicherstand ändert sich ständig — alle vier Sekunden nachsehen
    // reicht, um Drosselung sichtbar zu machen, ohne selbst Last zu erzeugen.
    const takt = setInterval(holen, 4000)
    return () => clearInterval(takt)
  }, [holen])

  const gb = (bytes) => (bytes / 1073741824).toFixed(1)
  const gesamtGb = stand?.ramGesamt ? stand.ramGesamt / 1073741824 : 8
  // Faustregel: ein Modell belegt grob seine Dateigröße. Mehr als ein Drittel
  // des gesamten Speichers ist auf einem kleinen Rechner riskant.
  const zuGross = (bytes) => bytes / 1073741824 > gesamtGb * 0.33
  // Über den vorhandenen Speicher hinaus zu schieben ergibt keinen Sinn —
  // der Regler darf zwar bis 100, aber die Warnung kommt früher.
  const ueberRam = budgetGb > gesamtGb * 0.75

  return (
    <div className="lokal">
      <div className="lokal-kopf">
        <div>
          <div className="lokal-stufe-name">
            {budgetGb ? `${budgetGb} GB` : 'aus'}
            {stand?.gedrosselt && <span className="lokal-gedrosselt">gedrosselt</span>}
          </div>
          <div className="lokal-hinweis">
            {!budgetGb
              ? 'Alles geht an die großen Gehirne.'
              : `${stand?.artenText?.join(', ') || '…'} laufen auf diesem Rechner.`}
            {budgetGb > 0 && stand?.naechsteStufe && (
              <> Ab {stand.naechsteStufe.ab} GB auch {stand.naechsteStufe.was}.</>
            )}
          </div>
        </div>
        {stand && (
          <div className="lokal-ram" title="Freier Speicher">
            <div className="lokal-ram-ring" style={{ '--frei': (stand.ramFrei ?? 50) / 100 }}>
              <span>{stand.ramFrei ?? '?'}%</span>
            </div>
            <div className="lokal-ram-text">frei</div>
          </div>
        )}
      </div>

      <input
        type="range"
        className="lokal-schieber"
        min="0"
        max={stand?.max || 100}
        step="1"
        value={budgetGb}
        onChange={(e) => onBudget(Number(e.target.value))}
      />
      <div className="lokal-skala">
        <span>aus</span>
        <span>{Math.round(gesamtGb)} GB (dein RAM)</span>
        <span>{stand?.max || 100} GB</span>
      </div>
      {ueberRam && (
        <div className="lokal-warnung">
          Mehr als dieser Rechner hat. URAI nimmt sich trotzdem nur, was wirklich
          frei ist — der Regler wirkt dann nicht weiter.
        </div>
      )}

      {budgetGb > 0 && stand && (
        <>
          <div className="lokal-zahlen">
            <span>
              gleichzeitig: <b>{stand.gleichzeitigMoeglich}</b>
              {stand.gedrosselt && <em> statt {stand.gleichzeitigRechnerisch}</em>}
            </span>
            {stand.wartend > 0 && <span>in der Schlange: <b>{stand.wartend}</b></span>}
            {stand.gesamt > 0 && <span>lokal erledigt: <b>{stand.gesamt}</b></span>}
          </div>

          {!stand.ollama && (
            <div className="lokal-warnung">
              Kein lokales Modell erreichbar. Ollama installieren und starten, sonst geht
              trotz Regler alles an die großen Gehirne.
            </div>
          )}

          {stand.ollama && !!(stand.modelle || []).length && (
            <div className="lokal-modelle">
              <label>Modell — kleiner heißt schneller und sparsamer</label>
              {(stand.modelle || []).map((m) => (
                <button
                  key={m.name}
                  type="button"
                  className={`lokal-modell ${m.name === modell ? 'on' : ''}`}
                  onClick={() => onModell(m.name)}
                >
                  <span className="lokal-modell-name">{m.name}</span>
                  <span className={`lokal-modell-gb ${zuGross(m.groesse) ? 'gross' : ''}`}>
                    {gb(m.groesse)} GB
                  </span>
                  {zuGross(m.groesse) && <span className="lokal-modell-warn">knapp für diesen Rechner</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
