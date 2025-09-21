// Defer DataTables to reduce initial chunk size on /map/track
import DOMPurify from 'dompurify'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'
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
  time: Date
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
let DataTableCtor: any | null = null
let tableInitPromise: Promise<void> | null = null

// Filter state
let showBackBay = false

// jQuery typings removed; using fetch and vanilla APIs.

// Initialize filter checkbox event listener
function initializeFilters(): void {
  const backBayCheckbox = document.getElementById(
    'show-back-bay'
  ) as HTMLInputElement
  if (backBayCheckbox) {
    backBayCheckbox.checked = showBackBay
    backBayCheckbox.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement
      showBackBay = target.checked
      // Refresh predictions with new filter
      refreshPredictions()
    })
  }
}

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

// function shortLineName(routeId: string): string {
//   if (routeId.includes('CR-')) {
//     return routeId.replace('CR-', '')
//   }
//   return routeId
// }

function getStopName(stopId: string): string {
  return STOP_NAMES[stopId] || stopId
}

// Check if headsign indicates train is arriving at (rather than departing from) the station
function isArrivingAtStation(headsign: string, stationName: string): boolean {
  if (!headsign || !stationName) return false

  // Normalize both strings for comparison
  const normalizedHeadsign = headsign.toLowerCase().trim()
  const normalizedStation = stationName.toLowerCase().trim()

  // Handle common station name variations
  const stationVariations = [
    normalizedStation,
    normalizedStation + ' station',
    normalizedStation.replace(' station', ''),
    normalizedStation.replace(' bay', ''), // "Back Bay" -> "Back"
    normalizedStation.replace('south ', ''), // "South Station" -> "Station"
    normalizedStation.replace('north ', '') // "North Station" -> "Station"
  ]

  // Check if headsign contains any variation of the station name
  // Examples: "South Station via Fairmont Line", "North Station", "Back Bay Station", "Boston South"
  return stationVariations.some(
    (variation) =>
      variation.length > 2 && normalizedHeadsign.includes(variation)
  )
}

// Format functions for table display
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
  return `${Math.round(confidence * 100)}%`
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

function formatTime(date: Date): string {
  const tz = 'America/New_York'
  return `<span class="departure-time">${formatInTimeZone(date, tz, 'h:mm a')}</span>`
}

// Render small colored circles indicating transfers for key stations
function transferDotsHTML(stationName: string): string {
  const transfers: Record<string, string[]> = {
    'South Station': ['red', 'silver'],
    'Back Bay': ['orange'],
    'North Station': ['orange', 'green']
  }
  const colors = transfers[stationName]
  if (!colors || colors.length === 0) return ''
  const dots = colors
    .map((c) => `<span class="transfer-dot dot-${c}"></span>`)
    .join('')
  return `<span class="transfer-dots" aria-label="Transfers">${dots}</span>`
}

async function fetchDateTrackPredictions(
  targetDate: string
): Promise<TrackPrediction[]> {
  const url = `${TRACK_PREDICTION_API}/predictions/date`
  const requestBody = { target_date: targetDate }

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data || !Array.isArray(data.departures)) return []
    // Map to TrackPrediction array (each departure contains a 'prediction' object)
    const preds: TrackPrediction[] = data.departures
      .map((d: any) => d && d.prediction)
      .filter(Boolean)
    return preds
  } catch (e) {
    console.error('Error fetching track predictions by date:', e)
    throw e
  }
}

function restructureData(
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
  for (const prediction of trackPredictions) {
    const depDate = new Date(prediction.scheduled_time)
    if (depDate.getTime() < Date.now()) continue

    const stopId = prediction.station_id
    const routeId = prediction.route_id

    // Skip predictions where headsign indicates train is arriving at this station
    const stationName = getStopName(stopId)

    if (prediction.confidence_score >= 0.25) {
      // Skip if headsign indicates train is arriving at this station (not departing)
      if (isArrivingAtStation(prediction.headsign, stationName)) continue
      const row: PredictionRow = {
        station: getStopName(stopId),
        time: depDate,
        destination: formatDestination(
          prediction.headsign,
          formatRoute(routeId)
        ),
        track: prediction?.track_number || 'TBD',
        confidence: prediction?.confidence_score || 0,
        realtime: true
      }

      rows.push(row)
    }
  }
  return rows.sort((a, b) => a.time.getTime() - b.time.getTime())
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

function filterRows(rows: PredictionRow[]): PredictionRow[] {
  return rows.filter((row) => {
    // Filter out Back Bay unless specifically enabled
    if (row.station === 'Back Bay' && !showBackBay) {
      return false
    }
    return true
  })
}

async function updateTable(rows: PredictionRow[]): Promise<void> {
  // Hide spinner on first render
  hideLoading()

  // Reuse existing instance if present (avoid any reinit)
  if (!predictionsTable && typeof window !== 'undefined') {
    const existing = (window as any).__predictionsTable
    if (existing) predictionsTable = existing
  }

  const filteredRows = filterRows(rows)
  const tableData = filteredRows.map((row) => [
    formatTime(row.time),
    formatPlatform(DOMPurify.sanitize(row.track)),
    formatConfidence(row.confidence),
    DOMPurify.sanitize(row.destination),
    DOMPurify.sanitize(
      `<span class="stop-name">${row.station}</span>${transferDotsHTML(
        row.station
      )}`
    )
  ])

  if (!predictionsTable) {
    // If another call is already initializing, wait for it
    if (tableInitPromise) {
      await tableInitPromise
    } else {
      tableInitPromise = (async () => {
        // Reuse any existing instance stored on window
        if (
          typeof window !== 'undefined' &&
          (window as any).__predictionsTable
        ) {
          predictionsTable = (window as any).__predictionsTable
          return
        }
        if (!DataTableCtor) {
          const mod = await import('datatables.net')
          DataTableCtor = (mod as any).default || (mod as any)
        }
        if (!predictionsTable) {
          predictionsTable = new DataTableCtor('#predictions-table', {
            data: tableData,
            columns: [
              { title: 'Time', type: 'date', width: '15%' },
              { title: 'Track', width: '10%' },
              { title: 'Score', width: '10%' },
              { title: 'Destination', width: '35%' },
              { title: 'Station', width: '30%' }
            ],
            order: [[0, 'asc']],
            pageLength: 25,
            searching: false,
            autoWidth: true,
            ordering: false,
            info: true,
            lengthChange: false
          })
          if (typeof window !== 'undefined') {
            ;(window as any).__predictionsTable = predictionsTable
          }
        }
      })()
      try {
        await tableInitPromise
      } finally {
        tableInitPromise = null
      }
    }
  }

  // Progressive update without reinitializing the table
  // Try clear via top-level or rows() API depending on build
  if (typeof predictionsTable.clear === 'function') {
    predictionsTable.clear()
  } else if (
    predictionsTable.rows &&
    typeof predictionsTable.rows.clear === 'function'
  ) {
    predictionsTable.rows.clear()
  } else if (typeof predictionsTable.rows === 'function') {
    const api = predictionsTable.rows()
    if (api && typeof api.clear === 'function') api.clear()
  }

  // Add new data via rows API variants
  if (
    predictionsTable.rows &&
    typeof predictionsTable.rows.add === 'function'
  ) {
    predictionsTable.rows.add(tableData)
  } else if (typeof predictionsTable.rows === 'function') {
    predictionsTable.rows().add(tableData)
  }

  if (typeof predictionsTable.draw === 'function') {
    predictionsTable.draw(false)
  } else if (typeof predictionsTable.rows === 'function') {
    const api = predictionsTable.rows()
    if (api && typeof api.draw === 'function') api.draw(false)
  }
}

async function refreshPredictions(): Promise<void> {
  // Initialize filters on first run
  if (
    document.getElementById('show-back-bay') &&
    !document.getElementById('show-back-bay')?.hasAttribute('data-initialized')
  ) {
    initializeFilters()
    document
      .getElementById('show-back-bay')
      ?.setAttribute('data-initialized', 'true')
  }
  const tz = 'America/New_York'
  const targetDate = formatInTimeZone(
    toZonedTime(new Date(), tz),
    tz,
    'yyyy-MM-dd'
  )

  let collectedPredictions: TrackPrediction[] = []
  try {
    collectedPredictions = await fetchDateTrackPredictions(targetDate)
  } catch (e) {
    // If the date endpoint fails, fall back to empty predictions
    collectedPredictions = []
  }

  try {
    const rows = restructureData(collectedPredictions)
    updateTable(rows)
  } catch (error) {
    hideLoading()
    console.error('Error refreshing predictions:', error)
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  refreshPredictions()
})
