// Kraft 2: Web. Holen, suchen, lesen. Ohne Schlüssel, ohne Kosten.
import { loadConfig } from '../config.js'


function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const webTools = [
  {
    name: 'web_fetch',
    description: 'Webseite holen und als Text lesen.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        max_chars: { type: 'number', description: 'Standard 20000' },
      },
      required: ['url'],
    },
    async run({ url, max_chars }) {
      const cfg = loadConfig()
      max_chars = max_chars || cfg.webMaxChars
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) URAI/0.1', accept: 'text/html,application/json,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(cfg.webTimeoutMs),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`)
      const ct = res.headers.get('content-type') || ''
      const body = await res.text()
      const text = ct.includes('json') ? body : htmlToText(body)
      return text.slice(0, max_chars) + (text.length > max_chars ? '\n…(gekürzt)' : '')
    },
  },
  {
    name: 'web_search',
    description: 'Im Netz suchen (DuckDuckGo, kein Schlüssel nötig). Gibt Treffer mit Titel, Link, Auszug.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, count: { type: 'number' } },
      required: ['query'],
    },
    async run({ query, count = 8 }) {
      const res = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36',
        },
        body: new URLSearchParams({ q: query }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) throw new Error(`Suche kaputt: HTTP ${res.status}`)
      const html = await res.text()
      const hits = []
      const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
      const snips = [...html.matchAll(snipRe)].map((m) => htmlToText(m[1]))
      let m
      let i = 0
      while ((m = re.exec(html)) && hits.length < count) {
        let link = m[1]
        const u = link.match(/uddg=([^&]+)/)
        if (u) link = decodeURIComponent(u[1])
        hits.push(`${hits.length + 1}. ${htmlToText(m[2])}\n   ${link}\n   ${snips[i] || ''}`)
        i++
      }
      return hits.join('\n\n') || '(keine Treffer)'
    },
  },
  {
    name: 'web_browse',
    description:
      'Echten Browser fernsteuern (Playwright): Seite öffnen, klicken, tippen, Text lesen. Nur wenn Playwright da ist.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        actions: {
          type: 'array',
          description: 'Schritte, z.B. [{"click":"Anmelden"},{"type":{"selector":"#q","text":"hallo"}},{"wait":1000}]',
          items: { type: 'object' },
        },
      },
      required: ['url'],
    },
    danger: true,
    async run({ url, actions = [] }) {
      let chromium
      try {
        ;({ chromium } = await import('playwright'))
      } catch {
        throw new Error('Playwright fehlt. Erst: npm i -D playwright && npx playwright install chromium')
      }
      const browser = await chromium.launch({ headless: !loadConfig().browserSichtbar })
      try {
        const page = await browser.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        for (const a of actions) {
          if (a.click) await page.getByText(a.click, { exact: false }).first().click({ timeout: 10000 })
          if (a.type) await page.fill(a.type.selector, a.type.text)
          if (a.press) await page.keyboard.press(a.press)
          if (a.wait) await page.waitForTimeout(a.wait)
        }
        const text = htmlToText(await page.content())
        return `${page.url()}\n\n${text.slice(0, 15000)}`
      } finally {
        await browser.close()
      }
    },
  },
]
