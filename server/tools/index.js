// Werkzeug-Kiste: alles an einem Ort.
import { fileTools } from './files.js'
import { shellTools } from './shell.js'
import { webTools } from './web.js'
import { computerTools } from './computer.js'
import { dokumentTools } from './dokument.js'
import { kurzbefehlTools } from './kurzbefehle.js'
import { kameraTools } from './kamera.js'
import { midiTools } from './midi.js'
import { ohrTools } from './ohren.js'
import { memoryTools } from '../memory.js'
import { obsidianTools } from '../obsidian.js'
import { crewTools } from '../crew.js'
import { liveTools } from '../live.js'
import { selfTools } from '../self.js'
import { ablaufTools } from '../ablauf.js'
import { ausloeserTools } from '../ausloeser.js'
import { skillTools } from '../skills.js'

export const ALL_TOOLS = [
  ...fileTools,
  ...shellTools,
  ...webTools,
  ...computerTools,
  ...dokumentTools,
  ...kurzbefehlTools,
  ...kameraTools,
  ...midiTools,
  ...ohrTools,
  ...memoryTools,
  ...obsidianTools,
  ...crewTools,
  ...liveTools,
  ...selfTools,
  ...ablaufTools,
  ...ausloeserTools,
  ...skillTools,
]

// MCP-Werkzeuge kommen erst zur Laufzeit dazu (der Server sagt beim Verbinden,
// was er kann). Darum wird die Liste bei jedem Zugriff frisch zusammengesetzt
// statt einmal eingefroren — sonst kennt das Gehirn neu verbundene Dienste erst
// nach einem Neustart.
let mcpHolen = () => []
export function mcpQuelleSetzen(fn) {
  mcpHolen = typeof fn === 'function' ? fn : () => []
}

/** Eingebaute plus alles, was gerade über MCP angebunden ist. */
export function alleWerkzeuge() {
  return [...ALL_TOOLS, ...mcpHolen()]
}

/**
 * Nachschlagen nach Namen. Bewusst eine Funktion und keine feste Map: eine
 * eingefrorene Map kennt später verbundene MCP-Werkzeuge nicht.
 */
export const TOOL_MAP = {
  get: (name) => alleWerkzeuge().find((t) => t.name === name),
  has: (name) => alleWerkzeuge().some((t) => t.name === name),
}

// Was das Gehirn sehen darf (ohne run/danger)
export function toolSchemas(enabled) {
  return alleWerkzeuge().filter((t) => !enabled || enabled.includes(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

export const TOOL_GROUPS = {
  dateien: fileTools.map((t) => t.name),
  terminal: shellTools.map((t) => t.name),
  web: webTools.map((t) => t.name),
  computer: computerTools.map((t) => t.name),
  dokumente: dokumentTools.map((t) => t.name),
  // Kurzbefehle stehen absichtlich für sich und nicht bei "computer": darüber
  // läuft das Smart Home des Nutzers. Wer Licht und Türschloss nicht freigeben
  // will, soll die Gruppe abschalten können, ohne Maus und Tastatur zu verlieren.
  kurzbefehle: kurzbefehlTools.map((t) => t.name),
  kamera: kameraTools.map((t) => t.name),
  midi: midiTools.map((t) => t.name),
  ohren: ohrTools.map((t) => t.name),
  gedaechtnis: memoryTools.map((t) => t.name),
  obsidian: obsidianTools.map((t) => t.name),
  agenten: crewTools.map((t) => t.name),
  live: liveTools.map((t) => t.name),
  selbst: selfTools.map((t) => t.name),
  ablaeufe: ablaufTools.map((t) => t.name),
  ausloeser: ausloeserTools.map((t) => t.name),
  // Getrennt von "ablaeufe": ein Ablauf führt aus, ein Skill weiß nur etwas.
  // Wer das eine abschalten will, will damit selten auch das andere los sein.
  skills: skillTools.map((t) => t.name),
}
