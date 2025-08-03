export interface ConnectionInfo {
  effectiveType: 'slow' | '4g' | '5g' | 'unknown'
  downlink: number // Mbps
  rtt: number // Round trip time in ms
  saveData: boolean // User has data saver enabled
  isSlowConnection: boolean
  shouldSkipOverpass: boolean
}

// Modern connection thresholds
const SLOW_CONNECTION_THRESHOLDS = {
  RTT_THRESHOLD: 800, // ms - higher latency indicates congested or distant connection
  DOWNLINK_THRESHOLD: 2.0, // Mbps - minimum for comfortable background data loading
  MEASUREMENT_TIMEOUT: 3000 // ms - shorter timeout for faster detection
}

// Network Information API (experimental, available in some browsers)
interface NetworkInformation extends EventTarget {
  readonly effectiveType: '2g' | '3g' | '4g' | 'slow-2g'
  readonly downlink: number
  readonly rtt: number
  readonly saveData: boolean
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
  mozConnection?: NetworkInformation
  webkitConnection?: NetworkInformation
}

export function getConnectionInfo(): ConnectionInfo {
  const nav = navigator as NavigatorWithConnection
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection

  if (connection) {
    // Use Network Information API if available
    const apiEffectiveType = connection.effectiveType || 'unknown'
    const downlink = connection.downlink || 0
    const rtt = connection.rtt || 0
    const saveData = connection.saveData || false

    // Map legacy API values to modern classifications
    let effectiveType: 'slow' | '4g' | '5g' | 'unknown'
    if (
      apiEffectiveType === 'slow-2g' ||
      apiEffectiveType === '2g' ||
      apiEffectiveType === '3g'
    ) {
      effectiveType = 'slow'
    } else if (apiEffectiveType === '4g') {
      // Distinguish between regular 4G and fast 4G/5G based on speeds
      effectiveType = downlink > 10 ? '5g' : '4g'
    } else {
      effectiveType = 'unknown'
    }

    const isSlowConnection =
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
      shouldSkipOverpass: isSlowConnection
    }
  }

  // Fallback: estimate based on user agent and performance
  return estimateConnectionSpeed()
}

function estimateConnectionSpeed(): ConnectionInfo {
  const userAgent = navigator.userAgent.toLowerCase()

  // Check for potential connection quality indicators
  const isMobile = /mobile|android|iphone|ipad|blackberry/.test(userAgent)
  const isOffline = 'onLine' in navigator && !navigator.onLine

  // Check for device/browser hints about reduced functionality
  const hasReducedMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)'
  ).matches
  const hasReducedData = window.matchMedia?.(
    '(prefers-reduced-data: reduce)'
  ).matches

  // Conservative approach for older or resource-constrained devices
  const estimatedSlow =
    isOffline ||
    hasReducedData ||
    (isMobile && (hasReducedMotion || userAgent.includes('lite')))

  return {
    effectiveType: estimatedSlow ? 'slow' : '4g',
    downlink: estimatedSlow ? 1.5 : 8.0,
    rtt: estimatedSlow ? 600 : 200,
    saveData: hasReducedData || isOffline,
    isSlowConnection: estimatedSlow,
    shouldSkipOverpass: estimatedSlow
  }
}

// Performance-based connection speed test
export async function measureConnectionSpeed(): Promise<{
  downloadSpeed: number // Mbps
  latency: number // ms
  isSlowConnection: boolean
}> {
  try {
    // Use a small image from the same domain to test speed
    const testUrl = '/map/images/icons/bus-yellow.svg?' + Date.now()
    const startTime = performance.now()

    const response = await fetch(testUrl, {
      cache: 'no-cache',
      signal: AbortSignal.timeout(
        SLOW_CONNECTION_THRESHOLDS.MEASUREMENT_TIMEOUT
      )
    })

    const endTime = performance.now()
    const latency = endTime - startTime

    if (!response.ok) {
      throw new Error('Network test failed')
    }

    const blob = await response.blob()
    const sizeInBytes = blob.size
    const sizeInMegabits = (sizeInBytes * 8) / (1024 * 1024)
    const timeInSeconds = latency / 1000
    const downloadSpeed = sizeInMegabits / timeInSeconds

    const isSlowConnection =
      downloadSpeed < SLOW_CONNECTION_THRESHOLDS.DOWNLINK_THRESHOLD ||
      latency > SLOW_CONNECTION_THRESHOLDS.RTT_THRESHOLD

    return {
      downloadSpeed,
      latency,
      isSlowConnection
    }
  } catch (error) {
    console.warn('Connection speed measurement failed:', error)
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
    const userPreference = localStorage.getItem('mbta-disable-overpass')
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
    // localStorage might not be available
  }

  // Check connection quality
  const connectionInfo = getConnectionInfo()
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
    console.warn('Failed to save Overpass preference:', error)
  }
}

export function getOverpassPreference(): boolean | null {
  try {
    const preference = localStorage.getItem('mbta-disable-overpass')
    if (preference === 'true') return false // disabled
    if (preference === 'false') return true // enabled
    return null // no preference set
  } catch (error) {
    return null
  }
}

// Add to global window for debugging
if (typeof window !== 'undefined') {
  ;(window as any).connectionDetector = {
    getInfo: getConnectionInfo,
    measureSpeed: measureConnectionSpeed,
    shouldDisable: shouldDisableOverpass,
    setPreference: setOverpassPreference,
    getPreference: getOverpassPreference
  }
}
