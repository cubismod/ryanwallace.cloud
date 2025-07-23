import * as L from 'leaflet'
import { VehicleFeature } from './types'
import { pointToLayer, onEachFeature } from './markers'
import { layerGroups } from './layer-groups'

declare const $: {
  getJSON: (url: string, callback: (data: any) => void) => void
}

export function fetchAmtrakData(bos_url: string): void {
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
