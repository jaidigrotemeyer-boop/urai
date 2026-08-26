// Kraft 1: Dateien und Code
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadConfig } from '../config.js'

const pexec = promisify(execFile)
const maxBytes = () => loadConfig().fsMaxBytes

export function resolve(p) {
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

export const fileTools = [
  {
    name: 'fs_list',
    description: 'Ordner anschauen. Zeigt Dateien und Unterordner.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Ordner-Pfad' } },
      required: ['path'],
    },
    async run({ path: p }) {
      const abs = resolve(p)
      const ents = await fs.readdir(abs, { withFileTypes: true })
      return ents
        .filter((e) => !e.name.startsWith('.'))
        .slice(0, 300)
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .join('\n') || '(leer)'
    },
  },
  {
    name: 'fs_read',
    description: 'Datei lesen. Gibt Text mit Zeilennummern.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'number', description: 'Startzeile (1-basiert)' },
        limit: { type: 'number', description: 'Wie viele Zeilen' },
      },
      required: ['path'],
    },
    async run({ path: p, offset = 1, limit = 800 }) {
      const abs = resolve(p)
      const stat = await fs.stat(abs)
      if (stat.size > maxBytes() * 5) throw new Error('Datei zu fett. Nimm offset/limit oder fs_search.')
      const lines = (await fs.readFile(abs, 'utf8')).split('\n')
      const slice = lines.slice(offset - 1, offset - 1 + limit)
      return slice.map((l, i) => `${offset + i}\t${l}`).join('\n')
    },
  },
  {
    name: 'fs_write',
    description: 'Datei schreiben oder neu anlegen. Überschreibt alles.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
    danger: true,
    async run({ path: p, content }) {
      const abs = resolve(p)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, content)
      return `Geschrieben: ${abs} (${content.length} Zeichen)`
    },
  },
  {
    name: 'fs_edit',
    description: 'Stück Text in Datei ersetzen. old_string muss genau einmal vorkommen.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    danger: true,
    async run({ path: p, old_string, new_string, replace_all = false }) {
      const abs = resolve(p)
      const src = await fs.readFile(abs, 'utf8')
      const count = src.split(old_string).length - 1
      if (count === 0) throw new Error('Text nicht gefunden.')
      if (count > 1 && !replace_all) throw new Error(`Text kommt ${count}-mal vor. Mehr Kontext oder replace_all.`)
      const out = replace_all ? src.split(old_string).join(new_string) : src.replace(old_string, new_string)
      await fs.writeFile(abs, out)
      return `Geändert: ${abs} (${replace_all ? count : 1}x)`
    },
  },
  {
    name: 'fs_search',
    description: 'Nach Text in Dateien suchen (ripgrep, sonst grep).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Suchmuster (Regex)' },
        path: { type: 'string', description: 'Wo suchen' },
        glob: { type: 'string', description: 'Nur diese Dateien, z.B. *.js' },
      },
      required: ['pattern'],
    },
    async run({ pattern, path: p = '.', glob }) {
      // Ein leeres Suchmuster wird von coerceArgs() in agent.js aus den Argumenten
      // entfernt, pattern ist dann undefined — ohne diese Wache landet das rohe
      // "undefined" im execFile-Aufruf und durchsucht wirklich das ganze Revier
      // nach dem Wort "undefined", was in einem kryptischen maxBuffer-Fehler endet.
      if (typeof pattern !== 'string' || !pattern.trim()) throw new Error('Suchmuster fehlt oder ist kein Text.')
      const abs = resolve(p)
      const bin = fssync.existsSync('/opt/homebrew/bin/rg') ? '/opt/homebrew/bin/rg' : 'grep'
      const args =
        bin === 'grep'
          ? ['-rniE', pattern, abs]
          : ['-n', '--max-count', '5', '--max-columns', '200', ...(glob ? ['-g', glob] : []), pattern, abs]
      try {
        const { stdout } = await pexec(bin, args, { maxBuffer: maxBytes() })
        return stdout.split('\n').slice(0, 200).join('\n') || '(nichts gefunden)'
      } catch (e) {
        // Exitcode 1 heißt bei rg/grep "kein Treffer" — jeder andere Fall (kaputtes
        // Muster, fehlendes Programm) ist ein echter Fehler und darf nicht als
        // "(nichts gefunden)" verschluckt werden, sonst zieht der Agent falsche Schlüsse.
        if (e.code === 1) return '(nichts gefunden)'
        if (e.code === 'ENOENT') throw new Error(`Das Programm "${bin}" fehlt auf diesem Rechner.`)
        throw new Error(`Suche fehlgeschlagen: ${e.stderr?.trim() || e.message}`)
      }
    },
  },
  {
    name: 'fs_glob',
    description: 'Dateien nach Namensmuster finden, z.B. **/*.tsx',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' }, path: { type: 'string' } },
      required: ['pattern'],
    },
    async run({ pattern, path: p = '.' }) {
      const abs = resolve(p)
      const out = []
      // Node 22 hat fs.glob (experimentell) — sonst zu Fuß
      if (typeof fs.glob === 'function') {
        for await (const f of fs.glob(pattern, { cwd: abs })) {
          out.push(f)
          if (out.length >= 300) break
        }
      } else {
        const { stdout } = await pexec('find', [abs, '-name', pattern.replace(/^\*\*\//, ''), '-type', 'f'])
        out.push(...stdout.split('\n').filter(Boolean).slice(0, 300))
      }
      return out.join('\n') || '(nichts gefunden)'
    },
  },
]
