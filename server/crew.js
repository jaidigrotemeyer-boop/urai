// Agenten-Gruppen: Agenten dürfen selbst Agenten erschaffen — ohne Rückfrage.
// Grenzen gibt es trotzdem: Tiefe und Anzahl, sonst vermehren sie sich endlos.
import { loadConfig } from './config.js'
import { saveAgentRun, saveGroup } from './obsidian.js'

// Jeder Agent kann nachsehen — lesen, suchen, nachschlagen. Sonst behauptet er nur.
const BASIS = [
  'fs_list', 'fs_read', 'fs_search', 'fs_glob',
  'web_search', 'web_fetch',
  'obsidian_search', 'obsidian_read', 'obsidian_write',
  'memory_search',
  'agent_spawn',
]

// Fertige Rollen: Basis plus das, was die Rolle zusätzlich darf
export const ROLLEN = {
  rechercheur: {
    hint: 'Sucht im Netz, liest Seiten und Dateien, sammelt Fakten mit Quellen.',
    extra: [],
  },
  programmierer: {
    hint: 'Liest und schreibt Code, führt Befehle aus, prüft das Ergebnis.',
    extra: ['fs_write', 'fs_edit', 'shell_run'],
  },
  bildschirm: {
    hint: 'Liest den Bildschirm, klickt und tippt, bedient Apps.',
    extra: ['mac_read_screen', 'mac_find_text', 'mac_click_text', 'mac_click', 'mac_type', 'mac_key', 'mac_scroll', 'mac_open_app', 'mac_apps', 'mac_applescript', 'mac_notify'],
  },
  schreiber: {
    hint: 'Fasst zusammen, schreibt Texte, legt Notizen in Obsidian an.',
    extra: ['obsidian_append', 'memory_save'],
  },
  pruefer: {
    hint: 'Prüft kritisch, sucht Fehler und Lücken, widerspricht wenn nötig.',
    extra: ['shell_run'],
  },
  allrounder: { hint: 'Kann alles, wählt selbst die passenden Werkzeuge.', extra: null },
}

/** Werkzeuge einer Rolle. null heißt: alle. */
export function rollenWerkzeuge(role) {
  const r = ROLLEN[role] || ROLLEN.allrounder
  if (r.extra === null) return null
  return [...new Set([...BASIS, ...r.extra])]
}

function rollenText() {
  return Object.entries(ROLLEN)
    .map(([k, v]) => `  ${k}: ${v.hint}`)
    .join('\n')
}

/**
 * Einen Unter-Agenten laufen lassen.
 * @param {object} parent  Der Agent, der ihn erschafft
 */
async function spawn(parent, { name, role, task, tools, group }) {
  const cfg = loadConfig()
  const run = parent.run

  if (parent.depth >= cfg.maxAgentDepth) {
    return `Zu tief verschachtelt (Grenze ${cfg.maxAgentDepth}). Mach den Auftrag "${task}" selbst.`
  }
  if (run.count >= cfg.maxAgentsPerRun) {
    return `Agenten-Grenze erreicht (${cfg.maxAgentsPerRun} pro Auftrag). Mach es selbst oder frag den Nutzer.`
  }
  run.count++

  const preset = ROLLEN[role] || ROLLEN.allrounder
  const allowed = tools?.length ? tools : rollenWerkzeuge(role)

  // Verspätet importieren: agent.js lädt crew.js, sonst dreht sich der Import im Kreis
  const { Agent } = await import('./agent.js')

  const child = new Agent({
    session: parent.session,
    emit: parent.emit,
    root: parent.root,
    depth: parent.depth + 1,
    name,
    run,
  })

  child.messages = [
    {
      role: 'system',
      content: [
        `Du bist "${name}", ein Unter-Agent von "${parent.name}".`,
        `Deine Rolle: ${role} — ${preset.hint}`,
        '',
        'Du arbeitest allein und meldest am Ende ein Ergebnis zurück. Der Nutzer liest deine Antwort nicht direkt,',
        `sondern "${parent.name}" bekommt sie. Also: kein Geplauder, nur das Ergebnis, klar und vollständig.`,
        '',
        'WICHTIG: Du läufst direkt auf dem Mac des Nutzers, nicht in einer Sandbox.',
        'Du hast echten Zugriff auf Dateien, Terminal und Netz — über deine Werkzeuge.',
        'Sag NIEMALS, du hättest keinen Zugriff. Nimm das Werkzeug und sieh nach.',
        'Findest du etwas nicht, prüfe den Pfad mit fs_list und suche mit fs_search oder fs_glob.',
        '',
        allowed?.length
          ? `Deine Werkzeuge: ${allowed.join(', ')}.`
          : 'Du hast alle Werkzeuge zur Verfügung.',
        'Fehlt dir eines, sag das im Ergebnis — erfinde nichts.',
        'Du darfst selbst weitere Agenten erschaffen (agent_spawn), wenn dein Auftrag zu groß ist.',
        'Antworte auf Deutsch.',
      ].join('\n'),
    },
  ]

  parent.emit({ type: 'agent_start', name, role, parent: parent.name, depth: child.depth, task })

  let result
  let ok = true
  try {
    result = await child.send(task, { enabledTools: allowed, quiet: true })
  } catch (err) {
    ok = false
    result = `Abgebrochen: ${err.message}`
  }

  parent.emit({ type: 'agent_end', name, ok, result: String(result || '').slice(0, 4000) })

  const note = await saveAgentRun({
    name,
    role,
    task,
    result,
    parent: parent.name,
    tools: allowed || ['alle'],
    group,
  }).catch(() => null)

  run.log.push({ name, role, task, result, parent: parent.name, note })
  return `[${name} · ${role}] ${result}${note ? `\n\n(In Obsidian: ${note})` : ''}`
}

export const crewTools = [
  {
    name: 'agent_spawn',
    description:
      'Einen Unter-Agenten erschaffen und sofort arbeiten lassen. Braucht keine Erlaubnis. ' +
      'Nimm das, wenn ein Teil-Auftrag eigenständig erledigt werden kann.\nRollen:\n' +
      rollenText(),
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Kurzer Name, z.B. "Preis-Sucher"' },
        role: { type: 'string', description: 'rechercheur | programmierer | bildschirm | schreiber | pruefer | allrounder' },
        task: { type: 'string', description: 'Der vollständige Auftrag — der Agent kennt euer Gespräch nicht!' },
        tools: { type: 'array', items: { type: 'string' }, description: 'Optional: nur diese Werkzeuge erlauben' },
      },
      required: ['name', 'role', 'task'],
    },
    async run(args, ctx) {
      if (!ctx?.agent) throw new Error('agent_spawn geht nur aus einem laufenden Agenten heraus.')
      return spawn(ctx.agent, args)
    },
  },
  {
    name: 'agent_team',
    description:
      'Eine ganze Gruppe von Agenten aufstellen, die an einem Ziel arbeiten. Läuft ohne Rückfrage. ' +
      'Mitglieder arbeiten gleichzeitig, danach werden ihre Ergebnisse zusammengeführt und in Obsidian abgelegt.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name der Gruppe' },
        goal: { type: 'string', description: 'Gemeinsames Ziel' },
        members: {
          type: 'array',
          description: 'Die Mitglieder',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string' },
              task: { type: 'string' },
            },
            required: ['name', 'role', 'task'],
          },
        },
        mode: { type: 'string', description: 'parallel (Standard) oder nacheinander' },
      },
      required: ['name', 'goal', 'members'],
    },
    async run({ name, goal, members = [], mode = 'parallel' }, ctx) {
      const parent = ctx?.agent
      if (!parent) throw new Error('agent_team geht nur aus einem laufenden Agenten heraus.')
      if (!members.length) throw new Error('Eine Gruppe braucht Mitglieder.')

      parent.emit({ type: 'group_start', name, goal, members: members.map((m) => m.name) })

      let results = []
      if (mode === 'nacheinander' || mode === 'sequential') {
        for (const m of members) {
          const r = await spawn(parent, { ...m, group: name })
          results.push(r)
          // Nachfolger sehen, was vorher rauskam
          parent.messages.push({ role: 'system', content: `Zwischenstand von ${m.name}:\n${r}` })
        }
      } else {
        results = await Promise.all(members.map((m) => spawn(parent, { ...m, group: name })))
      }

      const zusammen = results.join('\n\n───\n\n')
      const note = await saveGroup({ name, goal, members, result: zusammen }).catch(() => null)
      parent.emit({ type: 'group_end', name, note })

      return [
        `Gruppe "${name}" fertig. Ziel: ${goal}`,
        '',
        zusammen,
        note ? `\n(In Obsidian: ${note})` : '',
        '',
        'Fasse das jetzt für den Nutzer zusammen.',
      ].join('\n')
    },
  },
  {
    name: 'agent_list',
    description: 'Zeigt, welche Agenten in diesem Auftrag schon gelaufen sind und was sie herausgefunden haben.',
    parameters: { type: 'object', properties: {} },
    async run(_a, ctx) {
      const log = ctx?.agent?.run?.log || []
      if (!log.length) return 'Noch keine Unter-Agenten gelaufen.'
      const cfg = loadConfig()
      return [
        `${log.length} von max. ${cfg.maxAgentsPerRun} Agenten gelaufen:`,
        ...log.map((l, i) => `${i + 1}. ${l.name} (${l.role}, von ${l.parent}) → ${String(l.result).slice(0, 200)}`),
      ].join('\n')
    },
  },
]
