import React from 'react'
import '../jarvis-kern.css'

/**
 * Der Reaktor-Kern aus der Vorlage — aber nicht als Zierde.
 * Er zeigt nicht, DASS etwas läuft, sondern WAS läuft: jeder Zustand hat
 * seine eigene Bewegung, damit man aus drei Metern Abstand erkennt, ob URAI
 * wartet, zuhört, denkt oder redet. Ohne hinzusehen, ohne Text zu lesen.
 *
 * Bewusst reines SVG mit CSS-Animationen statt Canvas: das Ding steht
 * dauerhaft im Bild. Ein requestAnimationFrame hielte die Grafikkarte rund
 * um die Uhr wach; Drehung, Skalierung und Deckkraft erledigt dagegen der
 * Compositor — der Lüfter merkt davon nichts.
 */

const ZUSTAENDE = ['ruht', 'hoert', 'denkt', 'spricht']

// Sieben Tonbalken, Muster wie in der Vorlage: außen flach, Mitte hoch.
// Die Zahl ist die volle Rechteckhöhe — animiert wird nur die Skalierung,
// damit der Browser nichts neu berechnen muss.
const BALKEN = [10, 18, 13, 24, 14, 20, 11]
const BREITE = 2
const LUECKE = 1.4
const LINKS = 50 - (BALKEN.length * BREITE + (BALKEN.length - 1) * LUECKE) / 2

export default function JarvisKern({ zustand = 'ruht', groesse = 120, className = '' }) {
  // Unbekannte Zustände fallen auf Ruhe zurück, statt animationslos zu erstarren
  const zust = ZUSTAENDE.includes(zustand) ? zustand : 'ruht'

  return (
    <svg
      className={`jk jk-ist-${zust} ${className}`.trim()}
      viewBox="0 0 100 100"
      width={groesse}
      height={groesse}
      aria-hidden="true"
      focusable="false"
    >
      {/* Der Schein: drei blasse Scheiben übereinander. Ein echter Weichzeichner
          wäre schöner, würde aber bei jedem Atemzug neu gerastert. */}
      <g className="jk-schein">
        <circle className="jk-schein-1" cx="50" cy="50" r="36" />
        <circle className="jk-schein-2" cx="50" cy="50" r="27" />
        <circle className="jk-schein-3" cx="50" cy="50" r="20" />
      </g>

      {/* Breiter, blasser Ring — das Leuchten beim Sprechen, ohne Filter */}
      <circle className="jk-halo" cx="50" cy="50" r="45" />

      <g className="jk-dreh jk-dreh-aussen">
        <circle className="jk-ring" cx="50" cy="50" r="45" />
        <circle className="jk-bogen jk-bogen-aussen" cx="50" cy="50" r="45" pathLength="100" />
      </g>

      <g className="jk-dreh jk-dreh-mitte">
        <circle className="jk-ring jk-ring-strich" cx="50" cy="50" r="35" />
      </g>

      <g className="jk-dreh jk-dreh-innen">
        <circle className="jk-ring" cx="50" cy="50" r="27" />
        <circle className="jk-bogen jk-bogen-innen" cx="50" cy="50" r="27" pathLength="100" />
      </g>

      <circle className="jk-kern" cx="50" cy="50" r="18" />

      <g className="jk-balken">
        {BALKEN.map((hoehe, i) => (
          <rect
            key={i}
            x={LINKS + i * (BREITE + LUECKE)}
            y={50 - hoehe / 2}
            width={BREITE}
            height={hoehe}
            rx="1"
            // Negativer Verzug: die Balken starten mitten im Takt und stehen
            // beim Aufbau nicht erst alle gleich flach nebeneinander.
            style={{ '--jk-verzug': `${(i * -0.11).toFixed(2)}s` }}
          />
        ))}
      </g>
    </svg>
  )
}
