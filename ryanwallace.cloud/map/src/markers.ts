import * as L from 'leaflet'
import { VehicleFeature } from './types'
import { niceStatus } from './utils'

import { getShapesFromLayerGroup, snapVehicleToRoute } from './geometry-utils'
import { getShapesLayerGroupForRoute } from './layer-groups'
// Elf score utilities are lazy-loaded in marker-manager popups

export function pointToLayer(
  feature: VehicleFeature,
  latlng: L.LatLng
): L.Marker {
  let adjustedLatLng = latlng

  // Enable vehicle snapping to improve positioning accuracy
  if (
    feature.properties.route &&
    feature.properties['marker-symbol'] !== 'building'
  ) {
    try {
      const shapesGroup = getShapesLayerGroupForRoute(feature.properties.route)
      const routeShapes = getShapesFromLayerGroup(shapesGroup)

      adjustedLatLng = snapVehicleToRoute(
        latlng,
        routeShapes,
        feature.properties.status,
        feature.properties.route,
        feature.properties.direction
      )
    } catch (error) {
      console.warn('Error snapping vehicle to route:', error)
      adjustedLatLng = latlng
    }
  }
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
    }
    if (feature.properties['marker-color'] === '#2F5DA6') {
      icon = 'rail-metro-blue'
    }
    if (feature.properties['marker-color'] === '#FA2D27') {
      icon = 'rail-metro-red'
      if (feature.properties['route'] === 'Mattapan') {
      } else {
      }
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

  return L.marker(adjustedLatLng, {
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
            const route = vehicle.properties.route || 'Unknown'
            const eta = vehicle.properties.stop_eta || 'Unknown'
            const headsign =
              vehicle.properties.headsign ||
              vehicle.properties.stop ||
              'Unknown destination'
            const vehicleCoords = vehicle.geometry.coordinates
            if (vehicleCoords && vehicleCoords.length >= 2) {
              vehicleInfo += `<br/>• <a href="#" onclick="window.moveMapToStop(${vehicleCoords[1]}, ${vehicleCoords[0]}); return false;" class="popup-link">${route}</a> to ${headsign} - ETA: ${eta}`
            } else {
              vehicleInfo += `<br/>• <span class="popup-link">${route}</span> to ${headsign} - ETA: ${eta}`
            }
          })
        } else {
          vehicleInfo = ''
        }

        const newContent = `<b>${stopName} Stop</b>${vehicleInfo}`
        layer.setPopupContent(newContent)
      }
    })
  }
}

// Function to get incoming vehicles for a stop
function getIncomingVehicles(stopName: string): VehicleFeature[] {
  if (!stopName) return []

  return allVehicleFeatures
    .filter(
      (vehicle) =>
        vehicle.properties.stop &&
        vehicle.properties.stop
          .toLowerCase()
          .includes(stopName.toLowerCase()) &&
        vehicle.properties.stop_eta &&
        vehicle.properties['marker-symbol'] !== 'building'
    )
    .slice(0, 3) // Limit to next 3 incoming vehicles
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
          const route = vehicle.properties.route || 'Unknown'
          const eta = vehicle.properties.stop_eta || 'Unknown'
          const headsign =
            vehicle.properties.headsign ||
            vehicle.properties.stop ||
            'Unknown destination'
          const vehicleCoords = vehicle.geometry.coordinates
          if (vehicleCoords && vehicleCoords.length >= 2) {
            vehicleInfo += `<br/>• <a href="#" onclick="window.moveMapToStop(${vehicleCoords[1]}, ${vehicleCoords[0]}); return false;" class="popup-link">${route}</a> to ${headsign} - ETA: ${eta}`
          } else {
            vehicleInfo += `<br/>• <span class="popup-link">${route}</span> to ${headsign} - ETA: ${eta}`
          }
        })
      } else {
        vehicleInfo = ''
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
      if (feature.properties.stop && feature.properties['stop-coordinates']) {
        const coords = feature.properties['stop-coordinates']
        if (coords && coords.length >= 2) {
          const lat = coords[1]
          const lng = coords[0]
          stopDisplay = `<a href="#" onclick="window.moveMapToStop(${lat}, ${lng}); return false;" class="popup-link">${feature.properties.stop}</a>`
        }
      } else if (feature.properties.stop) {
        stopDisplay = feature.properties.stop
      }

      // Base popup without elf score (lazy-load on open)
      const buildContent = (elfScoreHtml: string = '') => {
        const idStr = String(feature.id ?? '')
        const isTracking = (window as any).isTrackingVehicleId
          ? (window as any).isTrackingVehicleId(feature.id as any)
          : false
        const trackLabel = isTracking ? 'Stop tracking' : 'Track vehicle'
        const trackAction = isTracking
          ? `window.untrackVehicle()`
          : `window.trackVehicleById(${JSON.stringify(idStr)})`
        return `<b>${feature.properties.route}/<i>${feature.properties.headsign || feature.properties.stop}</i></b>
        <br />Stop: ${stopDisplay}
        <br />Status: ${niceStatus(feature.properties.status || '')}
        ${elfScoreHtml}
        ${eta}${speed}${occupancy}${platform_prediction}
        <br /><small>Update Time: ${update_time.toLocaleTimeString()}</small>
        <br /><a href="#" class="popup-link" onclick='${trackAction}; return false;'>${trackLabel}</a>`
      }
      const popup = L.popup({ autoPan: true, closeOnEscapeKey: true })
      popup.setContent(buildContent())
      layer.bindPopup(popup)
      layer.on('popupopen', async () => {
        const elfModeEnabled =
          (document.getElementById('show-elf-mode') as HTMLInputElement)
            ?.checked || false
        if (!elfModeEnabled) return
        try {
          const mod = await import('./elf-score')
          const elfScore = mod.calculateElfScore(feature)
          const elfDisplay = mod.getElfScoreDisplay(elfScore)
          layer
            .getPopup()
            ?.setContent(buildContent(`<br />Elf Score: ${elfDisplay}`))
        } catch {}
      })
    }
  }
}
