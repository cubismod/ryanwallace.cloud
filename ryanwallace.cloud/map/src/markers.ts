import * as L from 'leaflet'
import invert from 'invert-color'
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

export function onEachFeature(feature: VehicleFeature, layer: L.Layer): void {
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
          const layerMap = (layer as any)._map
          if (layerMap) {
            line1.addTo(layerMap)
            line2.addTo(layerMap)
            layerMap.panInsideBounds(line1.getBounds())
            window.setTimeout(() => {
              line1.removeFrom(layerMap)
              line2.removeFrom(layerMap)
            }, 10000)
          }
        })
      }

      layer.bindPopup(popup)
    }
  }
}
