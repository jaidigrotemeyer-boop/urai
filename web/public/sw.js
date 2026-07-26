// Kleiner Service Worker: Hülle offline halten, nie API/WS abfangen.
const CACHE = 'urai-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return
  if (url.origin !== location.origin) return

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  )
})
