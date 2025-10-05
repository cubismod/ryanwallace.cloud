// API types based on OpenAPI specification
interface VehicleLineTotals {
  RL: number
  GL: number
  BL: number
  OL: number
  SL: number
  CR: number
  total: number
}

interface VehicleCountsByType {
  light_rail: VehicleLineTotals
  heavy_rail: VehicleLineTotals
  regional_rail: VehicleLineTotals
  bus: VehicleLineTotals
}

interface VehiclesCountResponse {
  success: boolean
  counts: VehicleCountsByType
  totals_by_line: VehicleLineTotals
  generated_at: string
}

// Map internal line codes to API line codes
const INTERNAL_TO_API_LINE: Record<string, string> = {
  rl: 'RL',
  gl: 'GL',
  bl: 'BL',
  ol: 'OL',
  sl: 'SL',
  cr: 'CR'
}

// Map API vehicle types to internal vehicle types
const VEHICLE_TYPE_MAPPING: Record<keyof VehicleCountsByType, string> = {
  light_rail: 'light',
  heavy_rail: 'heavy',
  regional_rail: 'regional',
  bus: 'bus'
}

// Exclude Amtrak from table counts since it's not in the API
// API configuration
const vehicles_url: string =
  process.env.VEHICLES_URL || 'https://imt.ryanwallace.cloud'

export const lines: string[] = ['rl', 'gl', 'bl', 'ol', 'sl', 'cr']
export const vehicleTypes: string[] = ['light', 'heavy', 'regional', 'bus']

// Current vehicle counts fetched from API
let currentCounts: VehiclesCountResponse | null = null

// Fetch vehicle counts from API
export async function fetchVehicleCounts(): Promise<void> {
  try {
    const response = await fetch(`${vehicles_url}/vehicles/counts`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: VehiclesCountResponse = await response.json()
    if (data.success) {
      currentCounts = data
    } else {
      console.error('API returned success: false')
    }
  } catch (error) {
    console.error('Failed to fetch vehicle counts:', error)
  }
}

export function calculateTotal(dimension: string): number {
  if (!currentCounts) {
    return 0
  }

  if (dimension === 'all') {
    return currentCounts.totals_by_line.total
  }

  // Check if it's a line
  const apiLine = INTERNAL_TO_API_LINE[dimension]
  if (apiLine) {
    return currentCounts.totals_by_line[
      apiLine as keyof VehicleLineTotals
    ] as number
  }

  // Check if it's a vehicle type
  const apiVehicleType = Object.keys(VEHICLE_TYPE_MAPPING).find(
    (key) =>
      VEHICLE_TYPE_MAPPING[key as keyof VehicleCountsByType] === dimension
  )
  if (apiVehicleType) {
    const vehicleData =
      currentCounts.counts[apiVehicleType as keyof VehicleCountsByType]
    return vehicleData.total
  }

  return 0
}

// Get count for specific line and vehicle type combination
export function getCount(line: string, vehicleType: string): number {
  if (!currentCounts) {
    return 0
  }

  const apiLine = INTERNAL_TO_API_LINE[line]
  const apiVehicleType = Object.keys(VEHICLE_TYPE_MAPPING).find(
    (key) =>
      VEHICLE_TYPE_MAPPING[key as keyof VehicleCountsByType] === vehicleType
  )

  if (apiLine && apiVehicleType) {
    const vehicleData =
      currentCounts.counts[apiVehicleType as keyof VehicleCountsByType]
    return vehicleData[apiLine as keyof VehicleLineTotals] as number
  }

  return 0
}

// Initialize by fetching counts
fetchVehicleCounts()

// Refresh counts every 30 seconds
setInterval(fetchVehicleCounts, 30000)
