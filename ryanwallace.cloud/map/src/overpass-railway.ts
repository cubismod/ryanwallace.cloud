import * as L from 'leaflet'
import { shouldDisableOverpass, getConnectionInfo } from './connection-detector'

export interface OverpassElement {
  type: 'way'
  id: number
  geometry: Array<{ lat: number; lon: number }>
  tags: Record<string, string>
}

export interface OverpassResponse {
  version: number
  generator: string
  elements: OverpassElement[]
}

export interface RailwayTrack {
  id: number
  geometry: L.LatLng[]
  railway: string
  usage?: string
  service?: string
  operator?: string
  electrified?: string
  maxspeed?: string
  gauge?: string
}

const OVERPASS_ENDPOINT = 'https://overpass.private.coffee/api/interpreter'

// Boston metropolitan area bounding box
const BOSTON_BBOX = {
  south: 42.1,
  west: -71.3,
  north: 42.6,
  east: -70.8
}

// Cache configuration
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
const CACHE_VERSION = 'v1.0'
const CACHE_KEY = `mbta-railway-tracks-${CACHE_VERSION}`
const MAX_CACHE_SIZE = 5 * 1024 * 1024 // 5MB

// In-memory cache for railway data
let cachedRailwayTracks: RailwayTrack[] | null = null
let cacheTimestamp: number | null = null
let isLoading = false
let loadingPromise: Promise<RailwayTrack[]> | null = null

// Track loading callbacks for progressive enhancement
const loadingCallbacks: Array<(tracks: RailwayTrack[]) => void> = []

interface CacheData {
  tracks: RailwayTrack[]
  timestamp: number
  version: string
  bbox: typeof BOSTON_BBOX
}

function saveToLocalStorage(tracks: RailwayTrack[]): void {
  try {
    const cacheData: CacheData = {
      tracks,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      bbox: BOSTON_BBOX
    }

    const serialized = JSON.stringify(cacheData)

    // Check cache size
    if (serialized.length > MAX_CACHE_SIZE) {
      console.warn('Railway tracks cache too large, skipping localStorage save')
      return
    }

    localStorage.setItem(CACHE_KEY, serialized)
    console.log(
      `Saved ${tracks.length} railway tracks to localStorage (${(serialized.length / 1024).toFixed(1)}KB)`
    )
  } catch (error) {
    console.warn('Failed to save railway tracks to localStorage:', error)
  }
}

function loadFromLocalStorage(): RailwayTrack[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) {
      return null
    }

    const cacheData: CacheData = JSON.parse(cached)

    // Validate cache version
    if (cacheData.version !== CACHE_VERSION) {
      console.log('Railway tracks cache version mismatch, clearing cache')
      clearLocalStorageCache()
      return null
    }

    // Check cache age
    const age = Date.now() - cacheData.timestamp
    if (age > CACHE_DURATION) {
      console.log('Railway tracks cache expired, clearing cache')
      clearLocalStorageCache()
      return null
    }

    // Validate bbox (in case we change the area)
    if (JSON.stringify(cacheData.bbox) !== JSON.stringify(BOSTON_BBOX)) {
      console.log('Railway tracks cache bbox changed, clearing cache')
      clearLocalStorageCache()
      return null
    }

    console.log(
      `Loaded ${cacheData.tracks.length} railway tracks from localStorage cache`
    )
    return cacheData.tracks
  } catch (error) {
    console.warn('Failed to load railway tracks from localStorage:', error)
    clearLocalStorageCache()
    return null
  }
}

function clearLocalStorageCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
    // Also clear any old cache versions
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('mbta-railway-tracks-')) {
        localStorage.removeItem(key)
      }
    }
  } catch (error) {
    console.warn('Failed to clear localStorage cache:', error)
  }
}

export function onRailwayTracksLoaded(
  callback: (tracks: RailwayTrack[]) => void
): void {
  if (cachedRailwayTracks) {
    // Tracks already loaded, call immediately
    callback(cachedRailwayTracks)
  } else {
    // Add to callback list for when tracks load
    loadingCallbacks.push(callback)
  }
}

function notifyLoadingCallbacks(tracks: RailwayTrack[]): void {
  loadingCallbacks.forEach((callback) => {
    try {
      callback(tracks)
    } catch (error) {
      console.warn('Error in railway tracks loading callback:', error)
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

export function buildOverpassQuery(bbox = BOSTON_BBOX): string {
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
    if (age < CACHE_DURATION) {
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
    console.log('Fetching railway tracks from Overpass API...')
    const query = buildOverpassQuery()

    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: `data=${encodeURIComponent(query)}`
    })

    if (!response.ok) {
      throw new Error(
        `Overpass API error: ${response.status} ${response.statusText}`
      )
    }

    const data: OverpassResponse = await response.json()
    const tracks = convertOverpassToRailwayTracks(data)

    // Update both caches
    cachedRailwayTracks = tracks
    cacheTimestamp = Date.now()
    saveToLocalStorage(tracks)

    console.log(`Fetched ${tracks.length} railway tracks from Overpass API`)
    return tracks
  } catch (error) {
    console.error('Failed to fetch railway tracks:', error)
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
  type: 'heavy_rail' | 'light_rail' | 'subway'
): RailwayTrack[] {
  switch (type) {
    case 'heavy_rail':
      return tracks.filter(
        (track) =>
          track.railway === 'rail' &&
          track.usage !== 'industrial' &&
          track.service !== 'siding' &&
          track.service !== 'yard'
      )
    case 'light_rail':
      return tracks.filter((track) => track.railway === 'light_rail')
    case 'subway':
      return tracks.filter((track) => track.railway === 'subway')
    default:
      return tracks
  }
}

export function getTracksForRoute(
  tracks: RailwayTrack[],
  route: string
): RailwayTrack[] {
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

export function getCacheInfo(): {
  hasMemoryCache: boolean
  hasLocalStorageCache: boolean
  age?: number
  trackCount?: number
  cacheSize?: string
} {
  const hasMemoryCache = !!(cachedRailwayTracks && cacheTimestamp)
  const age = cacheTimestamp ? Date.now() - cacheTimestamp : undefined

  let hasLocalStorageCache = false
  let cacheSize = undefined

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    hasLocalStorageCache = !!cached
    if (cached) {
      cacheSize = `${(cached.length / 1024).toFixed(1)}KB`
    }
  } catch (error) {
    // localStorage might not be available
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
  }, 100) // Small delay to ensure map loads first
}

// Legacy promise for backward compatibility
export const railwayTracksPromise = fetchRailwayTracks()

// Auto-initialize on module load
initializeRailwayTracks()
