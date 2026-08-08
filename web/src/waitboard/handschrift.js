// Handschrift: aus Text werden Stiftstriche.
//
// Kein Sprachmodell gibt Striche zurück — es gibt Text. Damit die KI wirklich
// auf das Waitboard *schreibt* statt Text hinzustempeln, wird hier jeder Buchstabe
// als Einstrich-Pfad abgelegt, abgetastet und mit etwas Zittern versehen.
// Das Waitboard malt die Punkte dann der Reihe nach. Weil sie in der Reihenfolge
// entstehen, in der ein Mensch schreiben würde, sieht es aus wie Handschrift.
//
// Koordinaten je Buchstabe (em-Einheiten, y zeigt nach unten wie in SVG):
//   Grundlinie   y =   0
//   x-Höhe       y = -52
//   Versalhöhe   y = -74
//   Oberlänge    y = -80
//   Unterlänge   y = +22

/** [Vorschub, [Pfade…]] — die Pfade in der Reihenfolge, in der man sie schreibt. */
const GLYPHEN = {
  ' ': [26, []],
  a: [56, ['M44,-38 C40,-54 10,-54 8,-30 C6,-8 34,-2 44,-16', 'M44,-52 L44,-4 C44,2 48,4 52,2']],
  b: [56, ['M10,-80 L10,0', 'M10,-16 C18,2 48,-2 48,-26 C48,-50 18,-54 10,-36']],
  c: [52, ['M46,-40 C40,-54 10,-54 8,-28 C6,-4 36,4 46,-12']],
  d: [56, ['M46,-80 L46,-4 C46,2 50,4 54,2', 'M46,-38 C40,-54 10,-54 8,-30 C6,-6 36,2 46,-14']],
  e: [52, ['M8,-28 L44,-30 C48,-52 12,-58 8,-30 C4,-6 34,2 46,-12']],
  f: [40, ['M36,-84 C22,-88 16,-78 16,-64 L16,0', 'M2,-52 L36,-52']],
  g: [56, ['M46,-38 C40,-54 10,-54 8,-30 C6,-6 36,2 46,-14', 'M46,-52 L46,8 C46,26 24,30 12,20']],
  h: [56, ['M10,-80 L10,0', 'M10,-32 C18,-52 46,-56 46,-32 L46,0']],
  i: [26, ['M13,-52 L13,-4 C13,1 16,2 19,1', 'M13,-70 L13,-67']],
  j: [26, ['M15,-52 L15,10 C15,26 4,28 -2,22', 'M15,-70 L15,-67']],
  k: [52, ['M10,-80 L10,0', 'M44,-50 L10,-20 L42,0']],
  l: [24, ['M12,-80 L12,-8 C12,0 16,2 20,0']],
  m: [84, ['M8,-52 L8,0', 'M8,-34 C14,-50 36,-56 36,-32 L36,0', 'M36,-34 C42,-50 66,-56 66,-32 L66,0']],
  n: [56, ['M10,-52 L10,0', 'M10,-32 C16,-50 46,-56 46,-32 L46,0']],
  o: [56, ['M26,-54 C10,-54 4,-38 6,-24 C8,-8 24,0 34,-2 C48,-6 52,-24 48,-36 C44,-50 34,-54 26,-54']],
  p: [56, ['M10,-52 L10,22', 'M10,-34 C18,-56 48,-52 48,-28 C48,-4 18,0 10,-14']],
  q: [56, ['M46,-38 C40,-54 10,-54 8,-30 C6,-6 36,2 46,-14', 'M46,-52 L46,22']],
  r: [40, ['M10,-52 L10,0', 'M10,-32 C16,-48 28,-54 38,-52']],
  s: [46, ['M40,-46 C34,-56 8,-54 10,-40 C12,-28 36,-30 38,-16 C40,-2 12,2 6,-8']],
  t: [36, ['M16,-72 L16,-10 C16,-2 24,2 30,-2', 'M2,-52 L32,-52']],
  u: [56, ['M10,-52 L10,-20 C10,2 40,2 46,-18', 'M46,-52 L46,-4 C46,2 50,4 54,2']],
  v: [50, ['M6,-52 L24,0 L44,-52']],
  w: [74, ['M6,-52 L20,0 L34,-40 L48,0 L64,-52']],
  x: [50, ['M8,-52 L44,0', 'M44,-52 L8,0']],
  y: [52, ['M8,-52 L8,-22 C8,0 36,2 42,-16', 'M42,-52 L42,8 C42,26 22,30 10,22']],
  z: [46, ['M8,-52 L40,-52 L8,0 L42,0']],
  A: [66, ['M4,0 L32,-74 L60,0', 'M15,-24 L49,-24']],
  B: [62, ['M12,-74 L12,0', 'M12,-74 L38,-74 C58,-74 56,-42 36,-42 L12,-42', 'M12,-42 L40,-42 C62,-42 60,0 36,0 L12,0']],
  C: [62, ['M54,-58 C44,-78 10,-72 8,-38 C6,-4 42,6 54,-14']],
  D: [64, ['M12,-74 L12,0', 'M12,-74 L34,-74 C60,-74 60,0 34,0 L12,0']],
  E: [54, ['M46,-74 L10,-74 L10,0 L46,0', 'M10,-40 L38,-40']],
  F: [52, ['M46,-74 L10,-74 L10,0', 'M10,-40 L38,-40']],
  G: [66, ['M54,-58 C44,-78 10,-72 8,-38 C6,-4 44,6 54,-14 L54,-34', 'M36,-34 L56,-34']],
  H: [66, ['M10,-74 L10,0', 'M54,-74 L54,0', 'M10,-38 L54,-38']],
  I: [24, ['M12,-74 L12,0']],
  J: [46, ['M36,-74 L36,-14 C36,6 8,8 4,-10']],
  K: [62, ['M10,-74 L10,0', 'M52,-74 L10,-28 L54,0']],
  L: [50, ['M10,-74 L10,0 L46,0']],
  M: [78, ['M8,0 L8,-74 L38,-24 L68,-74 L68,0']],
  N: [68, ['M10,0 L10,-74 L56,0 L56,-74']],
  O: [70, ['M34,-74 C12,-74 6,-52 6,-36 C6,-14 18,0 34,0 C52,0 62,-16 62,-38 C62,-58 52,-74 34,-74']],
  P: [58, ['M12,-74 L12,0', 'M12,-74 L36,-74 C60,-74 60,-34 34,-34 L12,-34']],
  Q: [70, ['M34,-74 C12,-74 6,-52 6,-36 C6,-14 18,0 34,0 C52,0 62,-16 62,-38 C62,-58 52,-74 34,-74', 'M40,-14 L62,8']],
  R: [62, ['M12,-74 L12,0', 'M12,-74 L36,-74 C58,-74 58,-36 34,-36 L12,-36', 'M32,-36 L56,0']],
  S: [56, ['M48,-62 C40,-78 10,-74 10,-54 C10,-34 46,-38 46,-18 C46,4 12,6 6,-10']],
  T: [56, ['M4,-74 L52,-74', 'M28,-74 L28,0']],
  U: [64, ['M10,-74 L10,-22 C10,4 52,4 52,-22 L52,-74']],
  V: [62, ['M6,-74 L30,0 L56,-74']],
  W: [88, ['M6,-74 L24,0 L42,-56 L60,0 L78,-74']],
  X: [60, ['M8,-74 L52,0', 'M52,-74 L8,0']],
  Y: [58, ['M6,-74 L29,-36 L52,-74', 'M29,-36 L29,0']],
  Z: [56, ['M8,-74 L48,-74 L8,0 L50,0']],
  0: [54, ['M28,-70 C12,-70 8,-50 8,-35 C8,-14 16,0 28,0 C42,0 48,-16 48,-35 C48,-54 42,-70 28,-70']],
  1: [34, ['M8,-56 L22,-70 L22,0']],
  2: [52, ['M8,-56 C10,-72 44,-74 44,-52 C44,-32 8,-16 6,0 L46,0']],
  3: [52, ['M8,-62 C16,-74 44,-70 42,-54 C40,-42 26,-38 20,-38 C30,-38 46,-36 46,-18 C46,2 14,6 6,-8']],
  4: [54, ['M36,-70 L6,-22 L50,-22', 'M36,-40 L36,0']],
  5: [52, ['M44,-70 L14,-70 L10,-40 C22,-48 46,-44 46,-22 C46,2 14,6 6,-8']],
  6: [52, ['M44,-64 C34,-74 10,-68 8,-38 C6,-8 18,0 28,0 C42,0 46,-12 46,-22 C46,-34 34,-42 24,-40 C14,-38 8,-30 8,-26']],
  7: [50, ['M6,-70 L46,-70 L20,0']],
  8: [54, ['M28,-38 C14,-38 8,-30 8,-20 C8,-6 18,0 28,0 C40,0 48,-8 48,-20 C48,-32 38,-38 28,-38 C16,-38 12,-48 12,-56 C12,-66 20,-70 28,-70 C38,-70 44,-64 44,-56 C44,-46 38,-38 28,-38']],
  9: [52, ['M10,-6 C20,4 44,-2 46,-32 C48,-62 36,-70 26,-70 C12,-70 8,-58 8,-48 C8,-36 20,-30 30,-32 C40,-34 46,-42 46,-46']],
  '.': [24, ['M8,-5 C8,-10 15,-10 15,-5 C15,0 8,0 8,-5']],
  ',': [24, ['M13,-7 C16,-2 12,7 6,13']],
  ':': [24, ['M8,-5 C8,-10 15,-10 15,-5 C15,0 8,0 8,-5', 'M8,-35 C8,-40 15,-40 15,-35 C15,-30 8,-30 8,-35']],
  ';': [24, ['M13,-7 C16,-2 12,7 6,13', 'M8,-35 C8,-40 15,-40 15,-35 C15,-30 8,-30 8,-35']],
  '!': [24, ['M11,-74 L11,-18', 'M8,-5 C8,-10 15,-10 15,-5 C15,0 8,0 8,-5']],
  '?': [48, ['M8,-58 C10,-76 42,-74 42,-56 C42,-40 24,-38 24,-22', 'M20,-5 C20,-10 27,-10 27,-5 C27,0 20,0 20,-5']],
  '-': [40, ['M6,-28 L34,-28']],
  '–': [52, ['M6,-28 L46,-28']],
  '_': [50, ['M4,4 L46,4']],
  '(': [30, ['M24,-80 C6,-56 6,-16 24,8']],
  ')': [30, ['M6,-80 C24,-56 24,-16 6,8']],
  '[': [28, ['M24,-80 L8,-80 L8,8 L24,8']],
  ']': [28, ['M4,-80 L20,-80 L20,8 L4,8']],
  '{': [30, ['M26,-80 C14,-80 18,-36 6,-36 C18,-36 14,8 26,8']],
  '}': [30, ['M4,-80 C16,-80 12,-36 24,-36 C12,-36 16,8 4,8']],
  '/': [44, ['M6,8 L38,-80']],
  '\\': [44, ['M6,-80 L38,8']],
  '+': [52, ['M8,-30 L44,-30', 'M26,-48 L26,-12']],
  '=': [52, ['M8,-40 L44,-40', 'M8,-20 L44,-20']],
  '<': [48, ['M40,-56 L8,-30 L40,-4']],
  '>': [48, ['M8,-56 L40,-30 L8,-4']],
  '*': [40, ['M20,-72 L20,-40', 'M7,-64 L33,-48', 'M33,-64 L7,-48']],
  '%': [64, ['M14,-70 C6,-70 6,-54 14,-54 C22,-54 22,-70 14,-70', 'M54,-70 L10,0', 'M50,-16 C42,-16 42,0 50,0 C58,0 58,-16 50,-16']],
  '"': [32, ['M10,-74 L7,-56', 'M25,-74 L22,-56']],
  "'": [18, ['M10,-74 L7,-56']],
  '→': [76, ['M6,-30 L64,-30', 'M46,-48 L66,-30 L46,-12']],
  '·': [24, ['M8,-28 C8,-33 15,-33 15,-28 C15,-23 8,-23 8,-28']],
}

// Umlaute und ß bauen wir aus dem Grundbuchstaben plus Punkten — spart 6 Glyphen
// und die Punkte sitzen dann garantiert überall gleich.
const PUNKTE_KLEIN = ['M12,-72 C12,-77 19,-77 19,-72 C19,-67 12,-67 12,-72', 'M34,-72 C34,-77 41,-77 41,-72 C41,-67 34,-67 34,-72']
const PUNKTE_GROSS = ['M14,-92 C14,-97 21,-97 21,-92 C21,-87 14,-87 14,-92', 'M40,-92 C40,-97 47,-97 47,-92 C47,-87 40,-87 40,-92']
const UMLAUTE = { ä: 'a', ö: 'o', ü: 'u', Ä: 'A', Ö: 'O', Ü: 'U' }
for (const [um, basis] of Object.entries(UMLAUTE)) {
  const [vorschub, pfade] = GLYPHEN[basis]
  GLYPHEN[um] = [vorschub, [...pfade, ...(um === um.toLowerCase() ? PUNKTE_KLEIN : PUNKTE_GROSS)]]
}
GLYPHEN['ß'] = [56, ['M10,0 L10,-58 C10,-78 42,-78 44,-62 C46,-48 28,-46 28,-44 C28,-42 50,-42 50,-24 C50,-6 28,-2 18,-8']]

const ERSATZ = '·' // alles, was wir nicht kennen

// ────────────────────────── Pfade zu Punkten ──────────────────────────

// Der Browser kann Bézierkurven abtasten — dafür muss der Pfad nur kurz in
// einem unsichtbaren SVG hängen. Spart eine eigene Kurven-Mathematik.
//
// Wichtig: für jeden Pfad ein FRISCHES <path>-Element. Setzt man "d" mehrfach
// auf demselben Element, gibt Chrome die Geometrie des vorherigen Pfades
// zurück — die Neuberechnung hängt am Layout, und das läuft in einer engen
// Schleife nicht mit. Jeder Buchstabe bekäme dann die Striche seines
// Vorgängers. Passiert nur einmal je Zeichen, kostet also praktisch nichts.
const NS = 'http://www.w3.org/2000/svg'
let messBlatt = null
function messBuehne() {
  if (messBlatt) return messBlatt
  messBlatt = document.createElementNS(NS, 'svg')
  messBlatt.setAttribute('width', '0')
  messBlatt.setAttribute('height', '0')
  messBlatt.setAttribute('aria-hidden', 'true')
  messBlatt.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden'
  document.body.appendChild(messBlatt)
  return messBlatt
}

const SCHRITT = 2.2 // em-Einheiten je Punkt — feiner sieht runder aus, kostet mehr
const gedaechtnis = new Map() // Zeichen -> abgetastete Punkte, in em-Einheiten

/** Ein Zeichen einmal abtasten und merken. */
function abtasten(zeichen) {
  if (gedaechtnis.has(zeichen)) return gedaechtnis.get(zeichen)
  const [vorschub, pfade] = GLYPHEN[zeichen] || GLYPHEN[ERSATZ]
  const buehne = messBuehne()
  const striche = pfade.map((d) => {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', d)
    buehne.appendChild(p)
    const laenge = p.getTotalLength()
    const anzahl = Math.max(2, Math.ceil(laenge / SCHRITT))
    const punkte = []
    for (let i = 0; i <= anzahl; i++) {
      const { x, y } = p.getPointAtLength((i / anzahl) * laenge)
      punkte.push([x, y])
    }
    buehne.removeChild(p)
    return punkte
  })
  const eintrag = { vorschub, striche }
  gedaechtnis.set(zeichen, eintrag)
  return eintrag
}

/** Immer dasselbe „Zufalls"-Zittern für denselben Text — sonst wackelt es bei jedem Neuzeichnen. */
function wuerfel(saat) {
  let a = saat >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Text in Stiftstriche verwandeln.
 *
 * @param {string} text        darf Zeilenumbrüche enthalten
 * @param {object} o
 * @param {number} o.x         linker Rand in Leinwand-Pixeln
 * @param {number} o.y         Grundlinie der ersten Zeile, in Leinwand-Pixeln
 * @param {number} o.groesse   Höhe eines Großbuchstabens in Pixeln
 * @param {number} o.maxBreite Umbruchbreite in Pixeln
 * @param {number} o.neigung   0 = senkrecht, 0.2 = deutlich schräg
 * @param {number} o.zittern   0 = Maschine, 1.5 = sehr menschlich
 * @param {number} o.saat      gleiche Saat = gleiches Zittern
 * @returns {{striche: {x:number,y:number}[][], breite:number, hoehe:number, unten:number}}
 */
export function schreibe(text, {
  x = 0,
  y = 0,
  groesse = 30,
  maxBreite = Infinity,
  zeilenAbstand = 1.65,
  neigung = 0.1,
  zittern = 0.85,
  saat = 7,
} = {}) {
  const skala = groesse / 74 // 74 em-Einheiten = Versalhöhe
  const zufall = wuerfel(saat)
  const zeilenHoehe = groesse * zeilenAbstand

  // Erst umbrechen — dazu brauchen wir nur die Vorschübe, nicht die Punkte.
  const breiteVon = (s) => [...s].reduce((b, z) => b + (GLYPHEN[z] || GLYPHEN[ERSATZ])[0] * skala, 0)
  const zeilen = []
  for (const absatz of String(text).split('\n')) {
    let zeile = ''
    for (const wort of absatz.split(/(\s+)/)) {
      if (!wort) continue
      if (zeile && breiteVon(zeile + wort) > maxBreite) {
        zeilen.push(zeile.trimEnd())
        zeile = wort.trimStart()
      } else {
        zeile += wort
      }
    }
    zeilen.push(zeile.trimEnd())
  }

  const striche = []
  let breiteste = 0

  zeilen.forEach((zeile, nr) => {
    let stift = x
    // Jede Zeile sitzt eine Winzigkeit anders — wie auf unliniertem Papier.
    const zeilenVersatz = (zufall() - 0.5) * groesse * 0.05 * zittern
    const grundlinie = y + nr * zeilenHoehe + zeilenVersatz
    const kippung = (zufall() - 0.5) * 0.012 * zittern // ganze Zeile leicht schief

    for (const zeichen of zeile) {
      const { vorschub, striche: roh } = abtasten(zeichen)
      // Pro Buchstabe ein eigener kleiner Versatz, sonst wirkt es gestempelt.
      const dx = (zufall() - 0.5) * groesse * 0.035 * zittern
      const dy = (zufall() - 0.5) * groesse * 0.045 * zittern
      const groesseJitter = 1 + (zufall() - 0.5) * 0.05 * zittern

      for (const punkte of roh) {
        const strich = punkte.map(([px, py]) => {
          const ex = px * skala * groesseJitter
          const ey = py * skala * groesseJitter
          // Neigung: was höher steht, rutscht weiter nach rechts (ey ist negativ oben)
          const sx = stift + ex - ey * neigung + dx
          const sy = grundlinie + ey + dy + (sx - x) * kippung
          return { x: sx, y: sy }
        })
        if (strich.length > 1) striche.push(strich)
      }
      stift += vorschub * skala
      breiteste = Math.max(breiteste, stift - x)
    }
  })

  return {
    striche,
    breite: Math.min(breiteste, maxBreite),
    hoehe: zeilen.length * zeilenHoehe,
    unten: y + (zeilen.length - 1) * zeilenHoehe + groesse * 0.3,
  }
}

/** Wie viele Zeichen passen bei dieser Größe in diese Breite? Praktisch fürs Prompten. */
export function zeichenProZeile(breite, groesse) {
  const mittel = 52 * (groesse / 74) // Durchschnittsvorschub eines Kleinbuchstabens
  return Math.max(8, Math.floor(breite / mittel))
}
