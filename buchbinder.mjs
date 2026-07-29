// Buchbinder: den ganzen Code als ein Dokument zusammenlegen.
//   node buchbinder.mjs            → URAI-Code.md
//   node buchbinder.mjs --html     → zusätzlich URAI-Code.html (druckbar als PDF)
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const AUS = path.join(ROOT, 'URAI-Code')

// In dieser Reihenfolge liest sich das Ganze wie ein Buch: erst das Große, dann die Teile
const KAPITEL = [
  {
    titel: 'Übersicht',
    text: `URAI ist ein Agent, der auf einem Mac wirklich handelt: er liest den Bildschirm,
klickt und tippt, bearbeitet Dateien, sucht im Netz, stellt sich Agenten-Teams zusammen,
schreibt alles nach Obsidian — und kann seinen eigenen Code umbauen.

Alles läuft auf dem eigenen Rechner. Der Server hört nur auf 127.0.0.1.`,
    dateien: ['README.md', 'package.json'],
  },
  {
    titel: 'Server — Herz und Verstand',
    text: 'Der Server hält alles zusammen: Verbindung zur Oberfläche, Agent-Schleife, Gehirn-Wahl.',
    dateien: ['server/index.js', 'server/agent.js', 'server/brain.js', 'server/config.js'],
  },
  {
    titel: 'Agenten und Abläufe',
    text: 'Wie URAI sich selbst Helfer erschafft und wie gespeicherte Abläufe laufen.',
    dateien: ['server/crew.js', 'server/ablauf.js', 'server/aktivitaet.js'],
  },
  {
    titel: 'Sehen und Steuern',
    text: 'Bildschirm lesen mit Apples Vision-Framework, dann klicken und tippen.',
    dateien: ['server/screen.js', 'server/ocr.jxa.js', 'server/live.js', 'server/tools/computer.js'],
  },
  {
    titel: 'Werkzeuge',
    text: 'Alles, was URAI anfassen kann.',
    dateien: ['server/tools/index.js', 'server/tools/files.js', 'server/tools/shell.js', 'server/tools/web.js'],
  },
  {
    titel: 'Gedächtnis und Obsidian',
    text: 'Was bleibt: Vektor-Gedächtnis, Notizen, Themen-Knoten, der Graph.',
    dateien: ['server/memory.js', 'server/obsidian.js', 'server/themen.js', 'server/graph.js'],
  },
  {
    titel: 'Selbst-Umbau',
    text: 'URAI liest, ändert, prüft und startet seinen eigenen Code neu.',
    dateien: ['server/self.js'],
  },
  {
    titel: 'Stimme',
    text: 'Zuhören, sprechen, Weckwort.',
    dateien: ['server/eleven.js'],
  },
  {
    titel: 'Oberfläche',
    text: 'React: Chat, Notch, Bereiche, Graph, Werkstatt.',
    dateien: [
      'web/index.html',
      'web/src/main.jsx',
      'web/src/App.jsx',
      'web/src/Hud.jsx',
      'web/src/i18n.js',
      'web/src/theme.js',
      'web/src/stimme.js',
    ],
  },
  {
    titel: 'Bausteine der Oberfläche',
    text: '',
    dateien: [
      'web/src/components/Notch.jsx',
      'web/src/components/Boot.jsx',
      'web/src/components/Cursor.jsx',
      'web/src/components/Aktivitaet.jsx',
      'web/src/components/Eye.jsx',
      'web/src/components/Settings.jsx',
      'web/src/components/Farbrad.jsx',
      'web/src/components/Graph3D.jsx',
      'web/src/components/Bereiche.jsx',
      'web/src/components/Verlauf.jsx',
      'web/src/components/Werkstatt.jsx',
    ],
  },
  {
    titel: 'Aussehen',
    text: '',
    dateien: ['web/src/styles.css', 'web/src/werkstatt.css'],
  },
  {
    titel: 'Prüfen',
    text: 'Selbsttest: jedes Werkzeug einmal wirklich laufen lassen.',
    dateien: ['pruefe.mjs'],
  },
]

const SPRACHE = { '.js': 'javascript', '.mjs': 'javascript', '.jsx': 'jsx', '.css': 'css', '.html': 'html', '.json': 'json', '.md': 'markdown' }

async function bauen() {
  const teile = []
  const jetzt = new Date()
  const datum = `${jetzt.getDate()}.${jetzt.getMonth() + 1}.${jetzt.getFullYear()}`

  let dateienGesamt = 0
  let zeilenGesamt = 0
  const inhalt = []

  for (const kap of KAPITEL) {
    const vorhanden = kap.dateien.filter((d) => fssync.existsSync(path.join(ROOT, d)))
    if (!vorhanden.length) continue
    inhalt.push(`- **${kap.titel}** — ${vorhanden.length} Dateien`)

    teile.push(`\n\n<div class="kapitel"></div>\n\n## ${kap.titel}\n`)
    if (kap.text) teile.push(`${kap.text}\n`)

    for (const rel of vorhanden) {
      const abs = path.join(ROOT, rel)
      const code = await fs.readFile(abs, 'utf8')
      const zeilen = code.split('\n').length
      dateienGesamt++
      zeilenGesamt += zeilen
      const endung = path.extname(rel)
      teile.push(`\n### \`${rel}\`\n\n*${zeilen} Zeilen*\n`)
      teile.push('```' + (SPRACHE[endung] || '') + '\n' + code.replace(/```/g, '``​`') + '\n```\n')
    }
  }

  const kopf = `# URAI — der ganze Code

*Stand: ${datum} · ${dateienGesamt} Dateien · ${zeilenGesamt.toLocaleString('de-DE')} Zeilen*

Ein Agent, der auf deinem Mac wirklich handelt. Läuft daheim, kostet nichts.

## Inhalt

${inhalt.join('\n')}
`

  const md = kopf + teile.join('')
  await fs.writeFile(`${AUS}.md`, md)
  console.log(`  ${AUS}.md — ${dateienGesamt} Dateien, ${zeilenGesamt} Zeilen`)

  if (process.argv.includes('--html')) {
    await fs.writeFile(`${AUS}.html`, alsHtml(md, datum, dateienGesamt, zeilenGesamt))
    console.log(`  ${AUS}.html — im Browser öffnen, dann Drucken → Als PDF sichern`)
  }
  return { md, dateienGesamt, zeilenGesamt }
}

/** Markdown grob zu HTML — reicht für Code mit Überschriften. */
function alsHtml(md, datum, dateien, zeilen) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const bloecke = md.split(/```/)
  let out = ''
  bloecke.forEach((b, i) => {
    if (i % 2 === 1) {
      const nl = b.indexOf('\n')
      out += `<pre><code>${escape(b.slice(nl + 1))}</code></pre>`
    } else {
      out += b
        .replace(/<div class="kapitel"><\/div>/g, '<div class="kapitel"></div>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^\*(.+)\*$/gm, '<p class="klein">$1</p>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n+/g, '\n<p></p>\n')
    }
  })

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>URAI — der ganze Code</title>
<style>
  @page { margin: 16mm 14mm; }
  body { font: 11pt/1.5 -apple-system, system-ui, sans-serif; color: #16181d; max-width: 190mm; margin: 0 auto; padding: 10mm; }
  h1 { font-size: 26pt; letter-spacing: -.02em; margin: 0 0 4pt; }
  h2 { font-size: 16pt; margin: 0 0 6pt; padding-bottom: 5pt; border-bottom: 1.5pt solid #16a06a; color: #0d7a51; }
  h3 { font-size: 11.5pt; font-family: ui-monospace, Menlo, monospace; margin: 16pt 0 3pt; color: #16181d; }
  .klein { color: #6b7280; font-size: 9pt; margin: 0 0 10pt; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 9pt; background: #f2f4f6; padding: 1pt 3pt; border-radius: 3pt; }
  pre { background: #f7f8fa; border: .5pt solid #e2e5ea; border-left: 2pt solid #16a06a; border-radius: 4pt;
        padding: 8pt 10pt; overflow-x: auto; page-break-inside: auto; }
  pre code { background: none; padding: 0; font-size: 8pt; line-height: 1.45; }
  li { margin: 2pt 0; }
  .kapitel { page-break-before: always; }
  .kapitel:first-of-type { page-break-before: avoid; }
  @media print { body { padding: 0; } pre { page-break-inside: auto; } h3 { page-break-after: avoid; } }
</style></head><body>
${out}
<p class="klein" style="margin-top:24pt">URAI · ${datum} · ${dateien} Dateien · ${zeilen.toLocaleString('de-DE')} Zeilen</p>
</body></html>`
}

bauen()
