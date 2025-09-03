import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// Removed fullscreen plugin; using custom expand behavior on mobile

// Import modules
import { setCookie, getCookie, return_colors } from './utils'
import { pointToLayer, onEachFeature, updateVehicleFeatures } from './markers'
import {
  layerGroups,
  shapesLayerGroups,
  getShapesLayerGroupForRoute,
  enableClustering,
  isClusteringEnabled
} from './layer-groups'
import {
  updateMarkers,
  refreshAllElfClasses,
  findTopElfTrains,
  jumpToElfTrain,
  currentMarkers
} from './marker-manager'
import { updateTable } from './table-manager'
import {
  trackById,
  untrack,
  isTracking as isTrackingVehicleId,
  getTrackedLabel,
  updateTrackedOverlays,
  hookZoom,
  trackedId
} from './tracking'
import { alerts } from './alerts'
// Alerts module is loaded immediately
// Amtrak helpers are lazy-loaded when the layer is enabled

// Note: jQuery removed. Use fetch() for network requests.

// Extend window to include moveMapToStop function and buildingMarkers
declare global {
  interface Window {
    moveMapToStop: (lat: number, lng: number) => void
    buildingMarkers: L.GeoJSON | null
    trackVehicleById: (id: string | number) => void
    untrackVehicle: () => void
    isTrackingVehicleId: (id: string | number) => boolean
    toggleMapExpand: () => void
  }
}

// Detect iOS/iPadOS (including iPadOS on Mac Intel with touch)
function isIOS(): boolean {
  const ua = navigator.userAgent || ''
  const platform = (navigator as any).platform || ''
  const maxTP = (navigator as any).maxTouchPoints || 0
  const iOSUA = /iP(ad|hone|od)/.test(ua)
  const iPadOS = platform === 'MacIntel' && maxTP > 1
  return iOSUA || iPadOS
}

var map = L.map('map', {
  doubleTouchDragZoom: true,
  // @ts-expect-error - fullscreenControl is not a valid option
  fullscreenControl: true,
  fullscreenControlOptions: {
    position: 'topleft',
    title: 'Fullscreen',
    forcePseudoFullscreen: isIOS()
  },
  preferCanvas: true,
  maxZoom: 50
}).setView([42.36565, -71.05236], 13)

// Fullscreen pre-click hook
let _fsHookAttempts = 0
function _hookFullscreenPreToggle(): void {
  const btn = document.querySelector(
    '.leaflet-control-zoom-fullscreen'
  ) as HTMLAnchorElement | null
  if (btn) {
    const preToggle = (ev: Event) => {
      try {
        ev.preventDefault()
      } catch {}
      if (isIOS()) _fsPreScrollY = window.scrollY || window.pageYOffset || 0
      if (isMapExpanded) setMapExpanded(false)
    }
    btn.addEventListener('click', preToggle, { capture: true })
    return
  }
  if (_fsHookAttempts < 10) {
    _fsHookAttempts++
    window.setTimeout(_hookFullscreenPreToggle, 200)
  }
}
_hookFullscreenPreToggle()

// Load double-touch drag/zoom enhancement only on touch devices
const isTouchDevice =
  'ontouchstart' in window || (navigator as any).maxTouchPoints > 0
if (isTouchDevice) {
  Promise.all([
    import('@petoc/leaflet-double-touch-drag-zoom'),
    import(
      '@petoc/leaflet-double-touch-drag-zoom/src/leaflet-double-touch-drag-zoom.css'
    )
  ]).catch(() => {})
}

// Track popup open state
let popupOpen = false
map.on('popupopen', () => {
  popupOpen = true
})
map.on('popupclose', () => {
  popupOpen = false
})

// Fullscreen helpers
let _fsAncestors: HTMLElement[] = []
let _fsScrollY = 0
let _fsPreScrollY: number | null = null
let _removeScrollBlockers: (() => void) | null = null

function _installScrollBlockers(container: HTMLElement): () => void {
  const prevent = (e: Event) => {
    if (!container.contains(e.target as Node)) e.preventDefault()
  }
  document.addEventListener('touchmove', prevent, { passive: false })
  document.addEventListener('wheel', prevent as any, { passive: false })
  return () => {
    document.removeEventListener('touchmove', prevent as any)
    document.removeEventListener('wheel', prevent as any)
  }
}

map.on('enterFullscreen', () => {
  const wasExpanded = isMapExpanded
  if (wasExpanded) setMapExpanded(false)
  try {
    map.getContainer().classList.add('map-fs-on')
  } catch {}
  // Remove expand control while fullscreen is active
  try {
    if (_expandControl) map.removeControl(_expandControl)
  } catch {}

  // Block page scroll on iOS
  if (isIOS()) {
    const container = map.getContainer()
    _removeScrollBlockers = _installScrollBlockers(container)
  }

  // iOS: neutralize transforms on a few ancestors
  if (isIOS()) {
    _fsAncestors = []
    let p: HTMLElement | null = map.getContainer()
      .parentElement as HTMLElement | null
    for (let i = 0; i < 5 && p; i++) {
      p.classList.add('map-fs-no-transform')
      p.classList.add('map-fs-no-overflow')
      _fsAncestors.push(p)
      if (p.tagName === 'BODY') break
      p = p.parentElement
    }
  }

  // Invalidate size shortly after entering
  window.setTimeout(() => map.invalidateSize(), 50)
  if (_expandButtonEl) _expandButtonEl.style.display = 'none'
})

map.on('exitFullscreen', () => {
  // Remove iOS-specific patches
  if (isIOS()) {
    for (const n of _fsAncestors) {
      n.classList.remove('map-fs-no-transform')
      n.classList.remove('map-fs-no-overflow')
    }
    _fsAncestors = []
    // Remove scroll blockers
    if (_removeScrollBlockers) {
      _removeScrollBlockers()
      _removeScrollBlockers = null
    }
  }
  // Remove container fullscreen marker
  try {
    map.getContainer().classList.remove('map-fs-on')
  } catch {}
  // Invalidate size after exit
  window.setTimeout(() => map.invalidateSize(), 50)
  // Re-add expand control
  try {
    if (_expandControl) map.addControl(_expandControl)
  } catch {}
})

// Tracking overlays: keep minimal halo only (no extra panes)

const vehicles_url: string =
  process.env.VEHICLES_URL || 'https://imt.ryanwallace.cloud'
const bos_url: string = 'https://bos.ryanwallace.cloud'

let baseLayerLoaded: boolean = false
let buildingMarkers: L.GeoJSON | null = null
let lastVehicleUpdate: number = 0
let vehicleDataCache: any = null
let adaptiveRefreshRate: number = 15
let CACHE_DURATION = 5000 // 5 seconds - will be adjusted based on connection
let isMapExpanded = false
let mobileExpandCleanup: (() => void) | null = null
let initialSSEStartTimer: number | null = null
let _expandButtonEl: HTMLElement | null = null
let _expandControl: any = null

function updateTrackingStatusUI(): void {
  const el = document.getElementById('tracking-status')
  const stopBtn = document.getElementById(
    'tracking-stop-btn'
  ) as HTMLButtonElement | null
  const note = document.getElementById(
    'mode-conflict'
  ) as HTMLSpanElement | null
  const followGroup =
    (document
      .getElementById('follow-location')
      ?.closest('.control-group') as HTMLElement) || null
  if (!el) return
  el.classList.remove('live-streaming', 'live-polling', 'live-connecting')
  if (trackedId()) {
    const label = getTrackedLabel()
    el.textContent = label ? `Tracking: ${label}` : 'Tracking'
    el.classList.add('live-streaming')
    if (stopBtn) stopBtn.style.display = 'inline-flex'
    // When tracking is on, warn if follow-location is also checked
    const fl = document.getElementById(
      'follow-location'
    ) as HTMLInputElement | null
    if (note) {
      if (fl?.checked) {
        note.textContent = 'Disabled Follow location while tracking a vehicle.'
        note.style.display = 'inline'
      } else if (!fl?.checked) {
        // Clear note unless some other path set it
        note.textContent = note.textContent?.includes('Disabled Follow')
          ? ''
          : note.textContent || ''
        if (!note.textContent) note.style.display = 'none'
      }
    }
    if (followGroup) followGroup.classList.remove('follow-active')
  } else {
    el.textContent = 'Off'
    el.classList.add('live-polling')
    if (stopBtn) stopBtn.style.display = 'none'
    const fl = document.getElementById(
      'follow-location'
    ) as HTMLInputElement | null
    const note = document.getElementById(
      'mode-conflict'
    ) as HTMLSpanElement | null
    if (note && fl && !fl.checked) {
      note.textContent = ''
      note.style.display = 'none'
    }
    if (followGroup) {
      if (fl?.checked) followGroup.classList.add('follow-active')
      else followGroup.classList.remove('follow-active')
    }
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

// Check if MapTiler key is available and use MapTiler if possible, otherwise fall back to OpenStreetMap
const effectiveType = (navigator as any).connection?.effectiveType || ''
const slowConnection = ['slow-2g', '2g', '3g'].includes(effectiveType)
const hasMapTilerKey = process.env.MT_KEY && process.env.MT_KEY.trim() !== ''

if (
  hasMapTilerKey &&
  process.env.NODE_ENV === 'production' &&
  !slowConnection
) {
  // Use MapTiler when key is available
  import('@maptiler/leaflet-maptilersdk')
    .then(({ MaptilerLayer }) => {
      new MaptilerLayer({
        apiKey: process.env.MT_KEY || '',
        style: 'streets-v2'
      }).addTo(map)
      // Fallback hide if tiles don't trigger load quickly
      setTimeout(() => hideMapLoading(), 800)
    })
    .catch(() => {
      // Fallback to OpenStreetMap if MapTiler fails to load
      const raster = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      )
      raster.on('load', hideMapLoading)
      raster.addTo(map)
    })
} else {
  // Use OpenStreetMap when no MapTiler key or on slow connections
  const raster = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  })
  raster.on('load', hideMapLoading)
  raster.addTo(map)
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
  // If follow-location is enabled, disable it and inform user
  const followEl = document.getElementById(
    'follow-location'
  ) as HTMLInputElement | null
  if (followEl?.checked) {
    toggleLocationWatch(false)
    followEl.checked = false
    setCookie('follow-location', 'false')
    const note = document.getElementById(
      'mode-conflict'
    ) as HTMLSpanElement | null
    if (note) {
      note.textContent = 'Disabled Follow location while tracking a vehicle.'
      note.style.display = 'inline'
    }
    const group = (followEl.closest('.control-group') as HTMLElement) || null
    if (group) group.classList.remove('follow-active')
  }
  trackById(
    id,
    map,
    () => ((vehicleDataCache && vehicleDataCache.features) || []) as any[],
    () => updateTrackingStatusUI()
  )
}

window.untrackVehicle = (): void => {
  untrack(map, () => updateTrackingStatusUI())
}

window.isTrackingVehicleId = (id: string | number): boolean =>
  isTrackingVehicleId(id)

// Helpers for mobile-friendly expand behavior
function isSmallScreen(): boolean {
  try {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches
  } catch {
    return window.innerWidth <= 768
  }
}

// Non-fullscreen expand toggle
function setMapExpanded(expand: boolean): void {
  const el = document.getElementById('map') as HTMLElement | null
  if (!el) return
  isMapExpanded = expand

  // Clear any prior mobile cleanup if switching modes
  if (mobileExpandCleanup) {
    mobileExpandCleanup()
    mobileExpandCleanup = null
  }

  if (expand && isSmallScreen()) {
    // Save prior inline styles to restore later
    const prev = {
      position: el.style.position,
      top: el.style.top,
      right: (el.style as any).right,
      bottom: (el.style as any).bottom,
      left: el.style.left,
      width: el.style.width,
      height: el.style.height,
      maxHeight: el.style.maxHeight,
      zIndex: (el.style as any).zIndex
    }

    // Mobile-friendly expand: keep in document flow so page can scroll
    el.style.position = 'sticky'
    el.style.top = '0'
    ;(el.style as any).right = ''
    ;(el.style as any).bottom = ''
    el.style.left = ''
    el.style.zIndex = 'auto'
    // Keep within page layout width to avoid horizontal overflow on mobile
    el.style.width = '100%'
    el.style.maxWidth = '100%'
    // Slightly shorter than device height to avoid tight fit
    el.style.height = 'calc(100dvh - 12px)'
    el.style.maxHeight = 'calc(100dvh - 12px)'

    // Do not toggle map-expanded class on mobile to avoid conflicting CSS

    mobileExpandCleanup = () => {
      // Restore styles
      el.style.position = prev.position
      el.style.top = prev.top
      ;(el.style as any).right = prev.right
      ;(el.style as any).bottom = prev.bottom
      el.style.left = prev.left
      el.style.width = prev.width
      el.style.height = prev.height
      el.style.maxHeight = prev.maxHeight
      ;(el.style as any).zIndex = prev.zIndex
    }
  } else {
    // Desktop behavior: simple height expansion via CSS class
    el.classList.toggle('map-expanded', expand)
  }

  map.invalidateSize()
  // run again after transition or resize for crisp tiles
  window.setTimeout(() => map.invalidateSize(), 220)
  // persist preference
  setCookie('map-expanded', expand.toString())
}

window.toggleMapExpand = (): void => {
  setMapExpanded(!isMapExpanded)
}

function annotate_map(): void {
  const now = Date.now()

  // Show loading overlay on first load
  if (mapLoading && !mapInitialized) {
    showMapLoading()
  }

  // If SSE is active, throttle UI updates by user-selected refresh rate
  if (sseActive) {
    // Defer shapes; Amtrak loads when layer enabled
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

  fetch(`${vehicles_url}/vehicles`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((data: any) => {
      vehicleDataCache = data
      lastVehicleUpdate = now
      processVehicleData(data)

      // Kick off SSE shortly after a successful initial poll
      if (!sseActive && !vehicleEventSource && initialSSEStartTimer === null) {
        const delay = Math.min(sseBackoffMs, 3000)
        initialSSEStartTimer = window.setTimeout(() => {
          initialSSEStartTimer = null
          const ok = startVehicleSSE()
          if (!ok) updateSSEStatusUI('polling')
        }, delay)
      }
    })
    .catch((e: any) => {
      console.warn('Failed to fetch vehicle data:', e?.message || e)
      // Use cached data if available as fallback
      if (vehicleDataCache) {
        processVehicleData(vehicleDataCache)
      }
    })

  // Defer shapes; Amtrak loads when layer enabled
}

function processVehicleData(data: any): void {
  // Use requestAnimationFrame for smoother updates
  requestAnimationFrame(() => {
    updateVehicleFeatures(data.features || [])

    // Update vehicle markers efficiently
    if (!popupOpen) {
      updateMarkers(data.features || [])
    }

    // If many markers, enable clustering dynamically
    try {
      const markerCount = currentMarkers.size
      const CLUSTER_THRESHOLD = 120
      if (markerCount > CLUSTER_THRESHOLD && !isClusteringEnabled()) {
        suppressOverlayEvents = true
        enableClustering(map)
          .then(() => rebuildOverlayControl())
          .catch(() => {})
          .finally(() => {
            suppressOverlayEvents = false
          })
      }
    } catch {}

    // If tracking a vehicle, keep it in view
    if (trackedId()) {
      const id = trackedId() as string
      const marker =
        currentMarkers.get(String(id)) ||
        (currentMarkers.get(id as unknown as number) as any)
      if (marker) {
        const latlng = marker.getLatLng()
        // Only pan if marker is outside current bounds to reduce jitter
        if (!map.getBounds().pad(-0.2).contains(latlng)) {
          map.panTo(latlng)
        }
        // Find tracked feature for info display
        let trackedFeature: any = null
        try {
          trackedFeature = (data.features || []).find(
            (f: any) => String(f.id) === String(id)
          )
        } catch {}
        updateTrackedOverlays(map, marker, trackedFeature)
      }
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

    // After first vehicle render, schedule shapes load during idle time
    scheduleShapesLoad()

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

    fetch(`${vehicles_url}/shapes`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: any) => {
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
      .catch((e: any) => {
        console.warn('Failed to load shapes data:', e?.message || e)
        // Continue without shapes - vehicles will still work
      })
    baseLayerLoaded = true
  }
}

// Schedule shapes load after first paint or when browser is idle
let shapesLoadScheduled = false
function scheduleShapesLoad(): void {
  if (baseLayerLoaded || shapesLoadScheduled) return
  shapesLoadScheduled = true
  const cb = () => {
    try {
      loadShapesOnce()
    } catch (e) {
      // If it fails, allow a retry on next call
      shapesLoadScheduled = false
    }
  }
  // Prefer idle callback; fallback to small timeout
  if ((window as any).requestIdleCallback) {
    ;(window as any).requestIdleCallback(cb, { timeout: 3000 })
  } else {
    window.setTimeout(cb, 1200)
  }
}

annotate_map()

// Defer SSE start; we'll kick it off after the first successful vehicles poll

// Register service worker only in production (dev often runs http://localhost)
if ('serviceWorker' in navigator) {
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/map/sw.js', { scope: '/map/' })
        .catch((e) => console.warn('SW register failed:', e))
    })
  } else {
    navigator.serviceWorker.getRegistrations?.().then((regs) => {
      regs.forEach((r) => r.unregister().catch(() => {}))
    })
  }
}

// Load alerts cards when DOM is ready
async function loadAlerts(): Promise<void> {
  console.log('loadAlerts() called')
  const el = document.getElementById('alerts')
  if (!el) {
    console.warn('Alerts container element not found')
    return
  }
  console.log('Alerts container element found, loading module...')
  alerts(vehicles_url)
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

// Recompute halo/pulse sizes and alignment when zoom changes
hookZoom(
  map,
  () => ((vehicleDataCache && vehicleDataCache.features) || []) as any[]
)

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

;(async () => {
  try {
    await import('leaflet-easybutton')
  } catch {}

  // Refresh button
  ;(L as any)
    .easyButton({
      position: 'topright',
      states: [
        {
          stateName: 'refresh',
          title: 'Refresh',
          onClick: (_btn: any, _map: any) => {
            annotate_map()
          },
          icon: "<span class='refresh'>&olarr;</span>"
        }
      ]
    })
    .addTo(map)

  // Locate button
  ;(L as any)
    .easyButton({
      position: 'topright',
      states: [
        {
          stateName: 'locate',
          title: 'Locate',
          onClick: (_btn: any, mapRef: L.Map) => {
            mapRef.locate({ setView: true })
          },
          icon: "<span class='odot'>&odot;</span>"
        }
      ]
    })
    .addTo(map)

  // Add a compact expand toggle (not full-screen)
  const expandBtn = (L as any)
    .easyButton({
      position: 'topright',
      states: [
        {
          stateName: 'expand-off',
          title: 'Expand map',
          onClick: (btn: any) => {
            setMapExpanded(true)
            btn.state('expand-on')
          },
          icon: "<span class='expand' style='font-weight:600'>&#x21F2;</span>"
        },
        {
          stateName: 'expand-on',
          title: 'Shrink map',
          onClick: (btn: any) => {
            setMapExpanded(false)
            btn.state('expand-off')
          },
          icon: "<span class='expand' style='font-weight:600'>&#x21F3;</span>"
        }
      ]
    })
    .addTo(map)

  // Capture reference to expand button element for fullscreen hide/show
  if (!_expandButtonEl) {
    const span = document.querySelector(
      '#map .easy-button-button .expand'
    ) as HTMLElement | null
    _expandButtonEl =
      (span && (span.closest('a.easy-button-button') as HTMLElement)) || null
    if (_expandButtonEl) _expandButtonEl.classList.add('map-expand-button')
  }

  // Initialize expanded state from cookie
  const savedMapExpanded = getCookie('map-expanded')
  if (
    savedMapExpanded &&
    savedMapExpanded.toString().toLowerCase() === 'true'
  ) {
    setMapExpanded(true)
    try {
      ;(expandBtn as any).state('expand-on')
    } catch {}
  } else {
    try {
      ;(expandBtn as any).state('expand-off')
    } catch {}
  }
})()

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

// overlayMaps is built in rebuildOverlayControl()

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
      // If Amtrak is visible on load, fetch once
      import('./amtrak')
        .then((mod) => mod.fetchAmtrakData(bos_url))
        .catch(() => {})
    }
  } else {
    // All other layers are on by default
    if (layerStates[vehicleLayerKey] !== false) {
      group.addTo(map)
    }
  }
})

let anyShapesOn = false
Object.entries(shapesLayerGroups).forEach(([key, group]) => {
  const routeLayerKey = `routes-${key}`
  // Default ON unless explicitly disabled by saved state (original behavior)
  if (layerStates[routeLayerKey] !== false) {
    group.addTo(map)
    anyShapesOn = true
  }
})
// If any shapes layers are on at load, schedule shapes data load
if (anyShapesOn) {
  scheduleShapesLoad()
}

let overlayControl: L.Control.Layers | null = null
let suppressOverlayEvents = false
function rebuildOverlayControl() {
  if (overlayControl) {
    map.removeControl(overlayControl)
    overlayControl = null
  }
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
  overlayControl = L.control.layers({}, overlayMaps, {
    position: 'topright',
    collapsed: true
  })
  overlayControl.addTo(map)
}

rebuildOverlayControl()

// Save layer visibility when layers are toggled
map.on('overlayadd overlayremove', (e: L.LeafletEvent) => {
  if (suppressOverlayEvents) return
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

  // Lazy-load Amtrak data when layer is enabled
  if (layerName === '🚄 Amtrak' && isVisible) {
    import('./amtrak')
      .then((mod) => mod.fetchAmtrakData(bos_url))
      .catch((e) => console.warn('Failed to load Amtrak module:', e))
  }
  // Ensure shapes data is loaded when any routes overlay is enabled
  if (isVisible && /Routes$/.test(layerName)) {
    scheduleShapesLoad()
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
    const note = document.getElementById(
      'mode-conflict'
    ) as HTMLSpanElement | null
    if (target.checked) {
      // If user turns on follow location while tracking, stop tracking and inform
      if (trackedId()) {
        untrack(map, () => updateTrackingStatusUI())
        if (note) {
          note.textContent = 'Stopped tracking to follow your location.'
          note.style.display = 'inline'
        }
      }
      toggleLocationWatch(true)
      setCookie('follow-location', 'true')
      const group = (target.closest('.control-group') as HTMLElement) || null
      if (group) group.classList.add('follow-active')
    } else {
      toggleLocationWatch(false)
      setCookie('follow-location', 'false')
      if (note) {
        note.textContent = ''
        note.style.display = 'none'
      }
      const group = (target.closest('.control-group') as HTMLElement) || null
      if (group) group.classList.remove('follow-active')
    }
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
document
  .getElementById('elf-search-btn')!
  .addEventListener('click', async () => {
    if (!vehicleDataCache || !vehicleDataCache.features) {
      console.warn('No vehicle data available for elf search')
      return
    }

    const resultsDiv = document.getElementById('elf-search-results')!
    const resultsList = document.getElementById('elf-results-list')!

    // Show results panel
    resultsDiv.style.display = 'block'

    // Find top elf trains (lazy-load elf scoring)
    const topElves = await findTopElfTrains(vehicleDataCache.features)

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

loadAlerts()
