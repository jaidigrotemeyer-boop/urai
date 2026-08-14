// Tipp-Effekt: Text erscheint Zeichen für Zeichen, im Rhythmus einer Hand.
//
// Eine Maschine tippt mit gleichem Abstand — das sieht sofort falsch aus. Eine
// Hand ist innerhalb eines Wortes schnell, stockt vor dem Komma, hält nach dem
// Punkt an, macht zwischendurch eine Denkpause und wird über die Zeit schneller
// oder müder. Genau das rechnet dieses Modul aus.
//
// Gedacht für Sichtbares: Screencast, Demo, Präsentation, ein Mitleser, der
// zuschaut. Darum ist die Dauer nach oben begrenzt (siehe MAX_DAUER_MS). Ein
// Text, der über Tage in ein Dokument tröpfelt, hat nichts mehr mit einem
// Tipp-Effekt zu tun — dann ist die Schreibgeschichte des Dokuments das
// Ergebnis, und die wäre erfunden.
export const MAX_DAUER_MS = 4 * 60 * 60 * 1000

// Wiederholbar wie beim Rest: gleiche Saat, gleicher Rhythmus.
function zufallsQuelle(saat) {
  let a = (Number.isFinite(saat) ? saat : Date.now()) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9)
  return Math.max(-2, Math.min(2, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())))
}

/** "90s", "10m", "1h30m" oder eine Zahl (Minuten) in Millisekunden. */
export function dauerLesen(wert) {
  if (wert == null || wert === '') return null
  if (typeof wert === 'number') return Math.round(wert * 60000)
  const roh = String(wert).trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(roh)) return Math.round(Number(roh) * 60000)
  // Reihenfolge der Einheiten: die langen zuerst. Stünde "m" vor "min", würde
  // "min" nie erreicht — und "150ms" wäre klammheimlich zu 150 Minuten geworden.
  const treffer = [...roh.matchAll(/(\d+(?:[.,]\d+)?)\s*(std|min|sek|h|m|s)/g)]
  const ohneLeer = roh.replace(/\s+/g, '')
  const erkannt = treffer.map((t) => t[0].replace(/\s+/g, '')).join('')
  // Und alles muss aufgehen. Ein Rest wie das "s" in "150ms" heißt: hier meint
  // jemand etwas anderes, als das Muster gelesen hat.
  if (!treffer.length || erkannt !== ohneLeer)
    throw new Error(`Dauer nicht verstanden: "${wert}". Nimm z.B. 45s, 10m oder 1h30m.`)
  const faktor = { h: 3600000, std: 3600000, m: 60000, min: 60000, s: 1000, sek: 1000 }
  return Math.round(treffer.reduce((s, [, z, e]) => s + Number(z.replace(',', '.')) * faktor[e], 0))
}

const STANDARD = {
  zeichenProMinute: 260, // ~45 Wörter/Minute, geübte Hand
  satzPauseMs: 420, // nach Punkt, Ausrufe-, Fragezeichen
  kommaPauseMs: 180, // nach Komma, Semikolon, Doppelpunkt
  absatzPauseMs: 900, // am Zeilenumbruch
  stockenRate: 0.012, // wie oft eine echte Denkpause kommt
  stockenMs: 1100, // wie lang die dann höchstens dauert
  streuung: 0.4, // Schwankung von Anschlag zu Anschlag
  drift: 0.18, // langsames Schneller-/Langsamerwerden über den Text
  saat: undefined,
}

/**
 * Text in eine Folge aus Zeichen und Wartezeit übersetzen. Reine Rechnung,
 * kein Tastendruck — dadurch prüfbar, ohne irgendetwas zu tippen.
 */
export function zeichenPlan(text, optionen = {}) {
  const roh = String(text ?? '')
  if (!roh) return { schritte: [], gesamtMs: 0 }
  const p = { ...STANDARD, ...Object.fromEntries(Object.entries(optionen).filter(([, v]) => v != null)) }
  const rnd = zufallsQuelle(p.saat)
  const grund = 60000 / Math.max(20, Math.min(2000, p.zeichenProMinute))

  // Zwei überlagerte Wellen mit krummem Verhältnis: die Geschwindigkeit
  // schwankt sichtbar, ohne dass ein Takt erkennbar wird.
  const welle = (i) =>
    1 + p.drift * (0.6 * Math.sin((i / roh.length) * Math.PI * 2.7) + 0.4 * Math.sin((i / roh.length) * Math.PI * 7.3))

  const schritte = []
  for (let i = 0; i < roh.length; i++) {
    const z = roh[i]
    const vorher = roh[i - 1]
    let pause = grund * welle(i) * Math.exp(gauss(rnd) * p.streuung)

    // Die Pause gehört hinter das Satzzeichen, nicht davor: erst steht der
    // Punkt da, dann denkt der Schreibende nach.
    if (/[.!?…]/.test(vorher || '') && /\s/.test(z)) pause += p.satzPauseMs * (0.6 + rnd())
    else if (/[,;:]/.test(vorher || '')) pause += p.kommaPauseMs * (0.5 + rnd())
    if (z === '\n') pause += p.absatzPauseMs * (0.6 + rnd() * 0.8)
    // Großbuchstaben und Sonderzeichen brauchen die Umschalttaste dazu.
    if (/[A-ZÄÖÜ]/.test(z)) pause *= 1.2
    else if (/[^\p{L}\p{N}\s.,]/u.test(z)) pause *= 1.35
    if (rnd() < p.stockenRate) pause += p.stockenMs * (0.4 + rnd())

    schritte.push({ zeichen: z, pause: Math.max(8, Math.round(pause)) })
  }

  const gesamtMs = schritte.reduce((s, x) => s + x.pause, 0)
  return { schritte, gesamtMs }
}

/**
 * Denselben Rhythmus auf eine Wunschdauer strecken oder stauchen. Die Form
 * bleibt, nur der Maßstab ändert sich — sonst müsste man die Pausen einzeln
 * nachstellen und der Rhythmus wäre hin.
 */
export function aufDauer(plan, dauerMs) {
  if (!dauerMs || !plan.gesamtMs) return plan
  if (dauerMs > MAX_DAUER_MS)
    throw new Error(
      `Höchstens ${MAX_DAUER_MS / 3600000} Stunden. Länger ist kein Tipp-Effekt mehr, sondern eine erfundene Schreibgeschichte.`,
    )
  const faktor = dauerMs / plan.gesamtMs
  const schritte = plan.schritte.map((s) => ({ ...s, pause: Math.max(8, Math.round(s.pause * faktor)) }))
  return { schritte, gesamtMs: schritte.reduce((s, x) => s + x.pause, 0) }
}

/** Wie lange braucht der Text bei dieser Geschwindigkeit — ohne zu tippen. */
export function schaetzung(text, optionen = {}) {
  const plan = aufDauer(zeichenPlan(text, optionen), dauerLesen(optionen.dauer))
  return { zeichen: plan.schritte.length, ms: plan.gesamtMs }
}

export const zeitText = (ms) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/**
 * Den Plan abspielen. `tippe` bekommt jeweils ein Zeichen, `warte` die
 * Millisekunden — beides wird hereingereicht, damit sich der Ablauf ohne
 * Tastatur und ohne Wartezeit prüfen lässt.
 */
export async function abspielen(plan, { tippe, warte, signal, melde } = {}) {
  const start = Date.now()
  let getippt = 0
  let verzug = 0
  let soll = start
  // Etwa fünfzig Meldungen über den ganzen Lauf. Ein fester Abstand von 200
  // Zeichen meldete bei kurzem Text gar nichts: der Balken stand bis zum Schluss
  // auf null und sah aus, als hinge etwas.
  const jedes = Math.max(1, Math.floor(plan.schritte.length / 50))

  for (const schritt of plan.schritte) {
    if (signal?.aborted) break
    // Gegen die Startzeit gerechnet, nicht gegen den letzten Anschlag: ein
    // Tastendruck kostet selbst Zeit, und ohne diese Verrechnung summiert sich
    // das auf — aus zehn Minuten würden fünfzehn.
    soll += schritt.pause
    const rest = soll - Date.now()
    if (rest > 0) await warte(rest)
    else verzug = Math.max(verzug, -rest)
    if (signal?.aborted) break
    await tippe(schritt.zeichen)
    getippt++
    if (melde && (getippt % jedes === 0 || getippt === plan.schritte.length))
      melde({ getippt, gesamt: plan.schritte.length })
  }

  return { getippt, gesamt: plan.schritte.length, ms: Date.now() - start, verzugMs: Math.round(verzug) }
}
