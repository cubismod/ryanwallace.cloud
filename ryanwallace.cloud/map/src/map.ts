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
import { updateMarkers } from './marker-manager'
import { updateTable } from './table-manager'
import { alerts } from './alerts'
import { fetchAmtrakData } from './amtrak'

// Extend jQuery to include getJSON method
declare const $: {
  getJSON: (url: string, callback: (data: any) => void) => void
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
  }
}).setView([42.36565, -71.05236], 13)

const vehicles_url: string =
  process.env.VEHICLES_URL || 'https://vehicles.ryanwallace.cloud'
const bos_url: string = 'https://bos.ryanwallace.cloud'

let baseLayerLoaded: boolean = false
let buildingMarkers: L.GeoJSON | null = null

document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' })

new MaptilerLayer({
  apiKey: process.env.MT_KEY || '',
  style: 'streets-v2'
}).addTo(map)

// Global function to move map to stop coordinates
window.moveMapToStop = (lat: number, lng: number): void => {
  map.setView([lat, lng], Math.max(map.getZoom(), 16))
}

function annotate_map(): void {
  $.getJSON(vehicles_url, function (data: any) {
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
    window.setTimeout(() => {
      updateTable()
    }, 100)
  })

  // Fetch Amtrak data from BOS API
  fetchAmtrakData(bos_url)
  if (!baseLayerLoaded) {
    Object.values(shapesLayerGroups).forEach((group) => {
      group.clearLayers()
    })

    $.getJSON(`${vehicles_url}/shapes`, function (data) {
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
    baseLayerLoaded = true
  }
}

annotate_map()

// Load saved refresh rate from cookie or default to 15 seconds
const savedRefreshRate = getCookie('refresh-rate')
const defaultRefreshRate = savedRefreshRate ? parseInt(savedRefreshRate) : 15
let intervalID: number = window.setInterval(
  annotate_map,
  defaultRefreshRate * 1000
)

// Set the refresh rate input to the saved value
const refreshRateElement = document.getElementById(
  'refresh-rate'
) as HTMLInputElement
if (refreshRateElement) {
  refreshRateElement.value = defaultRefreshRate.toString()
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
    window.clearInterval(intervalID)
    const target = event.target as HTMLInputElement
    const newVal = parseInt(target.value)
    if (newVal) {
      intervalID = window.setInterval(annotate_map, newVal * 1000)
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

alerts(vehicles_url)
