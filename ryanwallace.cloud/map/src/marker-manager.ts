import * as L from 'leaflet'
import 'leaflet.markercluster'
import { VehicleFeature } from './types'
import { niceStatus } from './utils'
import { pointToLayer, onEachFeature, createIconForFeature } from './markers'
import { getLayerGroupForRoute, layerGroups } from './layer-groups'
import { decrementMapItem } from './vehicle-counter'
import { calculateElfScore } from './elf-score'

export let currentMarkers: Map<string | number, L.Marker> = new Map()

// Helper function to convert hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : { r: 123, g: 56, b: 140 } // Default purple if parsing fails
}

// Function to apply stored elf effects when marker becomes unclustered
export function applyStoredElfEffects(marker: L.Marker): void {
  const elfModeToggle = document.getElementById(
    'show-elf-mode'
  ) as HTMLInputElement
  const elfModeEnabled = elfModeToggle?.checked || false

  const elfData = (marker as any)._elfData
  if (!elfData || !elfModeEnabled) {
    return
  }

  const markerElement = marker.getElement()
  if (!markerElement) {
    return
  }

  const { elfScore, elfClass, feature } = elfData

  // The marker element IS the icon element (it's the <img> itself)
  const iconElement = markerElement as HTMLElement
  if (iconElement) {
    iconElement.classList.remove(
      'elf-low',
      'elf-medium',
      'elf-high',
      'elf-legendary',
      'elf-trans-pride'
    )
    iconElement.classList.add(elfClass)

    // Apply halos colored to match vehicle route (more visible)
    let boxShadow = ''

    // Get route color from vehicle properties
    const routeColor = feature.properties['marker-color'] || '#7B388C'
    const routeColorRgb = hexToRgb(routeColor)

    if (elfScore.level === 'Trans Pride') {
      // Trans pride gets special colors regardless of route
      boxShadow = `0 0 12px rgba(91, 206, 250, 0.8), 0 0 24px rgba(245, 169, 184, 0.6)`
    } else if (elfScore.level === 'Legendary') {
      // Route color with rainbow accent
      boxShadow = `0 0 10px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.8), 0 0 20px rgba(255, 0, 128, 0.4)`
    } else if (elfScore.level === 'High') {
      boxShadow = `0 0 8px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.7)`
    } else if (elfScore.level === 'Medium') {
      boxShadow = `0 0 6px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.6)`
    } else {
      boxShadow = `0 0 4px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.5)`
    }

    iconElement.style.boxShadow = boxShadow
    iconElement.style.transition = 'box-shadow 0.3s ease'
  }
}

function applyElfClasses(marker: L.Marker, feature: VehicleFeature): void {
  const elfModeToggle = document.getElementById(
    'show-elf-mode'
  ) as HTMLInputElement
  const elfModeEnabled = elfModeToggle?.checked || false

  // Skip elf effects for building/station markers
  if (feature.properties['marker-symbol'] === 'building') {
    return
  }

  // Always calculate and store elf data on the marker for later use
  const elfScore = calculateElfScore(feature)
  const elfClass = `elf-${elfScore.level.toLowerCase().replace(' ', '-')}`

  // Store elf data on the marker for when it becomes unclustered
  ;(marker as any)._elfData = {
    elfScore,
    elfClass,
    feature
  }

  const markerElement = marker.getElement()

  if (!markerElement) {
    // Marker is clustered, store data but can't apply visual effects yet
    console.log(
      'Marker is clustered, storing elf data:',
      feature.id || 'unknown'
    )
    return
  }

  console.log(
    'Found unclustered marker element, applying elf effects:',
    feature.id || 'unknown',
    'elf enabled:',
    elfModeEnabled
  )

  // Remove existing elf classes
  markerElement.classList.remove(
    'elf-low',
    'elf-medium',
    'elf-high',
    'elf-legendary',
    'elf-trans-pride'
  )

  if (elfModeEnabled) {
    // The marker element IS the icon element (it's the <img> itself)
    const iconElement = markerElement as HTMLElement

    console.log(
      'Applying elf effects to marker (img) element:',
      feature.id || 'unknown'
    )
    if (iconElement) {
      iconElement.classList.remove(
        'elf-low',
        'elf-medium',
        'elf-high',
        'elf-legendary',
        'elf-trans-pride'
      )
      iconElement.classList.add(elfClass)
      console.log(
        'Added elf class:',
        elfClass,
        'to icon. Classes now:',
        iconElement.className
      )

      // Class and initial filter applied

      // Apply halos colored to match vehicle route (more visible)
      let boxShadow = ''

      // Get route color from vehicle properties
      const routeColor = feature.properties['marker-color'] || '#7B388C'
      const routeColorRgb = hexToRgb(routeColor)

      if (elfScore.level === 'Trans Pride') {
        // Trans pride gets special colors regardless of route
        boxShadow = `0 0 12px rgba(91, 206, 250, 0.8), 0 0 24px rgba(245, 169, 184, 0.6)`
      } else if (elfScore.level === 'Legendary') {
        // Route color with rainbow accent
        boxShadow = `0 0 10px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.8), 0 0 20px rgba(255, 0, 128, 0.4)`
      } else if (elfScore.level === 'High') {
        boxShadow = `0 0 8px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.7)`
      } else if (elfScore.level === 'Medium') {
        boxShadow = `0 0 6px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.6)`
      } else {
        boxShadow = `0 0 4px rgba(${routeColorRgb.r}, ${routeColorRgb.g}, ${routeColorRgb.b}, 0.5)`
      }

      iconElement.style.boxShadow = boxShadow
      iconElement.style.transition = 'box-shadow 0.3s ease'
      console.log(
        'Applied halo to icon:',
        boxShadow,
        'actual style.boxShadow:',
        iconElement.style.boxShadow
      )
    }
  } else {
    // Remove custom styling when disabled
    // The marker element IS the icon element (it's the <img> itself)
    const iconElement = markerElement as HTMLElement
    if (iconElement) {
      iconElement.classList.remove(
        'elf-low',
        'elf-medium',
        'elf-high',
        'elf-legendary',
        'elf-trans-pride'
      )
      iconElement.style.boxShadow = ''
      iconElement.style.transition = ''
    }
  }
}

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

      // Create dynamic popup content that updates based on current elf mode state
      const createPopupContent = () => {
        const elfModeEnabled =
          (document.getElementById('show-elf-mode') as HTMLInputElement)
            ?.checked || false

        let elfScoreHtml = ''
        if (elfModeEnabled) {
          const elfScore = calculateElfScore(feature)
          const { getElfScoreDisplay } = require('./elf-score')
          const elfDisplay = getElfScoreDisplay(elfScore)
          elfScoreHtml = `<br />Elf Score: ${elfDisplay}`
        }

        return `<b>${feature.properties.route}/<i>${feature.properties.headsign || feature.properties.stop}</i></b>
        <br />Stop: ${feature.properties.stop || ''}
        <br />Status: ${niceStatus(feature.properties.status || '')}
        ${elfScoreHtml}
        ${eta}${speed}${occupancy}${platform_prediction}
        <br /><small>Update Time: ${update_time.toLocaleTimeString()}</small>`
      }

      existingMarker.setPopupContent(createPopupContent())

      // Update popup content when it opens to ensure elf mode state is current
      existingMarker.on('popupopen', () => {
        existingMarker.getPopup()?.setContent(createPopupContent())
      })

      const newIcon = createIconForFeature(feature)
      if (newIcon) {
        existingMarker.setIcon(newIcon)
      }

      // Re-enable elf CSS classes now that positioning is fixed
      applyElfClasses(existingMarker, feature)
    } else {
      const marker = pointToLayer(feature, latlng)
      currentMarkers.set(markerId, marker)

      if (feature.properties.route) {
        const layerGroup = getLayerGroupForRoute(feature.properties.route)
        layerGroup.addLayer(marker)
      }

      onEachFeature(feature, marker)

      // Re-enable elf CSS classes now that positioning is fixed
      applyElfClasses(marker, feature)
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

export function refreshAllElfClasses(features: VehicleFeature[]): void {
  const elfModeToggle = document.getElementById(
    'show-elf-mode'
  ) as HTMLInputElement
  const elfModeEnabled = elfModeToggle?.checked || false

  const vehicleFeatures = features.filter(
    (f) => f.properties['marker-symbol'] !== 'building'
  )

  for (const feature of vehicleFeatures) {
    const markerId =
      feature.id ||
      `${feature.geometry.coordinates[0]}-${feature.geometry.coordinates[1]}`

    const marker = currentMarkers.get(markerId)
    if (marker) {
      if (elfModeEnabled) {
        applyElfClasses(marker, feature)
      } else {
        // Clear any existing elf effects when mode is disabled
        const markerElement = marker.getElement()
        if (markerElement) {
          markerElement.classList.remove(
            'elf-low',
            'elf-medium',
            'elf-high',
            'elf-legendary',
            'elf-trans-pride'
          )
          markerElement.style.boxShadow = ''
          markerElement.style.transition = ''
        }
      }
    }
  }
}

// Elf Search Functionality
export interface ElfSearchResult {
  feature: VehicleFeature
  elfScore: any
  marker: L.Marker
}

export function findTopElfTrains(
  features: VehicleFeature[]
): ElfSearchResult[] {
  const vehicleFeatures = features.filter(
    (f) => f.properties['marker-symbol'] !== 'building'
  )

  const elfResults: ElfSearchResult[] = []

  for (const feature of vehicleFeatures) {
    const markerId =
      feature.id ||
      `${feature.geometry.coordinates[0]}-${feature.geometry.coordinates[1]}`

    const marker = currentMarkers.get(markerId)
    if (marker) {
      const elfScore = calculateElfScore(feature)
      elfResults.push({
        feature,
        elfScore,
        marker
      })
    }
  }

  // Sort by elf score (descending)
  elfResults.sort((a, b) => b.elfScore.score - a.elfScore.score)

  // Return top 10 results
  return elfResults.slice(0, 10)
}

export function jumpToElfTrain(result: ElfSearchResult, map: L.Map): void {
  const coordinates = result.feature.geometry.coordinates
  const latlng = L.latLng(coordinates[1], coordinates[0])

  // Center map on the train with appropriate zoom
  map.setView(latlng, Math.max(map.getZoom(), 16))

  // Temporarily highlight the marker
  const marker = result.marker
  const markerElement = marker.getElement()

  if (markerElement) {
    // Add a temporary highlight effect
    markerElement.style.transform = 'scale(1.5)'
    markerElement.style.zIndex = '9999'
    markerElement.style.transition = 'transform 0.3s ease'

    setTimeout(() => {
      markerElement.style.transform = ''
      markerElement.style.zIndex = ''
    }, 2000)
  }

  // Open the popup
  marker.openPopup()
}
