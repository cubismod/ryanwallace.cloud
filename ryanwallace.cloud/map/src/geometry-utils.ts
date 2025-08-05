import * as L from 'leaflet'
import * as turf from '@turf/turf'
import {
  getTracksForRoute,
  convertTracksToPolylines,
  getRailwayTracksSync,
  hasRailwayTracks,
  onRailwayTracksLoaded
} from './overpass-railway'

const MAX_SNAP_DISTANCE = 100 // meters - maximum distance to snap vehicles to route
const COMMUTER_RAIL_TRAIN_LENGTH = 200 // meters - approximate length of 6-8 car CR train

// Track whether we've set up progressive enhancement
let progressiveEnhancementSetup = false

export function setupProgressiveEnhancement(): void {
  if (progressiveEnhancementSetup) {
    return
  }

  progressiveEnhancementSetup = true

  // Set up callback for when railway tracks load
  onRailwayTracksLoaded((tracks) => {
    console.log(
      `Railway tracks loaded (${tracks.length}), enhancing vehicle positioning...`
    )

    // Trigger a map refresh to update vehicle positions with new track data
    if (typeof window !== 'undefined' && (window as any).annotate_map) {
      setTimeout(() => {
        ;(window as any).annotate_map()
      }, 100) // Small delay to ensure tracks are fully processed
    }
  })
}

function filterShapesByDirection(
  shapes: L.Polyline[],
  route?: string,
  direction?: number
): L.Polyline[] {
  if (!route || direction === undefined || shapes.length === 0) {
    return shapes
  }

  // For rail routes with bidirectional tracks, filter by direction
  if (
    route.startsWith('Red') ||
    route.startsWith('Blue') ||
    route.startsWith('Orange') ||
    route.startsWith('Green') ||
    route.startsWith('Mattapan') ||
    route.startsWith('CR')
  ) {
    // If we have shape data with direction information, filter accordingly
    // For now, return a subset based on direction (0 = outbound, 1 = inbound)
    // This is a simplified approach - ideally shapes would have direction metadata

    if (direction === 0) {
      // Outbound - take first half of shapes (simplified)
      return shapes.slice(0, Math.ceil(shapes.length / 2))
    } else if (direction === 1) {
      // Inbound - take second half of shapes (simplified)
      return shapes.slice(Math.floor(shapes.length / 2))
    }
  }

  // For other routes or when direction filtering isn't applicable, return all shapes
  return shapes
}

function offsetPositionAlongRoute(
  snappedPoint: L.LatLng,
  routeShapes: L.Polyline[],
  offsetMeters: number,
  direction: number
): L.LatLng {
  try {
    // Find the best matching route shape
    let bestShape: L.Polyline | null = null
    let minDistanceToShape = Infinity

    for (const shape of routeShapes) {
      const coordinates = shape.getLatLngs() as L.LatLng[]
      if (coordinates.length < 2) continue

      // Check distance to this shape
      const shapePoint = turf.point([snappedPoint.lng, snappedPoint.lat])
      const lineCoordinates = coordinates.map((coord) => [coord.lng, coord.lat])
      const line = turf.lineString(lineCoordinates)
      const nearestPoint = turf.nearestPointOnLine(line, shapePoint)
      const distance = turf.distance(shapePoint, nearestPoint, {
        units: 'meters'
      })

      if (distance < minDistanceToShape) {
        minDistanceToShape = distance
        bestShape = shape
      }
    }

    if (!bestShape) {
      return snappedPoint
    }

    const coordinates = bestShape.getLatLngs() as L.LatLng[]
    const lineCoordinates = coordinates.map((coord) => [coord.lng, coord.lat])
    const line = turf.lineString(lineCoordinates)

    // Get the line length and current position along the line
    const lineLength = turf.length(line, { units: 'meters' })
    const shapePoint = turf.point([snappedPoint.lng, snappedPoint.lat])
    const nearestPoint = turf.nearestPointOnLine(line, shapePoint)

    // Calculate the distance along the line to the current position
    const distanceAlongLine = nearestPoint.properties.location * lineLength

    // Calculate new position based on direction
    let newDistanceAlongLine: number
    if (direction === 1) {
      // Inbound - move forward along the line (toward destination)
      newDistanceAlongLine = Math.min(
        lineLength,
        distanceAlongLine + offsetMeters
      )
    } else {
      // Outbound - don't offset (locomotive is at front)
      return snappedPoint
    }

    // Get the new point along the line
    const newPoint = turf.along(line, newDistanceAlongLine / 1000, {
      units: 'kilometers'
    })
    return L.latLng(
      newPoint.geometry.coordinates[1],
      newPoint.geometry.coordinates[0]
    )
  } catch (error) {
    console.warn('Error calculating train offset:', error)
    return snappedPoint
  }
}

function isValidCoordinate(coord: any): coord is L.LatLng {
  return (
    coord &&
    typeof coord.lat === 'number' &&
    typeof coord.lng === 'number' &&
    !isNaN(coord.lat) &&
    !isNaN(coord.lng) &&
    isFinite(coord.lat) &&
    isFinite(coord.lng)
  )
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

export function snapVehicleToRoute(
  vehicleLatLng: L.LatLng,
  routeShapes: L.Polyline[],
  vehicleStatus?: string,
  route?: string,
  direction?: number
): L.LatLng {
  // Try to use detailed railway track data for rail routes if available
  if (
    route &&
    hasRailwayTracks() &&
    (route.startsWith('CR-') ||
      route.startsWith('Red') ||
      route.startsWith('Blue') ||
      route.startsWith('Orange') ||
      route.startsWith('Green') ||
      route.startsWith('Mattapan'))
  ) {
    try {
      const railwayTracks = getRailwayTracksSync()
      const relevantTracks = getTracksForRoute(railwayTracks, route)

      if (relevantTracks.length > 0) {
        const railwayPolylines = convertTracksToPolylines(relevantTracks)
        console.log(
          `Using ${relevantTracks.length} Overpass railway tracks for ${route}`
        )

        // Use railway tracks instead of route shapes
        return snapVehicleToRouteInternal(
          vehicleLatLng,
          railwayPolylines,
          vehicleStatus,
          route,
          direction
        )
      }
    } catch (error) {
      console.warn(
        'Failed to use railway track data, falling back to route shapes:',
        error
      )
    }
  }

  // Fallback to existing route shapes
  return snapVehicleToRouteInternal(
    vehicleLatLng,
    routeShapes,
    vehicleStatus,
    route,
    direction
  )
}

function snapVehicleToRouteInternal(
  vehicleLatLng: L.LatLng,
  routeShapes: L.Polyline[],
  vehicleStatus?: string,
  route?: string,
  direction?: number
): L.LatLng {
  if (!route || routeShapes.length === 0) {
    return vehicleLatLng
  }

  if (vehicleStatus === 'STOPPED_AT') {
    return vehicleLatLng
  }

  // Exclude routes without reliable track geometry data
  if (
    route.includes('Amtrak') ||
    route.startsWith('Acela') ||
    route.includes('Northeast Regional') ||
    route.includes('Downeaster') ||
    route.startsWith('SL')
  ) {
    return vehicleLatLng
  }

  if (!isValidCoordinate(vehicleLatLng)) {
    console.warn('Invalid vehicle coordinates:', vehicleLatLng)
    return vehicleLatLng
  }

  const vehiclePoint = turf.point([vehicleLatLng.lng, vehicleLatLng.lat])
  let closestPoint = vehicleLatLng
  let minDistance = Infinity

  // Filter shapes by direction for rail routes
  const relevantShapes = filterShapesByDirection(routeShapes, route, direction)

  for (const shape of relevantShapes) {
    let coordinates = shape.getLatLngs()

    // Handle nested arrays (MultiPolyline case)
    if (coordinates.length > 0 && Array.isArray(coordinates[0])) {
      coordinates = (coordinates as L.LatLng[][]).flat()
    }

    const coordArray = coordinates as L.LatLng[]
    if (coordArray.length < 2) continue

    const validCoordinates = coordArray.filter(isValidCoordinate)
    if (validCoordinates.length < 2) continue

    const lineCoordinates = validCoordinates
      .map((coord) => [coord.lng, coord.lat])
      .filter(([lng, lat]) => isValidLatLng(lat, lng))

    if (lineCoordinates.length < 2) continue

    // Additional validation before creating line
    if (!Array.isArray(lineCoordinates) || lineCoordinates.length < 2) {
      continue
    }

    // Validate each coordinate pair
    const validLineCoords = lineCoordinates.filter((coord) => {
      if (!Array.isArray(coord) || coord.length !== 2) {
        return false
      }
      const [lng, lat] = coord
      return isValidLatLng(lat, lng)
    })

    if (validLineCoords.length < 2) {
      continue
    }

    try {
      // Optimize coordinates - remove duplicates and limit size for performance
      const optimizedCoords = validLineCoords.reduce((acc, coord, index) => {
        if (
          index === 0 ||
          Math.abs(coord[0] - acc[acc.length - 1][0]) > 0.0001 ||
          Math.abs(coord[1] - acc[acc.length - 1][1]) > 0.0001
        ) {
          acc.push(coord)
        }
        return acc
      }, [] as number[][])

      // Limit coordinate count to prevent performance issues
      const finalCoords =
        optimizedCoords.length > 500
          ? optimizedCoords.filter(
              (_, index) =>
                index % Math.ceil(optimizedCoords.length / 500) === 0
            )
          : optimizedCoords

      if (finalCoords.length < 2) {
        continue
      }

      const line = turf.lineString(finalCoords)
      const snapped = turf.nearestPointOnLine(line, vehiclePoint)
      const distance = turf.distance(vehiclePoint, snapped, { units: 'meters' })

      if (distance < minDistance) {
        minDistance = distance
        const [lng, lat] = snapped.geometry.coordinates
        if (isValidLatLng(lat, lng)) {
          closestPoint = L.latLng(lat, lng)
        }
      }
    } catch (error) {
      console.error('Error snapping vehicle to route:', error, {
        route,
        vehicleStatus,
        lineCoordinatesLength: lineCoordinates?.length,
        validLineCoordsLength: validLineCoords?.length,
        vehiclePoint: [vehicleLatLng.lng, vehicleLatLng.lat],
        sampleLineCoords: lineCoordinates?.slice(0, 3),
        sampleValidCoords: validLineCoords?.slice(0, 3)
      })
      continue
    }
  }

  if (shouldSnapToGeometry(vehicleStatus, route, minDistance)) {
    // Apply commuter rail train length offset for inbound trains
    if (route && route.startsWith('CR') && direction === 1) {
      return offsetPositionAlongRoute(
        closestPoint,
        relevantShapes,
        COMMUTER_RAIL_TRAIN_LENGTH,
        direction
      )
    }
    return closestPoint
  }

  return vehicleLatLng
}

function shouldSnapToGeometry(
  vehicleStatus: string | undefined,
  route: string | undefined,
  distance: number
): boolean {
  if (distance > MAX_SNAP_DISTANCE) {
    return false
  }

  if (!route || vehicleStatus === 'STOPPED_AT') {
    return false
  }

  if (
    route.startsWith('Red') ||
    route.startsWith('Blue') ||
    route.startsWith('Orange') ||
    route.startsWith('Green') ||
    route.startsWith('Mattapan')
  ) {
    return distance <= 50
  }

  if (route.startsWith('CR')) {
    return distance <= 75
  }

  // Default for remaining routes (mainly buses)
  return distance <= 25
}

export function getShapesFromLayerGroup(
  layerGroup: L.LayerGroup
): L.Polyline[] {
  const shapes: L.Polyline[] = []

  layerGroup.eachLayer((layer) => {
    if (layer instanceof L.Polyline) {
      shapes.push(layer)
    }
  })

  return shapes
}
