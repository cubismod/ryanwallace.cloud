import {
  ConnectionInfo,
  ConnectionThresholds,
  NetworkInformation,
  NavigatorWithConnection,
  ConnectionSpeedMeasurement,
  EffectiveConnectionType,
  NetworkAPIEffectiveType,
  UserConnectionPreference,
  ConnectionDetectorAPI
} from './types/connection'
import { ConnectionError, logError } from './types/errors'

// Modern connection thresholds
const SLOW_CONNECTION_THRESHOLDS: ConnectionThresholds = {
  RTT_THRESHOLD: 800, // ms - higher latency indicates congested or distant connection
  DOWNLINK_THRESHOLD: 2.0, // Mbps - minimum for comfortable background data loading
  MEASUREMENT_TIMEOUT: 3000 // ms - shorter timeout for faster detection
}

export function getConnectionInfo(): ConnectionInfo {
  const nav: NavigatorWithConnection = navigator as NavigatorWithConnection
  const connection: NetworkInformation | undefined =
    nav.connection || nav.mozConnection || nav.webkitConnection

  if (connection) {
    // Use Network Information API if available
    const apiEffectiveType: NetworkAPIEffectiveType =
      connection.effectiveType || 'unknown'
    const downlink: number = connection.downlink || 0
    const rtt: number = connection.rtt || 0
    const saveData: boolean = connection.saveData || false

    // Map legacy API values to modern classifications
    let effectiveType: EffectiveConnectionType
    if (
      apiEffectiveType === 'slow-2g' ||
      apiEffectiveType === '2g' ||
      apiEffectiveType === '3g'
    ) {
      effectiveType = 'slow'
    } else if (apiEffectiveType === '4g') {
      // Distinguish between regular 4G and fast 4G/5G based on speeds
      effectiveType = downlink > 20 ? '5g' : '4g'
    } else {
      effectiveType = 'unknown'
    }

    const isSlowConnection: boolean =
      effectiveType === 'slow' ||
      downlink < SLOW_CONNECTION_THRESHOLDS.DOWNLINK_THRESHOLD ||
      rtt > SLOW_CONNECTION_THRESHOLDS.RTT_THRESHOLD ||
      saveData

    return {
      effectiveType,
      downlink,
      rtt,
      saveData,
      isSlowConnection,
      shouldSkipOverpass: true // for the time being we're disabling this
    }
  }

  // Fallback: estimate based on user agent and performance
  return estimateConnectionSpeed()
}

function estimateConnectionSpeed(): ConnectionInfo {
  const userAgent: string = navigator.userAgent.toLowerCase()

  // Check for potential connection quality indicators
  const isMobile: boolean = /mobile|android|iphone|ipad|blackberry/.test(
    userAgent
  )
  const isOffline: boolean = 'onLine' in navigator && !navigator.onLine

  // Check for device/browser hints about reduced functionality
  const hasReducedMotion: boolean =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const hasReducedData: boolean =
    window.matchMedia?.('(prefers-reduced-data: reduce)').matches ?? false

  // Conservative approach for older or resource-constrained devices
  const estimatedSlow: boolean =
    isOffline ||
    hasReducedData ||
    (isMobile && (hasReducedMotion || userAgent.includes('lite')))

  const effectiveType: EffectiveConnectionType = estimatedSlow ? 'slow' : '4g'
  const downlink: number = estimatedSlow ? 1.5 : 8.0
  const rtt: number = estimatedSlow ? 600 : 200
  const saveData: boolean = hasReducedData || isOffline

  return {
    effectiveType,
    downlink,
    rtt,
    saveData,
    isSlowConnection: estimatedSlow,
    shouldSkipOverpass: estimatedSlow
  }
}

// Performance-based connection speed test
export async function measureConnectionSpeed(): Promise<ConnectionSpeedMeasurement> {
  try {
    // Use a small image from the same domain to test speed
    const testUrl: string = '/map/images/icons/bus-yellow.svg?' + Date.now()
    const startTime: number = performance.now()

    const response: Response = await fetch(testUrl, {
      cache: 'no-cache',
      signal: AbortSignal.timeout(
        SLOW_CONNECTION_THRESHOLDS.MEASUREMENT_TIMEOUT
      )
    })

    const endTime: number = performance.now()
    const latency: number = endTime - startTime

    if (!response.ok) {
      throw new ConnectionError(
        'Network test failed',
        'speed_measurement',
        `HTTP_${response.status}`
      )
    }

    const blob: Blob = await response.blob()
    const sizeInBytes: number = blob.size
    const sizeInMegabits: number = (sizeInBytes * 8) / (1024 * 1024)
    const timeInSeconds: number = latency / 1000
    const downloadSpeed: number = sizeInMegabits / timeInSeconds

    const isSlowConnection: boolean =
      downloadSpeed < SLOW_CONNECTION_THRESHOLDS.DOWNLINK_THRESHOLD ||
      latency > SLOW_CONNECTION_THRESHOLDS.RTT_THRESHOLD

    return {
      downloadSpeed,
      latency,
      isSlowConnection
    }
  } catch (error) {
    logError(error, 'measureConnectionSpeed')
    // Conservative fallback
    return {
      downloadSpeed: 1.0,
      latency: 1000,
      isSlowConnection: true
    }
  }
}

// Check user preferences and environment variables
export function shouldDisableOverpass(): boolean {
  // Check environment variable first
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.DISABLE_OVERPASS === 'true') {
      console.log('Overpass disabled via environment variable')
      return true
    }
  }

  // Check localStorage for user preference
  try {
    const userPreference: string | null = localStorage.getItem(
      'mbta-disable-overpass'
    )
    if (userPreference === 'true') {
      console.log('Overpass disabled by user preference')
      return true
    }
    if (userPreference === 'false') {
      console.log(
        'Overpass enabled by user preference (overriding connection detection)'
      )
      return false
    }
  } catch (error) {
    logError(error, 'shouldDisableOverpass:localStorage')
  }

  // Check connection quality
  const connectionInfo: ConnectionInfo = getConnectionInfo()
  if (connectionInfo.shouldSkipOverpass) {
    console.log(`Overpass disabled due to connection quality:`, {
      effectiveType: connectionInfo.effectiveType,
      downlink: connectionInfo.downlink,
      rtt: connectionInfo.rtt,
      saveData: connectionInfo.saveData
    })
    return true
  }

  return false
}

// User preference management
export function setOverpassPreference(enabled: boolean): void {
  try {
    localStorage.setItem('mbta-disable-overpass', (!enabled).toString())
    console.log(
      `Overpass ${enabled ? 'enabled' : 'disabled'} by user preference`
    )
  } catch (error) {
    logError(error, 'setOverpassPreference')
  }
}

export function getOverpassPreference(): UserConnectionPreference {
  try {
    const preference: string | null = localStorage.getItem(
      'mbta-disable-overpass'
    )
    if (preference === 'true') return false // disabled
    if (preference === 'false') return true // enabled
    return null // no preference set
  } catch (error) {
    logError(error, 'getOverpassPreference')
    return null
  }
}

// Add to global window for debugging
if (typeof window !== 'undefined') {
  const connectionDetectorAPI: ConnectionDetectorAPI = {
    getInfo: getConnectionInfo,
    measureSpeed: measureConnectionSpeed,
    shouldDisable: shouldDisableOverpass,
    setPreference: setOverpassPreference,
    getPreference: getOverpassPreference
  }
  ;(window as any).connectionDetector = connectionDetectorAPI
}
