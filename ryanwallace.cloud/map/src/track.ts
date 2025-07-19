import DataTable from 'datatables.net-dt'
import DOMPurify from 'dompurify'

// Type definitions
interface MBTAPrediction {
  id: string
  type: string
  attributes: {
    arrival_time: string | null
    departure_time: string | null
    direction_id: number
    schedule_relationship: string | null
    status: string | null
    stop_sequence: number
    track: string | null
    vehicle_id: string | null
  }
  relationships: {
    route: {
      data: {
        id: string
        type: string
      }
    }
    stop: {
      data: {
        id: string
        type: string
      }
    }
    trip: {
      data: {
        id: string
        type: string
      }
    }
    vehicle: {
      data: {
        id: string
        type: string
      } | null
    }
  }
}
interface MBTAStop {
  id: string
  type: string
  attributes: {
    address: string | null
    at_street: string | null
    description: string | null
    latitude: number
    longitude: number
    location_type: number
    municipality: string | null
    name: string
    on_street: string | null
    platform_code: string | null
    platform_name: string | null
    vehicle_type: number | null
    wheelchair_boarding: number
    zone_id: string | null
  }
}

interface MBTARoute {
  id: string
  type: string
  attributes: {
    color: string
    description: string
    direction_destinations: string[]
    direction_names: string[]
    fare_class: string
    long_name: string
    short_name: string
    sort_order: number
    text_color: string
    type: number
  }
}

interface MBTATrip {
  id: string
  type: string
  attributes: {
    block_id: string | null
    direction_id: number
    headsign: string
    name: string
    service_id: string
    short_name: string | null
    wheelchair_accessible: number
  }
}

interface MBTAResponse {
  data: MBTAPrediction[]
  included: Array<MBTAStop | MBTARoute | MBTATrip>
}

interface MBTASchedule {
  id: string
  type: string
  attributes: {
    arrival_time: string | null
    departure_time: string | null
    direction_id: number
    drop_off_type: number
    pickup_type: number
    stop_headsign: string | null
    stop_sequence: number
    timepoint: boolean
  }
  relationships: {
    route: {
      data: {
        id: string
        type: string
      }
    }
    stop: {
      data: {
        id: string
        type: string
      }
    }
    trip: {
      data: {
        id: string
        type: string
      }
    }
  }
}

interface MBTAScheduleResponse {
  data: MBTASchedule[]
  included: Array<MBTAStop | MBTARoute | MBTATrip>
}

interface TrackPrediction {
  station_id: string
  route_id: string
  trip_id: string
  headsign: string
  direction_id: number
  scheduled_time: string
  track_number: string
  confidence_score: number
  prediction_method: string
  historical_matches: number
  created_at: string
}

interface TrackPredictionResponse {
  success: boolean
  prediction: TrackPrediction
}

interface PredictionRow {
  stop_name: string
  route_name: string
  direction: string
  scheduled_time: Date
  predicted_platform: string
  confidence: number
}

declare global {
  interface Window {
    $: typeof import('jquery')
  }
}

// Constants
const STOP_IDS = [
  'place-NEC-1851',
  'place-rugg',
  'place-bbsta',
  'place-sstat',
  'place-north'
]
const MBTA_API_BASE = process.env.MBTA_API_BASE || 'https://api-v3.mbta.com'
const TRACK_PREDICTION_API =
  process.env.TRACK_PREDICTION_API || 'https://imt.ryanwallace.cloud'

// Stop name mapping
const STOP_NAMES: Record<string, string> = {
  'place-NEC-1851': 'Ruggles',
  'place-rugg': 'Ruggles',
  'place-bbsta': 'Back Bay',
  'place-sstat': 'South Station',
  'place-north': 'North Station'
}

// Direction mapping
const DIRECTION_NAMES: Record<string, string> = {
  '0': 'Outbound',
  '1': 'Inbound'
}

function fullStationName(stopId: string): string {
  if (stopId.includes('BNT')) {
    return 'place-north'
  }
  if (stopId.includes('NEC-2287')) {
    return 'place-sstat'
  }
  if (stopId.includes('NEC-1851')) {
    return 'place-bbsta'
  }
  if (stopId.includes('NEC-2265')) {
    return 'place-rugg'
  }
  if (stopId.includes('NEC-1851')) {
    return 'place-NEC-1851' // Providence
  }
  return stopId
}

function getStopName(stopId: string): string {
  return STOP_NAMES[stopId] || stopId
}

function getDirectionName(directionId: number): string {
  return DIRECTION_NAMES[directionId.toString()] || 'Unknown'
}

function formatConfidence(confidence: number): string {
  if (confidence >= 0.8) {
    return `<span class="confidence-high">${Math.round(confidence * 100)}%</span>`
  } else if (confidence >= 0.5) {
    return `<span class="confidence-medium">${Math.round(confidence * 100)}%</span>`
  } else {
    return `<span class="confidence-low">${Math.round(confidence * 100)}%</span>`
  }
}

function formatPlatform(platform: string): string {
  if (platform && platform !== 'Unknown') {
    return `<span class="platform-prediction">${platform}</span>`
  }
  return 'TBD'
}

function formatRoute(routeId: string): string {
  return `<span class="route-badge">${routeId}</span>`
}

function formatTime(date: Date): string {
  return `<span class="departure-time">${date.toLocaleTimeString()}</span>`
}

async function fetchMBTAPredictions(): Promise<MBTAPrediction[]> {
  const stopIds = STOP_IDS.join(',')
  const url = `${MBTA_API_BASE}/predictions?filter[direction_id]=0&filter[stop]=${stopIds}&include=stop,route,trip&filter[route_type]=2&sort=departure_time`

  return new Promise((resolve, reject) => {
    $.getJSON(url, (data: MBTAResponse) => {
      resolve(data.data)
    }).fail((error: any) => {
      console.error('Error fetching MBTA predictions:', error)
      reject(error)
    })
  })
}

function getLastPredictionTime(predictions: MBTAPrediction[]): Date | null {
  if (predictions.length === 0) return null

  let lastTime: Date | null = null

  for (const prediction of predictions) {
    const departureTime =
      prediction.attributes.departure_time || prediction.attributes.arrival_time
    if (departureTime) {
      const time = new Date(departureTime)
      if (!lastTime || time > lastTime) {
        lastTime = time
      }
    }
  }

  return lastTime
}

async function fetchMBTASchedules(startTime: Date): Promise<MBTASchedule[]> {
  const stopIds = STOP_IDS.join(',')
  const minTime = startTime.toISOString()
  const url = `${MBTA_API_BASE}/schedules?filter[direction_id]=0&filter[stop]=${stopIds}&include=stop,route,trip&filter[route_type]=2&filter[min_time]=${minTime}&sort=departure_time&page[limit]=10&filter[date]=${startTime.toISOString().split('T')[0]}`

  return new Promise((resolve, reject) => {
    $.getJSON(url, (data: MBTAScheduleResponse) => {
      resolve(data.data)
    }).fail((error: any) => {
      console.error('Error fetching MBTA schedules:', error)
      reject(error)
    })
  })
}

async function fetchTrackPrediction(
  station_id: string,
  route_id: string,
  trip_id: string,
  headsign: string,
  direction_id: number,
  scheduled_time: string
): Promise<TrackPredictionResponse> {
  const url = `${TRACK_PREDICTION_API}/predictions?station_id=${station_id}&route_id=${route_id}&trip_id=${trip_id}&headsign=${headsign}&direction_id=${direction_id}&scheduled_time=${scheduled_time}`

  return new Promise((resolve, reject) => {
    $.post(url, (data: TrackPredictionResponse) => {
      resolve(data)
    }).fail((error: any) => {
      console.error('Error fetching track predictions:', error)
      reject(error)
    })
  })
}

function restructureData(
  mbtaPredictions: MBTAPrediction[],
  mbtaSchedules: MBTASchedule[],
  trackPredictions: TrackPrediction[]
): PredictionRow[] {
  const rows: PredictionRow[] = []

  // Create a map of track predictions by stop_id + route_id + direction_id + departure_time
  const trackPredictionMap = new Map<string, TrackPrediction>()
  trackPredictions.forEach((tp) => {
    const key = `${tp.station_id}-${tp.route_id}-${tp.direction_id}-${tp.scheduled_time}`
    trackPredictionMap.set(key, tp)
  })

  // Process MBTA predictions
  for (const prediction of mbtaPredictions) {
    const departureTime =
      prediction.attributes.departure_time || prediction.attributes.arrival_time
    if (!departureTime) continue

    const depDate = new Date(departureTime)
    if (depDate < new Date()) continue

    const stopId = fullStationName(prediction.relationships.stop.data.id)
    const routeId = prediction.relationships.route.data.id
    const directionId = prediction.attributes.direction_id

    // Try to find matching track prediction
    const trackKey = `${stopId}-${routeId}-${directionId}-${departureTime}`
    const trackPrediction = trackPredictionMap.get(trackKey)

    if (trackPrediction?.confidence_score) {
      const row: PredictionRow = {
        stop_name: getStopName(stopId),
        route_name: routeId,
        direction: getDirectionName(directionId),
        scheduled_time: depDate,
        predicted_platform: trackPrediction?.track_number || 'TBD',
        confidence: trackPrediction?.confidence_score || 0
      }

      rows.push(row)
    }
  }

  // Process MBTA schedules
  for (const schedule of mbtaSchedules) {
    const departureTime =
      schedule.attributes.departure_time || schedule.attributes.arrival_time
    if (!departureTime) continue

    const depDate = new Date(departureTime)

    const stopId = fullStationName(schedule.relationships.stop.data.id)
    const routeId = schedule.relationships.route.data.id
    const directionId = schedule.attributes.direction_id

    // Try to find matching track prediction
    const trackKey = `${stopId}-${routeId}-${directionId}-${departureTime}`
    const trackPrediction = trackPredictionMap.get(trackKey)

    if (trackPrediction?.confidence_score) {
      const row: PredictionRow = {
        stop_name: getStopName(stopId),
        route_name: routeId,
        direction: getDirectionName(directionId),
        scheduled_time: depDate,
        predicted_platform: trackPrediction?.track_number || 'TBD',
        confidence: trackPrediction?.confidence_score || 0
      }

      rows.push(row)
    }
  }

  return rows.sort(
    (a, b) => a.scheduled_time.getTime() - b.scheduled_time.getTime()
  )
}

function updateTable(rows: PredictionRow[]): void {
  const tableData = rows.map((row) => [
    `<span class="stop-name">${DOMPurify.sanitize(row.stop_name)}</span>`,
    formatRoute(DOMPurify.sanitize(row.route_name)),
    DOMPurify.sanitize(row.direction),
    formatTime(row.scheduled_time),
    formatPlatform(DOMPurify.sanitize(row.predicted_platform)),
    formatConfidence(row.confidence)
  ])

  new DataTable('#predictions-table', {
    data: tableData,
    columns: [
      { title: 'Stop' },
      { title: 'Route' },
      { title: 'Direction' },
      { title: 'Departure Time', type: 'date' },
      { title: 'Predicted Platform' },
      { title: 'Confidence' }
    ],
    order: [[3, 'asc']], // Sort by departure time
    pageLength: 25,
    searching: false,
    info: true,
    lengthChange: false
  })
}

async function refreshPredictions(): Promise<void> {
  try {
    console.log('Fetching predictions...')
    const mbtaPredictions = await fetchMBTAPredictions()

    // Calculate last prediction time and fetch schedules if needed
    const lastPredictionTime = getLastPredictionTime(mbtaPredictions)
    let mbtaSchedules: MBTASchedule[] = []

    if (lastPredictionTime) {
      console.log('Last prediction time:', lastPredictionTime.toISOString())
      console.log('Fetching schedules after predictions end...')
      mbtaSchedules = await fetchMBTASchedules(lastPredictionTime)
    }

    const trackPredictions: TrackPrediction[] = []

    // Get track predictions for MBTA predictions
    for (const prediction of mbtaPredictions) {
      const trackPrediction = await fetchTrackPrediction(
        prediction.relationships.stop.data.id,
        prediction.relationships.route.data.id,
        prediction.relationships.trip.data.id,
        prediction.relationships.route.data.id,
        prediction.attributes.direction_id,
        prediction.attributes.departure_time ||
          prediction.attributes.arrival_time ||
          new Date().toISOString()
      )
      if (trackPrediction.success) {
        trackPredictions.push(trackPrediction.prediction)
      }
    }

    // Get track predictions for schedules
    for (const schedule of mbtaSchedules) {
      const trackPrediction = await fetchTrackPrediction(
        schedule.relationships.stop.data.id,
        schedule.relationships.route.data.id,
        schedule.relationships.trip.data.id,
        schedule.relationships.route.data.id,
        schedule.attributes.direction_id,
        schedule.attributes.departure_time ||
          schedule.attributes.arrival_time ||
          new Date().toISOString()
      )
      if (trackPrediction.success) {
        trackPredictions.push(trackPrediction.prediction)
      }
    }

    const rows = restructureData(
      mbtaPredictions,
      mbtaSchedules,
      trackPredictions
    )
    updateTable(rows)
    console.log(`Updated table with ${rows.length} predictions and schedules`)
  } catch (error) {
    console.error('Error refreshing predictions:', error)
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  refreshPredictions()
})
