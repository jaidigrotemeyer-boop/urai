// Selbsttest: alles einmal wirklich laufen lassen.
//   node pruefe.mjs
import { messen } from './server/messen.js'
import { zeichenPlan, aufDauer, dauerLesen, abspielen, zeitText, MAX_DAUER_MS } from './server/tippen.js'
import { bereit } from './server/schreiben.js'

let gut = 0
let schlecht = 0

function pruefe(was, bedingung, info = '') {
  if (bedingung) {
    gut++
    console.log(`   ✓ ${was}${info ? '  ' + info : ''}`)
  } else {
    schlecht++
    console.log(`   ✗ ${was}${info ? '  ' + info : ''}`)
  }
}

// Absichtlich so lang, dass die Schwellen greifen: unter fünf Sätzen sagt die
// Messung bewusst nichts über Satzlängen, weil vier Zahlen keine Verteilung sind.
const FLACH =
  'In der heutigen Zeit spielt die Digitalisierung eine entscheidende Rolle für Unternehmen jeder Größe. ' +
  'Darüber hinaus ist es wichtig zu beachten, dass eine Vielzahl von Faktoren den Erfolg beeinflusst. ' +
  'Zudem bietet moderne Technologie eine breite Palette an neuen Möglichkeiten für Firmen.\n\n' +
  'Darüber hinaus ermöglicht die Automatisierung eine nahtlose Verzahnung von Prozessen und Systemen. ' +
  'Zudem lassen sich dadurch Kosten, Zeit und Ressourcen deutlich effizienter einsetzen. ' +
  'Es ist wichtig zu betonen, dass die Mitarbeiter dabei eine zentrale Rolle spielen.\n\n' +
  'Zusammenfassend lässt sich sagen, dass die Digitalisierung von entscheidender Bedeutung ist. ' +
  'Unternehmen sollten daher nicht nur in Technologie, sondern auch in ihre Menschen investieren.'

const LEBENDIG =
  'Der Bäcker steht um vier auf. Nicht aus Idealismus — der Teig richtet sich nicht nach ihm, sondern er sich nach dem Teig.\n\n' +
  'Um halb sechs kommt die erste Fuhre raus. Brötchen. Dann Brot, dann, wenn Zeit bleibt, das Süße.\n\n' +
  'Er hat mal gerechnet, was die Stunde bringt. Danach hat er nicht mehr gerechnet.'

console.log('\n  Handschrift Selbsttest\n')

console.log('  MESSEN')
const flach = messen(FLACH)
const lebendig = messen(LEBENDIG)
pruefe('flacher Text fällt auf', flach.auffaellig.length >= 3, `${flach.auffaellig.length} Auffälligkeiten`)
pruefe('flacher Text: Urteil maschinell', /maschinell/i.test(flach.urteil), flach.urteil)
pruefe('Floskeln gefunden', flach.floskeln.anzahl >= 5, `${flach.floskeln.anzahl} Stück`)
pruefe('lebendiger Text fällt nicht auf', lebendig.auffaellig.length === 0, lebendig.urteil)
pruefe(
  'Gleichmaß trennt beide',
  flach.satz.gleichmass < 0.3 && lebendig.satz.gleichmass > 0.5,
  `flach ${flach.satz.gleichmass} · lebendig ${lebendig.satz.gleichmass}`,
)
pruefe('Abkürzung zerteilt keinen Satz', messen('Wir nehmen z. B. Butter und Mehl.').satz.anzahl === 1)
pruefe('leerer Text stürzt nicht ab', messen('').satz.anzahl === 0)

console.log('\n  RHYTHMUS')
for (const [wert, ms] of [['45s', 45000], ['10m', 600000], ['1h30m', 5400000], [5, 300000], ['10 min', 600000], ['2std', 7200000], ['1,5h', 5400000]])
  pruefe(`Dauer "${wert}"`, dauerLesen(wert) === ms, zeitText(ms))
// "150ms" ist die gemeine Eingabe: früher las das Muster daraus 150 Minuten,
// weil "m" vor "min" stand und das übrige "s" niemandem auffiel.
for (const wert of ['drei Wochen', '150ms', '10x', '10m5', 'h'])
  pruefe(`Dauer "${wert}" abgelehnt`, (() => { try { dauerLesen(wert); return false } catch { return true } })())

const plan = zeichenPlan(LEBENDIG, { saat: 7 })
const gestreckt = aufDauer(plan, dauerLesen('10m'))
pruefe('Plan hat ein Zeichen je Schritt', plan.schritte.length === LEBENDIG.length)
pruefe('Streckung trifft die Dauer', Math.abs(gestreckt.gesamtMs - 600000) < 600000 * 0.02, zeitText(gestreckt.gesamtMs))

const s = plan.schritte
const imWort = s.filter((x, i) => /\p{L}/u.test(x.zeichen) && /\p{L}/u.test(s[i - 1]?.zeichen || '')).map((x) => x.pause)
const nachPunkt = s.filter((x, i) => /[.!?]/.test(s[i - 1]?.zeichen || '')).map((x) => x.pause)
const mittel = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
pruefe('Pause nach dem Punkt ist länger', mittel(nachPunkt) > mittel(imWort) * 2, `${mittel(imWort)} ms → ${mittel(nachPunkt)} ms`)
pruefe('kein Anschlag ohne Abstand', s.every((x) => x.pause >= 8))
pruefe(
  'Obergrenze greift',
  (() => { try { aufDauer(plan, MAX_DAUER_MS + 1); return false } catch { return true } })(),
  `${MAX_DAUER_MS / 3600000} Stunden`,
)
pruefe(
  'gleiche Saat, gleicher Rhythmus',
  zeichenPlan(LEBENDIG, { saat: 3 }).schritte.map((x) => x.pause).join() ===
    zeichenPlan(LEBENDIG, { saat: 3 }).schritte.map((x) => x.pause).join(),
)

console.log('\n  ABSPIELEN')
const ac = new AbortController()
let getippt = ''
const lauf = await abspielen(gestreckt, {
  tippe: async (z) => { getippt += z; if (getippt.length === 25) ac.abort() },
  warte: async () => {},
  signal: ac.signal,
})
pruefe('Stopp greift mitten im Text', lauf.getippt === 25, JSON.stringify(getippt))

const kurz = aufDauer(zeichenPlan('Ein kurzer Testsatz.', { saat: 1 }), 2000)
const t0 = Date.now()
await abspielen(kurz, { tippe: async () => {}, warte: (ms) => new Promise((f) => setTimeout(f, ms)) })
const gebraucht = Date.now() - t0
pruefe('echte Wartezeit stimmt', Math.abs(gebraucht - 2000) < 250, `${gebraucht} ms statt 2000`)

const lang = 'Ein Satz mit ein paar Wörtern drin. '.repeat(1500)
const t1 = Date.now()
const grosserPlan = zeichenPlan(lang, { saat: 1 })
const t2 = Date.now()
await abspielen(grosserPlan, { tippe: async () => {}, warte: async () => {} })
pruefe('langer Text bleibt schnell', Date.now() - t1 < 2000, `${grosserPlan.schritte.length} Zeichen, ${t2 - t1} ms geplant`)

console.log('\n  SYSTEM')
const b = await bereit()
pruefe('Tipp-Weg geprüft', typeof b.ok === 'boolean', b.hinweis)

console.log(`\n  ${gut} von ${gut + schlecht} in Ordnung${schlecht ? ` · ${schlecht} kaputt` : ''}\n`)
process.exit(schlecht ? 1 : 0)
