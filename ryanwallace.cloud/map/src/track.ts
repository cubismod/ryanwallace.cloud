import DataTable from 'datatables.net-dt'
import DOMPurify from 'dompurify'
import moment from 'moment-timezone'
import levenshtein from 'string-comparison'

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

interface PredictionRequest {
  station_id: string
  route_id: string
  trip_id: string
  headsign: string
  direction_id: number
  scheduled_time: string
}

interface ChainedPredictionsRequest {
  predictions: PredictionRequest[]
}

interface ChainedPredictionsResponse {
  results: TrackPredictionResponse[]
}

interface PredictionRow {
  station: string
  time: moment.Moment
  destination: string
  track: string
  confidence: number
  realtime: boolean
}

interface PredictionStats {
  generated: number
  notGenerated: number
  total: number
  fetchDuration: number
}

// DataTable instance for progressive updates
let predictionsTable: any | null = null

// jQuery typings removed; using fetch and vanilla APIs.

document
  .getElementById('predictions-container')
  ?.scrollIntoView({ behavior: 'smooth' })

// Constants
const STOP_IDS = ['place-NEC-1851', 'place-bbsta', 'place-sstat', 'place-north']
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
// const DIRECTION_NAMES: Record<string, string> = {
//   '0': 'Outbound',
//   '1': 'Inbound'
// }

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

// function shortLineName(routeId: string): string {
//   if (routeId.includes('CR-')) {
//     return routeId.replace('CR-', '')
//   }
//   return routeId
// }

function getStopName(stopId: string): string {
  return STOP_NAMES[stopId] || stopId
}

// function getDirectionName(directionId: number): string {
//   return DIRECTION_NAMES[directionId.toString()] || 'Unknown'
// }

function formatDestination(headsign: string, routeId: string): string {
  const similarity = levenshtein.levenshtein.similarity(headsign, routeId)
  if (similarity < 0.5) {
    return `<span class="route-badge">${headsign} via ${routeId}</span>`
  }
  return `<span class="route-badge">${headsign}</span>`
}

function formatConfidence(confidence: number): string {
  if (confidence >= 0.6) {
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
  return `${routeId.replace('CR-', '').trim()} Line`
}

function formatTime(date: moment.Moment): string {
  return `<span class="departure-time">${date.format('HH:mm')}</span>`
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

async function fetchMBTASchedules(): Promise<MBTASchedule[]> {
  const stopIds = STOP_IDS.join(',')
  const minTime = moment().tz('America/New_York')
  let timeFilter = ''
  if (minTime.hour() > 2) {
    const maxTime = moment().tz('America/New_York').add(2, 'hour')
    timeFilter = `&filter[min_time]=${minTime.format('HH:mm')}&filter[max_time]=${maxTime.format('HH:mm')}`
  }
  const url = `${MBTA_API_BASE}/schedules?filter[stop]=${stopIds}&include=stop,route,trip&page[limit]=75&filter[route_type]=2&sort=departure_time${timeFilter}`

  return new Promise((resolve, reject) => {
    $.getJSON(url, (data: MBTAScheduleResponse) => {
      resolve(data.data)
    }).fail((error: any) => {
      console.error('Error fetching MBTA schedules:', error)
      reject(error)
    })
  })
}

async function fetchChainedTrackPredictions(
  requests: PredictionRequest[]
): Promise<TrackPredictionResponse[]> {
  const url = `${TRACK_PREDICTION_API}/chained-predictions`
  const requestBody: ChainedPredictionsRequest = { predictions: requests }

  return new Promise((resolve, reject) => {
    $.ajax({
      url: url,
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(requestBody),
      success: (data: ChainedPredictionsResponse) => {
        resolve(data.results)
      },
      error: (error: any) => {
        console.error('Error fetching chained track predictions:', error)
        reject(error)
      }
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

  // Track processed trips to prevent duplicates between predictions and schedules
  const processedTrips = new Set<string>()

  // Process MBTA predictions
  for (const prediction of mbtaPredictions) {
    const departureTime =
      prediction.attributes.departure_time || prediction.attributes.arrival_time
    if (!departureTime) continue

    const depDate = moment(departureTime).tz('America/New_York')
    if (depDate.isBefore(moment().tz('America/New_York'))) continue

    const stopId = fullStationName(prediction.relationships.stop.data.id)
    const routeId = prediction.relationships.route.data.id
    const directionId = prediction.attributes.direction_id
    const tripId = prediction.relationships.trip.data.id

    // skip inbound arrivals for terminal stations
    if (stopId.includes('place-north') && directionId === 0) continue
    if (stopId.includes('place-sstat') && directionId === 0) continue

    // Try to find matching track prediction
    const trackKey = `${stopId}-${routeId}-${directionId}-${departureTime}`
    const trackPrediction = trackPredictionMap.get(trackKey)

    if (trackPrediction?.confidence_score) {
      const tripKey = `${tripId}-${stopId}-${departureTime}`
      processedTrips.add(tripKey)

      const row: PredictionRow = {
        station: getStopName(stopId),
        time: depDate,
        destination: formatDestination(
          trackPrediction.headsign,
          formatRoute(routeId)
        ),
        track: trackPrediction?.track_number || 'TBD',
        confidence: trackPrediction?.confidence_score || 0,
        realtime: true
      }

      rows.push(row)
    }
  }

  // Process MBTA schedules (only if not already processed as predictions)
  for (const schedule of mbtaSchedules) {
    const departureTime =
      schedule.attributes.departure_time || schedule.attributes.arrival_time
    if (!departureTime) continue

    const depDate = moment(departureTime)
    if (depDate.isBefore(moment().tz('America/New_York'))) continue

    const stopId = fullStationName(schedule.relationships.stop.data.id)
    const routeId = schedule.relationships.route.data.id
    const directionId = schedule.attributes.direction_id
    const tripId = schedule.relationships.trip.data.id

    // Skip if this trip was already processed as a prediction
    const tripKey = `${tripId}-${stopId}-${departureTime}`
    if (processedTrips.has(tripKey)) continue

    // Try to find matching track prediction
    const trackKey = `${stopId}-${routeId}-${directionId}-${departureTime}`
    const trackPrediction = trackPredictionMap.get(trackKey)

    if (stopId.includes('place-north') && directionId === 1) continue
    if (stopId.includes('place-sstat') && directionId === 1) continue

    if (trackPrediction?.confidence_score) {
      const row: PredictionRow = {
        station: getStopName(stopId),
        time: depDate,
        destination: formatDestination(
          trackPrediction.headsign,
          formatRoute(routeId)
        ),
        track: trackPrediction?.track_number || 'TBD',
        confidence: trackPrediction?.confidence_score || 0,
        realtime: false
      }

      rows.push(row)
    }
  }

  return rows.sort((a, b) => a.time.diff(b.time))
}

function showLoading(): void {
  const container =
    document.querySelector('#predictions-table_wrapper') ||
    document.querySelector('#predictions-table')?.parentElement
  if (container) {
    const existingLoader = container.querySelector('.loading-overlay')
    if (!existingLoader) {
      const loadingOverlay = document.createElement('div')
      loadingOverlay.className = 'loading-overlay'
      loadingOverlay.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner"></div>
        </div>
      `
      if (container instanceof HTMLElement) {
        container.style.position = 'relative'
      }
      container.appendChild(loadingOverlay)
    }
  }
}

function hideLoading(): void {
  const loadingOverlay = document.querySelector('.loading-overlay')
  if (loadingOverlay) {
    loadingOverlay.remove()
  }
}

function updateTable(rows: PredictionRow[]): void {
  // Hide spinner on first render
  hideLoading()

  const tableData = rows.map((row) => [
    formatTime(row.time),
    formatPlatform(DOMPurify.sanitize(row.track)),
    `<span class="stop-name">${DOMPurify.sanitize(row.station)}</span>`,
    formatConfidence(row.confidence),
    DOMPurify.sanitize(row.destination),
    row.realtime ? 'Yes' : 'No'
  ])

  if (!predictionsTable) {
    predictionsTable = new DataTable('#predictions-table', {
      data: tableData,
      columns: [
        { title: 'Time', type: 'date', width: '5%' },
        { title: 'Track', width: '5%' },
        { title: 'Station', width: '10%' },
        { title: 'Score', width: '5%' },
        { title: 'Destination', width: '10%' },
        { title: 'Live', width: '5%' }
      ],
      order: [[3, 'asc']], // Sort by departure time
      pageLength: 25,
      searching: false,
      autoWidth: true,
      ordering: false,
      info: true,
      lengthChange: false
    })
    return
  }

  if (predictionsTable && typeof predictionsTable.clear === 'function') {
    // Progressive update without reinitializing the table
    predictionsTable.clear()
    if (
      predictionsTable.rows &&
      typeof predictionsTable.rows.add === 'function'
    ) {
      predictionsTable.rows.add(tableData)
    } else if (typeof predictionsTable.rows === 'function') {
      // Some builds expose rows() as a function
      predictionsTable.rows().add(tableData)
    }
    if (typeof predictionsTable.draw === 'function') {
      predictionsTable.draw(false)
    }
  } else {
    // Fallback: reinitialize
    predictionsTable = new DataTable('#predictions-table', {
      data: tableData,
      columns: [
        { title: 'Time', type: 'date', width: '5%' },
        { title: 'Track', width: '5%' },
        { title: 'Station', width: '10%' },
        { title: 'Score', width: '5%' },
        { title: 'Destination', width: '10%' },
        { title: 'Live', width: '5%' }
      ],
      order: [[3, 'asc']],
      pageLength: 25,
      searching: false,
      autoWidth: true,
      ordering: false,
      info: true,
      lengthChange: false
    })
  }
}

function updateStats(stats: PredictionStats): void {
  const generatedElement = document.getElementById('predictions-generated')
  const notGeneratedElement = document.getElementById(
    'predictions-not-generated'
  )
  const totalElement = document.getElementById('predictions-total')
  const durationElement = document.getElementById('fetch-duration')

  // Use shorter text on mobile screens
  const isMobile = window.innerWidth <= 768

  if (generatedElement) {
    generatedElement.textContent = isMobile
      ? `Generated: ${stats.generated}`
      : `Predictions Generated: ${stats.generated}`
  }
  if (notGeneratedElement) {
    notGeneratedElement.textContent = isMobile
      ? `Failed: ${stats.notGenerated}`
      : `No Prediction Found: ${stats.notGenerated}`
  }
  if (totalElement) {
    totalElement.textContent = isMobile
      ? `Total: ${stats.total}`
      : `Total Requests: ${stats.total}`
  }
  if (durationElement) {
    const seconds = (stats.fetchDuration / 1000).toFixed(1)
    durationElement.textContent = isMobile
      ? `${seconds}s`
      : `Fetch Time: ${seconds}s`
  }
}

async function refreshPredictions(): Promise<void> {
  try {
    const startTime = performance.now()
    showLoading()

    const mbtaPredictions = await fetchMBTAPredictions()
    const mbtaSchedules = await fetchMBTASchedules()

    // Prepare batch requests for track predictions
    const predictionRequestsMap = new Map<string, PredictionRequest>()

    // Add requests for MBTA predictions
    for (const prediction of mbtaPredictions) {
      const departureTime =
        prediction.attributes.departure_time ||
        prediction.attributes.arrival_time
      if (!departureTime) continue

      const key = `${prediction.relationships.stop.data.id}-${prediction.relationships.route.data.id}-${prediction.relationships.trip.data.id}-${departureTime}`
      predictionRequestsMap.set(key, {
        station_id: prediction.relationships.stop.data.id,
        route_id: prediction.relationships.route.data.id,
        trip_id: prediction.relationships.trip.data.id,
        headsign: prediction.relationships.route.data.id,
        direction_id: prediction.attributes.direction_id,
        scheduled_time: departureTime
      })
    }

    // Add requests for schedules (only if not already present)
    for (const schedule of mbtaSchedules) {
      const departureTime =
        schedule.attributes.departure_time || schedule.attributes.arrival_time
      if (!departureTime) continue

      const key = `${schedule.relationships.stop.data.id}-${schedule.relationships.route.data.id}-${schedule.relationships.trip.data.id}-${departureTime}`
      if (!predictionRequestsMap.has(key)) {
        predictionRequestsMap.set(key, {
          station_id: schedule.relationships.stop.data.id,
          route_id: schedule.relationships.route.data.id,
          trip_id: schedule.relationships.trip.data.id,
          headsign: schedule.relationships.route.data.id,
          direction_id: schedule.attributes.direction_id,
          scheduled_time: departureTime
        })
      }
    }

    const predictionRequests = Array.from(predictionRequestsMap.values())

    // Progressive loading: split into batches and fetch with limited concurrency
    const BATCH_SIZE = 10
    const CONCURRENCY = 3
    const batches: PredictionRequest[][] = []
    for (let i = 0; i < predictionRequests.length; i += BATCH_SIZE) {
      batches.push(predictionRequests.slice(i, i + BATCH_SIZE))
    }

    // Show totals immediately
    updateStats({
      generated: 0,
      notGenerated: predictionRequests.length,
      total: predictionRequests.length,
      fetchDuration: 0
    })

    if (predictionRequests.length === 0) {
      updateTable([])
      return
    }

    const collectedPredictions: TrackPrediction[] = []

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const wave = batches.slice(i, i + CONCURRENCY)
      const waveResults = await Promise.all(
        wave.map((b) =>
          fetchChainedTrackPredictions(b).catch(
            () => [] as TrackPredictionResponse[]
          )
        )
      )

      // Append successes from this wave
      for (const res of waveResults) {
        for (const item of res) {
          if (item.success) collectedPredictions.push(item.prediction)
        }
      }

      // Recompute and update table + stats with what we have so far
      const rows = restructureData(
        mbtaPredictions,
        mbtaSchedules,
        collectedPredictions
      )
      updateTable(rows)
      updateStats({
        generated: rows.length,
        notGenerated: predictionRequests.length - rows.length,
        total: predictionRequests.length,
        fetchDuration: performance.now() - startTime
      })
    }
  } catch (error) {
    hideLoading()
    console.error('Error refreshing predictions:', error)
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  refreshPredictions()
})
