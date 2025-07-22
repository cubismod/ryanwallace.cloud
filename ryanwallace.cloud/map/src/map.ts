import * as L from 'leaflet'
import '@petoc/leaflet-double-touch-drag-zoom'
import 'leaflet/dist/leaflet.css'
import '@petoc/leaflet-double-touch-drag-zoom/src/leaflet-double-touch-drag-zoom.css'
import 'leaflet.fullscreen'
import 'leaflet-easybutton'
import 'leaflet-arrowheads'
import 'invert-color'
import DOMPurify from 'dompurify'
import invert from 'invert-color'
import DataTable from 'datatables.net-dt'
import { MaptilerLayer } from '@maptiler/leaflet-maptilersdk'
import { formatDistance } from 'date-fns'

// Cookie utility functions
function setCookie(name: string, value: string, days: number = 365): void {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`
}

function getCookie(name: string): string | null {
  const nameEQ = name + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

// Type definitions
interface VehicleFeature {
  id?: string | number
  geometry: {
    type: 'Point' | 'LineString'
    coordinates: number[]
  }
  properties: {
    'marker-symbol'?: string
    'marker-color'?: string
    'marker-size'?: string
    route?: string
    status?: string
    stop?: string
    update_time?: string
    speed?: number
    approximate_speed?: boolean
    occupancy_status?: string
    carriages?: string[]
    stop_eta?: string
    'stop-coordinates'?: number[]
    name?: string
    headsign?: string
    platform_prediction?: string
  }
}

interface AlertEntity {
  attributes: {
    header: string
    severity: string
    updated_at?: string
    created_at: string
    active_period: Array<{
      end?: string
    }>
    informed_entity: Array<{
      route: string
    }>
  }
}

interface AlertData {
  data: AlertEntity[]
}

interface RouteMapping {
  svg: string
  alt: string
}

declare global {
  interface Window {
    $: typeof import('jquery')
  }
}

// Extend jQuery to include getJSON method
declare const $: {
  getJSON: (url: string, callback: (data: any) => void) => void
}

var map = L.map('map', {
  doubleTouchDragZoom: true,
  // @ts-expect-error - fullscreenControl is not a valid option
  fullscreenControl: true,
  fullscreenControlOptions: {
    position: 'topleft',
    title: 'Fullscreen'
  }
}).setView([42.36565, -71.05236], 13)

const lines: string[] = ['rl', 'gl', 'bl', 'ol', 'sl', 'cr', 'amtrak']
const vehicleTypes: string[] = ['light', 'heavy', 'regional', 'bus']
const vehicleCountMap: Map<
  string,
  Map<string, number>
> = createVehicleCountMap()
const vehicles_url: string =
  process.env.VEHICLES_URL || 'https://vehicles.ryanwallace.cloud'
const bos_url: string = 'https://bos.ryanwallace.cloud'

let baseLayerLoaded: boolean = false

document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' })

new MaptilerLayer({
  apiKey: process.env.MT_KEY || '',
  style: 'streets-v2'
}).addTo(map)

let geoJsonLayer: L.GeoJSON | null = null

const layerGroups = {
  red: L.layerGroup(),
  blue: L.layerGroup(),
  green: L.layerGroup(),
  orange: L.layerGroup(),
  silver: L.layerGroup(),
  commuter: L.layerGroup(),
  amtrak: L.layerGroup()
}

const shapesLayerGroups = {
  red: L.layerGroup(),
  blue: L.layerGroup(),
  green: L.layerGroup(),
  orange: L.layerGroup(),
  silver: L.layerGroup(),
  commuter: L.layerGroup()
}

function return_colors(route: string): string {
  if (route.startsWith('Green')) {
    return '#008150'
  }
  if (route.startsWith('Blue')) {
    return '#2F5DA6'
  }
  if (route.startsWith('CR')) {
    return '#7B388C'
  }
  if (route.startsWith('Red') || route.startsWith('Mattapan')) {
    return '#FA2D27'
  }
  if (route.startsWith('Orange')) {
    return '#FD8A03'
  }
  if (
    route.startsWith('74') ||
    route.startsWith('75') ||
    route.startsWith('SL')
  ) {
    return '#9A9C9D'
  }
  return '#3e2426'
}

function createVehicleCountMap(): Map<string, Map<string, number>> {
  const vehicleCountMap = new Map<string, Map<string, number>>()
  for (const line of lines) {
    vehicleCountMap.set(line, new Map<string, number>())
  }
  return vehicleCountMap
}

function clearMap(): void {
  for (const line of lines) {
    for (const vehicleType of vehicleTypes) {
      vehicleCountMap.get(line)?.set(vehicleType, 0)
    }
  }
}

function incrementMapItem(route: string, vehicleType: string): void {
  const existing = vehicleCountMap.get(route)?.get(vehicleType)
  if (existing !== undefined) {
    vehicleCountMap.get(route)!.set(vehicleType, existing + 1)
  } else {
    vehicleCountMap.get(route)?.set(vehicleType, 1)
  }
}

function calculateTotal(dimension: string): number {
  let total = 0
  if (lines.includes(dimension)) {
    // we are retrieving the total for a line
    for (const vehicleType of vehicleTypes) {
      total += vehicleCountMap.get(dimension)?.get(vehicleType) || 0
    }
    return total
  } else if (vehicleTypes.includes(dimension)) {
    // we are retrieving the total for a vehicle type
    for (const line of lines) {
      total += vehicleCountMap.get(line)?.get(dimension) || 0
    }
    return total
  } else if (dimension === 'all') {
    // we are retrieving the total for all dimensions
    for (const line of lines) {
      for (const vehicleType of vehicleTypes) {
        total += vehicleCountMap.get(line)?.get(vehicleType) || 0
      }
    }
    return total
  }
  return total
}

function updateTable(): void {
  for (const line of lines) {
    for (const vehicleType of vehicleTypes) {
      const id = `${line}-${vehicleType}`
      const element = document.getElementById(id)
      if (element) {
        element.innerHTML = String(
          DOMPurify.sanitize(
            String(vehicleCountMap.get(line)?.get(vehicleType) || 0)
          )
        )
      }
    }
    const totalElement = document.getElementById(`${line}-total`)
    if (totalElement) {
      totalElement.innerHTML = String(
        DOMPurify.sanitize(String(calculateTotal(line)))
      )
    }
  }
  for (const vehicleType of vehicleTypes) {
    const element = document.getElementById(`${vehicleType}-total`)
    if (element) {
      element.innerHTML = String(
        DOMPurify.sanitize(String(calculateTotal(vehicleType)))
      )
    }
  }
  const element = document.getElementById('total')
  if (element) {
    element.innerHTML = String(
      DOMPurify.sanitize(String(calculateTotal('all')))
    )
  }
}

function getLayerGroupForRoute(route: string): L.LayerGroup {
  if (route.startsWith('Red') || route.startsWith('Mattapan')) {
    return layerGroups.red
  }
  if (route.startsWith('Blue')) {
    return layerGroups.blue
  }
  if (route.startsWith('Green')) {
    return layerGroups.green
  }
  if (route.startsWith('Orange')) {
    return layerGroups.orange
  }
  if (
    route.startsWith('SL') ||
    route.startsWith('74') ||
    route.startsWith('75')
  ) {
    return layerGroups.silver
  }
  if (route.startsWith('CR')) {
    return layerGroups.commuter
  }
  if (
    route === 'Amtrak' ||
    route.startsWith('Acela') ||
    route.includes('Northeast Regional')
  ) {
    return layerGroups.amtrak
  }
  return layerGroups.commuter
}

function getShapesLayerGroupForRoute(route: string): L.LayerGroup {
  if (route.startsWith('Red') || route.startsWith('Mattapan')) {
    return shapesLayerGroups.red
  }
  if (route.startsWith('Blue')) {
    return shapesLayerGroups.blue
  }
  if (route.startsWith('Green')) {
    return shapesLayerGroups.green
  }
  if (route.startsWith('Orange')) {
    return shapesLayerGroups.orange
  }
  if (
    route.startsWith('SL') ||
    route.startsWith('74') ||
    route.startsWith('75')
  ) {
    return shapesLayerGroups.silver
  }
  if (route.startsWith('CR')) {
    return shapesLayerGroups.commuter
  }
  return shapesLayerGroups.commuter
}

function pointToLayer(feature: VehicleFeature, latlng: L.LatLng): L.Marker {
  let icon_size = 28
  let icon = 'bus-yellow.svg'
  let opacity = 1.0
  let zIndex = 0
  let status = ''
  let station = ''
  let stopOrGo = ''
  // will enable this at a later point once i work out the UI
  // if (feature.properties["status"] === "STOPPED_AT") {
  //   stopOrGo = "-stop"
  // } else if (feature.properties["status"] === "INCOMING_AT" || feature.properties["status"] === "IN_TRANSIT_TO") {
  //   stopOrGo = "-go"
  // }
  if (feature.properties['marker-symbol'] === 'building') {
    icon = 'entrance-alt1'
    icon_size = 18
    opacity = 1
    zIndex = -10
  } else {
    if (feature.properties['marker-symbol'] === 'bus') {
      opacity = 0.8
      icon_size = 25
    }
    if (feature.properties['marker-size'] === 'small') {
      icon_size = 27
    }
    if (feature.properties['marker-color'] === '#008150') {
      icon = 'rail-light'
      incrementMapItem('gl', 'light')
    }
    if (feature.properties['marker-color'] === '#2F5DA6') {
      icon = 'rail-metro-blue'
      incrementMapItem('bl', 'heavy')
    }
    if (feature.properties['marker-color'] === '#FA2D27') {
      icon = 'rail-metro-red'
      if (feature.properties['route'] === 'Mattapan') {
        incrementMapItem('rl', 'light')
      } else {
        incrementMapItem('rl', 'heavy')
      }
    }
    if (feature.properties['marker-color'] === '#FD8A03') {
      icon = 'rail-metro-orange'
      incrementMapItem('ol', 'heavy')
    }
    if (feature.properties['marker-color'] === '#7B388C') {
      icon = 'rail'
      incrementMapItem('cr', 'regional')
    }
    if (
      feature.properties.route &&
      (feature.properties.route === 'Amtrak' ||
        feature.properties.route.startsWith('Acela') ||
        feature.properties.route.includes('Northeast Regional'))
    ) {
      icon = 'rail-amtrak'
      incrementMapItem('amtrak', 'regional')
    }
    if (feature.properties.route && feature.properties.route.startsWith('SL')) {
      incrementMapItem('sl', 'bus')
      icon = 'bus-silver'
      opacity = 0.9
    }
  }

  if (
    feature.geometry.type === 'Point' &&
    feature.properties['marker-symbol'] !== 'building'
  ) {
    status = feature.properties.status || ''
    station = feature.properties.stop || ''
  }

  const leafletIcon = L.icon({
    iconUrl: `/images/icons/${icon}${stopOrGo}.svg`,
    iconSize: L.point(icon_size, icon_size)
  })

  return L.marker(latlng, {
    icon: leafletIcon,
    title: `${feature.id} ${status} ${station}`,
    opacity: opacity,
    zIndexOffset: zIndex,
    riseOnHover: true,
    riseOffset: 2000
  })
}

function niceStatus(status: string): string {
  if (status === 'INCOMING_AT') {
    return 'Arriving'
  }
  if (status === 'IN_TRANSIT_TO') {
    return 'In Transit'
  }
  if (status === 'STOPPED_AT') {
    return 'Stopped'
  }
  return status
}

function onEachFeature(feature: VehicleFeature, layer: L.Layer): void {
  if (feature.geometry.type === 'LineString' && feature.properties.route) {
    layer.bindPopup(`<b>${feature.properties.route}</b>`)
  }
  if (feature.geometry.type === 'Point') {
    if (feature.properties['marker-symbol'] === 'building') {
      layer.bindPopup(`<b>${feature.properties.name} Stop</b>`)
    } else {
      const update_time = new Date(
        feature.properties['update_time'] || Date.now()
      )
      let speed = ''
      if (
        feature.properties['speed'] &&
        feature.properties['status'] != 'STOPPED_AT'
      ) {
        speed = `<br />Speed: ${feature.properties.speed} mph`
      }
      if (feature.properties['approximate_speed']) {
        speed += '* <small>approximate</small>'
      }
      let occupancy = ''
      if (feature.properties['occupancy_status']) {
        occupancy = `<br />Occupancy: ${feature.properties['occupancy_status']}`
      }
      let eta = ''
      if (feature.properties['stop_eta']) {
        eta = `<br />ETA: ${feature.properties['stop_eta']}`
      }
      let platform_prediction = ''
      if (
        !feature.properties.stop?.toLowerCase().includes('track') &&
        feature.properties['platform_prediction']
      ) {
        platform_prediction = `<br />Platform Prediction: ${feature.properties['platform_prediction']}`
      }
      const popup = L.popup({
        content: `<b>${feature.properties.route}/<i>${feature.properties.headsign || feature.properties.stop}</i></b>
        <br />Stop: ${feature.properties.stop || ''}
        <br />Status: ${niceStatus(feature.properties.status || '')}
        ${eta}${speed}${occupancy}${platform_prediction}
        <br /><small>Update Time: ${update_time.toLocaleTimeString()}</small>`,
        keepInView: true
      })

      if (
        feature.properties['stop-coordinates'] &&
        feature.properties['status'] != 'STOPPED_AT'
      ) {
        const coords: L.LatLngExpression[] = [
          [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
          [
            feature.properties['stop-coordinates']![1],
            feature.properties['stop-coordinates']![0]
          ]
        ]
        const line1 = L.polyline(coords, {
          color: invert(feature.properties['marker-color'] || '#000000', true),
          weight: 15
        })
        const line2 = L.polyline(coords, {
          color: feature.properties['marker-color'],
          weight: 7
        })
        ;(line1 as any).arrowheads()
        ;(line2 as any).arrowheads()

        layer.addEventListener('click', () => {
          line1.addTo(map)
          line2.addTo(map)
          map.panInsideBounds(line1.getBounds())
          window.setTimeout(() => {
            line1.removeFrom(map)
            line2.removeFrom(map)
          }, 10000)
        })
      }

      layer.bindPopup(popup)
    }
  }
}

function embedSVG(line: string, alt: string): string {
  return `<img src="/images/icons/lines/${line}.svg" alt="${alt}" class="line">`
}

function calculateAffectedLines(data: Array<{ route: string }>): string {
  const routeMap: Record<string, RouteMapping> = {
    Red: { svg: 'rl', alt: 'Red Line' },
    Blue: { svg: 'bl', alt: 'Blue Line' },
    Greenbush: { svg: 'cr-greenbush', alt: 'Greenbush Line' },
    Green: { svg: 'gl', alt: 'Green Line' },
    Orange: { svg: 'ol', alt: 'Orange Line' },
    749: { svg: 'sl5', alt: 'Silver Line 5' },
    751: { svg: 'sl4', alt: 'Silver Line 4' },
    746: { svg: 'slw', alt: 'Silver Line Way' },
    743: { svg: 'sl3', alt: 'Silver Line 3' },
    741: { svg: 'sl1', alt: 'Silver Line 1 (Airport)' },
    742: { svg: 'sl2', alt: 'Silver Line 2' },
    Fitchburg: { svg: 'cr-fitchburg', alt: 'Fitchburg Line' },
    Fairmont: { svg: 'cr-fairmont', alt: 'Fairmont Line' },
    NewBedford: { svg: 'cr-fall-river', alt: 'Fall River/New Bedford Line' },
    Franklin: { svg: 'cr-franklin', alt: 'Franklin/Foxboro Line' },
    Haverhill: { svg: 'cr-haverhill', alt: 'Haverhill Line' },
    Kingston: { svg: 'cr-kingston', alt: 'Kingston Line' },
    Lowell: { svg: 'cr-lowell', alt: 'Lowell Line' },
    Needham: { svg: 'cr-needham', alt: 'Needham Line' },
    Newburyport: { svg: 'cr-newburyport', alt: 'Newburyport/Rockport Line' },
    Providence: { svg: 'cr-providence', alt: 'Providence Line' },
    Worcester: { svg: 'cr-worcester', alt: 'Worcester Line' }
  }

  const afLines = new Set()
  for (const entity of data) {
    for (const routePattern in routeMap) {
      if (
        entity.route === routePattern ||
        entity.route.includes(routePattern)
      ) {
        const { svg, alt } = routeMap[routePattern]
        afLines.add(embedSVG(svg, alt))
        break
      }
    }
  }
  return [...afLines].join('</br>')
}

function alerts(): void {
  $.getJSON(`${vehicles_url}/alerts`, function (data: AlertData) {
    const msgs = new Set()
    const dataSet = []

    for (const alert of data.data) {
      if (alert.attributes && !msgs.has(alert.attributes.header)) {
        if (
          alert.attributes.active_period.length > 0 &&
          alert.attributes.active_period[0].end
        ) {
          // skip alert if end time already passed
          const end_time = alert.attributes.active_period[0].end
          if (Date.parse(end_time) < Date.now()) {
            continue
          }
        }
        const rowData = [
          calculateAffectedLines(alert.attributes.informed_entity),
          alert.attributes.severity,
          {
            display: formatDistance(
              new Date(
                alert.attributes.updated_at || alert.attributes.created_at
              ),
              new Date(),
              { addSuffix: true }
            ),
            timestamp: new Date(
              alert.attributes.updated_at || alert.attributes.created_at
            ).getTime()
          },
          alert.attributes.header
        ]
        dataSet.push(rowData)
      }
    }
    new DataTable('#alerts', {
      columns: [
        { title: 'Lines' },
        { title: 'Sev', className: 'dt-body-center' },
        {
          title: 'Upd',
          render: {
            _: 'display',
            sort: 'timestamp'
          }
        },
        { title: 'Alert', className: 'alert-body' }
      ],
      order: [
        [0, 'desc'],
        [1, 'desc']
      ],
      data: dataSet,
      ordering: true,
      paging: false
    })
  })
}

function annotate_map(): void {
  clearMap()

  Object.values(layerGroups).forEach((group) => {
    group.clearLayers()
  })

  $.getJSON(vehicles_url, function (data: any) {
    if (geoJsonLayer) {
      map.removeLayer(geoJsonLayer)
    }

    L.geoJSON(data, {
      pointToLayer: (feature: VehicleFeature, latlng: L.LatLng) => {
        const marker = pointToLayer(feature, latlng)
        if (feature.properties.route) {
          const layerGroup = getLayerGroupForRoute(feature.properties.route)
          layerGroup.addLayer(marker)
        }
        return marker
      },
      onEachFeature: onEachFeature as any,
      filter: (feature) => {
        return feature.properties['marker-symbol'] !== 'building'
      }
    })

    L.geoJSON(data, {
      pointToLayer: pointToLayer as any,
      onEachFeature: onEachFeature as any,
      filter: (feature) => {
        return feature.properties['marker-symbol'] === 'building'
      }
    }).addTo(map)

    console.log('Map loaded')
    window.setTimeout(() => {
      updateTable()
    }, 100)
  })

  // Fetch Amtrak data from BOS API
  fetchAmtrakData()
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
          onEachFeature(feature as VehicleFeature, layer)
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
// let isWatchingLocation: boolean = false
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

  // Add a marker at the exact location
  // userLocationMarker = L.marker(e.latlng, {
  //   icon: L.icon({
  //     iconUrl: '/images/icons/location-dot.svg',
  //     iconSize: L.point(20, 20)
  //   })
  // }).addTo(map).bindPopup('Your location')

  // // If not watching location, center the map view once
  // if (!isWatchingLocation) {
  //   map.setView(e.latlng, Math.max(map.getZoom(), 15))
  // }
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
    // isWatchingLocation = true
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
    // isWatchingLocation = false
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

function fetchAmtrakData(): void {
  $.getJSON(`${bos_url}/trains/geojson`, function (data: any) {
    if (data && data.features) {
      L.geoJSON(data, {
        pointToLayer: (feature: any, latlng: L.LatLng) => {
          const transformedFeature: VehicleFeature = {
            id: feature.id,
            geometry: feature.geometry,
            properties: {
              route: 'Amtrak',
              'marker-color': '#004080',
              'marker-symbol': 'rail',
              status: feature.properties.status || 'IN_TRANSIT_TO',
              headsign:
                feature.properties.headsign ||
                feature.properties.route ||
                'Amtrak',
              speed: feature.properties.speed || 0,
              update_time:
                (feature.properties as any).timestamp ||
                new Date().toISOString()
            }
          }

          const marker = pointToLayer(transformedFeature, latlng)
          layerGroups.amtrak.addLayer(marker)
          return marker
        },
        onEachFeature: onEachFeature as any,
        filter: (feature) => {
          return feature.geometry.type === 'Point'
        }
      })
    }
  })
}

alerts()
