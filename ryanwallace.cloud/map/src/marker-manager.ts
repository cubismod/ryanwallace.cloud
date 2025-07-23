import * as L from 'leaflet'
import 'leaflet.markercluster'
import { VehicleFeature } from './types'
import { niceStatus } from './utils'
import { pointToLayer, onEachFeature, createIconForFeature } from './markers'
import { getLayerGroupForRoute, layerGroups } from './layer-groups'
import { decrementMapItem } from './vehicle-counter'

export let currentMarkers: Map<string | number, L.Marker> = new Map()

export function updateMarkers(features: VehicleFeature[]): void {
  const newMarkerIds = new Set<string | number>()

  const vehicleFeatures = features.filter(
    (f) => f.properties['marker-symbol'] !== 'building'
  )

  for (const feature of vehicleFeatures) {
    const markerId =
      feature.id ||
      `${feature.geometry.coordinates[0]}-${feature.geometry.coordinates[1]}`
    newMarkerIds.add(markerId)

    const latlng = L.latLng(
      feature.geometry.coordinates[1],
      feature.geometry.coordinates[0]
    )
    const existingMarker = currentMarkers.get(markerId)

    if (existingMarker) {
      existingMarker.setLatLng(latlng)

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

      const popupContent = `<b>${feature.properties.route}/<i>${feature.properties.headsign || feature.properties.stop}</i></b>
        <br />Stop: ${feature.properties.stop || ''}
        <br />Status: ${niceStatus(feature.properties.status || '')}
        ${eta}${speed}${occupancy}${platform_prediction}
        <br /><small>Update Time: ${update_time.toLocaleTimeString()}</small>`

      existingMarker.setPopupContent(popupContent)

      const newIcon = createIconForFeature(feature)
      if (newIcon) {
        existingMarker.setIcon(newIcon)
      }
    } else {
      const marker = pointToLayer(feature, latlng)
      currentMarkers.set(markerId, marker)

      if (feature.properties.route) {
        const layerGroup = getLayerGroupForRoute(feature.properties.route)
        layerGroup.addLayer(marker)
      }

      onEachFeature(feature, marker)
    }
  }

  for (const [markerId, marker] of currentMarkers.entries()) {
    if (!newMarkerIds.has(markerId)) {
      Object.values(layerGroups).forEach((group) => {
        if (group.hasLayer(marker)) {
          group.removeLayer(marker)
        }
      })
      currentMarkers.delete(markerId)
      decrementMapItem(markerId as string)
    }
  }
}
