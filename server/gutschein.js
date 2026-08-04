// Gutscheine: keine Bezahlschranke, nur ein Dankeschön für Unterstützer.
//
// URAI bleibt komplett kostenlos und voll nutzbar ohne irgendetwas.
// Wer spendet oder einen Code von einem Freund bekommt, schaltet ein paar
// kosmetische Extras frei — mehr nicht. Kein Feature, das die eigentliche
// Arbeit von URAI einschränkt, hängt hinter einem Code.
import { loadConfig, saveConfig } from './config.js'

// Fest hinterlegte Codes. Das hier ist kein echtes Bezahlsystem — nur eine
// kleine Liste, die man an Freunde weitergeben kann. "lebenslang" läuft nie ab.
export const CODES = {
  'URAI-FREUNDE': { stufe: 'unterstuetzer', tage: 90, hinweis: 'Für Freunde, 90 Tage' },
  'URAI-DANKE': { stufe: 'unterstuetzer', tage: 30, hinweis: 'Kleines Dankeschön, 30 Tage' },
  'URAI-BETA': { stufe: 'lebenslang', tage: null, hinweis: 'Für frühe Tester — für immer' },
  'URAI-GRUENDER': { stufe: 'lebenslang', tage: null, hinweis: 'Gründer-Code — für immer' },
  'URAI-HERZ': { stufe: 'unterstuetzer', tage: 365, hinweis: 'Ein Jahr, mit Liebe' },
}

function normalisieren(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '')
}

/** Aktueller Stand: keine, zeitlich befristet, oder lebenslang. */
export function stand() {
  const c = loadConfig()
  if (c.unterstuetzerStufe === 'lebenslang') return { stufe: 'lebenslang', bis: null, aktiv: true }
  if (c.unterstuetzerStufe === 'unterstuetzer' && c.unterstuetzerBis > Date.now()) {
    return { stufe: 'unterstuetzer', bis: c.unterstuetzerBis, aktiv: true }
  }
  // Abgelaufen — leise zurückfallen, keine Fehlermeldung nötig
  if (c.unterstuetzerStufe === 'unterstuetzer' && c.unterstuetzerBis && c.unterstuetzerBis <= Date.now()) {
    saveConfig({ unterstuetzerStufe: 'keine', unterstuetzerBis: null })
  }
  return { stufe: 'keine', bis: null, aktiv: false }
}

/**
 * Einen Code einlösen. Ein Code kann mehrfach benutzt werden (er ist zum
 * Weitergeben da) — es gibt keine Konten, also keine Sperre pro Person.
 */
export function einloesen(codeRoh) {
  const code = normalisieren(codeRoh)
  const eintrag = CODES[code]
  if (!eintrag) throw new Error(`Unbekannter Code: "${codeRoh}".`)

  const jetzt = stand()
  if (eintrag.stufe === 'lebenslang') {
    saveConfig({ unterstuetzerStufe: 'lebenslang', unterstuetzerBis: null })
    return { stufe: 'lebenslang', hinweis: eintrag.hinweis }
  }

  // Läuft schon eine befristete Stufe, wird verlängert statt überschrieben
  const basis = jetzt.stufe === 'unterstuetzer' && jetzt.bis > Date.now() ? jetzt.bis : Date.now()
  const bis = basis + eintrag.tage * 24 * 3600_000
  saveConfig({ unterstuetzerStufe: 'unterstuetzer', unterstuetzerBis: bis })
  return { stufe: 'unterstuetzer', bis, hinweis: eintrag.hinweis }
}
