export const lines: string[] = ['rl', 'gl', 'bl', 'ol', 'sl', 'cr', 'amtrak']
export const vehicleTypes: string[] = ['light', 'heavy', 'regional', 'bus']

export const vehicleCountMap: Map<
  string,
  Map<string, number>
> = createVehicleCountMap()
export const markerIdInfo: Map<string, { route: string; vehicleType: string }> =
  new Map()

function createVehicleCountMap(): Map<string, Map<string, number>> {
  const vehicleCountMap = new Map<string, Map<string, number>>()
  for (const line of lines) {
    vehicleCountMap.set(line, new Map<string, number>())
  }
  return vehicleCountMap
}

export function incrementMapItem(
  id: string,
  route: string,
  vehicleType: string
): void {
  const existingInfo = markerIdInfo.get(id)
  if (!existingInfo) {
    markerIdInfo.set(id, { route, vehicleType: vehicleType })
    const existingCount = vehicleCountMap.get(route)?.get(vehicleType)
    if (existingCount !== undefined) {
      vehicleCountMap.get(route)!.set(vehicleType, existingCount + 1)
    } else {
      vehicleCountMap.get(route)?.set(vehicleType, 1)
    }
  }
}

export function decrementMapItem(id: string): void {
  const { route, vehicleType } = markerIdInfo.get(id) || {
    route: '',
    vehicleType: ''
  }
  const existing = vehicleCountMap.get(route)?.get(vehicleType)
  if (existing !== undefined) {
    vehicleCountMap.get(route)!.set(vehicleType, existing - 1)
  }
  markerIdInfo.delete(id)
}

export function calculateTotal(dimension: string): number {
  let total = 0
  if (lines.includes(dimension)) {
    for (const vehicleType of vehicleTypes) {
      total += vehicleCountMap.get(dimension)?.get(vehicleType) || 0
    }
    return total
  } else if (vehicleTypes.includes(dimension)) {
    for (const line of lines) {
      total += vehicleCountMap.get(line)?.get(dimension) || 0
    }
    return total
  } else if (dimension === 'all') {
    for (const line of lines) {
      for (const vehicleType of vehicleTypes) {
        total += vehicleCountMap.get(line)?.get(vehicleType) || 0
      }
    }
    return total
  }
  return total
}
