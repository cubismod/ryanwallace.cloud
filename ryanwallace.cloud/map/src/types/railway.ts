import * as L from 'leaflet'

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

export interface BoundingBox {
  south: number
  west: number
  north: number
  east: number
}

export interface CacheData {
  tracks: RailwayTrack[]
  timestamp: number
  version: string
  bbox: BoundingBox
}

export interface CacheInfo {
  hasMemoryCache: boolean
  hasLocalStorageCache: boolean
  age?: number
  trackCount?: number
  cacheSize?: string
}

export type RailwayType = 'heavy_rail' | 'light_rail' | 'subway'

export interface RailwayConfig {
  cacheKey: string
  cacheDuration: number
  maxCacheSize: number
  version: string
  endpoint: string
  bbox: BoundingBox
}

export interface LoadingCallbackFunction {
  (tracks: RailwayTrack[]): void
}
