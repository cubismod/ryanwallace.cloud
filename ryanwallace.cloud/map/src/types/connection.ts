export type EffectiveConnectionType = 'slow' | '4g' | '5g' | 'unknown'

export type NetworkAPIEffectiveType = '2g' | '3g' | '4g' | 'slow-2g' | 'unknown'

export interface ConnectionInfo {
  effectiveType: EffectiveConnectionType
  downlink: number // Mbps
  rtt: number // Round trip time in ms
  saveData: boolean // User has data saver enabled
  isSlowConnection: boolean
  shouldSkipOverpass: boolean
}

export interface ConnectionThresholds {
  RTT_THRESHOLD: number // ms
  DOWNLINK_THRESHOLD: number // Mbps
  MEASUREMENT_TIMEOUT: number // ms
}

export interface NetworkInformation extends EventTarget {
  readonly effectiveType: NetworkAPIEffectiveType
  readonly downlink: number
  readonly rtt: number
  readonly saveData: boolean
}

export interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
  mozConnection?: NetworkInformation
  webkitConnection?: NetworkInformation
}

export interface ConnectionSpeedMeasurement {
  downloadSpeed: number // Mbps
  latency: number // ms
  isSlowConnection: boolean
}

export interface ConnectionDetectorAPI {
  getInfo: () => ConnectionInfo
  measureSpeed: () => Promise<ConnectionSpeedMeasurement>
  shouldDisable: () => boolean
  setPreference: (enabled: boolean) => void
  getPreference: () => boolean | null
}

export type UserConnectionPreference = boolean | null
