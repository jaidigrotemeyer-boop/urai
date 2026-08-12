// Messen: was lässt einen Text nach Fließband klingen?
//
// KI-Prosa ist auffällig gleichmäßig — alle Sätze etwa gleich lang, immer
// dieselben Übergänge, immer dieselben Floskeln. Dieses Modul zeigt diese
// Stellen mit Zahl und Beispiel. Reine Rechnung: kein Netz, kein Schlüssel,
// nichts verlässt den Rechner.
//
// Das ist ein Lektorat-Werkzeug. Es macht Text besser lesbar; es macht keine
// Aussage darüber, was irgendein Erkennungsdienst hinterher meldet, und
// verspricht das auch nicht.

// Abkürzungen, hinter denen kein Satz endet. Ohne diese Liste zerfällt jedes
// "z. B." in zwei Sätze und die Satzlängen-Messung wird wertlos.
const ABKUERZUNG =
  // Der Einzelbuchstabe am Ende ist wichtig: deutsche Abkürzungen bestehen oft
  // aus zwei Teilen ("z. B.", "u. a.", "d. h."), und ohne ihn zerfällt schon
  // der erste Teil in einen eigenen Satz.
  //
  // Davor steht bewusst ein Lookbehind und kein \b: JavaScripts Wortgrenze
  // kennt nur ASCII. Nach "ß", "ö" oder "é" sieht sie eine Grenze — "jeder
  // Größe." galt damit als Abkürzung und verschluckte den nächsten Satz.
  /(?:\b(?:bzw|ca|Dr|Prof|Nr|Abb|Bd|Std|usw|etc|vgl|ggf|inkl|max|min|Mrd|Mio|Jh|Hrsg|Mr|Mrs|Ms|St|Fig|No|vs)\.|(?<![\p{L}\p{N}])\p{L}\.|\d\.)\s*$/u

/** Text in Sätze zerlegen. */
export function saetze(text) {
  const roh = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!roh) return []
  const teile = roh.split(/(?<=[.!?…])(?:["»«')\]]*)\s+/)
  const fertig = []
  for (const teil of teile) {
    if (fertig.length && ABKUERZUNG.test(fertig[fertig.length - 1])) fertig[fertig.length - 1] += ' ' + teil
    else fertig.push(teil)
  }
  return fertig.filter((s) => woerter(s).length > 0)
}

export const woerter = (text) => String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []

const absaetze = (text) =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean)

// ────────────────────────────────────────────────────────────────────────────
// Die Verdachtsmomente
// ────────────────────────────────────────────────────────────────────────────

// Wendungen, die Sprachmodelle auffällig gern nehmen. Keine verbotenen Wörter —
// einzeln ist jede davon in Ordnung. Auffällig wird erst die Häufung.
const FLOSKELN = [
  ['Überleitung', /\b(darüber hinaus|des weiteren|ferner|zudem|nicht zuletzt|letztendlich|schließlich lässt sich)\b/giu],
  ['Überleitung', /\b(moreover|furthermore|additionally|in addition to that|that being said)\b/gi],
  ['Hinweis-Floskel', /\b(es ist wichtig zu (beachten|erwähnen|betonen|verstehen)|es sei (darauf hingewiesen|angemerkt)|es gilt zu bedenken)\b/giu],
  ['Hinweis-Floskel', /\b(it('s| is) (important|worth) (to note|noting|mentioning)|keep in mind that)\b/gi],
  ['Fazit-Floskel', /\b(zusammenfassend lässt sich (sagen|festhalten)|abschließend lässt sich|alles in allem|insgesamt lässt sich)\b/giu],
  ['Fazit-Floskel', /\b(in conclusion|to sum up|all in all|in summary)\b/gi],
  ['Bedeutungs-Floskel', /\b(spielt eine (entscheidende|wichtige|zentrale|wesentliche) rolle|von (entscheidender|großer) bedeutung|ein (wesentlicher|zentraler) aspekt)\b/giu],
  ['Bedeutungs-Floskel', /\b(plays a (crucial|vital|key|pivotal) role|a testament to|underscores the|cannot be overstated)\b/gi],
  ['Zeitgeist-Einstieg', /\b(in der heutigen (zeit|welt|gesellschaft)|in unserer (schnelllebigen|heutigen)|seit jeher|schon immer war)\b/giu],
  ['Zeitgeist-Einstieg', /\b(in today('s)? (world|society|fast-paced)|in an era where|since the dawn of)\b/gi],
  ['Werbe-Wort', /\b(nahtlos|ganzheitlich|revolutionär|bahnbrechend|vielfältig|facettenreich|maßgeschneidert)\b/giu],
  ['Werbe-Wort', /\b(seamless(ly)?|robust|leverage|holistic|cutting-edge|game-changer|tapestry|realm of|delve into|navigate the)\b/gi],
  ['Mengen-Floskel', /\b(eine vielzahl von|eine breite palette|zahlreiche möglichkeiten|eine fülle von)\b/giu],
  ['Mengen-Floskel', /\b(a wide (range|variety) of|a myriad of|a plethora of)\b/gi],
  ['Doppel-Konstruktion', /\bnicht nur\b[^.!?]{3,80}?\bsondern auch\b/giu],
  ['Doppel-Konstruktion', /\bnot (only|just)\b[^.!?]{3,80}?\bbut also\b/gi],
  ['Doppel-Konstruktion', /\bsowohl\b[^.!?]{3,80}?\bals auch\b/giu],
]

function floskelnFinden(text) {
  const treffer = []
  for (const [art, muster] of FLOSKELN) {
    for (const m of String(text).matchAll(muster)) treffer.push({ art, stelle: m[0].trim(), index: m.index })
  }
  return treffer.sort((a, b) => a.index - b.index)
}

const STOPP = new Set(
  ('der die das den dem des ein eine einer eines einem einen und oder aber auch noch nur schon sich ist sind war waren' +
    ' sein seine seiner ihr ihre ihres nicht mit von zu im in am an auf für als bei aus nach über unter durch um wie' +
    ' dass wenn weil man es sie er wir ich du ihr diese dieser dieses dann so mehr sehr kann können wird werden wurde' +
    ' haben hat hatte the a an and or but of to in on for with as at by from is are was were be been this that these' +
    ' those it its they we you he she not can will would could their his her our your there here more very').split(' '),
)

/** Häufigste inhaltstragende Wörter — Wiederholung ist ein Ermüdungszeichen. */
function wortWiederholung(alle) {
  const zaehler = new Map()
  for (const w of alle) {
    const k = w.toLowerCase()
    if (STOPP.has(k) || k.length < 4) continue
    zaehler.set(k, (zaehler.get(k) || 0) + 1)
  }
  return [...zaehler.entries()]
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([wort, anzahl]) => ({ wort, anzahl, promille: +((anzahl / Math.max(1, alle.length)) * 1000).toFixed(1) }))
}

/** Satzanfänge, die sich wiederholen — das erzeugt den Leiern-Ton. */
function anfaenge(liste) {
  const zaehler = new Map()
  for (const s of liste) {
    const erstes = (woerter(s)[0] || '').toLowerCase()
    if (!erstes) continue
    zaehler.set(erstes, (zaehler.get(erstes) || 0) + 1)
  }
  return [...zaehler.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([wort, anzahl]) => ({ wort, anzahl }))
}

function verteilung(werte) {
  if (!werte.length) return { anzahl: 0, mittel: 0, streuung: 0, min: 0, max: 0, gleichmass: 0 }
  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length
  const streuung = Math.sqrt(werte.reduce((s, w) => s + (w - mittel) ** 2, 0) / werte.length)
  return {
    anzahl: werte.length,
    mittel: +mittel.toFixed(1),
    streuung: +streuung.toFixed(1),
    min: Math.min(...werte),
    max: Math.max(...werte),
    // Variationskoeffizient: Streuung im Verhältnis zur Länge. Erst dadurch
    // sind kurze und lange Texte vergleichbar.
    gleichmass: +(streuung / Math.max(1, mittel)).toFixed(2),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Messen
// ────────────────────────────────────────────────────────────────────────────

/** Text auf die typischen Maschinen-Merkmale abklopfen. */
export function messen(text) {
  const liste = saetze(text)
  const alle = woerter(text)
  const laengen = liste.map((s) => woerter(s).length)
  const satz = verteilung(laengen)
  const absatz = verteilung(absaetze(text).map((a) => woerter(a).length))
  const treffer = floskelnFinden(text)
  const proTausend = (n) => +((n / Math.max(1, alle.length)) * 1000).toFixed(1)

  // Der schmale Mittelbau ist das deutlichste Zeichen: fast jeder Satz zwischen
  // zwölf und fünfundzwanzig Wörtern, kaum ein kurzer, kaum ein langer.
  const mittelbau = laengen.length
    ? +((laengen.filter((l) => l >= 12 && l <= 25).length / laengen.length) * 100).toFixed(0)
    : 0

  const gedankenstriche = (String(text).match(/[—–]/g) || []).length
  const dreierketten = (String(text).match(/\b\w+, \w+(?: \w+)? und \w+/g) || []).length

  const funde = {
    satz,
    absatz,
    woerter: alle.length,
    mittelbauProzent: mittelbau,
    floskeln: {
      anzahl: treffer.length,
      proTausend: proTausend(treffer.length),
      arten: [...new Set(treffer.map((t) => t.art))],
      beispiele: treffer.slice(0, 8).map((t) => `${t.art}: „${t.stelle}"`),
    },
    anfaenge: anfaenge(liste),
    wiederholungen: wortWiederholung(alle),
    gedankenstriche: { anzahl: gedankenstriche, proTausend: proTausend(gedankenstriche) },
    dreierketten,
  }
  return { ...funde, auffaellig: auffaelligkeiten(funde), urteil: urteilen(funde) }
}

/** Konkrete Beanstandungen im Klartext — das ist zugleich der Auftrag ans Gehirn. */
function auffaelligkeiten(f) {
  const liste = []
  if (f.satz.anzahl >= 5 && f.satz.gleichmass < 0.35)
    liste.push(
      `Satzlängen zu gleichmäßig: ∅ ${f.satz.mittel} Wörter, Streuung nur ${f.satz.streuung} (${f.satz.min}–${f.satz.max}).`,
    )
  if (f.mittelbauProzent >= 75 && f.satz.anzahl >= 5)
    liste.push(`${f.mittelbauProzent} % aller Sätze liegen zwischen 12 und 25 Wörtern — es fehlen kurze und lange.`)
  if (f.floskeln.proTausend >= 3)
    liste.push(`${f.floskeln.anzahl} Floskeln auf ${f.woerter} Wörter (${f.floskeln.arten.join(', ')}).`)
  for (const a of f.anfaenge)
    liste.push(`${a.anzahl} Sätze beginnen mit „${a.wort}".`)
  for (const w of f.wiederholungen.slice(0, 3))
    if (w.promille >= 6) liste.push(`„${w.wort}" steht ${w.anzahl}-mal im Text.`)
  // Die Rate allein reicht nicht: ein einzelner Gedankenstrich in einem kurzen
  // Absatz reißt jede Schwelle, ist aber schlicht ein Gedankenstrich.
  if (f.gedankenstriche.anzahl >= 3 && f.gedankenstriche.proTausend >= 4)
    liste.push(`${f.gedankenstriche.anzahl} Gedankenstriche — als Satzzeichen zu oft für einen Text dieser Länge.`)
  if (f.dreierketten >= 3) liste.push(`${f.dreierketten} Dreier-Aufzählungen („A, B und C") — ein sehr regelmäßiges Muster.`)
  // Erst ab vier Absätzen und deutlich enger: drei Absätze mit 22, 17 und 14
  // Wörtern sind normale Prosa, kein Muster — die Regel hat genau das gemeldet.
  if (f.absatz.anzahl >= 4 && f.absatz.gleichmass < 0.15)
    liste.push(`Alle ${f.absatz.anzahl} Absätze fast gleich lang (∅ ${f.absatz.mittel} Wörter, Streuung ${f.absatz.streuung}).`)
  return liste
}

function urteilen(f) {
  if (f.satz.anzahl < 3) return 'Zu kurz für eine Aussage.'
  const punkte = auffaelligkeiten(f).length
  if (!punkte) return 'Unauffällig: die Sätze atmen, keine Floskelhäufung.'
  if (punkte <= 2) return `Weitgehend in Ordnung, ${punkte === 1 ? 'eine Auffälligkeit' : punkte + ' Auffälligkeiten'}.`
  return `Klingt maschinell: ${punkte} Auffälligkeiten, vor allem gleichförmige Sätze und Floskeln.`
}
