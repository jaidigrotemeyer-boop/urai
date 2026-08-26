// Terminal-Kraft. Immer mit Rückfrage — außer die Liste sagt anders.
import { spawn } from 'node:child_process'
import { loadConfig } from '../config.js'
import { resolve as pfadImRevier } from './files.js'

const HARD_NO = [
  /rm\s+-rf?\s+[~/]\s*$/,
  /:\(\)\s*\{.*\};:/, // fork bomb
  /\bmkfs\b/,
  /\bdd\s+if=.*of=\/dev\//,
  /\bshutdown\b|\breboot\b/,
  />\s*\/dev\/(disk|rdisk)/,
]

export function runCommand(cmd, { cwd, timeout, onData } = {}) {
  const cfg = loadConfig()
  timeout = timeout || cfg.shellTimeoutMs
  const maxAus = cfg.shellMaxOutput
  for (const re of HARD_NO) {
    if (re.test(cmd)) return Promise.reject(new Error(`Befehl gesperrt: ${cmd}`))
  }
  // Anders als alle fs_*-Werkzeuge nahm shell_run jeden cwd ungeprüft — ein
  // Befehl mit relativen Pfaden lief damit klaglos außerhalb vom Revier.
  let arbeitsordner
  try {
    arbeitsordner = cwd ? pfadImRevier(cwd) : loadConfig().workspace
  } catch (e) {
    return Promise.reject(e)
  }
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/zsh', ['-lc', cmd], { cwd: arbeitsordner })
    let out = ''
    const push = (s) => {
      out += s
      onData?.(s)
      if (out.length > maxAus) child.kill('SIGKILL')
    }
    child.stdout.on('data', (d) => push(d.toString()))
    child.stderr.on('data', (d) => push(d.toString()))
    const t = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.on('error', (e) => {
      clearTimeout(t)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(t)
      resolve(`exit=${code}\n${out.slice(0, maxAus) || '(keine Ausgabe)'}`)
    })
  })
}

export const shellTools = [
  {
    name: 'shell_run',
    description: 'Befehl im Terminal laufen lassen (zsh). Für git, npm, python, ls, curl usw.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Der Befehl' },
        cwd: { type: 'string', description: 'Arbeitsordner' },
        timeout_ms: { type: 'number' },
      },
      required: ['command'],
    },
    danger: true,
    stream: true,
    async run({ command, cwd, timeout_ms }, ctx) {
      return runCommand(command, { cwd, timeout: timeout_ms, onData: (s) => ctx?.emit?.('terminal', s) })
    },
  },
]
