import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Hud from './Hud.jsx'
import './styles.css'
import './werkstatt.css'
import './onboarding.css'

// ?hud=1 zeigt nur die Notch — für ein kleines Fenster, das oben klebt
const nurNotch = new URLSearchParams(location.search).has('hud')
if (nurNotch) document.documentElement.classList.add('nur-hud')

createRoot(document.getElementById('root')).render(nurNotch ? <Hud /> : <App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
