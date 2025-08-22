export interface VehicleFeature {
  id?: string | number
  geometry: {
    type: 'Point' | 'LineString'
    coordinates: number[]
  }
  properties: {
    'marker-symbol'?: string
    'marker-color'?: string
    'marker-size'?: string
    route?: string
    status?: string
    stop?: string
    update_time?: string
    speed?: number
    approximate_speed?: boolean
    occupancy_status?: string
    carriages?: string[]
    stop_eta?: string
    'stop-coordinates'?: number[]
    name?: string
    headsign?: string
    platform_prediction?: string
    direction?: number
  }
}

export interface AlertEntity {
  attributes: {
    header: string
    severity: string
    updated_at?: string
    created_at: string
    active_period: Array<{
      end?: string
    }>
    informed_entity: Array<{
      route: string
    }>
  }
}

export interface AlertData {
  data: AlertEntity[]
}

export interface RouteMapping {
  svg: string
  alt: string
}

// jQuery typings removed; project uses fetch() now.
