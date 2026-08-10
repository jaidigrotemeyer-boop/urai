// Skills: benanntes Können, das nur dann in den Kopf kommt, wenn es passt.
//
// Ein Skill ist eine Anleitung in Worten — worauf zu achten ist, welche Werkzeuge sich
// bewähren, welche Fallen es gibt. Er sagt NICHT, in welcher Reihenfolge etwas läuft.
// Das entscheidet das Gehirn, jedes Mal neu, je nach Lage.
//
// ABGRENZUNG ZU DEN ABLÄUFEN (server/ablauf.js): ein Ablauf ist ein fester Graph. Baustein 1,
// dann 2, dann 3, mit Kanten, Platzhaltern und Wellen — die Werkstatt führt ihn aus, das Gehirn
// darf dabei nicht abweichen. Genau das ist der Sinn: Wiederholbarkeit. Ein Skill ist das
// Gegenteil davon, nämlich Wissen und Haltung ohne Ausführung. Hier läuft nichts. Hier steht nur,
// was jemand wissen sollte, der die Aufgabe anfasst. Wer beim Lesen den Drang verspürt, hier
// Schritte auszuführen, Bedingungen zu prüfen oder Ergebnisse weiterzureichen, baut gerade eine
// zweite Werkstatt — das gehört nach ablauf.js.
//
// WARUM MARKDOWN UND NICHT DIE SQLITE-DATENBANK: ein Skill ist Text, den der Nutzer besitzen
// soll. Eine Datei kann er mit jedem Editor aufmachen, per Mail weitergeben, in seinen
// Obsidian-Vault legen oder in Git packen. Eine Zeile in urai.db kann er nur über URAI ansehen.
// Der Kopfteil ist bewusst dasselbe YAML-Frontmatter, das Obsidian versteht — damit die Datei
// dort keine Fremdkörper-Notiz ist, sondern eine ganz normale.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.js'

export const SKILL_DIR = path.join(DATA_DIR, 'skills')

// Nur diese Zeichen dürfen in einen Dateinamen. Absichtlich eng: der Name kommt aus einem
// Werkzeug, das das Gehirn aufruft, also aus einer Quelle, der man nicht trauen darf.
const KENNUNG = /^[a-z0-9][a-z0-9-]{0,47}$/

const MAX_KOPFZEILE = 200 // name und wann sind Einzeiler, keine Aufsätze
const MAX_TEXT = 20_000

/** Fehler mit Code, damit die REST-Wege 404 von 400 unterscheiden können. */
class SkillFehler extends Error {
  constructor(code, text) {
    super(text)
    this.code = code
  }
}

/**
 * Aus einem Namen eine Kennung machen: "Rechnungen prüfen" → "rechnungen-pruefen".
 *
 * Umlaute werden ausgeschrieben statt weggeworfen, sonst hieße der Skill "rechnungen-prfen".
 * Alles andere, was kein a-z0-9 ist, wird zum Bindestrich — und damit verliert auch ein Name
 * wie "../../etc/passwd" seine Schrägstriche und Punkte, bevor er je einen Dateinamen berührt.
 */
export function idAus(roh) {
  const s = String(roh ?? '')
    // Erst zusammensetzen: macOS reicht "ä" gern als a+Pünktchen weiter, und dann würde die
    // Umlaut-Zeile unten daneben greifen und aus "prüfen" ein "prufen" machen.
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD') // é → e + Akzent, damit die nächste Zeile den Akzent wegräumt
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '') // falls slice mitten in einen Bindestrich-Rest schneidet
  if (!s) throw new SkillFehler('UNGUELTIG', `Aus "${String(roh).slice(0, 40)}" lässt sich kein Skill-Name bilden.`)
  return s
}

/**
 * Weg zur Datei. Gürtel UND Hosenträger: die Kennung wird auf das erlaubte Alphabet geprüft,
 * und danach muss der fertige Weg immer noch direkt in data/skills/ liegen. Die zweite Prüfung
 * ist scheinbar überflüssig — sie bleibt trotzdem stehen, weil sie den Tag rettet, an dem
 * jemand das Alphabet oben großzügiger macht.
 */
function dateiVon(id) {
  const k = String(id ?? '')
  if (!KENNUNG.test(k)) {
    throw new SkillFehler('UNGUELTIG', `Ungültige Skill-Kennung "${k.slice(0, 40)}". Erlaubt: a-z, 0-9 und -.`)
  }
  const datei = path.resolve(SKILL_DIR, `${k}.md`)
  if (path.dirname(datei) !== path.resolve(SKILL_DIR)) {
    throw new SkillFehler('UNGUELTIG', `Skill-Kennung "${k.slice(0, 40)}" führt aus dem Skill-Ordner heraus.`)
  }
  return datei
}

/** Einzeiler fürs Frontmatter: Zeilenumbrüche würden den Kopf zerreißen. */
function zeile(wert, max = MAX_KOPFZEILE) {
  return String(wert ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max)
}

/** YAML mag Doppelpunkte und Klammern am Wertanfang nicht — dann in Anführungszeichen. */
function feld(wert) {
  const w = zeile(wert)
  return /[:#]/.test(w) || /^["'[{]/.test(w) ? `"${w.replace(/"/g, "'")}"` : w
}

const KOPF = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/

/**
 * Datei in Kopf und Anleitung zerlegen. Gibt null zurück, wenn der Kopf fehlt oder keinen
 * Namen hat — der Aufrufer überspringt die Datei dann. Nicht werfen: eine einzige von Hand
 * verhunzte Datei darf nicht die ganze Skill-Liste unbrauchbar machen.
 */
function zerlegen(roh) {
  const treffer = KOPF.exec(String(roh ?? ''))
  if (!treffer) return null
  const kopf = {}
  for (const z of treffer[1].split(/\r?\n/)) {
    const i = z.indexOf(':')
    if (i < 1) continue
    let wert = z.slice(i + 1).trim()
    const auf = wert[0]
    if (wert.length >= 2 && (auf === '"' || auf === "'") && wert.endsWith(auf)) wert = wert.slice(1, -1)
    kopf[z.slice(0, i).trim().toLowerCase()] = wert
  }
  if (!kopf.name) return null
  return { name: kopf.name, wann: kopf.wann || '', text: roh.slice(treffer[0].length).trim() }
}

function bauen({ name, wann, text }) {
  return `---\nname: ${feld(name)}\nwann: ${feld(wann)}\n---\n\n${String(text).trim()}\n`
}

// ═════════════════════════════════════════════════════════════════════
// ABLEGEN UND HOLEN
// ═════════════════════════════════════════════════════════════════════

/**
 * Den Ordner anlegen, falls es ihn noch nicht gibt — und beim allerersten Mal zwei Beispiele
 * hineinlegen. Die Beispiele kommen NUR mit dem frischen Ordner: löscht der Nutzer einen davon,
 * bleibt er gelöscht. Sonst kämen sie bei jedem Start zurück, und das wäre nur lästig.
 */
function ordnerSicherstellen() {
  if (fs.existsSync(SKILL_DIR)) return
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  for (const b of BEISPIELE) {
    try {
      fs.writeFileSync(path.join(SKILL_DIR, `${b.id}.md`), bauen(b))
    } catch {}
  }
}

/** @returns {Array<{id, name, wann, geaendert}>} — ohne den Anleitungstext, der ist zu lang. */
export function skillListe() {
  ordnerSicherstellen()
  let namen = []
  try {
    namen = fs.readdirSync(SKILL_DIR)
  } catch {
    return []
  }
  const raus = []
  for (const n of namen) {
    if (n.startsWith('.') || !n.endsWith('.md')) continue
    try {
      const skill = zerlegen(fs.readFileSync(path.join(SKILL_DIR, n), 'utf8'))
      if (!skill) continue // kaputter Kopf: diese eine Datei überspringen, Liste steht weiter
      raus.push({
        id: path.basename(n, '.md'),
        name: skill.name,
        wann: skill.wann,
        // Kein "geaendert" im Kopf: der Nutzer bearbeitet die Datei von Hand, und dann wäre
        // so ein Feld sofort gelogen. Die Uhrzeit der Datei stimmt immer.
        geaendert: fs.statSync(path.join(SKILL_DIR, n)).mtime.toISOString(),
      })
    } catch {}
  }
  return raus.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** @returns {{id, name, wann, text}} wirft KEIN_SKILL */
export function skillLesen(id) {
  const kennung = idAus(id)
  let roh
  try {
    roh = fs.readFileSync(dateiVon(kennung), 'utf8')
  } catch {
    throw new SkillFehler('KEIN_SKILL', `Skill "${kennung}" gibt es nicht.`)
  }
  const skill = zerlegen(roh)
  if (!skill) {
    throw new SkillFehler('UNGUELTIG', `Skill "${kennung}" hat keinen lesbaren Kopfteil (--- name: … ---).`)
  }
  return { id: kennung, ...skill }
}

/** Anlegen oder überschreiben. Kennung kommt aus dem Namen, wenn keine mitgegeben wird. */
export function skillSchreiben({ id, name, wann, text } = {}) {
  const titel = zeile(name)
  if (!titel) throw new SkillFehler('UNGUELTIG', 'Ein Skill braucht einen Namen.')
  const anleitung = String(text ?? '').trim()
  if (!anleitung) throw new SkillFehler('UNGUELTIG', 'Ein Skill ohne Anleitung nützt niemandem.')

  const kennung = idAus(id || titel)
  const datei = dateiVon(kennung)
  ordnerSicherstellen()
  const neu = !fs.existsSync(datei)
  fs.writeFileSync(datei, bauen({ name: titel, wann, text: anleitung.slice(0, MAX_TEXT) }))
  return { id: kennung, name: titel, wann: zeile(wann), text: anleitung.slice(0, MAX_TEXT), neu }
}

export function skillLoeschen(id) {
  try {
    fs.unlinkSync(dateiVon(idAus(id)))
    return true
  } catch {
    return false
  }
}

/**
 * Der Zusatz für den Systemprompt: NUR Name und "wann", nie der volle Text.
 *
 * Das ist der ganze Witz an der Sache. Zehn Skills mit vollem Text wären zehn Anleitungen im
 * Kopf, von denen neun nicht zur Aufgabe passen — genau die Kontext-Verschwendung, die das
 * System vermeiden soll. Also steht hier nur der Zettel am Regal, und das Gehirn holt sich
 * das Buch, wenn es passt.
 *
 * Absichtlich synchron: der Prompt entsteht im Agent-Konstruktor, und der ist synchron.
 * Ein paar Kilobyte Markdown zu lesen kostet weniger, als den Konstruktor umzubauen.
 *
 * @returns {string} leer, wenn es keine Skills gibt — ein leerer Abschnitt ist nur Rauschen.
 */
export function skillHinweis() {
  let liste = []
  try {
    liste = skillListe()
  } catch {
    return ''
  }
  if (!liste.length) return ''
  return [
    'Deine Skills — Anleitungen für wiederkehrende Aufgaben, die du dir gemerkt hast:',
    ...liste.map((s) => `- ${s.id} · ${s.name}${s.wann ? ` — wann: ${s.wann}` : ''}`),
    '',
    'Passt eine dieser Beschreibungen zur Aufgabe, hol dir zuerst die volle Anleitung mit',
    'skill_lesen und arbeite danach. Passt keine, vergiss die Liste — sie ist kein Auftrag.',
    'Sagt der Nutzer "merk dir, wie das geht" oder erklärt er dir etwas ausführlich: leg es',
    'mit skill_schreiben ab, dann muss er es beim nächsten Mal nicht wiederholen.',
  ].join('\n')
}

// ═════════════════════════════════════════════════════════════════════
// BEISPIELE
// Zwei Stück beim ersten Start — damit der Nutzer an etwas Echtem sieht, wofür das gut ist,
// statt vor einem leeren Ordner zu stehen. Das zweite zeigt bewusst, wie URAIs eigene
// Werkzeuge ineinandergreifen.
// ═════════════════════════════════════════════════════════════════════

const BEISPIELE = [
  {
    id: 'rechnungen-pruefen',
    name: 'Rechnungen prüfen',
    wann: 'Wenn es um Rechnungen, Belege, Mahnungen oder Zahlungseingänge geht',
    text: `Worauf es ankommt, in dieser Reihenfolge der Wichtigkeit:

1. **Stimmt der Betrag?** Netto, Steuersatz und Brutto einzeln nachrechnen. Rechnungen mit
   mehreren Posten stimmen erstaunlich oft in der Summe nicht — meist eine Rundung pro Zeile
   statt einer am Ende.
2. **Steht alles drauf, was draufstehen muss?** Rechnungsnummer, Datum, Leistungszeitraum,
   vollständige Anschrift beider Seiten, Steuernummer oder USt-IdNr. Fehlt eins davon, ist die
   Rechnung nicht abzugsfähig — das ist der teuerste Fehler von allen.
3. **Ist die Leistung wirklich erbracht?** Gegen Lieferschein, Kalender oder Auftrag halten.
4. **Wann ist sie fällig?** Skonto-Frist getrennt vom Zahlungsziel notieren.

Fallen, in die man wirklich tappt:
- Bei Beträgen aus einem Bildschirmfoto: die Zahl noch einmal lesen, bevor du sie
  weiterverwendest. Erkannter Text verwechselt 0 und 8, 1 und 7, und ein verlorener Punkt macht
  aus 1.250,00 gleich 125000.
- Reverse Charge und Kleinunternehmer nach §19: da steht absichtlich keine Steuer drauf. Das
  ist kein Fehler in der Rechnung.
- Doppelte Rechnungsnummern desselben Absenders sind ein Warnzeichen, keine Schlamperei.
- Eine geänderte Bankverbindung im Anhang einer Mail ist der häufigste Betrugsversuch
  überhaupt. Niemals ungeprüft übernehmen, immer über eine bekannte Nummer rückfragen.

Was du NICHT tust: Zahlungen auslösen. Du bereitest alles vor und sagst am Ende in einem Satz,
was noch am Nutzer hängt.`,
  },
  {
    id: 'recherche-ablegen',
    name: 'Recherche sauber ablegen',
    wann: 'Wenn du etwas im Netz nachschlägst und das Ergebnis auch morgen noch da sein soll',
    text: `Eine Recherche, die nur in der Antwort steht, ist morgen weg. So bleibt sie:

**Erst breit, dann tief.** \`web_search\` mit der Frage des Nutzers, dann die zwei oder drei
Treffer, die wirklich etwas hergeben, einzeln mit \`web_fetch\` aufmachen. Die Zusammenfassung
in der Trefferliste reicht nie — sie ist Werbung für die Seite, nicht ihr Inhalt.

**Vorher nachsehen, ob es das schon gibt.** \`obsidian_search\` und \`memory_search\` mit den
Kernbegriffen, bevor du losläufst. Oft hat der Nutzer die Frage schon mal gestellt, und dann
ergänzt du die alte Notiz statt eine zweite anzulegen.

**Dann ablegen.** \`obsidian_write\` mit einem Titel, den man in einem halben Jahr wiederfindet
— also "Preisvergleich Backup-Dienste 2026", nicht "Recherche". Im Text jede Aussage mit ihrer
Quelle als Link. Ohne Quelle ist es keine Recherche, sondern eine Behauptung.

**Zum Schluss der eine Satz fürs Gedächtnis.** \`memory_save\` bekommt nicht die Recherche,
sondern das Ergebnis: "Nutzer hat sich für Backblaze entschieden, Preisvergleich liegt in
Obsidian." Das ist der Faden, an dem du das Ganze später wieder hervorziehst.

Fallen:
- Bezahlschranken liefern eine freundliche Seite ohne Inhalt zurück. Kommen unter 500 Zeichen
  an, ist das kein Artikel — such eine andere Quelle, statt aus der Anreißerzeile zu schließen.
- Jahreszahlen prüfen. Der erste Treffer ist oft der meistverlinkte, nicht der neueste.
- Widersprechen sich zwei Quellen, schreib beide hin. Sich stillschweigend für eine zu
  entscheiden ist die schlechteste aller Möglichkeiten.`,
  },
]

// ═════════════════════════════════════════════════════════════════════
// WERKZEUGE
// Lesen ist harmlos, Schreiben und Löschen nicht: mit skill_schreiben ändert URAI die
// Anleitung, nach der es sich beim nächsten Mal selbst richtet. Das fragt vorher.
// ═════════════════════════════════════════════════════════════════════

export const skillTools = [
  {
    name: 'skill_liste',
    description: 'Zeigt alle Skills mit Namen und wann sie passen. Ohne die Anleitung selbst.',
    parameters: { type: 'object', properties: {} },
    async run() {
      const liste = skillListe()
      if (!liste.length) return 'Noch keine Skills. Mit skill_schreiben einen anlegen.'
      return liste.map((s) => `- ${s.id} · ${s.name}${s.wann ? ` — wann: ${s.wann}` : ''}`).join('\n')
    },
  },
  {
    name: 'skill_lesen',
    description: 'Holt die volle Anleitung eines Skills. Nimm das, sobald ein Skill zur Aufgabe passt.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Kennung oder Name des Skills' } },
      required: ['id'],
    },
    async run({ id }) {
      try {
        const s = skillLesen(id)
        return `${s.name}\n(passt: ${s.wann || 'ohne Angabe'})\n\n${s.text}`
      } catch (err) {
        return `${err.message} Mit skill_liste nachsehen, welche es gibt.`
      }
    },
  },
  {
    name: 'skill_schreiben',
    description:
      'Einen Skill anlegen oder ändern: eine Anleitung, die du beim nächsten Mal wiederfindest. ' +
      'Nimm das, wenn der Nutzer sagt "merk dir, wie das geht" oder dir etwas ausführlich erklärt.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Sprechender Name, z.B. "Rechnungen prüfen"' },
        wann: { type: 'string', description: 'In einem Satz: bei welcher Art Aufgabe der Skill passt' },
        text: { type: 'string', description: 'Die Anleitung: worauf achten, welche Werkzeuge, welche Fallen' },
        id: { type: 'string', description: 'Nur nötig, um einen bestehenden Skill gezielt zu überschreiben' },
      },
      required: ['name', 'wann', 'text'],
    },
    danger: true,
    async run({ id, name, wann, text }) {
      try {
        const s = skillSchreiben({ id, name, wann, text })
        return `Skill "${s.name}" (${s.id}) ${s.neu ? 'angelegt' : 'überschrieben'}. Liegt als data/skills/${s.id}.md.`
      } catch (err) {
        return `Skill NICHT gespeichert: ${err.message}`
      }
    },
  },
  {
    name: 'skill_loeschen',
    description: 'Einen Skill wegwerfen.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Kennung oder Name des Skills' } },
      required: ['id'],
    },
    danger: true,
    async run({ id }) {
      try {
        return skillLoeschen(id) ? `Skill "${idAus(id)}" gelöscht.` : `Skill "${id}" gibt es nicht.`
      } catch (err) {
        return `Nicht gelöscht: ${err.message}`
      }
    },
  },
]
