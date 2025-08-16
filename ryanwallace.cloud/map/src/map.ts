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
import { setupProgressiveEnhancement } from './geometry-utils'
import {
  layerGroups,
  shapesLayerGroups,
  getShapesLayerGroupForRoute
} from './layer-groups'
import {
  updateMarkers,
  refreshAllElfClasses,
  findTopElfTrains,
  jumpToElfTrain
} from './marker-manager'
import { updateTable } from './table-manager'
import { alerts } from './alerts'
import { fetchAmtrakData } from './amtrak'
import { getConnectionInfo, shouldDisableOverpass } from './connection-detector'

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

function annotate_map(): void {
  const now = Date.now()

  // Show loading overlay on first load
  if (mapLoading && !mapInitialized) {
    showMapLoading()
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
        console.log('Using cached vehicle data as fallback')
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

    console.log('Map loaded')

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
    // Skip shapes loading on slow connections to improve performance
    if (shouldDisableOverpass()) {
      console.log('Skipping shapes loading due to slow connection')
      baseLayerLoaded = true
      return
    }

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

// Set up progressive enhancement for railway tracks
setupProgressiveEnhancement()

// Adaptive refresh rate based on connection quality
function getAdaptiveRefreshRate(): number {
  const connectionInfo = getConnectionInfo()
  const savedRefreshRate = getCookie('refresh-rate')
  const userRefreshRate = savedRefreshRate ? parseInt(savedRefreshRate) : 15

  // Adjust cache duration and refresh rate based on connection
  if (connectionInfo.isSlowConnection) {
    CACHE_DURATION = 10000 // 10 seconds cache for slow connections
    return Math.max(userRefreshRate, 30) // Minimum 30s refresh for slow connections
  } else if (connectionInfo.effectiveType === '5g') {
    CACHE_DURATION = 3000 // 3 seconds cache for fast connections
    return Math.max(userRefreshRate, 5) // Allow faster refresh for 5G
  }

  CACHE_DURATION = 5000 // Default 5 seconds
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

// Set the refresh rate input to the saved value
const refreshRateElement = document.getElementById(
  'refresh-rate'
) as HTMLInputElement
if (refreshRateElement) {
  refreshRateElement.value = defaultRefreshRate.toString()

  // Add connection info display and update min value
  const connectionInfo = getConnectionInfo()
  const minRefreshRate = getAdaptiveRefreshRate()

  // Set minimum value on the input to guide users
  refreshRateElement.min = minRefreshRate.toString()

  if (connectionInfo.isSlowConnection) {
    const label = refreshRateElement.parentElement?.querySelector('label')
    if (label) {
      label.textContent += ` (Slow connection - min ${minRefreshRate}s)`
    }
    // If current value is below minimum, update it
    if (parseInt(refreshRateElement.value) < minRefreshRate) {
      refreshRateElement.value = minRefreshRate.toString()
      setCookie('refresh-rate', minRefreshRate.toString())
    }
  }
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

document
  .getElementById('refresh-rate')!
  .addEventListener('change', (event: Event) => {
    stopUpdateInterval()
    const target = event.target as HTMLInputElement
    const newVal = parseInt(target.value)
    if (newVal) {
      // Clear cache when refresh rate changes
      vehicleDataCache = null
      lastVehicleUpdate = 0
      adaptiveRefreshRate = Math.max(newVal, getAdaptiveRefreshRate())

      if (isTabVisible) {
        startUpdateInterval()
      }
      setCookie('refresh-rate', newVal.toString())
    }
  })

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
