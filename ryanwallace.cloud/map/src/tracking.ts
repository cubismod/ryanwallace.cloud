import * as L from 'leaflet'
import { return_colors } from './utils'
import { currentMarkers } from './marker-manager'

export type GetFeaturesFn = () => any[]

let trackedVehicleId: string | null = null
let trackedVehicleLabel: string | null = null
let trackedHalo: L.CircleMarker | null = null
let trackedPulse: L.Marker | null = null
let trackedPulseSize: number | null = null
let overlayBoostInterval: number | null = null
let overlayBoostTimeout: number | null = null

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

export function isTracking(id: string | number): boolean {
  return String(trackedVehicleId) === String(id)
}

export function getTrackedLabel(): string | null {
  return trackedVehicleLabel
}

export function clearTrackingOverlays(map: L.Map): void {
  if (trackedHalo) {
    map.removeLayer(trackedHalo)
    trackedHalo = null
  }
  if (trackedPulse) {
    map.removeLayer(trackedPulse)
    trackedPulse = null
  }
  trackedPulseSize = null
}

export function untrack(map: L.Map, updateStatus: () => void): void {
  trackedVehicleId = null
  trackedVehicleLabel = null
  clearTrackingOverlays(map)
  stopOverlayBoost()
  updateStatus()
}

export function trackById(
  id: string | number,
  map: L.Map,
  getFeatures: GetFeaturesFn,
  updateStatus: () => void
): void {
  trackedVehicleId = String(id)
  trackedVehicleLabel = null
  const marker = currentMarkers.get(String(id)) || currentMarkers.get(id as any)
  if (marker) {
    map.panTo(marker.getLatLng())
    const feats = getFeatures() || []
    const f = feats.find((x: any) => String(x.id) === String(trackedVehicleId))
    updateTrackedOverlays(map, marker, f)
    startOverlayBoost(() => refreshTrackedOverlays(map, getFeatures))
  }
  updateStatus()
}

export function refreshTrackedOverlays(
  map: L.Map,
  getFeatures: GetFeaturesFn
): void {
  if (!trackedVehicleId) return
  const marker =
    currentMarkers.get(String(trackedVehicleId)) ||
    (currentMarkers.get(trackedVehicleId as unknown as number) as any)
  if (!marker) return
  const feats = getFeatures() || []
  const f = feats.find((x: any) => String(x.id) === String(trackedVehicleId))
  updateTrackedOverlays(map, marker, f)
}

export function updateTrackedOverlays(
  map: L.Map,
  marker: L.Marker,
  feature: any | null
): void {
  const iconObj: any = marker.getIcon && (marker.getIcon() as any)
  const iconSize: L.Point = L.point(iconObj?.options?.iconSize || [0, 0])
  const iconAnchor: L.Point = L.point(
    iconObj?.options?.iconAnchor || [iconSize.x / 2, iconSize.y]
  )
  const base = map.latLngToLayerPoint(marker.getLatLng())
  const centerFactorY = 1.1
  const offsetX = iconSize.x / 2 - iconAnchor.x
  const offsetY = iconSize.y * centerFactorY - iconAnchor.y
  const centerPoint = base.add(L.point(offsetX, offsetY))
  const centerLatLng = map.layerPointToLatLng(centerPoint)

  let hexColor = '#ef4444'
  if (feature?.properties?.['marker-color']) {
    hexColor = feature.properties['marker-color']
  } else if (feature?.properties?.route) {
    try {
      hexColor = return_colors(feature.properties.route)
    } catch {}
  }
  const rgb = hexToRgb(hexColor) || { r: 239, g: 68, b: 68 }

  const zoom = map.getZoom()
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v))
  const haloRadius = clamp(12 + (zoom - 12) * 2, 10, 30)
  const pulseSize = Math.round(clamp(40 + (zoom - 12) * 8, 36, 120))

  if (!trackedHalo) {
    trackedHalo = L.circleMarker(centerLatLng, {
      radius: haloRadius,
      color: hexColor,
      weight: 2,
      opacity: 0.9,
      fill: false,
      dashArray: '4,4'
    }).addTo(map)
  } else {
    trackedHalo.setLatLng(centerLatLng).setRadius(haloRadius).bringToFront()
    trackedHalo.setStyle({ color: hexColor })
  }

  const pulseHtml = `<span style="--pulse-r:${rgb.r}; --pulse-g:${rgb.g}; --pulse-b:${rgb.b};"></span>`
  if (!trackedPulse) {
    const pulseIcon = L.divIcon({
      className: 'tracked-pulse',
      html: pulseHtml,
      iconSize: [pulseSize, pulseSize],
      iconAnchor: [pulseSize / 2, pulseSize / 2]
    })
    trackedPulse = L.marker(centerLatLng, {
      icon: pulseIcon,
      interactive: false,
      zIndexOffset: 2000
    }).addTo(map)
    trackedPulseSize = pulseSize
  } else {
    trackedPulse.setLatLng(centerLatLng)
    const el = trackedPulse.getElement() as HTMLElement | null
    if (el) {
      const span = el.querySelector('span') as HTMLElement | null
      if (span) {
        span.style.setProperty('--pulse-r', String(rgb.r))
        span.style.setProperty('--pulse-g', String(rgb.g))
        span.style.setProperty('--pulse-b', String(rgb.b))
      }
    }
    if (trackedPulseSize !== pulseSize) {
      const pulseIcon = L.divIcon({
        className: 'tracked-pulse',
        html: pulseHtml,
        iconSize: [pulseSize, pulseSize],
        iconAnchor: [pulseSize / 2, pulseSize / 2]
      })
      trackedPulse.setIcon(pulseIcon)
      trackedPulseSize = pulseSize
    }
  }

  // tracked label for status bar
  try {
    if (feature) {
      const route = feature.properties?.route || ''
      const headsign =
        feature.properties?.headsign || feature.properties?.stop || ''
      trackedVehicleLabel = `${route}${headsign ? ' → ' + headsign : ''}`
    }
  } catch {}
}

function startOverlayBoost(tick: () => void): void {
  stopOverlayBoost()
  overlayBoostInterval = window.setInterval(() => tick(), 100)
  overlayBoostTimeout = window.setTimeout(() => stopOverlayBoost(), 1500)
}

function stopOverlayBoost(): void {
  if (overlayBoostInterval) {
    window.clearInterval(overlayBoostInterval)
    overlayBoostInterval = null
  }
  if (overlayBoostTimeout) {
    window.clearTimeout(overlayBoostTimeout)
    overlayBoostTimeout = null
  }
}

export function hookZoom(map: L.Map, getFeatures: GetFeaturesFn): void {
  const handler = () => refreshTrackedOverlays(map, getFeatures)
  map.on('zoom', handler)
  map.on('zoomend', handler)
}

export function trackedId(): string | null {
  return trackedVehicleId
}
