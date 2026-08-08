// Werkzeug-Kiste: alles an einem Ort.
import { fileTools } from './files.js'
import { shellTools } from './shell.js'
import { webTools } from './web.js'
import { computerTools } from './computer.js'
import { dokumentTools } from './dokument.js'
import { memoryTools } from '../memory.js'
import { obsidianTools } from '../obsidian.js'
import { crewTools } from '../crew.js'
import { liveTools } from '../live.js'
import { selfTools } from '../self.js'
import { ablaufTools } from '../ablauf.js'
import { ausloeserTools } from '../ausloeser.js'

export const ALL_TOOLS = [
  ...fileTools,
  ...shellTools,
  ...webTools,
  ...computerTools,
  ...dokumentTools,
  ...memoryTools,
  ...obsidianTools,
  ...crewTools,
  ...liveTools,
  ...selfTools,
  ...ablaufTools,
  ...ausloeserTools,
]

export const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.name, t]))

// Was das Gehirn sehen darf (ohne run/danger)
export function toolSchemas(enabled) {
  return ALL_TOOLS.filter((t) => !enabled || enabled.includes(t.name)).map((t) => ({
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
  gedaechtnis: memoryTools.map((t) => t.name),
  obsidian: obsidianTools.map((t) => t.name),
  agenten: crewTools.map((t) => t.name),
  live: liveTools.map((t) => t.name),
  selbst: selfTools.map((t) => t.name),
  ablaeufe: ablaufTools.map((t) => t.name),
  ausloeser: ausloeserTools.map((t) => t.name),
}
