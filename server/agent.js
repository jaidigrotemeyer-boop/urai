// Agent-Herz: denken → machen → schauen → nochmal.
// Gefährliche Werkzeuge fragen erst. Stopp-Knopf bricht sofort ab.
import { chat } from './brain.js'
import { TOOL_MAP, toolSchemas } from './tools/index.js'
import { loadConfig, saveConfig, sprachName } from './config.js'
import { logMessage, recall, history } from './memory.js'
import { saveSession, addToIndex } from './obsidian.js'
import { beschreiben } from './aktivitaet.js'
import { mitBeweis } from './beweis.js'

const SYSTEM = `Du bist URAI — ein Agent, der auf dem Mac des Nutzers wirklich handelt.

Du kannst:
- Dateien und Code lesen, schreiben, ändern, durchsuchen (fs_*)
- Befehle im Terminal laufen lassen (shell_run)
- Im Netz suchen, Seiten lesen, einen echten Browser steuern (web_*)
- Den Bildschirm lesen und verstehen (mac_read_screen), klicken, tippen, Apps öffnen (mac_*)
- Dir Dinge dauerhaft merken (memory_*) und in Obsidian ablegen (obsidian_*)
- Andere Agenten erschaffen, die für dich arbeiten (agent_spawn, agent_team)
- Dich selbst umbauen: deinen eigenen Code lesen, ändern, prüfen, neu starten (self_*)
- Live mitgucken, was auf dem Bildschirm passiert (live_report)

Dich selbst umbauen:
- Will der Nutzer, dass du dich änderst, neue Fähigkeiten bekommst oder einen Fehler an dir behebst:
  self_tree → self_read → self_edit → self_check → self_restart.
- Jede Änderung wird automatisch mit Git gesichert. Geht etwas schief: self_undo.
- Nach self_restart bist du kurz weg und kommst dann mit dem neuen Code wieder.
- Neue Werkzeuge gehören in server/tools/, neue Ansicht in web/src/.

Agenten-Gruppen:
- Ist ein Auftrag groß oder hat mehrere Teile, stellst du selbst eine Gruppe auf: agent_team.
  Beispiel: "Vergleich drei Tools" → Gruppe mit drei Rechercheuren plus einem Prüfer.
- Einzelner Teil-Auftrag, der allein erledigt werden kann: agent_spawn.
- Dafür brauchst du KEINE Erlaubnis. Einfach machen.
- Jeder Unter-Agent kennt euer Gespräch nicht. Schreib den Auftrag vollständig aus.
- Unter-Agenten dürfen selbst weitere Agenten erschaffen.
- Danach fasst du ihre Ergebnisse für den Nutzer zusammen.

Obsidian:
- Alles wird automatisch als Markdown im Vault abgelegt: Gespräche, Agenten-Läufe, Gruppen.
- Wichtige Ergebnisse zusätzlich mit obsidian_write als eigene Notiz sichern.
- Fragt der Nutzer nach früherem Wissen: obsidian_search und memory_search.

So liest du den Bildschirm:
- mac_read_screen ist dein Auge. Es liefert JEDEN sichtbaren Text mit Klick-Punkt (x,y)
  plus die echten Knöpfe und Felder der vordersten App. Damit weißt du wirklich, was da steht.
- Fragt der Nutzer "was steht auf meinem Bildschirm", "lies das", "was siehst du",
  "hilf mir hiermit" — dann sofort mac_read_screen, ohne Rückfrage.
- Geht es um Bilder, Fotos oder Grafik ohne Text: mac_read_screen mit describe=true.
- Klicken: am liebsten mac_click_text ("klick auf Senden"). Nur wenn das nicht geht, mac_click mit x,y.

DAS WICHTIGSTE: Du bist kein Ratgeber, du bist ein Macher.

Sagt der Nutzer "erledige das", "mach die Aufgaben", "kümmer dich drum" — dann MACHST du es.
Nicht beschreiben, nicht auflisten, nicht "hier sind die Schritte" sagen. Wirklich tun.

Beispiel — auf dem Bildschirm steht eine Schulaufgabe:
  FALSCH: "Die Aufgabe lautet: Kapitel lesen, Wörter nachschlagen. Hier ist, was zu tun ist…"
  RICHTIG: Text lesen → Wörter nachschlagen (web_search) → Ergebnis in eine Notiz schreiben
           (obsidian_write) → dem Nutzer sagen, was fertig ist.

Kannst du einen Teil wirklich nicht selbst (etwas abschicken, etwas kaufen, etwas unterschreiben),
machst du alles andere fertig und sagst am Ende in einem Satz, was noch an ihm hängt.

Bist du unsicher, was gemeint ist: fang mit dem offensichtlichsten Teil an, statt zu fragen.

Regeln:
1. Handeln statt reden. Wenn du etwas prüfen kannst, prüfe es mit einem Werkzeug.
2. Nie blind klicken. Immer erst lesen, dann handeln, dann nochmal lesen zum Prüfen.
3. Koordinaten zählen in Bildschirm-Punkten, 0,0 ist links oben.
4. Ein Schritt nach dem anderen. Nach jedem Werkzeug schaust du auf das Ergebnis.
5. Fehler ehrlich melden. Nichts erfinden, keine Ergebnisse behaupten die du nicht gesehen hast.
6. Kurz antworten. Der Nutzer sieht deine Werkzeug-Schritte sowieso live.
7. Bist du fertig, sag klar was rauskam.`

/**
 * Kleine Modelle schicken gern Strings statt echter Werte: "false", "null", "3".
 * Hier biegen wir das anhand des Werkzeug-Schemas gerade.
 */
export function coerceArgs(args, schema) {
  if (!args || typeof args !== 'object' || !schema?.properties) return args || {}
  const out = {}
  for (const [key, val] of Object.entries(args)) {
    const type = schema.properties[key]?.type
    let v = val
    if (typeof v === 'string') {
      const s = v.trim()
      if (s === 'null' || s === 'undefined' || s === 'None' || s === '') {
        continue // gar nicht erst mitgeben
      }
      if (type === 'boolean') v = s === 'true' || s === '1' || s === 'yes' || s === 'ja'
      else if (type === 'number' && s !== '' && !Number.isNaN(Number(s))) v = Number(s)
      else if (type === 'array' && s.startsWith('[')) {
        try {
          v = JSON.parse(s)
        } catch {}
      } else if (type === 'object' && s.startsWith('{')) {
        try {
          v = JSON.parse(s)
        } catch {}
      }
    }
    out[key] = v
  }
  return out
}

/** Langen Text stutzen — Anfang und Ende bleiben, die Mitte fliegt raus. */
function kuerzen(text, max) {
  if (text.length <= max) return text
  const kopf = Math.floor(max * 0.65)
  const fuss = max - kopf
  return `${text.slice(0, kopf)}\n\n… [${text.length - max} Zeichen ausgelassen] …\n\n${text.slice(-fuss)}`
}

/**
 * Alte Werkzeug-Ergebnisse eindampfen, bevor das Gespräch ans Gehirn geht.
 * Die letzten paar bleiben ganz — was älter ist, braucht niemand mehr im Wortlaut.
 * Ohne das reißt schon ein einziger Zug das Minuten-Kontingent.
 */
function eindampfen(messages, frisch, altMax) {
  const werkzeugStellen = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0)
  const behalten = new Set(werkzeugStellen.slice(-frisch))
  return messages.map((m, i) => {
    if (m.role !== 'tool' || behalten.has(i)) return m
    const t = String(m.content ?? '')
    return t.length <= altMax ? m : { ...m, content: `${t.slice(0, altMax)}\n… [gekürzt, ${t.length} Zeichen]` }
  })
}

// Diese Werkzeuge dürfen nie nebeneinander laufen: sie verändern etwas,
// oder die Reihenfolge entscheidet (erst schauen, dann klicken).
const NUR_NACHEINANDER = /^(fs_write|fs_edit|shell_run|mac_|self_|web_browse|agent_)/

/**
 * Werkzeug-Aufrufe in Gruppen schneiden, die gefahrlos gleichzeitig laufen.
 * Reines Lesen und Suchen läuft parallel — das spart bei vier Aufrufen
 * schnell mehrere Sekunden. Alles andere bleibt einzeln und in Reihenfolge.
 */
export function parallelisieren(calls) {
  const gruppen = []
  let aktuell = []
  const angefasst = new Set()

  for (const call of calls) {
    const ziel = call.args?.path || call.args?.url || ''
    const heikel = NUR_NACHEINANDER.test(call.name) || angefasst.has(ziel)
    if (heikel) {
      if (aktuell.length) gruppen.push(aktuell)
      gruppen.push([call])
      aktuell = []
      angefasst.clear()
    } else {
      aktuell.push(call)
      if (ziel) angefasst.add(ziel)
    }
  }
  if (aktuell.length) gruppen.push(aktuell)
  return gruppen
}

/** Nichts gesagt? Auch leere Codeblöcke und einzelne Satzzeichen zählen als nichts. */
function istLeer(text) {
  const t = String(text || '')
    .replace(/```[a-z]*\s*```/gi, '')
    .replace(/[\s`~*_.-]/g, '')
  return t.length === 0
}

/** Erkennt hingetippte Pseudo-Werkzeug-Aufrufe wie {"name": "fs_list", "parameters": {…}}. */
function looksLikeFakeToolCall(text) {
  if (!text) return false
  const t = text.trim()
  if (t.length > 600) return false
  return /\{\s*"?(name|tool|function|tool_name)"?\s*:/.test(t) && /(parameters|arguments|args)/.test(t)
}

export class Agent {
  constructor({ session, emit, root, depth = 0, name = 'URAI', run }) {
    this.session = session
    this.name = name
    this.depth = depth
    this.root = root || this // Freigaben laufen immer über den obersten Agenten
    this.children = []
    if (root) root.children.push(this)
    // Zähler für den ganzen Auftrag — alle Agenten teilen ihn sich
    this.run = run || { count: 0, log: [] }
    this.emit = depth === 0 ? emit : (msg) => emit({ ...msg, agent: name, depth })
    this.messages = [{ role: 'system', content: `${SYSTEM}\n\nSprich mit dem Nutzer in: ${sprachName()}.` }]
    this.pending = new Map()
    this.abort = null
    this.running = false
  }

  stop() {
    this.abort?.abort()
    for (const [, p] of this.pending) p.reject(new Error('Vom Nutzer gestoppt.'))
    this.pending.clear()
    for (const kid of this.children) kid.stop()
    this.running = false
    if (this.depth === 0) this.emit({ type: 'stopped' })
  }

  approve(id, ok, always) {
    const p = this.pending.get(id)
    if (!p) return
    this.pending.delete(id)
    if (always && ok) {
      const c = loadConfig()
      if (!c.autoApprove.includes(p.toolName)) {
        saveConfig({ autoApprove: [...c.autoApprove, p.toolName] })
      }
    }
    ok ? p.resolve(true) : p.reject(new Error('Nutzer hat Nein gesagt.'))
  }

  askApproval(toolName, args) {
    const id = `${Date.now()}-${Math.round(performance.now() * 1000)}`
    this.emit({ type: 'approval', id, tool: toolName, args, from: this.name })
    // Der oberste Agent hält die Warteliste — von dort kommt die Antwort des Nutzers
    return new Promise((resolve, reject) => this.root.pending.set(id, { resolve, reject, toolName }))
  }

  async send(userText, { enabledTools, quiet = false } = {}) {
    if (this.running) throw new Error('Agent arbeitet noch.')
    this.running = true
    this.abort = new AbortController()
    const cfg = loadConfig()
    const signal = this.abort.signal
    const maxSteps = this.depth === 0 ? cfg.maxSteps : cfg.agentSteps

    if (!quiet) logMessage(this.session, 'user', userText)

    // Passendes aus dem Gedächtnis dazulegen
    if (!quiet) {
      try {
        const hits = await recall(userText, cfg.recallTreffer)
        if (hits.length) {
          this.messages.push({
            role: 'system',
            content: `Was du über den Nutzer weißt:\n${hits.map((h) => `- ${h.text}`).join('\n')}`,
          })
        }
      } catch {}
    }

    this.messages.push({ role: 'user', content: userText })
    this.letzteFrage = userText
    this.werkzeugeBenutzt = 0
    const tools = toolSchemas(enabledTools)

    try {
      for (let step = 0; step < maxSteps; step++) {
        this.emit({ type: 'thinking', step: step + 1, gesamt: maxSteps })
        const zugStart = Date.now()
        let zeichen = 0
        const res = await chat({
          messages: eindampfen(this.messages, cfg.kontextFrisch, cfg.kontextAltMax),
          tools,
          signal,
          onWait: ({ sekunden, grund }) => this.emit({ type: 'waiting', sekunden, grund }),
          onDelta: (d) => {
            zeichen += d.length
            this.emit({ type: 'delta', text: d })
          },
        })
        const dauer = Math.max(1, Date.now() - zugStart)
        this.emit({
          type: 'brain',
          provider: res.provider,
          model: res.model,
          ms: dauer,
          tempo: Math.round((zeichen / dauer) * 1000), // Zeichen pro Sekunde
        })

        this.messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls })
        if (res.text && !quiet) logMessage(this.session, 'assistant', res.text)

        // Kleine Modelle tippen Werkzeug-Aufrufe manchmal als Text hin, statt sie zu rufen.
        if (!res.toolCalls?.length && looksLikeFakeToolCall(res.text) && step < maxSteps - 1) {
          this.messages.push({
            role: 'system',
            content:
              'Das war kein echter Werkzeug-Aufruf, sondern nur Text. Ruf das Werkzeug richtig auf ' +
              '(über die Werkzeug-Funktion, nicht als JSON im Text) — oder antworte in normalen Worten.',
          })
          continue
        }

        // Leere Antwort ohne Werkzeug: das Modell hat nichts gesagt und nichts getan.
        // Einmal anstupsen, statt den Nutzer vor einem leeren Kasten sitzen zu lassen.
        if (!res.toolCalls?.length && istLeer(res.text) && step < maxSteps - 1) {
          this.messages.push({
            role: 'system',
            content:
              'Deine letzte Antwort war leer. Sag entweder in einem Satz, was du herausgefunden hast, ' +
              'oder ruf ein Werkzeug auf und erledige die Sache. Ein leerer Codeblock hilft niemandem.',
          })
          continue
        }

        if (!res.toolCalls?.length) {
          if (this.depth === 0) await this.finish(res.text, signal)
          return res.text
        }

        // Mehrere Werkzeuge in einem Zug laufen gleichzeitig — außer sie
        // fassen dieselbe Datei an oder steuern den Mac, da wäre Chaos.
        if (signal.aborted) throw new Error('Gestoppt.')
        const gruppen = parallelisieren(res.toolCalls)
        for (const gruppe of gruppen) {
          if (signal.aborted) throw new Error('Gestoppt.')
          const ergebnisse = await Promise.all(gruppe.map((call) => this.runTool(call, signal)))
          gruppe.forEach((call, i) => {
            this.messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: ergebnisse[i] })
          })
        }
        this.emit({ type: 'turn_end' })
      }
      const msg = `Schluss nach ${maxSteps} Schritten. Sag mir, wie es weitergehen soll.`
      if (this.depth === 0) this.emit({ type: 'done', text: msg })
      return msg
    } catch (err) {
      this.emit({ type: 'error', message: err.message, agent: this.name })
      throw err
    } finally {
      this.running = false
    }
  }

  /**
   * Auftrag fertig: Zusammenfassung schreiben, alles in Obsidian ablegen, dann melden.
   * Läuft nur beim obersten Agenten.
   */
  async finish(finalText, signal) {
    const cfg = loadConfig()
    let summary = null

    // Bei einer normalen Frage-Antwort gibt es nichts zusammenzufassen —
    // dann wäre der Bericht länger als die Antwort selbst.
    const echteArbeit = this.werkzeugeBenutzt >= 2 || (this.werkzeugeBenutzt >= 1 && (finalText || '').length > 400)

    if (cfg.autoSummary && echteArbeit) {
      this.emit({ type: 'summarizing' })
      summary = await this.makeSummary(signal).catch(() => null)
      if (summary) this.emit({ type: 'summary', text: summary })
    }

    this.emit({ type: 'done', text: finalText })

    try {
      const entries = history(this.session, 400).map((m) => ({ role: m.role, content: m.content }))
      if (entries.length) {
        const note = await saveSession(
          this.session,
          entries,
          { agenten: this.run.count, notizen: this.run.log.map((l) => l.note).filter(Boolean) },
          summary,
          this.letzteFrage
        )
        if (note) {
          await addToIndex({ note, summary, session: this.session, agents: this.run.count }).catch(() => {})
          this.emit({ type: 'obsidian', note })
        }
      }
    } catch {}
  }

  /** Kurze Zusammenfassung des Auftrags — ohne Werkzeuge, ein einziger Zug. */
  async makeSummary(signal) {
    const verlauf = this.messages
      .filter((m) => m.role !== 'system')
      .slice(-40)
      .map((m) => {
        if (m.role === 'tool') return `WERKZEUG ${m.name}: ${String(m.content).slice(0, 700)}`
        if (m.role === 'assistant') {
          const calls = (m.toolCalls || []).map((t) => t.name).join(', ')
          return `URAI: ${m.content || ''}${calls ? ` [ruft: ${calls}]` : ''}`
        }
        return `NUTZER: ${m.content}`
      })
      .join('\n')

    const res = await chat({
      messages: [
        {
          role: 'system',
          content:
            `Fasse zusammen, was gerade passiert ist — in ${sprachName()}, so wie du es einem Kollegen erzählen würdest.\n` +
            '\n' +
            'Zwei bis vier Sätze in normaler Sprache. Erst worum es ging, dann was wirklich getan wurde,\n' +
            'dann was dabei herauskam. Hat etwas nicht geklappt, sag es im letzten Satz.\n' +
            '\n' +
            'Keine Überschriften, keine Stichpunkte, keine Schlagwörter wie "Auftrag:" oder "Ergebnis:".\n' +
            'Schreib in ganzen Sätzen. Nenne konkrete Namen — Dateien, Apps, Zahlen —, denn danach\n' +
            'wird später gesucht. Nichts erfinden: nur was in den Werkzeug-Ergebnissen steht.',
        },
        { role: 'user', content: verlauf },
      ],
      tools: [],
      signal,
      flink: true, // Zusammenfassen ist Fleißarbeit, kein Denken
      onDelta: () => {},
    })
    return res.text?.trim() || null
  }

  async runTool(call, signal) {
    const tool = TOOL_MAP.get(call.name)
    if (!tool) return `Fehler: Werkzeug "${call.name}" gibt es nicht.`
    call.args = coerceArgs(call.args, tool.parameters)

    const cfg = loadConfig()
    // Auto-Modus: nichts fragen, einfach machen. Der Stopp-Knopf greift trotzdem.
    const needsOk = !cfg.autoMode && tool.danger && !cfg.autoApprove.includes(tool.name)

    this.werkzeugeBenutzt = (this.werkzeugeBenutzt || 0) + 1
    const wort = beschreiben(call.name, call.args)
    const begonnen = Date.now()
    this.emit({ type: 'tool_start', name: call.name, args: call.args, ...wort })
    try {
      if (needsOk) await this.askApproval(call.name, call.args)
      if (signal.aborted) throw new Error('Gestoppt.')

      const ctx = {
        emit: (kind, data) => this.emit({ type: 'tool_stream', kind, name: call.name, data }),
        signal,
        agent: this, // damit agent_spawn / agent_team Kinder anlegen können
      }
      // Handlungen am Mac werden nachgeprüft — sonst meldet er Erfolg,
      // obwohl der Klick ins Leere ging.
      const result = await mitBeweis(call.name, () => tool.run(call.args || {}, ctx))
      const text = String(result ?? '')
      this.emit({
        type: 'tool_end',
        name: call.name,
        ok: true,
        result: text.slice(0, 8000),
        ms: Date.now() - begonnen,
        ...wort,
      })
      // Was zurück ins Gehirn geht, kostet Kontingent — also deckeln
      return kuerzen(text, cfg.toolResultMax)
    } catch (err) {
      this.emit({ type: 'tool_end', name: call.name, ok: false, result: err.message, ms: Date.now() - begonnen, ...wort })
      return `Fehler bei ${call.name}: ${err.message}`
    }
  }
}
