// Humanizer: aus starr wird menschlich.
//
// Ein Drucker, ein Sequencer, ein Drum-Computer setzt jeden Schlag exakt aufs
// Raster — genau das hört man als "Maschine". Eine Hand daneben trifft immer ein
// paar Millisekunden zu früh oder zu spät, schlägt mal fester und mal weicher,
// zieht Akkorde leicht auseinander und hält Noten unterschiedlich lang.
// Dieses Modul gibt einer fertigen MIDI-Datei genau diese Ungenauigkeiten zurück.
//
// Bewusst ohne Zusatzpakete: MIDI-Dateien sind ein einfaches Chunk-Format, und
// ein eigener Leser/Schreiber (unten) ist kleiner als jede Abhängigkeit, die
// dafür sonst dazukäme. URAI bleibt damit weiterhin `npm i` ohne Bauwerkzeuge.

// ────────────────────────────────────────────────────────────────────────────
// Zufall
// ────────────────────────────────────────────────────────────────────────────

// Bewusst ein gesäter Generator (mulberry32) und nicht crypto: Musik muss
// wiederholbar sein. Wer denselben Saat-Wert nimmt, bekommt exakt denselben
// Groove zurück — sonst klingt jeder Export anders und nichts ist vergleichbar.
export function zufallsQuelle(saat) {
  let a = (Number.isFinite(saat) ? saat : Date.now()) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Normalverteilt (Box-Muller), aber bei ±2σ gekappt: ein einzelner Ausreißer
// von 4σ klingt nicht menschlich, sondern nach Fehler.
function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9)
  const v = rnd()
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(-2, Math.min(2, g))
}

const klemme = (v, min, max) => Math.max(min, Math.min(max, v))

// ────────────────────────────────────────────────────────────────────────────
// MIDI lesen
// ────────────────────────────────────────────────────────────────────────────

function leser(buf) {
  let i = 0
  return {
    get pos() {
      return i
    },
    set pos(v) {
      i = v
    },
    u8: () => buf[i++],
    u16: () => {
      const v = buf.readUInt16BE(i)
      i += 2
      return v
    },
    u32: () => {
      const v = buf.readUInt32BE(i)
      i += 4
      return v
    },
    text: (n) => {
      const v = buf.toString('latin1', i, i + n)
      i += n
      return v
    },
    bytes: (n) => {
      const v = Buffer.from(buf.subarray(i, i + n))
      i += n
      return v
    },
    vlq: () => {
      let v = 0
      let b
      do {
        b = buf[i++]
        if (b === undefined) throw new Error('MIDI-Datei bricht mitten in einer Zahl ab.')
        v = (v << 7) | (b & 0x7f)
      } while (b & 0x80)
      return v
    },
  }
}

// Wie viele Datenbytes hat ein Kanal-Ereignis? Program-Change und
// Channel-Pressure haben eins, alles andere zwei.
const datenBytes = (status) => ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2)

function spurLesen(buf) {
  const r = leser(buf)
  const ereignisse = []
  let tick = 0
  let laufend = 0 // Running Status: MIDI darf den Status-Byte weglassen

  while (r.pos < buf.length) {
    tick += r.vlq()
    let status = r.u8()
    if (status < 0x80) {
      // Kein Status-Byte — der letzte gilt weiter, das gelesene Byte war schon Daten.
      if (!laufend) throw new Error('MIDI-Spur beginnt mit Daten ohne Status-Byte.')
      r.pos -= 1
      status = laufend
    } else if (status < 0xf0) {
      laufend = status
    }

    if (status === 0xff) {
      const typ = r.u8()
      const len = r.vlq()
      const daten = r.bytes(len)
      if (typ === 0x2f) break // Spurende — wird beim Schreiben neu gesetzt
      ereignisse.push({ tick, art: 'meta', typ, daten })
    } else if (status === 0xf0 || status === 0xf7) {
      const len = r.vlq()
      ereignisse.push({ tick, art: 'sysex', status, daten: r.bytes(len) })
    } else {
      const kanal = status & 0x0f
      const art = status & 0xf0
      const d1 = r.u8()
      const d2 = datenBytes(status) === 2 ? r.u8() : 0
      if (art === 0x90 && d2 > 0) {
        ereignisse.push({ tick, art: 'note_on', kanal, note: d1, velocity: d2 })
      } else if (art === 0x80 || art === 0x90) {
        // note_on mit Velocity 0 ist ein note_off — beides gleich behandeln.
        ereignisse.push({ tick, art: 'note_off', kanal, note: d1, velocity: art === 0x80 ? d2 : 0 })
      } else {
        ereignisse.push({ tick, art: 'kanal', status, daten: datenBytes(status) === 2 ? [d1, d2] : [d1] })
      }
    }
  }
  return ereignisse
}

/** MIDI-Datei (Buffer) in Spuren aus absoluten Tick-Ereignissen zerlegen. */
export function midiLesen(buf) {
  if (buf.length < 14 || buf.toString('latin1', 0, 4) !== 'MThd')
    throw new Error('Das ist keine MIDI-Datei (kein MThd-Kopf).')
  const r = leser(buf)
  r.text(4)
  const kopfLaenge = r.u32()
  const format = r.u16()
  const anzahl = r.u16()
  const teilung = r.u16()
  r.pos = 8 + kopfLaenge
  if (teilung & 0x8000)
    throw new Error('SMPTE-Zeitcode wird nicht unterstützt — bitte MIDI mit Ticks pro Viertel exportieren.')

  const spuren = []
  while (r.pos + 8 <= buf.length && spuren.length < anzahl) {
    const kennung = r.text(4)
    const len = r.u32()
    const teil = r.bytes(len)
    if (kennung === 'MTrk') spuren.push(spurLesen(teil))
  }
  if (!spuren.length) throw new Error('MIDI-Datei enthält keine Spur.')
  return { format, ppq: teilung, spuren }
}

// ────────────────────────────────────────────────────────────────────────────
// MIDI schreiben
// ────────────────────────────────────────────────────────────────────────────

function vlqSchreiben(wert) {
  const bytes = [wert & 0x7f]
  let v = Math.floor(wert / 128)
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  return Buffer.from(bytes)
}

// Bei gleichem Tick zählt die Reihenfolge: erst Meta (Tempo, Taktart), dann
// note_off, dann note_on. Andersherum würde ein Neuanschlag derselben Note
// sofort wieder abgewürgt.
const rang = (e) => (e.art === 'meta' || e.art === 'sysex' || e.art === 'kanal' ? 0 : e.art === 'note_off' ? 1 : 2)

function spurSchreiben(ereignisse) {
  const sortiert = [...ereignisse].sort((a, b) => a.tick - b.tick || rang(a) - rang(b))
  const teile = []
  let letzter = 0
  for (const e of sortiert) {
    const tick = Math.max(0, Math.round(e.tick))
    teile.push(vlqSchreiben(Math.max(0, tick - letzter)))
    letzter = Math.max(letzter, tick)
    if (e.art === 'meta') {
      teile.push(Buffer.from([0xff, e.typ]), vlqSchreiben(e.daten.length), e.daten)
    } else if (e.art === 'sysex') {
      teile.push(Buffer.from([e.status]), vlqSchreiben(e.daten.length), e.daten)
    } else if (e.art === 'kanal') {
      teile.push(Buffer.from([e.status, ...e.daten]))
    } else if (e.art === 'note_on') {
      teile.push(Buffer.from([0x90 | e.kanal, e.note & 0x7f, klemme(Math.round(e.velocity), 1, 127)]))
    } else {
      teile.push(Buffer.from([0x80 | e.kanal, e.note & 0x7f, klemme(Math.round(e.velocity || 0), 0, 127)]))
    }
  }
  teile.push(Buffer.from([0x00, 0xff, 0x2f, 0x00])) // Spurende
  const inhalt = Buffer.concat(teile)
  return Buffer.concat([Buffer.from('MTrk', 'latin1'), kopfZahl(inhalt.length), inhalt])
}

function kopfZahl(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0)
  return b
}

/** Spuren wieder zu einer fertigen MIDI-Datei zusammenbauen. */
export function midiSchreiben({ format = 1, ppq = 480, spuren }) {
  const kopf = Buffer.alloc(14)
  kopf.write('MThd', 0, 'latin1')
  kopf.writeUInt32BE(6, 4)
  kopf.writeUInt16BE(spuren.length > 1 ? format || 1 : 0, 8)
  kopf.writeUInt16BE(spuren.length, 10)
  kopf.writeUInt16BE(ppq, 12)
  return Buffer.concat([kopf, ...spuren.map(spurSchreiben)])
}

// ────────────────────────────────────────────────────────────────────────────
// Takt und Tempo
// ────────────────────────────────────────────────────────────────────────────

/** Tempowechsel aus allen Spuren einsammeln, damit ms↔Ticks überall stimmt. */
function tempoKarte(spuren) {
  const punkte = []
  for (const spur of spuren)
    for (const e of spur)
      if (e.art === 'meta' && e.typ === 0x51 && e.daten.length === 3)
        punkte.push({ tick: e.tick, us: (e.daten[0] << 16) | (e.daten[1] << 8) | e.daten[2] })
  punkte.sort((a, b) => a.tick - b.tick)
  if (!punkte.length || punkte[0].tick > 0) punkte.unshift({ tick: 0, us: 500000 }) // 120 bpm
  return punkte
}

const usProViertel = (karte, tick) => {
  let us = karte[0].us
  for (const p of karte) if (p.tick <= tick) us = p.us
  return us
}

/** Wie viele Ticks sind eine Millisekunde — an genau dieser Stelle im Stück. */
function tickProMs(ppq, karte, tick) {
  return (ppq * 1000) / usProViertel(karte, tick)
}

/** Taktartwechsel einsammeln (Standard 4/4). */
function taktKarte(spuren, ppq) {
  const punkte = []
  for (const spur of spuren)
    for (const e of spur)
      if (e.art === 'meta' && e.typ === 0x58 && e.daten.length >= 2)
        punkte.push({ tick: e.tick, zaehler: e.daten[0], nenner: 2 ** e.daten[1] })
  punkte.sort((a, b) => a.tick - b.tick)
  if (!punkte.length || punkte[0].tick > 0) punkte.unshift({ tick: 0, zaehler: 4, nenner: 4 })
  return punkte.map((p) => ({
    ...p,
    ticksProSchlag: (ppq * 4) / p.nenner,
    ticksProTakt: ((ppq * 4) / p.nenner) * p.zaehler,
  }))
}

const taktBei = (karte, tick) => {
  let t = karte[0]
  for (const p of karte) if (p.tick <= tick) t = p
  return t
}

/**
 * Metrisches Gewicht einer Position: 1 = Takt-Eins, 0.2 = zwischen allen Rastern.
 * Danach richtet sich beides — wie stabil eine Note bleibt und wie laut sie wird.
 */
function gewicht(tick, takt, ppq) {
  const im = ((tick - takt.tick) % takt.ticksProTakt + takt.ticksProTakt) % takt.ticksProTakt
  const tol = Math.max(1, ppq / 32)
  const nah = (raster) => Math.min(im % raster, raster - (im % raster)) <= tol
  if (im <= tol || takt.ticksProTakt - im <= tol) return 1
  if (nah(takt.ticksProSchlag)) return 0.7
  if (nah(ppq / 2)) return 0.45
  if (nah(ppq / 4)) return 0.3
  return 0.2
}

// ────────────────────────────────────────────────────────────────────────────
// Noten aus Ereignissen und zurück
// ────────────────────────────────────────────────────────────────────────────

function notenSammeln(ereignisse, ppq) {
  const sortiert = [...ereignisse].sort((a, b) => a.tick - b.tick || rang(a) - rang(b))
  const offen = new Map()
  const noten = []
  const rest = []
  for (const e of sortiert) {
    if (e.art === 'note_on') {
      const schluessel = `${e.kanal}:${e.note}`
      const note = { start: e.tick, ende: null, kanal: e.kanal, note: e.note, velocity: e.velocity, aus: 0 }
      noten.push(note)
      if (!offen.has(schluessel)) offen.set(schluessel, [])
      offen.get(schluessel).push(note)
    } else if (e.art === 'note_off') {
      const liste = offen.get(`${e.kanal}:${e.note}`)
      const note = liste?.shift()
      if (note) {
        note.ende = e.tick
        note.aus = e.velocity
      }
    } else {
      rest.push(e)
    }
  }
  // Hängende Noten kommen in echten Exporten vor — lieber eine Achtel geben als
  // beim Schreiben eine Note ohne Ende zu erzeugen, die jeder Player anders deutet.
  for (const n of noten) if (n.ende == null || n.ende <= n.start) n.ende = n.start + ppq / 2
  return { noten, rest }
}

const zuEreignissen = (noten) =>
  noten.flatMap((n) => [
    { tick: n.start, art: 'note_on', kanal: n.kanal, note: n.note, velocity: n.velocity },
    { tick: n.ende, art: 'note_off', kanal: n.kanal, note: n.note, velocity: n.aus },
  ])

// ────────────────────────────────────────────────────────────────────────────
// Die Regler
// ────────────────────────────────────────────────────────────────────────────

export const VORLAGEN = {
  aus: { timing: 0, velocity: 0, swing: 0, spreizung: 0, laenge: 0 },
  subtil: { timing: 8, velocity: 6, swing: 0, spreizung: 8, laenge: 0.06, stabilitaet: 0.7, akzent: 0.18 },
  expressiv: { timing: 18, velocity: 14, swing: 0.35, spreizung: 15, laenge: 0.14, stabilitaet: 0.55, akzent: 0.28 },
  stark: { timing: 30, velocity: 24, swing: 0.5, spreizung: 22, laenge: 0.22, stabilitaet: 0.4, akzent: 0.35 },
}

const STANDARD = {
  timing: 10, // Streuung der Anschlagszeit in Millisekunden (1σ)
  velocity: 10, // Streuung der Anschlagstärke (1σ, MIDI-Einheiten)
  swing: 0, // 0 = gerade, 1 = volles Triolen-Feeling
  swingRaster: 8, // 8 = Achtel-Swing, 16 = Sechzehntel-Swing
  spreizung: 12, // Akkord-Spreizung in Millisekunden zwischen den Tönen
  spreizungAbwaerts: false, // Standard: von unten nach oben, wie eine Hand greift
  laenge: 0.1, // Streuung der Notenlänge als Anteil (0.1 = ±10 %)
  stabilitaet: 0.6, // Wie viel ruhiger die Eins bleibt als der Rest (0…1)
  akzent: 0.25, // Wie stark betonte Zählzeiten lauter werden
  kanaele: null, // null = alle, sonst Liste von MIDI-Kanälen (0-15)
  saat: undefined,
}

function regler(optionen = {}) {
  const vorlage = optionen.vorlage ? VORLAGEN[optionen.vorlage] : null
  if (optionen.vorlage && !vorlage)
    throw new Error(`Unbekannte Vorlage "${optionen.vorlage}". Möglich: ${Object.keys(VORLAGEN).join(', ')}.`)
  const p = { ...STANDARD, ...vorlage, ...Object.fromEntries(Object.entries(optionen).filter(([, v]) => v != null)) }
  return {
    ...p,
    timing: klemme(Number(p.timing) || 0, 0, 200),
    velocity: klemme(Number(p.velocity) || 0, 0, 64),
    swing: klemme(Number(p.swing) || 0, 0, 1),
    swingRaster: p.swingRaster === 16 ? 16 : 8,
    spreizung: klemme(Number(p.spreizung) || 0, 0, 120),
    laenge: klemme(Number(p.laenge) || 0, 0, 0.9),
    stabilitaet: klemme(Number(p.stabilitaet) ?? 0.6, 0, 1),
    akzent: klemme(Number(p.akzent) ?? 0.25, 0, 1),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Der Humanizer
// ────────────────────────────────────────────────────────────────────────────

/**
 * Starre Noten menschlich machen. Nimmt eine MIDI-Datei als Buffer,
 * gibt die veränderte Datei plus einen Bericht zurück.
 */
export function humanisieren(buf, optionen = {}) {
  const p = regler(optionen)
  const saat = Number.isFinite(p.saat) ? p.saat : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
  const rnd = zufallsQuelle(saat)
  const datei = midiLesen(buf)
  const { ppq, spuren } = datei
  const tempo = tempoKarte(spuren)
  const takte = taktKarte(spuren, ppq)
  const erlaubt = Array.isArray(p.kanaele) && p.kanaele.length ? new Set(p.kanaele.map(Number)) : null

  let bewegt = 0
  const verschiebungen = []
  const neueSpuren = spuren.map((ereignisse) => {
    const { noten, rest } = notenSammeln(ereignisse, ppq)
    const meine = erlaubt ? noten.filter((n) => erlaubt.has(n.kanal)) : noten
    const fremde = erlaubt ? noten.filter((n) => !erlaubt.has(n.kanal)) : []

    // Akkorde vorher bestimmen: nach dem Verrücken sind die gemeinsamen
    // Startzeiten weg, und man erkennt nicht mehr, was zusammen gehörte.
    const akkorde = new Map()
    for (const n of meine) {
      const schluessel = `${n.kanal}:${n.start}`
      if (!akkorde.has(schluessel)) akkorde.set(schluessel, [])
      akkorde.get(schluessel).push(n)
    }
    for (const gruppe of akkorde.values()) {
      gruppe.sort((a, b) => a.note - b.note)
      if (p.spreizungAbwaerts) gruppe.reverse()
    }

    for (const n of meine) {
      const takt = taktBei(takte, n.start)
      const g = gewicht(n.start, takt, ppq)
      const proMs = tickProMs(ppq, tempo, n.start)
      const laenge = n.ende - n.start
      let start = n.start

      // 1. Swing: jede zweite Unterteilung nach hinten. Voller Swing (1.0)
      //    entspricht dem Triolen-Verhältnis 2:1.
      if (p.swing > 0) {
        const einheit = p.swingRaster === 16 ? ppq / 4 : ppq / 2
        const stelle = Math.round((start - takt.tick) / einheit)
        if (Math.abs(start - takt.tick - stelle * einheit) <= ppq / 32 && Math.abs(stelle % 2) === 1)
          start += (p.swing * einheit) / 3
      }

      // 2. Timing-Streuung. Starke Zählzeiten bleiben ruhiger — genau das
      //    unterscheidet einen Menschen von reinem Rauschen auf allen Noten.
      if (p.timing > 0) start += gauss(rnd) * p.timing * (1 - p.stabilitaet * g) * proMs

      // 3. Akkord-Spreizung: die Finger treffen nie alle gleichzeitig.
      const gruppe = akkorde.get(`${n.kanal}:${n.start}`)
      if (p.spreizung > 0 && gruppe && gruppe.length > 1) start += gruppe.indexOf(n) * p.spreizung * proMs

      // 4. Anschlagstärke: erst der metrische Akzent, dann die Streuung.
      let v = n.velocity * (1 + p.akzent * (g - 0.5))
      if (p.velocity > 0) v += gauss(rnd) * p.velocity
      n.velocity = klemme(Math.round(v), 1, 127)

      // 5. Artikulation: mal etwas kürzer, mal etwas länger gehalten.
      const faktor = p.laenge > 0 ? 1 + gauss(rnd) * p.laenge : 1
      const neueLaenge = Math.max(1, Math.round(laenge * klemme(faktor, 0.4, 1.8)))

      const neuStart = Math.max(0, Math.round(start))
      verschiebungen.push((neuStart - n.start) / proMs)
      if (neuStart !== n.start) bewegt++
      n.start = neuStart
      n.ende = neuStart + neueLaenge
    }
    return [...rest, ...zuEreignissen([...meine, ...fremde])]
  })

  const gesamt = neueSpuren.reduce((s, sp) => s + sp.filter((e) => e.art === 'note_on').length, 0)
  return {
    datei: midiSchreiben({ ...datei, spuren: neueSpuren }),
    bericht: {
      noten: gesamt,
      bewegt,
      saat,
      regler: {
        timing: p.timing,
        velocity: p.velocity,
        swing: p.swing,
        spreizung: p.spreizung,
        laenge: p.laenge,
      },
      verschiebungMs: kennzahlen(verschiebungen),
    },
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Messen: wie menschlich ist das eigentlich?
// ────────────────────────────────────────────────────────────────────────────

function kennzahlen(werte) {
  if (!werte.length) return { anzahl: 0, mittel: 0, streuung: 0, min: 0, max: 0 }
  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length
  const streuung = Math.sqrt(werte.reduce((s, w) => s + (w - mittel) ** 2, 0) / werte.length)
  return {
    anzahl: werte.length,
    mittel: +mittel.toFixed(2),
    streuung: +streuung.toFixed(2),
    min: +Math.min(...werte).toFixed(2),
    max: +Math.max(...werte).toFixed(2),
  }
}

/**
 * Abweichung vom Raster und Verteilung der Anschlagstärke messen.
 * Damit lässt sich vorher/nachher vergleichen, ohne sich aufs Ohr zu verlassen.
 */
export function messen(buf) {
  const { ppq, spuren } = midiLesen(buf)
  const tempo = tempoKarte(spuren)
  const abweichungen = []
  const staerken = []
  const laengen = []
  const jeInstrument = new Map()
  for (const ereignisse of spuren) {
    const { noten } = notenSammeln(ereignisse, ppq)
    for (const n of noten) {
      const raster = ppq / 4 // Sechzehntel
      const rest = n.start % raster
      const abstand = Math.min(rest, raster - rest)
      abweichungen.push(abstand / tickProMs(ppq, tempo, n.start))
      staerken.push(n.velocity)
      laengen.push(n.ende - n.start)
      const schluessel = `${n.kanal}:${n.note}`
      if (!jeInstrument.has(schluessel)) jeInstrument.set(schluessel, [])
      jeInstrument.get(schluessel).push(n.velocity)
    }
  }
  const timing = kennzahlen(abweichungen)
  const velocity = kennzahlen(staerken)
  // Entscheidend ist die Streuung *innerhalb* eines Instruments. Über alle Noten
  // gerechnet sieht eine Spur schon "lebendig" aus, nur weil die Bassdrum lauter
  // ist als die Hi-Hat — dabei schlägt jede von beiden stur immer gleich zu.
  const gruppen = [...jeInstrument.values()].filter((g) => g.length > 1)
  const eigen = gruppen.length
    ? gruppen.reduce((s, g) => s + kennzahlen(g).streuung * g.length, 0) / gruppen.reduce((s, g) => s + g.length, 0)
    : velocity.streuung
  const anschlag = { ...velocity, stufen: new Set(staerken).size, jeInstrument: +eigen.toFixed(2) }
  return {
    ppq,
    bpm: +(60000000 / tempo[0].us).toFixed(1),
    noten: staerken.length,
    timing,
    velocity: anschlag,
    laenge: kennzahlen(laengen),
    urteil: urteilen(timing, anschlag),
  }
}

function urteilen(timing, velocity) {
  if (!timing.anzahl) return 'Keine Noten gefunden.'
  if (timing.mittel < 1 && velocity.jeInstrument < 1)
    return 'Maschinell: exakt auf dem Raster, jedes Instrument immer gleich laut.'
  const teile = []
  teile.push(
    timing.mittel < 3
      ? 'Timing fast exakt'
      : timing.mittel <= 25
        ? `Timing menschlich (∅ ${timing.mittel} ms neben dem Raster)`
        : `Timing sehr frei (∅ ${timing.mittel} ms) — kann schludrig wirken`,
  )
  teile.push(
    velocity.jeInstrument < 2
      ? 'Anschlag praktisch konstant'
      : `Anschlag lebendig (σ ${velocity.jeInstrument} je Instrument)`,
  )
  return teile.join(' · ')
}

// ────────────────────────────────────────────────────────────────────────────
// Testmuster
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ein absichtlich stocksteifer Schlagzeug-Loop zum Ausprobieren:
 * Bassdrum auf 1 und 3, Snare auf 2 und 4, Hi-Hat auf jeder Achtel,
 * alles exakt auf dem Raster und immer gleich laut.
 */
export function muster({ takte = 4, bpm = 100, ppq = 480 } = {}) {
  const us = Math.round(60000000 / klemme(Number(bpm) || 100, 20, 300))
  const kopf = [
    { tick: 0, art: 'meta', typ: 0x51, daten: Buffer.from([(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]) },
    { tick: 0, art: 'meta', typ: 0x58, daten: Buffer.from([4, 2, 24, 8]) },
    { tick: 0, art: 'meta', typ: 0x03, daten: Buffer.from('Dripprinter roh', 'latin1') },
  ]
  const noten = []
  const schlag = ppq
  const anzahl = klemme(Math.round(Number(takte) || 4), 1, 64)
  for (let t = 0; t < anzahl; t++) {
    const takt = t * schlag * 4
    for (const [pos, note, vel] of [
      [0, 36, 100],
      [2 * schlag, 36, 100],
      [schlag, 38, 100],
      [3 * schlag, 38, 100],
    ])
      noten.push({ start: takt + pos, ende: takt + pos + ppq / 8, kanal: 9, note, velocity: vel, aus: 0 })
    for (let a = 0; a < 8; a++)
      noten.push({ start: takt + (a * schlag) / 2, ende: takt + (a * schlag) / 2 + ppq / 8, kanal: 9, note: 42, velocity: 80, aus: 0 })
  }
  return midiSchreiben({ format: 0, ppq, spuren: [[...kopf, ...zuEreignissen(noten)]] })
}
