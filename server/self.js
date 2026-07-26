// Selbst-Bearbeitung: URAI darf seinen eigenen Code ändern.
//
// Sicherheitsnetz, damit er sich nicht selbst zerlegt:
//   1. Jede Änderung wird vorher als Git-Stand gesichert
//   2. JS-Dateien werden mit `node --check` geprüft — kaputt = sofort zurück
//   3. self_undo macht die letzte Änderung rückgängig
//   4. self_restart startet ihn neu, damit die Änderung wirkt
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const pexec = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Diese Dateien fasst er nicht an — da liegen Schlüssel und Gedächtnis drin
const TABU = ['data/', 'node_modules/', '.git/', 'dist/']

function eigenerWeg(p) {
  const rel = p.replace(/^\/?(urai\/)?/, '')
  const abs = path.resolve(ROOT, rel)
  if (!abs.startsWith(ROOT)) throw new Error('Liegt außerhalb vom eigenen Ordner.')
  const innen = path.relative(ROOT, abs)
  if (TABU.some((t) => innen.startsWith(t))) throw new Error(`${innen} ist tabu (Schlüssel, Gedächtnis, Fremdcode).`)
  return { abs, rel: innen }
}

async function git(...args) {
  try {
    const { stdout } = await pexec('git', args, { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 })
    return stdout.trim()
  } catch (err) {
    return (err.stdout || err.message || '').trim()
  }
}

/** Vor jeder Änderung: alten Stand festhalten, damit man zurückkann. */
async function sichern(grund) {
  await git('add', '-A')
  const status = await git('status', '--porcelain')
  if (status) await git('commit', '-q', '-m', `vor: ${grund}`.slice(0, 90))
  return git('rev-parse', '--short', 'HEAD')
}

/** JS-Datei auf Syntax prüfen. Wirft, wenn kaputt. */
async function pruefen(abs) {
  if (!/\.(js|mjs|jsx)$/.test(abs)) return
  if (abs.endsWith('.jsx')) return // JSX kann node nicht lesen, das prüft der Vite-Bau
  await pexec('node', ['--check', abs], { cwd: ROOT, timeout: 15000 })
}

/** "12\tconst x" → "const x". Nur wenn wirklich jede Zeile so aussieht. */
function ohneZeilennummern(s) {
  if (!s) return s
  const zeilen = s.split('\n')
  const echte = zeilen.filter((l) => l.trim())
  if (echte.length && echte.every((l) => /^\s*\d+\t/.test(l))) {
    return zeilen.map((l) => l.replace(/^\s*\d+\t/, '')).join('\n')
  }
  return s
}

/** Das Projekt ist ESM. CommonJS würde beim Laden knallen, nicht beim Syntax-Check. */
function pruefeStil(rel, text) {
  if (!rel.startsWith('server/') || !rel.endsWith('.js')) return
  if (/\brequire\s*\(/.test(text) && !/createRequire/.test(text)) {
    throw new Error('Hier gilt ESM: import statt require benutzen.')
  }
  if (/\bmodule\.exports\b|\bexports\.\w+\s*=/.test(text)) {
    throw new Error('Hier gilt ESM: export statt module.exports benutzen.')
  }
}

/**
 * Der wichtigste Wächter: lädt die Werkzeug-Kiste in einem eigenen Prozess.
 * Damit fällt auf, wenn eine Datei zwar Syntax hat, aber beim Laden platzt
 * oder plötzlich Werkzeuge fehlen.
 */
async function rauchtest() {
  const { stdout } = await pexec(
    'node',
    [
      '--experimental-sqlite',
      '--no-warnings',
      '-e',
      "import('./server/tools/index.js').then(m=>console.log('TOOLS='+m.ALL_TOOLS.length)).catch(e=>{console.error(e.message);process.exit(1)})",
    ],
    { cwd: ROOT, timeout: 40000 }
  )
  const n = Number(/TOOLS=(\d+)/.exec(stdout)?.[1] || 0)
  if (!n) throw new Error('Werkzeug-Kiste lädt nicht mehr.')
  return n
}

/** Ändern, prüfen, bei Ärger alles zurückdrehen. */
async function abgesichert({ abs, rel, neu, alt, why }) {
  const vorherAnzahl = await rauchtest().catch(() => 0)
  const stand = await sichern(`${rel}: ${why}`)

  pruefeStil(rel, neu)
  await fs.writeFile(abs, neu)

  const zurueck = async () => {
    if (alt === null) await fs.unlink(abs).catch(() => {})
    else await fs.writeFile(abs, alt)
  }

  try {
    await pruefen(abs)
  } catch (err) {
    await zurueck()
    throw new Error(`Syntax kaputt, zurückgenommen: ${String(err.stderr || err.message).slice(0, 300)}`)
  }

  let nachherAnzahl = 0
  try {
    nachherAnzahl = await rauchtest()
  } catch (err) {
    await zurueck()
    throw new Error(`Lädt nicht mehr, zurückgenommen: ${err.message.slice(0, 300)}`)
  }

  if (vorherAnzahl && nachherAnzahl < vorherAnzahl) {
    await zurueck()
    throw new Error(
      `Werkzeuge verschwunden (${vorherAnzahl} → ${nachherAnzahl}), zurückgenommen. ` +
        'Du hast wohl Bestehendes überschrieben statt ergänzt. Nimm self_edit.'
    )
  }

  await git('add', '-A')
  await git('commit', '-q', '-m', `URAI: ${why}`.slice(0, 90))
  return { stand, werkzeuge: nachherAnzahl }
}

export const selfTools = [
  {
    name: 'self_tree',
    description: 'Den eigenen Code-Ordner anschauen — welche Dateien gibt es?',
    parameters: { type: 'object', properties: {} },
    async run() {
      const out = await git('ls-files')
      const dateien = out.split('\n').filter((f) => f && !TABU.some((t) => f.startsWith(t)))
      return dateien.length ? dateien.join('\n') : '(git kennt noch keine Dateien — erst self_commit)'
    },
  },
  {
    name: 'self_read',
    description: 'Eine eigene Code-Datei lesen, z.B. "server/agent.js" oder "web/src/App.jsx".',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async run({ path: p }) {
      const { abs, rel } = eigenerWeg(p)
      const text = await fs.readFile(abs, 'utf8')
      const lines = text.split('\n')
      return [
        `${rel} (${lines.length} Zeilen)`,
        'Die Zahl und der Tab vorne gehören NICHT zur Datei — beim self_edit weglassen.',
        '',
        lines.map((l, i) => `${i + 1}\t${l}`).join('\n').slice(0, 60000),
      ].join('\n')
    },
  },
  {
    name: 'self_edit',
    description:
      'Den eigenen Code ändern: ein Textstück ersetzen. Wird vorher gesichert und danach auf Syntax geprüft. ' +
      'Ist die Datei kaputt, wird die Änderung sofort zurückgenommen.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: 'Muss genau einmal vorkommen' },
        new_string: { type: 'string' },
        why: { type: 'string', description: 'Warum die Änderung — kommt in die Sicherung' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    async run({ path: p, old_string, new_string, why = 'Selbst-Änderung' }) {
      const { abs, rel } = eigenerWeg(p)
      const vorher = await fs.readFile(abs, 'utf8')

      // self_read zeigt Zeilennummern. Kopiert das Gehirn sie mit, hier wieder abschneiden.
      old_string = ohneZeilennummern(old_string)
      new_string = ohneZeilennummern(new_string)

      const treffer = vorher.split(old_string).length - 1
      if (treffer === 0) {
        // Zweiter Versuch: Leerraum am Zeilenende ignorieren
        const locker = new RegExp(
          old_string.split('\n').map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trimEnd() + '[ \\t]*').join('\\n')
        )
        const m = locker.exec(vorher)
        if (!m) {
          throw new Error(
            'Text nicht gefunden. Nimm den Text GENAU so, wie er in der Datei steht — ' +
              'ohne die Zeilennummern und Tabs, die self_read voranstellt.'
          )
        }
        old_string = m[0]
      } else if (treffer > 1) {
        throw new Error(`Text kommt ${treffer}-mal vor. Nimm mehr Kontext.`)
      }
      if (treffer > 1) throw new Error(`Text kommt ${treffer}-mal vor. Nimm mehr Kontext.`)

      const neu = vorher.replace(old_string, new_string)
      const { stand, werkzeuge } = await abgesichert({ abs, rel, neu, alt: vorher, why })
      return `${rel} geändert und gesichert (vorher: ${stand}, ${werkzeuge} Werkzeuge laden). Zum Wirken: self_restart.`
    },
  },
  {
    name: 'self_write',
    description:
      'Eine NEUE eigene Datei anlegen. Für bestehende Dateien nimm self_edit — self_write würde alles ' +
      'darin löschen und wird deshalb abgelehnt, wenn dabei viel verschwindet.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        why: { type: 'string' },
        force: { type: 'boolean', description: 'Bestehende Datei wirklich komplett ersetzen' },
      },
      required: ['path', 'content'],
    },
    async run({ path: p, content, why = 'neue Datei', force = false }) {
      const { abs, rel } = eigenerWeg(p)
      const gabEs = fssync.existsSync(abs)
      const vorher = gabEs ? await fs.readFile(abs, 'utf8') : null

      // Schutz vor dem klassischen Fehler: ganze Datei durch einen Schnipsel ersetzen
      if (vorher && !force && content.length < vorher.length * 0.6) {
        throw new Error(
          `Abgelehnt: ${rel} hat ${vorher.length} Zeichen, du willst nur ${content.length} schreiben. ` +
            'Das würde fast alles löschen. Nimm self_edit zum Ergänzen — oder force=true, wenn du es wirklich willst.'
        )
      }

      await fs.mkdir(path.dirname(abs), { recursive: true })
      const { stand, werkzeuge } = await abgesichert({ abs, rel, neu: content, alt: vorher, why })
      return `${rel} geschrieben (${content.length} Zeichen, vorher: ${stand}, ${werkzeuge} Werkzeuge laden). Zum Wirken: self_restart.`
    },
  },
  {
    name: 'self_diff',
    description: 'Was habe ich zuletzt an mir selbst geändert?',
    parameters: { type: 'object', properties: { anzahl: { type: 'number' } } },
    async run({ anzahl = 5 }) {
      const log = await git('log', `-${anzahl}`, '--oneline')
      const diff = await git('show', '--stat', '--oneline', 'HEAD')
      return `Letzte Änderungen:\n${log || '(noch keine)'}\n\nNeueste im Einzelnen:\n${diff.slice(0, 3000)}`
    },
  },
  {
    name: 'self_undo',
    description: 'Die letzte Selbst-Änderung rückgängig machen.',
    parameters: { type: 'object', properties: {} },
    async run() {
      const kopf = await git('log', '-1', '--oneline')
      if (!kopf) return 'Nichts zum Zurücknehmen da.'
      await git('reset', '--hard', 'HEAD~1')
      const neu = await git('log', '-1', '--oneline')
      return `Zurückgenommen: ${kopf}\nJetzt bei: ${neu}\nZum Wirken: self_restart.`
    },
  },
  {
    name: 'self_check',
    description: 'Prüfen, ob der eigene Code noch läuft: Syntax aller Server-Dateien und der Web-Bau.',
    parameters: { type: 'object', properties: { build: { type: 'boolean', description: 'Auch die Web-App bauen' } } },
    async run({ build = false }) {
      const zeilen = []
      const dateien = (await git('ls-files', 'server')).split('\n').filter((f) => f.endsWith('.js'))
      let kaputt = 0
      for (const f of dateien) {
        try {
          await pexec('node', ['--check', path.join(ROOT, f)], { timeout: 15000 })
        } catch (err) {
          kaputt++
          zeilen.push(`KAPUTT ${f}: ${String(err.stderr || err.message).split('\n')[0]}`)
        }
      }
      zeilen.unshift(`${dateien.length} Server-Dateien geprüft, ${kaputt} kaputt.`)

      if (build) {
        try {
          const { stdout } = await pexec('npm', ['run', 'build'], { cwd: ROOT, timeout: 180000 })
          zeilen.push(`Web-Bau OK:\n${stdout.split('\n').slice(-4).join('\n')}`)
        } catch (err) {
          zeilen.push(`Web-Bau KAPUTT:\n${String(err.stdout || err.message).slice(-800)}`)
        }
      }
      return zeilen.join('\n')
    },
  },
  {
    name: 'self_restart',
    description:
      'Sich selbst neu starten, damit Code-Änderungen wirken. Baut vorher die Web-App und prüft die Syntax. ' +
      'Die Seite verbindet sich von allein wieder.',
    parameters: { type: 'object', properties: {} },
    danger: true,
    async run(_a, ctx) {
      // Erst prüfen — ein kaputter Neustart wäre das Ende
      const dateien = (await git('ls-files', 'server')).split('\n').filter((f) => f.endsWith('.js'))
      for (const f of dateien) {
        try {
          await pexec('node', ['--check', path.join(ROOT, f)], { timeout: 15000 })
        } catch (err) {
          throw new Error(`Kein Neustart — ${f} ist kaputt: ${String(err.stderr).split('\n')[0]}`)
        }
      }
      try {
        await pexec('npm', ['run', 'build'], { cwd: ROOT, timeout: 180000 })
      } catch (err) {
        throw new Error(`Kein Neustart — Web-Bau kaputt: ${String(err.stdout || err.message).slice(-500)}`)
      }

      ctx?.emit?.('terminal', '\nURAI startet sich neu…\n')

      // Nachfolger losschicken, der wartet bis dieser hier weg ist
      const kind = spawn(
        '/bin/zsh',
        ['-lc', `sleep 2; cd ${JSON.stringify(ROOT)} && node --experimental-sqlite --no-warnings server/index.js`],
        { cwd: ROOT, detached: true, stdio: 'ignore' }
      )
      kind.unref()

      setTimeout(() => process.exit(0), 700)
      return 'Neustart läuft. In ein paar Sekunden ist die Seite wieder da.'
    },
  },
]
