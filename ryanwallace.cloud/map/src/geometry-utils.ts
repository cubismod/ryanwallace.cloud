import * as L from 'leaflet'
import along from '@turf/along'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import length from '@turf/length'
import distance from '@turf/distance'
import { point, lineString } from '@turf/helpers'

const MAX_SNAP_DISTANCE = 100 // meters - maximum distance to snap vehicles to route
const COMMUTER_RAIL_TRAIN_LENGTH = 200 // meters - approximate length of 6-8 car CR train

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
      let coordinates = shape.getLatLngs()
      // Handle nested arrays (MultiPolyline case)
      if (coordinates.length > 0 && Array.isArray(coordinates[0])) {
        coordinates = (coordinates as L.LatLng[][]).flat()
      }

      const coordArray = coordinates as L.LatLng[]
      if (coordArray.length < 2) continue

      // Validate coordinates
      const validCoordinates = coordArray.filter(isValidCoordinate)
      if (validCoordinates.length < 2) continue

      const lineCoordinates = validCoordinates
        .map((coord) => [coord.lng, coord.lat])
        .filter(([lng, lat]) => isValidLatLng(lat, lng))

      if (lineCoordinates.length < 2) continue

      try {
        // Build a simple line for distance comparison
        const line = lineString(lineCoordinates)
        const shapePoint = point([snappedPoint.lng, snappedPoint.lat])
        const nearestPoint = nearestPointOnLine(line, shapePoint)
        const distanceToShape = distance(shapePoint, nearestPoint, {
          units: 'meters'
        })

        if (distanceToShape < minDistanceToShape) {
          minDistanceToShape = distanceToShape
          bestShape = shape
        }
      } catch (e) {
        // Skip shapes with invalid geometry
        continue
      }
    }

    if (!bestShape) {
      return snappedPoint
    }

    let coordinates = bestShape.getLatLngs()
    if (coordinates.length > 0 && Array.isArray(coordinates[0])) {
      coordinates = (coordinates as L.LatLng[][]).flat()
    }
    const coordArray = coordinates as L.LatLng[]
    const validCoordinates = coordArray.filter(isValidCoordinate)
    const lineCoordinates = validCoordinates
      .map((coord) => [coord.lng, coord.lat])
      .filter(([lng, lat]) => isValidLatLng(lat, lng))

    if (!Array.isArray(lineCoordinates) || lineCoordinates.length < 2) {
      return snappedPoint
    }

    const line = lineString(lineCoordinates)

    // Get the line length and current position along the line
    const lineLength = length(line, { units: 'meters' })
    const shapePoint = point([snappedPoint.lng, snappedPoint.lat])
    const nearestPoint = nearestPointOnLine(line, shapePoint)

    // Calculate the distance along the line to the current position
    const location = Number(nearestPoint.properties.location)
    const distanceAlongLine =
      isFinite(location) && !isNaN(location) ? location * lineLength : 0

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
    const newPoint = along(line, newDistanceAlongLine / 1000, {
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

  const vehiclePoint = point([vehicleLatLng.lng, vehicleLatLng.lat])
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

      const line = lineString(finalCoords)
      const snapped = nearestPointOnLine(line, vehiclePoint)
      const dist = distance(vehiclePoint, snapped, { units: 'meters' })

      if (dist < minDistance) {
        minDistance = dist
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
