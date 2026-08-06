import React, { useState } from 'react'
import { t } from '../i18n.js'
import { farbeSetzen, useFarbe, farbeLesen, VORSCHLAEGE } from '../theme.js'

/**
 * Der Erststart: Willkommen, ein kurzes Profil (Name, Alter, Farbe, Zweck —
 * alles freiwillig), woher man URAI kennt, Nutzungsbedingungen, ein Danke —
 * und ganz am Ende die Einladung zu unterstützen. Nichts davon schränkt die
 * eigentliche Arbeit von URAI ein.
 *
 * Läuft genau einmal (der Server merkt sich das), lässt sich in den
 * Einstellungen jederzeit erneut abspielen.
 */
const HERKUNFT = ['reddit', 'x', 'youtube', 'google', 'freund', 'sonstiges']
const ZWECKE = ['code', 'recherche', 'dateien', 'automatisierung', 'alles']
const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Onboarding({ onFertig }) {
  useFarbe()
  const [schritt, setSchritt] = useState(0)
  const [email, setEmail] = useState('')
  const [profilName, setProfilName] = useState('')
  const [profilAlter, setProfilAlter] = useState('')
  const [profilZweck, setProfilZweck] = useState(null)
  const [geminiKey, setGeminiKey] = useState('')
  const [themen, setThemen] = useState([])
  const [neuesThema, setNeuesThema] = useState('')
  const [herkunft, setHerkunft] = useState(null)
  const [agb, setAgb] = useState(false)
  const [code, setCode] = useState('')
  const [gutschein, setGutschein] = useState(null)
  const [raus, setRaus] = useState(false)

  const SCHRITTE = ['willkommen', 'profil', 'gehirn', 'themen', 'herkunft', 'agb', 'unterstuetzen', 'danke']

  function weiter() {
    if (schritt < SCHRITTE.length - 1) setSchritt((s) => s + 1)
    else beenden()
  }

  async function beenden() {
    setRaus(true)
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          herkunft,
          agbAkzeptiert: agb,
          email,
          profilName,
          profilAlter: profilAlter ? Number(profilAlter) : null,
          profilZweck,
          briefingThemen: themen,
          geminiKey: geminiKey.trim(),
        }),
      })
    } catch {}
    setTimeout(onFertig, 500)
  }

  async function codeEinloesen() {
    try {
      const r = await fetch('/api/gutschein', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const j = await r.json()
      setGutschein(j.ok ? { ok: true, ...j } : { ok: false, fehler: j.fehler })
    } catch {
      setGutschein({ ok: false, fehler: 'Verbindung fehlgeschlagen.' })
    }
  }

  const name = SCHRITTE[schritt]

  return (
    <div className={`onb-buehne ${raus ? 'raus' : ''}`}>
      <div className="onb-punkte">
        {SCHRITTE.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <span className={`onb-punkt-linie ${i <= schritt ? 'fertig' : ''}`} />}
            <span className={`onb-punkt ${i === schritt ? 'on' : ''} ${i < schritt ? 'fertig' : ''}`} />
          </React.Fragment>
        ))}
      </div>

      <div className="onb-karte" key={name}>
        {name === 'willkommen' && (
          <>
            <div className="onb-auge">
              <span className="onb-ring" />
              <span className="orb" style={{ '--kid': 2.2 }} />
            </div>
            <h1>{t('onbWillkommenTitel')}</h1>
            <p>{t('onbWillkommenText')}</p>
            <div className="onb-emailzeile">
              <input
                type="email"
                className="onb-email"
                placeholder={t('onbEmailPlatzhalter')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && EMAIL_MUSTER.test(email.trim()) && weiter()}
              />
              <p className="onb-hinweis">{t('onbEmailHinweis')}</p>
            </div>
            <button className="primary onb-weiter" onClick={weiter} disabled={!EMAIL_MUSTER.test(email.trim())}>
              {t('onbLos')}
            </button>
          </>
        )}

        {name === 'profil' && (
          <>
            <h2>{t('onbProfilTitel')}</h2>
            <p className="onb-dim">{t('onbProfilText')}</p>

            <div className="onb-profil-felder">
              <input
                placeholder={t('onbNamePlatzhalter')}
                value={profilName}
                onChange={(e) => setProfilName(e.target.value)}
                maxLength={40}
              />
              <input
                type="number"
                min="1"
                max="120"
                placeholder={t('onbAlterPlatzhalter')}
                value={profilAlter}
                onChange={(e) => setProfilAlter(e.target.value)}
              />
            </div>

            <label className="onb-feld-label">{t('onbFarbeLabel')}</label>
            <div className="onb-farben">
              {VORSCHLAEGE.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  className={`onb-farbe ${farbeLesen().h === v.h ? 'on' : ''}`}
                  style={{ background: `hsl(${v.h} ${v.s}% ${v.l}%)` }}
                  onClick={() => farbeSetzen(v)}
                  aria-label={v.name}
                />
              ))}
            </div>

            <label className="onb-feld-label">{t('onbZweckLabel')}</label>
            <div className="onb-raster">
              {ZWECKE.map((z) => (
                <button
                  key={z}
                  className={`onb-wahl ${profilZweck === z ? 'on' : ''}`}
                  onClick={() => setProfilZweck(z)}
                >
                  {t(`onbZweck_${z}`)}
                </button>
              ))}
            </div>

            <button className="primary onb-weiter" onClick={weiter}>
              {t('onbWeiter')}
            </button>
          </>
        )}

        {name === 'gehirn' && (
          <>
            <h2>{t('onbGehirnTitel')}</h2>
            <p className="onb-dim">{t('onbGehirnText')}</p>

            <div className="onb-emailzeile">
              <input
                type="password"
                className="onb-email"
                placeholder="AIza…"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
              <p className="onb-hinweis">
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  aistudio.google.com/apikey
                </a>{' '}
                {t('onbGehirnGratis')}
              </p>
            </div>

            <button className="primary onb-weiter" onClick={weiter}>
              {geminiKey.trim() ? t('onbWeiter') : t('onbGehirnSpaeter')}
            </button>
          </>
        )}

        {name === 'themen' && (
          <>
            <h2>{t('onbThemenTitel')}</h2>
            <p className="onb-dim">{t('onbThemenText')}</p>

            <div className="onb-themen-chips">
              {themen.map((th) => (
                <span className="brf-chip" key={th}>
                  {th}
                  <button onClick={() => setThemen(themen.filter((x) => x !== th))} aria-label="×">
                    ×
                  </button>
                </span>
              ))}
            </div>

            {themen.length < 6 && (
              <div className="onb-gutschein">
                <input
                  placeholder={t('onbThemaPlatzhalter')}
                  value={neuesThema}
                  onChange={(e) => setNeuesThema(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    const w = neuesThema.trim()
                    if (!w || themen.some((x) => x.toLowerCase() === w.toLowerCase())) return
                    setThemen([...themen, w])
                    setNeuesThema('')
                  }}
                  maxLength={40}
                />
                <button
                  onClick={() => {
                    const w = neuesThema.trim()
                    if (!w || themen.some((x) => x.toLowerCase() === w.toLowerCase())) return
                    setThemen([...themen, w])
                    setNeuesThema('')
                  }}
                  disabled={!neuesThema.trim()}
                >
                  {t('briefThemaDazu')}
                </button>
              </div>
            )}

            <p className="onb-hinweis">{t('onbThemenSpaeter')}</p>
            <button className="primary onb-weiter" onClick={weiter}>
              {t('onbWeiter')}
            </button>
          </>
        )}

        {name === 'herkunft' && (
          <>
            <h2>{t('onbHerkunftTitel')}</h2>
            <p className="onb-dim">{t('onbHerkunftText')}</p>
            <div className="onb-raster">
              {HERKUNFT.map((h) => (
                <button
                  key={h}
                  className={`onb-wahl ${herkunft === h ? 'on' : ''}`}
                  onClick={() => setHerkunft(h)}
                >
                  {t(`onbHerkunft_${h}`)}
                </button>
              ))}
            </div>
            <button className="primary onb-weiter" onClick={weiter} disabled={!herkunft}>
              {t('onbWeiter')}
            </button>
          </>
        )}

        {name === 'agb' && (
          <>
            <h2>{t('onbAgbTitel')}</h2>
            <div className="onb-agb-text">
              <p>{t('onbAgbP1')}</p>
              <p>{t('onbAgbP2')}</p>
              <p>{t('onbAgbP3')}</p>
            </div>
            <label className="onb-check">
              <input type="checkbox" checked={agb} onChange={(e) => setAgb(e.target.checked)} />
              <span>{t('onbAgbAkzeptieren')}</span>
            </label>
            <button className="primary onb-weiter" onClick={weiter} disabled={!agb}>
              {t('onbWeiter')}
            </button>
          </>
        )}

        {name === 'unterstuetzen' && (
          <>
            <h2>{t('onbUnterstTitel')}</h2>
            <p className="onb-dim">{t('onbUnterstText')}</p>

            <div className="onb-gutschein">
              <input
                placeholder={t('onbCodePlatzhalter')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && codeEinloesen()}
              />
              <button onClick={codeEinloesen} disabled={!code.trim()}>
                {t('onbEinloesen')}
              </button>
            </div>
            {gutschein && (
              <div className={`onb-gutschein-antwort ${gutschein.ok ? 'ok' : 'fehler'}`}>
                {gutschein.ok
                  ? `${t('onbCodeOk')} ${gutschein.hinweis || ''}`
                  : gutschein.fehler}
              </div>
            )}

            <p className="onb-hinweis">{t('onbKeinZwang')}</p>
            <button className="primary onb-weiter" onClick={weiter}>
              {t('onbWeiter')}
            </button>
          </>
        )}

        {name === 'danke' && (
          <>
            <div className="onb-konfetti">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="onb-konfetti-teil" style={{ '--i': i }} />
              ))}
            </div>
            <h1>{t('onbDankeTitel')}</h1>
            <p>{t('onbDankeText')}</p>
            <button className="primary onb-weiter" onClick={weiter}>
              {t('onbLosGehts')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
