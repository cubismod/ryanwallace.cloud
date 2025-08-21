import * as L from 'leaflet'
import '@petoc/leaflet-double-touch-drag-zoom'
import 'leaflet/dist/leaflet.css'
import '@petoc/leaflet-double-touch-drag-zoom/src/leaflet-double-touch-drag-zoom.css'
import 'leaflet.fullscreen'
import 'leaflet-easybutton'
import 'leaflet-arrowheads'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'invert-color'
import { MaptilerLayer } from '@maptiler/leaflet-maptilersdk'

// Import modules
import { setCookie, getCookie, return_colors } from './utils'
import { pointToLayer, onEachFeature, updateVehicleFeatures } from './markers'
import {
  layerGroups,
  shapesLayerGroups,
  getShapesLayerGroupForRoute
} from './layer-groups'
import {
  updateMarkers,
  refreshAllElfClasses,
  findTopElfTrains,
  jumpToElfTrain,
  currentMarkers
} from './marker-manager'
import { updateTable } from './table-manager'
import { alerts } from './alerts'
import { fetchAmtrakData } from './amtrak'

// Extend jQuery to include getJSON method with Promise support
declare const $: {
  getJSON: (
    url: string,
    callback?: (data: any) => void
  ) => {
    done: (callback: (data: any) => void) => any
    fail: (
      callback: (jqXHR: any, textStatus: string, errorThrown?: string) => void
    ) => any
  }
}

// Extend window to include moveMapToStop function and buildingMarkers
declare global {
  interface Window {
    moveMapToStop: (lat: number, lng: number) => void
    buildingMarkers: L.GeoJSON | null
    trackVehicleById: (id: string | number) => void
    untrackVehicle: () => void
    isTrackingVehicleId: (id: string | number) => boolean
  }
}

var map = L.map('map', {
  doubleTouchDragZoom: true,
  // @ts-expect-error - fullscreenControl is not a valid option
  fullscreenControl: true,
  preferCanvas: true,
  maxZoom: 50,

  fullscreenControlOptions: {
    position: 'topleft',
    title: 'Fullscreen',
    forcePseudoFullscreen: true
    // fullscreenElement: true
  }
}).setView([42.36565, -71.05236], 13)

// map.on('enterFullscreen', function () {
//   let elements = document.getElementsByClassName('leaflet-zoom-animated')
//   for (const element of elements) {
//     console.debug(element.tagName)
//     if (element.tagName === 'CANVAS') element.setAttribute('height', '100%')
//   }
// })

const vehicles_url: string =
  process.env.VEHICLES_URL || 'https://imt.ryanwallace.cloud'
const bos_url: string = 'https://bos.ryanwallace.cloud'

let baseLayerLoaded: boolean = false
let buildingMarkers: L.GeoJSON | null = null
let lastVehicleUpdate: number = 0
let vehicleDataCache: any = null
let adaptiveRefreshRate: number = 15
let CACHE_DURATION = 5000 // 5 seconds - will be adjusted based on connection
let trackedVehicleId: string | number | null = null
let trackedVehicleLabel: string | null = null

function updateTrackingStatusUI(): void {
  const el = document.getElementById('tracking-status')
  const stopBtn = document.getElementById(
    'tracking-stop-btn'
  ) as HTMLButtonElement | null
  if (!el) return
  el.classList.remove('live-streaming', 'live-polling', 'live-connecting')
  if (trackedVehicleId !== null) {
    el.textContent = trackedVehicleLabel
      ? `Tracking: ${trackedVehicleLabel}`
      : 'Tracking'
    el.classList.add('live-streaming')
    if (stopBtn) stopBtn.style.display = 'inline-flex'
  } else {
    el.textContent = 'Off'
    el.classList.add('live-polling')
    if (stopBtn) stopBtn.style.display = 'none'
  }
}

// SSE vehicle stream state
let vehicleEventSource: EventSource | null = null
let sseActive = false
let sseReconnectTimer: number | null = null
let sseBackoffMs = 1000 // start with 1s, max ~30s
let sseImmediateMode = false // when true, apply SSE updates immediately
let sseHeartbeatTimer: number | null = null
let lastSSEActivityMs = 0

function startSSEHeartbeatMonitor(): void {
  if (sseHeartbeatTimer) return
  // Check every 15s; if we haven't seen activity in 60s, force reconnect
  sseHeartbeatTimer = window.setInterval(() => {
    if (!sseActive) return
    const now = Date.now()
    if (lastSSEActivityMs && now - lastSSEActivityMs > 60000) {
      // Consider the stream stale and reconnect
      stopVehicleSSE()
      startUpdateInterval()
      scheduleSSEReconnect()
    }
  }, 15000)
}

function stopSSEHeartbeatMonitor(): void {
  if (sseHeartbeatTimer) {
    window.clearInterval(sseHeartbeatTimer)
    sseHeartbeatTimer = null
  }
}

function updateSSEStatusUI(
  state: 'streaming' | 'polling' | 'connecting'
): void {
  const el = document.getElementById('sse-status')
  if (!el) return
  el.classList.remove('live-streaming', 'live-polling', 'live-connecting')
  if (state === 'streaming') {
    el.textContent = 'Streaming'
    el.classList.add('live-streaming')
  } else if (state === 'connecting') {
    el.textContent = 'Connecting…'
    el.classList.add('live-connecting')
  } else {
    el.textContent = 'Polling'
    el.classList.add('live-polling')
  }
}

function stopVehicleSSE(): void {
  if (vehicleEventSource) {
    vehicleEventSource.close()
    vehicleEventSource = null
  }
  if (sseReconnectTimer) {
    window.clearTimeout(sseReconnectTimer)
    sseReconnectTimer = null
  }
  stopSSEHeartbeatMonitor()
  sseActive = false
  updateSSEStatusUI('polling')
}

function scheduleSSEReconnect(): void {
  if (sseReconnectTimer) return
  const delay = Math.min(sseBackoffMs, 30000)
  sseReconnectTimer = window.setTimeout(() => {
    sseReconnectTimer = null
    startVehicleSSE()
  }, delay)
  sseBackoffMs *= 2
}

function startVehicleSSE(): boolean {
  if (typeof EventSource === 'undefined') return false
  if (vehicleEventSource) return true

  try {
    updateSSEStatusUI('connecting')
    const url = `${vehicles_url}/vehicles/stream`
    vehicleEventSource = new EventSource(url)

    vehicleEventSource.onopen = () => {
      sseActive = true
      sseBackoffMs = 1000
      // Determine if user wants immediate updates (refresh-rate = 0)
      sseImmediateMode = isImmediateModeSelected()
      lastSSEActivityMs = Date.now()
      startSSEHeartbeatMonitor()
      // If immediate mode, prefer push-only; otherwise keep interval for throttled UI updates
      if (sseImmediateMode) {
        stopUpdateInterval()
      } else if (!intervalID && isTabVisible) {
        startUpdateInterval()
      }
      updateSSEStatusUI('streaming')
    }

    // Common handler to process SSE JSON payloads
    const handleSSEPayload = (raw: string) => {
      if (!raw) return
      lastSSEActivityMs = Date.now()
      try {
        const data = JSON.parse(raw)
        // Always update cache timestamp
        vehicleDataCache = data
        lastVehicleUpdate = Date.now()
        // Apply immediately only when in immediate mode; otherwise, let interval drive UI updates
        if (sseImmediateMode) {
          processVehicleData(data)
        }
      } catch (_e) {
        // Ignore malformed payloads
      }
    }

    // Default message events
    vehicleEventSource.onmessage = (evt: MessageEvent) => {
      handleSSEPayload(evt.data)
    }

    // Support named events commonly used by SSE backends
    // e.g. "snapshot", "vehicles", etc.
    vehicleEventSource.addEventListener('snapshot', (evt: MessageEvent) => {
      handleSSEPayload((evt as MessageEvent).data)
    })
    vehicleEventSource.addEventListener('vehicles', (evt: MessageEvent) => {
      handleSSEPayload((evt as MessageEvent).data)
    })

    vehicleEventSource.onerror = () => {
      // Drop SSE and fall back to polling, then try to reconnect
      stopVehicleSSE()
      // Kick a one-off poll to avoid stale UI
      annotate_map()
      startUpdateInterval()
      scheduleSSEReconnect()
    }

    return true
  } catch (_e) {
    // If EventSource failed to construct, use polling
    stopVehicleSSE()
    return false
  }
}

// Elf emoji marker layer and helpers
let elfEmojiLayer: L.LayerGroup | null = null
let elfEmojiMoveHandlersAttached = false
let elfEmojiRegenTimeout: number | null = null
let elfEmojiStyleInjected = false

// Emoji variants (gender-neutral, woman, and man elves with all skin tones)
const ELF_EMOJIS = [
  '🧝',
  '🧝🏻',
  '🧝🏼',
  '🧝🏽',
  '🧝🏾',
  '🧝🏿',
  '🧝‍♀️',
  '🧝🏻‍♀️',
  '🧝🏼‍♀️',
  '🧝🏽‍♀️',
  '🧝🏾‍♀️',
  '🧝🏿‍♀️',
  '🧝‍♂️',
  '🧝🏻‍♂️',
  '🧝🏼‍♂️',
  '🧝🏽‍♂️',
  '🧝🏾‍♂️',
  '🧝🏿‍♂️'
]
function getRandomElfEmoji(): string {
  const idx = Math.floor(Math.random() * ELF_EMOJIS.length)
  return ELF_EMOJIS[idx]
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function clearElfEmojiMarkers(): void {
  if (elfEmojiLayer) {
    elfEmojiLayer.clearLayers()
  }
}

function detachElfEmojiHandlers(): void {
  if (elfEmojiMoveHandlersAttached) {
    map.off('moveend', handleElfEmojiRegen)
    map.off('zoomend', handleElfEmojiRegen)
    elfEmojiMoveHandlersAttached = false
  }
}

function handleElfEmojiRegen(): void {
  if (elfEmojiRegenTimeout) {
    window.clearTimeout(elfEmojiRegenTimeout)
  }
  // Debounce to avoid excessive redraws while panning
  elfEmojiRegenTimeout = window.setTimeout(() => {
    populateElfEmojiMarkers()
  }, 250)
}

function populateElfEmojiMarkers(): void {
  if (!elfEmojiLayer) return
  clearElfEmojiMarkers()

  const bounds = map.getBounds()
  const south = bounds.getSouth()
  const north = bounds.getNorth()
  const west = bounds.getWest()
  const east = bounds.getEast()

  // Scale count a bit with zoom, but keep it lightweight
  const zoom = map.getZoom()
  const baseCount = 18
  const extra = Math.max(0, Math.floor((zoom - 11) * 6))
  const count = Math.min(100, baseCount + extra)

  for (let i = 0; i < count; i++) {
    const lat = randomInRange(south, north)
    const lng = randomInRange(west, east)
    const emoji = getRandomElfEmoji()
    const icon = L.divIcon({
      className: 'elf-emoji-marker',
      html: `<span class="elf-emoji-span">${emoji}</span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    })
    const m = L.marker([lat, lng], { icon, interactive: true }).addTo(
      elfEmojiLayer
    )
    m.on('click', () => {
      const el = m.getElement() as HTMLElement | null
      if (!el) return
      // restart animation
      el.classList.remove('spinning')
      // force reflow to allow retrigger
      void el.offsetWidth
      el.classList.add('spinning')
      window.setTimeout(() => {
        if (el && el.classList) el.classList.remove('spinning')
      }, 1200)
    })
  }
}

function enableElfEmojiMode(): void {
  if (!elfEmojiLayer) {
    elfEmojiLayer = L.layerGroup().addTo(map)
  }
  ensureElfEmojiStyles()
  populateElfEmojiMarkers()
  if (!elfEmojiMoveHandlersAttached) {
    map.on('moveend', handleElfEmojiRegen)
    map.on('zoomend', handleElfEmojiRegen)
    elfEmojiMoveHandlersAttached = true
  }
}

function disableElfEmojiMode(): void {
  clearElfEmojiMarkers()
  detachElfEmojiHandlers()
  if (elfEmojiLayer) {
    map.removeLayer(elfEmojiLayer)
    elfEmojiLayer = null
  }
}

// Loading state management
let mapLoading = true
let mapInitialized = false

document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' })

if (process.env.NODE_ENV === 'production') {
  new MaptilerLayer({
    apiKey: process.env.MT_KEY || '',
    style: 'streets-v2'
  }).addTo(map)
} else {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)
}

// Loading overlay functions
function showMapLoading(): void {
  const mapElement = document.getElementById('map')
  if (mapElement && !mapElement.querySelector('.map-loading-overlay')) {
    const loadingOverlay = document.createElement('div')
    loadingOverlay.className = 'map-loading-overlay'
    loadingOverlay.innerHTML = `
      <div class="map-loading-spinner">
        <div class="map-spinner"></div>
      </div>
    `
    ;(mapElement as HTMLElement).style.position = 'relative'
    mapElement.appendChild(loadingOverlay)
  }
}

function hideMapLoading(): void {
  const loadingOverlay = document.querySelector('.map-loading-overlay')
  if (loadingOverlay) {
    ;(loadingOverlay as HTMLElement).style.opacity = '0'
    setTimeout(() => {
      loadingOverlay.remove()
    }, 300)
  }
}

// Global function to move map to stop coordinates
window.moveMapToStop = (lat: number, lng: number): void => {
  map.setView([lat, lng], Math.max(map.getZoom(), 16))
}

// Vehicle tracking helpers exposed for popup actions
window.trackVehicleById = (id: string | number): void => {
  trackedVehicleId = id
  trackedVehicleLabel = null
  // Center immediately if we already have a marker
  const marker = currentMarkers.get(id)
  if (marker) {
    const latlng = marker.getLatLng()
    map.panTo(latlng)
  }
  updateTrackingStatusUI()
}

window.untrackVehicle = (): void => {
  trackedVehicleId = null
  trackedVehicleLabel = null
  updateTrackingStatusUI()
}

window.isTrackingVehicleId = (id: string | number): boolean => {
  return trackedVehicleId === id
}

function annotate_map(): void {
  const now = Date.now()

  // Show loading overlay on first load
  if (mapLoading && !mapInitialized) {
    showMapLoading()
  }

  // If SSE is active, throttle UI updates by user-selected refresh rate
  if (sseActive) {
    // Only load shapes once
    loadShapesOnce()
    // Fetch Amtrak data from BOS API (with error handling in fetchAmtrakData)
    fetchAmtrakData(bos_url)
    // When not in immediate mode, apply latest cached SSE payload on the interval
    if (!sseImmediateMode && vehicleDataCache) {
      processVehicleData(vehicleDataCache)
    }
    return
  }

  // Use cached data if recent enough
  if (vehicleDataCache && now - lastVehicleUpdate < CACHE_DURATION) {
    processVehicleData(vehicleDataCache)
    return
  }

  $.getJSON(`${vehicles_url}/vehicles`)
    .done(function (data: any) {
      vehicleDataCache = data
      lastVehicleUpdate = now
      processVehicleData(data)
    })
    .fail(function (_jqXHR: any, textStatus: string, errorThrown: string) {
      console.warn('Failed to fetch vehicle data:', textStatus, errorThrown)
      // Use cached data if available as fallback
      if (vehicleDataCache) {
        processVehicleData(vehicleDataCache)
      }
    })

  // Only load shapes once
  loadShapesOnce()

  // Fetch Amtrak data from BOS API (with error handling in fetchAmtrakData)
  fetchAmtrakData(bos_url)
}

function processVehicleData(data: any): void {
  // Use requestAnimationFrame for smoother updates
  requestAnimationFrame(() => {
    updateVehicleFeatures(data.features || [])

    // Update vehicle markers efficiently
    updateMarkers(data.features || [])

    // If tracking a vehicle, keep it in view
    if (trackedVehicleId !== null) {
      const marker = currentMarkers.get(trackedVehicleId)
      if (marker) {
        const latlng = marker.getLatLng()
        // Only pan if marker is outside current bounds to reduce jitter
        if (!map.getBounds().pad(-0.2).contains(latlng)) {
          map.panTo(latlng)
        }
      }
      // Update label from latest data
      try {
        const tf = (data.features || []).find(
          (f: any) => String(f.id) === String(trackedVehicleId)
        )
        if (tf) {
          const route = tf.properties?.route || ''
          const headsign = tf.properties?.headsign || tf.properties?.stop || ''
          trackedVehicleLabel = `${route}${headsign ? ' → ' + headsign : ''}`
        }
      } catch {}
      updateTrackingStatusUI()
    }

    // Handle building markers (static, so only create once if needed)
    if (!buildingMarkers) {
      buildingMarkers = L.geoJSON(data, {
        pointToLayer: pointToLayer as any,
        onEachFeature: onEachFeature as any,
        filter: (feature) => {
          return feature.properties['marker-symbol'] === 'building'
        }
      }).addTo(map)
      // Make buildingMarkers accessible globally
      window.buildingMarkers = buildingMarkers
    }

    // Hide loading overlay when map is ready
    if (mapLoading) {
      mapLoading = false
      mapInitialized = true
      hideMapLoading()
    }

    // Use debounced table update
    debounceUpdateTable()
  })
}

// Debounced table update function
let tableUpdateTimeout: number | null = null
function debounceUpdateTable(): void {
  if (tableUpdateTimeout) {
    window.clearTimeout(tableUpdateTimeout)
  }
  tableUpdateTimeout = window.setTimeout(() => {
    updateTable()
    tableUpdateTimeout = null
  }, 150)
}

function loadShapesOnce(): void {
  if (!baseLayerLoaded) {
    Object.values(shapesLayerGroups).forEach((group) => {
      group.clearLayers()
    })

    $.getJSON(`${vehicles_url}/shapes`)
      .done(function (data: any) {
        // Batch DOM operations
        map.eachLayer(() => {}) // Force layer update batching

        L.geoJSON(data, {
          style: (feature) => {
            if (feature && feature.geometry.type === 'LineString') {
              var weight = 4
              if (
                feature.properties.route?.startsWith('CR') ||
                feature.properties.route?.startsWith('SL')
              ) {
                weight = 3
              }
              if (
                parseInt(feature.properties.route || '') ==
                parseInt(feature.properties.route || '')
              ) {
                weight = 2
              }
              return {
                color: return_colors(feature.properties.route || ''),
                weight: weight
              }
            }
            return {}
          },
          onEachFeature: (feature, layer) => {
            if (feature.properties.route) {
              const shapesGroup = getShapesLayerGroupForRoute(
                feature.properties.route
              )
              shapesGroup.addLayer(layer)
            }
            onEachFeature(feature as any, layer)
          }
        })
      })
      .fail(function (_jqXHR: any, textStatus: string) {
        console.warn('Failed to load shapes data:', textStatus)
        // Continue without shapes - vehicles will still work
      })
    baseLayerLoaded = true
  }
}

annotate_map()

// Start SSE after initial call so we have data either way
if (!startVehicleSSE()) {
  updateSSEStatusUI('polling')
}

// Wire up tracking stop button
const trackingStopBtn = document.getElementById('tracking-stop-btn')
if (trackingStopBtn) {
  trackingStopBtn.addEventListener('click', (e) => {
    e.preventDefault()
    window.untrackVehicle()
  })
}
// Initialize tracking UI state on load
updateTrackingStatusUI()

function isImmediateModeSelected(): boolean {
  const v = getCookie('refresh-rate')
  if (!v) return false
  const s = v.toString().toLowerCase()
  return s === '0' || s === 'immediate' || s === 'live'
}

function getAdaptiveRefreshRate(): number {
  const savedRefreshRate = getCookie('refresh-rate')
  // If immediate chosen, fall back to 1s for polling/non-SSE paths
  if (
    savedRefreshRate &&
    (savedRefreshRate === '0' || savedRefreshRate.toLowerCase() === 'immediate')
  ) {
    CACHE_DURATION = 1000
    return 1
  }
  const userRefreshRate = savedRefreshRate ? parseInt(savedRefreshRate) : 15
  CACHE_DURATION = 5000
  return userRefreshRate
}

// Load saved refresh rate from cookie or default to adaptive rate
const savedRefreshRate = getCookie('refresh-rate')
adaptiveRefreshRate = getAdaptiveRefreshRate()
const defaultRefreshRate = savedRefreshRate
  ? parseInt(savedRefreshRate)
  : adaptiveRefreshRate

// Use smarter refresh logic - pause when tab is not visible
let intervalID: number | null = null
let isTabVisible = true

// Pause updates when tab is not visible to save resources
document.addEventListener('visibilitychange', () => {
  isTabVisible = !document.hidden
  if (isTabVisible && !intervalID) {
    startUpdateInterval()
    annotate_map() // Immediate update when tab becomes visible
  } else if (!isTabVisible && intervalID) {
    stopUpdateInterval()
  }
})

// Reconnect SSE promptly when network returns; fall back to polling while offline
window.addEventListener('online', () => {
  if (!sseActive) {
    // Try to reconnect immediately when back online
    scheduleSSEReconnect()
  }
})

window.addEventListener('offline', () => {
  if (sseActive) {
    // Stop the stream and rely on polling until back online
    stopVehicleSSE()
    startUpdateInterval()
  }
})

function startUpdateInterval(): void {
  if (intervalID) return
  const currentRefreshRate = getAdaptiveRefreshRate()
  intervalID = window.setInterval(annotate_map, currentRefreshRate * 1000)
}

function stopUpdateInterval(): void {
  if (intervalID) {
    window.clearInterval(intervalID)
    intervalID = null
  }
}

// Start initial interval
startUpdateInterval()

// Set up the refresh rate control, add "Immediate" if missing
const refreshRateElement = document.getElementById('refresh-rate') as
  | HTMLInputElement
  | HTMLSelectElement
  | null
if (refreshRateElement) {
  // If it's a <select>, ensure an Immediate (0) option exists
  if (refreshRateElement.tagName === 'SELECT') {
    const sel = refreshRateElement as HTMLSelectElement
    const hasImmediate = Array.from(sel.options).some((o) => o.value === '0')
    if (!hasImmediate) {
      const opt = document.createElement('option')
      opt.value = '0'
      opt.text = 'Immediate'
      // Put as first option for visibility
      sel.add(opt, 0)
    }
  }
  ;(refreshRateElement as HTMLInputElement).value =
    defaultRefreshRate.toString()
}

L.easyButton({
  position: 'topright',
  states: [
    {
      stateName: 'refresh',
      title: 'Refresh',
      onClick: (_btn, _map) => {
        annotate_map()
      },
      icon: "<span class='refresh'>&olarr;</span>"
    }
  ]
}).addTo(map)

L.easyButton({
  position: 'topright',
  states: [
    {
      stateName: 'locate',
      title: 'Locate',
      onClick: (_btn, map) => {
        map.locate({ setView: true })
      },
      icon: "<span class='odot'>&odot;</span>"
    }
  ]
}).addTo(map)

// Variables to store the user location circle and watch state
let userLocationCircle: L.Circle | null = null
let userLocationMarker: L.Marker | null = null
let locationWatchID: number | null = null

// Handle successful geolocation
map.on('locationfound', (e: L.LocationEvent) => {
  // Remove existing location circle and marker if they exist
  if (userLocationCircle) {
    map.removeLayer(userLocationCircle)
  }
  if (userLocationMarker) {
    map.removeLayer(userLocationMarker)
  }

  // Create a circle representing the user's location with accuracy radius
  userLocationCircle = L.circle(e.latlng, {
    radius: e.accuracy,
    color: '#4285f4',
    fillColor: '#4285f4',
    fillOpacity: 0.2,
    weight: 2
  }).addTo(map)
})

// Handle geolocation errors
map.on('locationerror', (e: L.ErrorEvent) => {
  console.warn('Location access denied or unavailable:', e.message)
})

const overlayMaps = {
  '🟥 Red Line': layerGroups.red,
  '🟦 Blue Line': layerGroups.blue,
  '🟩 Green Line': layerGroups.green,
  '🟧 Orange Line': layerGroups.orange,
  '🚍 Silver Line': layerGroups.silver,
  '🟪 Commuter Rail': layerGroups.commuter,
  '🚄 Amtrak': layerGroups.amtrak,
  '🔴 Red Line Routes': shapesLayerGroups.red,
  '🔵 Blue Line Routes': shapesLayerGroups.blue,
  '🟢 Green Line Routes': shapesLayerGroups.green,
  '🟠 Orange Line Routes': shapesLayerGroups.orange,
  '🚏 Silver Line Routes': shapesLayerGroups.silver,
  '🟣 Commuter Rail Routes': shapesLayerGroups.commuter
}

// Load saved layer visibility settings from cookies
const savedLayerStates = getCookie('layer-visibility')
let layerStates: Record<string, boolean> = {}

if (savedLayerStates) {
  try {
    layerStates = JSON.parse(savedLayerStates)
  } catch (e) {
    console.warn('Failed to parse saved layer states, using defaults')
  }
}

// Apply layer visibility based on saved states or defaults (all visible except Amtrak)
Object.entries(layerGroups).forEach(([key, group]) => {
  const vehicleLayerKey = `vehicles-${key}`
  if (key === 'amtrak') {
    // Amtrak layer is off by default
    if (layerStates[vehicleLayerKey] === true) {
      group.addTo(map)
    }
  } else {
    // All other layers are on by default
    if (layerStates[vehicleLayerKey] !== false) {
      group.addTo(map)
    }
  }
})

Object.entries(shapesLayerGroups).forEach(([key, group]) => {
  const routeLayerKey = `routes-${key}`
  if (layerStates[routeLayerKey] !== false) {
    group.addTo(map)
  }
})

L.control
  .layers({}, overlayMaps, {
    position: 'topright',
    collapsed: true
  })
  .addTo(map)

// Save layer visibility when layers are toggled
map.on('overlayadd overlayremove', (e: L.LeafletEvent) => {
  const layerName = (e as any).name
  const isVisible = e.type === 'overlayadd'

  // Map display names to internal keys
  const layerKeyMap: Record<string, string> = {
    '🟥 Red Line': 'vehicles-red',
    '🟦 Blue Line': 'vehicles-blue',
    '🟩 Green Line': 'vehicles-green',
    '🟧 Orange Line': 'vehicles-orange',
    '🚍 Silver Line': 'vehicles-silver',
    '🟪 Commuter Rail': 'vehicles-commuter',
    '🚄 Amtrak': 'vehicles-amtrak',
    '🔴 Red Line Routes': 'routes-red',
    '🔵 Blue Line Routes': 'routes-blue',
    '🟢 Green Line Routes': 'routes-green',
    '🟠 Orange Line Routes': 'routes-orange',
    '🚏 Silver Line Routes': 'routes-silver',
    '🟣 Commuter Rail Routes': 'routes-commuter'
  }

  const layerKey = layerKeyMap[layerName]
  if (layerKey) {
    layerStates[layerKey] = isVisible
    setCookie('layer-visibility', JSON.stringify(layerStates))
  }
})

if (refreshRateElement) {
  refreshRateElement.addEventListener('change', (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement
    const raw = target.value.trim()
    const parsed = parseInt(raw)

    // Save selection (allow 0 for Immediate)
    setCookie('refresh-rate', raw)

    // Clear cache when refresh rate changes to force an update cycle
    vehicleDataCache = null
    lastVehicleUpdate = 0

    // Update immediate mode if SSE is active
    sseImmediateMode = isImmediateModeSelected()

    // Reset polling interval appropriately
    stopUpdateInterval()
    if (sseActive) {
      if (!sseImmediateMode && isTabVisible) {
        startUpdateInterval()
      }
      // In immediate mode, SSE onmessage will push updates directly
    } else {
      // Polling path: use at least 1s when Immediate is selected
      adaptiveRefreshRate = parsed > 0 ? parsed : getAdaptiveRefreshRate()
      if (isTabVisible) startUpdateInterval()
    }
  })
}

// Function to start/stop location watching
function toggleLocationWatch(enabled: boolean): void {
  if (enabled) {
    locationWatchID = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const accuracy = position.coords.accuracy

        // Simulate a locationfound event
        map.fire('locationfound', {
          latlng: L.latLng(lat, lng),
          accuracy: accuracy,
          timestamp: position.timestamp
        } as L.LocationEvent)

        // Keep the map centered on the user's location when watching
        map.setView([lat, lng], Math.max(map.getZoom(), 15))
      },
      (error) => {
        console.warn('Location watch error:', error.message)
        map.fire('locationerror', { message: error.message } as L.ErrorEvent)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 60000
      }
    )
  } else {
    if (locationWatchID !== null) {
      navigator.geolocation.clearWatch(locationWatchID)
      locationWatchID = null
    }
  }
}

// Load saved follow location setting from cookie
const savedFollowLocation = getCookie('follow-location')
const followLocationElement = document.getElementById(
  'follow-location'
) as HTMLInputElement
if (followLocationElement) {
  const defaultFollowLocation = savedFollowLocation === 'true'
  followLocationElement.checked = defaultFollowLocation
  if (defaultFollowLocation) {
    toggleLocationWatch(true)
  }
}

// Handle follow location toggle
document
  .getElementById('follow-location')!
  .addEventListener('change', (event: Event) => {
    const target = event.target as HTMLInputElement
    toggleLocationWatch(target.checked)
    setCookie('follow-location', target.checked.toString())
  })

// Load saved elf mode setting from cookie
const savedElfMode = getCookie('show-elf-mode')
const elfModeElement = document.getElementById(
  'show-elf-mode'
) as HTMLInputElement
if (elfModeElement) {
  const defaultElfMode = savedElfMode === 'true'
  elfModeElement.checked = defaultElfMode
  // Initialize emoji overlay if enabled from saved state
  if (defaultElfMode) {
    enableElfEmojiMode()
  }
}

// Handle elf mode toggle
document
  .getElementById('show-elf-mode')!
  .addEventListener('change', (event: Event) => {
    const target = event.target as HTMLInputElement
    setCookie('show-elf-mode', target.checked.toString())
    // Refresh all marker classes immediately
    if (vehicleDataCache && vehicleDataCache.features) {
      refreshAllElfClasses(vehicleDataCache.features)
    }
    // Toggle elf emoji scatter overlay
    if (target.checked) {
      enableElfEmojiMode()
    } else {
      disableElfEmojiMode()
    }
    // Force popup refresh by clearing cache and updating
    vehicleDataCache = null
    lastVehicleUpdate = 0
    annotate_map()
  })

// Inject minimal CSS for emoji appearance and spin animation
function ensureElfEmojiStyles(): void {
  if (elfEmojiStyleInjected) return
  const style = document.createElement('style')
  style.id = 'elf-emoji-style'
  style.textContent = `
    .elf-emoji-marker { cursor: pointer; pointer-events: auto; }
    .elf-emoji-marker .elf-emoji-span {
      font-size: 18px;
      display: inline-block;
      filter: drop-shadow(0 0 2px rgba(0,0,0,0.35));
      will-change: transform;
    }
    .elf-emoji-marker.spinning .elf-emoji-span { animation: elf-spin 0.8s linear infinite; }
    @keyframes elf-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `
  document.head.appendChild(style)
  elfEmojiStyleInjected = true
}

// Handle elf search functionality
document.getElementById('elf-search-btn')!.addEventListener('click', () => {
  if (!vehicleDataCache || !vehicleDataCache.features) {
    console.warn('No vehicle data available for elf search')
    return
  }

  const resultsDiv = document.getElementById('elf-search-results')!
  const resultsList = document.getElementById('elf-results-list')!

  // Show results panel
  resultsDiv.style.display = 'block'

  // Find top elf trains
  const topElves = findTopElfTrains(vehicleDataCache.features)

  // Clear previous results
  resultsList.innerHTML = ''

  if (topElves.length === 0) {
    resultsList.innerHTML =
      '<div style="padding: 15px; text-align: center; color: #666;">No trains found with elf energy! 🥺</div>'
    return
  }

  // Populate results
  topElves.forEach((result, index) => {
    const item = document.createElement('div')
    item.className = 'elf-result-item'

    const route = result.feature.properties.route || 'Unknown'
    const headsign =
      result.feature.properties.headsign ||
      result.feature.properties.stop ||
      'Unknown destination'
    const stop = result.feature.properties.stop || 'Unknown stop'
    const scoreLevel = result.elfScore.level.toLowerCase()
    const scorePercentage = Math.round(result.elfScore.score)

    item.innerHTML = `
        <div class="elf-result-info">
          <div class="elf-result-route">${index + 1}. ${route} to ${headsign}</div>
          <div class="elf-result-details">Stop: ${stop}</div>
          <div class="elf-result-reasoning">${result.elfScore.reasoning}</div>
        </div>
        <div class="elf-result-score">
          <div class="elf-score-badge elf-score-${scoreLevel}">${result.elfScore.level}</div>
          <div class="elf-score-percentage">${scorePercentage}% elf</div>
        </div>
      `

    // Add click handler to jump to train
    item.addEventListener('click', () => {
      jumpToElfTrain(result, map)
      // Hide search results after selection
      resultsDiv.style.display = 'none'
      // Scroll back to map element
      document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' })
    })

    resultsList.appendChild(item)
  })
})

// Handle elf search close button
document.getElementById('elf-search-close')!.addEventListener('click', () => {
  const resultsDiv = document.getElementById('elf-search-results')!
  resultsDiv.style.display = 'none'
})

alerts(vehicles_url)
