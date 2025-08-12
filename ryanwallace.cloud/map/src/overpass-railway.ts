import * as L from 'leaflet'
import { shouldDisableOverpass } from './connection-detector'
import {
  OverpassResponse,
  RailwayTrack,
  BoundingBox,
  CacheData,
  CacheInfo,
  RailwayType,
  RailwayConfig,
  LoadingCallbackFunction
} from './types/railway'
import { CacheError, ValidationError, logError } from './types/errors'

const OVERPASS_ENDPOINT: string =
  'https://overpass.private.coffee/api/interpreter'

// Boston metropolitan area bounding box
const BOSTON_BBOX: BoundingBox = {
  south: 42.1,
  west: -71.3,
  north: 42.6,
  east: -70.8
}

// Cache configuration
const RAILWAY_CONFIG: RailwayConfig = {
  cacheKey: 'mbta-railway-tracks-v1.0',
  cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
  maxCacheSize: 5 * 1024 * 1024, // 5MB
  version: 'v1.0',
  endpoint: OVERPASS_ENDPOINT,
  bbox: BOSTON_BBOX
}

// In-memory cache for railway data
let cachedRailwayTracks: RailwayTrack[] | null = null
let cacheTimestamp: number | null = null
let isLoading: boolean = false
let loadingPromise: Promise<RailwayTrack[]> | null = null

// Track loading callbacks for progressive enhancement
const loadingCallbacks: LoadingCallbackFunction[] = []

// Single worker instance for Overpass fetches
let railwayWorker: Worker | null = null

function getRailwayWorker(): Worker {
  if (railwayWorker) return railwayWorker
  railwayWorker = new Worker(
    new URL('./overpass-railway.worker.ts', import.meta.url),
    { type: 'module' }
  )
  return railwayWorker
}

function workerFetchOverpass(): Promise<OverpassResponse> {
  return new Promise((resolve, reject) => {
    const worker = getRailwayWorker()
    const onMessage = (evt: MessageEvent) => {
      const data = evt.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'success') {
        cleanup()
        resolve(data.data as OverpassResponse)
      } else if (data.type === 'error') {
        cleanup()
        reject(new Error(String(data.error)))
      }
    }
    const onError = (err: ErrorEvent) => {
      cleanup()
      reject(new Error(err.message))
    }
    const cleanup = () => {
      worker.removeEventListener('message', onMessage as EventListener)
      worker.removeEventListener('error', onError as EventListener)
    }
    worker.addEventListener('message', onMessage as EventListener)
    worker.addEventListener('error', onError as EventListener)
    worker.postMessage({
      type: 'fetch',
      endpoint: RAILWAY_CONFIG.endpoint,
      bbox: RAILWAY_CONFIG.bbox
    })
  })
}

// Security validation is performed within the worker before returning data.

function saveToLocalStorage(tracks: RailwayTrack[]): void {
  try {
    const cacheData: CacheData = {
      tracks,
      timestamp: Date.now(),
      version: RAILWAY_CONFIG.version,
      bbox: RAILWAY_CONFIG.bbox
    }

    const serialized: string = JSON.stringify(cacheData)

    // Check cache size
    if (serialized.length > RAILWAY_CONFIG.maxCacheSize) {
      throw new CacheError(
        `Cache data too large: ${serialized.length} bytes exceeds limit of ${RAILWAY_CONFIG.maxCacheSize}`,
        'save',
        'SIZE_LIMIT_EXCEEDED'
      )
    }

    localStorage.setItem(RAILWAY_CONFIG.cacheKey, serialized)
    console.log(
      `Saved ${tracks.length} railway tracks to localStorage (${(serialized.length / 1024).toFixed(1)}KB)`
    )
  } catch (error) {
    logError(error, 'saveToLocalStorage')
  }
}

function loadFromLocalStorage(): RailwayTrack[] | null {
  try {
    const cached: string | null = localStorage.getItem(RAILWAY_CONFIG.cacheKey)
    if (!cached) {
      return null
    }

    const cacheData: CacheData = JSON.parse(cached)

    // Validate cache structure
    if (
      !cacheData.tracks ||
      !Array.isArray(cacheData.tracks) ||
      typeof cacheData.timestamp !== 'number' ||
      typeof cacheData.version !== 'string'
    ) {
      throw new CacheError(
        'Invalid cache data structure',
        'load',
        'INVALID_STRUCTURE'
      )
    }

    // Validate cache version
    if (cacheData.version !== RAILWAY_CONFIG.version) {
      console.log('Railway tracks cache version mismatch, clearing cache')
      clearLocalStorageCache()
      return null
    }

    // Check cache age
    const age: number = Date.now() - cacheData.timestamp
    if (age > RAILWAY_CONFIG.cacheDuration) {
      console.log('Railway tracks cache expired, clearing cache')
      clearLocalStorageCache()
      return null
    }

    // Validate bbox (in case we change the area)
    if (
      JSON.stringify(cacheData.bbox) !== JSON.stringify(RAILWAY_CONFIG.bbox)
    ) {
      console.log('Railway tracks cache bbox changed, clearing cache')
      clearLocalStorageCache()
      return null
    }

    console.log(
      `Loaded ${cacheData.tracks.length} railway tracks from localStorage cache`
    )
    return cacheData.tracks
  } catch (error) {
    logError(error, 'loadFromLocalStorage')
    clearLocalStorageCache()
    return null
  }
}

function clearLocalStorageCache(): void {
  try {
    localStorage.removeItem(RAILWAY_CONFIG.cacheKey)
    // Also clear any old cache versions
    for (let i = 0; i < localStorage.length; i++) {
      const key: string | null = localStorage.key(i)
      if (key && key.startsWith('mbta-railway-tracks-')) {
        localStorage.removeItem(key)
      }
    }
  } catch (error) {
    logError(error, 'clearLocalStorageCache')
  }
}

export function onRailwayTracksLoaded(callback: LoadingCallbackFunction): void {
  if (cachedRailwayTracks) {
    // Tracks already loaded, call immediately
    callback(cachedRailwayTracks)
  } else {
    // Add to callback list for when tracks load
    loadingCallbacks.push(callback)
  }
}

function notifyLoadingCallbacks(tracks: RailwayTrack[]): void {
  loadingCallbacks.forEach((callback: LoadingCallbackFunction) => {
    try {
      callback(tracks)
    } catch (error) {
      logError(error, 'notifyLoadingCallbacks')
    }
  })
  loadingCallbacks.length = 0 // Clear callbacks after notification
}

export function isRailwayTracksLoading(): boolean {
  return isLoading
}

export function hasRailwayTracks(): boolean {
  return !!cachedRailwayTracks
}

export function getRailwayTracksSync(): RailwayTrack[] {
  return cachedRailwayTracks || []
}

export function buildOverpassQuery(
  bbox: BoundingBox = RAILWAY_CONFIG.bbox
): string {
  // Validate bounding box
  if (
    bbox.south >= bbox.north ||
    bbox.west >= bbox.east ||
    bbox.south < -90 ||
    bbox.north > 90 ||
    bbox.west < -180 ||
    bbox.east > 180
  ) {
    throw new ValidationError(
      'Invalid bounding box coordinates',
      'bbox',
      'INVALID_BBOX'
    )
  }

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

export async function fetchRailwayTracks(
  forceRefresh = false
): Promise<RailwayTrack[]> {
  // Check if Overpass should be disabled due to connection or preferences
  if (!forceRefresh && shouldDisableOverpass()) {
    console.log('Overpass railway tracks disabled for this connection')
    return []
  }

  // Return existing loading promise if already in progress
  if (!forceRefresh && isLoading && loadingPromise) {
    return loadingPromise
  }

  // Check in-memory cache first
  if (!forceRefresh && cachedRailwayTracks && cacheTimestamp) {
    const age = Date.now() - cacheTimestamp
    if (age < RAILWAY_CONFIG.cacheDuration) {
      console.log('Using in-memory cached railway tracks')
      return cachedRailwayTracks
    }
  }

  // Check localStorage cache
  if (!forceRefresh) {
    const localStorageTracks = loadFromLocalStorage()
    if (localStorageTracks) {
      // Update in-memory cache
      cachedRailwayTracks = localStorageTracks
      cacheTimestamp = Date.now()
      // Notify callbacks with cached data
      notifyLoadingCallbacks(localStorageTracks)
      return localStorageTracks
    }
  }

  // Start loading process
  isLoading = true
  loadingPromise = performFetch()

  try {
    const tracks = await loadingPromise
    isLoading = false
    loadingPromise = null

    // Notify all callbacks
    notifyLoadingCallbacks(tracks)

    return tracks
  } catch (error) {
    isLoading = false
    loadingPromise = null
    throw error
  }
}

async function performFetch(): Promise<RailwayTrack[]> {
  try {
    console.log('Fetching railway tracks from Overpass API via worker...')
    const overpassData: OverpassResponse = await workerFetchOverpass()
    const tracks: RailwayTrack[] = convertOverpassToRailwayTracks(overpassData)

    // Validate track count is reasonable
    if (tracks.length > 10000) {
      throw new ValidationError(
        `Unexpectedly large number of tracks: ${tracks.length}`,
        'track_count',
        'EXCESSIVE_TRACK_COUNT'
      )
    }

    // Update both caches
    cachedRailwayTracks = tracks
    cacheTimestamp = Date.now()
    saveToLocalStorage(tracks)

    console.log(`Fetched ${tracks.length} railway tracks from Overpass API`)
    return tracks
  } catch (error) {
    logError(error, 'performFetch')
    // Return cached data if available, otherwise empty array
    return cachedRailwayTracks || []
  }
}

export function convertOverpassToRailwayTracks(
  data: OverpassResponse
): RailwayTrack[] {
  return data.elements
    .filter(
      (element) =>
        element.type === 'way' &&
        element.geometry &&
        element.geometry.length >= 2
    )
    .map((element) => {
      const geometry = element.geometry.map((point) =>
        L.latLng(point.lat, point.lon)
      )

      return {
        id: element.id,
        geometry,
        railway: element.tags.railway || 'rail',
        usage: element.tags.usage,
        service: element.tags.service,
        operator: element.tags.operator,
        electrified: element.tags.electrified,
        maxspeed: element.tags.maxspeed,
        gauge: element.tags.gauge
      }
    })
}

export function filterTracksByType(
  tracks: RailwayTrack[],
  type: RailwayType
): RailwayTrack[] {
  switch (type) {
    case 'heavy_rail':
      return tracks.filter(
        (track: RailwayTrack) =>
          track.railway === 'rail' &&
          track.usage !== 'industrial' &&
          track.service !== 'siding' &&
          track.service !== 'yard'
      )
    case 'light_rail':
      return tracks.filter(
        (track: RailwayTrack) => track.railway === 'light_rail'
      )
    case 'subway':
      return tracks.filter((track: RailwayTrack) => track.railway === 'subway')
    default:
      return tracks
  }
}

export function getTracksForRoute(
  tracks: RailwayTrack[],
  route: string
): RailwayTrack[] {
  // Validate route parameter
  if (typeof route !== 'string' || route.length === 0) {
    throw new ValidationError(
      'Invalid route parameter',
      'route',
      'INVALID_ROUTE'
    )
  }

  // Map MBTA routes to railway types
  if (route.startsWith('CR-')) {
    return filterTracksByType(tracks, 'heavy_rail')
  }

  if (
    route.startsWith('Red') ||
    route.startsWith('Blue') ||
    route.startsWith('Orange') ||
    route.startsWith('Mattapan')
  ) {
    return filterTracksByType(tracks, 'subway')
  }

  if (route.startsWith('Green')) {
    return filterTracksByType(tracks, 'light_rail')
  }

  return []
}

export function convertTracksToPolylines(tracks: RailwayTrack[]): L.Polyline[] {
  return tracks.map((track) => L.polyline(track.geometry))
}

// Cache management functions
export function clearRailwayCache(): void {
  cachedRailwayTracks = null
  cacheTimestamp = null
  clearLocalStorageCache()
  console.log('Railway tracks cache cleared')
}

export function refreshRailwayTracks(): Promise<RailwayTrack[]> {
  console.log('Manually refreshing railway tracks...')
  return fetchRailwayTracks(true)
}

export function getCacheInfo(): CacheInfo {
  const hasMemoryCache: boolean = !!(cachedRailwayTracks && cacheTimestamp)
  const age: number | undefined = cacheTimestamp
    ? Date.now() - cacheTimestamp
    : undefined

  let hasLocalStorageCache: boolean = false
  let cacheSize: string | undefined = undefined

  try {
    const cached: string | null = localStorage.getItem(RAILWAY_CONFIG.cacheKey)
    hasLocalStorageCache = !!cached
    if (cached) {
      cacheSize = `${(cached.length / 1024).toFixed(1)}KB`
    }
  } catch (error) {
    logError(error, 'getCacheInfo')
  }

  return {
    hasMemoryCache,
    hasLocalStorageCache,
    age,
    trackCount: cachedRailwayTracks?.length,
    cacheSize
  }
}

// Add to global window for debugging
if (typeof window !== 'undefined') {
  ;(window as any).railwayCache = {
    clear: clearRailwayCache,
    refresh: refreshRailwayTracks,
    info: getCacheInfo
  }
}

// Initialize railway tracks in background - non-blocking
export function initializeRailwayTracks(): void {
  // Start background loading immediately but don't block module import
  setTimeout(() => {
    fetchRailwayTracks().catch((error) => {
      console.warn('Background railway tracks loading failed:', error)
    })
  }, 100)
}

// Legacy promise for backward compatibility
export const railwayTracksPromise = fetchRailwayTracks()

// Auto-initialize on module load
initializeRailwayTracks()
