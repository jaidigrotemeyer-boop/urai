import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Hud from './Hud.jsx'
import Lernen from './waitboard/Lernen.jsx'
import './styles.css'
import './werkstatt.css'
import './onboarding.css'
import './briefing.css'
import './jarvis.css'
import './waitboard/waitboard.css'

const frage = new URLSearchParams(location.search)

// ?hud=1 zeigt nur die Notch — für ein kleines Fenster, das oben klebt
const nurNotch = frage.has('hud')
if (nurNotch) document.documentElement.classList.add('nur-hud')

// ?waitboard=1 zeigt nur die Lernseite: Whiteboard und Orb, sonst nichts
const nurWaitboard = frage.has("waitboard")

createRoot(document.getElementById('root')).render(nurWaitboard ? <Lernen /> : nurNotch ? <Hud /> : <App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
