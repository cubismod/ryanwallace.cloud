import * as L from 'leaflet'
import { VehicleFeature } from './types'
import { pointToLayer, onEachFeature } from './markers'
import { layerGroups } from './layer-groups'

export function fetchAmtrakData(bos_url: string): void {
  fetch(`${bos_url}/trains/geojson`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((data: any) => {
      if (data && data.features) {
        // Clear existing Amtrak markers before adding new ones
        layerGroups.amtrak.clearLayers()

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
    .catch((_e) => {
      // Non-critical; ignore fetch errors silently
    })
}
