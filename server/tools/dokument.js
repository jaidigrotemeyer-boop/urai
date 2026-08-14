// Kraft: echte Office-Dateien. .docx und .pptx sind nur ZIP-Archive voller XML —
// darum reicht das Bordmittel "zip", kein Zusatzpaket.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadConfig } from '../config.js'

const pexec = promisify(execFile)

// Gleiche Wache wie in files.js: nichts wird außerhalb vom Revier angefasst.
function resolve(p) {
  // Ohne diese Prüfung stürzt ein fehlerhafter Werkzeug-Aufruf (leerer, fehlender
  // oder falsch typisierter pfad) mit einer rohen TypeError ab statt einer Meldung.
  if (typeof p !== 'string' || !p.trim()) throw new Error('pfad fehlt oder ist kein Text.')
  const c = loadConfig()
  const abs = path.resolve(p.startsWith('~') ? p.replace(/^~/, process.env.HOME) : p)
  const root = path.resolve(c.workspace || process.env.HOME)
  // path.relative statt Präfix-Vergleich: sonst käme entweder ein Nachbarordner
  // mit gleichem Anfang durch (Revier "Kunde" hätte "KundeArchiv" erlaubt) oder,
  // falls das Revier "/" selbst ist, der doppelte Trenner "//" würde fast alles
  // aussperren.
  const rel = path.relative(root, abs)
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`Weg liegt außerhalb vom Revier (${root}): ${abs}`)
  }
  return abs
}

function endung(p, ext) {
  return p.toLowerCase().endsWith(ext) ? p : p + ext
}

// Steuerzeichen sind in XML 1.0 schlicht verboten — Word und PowerPoint
// verweigern die Datei komplett, statt sie zu reparieren.
function esc(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function beziehungen(liste) {
  const zeilen = liste
    .map((r) => `<Relationship Id="${r.id}" Type="${r.typ}" Target="${r.ziel}"/>`)
    .join('')
  return `${KOPF}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${zeilen}</Relationships>`
}

function kerndaten(titel) {
  const jetzt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return (
    `${KOPF}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"` +
    ` xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(titel)}</dc:title><dc:creator>URAI</dc:creator>` +
    `<cp:lastModifiedBy>URAI</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${jetzt}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${jetzt}</dcterms:modified>` +
    `</cp:coreProperties>`
  )
}

// Alle XML-Teile in einen Wegwerf-Ordner legen und daraus das Archiv bauen.
async function packe(teile, ziel) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'urai-dok-'))
  try {
    for (const [name, inhalt] of Object.entries(teile)) {
      const datei = path.join(tmp, name)
      await fs.mkdir(path.dirname(datei), { recursive: true })
      await fs.writeFile(datei, inhalt, 'utf8')
    }
    await fs.mkdir(path.dirname(ziel), { recursive: true })
    // zip hängt an ein vorhandenes Archiv an, statt es zu ersetzen —
    // ohne das Löschen bliebe der alte Inhalt drin und die Datei wäre kaputt.
    await fs.rm(ziel, { force: true })
    try {
      await pexec('zip', ['-X', '-q', '-r', ziel, '.'], { cwd: tmp })
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('Das Programm "zip" fehlt auf diesem Rechner.')
      throw new Error(`zip ist gescheitert: ${e.stderr || e.message}`)
    }
    return (await fs.stat(ziel)).size
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

// ── Word ────────────────────────────────────────────────────────────────

// Zeilenumbrüche im Absatz werden zu <w:br/> — sonst klebt alles aneinander.
function wordLauf(text, rPr = '') {
  const stuecke = esc(text)
    .split('\n')
    .map((z, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${z}</w:t>`)
    .join('')
  return `<w:r>${rPr}${stuecke}</w:r>`
}

function docxTeile(titel, absaetze) {
  const kopfzeile =
    `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr>` +
    `${wordLauf(titel, '<w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr>')}</w:p>`
  const rumpf = absaetze
    .map(
      (a) =>
        `<w:p><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>${wordLauf(a)}</w:p>`
    )
    .join('')
  // A4 in Twips (1/1440 Zoll), Rand rundum 2,5 cm.
  const seite =
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr>`

  return {
    '[Content_Types].xml':
      `${KOPF}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `</Types>`,
    '_rels/.rels': beziehungen([
      { id: 'rId1', typ: `${NS_REL}/officeDocument`, ziel: 'word/document.xml' },
      {
        id: 'rId2',
        typ: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
        ziel: 'docProps/core.xml',
      },
    ]),
    'docProps/core.xml': kerndaten(titel),
    'word/document.xml':
      `${KOPF}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${kopfzeile}${rumpf}${seite}</w:body></w:document>`,
    'word/_rels/document.xml.rels': beziehungen([]),
  }
}

// ── PowerPoint ──────────────────────────────────────────────────────────

// 16:9 in EMU (914400 pro Zoll).
const FOLIE_B = 12192000
const FOLIE_H = 6858000

const PPT_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
  ` xmlns:r="${NS_REL}"` +
  ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

const LEERER_BAUM =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

// Das Muster braucht ein Design, sonst weiß PowerPoint bei keiner Farbe, was gemeint ist.
const THEMA =
  `${KOPF}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="URAI">` +
  '<a:themeElements><a:clrScheme name="URAI">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
  '</a:clrScheme><a:fontScheme name="URAI">' +
  '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
  '</a:fontScheme><a:fmtScheme name="URAI">' +
  // Die drei Listen sind Pflicht und müssen je drei Einträge haben.
  '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst>' +
  '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '</a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
  '</a:fmtScheme></a:themeElements></a:theme>'

// Weiß wird ausdrücklich gesetzt: ohne Hintergrund raten die Betrachter,
// und die Vorschau von macOS malt dann grau.
const HINTERGRUND =
  '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'

const MUSTER =
  `${KOPF}<p:sldMaster ${PPT_NS}><p:cSld>${HINTERGRUND}${LEERER_BAUM}</p:spTree></p:cSld>` +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"' +
  ' accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"' +
  ' hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  '<p:txStyles>' +
  '<p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3200" b="1"/></a:lvl1pPr></p:titleStyle>' +
  '<p:bodyStyle><a:lvl1pPr marL="285750" indent="-285750"><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle>' +
  '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>' +
  '</p:txStyles></p:sldMaster>'

// Leeres Layout: die Kästen setzt jede Folie selbst, das spart Platzhalter-Gefummel.
const LAYOUT =
  `${KOPF}<p:sldLayout ${PPT_NS} type="blank" preserve="1">` +
  `<p:cSld name="Leer">${LEERER_BAUM}</p:spTree></p:cSld>` +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'

function kasten(id, name, x, y, cx, cy, absaetze) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    `<p:txBody><a:bodyPr wrap="square" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${absaetze}</p:txBody></p:sp>`
  )
}

function folieXml(f) {
  const titel =
    '<a:p><a:pPr/><a:r><a:rPr lang="de-DE" sz="3200" b="1" dirty="0"/>' +
    `<a:t>${esc(f.titel)}</a:t></a:r></a:p>`
  const punkte = f.punkte
    .map(
      (p) =>
        '<a:p><a:pPr marL="285750" indent="-285750"><a:spcBef><a:spcPts val="600"/></a:spcBef>' +
        '<a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>' +
        `<a:r><a:rPr lang="de-DE" sz="2000" dirty="0"/><a:t>${esc(p)}</a:t></a:r></a:p>`
    )
    .join('')
  // Ohne mindestens einen Absatz ist ein Textkasten ungültig.
  const rumpf = punkte || '<a:p><a:endParaRPr lang="de-DE"/></a:p>'
  return (
    `${KOPF}<p:sld ${PPT_NS}><p:cSld>${LEERER_BAUM}` +
    kasten(2, 'Titel', 838200, 685800, 10515600, 1325563, titel) +
    kasten(3, 'Inhalt', 838200, 2130425, 10515600, 3859213, rumpf) +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  )
}

function pptxTeile(titel, folien) {
  const nr = folien.map((_, i) => i + 1)
  const teile = {
    '[Content_Types].xml':
      `${KOPF}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      nr
        .map(
          (n) =>
            `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
        )
        .join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>',
    '_rels/.rels': beziehungen([
      { id: 'rId1', typ: `${NS_REL}/officeDocument`, ziel: 'ppt/presentation.xml' },
      {
        id: 'rId2',
        typ: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
        ziel: 'docProps/core.xml',
      },
    ]),
    'docProps/core.xml': kerndaten(titel),
    'ppt/presentation.xml':
      `${KOPF}<p:presentation ${PPT_NS} saveSubsetFonts="1">` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:sldIdLst>${nr.map((n) => `<p:sldId id="${255 + n}" r:id="rId${n + 1}"/>`).join('')}</p:sldIdLst>` +
      `<p:sldSz cx="${FOLIE_B}" cy="${FOLIE_H}"/><p:notesSz cx="6858000" cy="9144000"/>` +
      '</p:presentation>',
    'ppt/_rels/presentation.xml.rels': beziehungen([
      { id: 'rId1', typ: `${NS_REL}/slideMaster`, ziel: 'slideMasters/slideMaster1.xml' },
      ...nr.map((n) => ({ id: `rId${n + 1}`, typ: `${NS_REL}/slide`, ziel: `slides/slide${n}.xml` })),
      { id: `rId${nr.length + 2}`, typ: `${NS_REL}/theme`, ziel: 'theme/theme1.xml' },
    ]),
    'ppt/slideMasters/slideMaster1.xml': MUSTER,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': beziehungen([
      { id: 'rId1', typ: `${NS_REL}/slideLayout`, ziel: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', typ: `${NS_REL}/theme`, ziel: '../theme/theme1.xml' },
    ]),
    'ppt/slideLayouts/slideLayout1.xml': LAYOUT,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': beziehungen([
      { id: 'rId1', typ: `${NS_REL}/slideMaster`, ziel: '../slideMasters/slideMaster1.xml' },
    ]),
    'ppt/theme/theme1.xml': THEMA,
  }
  for (const n of nr) {
    teile[`ppt/slides/slide${n}.xml`] = folieXml(folien[n - 1])
    teile[`ppt/slides/_rels/slide${n}.xml.rels`] = beziehungen([
      { id: 'rId1', typ: `${NS_REL}/slideLayout`, ziel: '../slideLayouts/slideLayout1.xml' },
    ])
  }
  return teile
}

// ── Excel ───────────────────────────────────────────────────────────────

const XL_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

// Bijektive 26er-Zählung: nach Z kommt AA und nicht BA. Der klassische Patzer
// ist ein Modulo ohne das -1 — dann fehlt die Spalte Z und alles verrutscht.
function spalte(n) {
  let s = ''
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Der Typ entscheidet, ob Excel rechnen darf: eine Zahl muss sich summieren
// lassen, ein Text darf nicht heimlich umgedeutet werden.
function zellwert(roh) {
  if (roh === null || roh === undefined) return null
  if (typeof roh === 'boolean') return { typ: 'b', wert: roh ? 1 : 0 }
  if (typeof roh === 'number')
    return Number.isFinite(roh) ? { typ: 'n', wert: String(roh) } : { typ: 's', wert: String(roh) }
  const s = String(roh)
  if (s === '') return null
  // Zahlen kommen vom Modell fast immer als Text an. Führende Nullen und sehr
  // lange Ziffernfolgen bleiben Text — Postleitzahl und Telefonnummer sind
  // keine Zahlen, und ab 16 Stellen rundet Excel stillschweigend.
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) && s.replace(/\D/g, '').length <= 15) return { typ: 'n', wert: s }
  return { typ: 's', wert: s }
}

// Excel verbietet diese Zeichen im Reiternamen und kappt bei 31 Zeichen;
// doppelte Namen lehnt es beim Öffnen komplett ab.
function blattname(roh, i, belegt) {
  let name = String(roh ?? '')
    .replace(/[:\\\/?*\[\]]/g, ' ')
    .trim()
    .slice(0, 31)
  if (!name) name = `Tabelle${i + 1}`
  let kandidat = name
  let z = 2
  while (belegt.has(kandidat.toLowerCase())) kandidat = `${name.slice(0, 28)} ${z++}`
  belegt.add(kandidat.toLowerCase())
  return kandidat
}

function blattXml(zeilen, kopfzeile) {
  let maxSp = 0
  const breiten = []
  const reihen = zeilen
    .map((zeile, r) => {
      const nr = r + 1
      // s="1" zieht die zweite Schrift aus styles.xml — nur für die Kopfzeile.
      const stil = kopfzeile && r === 0 ? ' s="1"' : ''
      if (zeile.length > maxSp) maxSp = zeile.length
      const zellen = zeile
        .map((roh, c) => {
          const w = zellwert(roh)
          // Leere Zellen weglassen: eine fehlende Zelle ist gültig, eine leere
          // <c/> ohne Wert macht manche Betrachter nervös.
          if (!w) return ''
          const ref = `${spalte(c + 1)}${nr}`
          const laenge = String(w.wert).split('\n')[0].length
          if (laenge > (breiten[c] || 0)) breiten[c] = laenge
          if (w.typ === 's')
            return `<c r="${ref}"${stil} t="inlineStr"><is><t xml:space="preserve">${esc(w.wert)}</t></is></c>`
          if (w.typ === 'b') return `<c r="${ref}"${stil} t="b"><v>${w.wert}</v></c>`
          return `<c r="${ref}"${stil}><v>${w.wert}</v></c>`
        })
        .join('')
      return zellen ? `<row r="${nr}">${zellen}</row>` : ''
    })
    .join('')

  const ecke = maxSp ? `${spalte(maxSp)}${zeilen.length}` : 'A1'
  const spalten = maxSp
    ? `<cols>${Array.from({ length: maxSp }, (_, i) => {
        // Ohne customWidth stehen alle Spalten auf 8,43 und jeder längere Text
        // ist abgeschnitten. Grob nach Inhalt schätzen ist besser als nichts.
        const b = Math.min(60, Math.max(9, (breiten[i] || 0) + 2))
        return `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`
      }).join('')}</cols>`
    : ''
  // Kopfzeile festfrieren, damit sie beim Scrollen stehen bleibt.
  const sicht =
    kopfzeile && zeilen.length > 1
      ? '<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'

  // Die Reihenfolge der Kinder ist im Schema festgelegt: dimension, sheetViews,
  // sheetFormatPr, cols, sheetData. Vertauscht lehnt Excel die Datei ab.
  return (
    `${KOPF}<worksheet xmlns="${XL_NS}">` +
    `<dimension ref="A1:${ecke}"/>${sicht}` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `${spalten}<sheetData>${reihen}</sheetData></worksheet>`
  )
}

// Zwei Schriften, zwei Formate: 0 ist normal, 1 ist fett. Mehr braucht das
// Blatt nicht, aber die leeren Pflichtlisten müssen trotzdem alle da sein.
const XL_STIL =
  `${KOPF}<styleSheet xmlns="${XL_NS}">` +
  '<fonts count="2">' +
  '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

// app.xml ist bei .xlsx anders als bei .docx nicht bloß Zierde: Excel liest
// hier die Blattnamen für die Übersicht.
function anwendungsdaten(namen) {
  return (
    `${KOPF}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"` +
    ` xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    '<Application>URAI</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
    '<HeadingPairs><vt:vector size="2" baseType="variant">' +
    '<vt:variant><vt:lpstr>Arbeitsblätter</vt:lpstr></vt:variant>' +
    `<vt:variant><vt:i4>${namen.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="${namen.length}" baseType="lpstr">` +
    namen.map((n) => `<vt:lpstr>${esc(n)}</vt:lpstr>`).join('') +
    '</vt:vector></TitlesOfParts>' +
    '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc>' +
    '<HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>'
  )
}

function xlsxTeile(titel, blaetter, kopfzeile) {
  const nr = blaetter.map((_, i) => i + 1)
  const teile = {
    '[Content_Types].xml':
      `${KOPF}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      nr
        .map(
          (n) =>
            `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>',
    '_rels/.rels': beziehungen([
      { id: 'rId1', typ: `${NS_REL}/officeDocument`, ziel: 'xl/workbook.xml' },
      {
        id: 'rId2',
        typ: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
        ziel: 'docProps/core.xml',
      },
      { id: 'rId3', typ: `${NS_REL}/extended-properties`, ziel: 'docProps/app.xml' },
    ]),
    'docProps/core.xml': kerndaten(titel),
    'docProps/app.xml': anwendungsdaten(blaetter.map((b) => b.name)),
    'xl/workbook.xml':
      `${KOPF}<workbook xmlns="${XL_NS}" xmlns:r="${NS_REL}">` +
      '<workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="14000"/></bookViews>' +
      `<sheets>${blaetter
        .map((b, i) => `<sheet name="${esc(b.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': beziehungen([
      ...nr.map((n) => ({
        id: `rId${n}`,
        typ: `${NS_REL}/worksheet`,
        ziel: `worksheets/sheet${n}.xml`,
      })),
      { id: `rId${nr.length + 1}`, typ: `${NS_REL}/styles`, ziel: 'styles.xml' },
    ]),
    'xl/styles.xml': XL_STIL,
  }
  for (const n of nr) teile[`xl/worksheets/sheet${n}.xml`] = blattXml(blaetter[n - 1].zeilen, kopfzeile)
  return teile
}

// ── Lesen ───────────────────────────────────────────────────────────────
// Gegenrichtung zu packe(): kein temporärer Ordner nötig, unzip kann
// einzelne Teile direkt aus dem Archiv auf stdout ausgeben.

async function unzipListe(abs) {
  try {
    const { stdout } = await pexec('unzip', ['-Z1', abs])
    return stdout.split('\n').filter(Boolean)
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('Das Programm "unzip" fehlt auf diesem Rechner.')
    throw new Error(`Konnte "${abs}" nicht als Office-Datei öffnen: ${e.stderr || e.message}`)
  }
}

async function unzipTeil(abs, teil) {
  try {
    const { stdout } = await pexec('unzip', ['-p', abs, teil], { maxBuffer: 20_000_000 })
    return stdout
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('Das Programm "unzip" fehlt auf diesem Rechner.')
    throw new Error(`Konnte "${teil}" nicht aus "${abs}" entpacken: ${e.stderr || e.message}`)
  }
}

// Gegenstück zu esc(): XML-Entities zurück in normalen Text.
function entesc(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Word legt Text in <w:t>…</w:t> ab, ein Absatz ist <w:p>…</w:p> — Formatierung
// drumherum interessiert beim Lesen nicht, nur der Inhalt in Reihenfolge.
function docxText(xml) {
  const absaetze = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) => {
    // <w:br/> ist ein Umbruch mitten im Absatz (wordLauf() beim Schreiben) —
    // ohne ihn kleben zwei Zeilen zu einem Wort zusammen.
    const teile = p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>|<w:br\s*\/>/g) || []
    return teile
      .map((t) =>
        t.startsWith('<w:br')
          ? '\n'
          : entesc(t.replace(/^<w:t[^>]*>/, '').replace(/<\/w:t>$/, ''))
      )
      .join('')
  })
  return absaetze.filter((a) => a.trim()).join('\n')
}

// PowerPoint legt Text in <a:t>…</a:t> ab, jede Folie ist eine eigene XML-Datei im Archiv.
function folieText(xml) {
  const teile = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []
  return teile.map((t) => entesc(t.replace(/^<a:t>/, '').replace(/<\/a:t>$/, ''))).join(' ')
}

// ── Werkzeuge ───────────────────────────────────────────────────────────

export const dokumentTools = [
  {
    name: 'dokument_word',
    description: 'Word-Datei (.docx) schreiben: Titel plus Absätze. Öffnet sich in Word, Pages und LibreOffice.',
    parameters: {
      type: 'object',
      properties: {
        titel: { type: 'string', description: 'Überschrift ganz oben' },
        absaetze: { type: 'array', description: 'Die Absätze der Reihe nach', items: { type: 'string' } },
        pfad: { type: 'string', description: 'Wohin, z.B. ~/Schreibtisch/bericht.docx' },
      },
      required: ['titel', 'absaetze', 'pfad'],
    },
    danger: true,
    async run({ titel, absaetze, pfad }) {
      if (!Array.isArray(absaetze)) throw new Error('absaetze muss eine Liste von Texten sein.')
      const abs = resolve(endung(pfad, '.docx'))
      const bytes = await packe(docxTeile(titel, absaetze.map(String)), abs)
      return `Word-Datei geschrieben: ${abs} (${absaetze.length} Absätze, ${bytes} Bytes)`
    },
  },
  {
    name: 'dokument_powerpoint',
    description:
      'PowerPoint-Datei (.pptx) schreiben: Folien mit Titel und Stichpunkten. Öffnet sich in PowerPoint, Keynote und LibreOffice.',
    parameters: {
      type: 'object',
      properties: {
        titel: { type: 'string', description: 'Name der Präsentation' },
        folien: {
          type: 'array',
          description: 'Die Folien der Reihe nach',
          items: {
            type: 'object',
            properties: {
              titel: { type: 'string' },
              punkte: { type: 'array', items: { type: 'string' } },
            },
            required: ['titel'],
          },
        },
        pfad: { type: 'string', description: 'Wohin, z.B. ~/Schreibtisch/vortrag.pptx' },
      },
      required: ['titel', 'folien', 'pfad'],
    },
    danger: true,
    async run({ titel, folien, pfad }) {
      if (!Array.isArray(folien) || folien.length === 0)
        throw new Error('folien muss eine Liste mit mindestens einer Folie sein.')
      const sauber = folien.map((f) => ({
        titel: String(f?.titel ?? ''),
        punkte: (Array.isArray(f?.punkte) ? f.punkte : []).map(String),
      }))
      const abs = resolve(endung(pfad, '.pptx'))
      const bytes = await packe(pptxTeile(titel, sauber), abs)
      return `PowerPoint-Datei geschrieben: ${abs} (${sauber.length} Folien, ${bytes} Bytes)`
    },
  },
  {
    name: 'dokument_excel',
    description:
      'Excel-Datei (.xlsx) schreiben: Tabelle aus Zeilen, auf Wunsch mehrere Blätter. Zahlen bleiben rechenbar. Öffnet sich in Excel, Numbers und LibreOffice.',
    parameters: {
      type: 'object',
      properties: {
        titel: { type: 'string', description: 'Name der Mappe, zugleich Name des einzelnen Blattes' },
        zeilen: {
          type: 'array',
          description:
            'Der einfache Fall: eine Tabelle. Jede Zeile ist eine Liste von Zellen. Zahlen dürfen als Text kommen, sie landen trotzdem als Zahl.',
          items: { type: 'array', items: { type: 'string' } },
        },
        blaetter: {
          type: 'array',
          description: 'Nur für mehrere Blätter. Dann zeilen weglassen.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Beschriftung des Reiters unten' },
              zeilen: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            },
            required: ['zeilen'],
          },
        },
        kopfzeile: { type: 'boolean', description: 'Erste Zeile fett und festgefroren. Vorgabe: ja' },
        pfad: { type: 'string', description: 'Wohin, z.B. ~/Schreibtisch/umsatz.xlsx' },
      },
      required: ['titel', 'pfad'],
    },
    danger: true,
    async run({ titel, zeilen, blaetter, kopfzeile = true, pfad }) {
      const roh = Array.isArray(blaetter) && blaetter.length ? blaetter : [{ name: titel, zeilen }]
      if (!Array.isArray(blaetter) && !Array.isArray(zeilen))
        throw new Error('Gib zeilen an (eine Liste von Zeilen) oder blaetter für mehrere Blätter.')
      const belegt = new Set()
      const sauber = roh.map((b, i) => {
        if (!Array.isArray(b?.zeilen)) throw new Error(`Blatt ${i + 1}: zeilen muss eine Liste von Zeilen sein.`)
        return {
          name: blattname(b?.name, i, belegt),
          // Eine einzelne Zelle statt einer Zeile ist ein häufiger Verhauer —
          // freundlich einpacken statt die ganze Datei verweigern.
          zeilen: b.zeilen.map((z) => (Array.isArray(z) ? z : [z])),
        }
      })
      const abs = resolve(endung(pfad, '.xlsx'))
      const bytes = await packe(xlsxTeile(titel, sauber, kopfzeile !== false), abs)
      const anzahl = sauber.reduce((s, b) => s + b.zeilen.length, 0)
      return `Excel-Datei geschrieben: ${abs} (${sauber.length} Blatt/Blätter, ${anzahl} Zeilen, ${bytes} Bytes)`
    },
  },
  {
    name: 'dokument_lesen',
    description:
      'Bestehende Word- (.docx) oder PowerPoint-Datei (.pptx) lesen und ihren Text zurückgeben, z.B. zum Zusammenfassen.',
    parameters: {
      type: 'object',
      properties: { pfad: { type: 'string', description: 'Welche Datei, z.B. ~/Schreibtisch/bericht.docx' } },
      required: ['pfad'],
    },
    async run({ pfad }) {
      const abs = resolve(pfad)
      const max = loadConfig().fsMaxBytes
      const tief = abs.toLowerCase()
      let text
      if (tief.endsWith('.pptx')) {
        const eintraege = await unzipListe(abs)
        const folien = eintraege
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
        if (!folien.length) throw new Error('Keine Folien gefunden — ist es wirklich eine .pptx-Datei?')
        const stuecke = []
        for (const [i, name] of folien.entries()) {
          const xml = await unzipTeil(abs, name)
          stuecke.push(`── Folie ${i + 1} ──\n${folieText(xml) || '(leer)'}`)
        }
        text = stuecke.join('\n\n')
      } else if (tief.endsWith('.docx')) {
        const xml = await unzipTeil(abs, 'word/document.xml')
        text = docxText(xml)
        if (!text) throw new Error('Kein Text gefunden — ist es wirklich eine .docx-Datei?')
      } else {
        throw new Error('dokument_lesen versteht nur .docx und .pptx.')
      }
      return text.length > max ? text.slice(0, max) + '\n…(gekürzt)' : text
    },
  },
]
