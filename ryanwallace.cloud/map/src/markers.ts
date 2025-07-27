import * as L from 'leaflet'
import { VehicleFeature } from './types'
import { niceStatus } from './utils'
import { incrementMapItem } from './vehicle-counter'

export function pointToLayer(
  feature: VehicleFeature,
  latlng: L.LatLng
): L.Marker {
  let icon_size = 28
  let icon = 'bus-yellow.svg'
  let opacity = 1.0
  let zIndex = 0
  let status = ''
  let station = ''
  let stopOrGo = ''

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
      incrementMapItem(feature.id as string, 'gl', 'light')
    }
    if (feature.properties['marker-color'] === '#2F5DA6') {
      icon = 'rail-metro-blue'
      incrementMapItem(feature.id as string, 'bl', 'heavy')
    }
    if (feature.properties['marker-color'] === '#FA2D27') {
      icon = 'rail-metro-red'
      if (feature.properties['route'] === 'Mattapan') {
        incrementMapItem(feature.id as string, 'rl', 'light')
      } else {
        incrementMapItem(feature.id as string, 'rl', 'heavy')
      }
    }
    if (feature.properties['marker-color'] === '#FD8A03') {
      icon = 'rail-metro-orange'
      incrementMapItem(feature.id as string, 'ol', 'heavy')
    }
    if (feature.properties['marker-color'] === '#7B388C') {
      icon = 'rail'
      incrementMapItem(feature.id as string, 'cr', 'regional')
    }
    if (
      feature.properties.route &&
      (feature.properties.route === 'Amtrak' ||
        feature.properties.route.startsWith('Acela') ||
        feature.properties.route.includes('Northeast Regional'))
    ) {
      icon = 'rail-amtrak'
      incrementMapItem(feature.id as string, 'amtrak', 'regional')
    }
    if (feature.properties.route && feature.properties.route.startsWith('SL')) {
      incrementMapItem(feature.id as string, 'sl', 'bus')
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
    title: `${feature.id} ${feature.properties.route} ${status} ${station}`,
    opacity: opacity,
    zIndexOffset: zIndex,
    riseOnHover: true,
    riseOffset: 2000
  })
}

export function createIconForFeature(feature: VehicleFeature): L.Icon | null {
  let icon_size = 28
  let icon = 'bus-yellow.svg'
  let stopOrGo = ''

  if (feature.properties['marker-symbol'] === 'building') {
    return null
  }

  if (feature.properties['marker-symbol'] === 'bus') {
    icon_size = 25
  }
  if (feature.properties['marker-size'] === 'small') {
    icon_size = 27
  }
  if (feature.properties['marker-color'] === '#008150') {
    icon = 'rail-light'
  }
  if (feature.properties['marker-color'] === '#2F5DA6') {
    icon = 'rail-metro-blue'
  }
  if (feature.properties['marker-color'] === '#FA2D27') {
    icon = 'rail-metro-red'
  }
  if (feature.properties['marker-color'] === '#FD8A03') {
    icon = 'rail-metro-orange'
  }
  if (feature.properties['marker-color'] === '#7B388C') {
    icon = 'rail'
  }
  if (
    feature.properties.route &&
    (feature.properties.route === 'Amtrak' ||
      feature.properties.route.startsWith('Acela') ||
      feature.properties.route.includes('Northeast Regional'))
  ) {
    icon = 'rail-amtrak'
  }
  if (feature.properties.route && feature.properties.route.startsWith('SL')) {
    icon = 'bus-silver'
  }

  return L.icon({
    iconUrl: `/images/icons/${icon}${stopOrGo}.svg`,
    iconSize: L.point(icon_size, icon_size)
  })
}

// Global variable to store all vehicle features for stop predictions
let allVehicleFeatures: VehicleFeature[] = []

// Function to update vehicle features data and refresh stop popups
export function updateVehicleFeatures(features: VehicleFeature[]): void {
  allVehicleFeatures = features
  // Update stop popup content if building markers exist
  if (typeof window !== 'undefined' && (window as any).buildingMarkers) {
    ;(window as any).buildingMarkers.eachLayer((layer: any) => {
      if (
        layer.feature &&
        layer.feature.properties['marker-symbol'] === 'building'
      ) {
        const stopName = layer.feature.properties.name || 'Unknown Stop'
        const incomingVehicles = getIncomingVehicles(stopName)

        let vehicleInfo = ''
        if (incomingVehicles.length > 0) {
          vehicleInfo = '<br/><br/><b>Incoming Vehicles:</b>'
          incomingVehicles.forEach((vehicle) => {
            const route = vehicle.properties.route || 'Unknown Route'
            const eta = vehicle.properties.stop_eta
              ? ` - ETA: ${vehicle.properties.stop_eta}`
              : ''
            const status = vehicle.properties.status
              ? ` (${vehicle.properties.status})`
              : ''
            const headsign =
              vehicle.properties.headsign ||
              vehicle.properties.stop ||
              'Unknown destination'
            const vehicleCoords = vehicle.geometry.coordinates
            if (vehicleCoords && vehicleCoords.length >= 2) {
              vehicleInfo += `<br/>• <a href="#" onclick="window.moveMapToStop(${vehicleCoords[1]}, ${vehicleCoords[0]}); return false;" class="popup-link">${route}</a> to ${headsign}${eta}${status}`
            } else {
              vehicleInfo += `<br/>• <span class="popup-link">${route}</span> to ${headsign}${eta}${status}`
            }
          })
        }

        const newContent = `<b>${stopName} Stop</b>${vehicleInfo}`
        layer.setPopupContent(newContent)
      }
    })
  }
}

// Function to determine vehicle type from route
function getVehicleType(
  route: string
): 'subway' | 'bus' | 'commuter' | 'amtrak' | 'unknown' {
  if (!route) return 'unknown'

  const routeLower = route.toLowerCase()

  // Subway lines
  if (
    routeLower.startsWith('red') ||
    routeLower.startsWith('blue') ||
    routeLower.startsWith('green') ||
    routeLower.startsWith('orange') ||
    routeLower.includes('mattapan')
  ) {
    return 'subway'
  }

  // Silver Line (BRT)
  if (routeLower.startsWith('sl') || routeLower.includes('silver')) {
    return 'bus'
  }

  // Commuter Rail
  if (
    routeLower.startsWith('cr-') ||
    (routeLower.includes('line') &&
      !routeLower.includes('red') &&
      !routeLower.includes('blue') &&
      !routeLower.includes('green') &&
      !routeLower.includes('orange'))
  ) {
    return 'commuter'
  }

  // Amtrak
  if (
    routeLower.includes('amtrak') ||
    routeLower.includes('acela') ||
    routeLower.includes('northeast regional')
  ) {
    return 'amtrak'
  }

  // Bus routes (numeric)
  if (/^\d+$/.test(route)) {
    return 'bus'
  }

  return 'unknown'
}

// Function to determine expected vehicle types for a stop
function getExpectedVehicleTypes(
  stopName: string
): ('subway' | 'bus' | 'commuter' | 'amtrak')[] {
  const stopLower = stopName.toLowerCase()

  // Commuter Rail stations typically have "station" in the name or are recognizable CR stops
  if (
    stopLower.includes('station') ||
    [
      'south station',
      'north station',
      'back bay',
      'ruggles',
      'forest hills'
    ].some((cr) => stopLower.includes(cr))
  ) {
    return ['commuter', 'amtrak', 'subway'] // Allow some crossover at major hubs
  }

  // Major interchange stations
  if (
    [
      'downtown crossing',
      'park street',
      'government center',
      'haymarket',
      'state'
    ].some((hub) => stopLower.includes(hub))
  ) {
    return ['subway', 'bus']
  }

  // Airport-related stops
  if (stopLower.includes('airport') || stopLower.includes('logan')) {
    return ['bus', 'subway']
  }

  // Default to subway for most stops (can be refined further)
  return ['subway', 'bus']
}

// Function to get incoming vehicles for a stop
function getIncomingVehicles(stopName: string): VehicleFeature[] {
  if (!stopName || !allVehicleFeatures.length) return []

  // Normalize stop name for better matching
  const normalizedStopName = stopName.toLowerCase().trim()
  const expectedTypes = getExpectedVehicleTypes(stopName)

  return allVehicleFeatures
    .filter((vehicle) => {
      // Must be a vehicle, not a building
      if (vehicle.properties['marker-symbol'] === 'building') return false

      // Must have a stop destination
      if (!vehicle.properties.stop) return false

      // Filter by vehicle type compatibility
      const vehicleType = getVehicleType(vehicle.properties.route || '')
      if (
        vehicleType === 'unknown' ||
        vehicleType === 'amtrak' ||
        !expectedTypes.includes(vehicleType)
      )
        return false

      const vehicleStop = vehicle.properties.stop.toLowerCase().trim()

      // EXTREMELY strict matching - only exact matches or very close variants
      const exactMatch = vehicleStop === normalizedStopName

      // Allow for common suffix variations but be very strict
      const cleanStopName = normalizedStopName
        .replace(/\s+(station|stop|st)$/i, '')
        .trim()
      const cleanVehicleStop = vehicleStop
        .replace(/\s+(station|stop|st)$/i, '')
        .trim()
      const cleanMatch =
        cleanVehicleStop === cleanStopName && cleanStopName.length >= 3

      // Only allow these two types of matches - no fuzzy matching
      const nameMatches = exactMatch || cleanMatch

      // Must have actual destination/ETA info and name must match exactly
      const hasETA = vehicle.properties.stop_eta

      // Only show vehicles that have ETA info AND exact name matches
      return nameMatches && hasETA
    })
    .slice(0, 3)
}

export function onEachFeature(feature: VehicleFeature, layer: L.Layer): void {
  if (feature.geometry.type === 'LineString' && feature.properties.route) {
    layer.bindPopup(`<b>${feature.properties.route}</b>`)
  }
  if (feature.geometry.type === 'Point') {
    if (feature.properties['marker-symbol'] === 'building') {
      const stopName = feature.properties.name || 'Unknown Stop'
      const incomingVehicles = getIncomingVehicles(stopName)

      let vehicleInfo = ''
      if (incomingVehicles.length > 0) {
        vehicleInfo = '<br/><br/><b>Incoming Vehicles:</b>'
        incomingVehicles.forEach((vehicle) => {
          const route = vehicle.properties.route || 'Unknown Route'
          const eta = vehicle.properties.stop_eta
            ? ` - ETA: ${vehicle.properties.stop_eta}`
            : ''
          const status = vehicle.properties.status
            ? ` (${vehicle.properties.status})`
            : ''
          const headsign =
            vehicle.properties.headsign ||
            vehicle.properties.stop ||
            'Unknown destination'
          const vehicleCoords = vehicle.geometry.coordinates
          if (vehicleCoords && vehicleCoords.length >= 2) {
            vehicleInfo += `<br/>• <a href="#" onclick="window.moveMapToStop(${vehicleCoords[1]}, ${vehicleCoords[0]}); return false;" class="popup-link">${route}</a> to ${headsign}${eta}${status}`
          } else {
            vehicleInfo += `<br/>• <span class="popup-link">${route}</span> to ${headsign}${eta}${status}`
          }
        })
      }
      layer.bindPopup(`<b>${stopName} Stop</b>${vehicleInfo}`)
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

      let stopDisplay = feature.properties.stop || ''
      if (feature.properties.stop) {
        // Don't create stop links for Amtrak trains since their stop data isn't reliable
        const isAmtrak =
          feature.properties.route &&
          (feature.properties.route.toLowerCase().includes('amtrak') ||
            feature.properties.route.toLowerCase().includes('acela') ||
            feature.properties.route
              .toLowerCase()
              .includes('northeast regional'))

        if (!isAmtrak) {
          let coords = feature.properties['stop-coordinates']

          // Fallback to vehicle coordinates if stop coordinates are missing
          if (!coords || coords.length < 2) {
            coords = feature.geometry.coordinates
          }

          if (coords && coords.length >= 2) {
            const lat = coords[1]
            const lng = coords[0]
            stopDisplay = `<a href="#" onclick="window.moveMapToStop(${lat}, ${lng}); return false;" class="popup-link">${feature.properties.stop}</a>`
          }
        }
      }

      const popup = L.popup({
        content: `<b>${feature.properties.route}/<i>${feature.properties.headsign || feature.properties.stop}</i></b>
        <br />Stop: ${stopDisplay}
        <br />Status: ${niceStatus(feature.properties.status || '')}
        ${eta}${speed}${occupancy}${platform_prediction}
        <br /><small>Update Time: ${update_time.toLocaleTimeString()}</small>`,
        autoPan: true,
        closeOnEscapeKey: true
      })
      layer.bindPopup(popup)
    }
  }
}
