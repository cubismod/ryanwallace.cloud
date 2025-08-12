// Lightweight Web Worker to fetch and sanitize Overpass railway data
// Kept independent from Leaflet and main-thread-only utilities.

// Minimal inlined types to avoid importing leaflet-dependent modules
type OverpassElement = {
  type: 'way'
  id: number
  geometry: Array<{ lat: number; lon: number }>
  tags: Record<string, string>
}

type OverpassResponse = {
  version: number
  generator: string
  elements: OverpassElement[]
}

type BoundingBox = {
  south: number
  west: number
  north: number
  east: number
}

type WorkerRequest = { type: 'fetch'; endpoint: string; bbox: BoundingBox }

type WorkerResponse =
  | { type: 'success'; data: OverpassResponse }
  | { type: 'error'; error: string }

function validateOverpassElement(element: unknown): element is OverpassElement {
  if (typeof element !== 'object' || element === null) return false
  const el = element as Record<string, unknown>
  if (
    el.type !== 'way' ||
    typeof el.id !== 'number' ||
    !Array.isArray(el.geometry) ||
    typeof el.tags !== 'object' ||
    el.tags === null
  )
    return false
  for (const point of el.geometry) {
    if (typeof point !== 'object' || point === null) return false
    const pt = point as Record<string, unknown>
    if (typeof pt.lat !== 'number' || typeof pt.lon !== 'number') return false
    if (pt.lat < -90 || pt.lat > 90 || pt.lon < -180 || pt.lon > 180)
      return false
  }
  return true
}

function validateOverpassResponse(data: unknown): data is OverpassResponse {
  if (typeof data !== 'object' || data === null) return false
  const response = data as Record<string, unknown>
  if (
    typeof response.version !== 'number' ||
    typeof response.generator !== 'string' ||
    !Array.isArray(response.elements)
  )
    return false
  for (const element of response.elements) {
    if (!validateOverpassElement(element)) return false
  }
  return true
}

function sanitizeOverpassResponse(data: OverpassResponse): OverpassResponse {
  return {
    version: data.version,
    generator: data.generator,
    elements: data.elements
      .filter(
        (element) => element.type === 'way' && element.geometry.length >= 2
      )
      .map((element) => ({
        type: element.type,
        id: element.id,
        geometry: element.geometry.map((point) => ({
          lat: Math.max(-90, Math.min(90, point.lat)),
          lon: Math.max(-180, Math.min(180, point.lon))
        })),
        tags: Object.fromEntries(
          Object.entries(element.tags).map(([key, value]) => [
            key.slice(0, 100),
            String(value).slice(0, 500)
          ])
        )
      }))
  }
}

function buildOverpassQuery(bbox: BoundingBox): string {
  return `
    [out:json][timeout:30];
    (
      way["railway"~"^(rail|light_rail|subway|tram)$"]
         ["usage"!="military"]
         ["service"!="siding"]
         ["service"!="yard"]
         (${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out geom;
  `.trim()
}

async function fetchOverpass(
  endpoint: string,
  bbox: BoundingBox
): Promise<OverpassResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const query = buildOverpassQuery(bbox)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(
        `Overpass API error: ${response.status} ${response.statusText}`
      )
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      throw new Error(`Invalid response content type: ${contentType}`)
    }
    const raw = await response.json()
    if (!validateOverpassResponse(raw)) {
      throw new Error('Invalid Overpass API response structure')
    }
    return sanitizeOverpassResponse(raw)
  } finally {
    clearTimeout(timeout)
  }
}

self.addEventListener('message', async (evt: MessageEvent<WorkerRequest>) => {
  const msg = evt.data
  if (!msg || msg.type !== 'fetch') return
  try {
    const data = await fetchOverpass(msg.endpoint, msg.bbox)
    const response: WorkerResponse = { type: 'success', data }
    ;(self as any).postMessage(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const response: WorkerResponse = { type: 'error', error: message }
    ;(self as any).postMessage(response)
  }
})
