// Selbsttest: alles einmal wirklich laufen lassen.
//   node pruefe.mjs
import { messen } from './server/messen.js'
import { zeichenPlan, aufDauer, dauerLesen, abspielen, zeitText, MAX_DAUER_MS } from './server/tippen.js'
import { bereit } from './server/schreiben.js'
import { umschreiben, bewertung, saeubern, putzen, strukturPruefen, istDeutsch, listenAufraeumen, textArt } from './server/gehirn.js'

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

console.log('\n  UMSCHREIBEN')
// Das Modell wird hier eingesetzt statt angerufen: so lässt sich prüfen, was
// die Schleife mit guten, faulen und schlechten Antworten macht.
const GUT =
  'Künstliche Intelligenz verändert Unternehmen. Große wie kleine. Was den Erfolg ausmacht, hängt an mehr Stellen als den offensichtlichen, und die wenigsten davon stehen in der Broschüre des Anbieters.\n\n' +
  'Automatisierung verzahnt Prozesse. Sie spart Kosten, Zeit und Nerven — vor allem Nerven, wenn man die Leute fragt, die vorher jede Zahl von Hand übertragen haben. Das ist der Teil, den Präsentationen gern auslassen.\n\n' +
  'Die Mitarbeiter entscheiden, ob es klappt. Nicht die Technik. Wer nur in Software investiert und nicht in die Menschen, die damit arbeiten sollen, kauft eine teure Enttäuschung.'

pruefe('Bewertung trennt flach von lebendig', bewertung(messen(FLACH)) > bewertung(messen(LEBENDIG)) * 3,
  `flach ${bewertung(messen(FLACH))} · lebendig ${bewertung(messen(LEBENDIG))}`)

pruefe('Vorrede wird abgeschnitten', saeubern('Hier ist der überarbeitete Text:\n\nDer Bäcker steht auf.') === 'Der Bäcker steht auf.')
pruefe('Code-Block wird ausgepackt', saeubern('```markdown\nDer Bäcker steht auf.\n```') === 'Der Bäcker steht auf.')

const einmal = await umschreiben(FLACH, { fragen: async () => GUT })
pruefe('gute Antwort wird genommen', einmal.text === GUT, `${einmal.punkte.vorher} → ${einmal.punkte.nachher} Punkte`)
pruefe('nur eine Runde nötig', einmal.versuche.length === 1)

// Faules Modell: gibt den Text unverändert zurück. Muss auffallen.
let faulRunden = 0
let faul = null
try {
  await umschreiben(FLACH, { fragen: async () => { faulRunden++; return FLACH } })
} catch (err) {
  faul = err.message
}
pruefe('unveränderte Antwort wird abgelehnt', /nicht besser/.test(faul || ''), faul?.slice(0, 60))
pruefe('dabei wurde nachgehakt', faulRunden === 3, `${faulRunden} Runden`)

// Erst faul, dann gut: die bessere Fassung muss gewinnen.
let n = 0
const spaet = await umschreiben(FLACH, { fragen: async () => (++n < 2 ? FLACH : GUT) })
pruefe('späte gute Runde gewinnt', spaet.text === GUT, `${spaet.versuche.length} Runden`)

// Zusammenfasser: liefert einen Bruchteil des Textes zurück.
let zuKurz = null
try {
  await umschreiben(FLACH, { fragen: async () => 'KI ist wichtig für Firmen.' })
} catch (err) {
  zuKurz = err.message
}
pruefe('Zusammenfassung wird verworfen', /Länge|brauchbare/.test(zuKurz || ''), zuKurz?.slice(0, 70))

let ohne = null
try {
  await umschreiben(FLACH, { fragen: async () => { throw new Error('kein Netz') } })
} catch (err) {
  ohne = err.message
}
pruefe('Ausfall wird durchgereicht', /kein Netz/.test(ohne || ''))

console.log('\n  FORM — damit es nicht komisch aussieht')
pruefe('Zeilen-Leerzeichen weg', putzen('Hallo   \nWelt  ', 'x') === 'Hallo\nWelt')
pruefe('drei Leerzeilen werden zwei', putzen('A\n\n\n\nB', 'x') === 'A\n\nB')
pruefe('krumme Zitate zurück auf gerade', putzen('Er sagte „hallo".', 'Er sagte "moin".') === 'Er sagte "hallo".')
pruefe('als Zitat verpackter Text wird ausgepackt', saeubern('„Der Bäcker steht auf."') === 'Der Bäcker steht auf.')
pruefe('Sprache erkannt', istDeutsch('Der Hund ist auf der Wiese und schläft') && !istDeutsch('The dog is on the lawn and sleeps'))

const MIT_FORM = '# Titel\n\nEin Absatz mit Inhalt.\n\n- Punkt eins\n- Punkt zwei\n\nEin Schlusswort dazu.'
pruefe('gleiche Form ist in Ordnung', strukturPruefen(MIT_FORM, '# Titel\n\nAnderer Absatz.\n\n- Eins\n- Zwei\n\nAnderes Schlusswort.').length === 0)
pruefe('verlorene Überschrift fällt auf', /Überschriften/.test(strukturPruefen(MIT_FORM, 'Titel\n\nAbsatz.\n\n- Eins\n- Zwei\n\nSchluss.').join()))
pruefe('verlorene Listenpunkte fallen auf', /Listenpunkte/.test(strukturPruefen(MIT_FORM, '# Titel\n\nAbsatz.\n\n- Eins\n\nSchluss.').join()))
pruefe('zur Wand zusammengelaufen fällt auf', /Absätze verloren/.test(strukturPruefen('A.\n\nB.\n\nC.', 'A. B. C.').join()))
pruefe('Sprachwechsel fällt auf', /Sprache/.test(strukturPruefen('Der Hund liegt auf der Wiese und schläft tief.', 'The dog is on the lawn and sleeps deeply.').join()))
pruefe('Abbruch mitten im Satz fällt auf', /mitten im Satz/.test(strukturPruefen('Ein ganzer Satz.', 'Ein abgeschnittener Satz der').join()))

// Modell liefert inhaltlich besser, aber formal kaputt: darf nicht durchgehen.
const KAPUTT = GUT.replace(/\n\n/g, ' ')
let formRunden = 0
let formFehler = null
try {
  await umschreiben(FLACH, { fragen: async () => { formRunden++; return KAPUTT } })
} catch (err) {
  formFehler = err.message
}
pruefe('formal kaputte Fassung wird verworfen', /brauchbare|Form/.test(formFehler || ''), formFehler?.slice(0, 70))
pruefe('dabei wurde nachgehakt', formRunden === 3, `${formRunden} Runden`)

console.log('\n  STICHPUNKTE UND GRÖSSEN')
pruefe(
  'nebeneinander geklebte Punkte kommen untereinander',
  listenAufraeumen('- Punkt eins - Punkt zwei - Punkt drei') === '- Punkt eins\n- Punkt zwei\n- Punkt drei',
)
pruefe(
  'nummerierte Punkte ebenso',
  listenAufraeumen('1. eins 2. zwei 3. drei') === '1. eins\n2. zwei\n3. drei',
)
pruefe(
  'Gedankenstrich im Fließtext bleibt in Ruhe',
  listenAufraeumen('Er kam - und ging wieder - ohne Gruß.') === 'Er kam - und ging wieder - ohne Gruß.',
)
pruefe('Liste bekommt Luft davor', putzen('Text davor\n- eins\n- zwei', 'x') === 'Text davor\n\n- eins\n- zwei')
pruefe('Raute ohne Leerzeichen wird Überschrift', putzen('#Titel\n\nText.', 'x').startsWith('# Titel'))
pruefe('Überschrift bekommt Luft danach', putzen('# Titel\nText.', 'x') === '# Titel\n\nText.')

for (const [t, soll] of [
  ['Ein Absatz ohne alles. Noch ein Satz.', 'fliesstext'],
  ['- eins\n- zwei\n- drei', 'liste'],
  ['# Titel\n\nText dazu.', 'gegliedert'],
  ['# Titel\n\nText.\n\n- eins\n- zwei', 'dokument'],
  ['Text\n\n```js\ncode()\n```', 'code'],
])
  pruefe(`Textart "${soll}" erkannt`, textArt(t) === soll, textArt(t))

pruefe(
  'aus großer Überschrift darf keine kleine werden',
  /Ebenen/.test(strukturPruefen('# Groß\n\nEin Satz hier.', '### Groß\n\nEin Satz hier.').join()),
)

// Erst formal kaputt, dann sauber — die saubere muss gewinnen.
let f = 0
const gerettet = await umschreiben(FLACH, { fragen: async () => (++f < 2 ? KAPUTT : GUT) })
pruefe('saubere Fassung gewinnt danach', gerettet.text === GUT, `${gerettet.versuche.length} Runden`)

console.log('\n  SYSTEM')
const b = await bereit()
pruefe('Tipp-Weg geprüft', typeof b.ok === 'boolean', b.hinweis)

console.log(`\n  ${gut} von ${gut + schlecht} in Ordnung${schlecht ? ` · ${schlecht} kaputt` : ''}\n`)
process.exit(schlecht ? 1 : 0)
