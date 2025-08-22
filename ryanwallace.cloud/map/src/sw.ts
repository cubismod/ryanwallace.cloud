// Simple service worker for /map/ scope
const VERSION = 'v1'
const SHELL_CACHE = `map-shell-${VERSION}`
const RUNTIME_CACHE = `map-runtime-${VERSION}`

self.addEventListener('install', (event: any) => {
  // Skip waiting so new SW becomes active quickly
  ;(self as any).skipWaiting()
  event.waitUntil(caches.open(SHELL_CACHE))
})

self.addEventListener('activate', (event: any) => {
  // Clean up old caches
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
            .map((k) => caches.delete(k))
        )
      )
  )
  ;(self as any).clients.claim()
})

// Helper to clone and put in cache safely
async function putInCache(
  cacheName: string,
  request: Request,
  response: Response
) {
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  } catch (_) {}
}

function isTile(url: URL): boolean {
  return (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('api.maptiler.com')
  )
}

function isStaticAsset(url: URL): boolean {
  return (
    url.pathname.startsWith('/map/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png')
  )
}

self.addEventListener('fetch', (event: any) => {
  const req: Request = event.request
  const url = new URL(req.url)

  // Bypass SSE/EventSource entirely – let the browser handle streaming
  const accept = req.headers.get('accept') || ''
  if (
    req.method !== 'GET' ||
    accept.includes('text/event-stream') ||
    url.pathname.includes('/stream')
  ) {
    return // don't call respondWith -> default network fetch without SW interference
  }

  // Network-first for vehicle data
  if (url.pathname.includes('/vehicles')) {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(req)
          // Do not cache vehicles responses
          return networkResp
        } catch (_) {
          // Fallback to cache if present (unlikely for vehicles)
          const cache = await caches.open(RUNTIME_CACHE)
          const cached = await cache.match(req)
          if (cached) return cached
          throw _
        }
      })()
    )
    return
  }

  // Cache-first for shapes and tiles and static assets; revalidate in background
  if (url.pathname.includes('/shapes') || isTile(url) || isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE)
        const cached = await cache.match(req)
        if (cached) {
          // Revalidate in background
          fetch(req)
            .then((resp) => {
              if (resp && resp.ok) putInCache(RUNTIME_CACHE, req, resp)
            })
            .catch(() => {})
          return cached
        }
        const resp = await fetch(req)
        if (resp && resp.ok) await putInCache(RUNTIME_CACHE, req, resp)
        return resp
      })()
    )
  }
})
