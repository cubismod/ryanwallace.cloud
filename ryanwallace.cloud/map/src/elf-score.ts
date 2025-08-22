import { VehicleFeature } from './types'
import distance from '@turf/distance'
import { point } from '@turf/helpers'

export interface ElfScore {
  score: number
  level: 'Low' | 'Medium' | 'High' | 'Legendary' | 'Trans Pride'
  sparkle: '✨' | '🌟' | '⭐' | '🏳️‍🌈' | '🏳️‍⚧️' | '💖' | '🎉'
  reasoning: string
}

const elfScoreCache = new Map<string | number, ElfScore>()

// Clear cache periodically to allow for time-based score changes
let lastCacheClear = Date.now()
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

export function calculateElfScore(vehicle: VehicleFeature): ElfScore {
  const vehicleId =
    vehicle.id ||
    `${vehicle.geometry.coordinates[0]}-${vehicle.geometry.coordinates[1]}-${vehicle.properties.route || 'unknown'}`

  const now = Date.now()
  if (now - lastCacheClear > CACHE_DURATION) {
    elfScoreCache.clear()
    lastCacheClear = now
  }

  if (elfScoreCache.has(vehicleId)) {
    return elfScoreCache.get(vehicleId)!
  }

  // Calculate new score
  const currentTime = new Date()
  const hour = currentTime.getHours()
  const dayOfWeek = currentTime.getDay() // 0 = Sunday, 6 = Saturday
  const route = vehicle.properties.route || ''

  let score = 0

  // Time of day multiplier (peak queer hours: 6PM-2AM) - more balanced
  let timeMultiplier = 0.7
  if (hour >= 18 || hour <= 2) {
    timeMultiplier = 1.4 // Peak elf hours
  } else if (hour >= 15 && hour < 18) {
    timeMultiplier = 1.2 // Pre-game hours
  } else if (hour >= 3 && hour < 6) {
    timeMultiplier = 1.3 // Late night adventures
  } else if (hour >= 10 && hour < 15) {
    timeMultiplier = 0.9 // Brunch vibes
  }

  // Day of week bonus - reduced impact
  let dayBonus = 0.8
  if (dayOfWeek === 5 || dayOfWeek === 6) {
    // Friday or Saturday
    dayBonus = 1.3
  } else if (dayOfWeek === 0 || dayOfWeek === 4) {
    // Sunday or Thursday
    dayBonus = 1.1
  }

  // Route-specific elf affinity - buffed for elf stronghold routes
  let routeMultiplier = 0.8
  const routeLower = route.toLowerCase()

  if (routeLower.includes('green')) {
    routeMultiplier = 1.4 // Artsy neighborhoods, Jamaica Plain, Somerville connection
  } else if (routeLower.includes('red')) {
    routeMultiplier = 1.35 // Harvard/Porter (Cambridge), Davis (Somerville) - elf central
  } else if (routeLower.includes('orange')) {
    routeMultiplier = 1.25 // Forest Hills to Oak Grove, passes through diverse elf communities
  } else if (routeLower.includes('blue')) {
    routeMultiplier = 1.15 // Airport = travel adventures, East Boston vibes
  } else if (routeLower.includes('silver')) {
    routeMultiplier = 1.0 // South End proximity
  } else if (routeLower.includes('cr') || routeLower.includes('commuter')) {
    routeMultiplier = 0.9 // Suburban elves commuting to the city
  }

  // Occupancy bonus (more crowded = more potential elves) - reduced impact
  let occupancyBonus = 0.9
  const occupancy = vehicle.properties.occupancy_status
  if (occupancy === 'CRUSHED_STANDING_ROOM_ONLY' || occupancy === 'FULL') {
    occupancyBonus = 1.2
  } else if (occupancy === 'STANDING_ROOM_ONLY') {
    occupancyBonus = 1.1
  } else if (occupancy === 'FEW_SEATS_AVAILABLE') {
    occupancyBonus = 1.0
  }

  // Trans Pride bonus - special dates and times (reduced impact)
  let transPrideBonus = 1
  const month = currentTime.getMonth() + 1 // 1-12
  const dayOfMonth = currentTime.getDate()

  // Trans Visibility Day (March 31) and Transgender Day of Remembrance (November 20)
  if (
    (month === 3 && dayOfMonth === 31) ||
    (month === 11 && dayOfMonth === 20)
  ) {
    transPrideBonus = 1.8
  }
  // Pride Month (June) - extra trans joy all month
  else if (month === 6) {
    transPrideBonus = 1.4
  }
  // Trans pride colors in route numbers - if route contains 5, 19, 91 (trans pride flag colors)
  else if (route.match(/\b(5|19|91)\b/)) {
    transPrideBonus = 1.2
  }

  // Distance bonus/penalty - elves are concentrated in multiple hubs across New England
  let distanceMultiplier = 0.4
  const vehicleLat = vehicle.geometry.coordinates[1]
  const vehicleLng = vehicle.geometry.coordinates[0]

  // Major elf hubs in New England with their coordinates and influence radius
  const elfHubs = [
    { name: 'Boston', lat: 42.3601, lng: -71.0589, radius: 15, strength: 1.14 },
    {
      name: 'Somerville',
      lat: 42.3876,
      lng: -71.0995,
      radius: 5,
      strength: 1.3
    }, // LEGENDARY elf density
    {
      name: 'Cambridge',
      lat: 42.3736,
      lng: -71.1097,
      radius: 8,
      strength: 1.15
    }, // Harvard/MIT + high elf concentration
    {
      name: 'Jamaica Plain',
      lat: 42.3098,
      lng: -71.1198,
      radius: 7,
      strength: 1.14
    }, // Always has elves
    {
      name: 'South Station',
      lat: 42.3519,
      lng: -71.0552,
      radius: 4,
      strength: 1.1
    }, // Major transit hub - elves transferring everywhere
    {
      name: 'North Station',
      lat: 42.3657,
      lng: -71.0611,
      radius: 4,
      strength: 1.05
    }, // Commuter rail and Orange/Green line hub
    {
      name: 'Back Bay Station',
      lat: 42.3477,
      lng: -71.0755,
      radius: 3,
      strength: 1.0
    }, // Orange line and commuter rail intersection
    {
      name: 'Porter Square',
      lat: 42.3884,
      lng: -71.1193,
      radius: 3,
      strength: 1.15
    }, // Red line meets commuter rail - peak elf energy
    {
      name: 'Davis Square',
      lat: 42.3967,
      lng: -71.1224,
      radius: 4,
      strength: 1.2
    }, // Red line in heart of Somerville elf territory
    {
      name: 'Forest Hills',
      lat: 42.3006,
      lng: -71.1138,
      radius: 3,
      strength: 1.1
    }, // Orange line terminal with bus connections
    {
      name: 'Alewife',
      lat: 42.3956,
      lng: -71.1416,
      radius: 3,
      strength: 0.9
    }, // Red line northern terminus
    {
      name: 'Braintree',
      lat: 42.2078,
      lng: -71.0011,
      radius: 3,
      strength: 0.8
    }, // Red line southern terminus
    {
      name: 'Oak Grove',
      lat: 42.4369,
      lng: -71.0714,
      radius: 3,
      strength: 0.9
    }, // Orange line northern terminus
    {
      name: 'Providence',
      lat: 41.824,
      lng: -71.4128,
      radius: 10,
      strength: 1.05
    },
    {
      name: 'Worcester',
      lat: 42.2626,
      lng: -71.8023,
      radius: 15,
      strength: 0.987
    },
    { name: 'Salem', lat: 42.5195, lng: -70.8967, radius: 6, strength: 0.85 }, // You ever see an elf on a witch's broom?
    {
      name: 'Northampton',
      lat: 42.3251,
      lng: -72.6412,
      radius: 8,
      strength: 1.0
    },
    { name: 'Lowell', lat: 42.6334, lng: -71.3162, radius: 7, strength: 0.75 },
    {
      name: "Dani's Queer Bar",
      lat: 42.34856413442277,
      lng: -71.08430581021743,
      radius: 1,
      strangth: 1.96
    }
  ]

  // Calculate distance to nearest elf hub using Turf.js
  const vehiclePoint = point([vehicleLng, vehicleLat])

  for (const hub of elfHubs) {
    const hubPoint = point([hub.lng, hub.lat])
    const distanceToHub = distance(vehiclePoint, hubPoint, { units: 'miles' })

    // Calculate hub effect: full strength at center, decreasing with distance
    let hubEffect = 0.4 // Base minimum
    if (distanceToHub <= hub.radius) {
      // Within radius: linear decrease from full strength to base
      const proximityRatio = 1 - distanceToHub / hub.radius
      hubEffect = 0.4 + (hub.strength || 1 - 0.4) * proximityRatio
    }

    // Use the strongest hub effect (closest/best hub)
    if (hubEffect > distanceMultiplier) {
      distanceMultiplier = hubEffect
    }
  }

  // Magical randomness factor (because elves are unpredictable and gender is a construct)
  const magicFactor = 0.8 + Math.random() * 0.4 // Between 0.8 and 1.2

  // Base score calculation - higher base for legendary elf areas
  const baseScore = 30 + Math.random() * 35 // 30-65 base points
  score =
    baseScore *
    timeMultiplier *
    dayBonus *
    routeMultiplier *
    occupancyBonus *
    transPrideBonus *
    distanceMultiplier *
    magicFactor

  // Special weekend late night bonus (reduced)
  if ((dayOfWeek === 5 || dayOfWeek === 6) && (hour >= 22 || hour <= 3)) {
    score *= 1.2 // PEAK ELF ENERGY (reduced from 1.4)
  }

  // Clamp score to reasonable range
  score = Math.max(0, Math.min(100, score))

  // Generate reasoning for the elf score
  const reasoning = generateElfReasoning(vehicle, {
    timeMultiplier,
    dayBonus,
    routeMultiplier,
    occupancyBonus,
    transPrideBonus,
    distanceMultiplier,
    hour,
    dayOfWeek,
    distanceFromNearestHub: Math.min(
      ...elfHubs.map((hub) => {
        const hubPoint = point([hub.lng, hub.lat])
        return distance(vehiclePoint, hubPoint, { units: 'miles' })
      })
    )
  })

  // Determine level and sparkle with trans pride consideration
  let level: ElfScore['level']
  let sparkle: ElfScore['sparkle']

  // Special trans pride level for max trans joy days
  if (transPrideBonus >= 3.0 && score >= 80) {
    level = 'Trans Pride'
    sparkle = '🏳️‍⚧️'
  } else if (score >= 90) {
    level = 'Legendary'
    sparkle = '🏳️‍🌈'
  } else if (score >= 70) {
    level = 'High'
    sparkle = transPrideBonus > 1.5 ? '💖' : '⭐'
  } else if (score >= 45) {
    level = 'Medium'
    sparkle = transPrideBonus > 1.5 ? '🎉' : '🌟'
  } else {
    level = 'Low'
    sparkle = '✨'
  }

  const elfScore: ElfScore = {
    score: Math.round(score),
    level,
    sparkle,
    reasoning
  }

  // Cache the score for consistency
  elfScoreCache.set(vehicleId, elfScore)

  return elfScore
}

export function getElfScoreDisplay(elfScore: ElfScore): string {
  return `${elfScore.sparkle} ${elfScore.score} (${elfScore.level})`
}

export function getElfScoreColor(elfScore: ElfScore): string {
  switch (elfScore.level) {
    case 'Trans Pride':
      return '#5BCEFA' // Trans pride blue
    case 'Legendary':
      return '#ff0080' // Hot pink
    case 'High':
      return '#F5A9B8' // Trans pride pink
    case 'Medium':
      return '#ff6347' // Tomato
    case 'Low':
    default:
      return '#87ceeb' // Sky blue
  }
}

// Force clear the elf score cache (useful for debugging or manual refresh)
export function clearElfScoreCache(): void {
  elfScoreCache.clear()
  lastCacheClear = Date.now()
}

interface ReasoningFactors {
  timeMultiplier: number
  dayBonus: number
  routeMultiplier: number
  occupancyBonus: number
  transPrideBonus: number
  distanceMultiplier: number
  hour: number
  dayOfWeek: number
  distanceFromNearestHub: number
}

function generateElfReasoning(
  vehicle: VehicleFeature,
  factors: ReasoningFactors
): string {
  const route = vehicle.properties.route || 'Unknown'
  const routeLower = route.toLowerCase()

  // Pick the most significant factor for a simple explanation
  if (factors.transPrideBonus >= 1.8) {
    return 'Trans Pride Day brings maximum elf energy'
  } else if (factors.transPrideBonus > 1.3) {
    return 'Pride month magic enhances elf detection'
  } else if (routeLower.includes('green')) {
    return 'Green Line passes through Somerville elf epicenter'
  } else if (routeLower.includes('red')) {
    return 'Red Line connects Harvard and Davis Square elf hubs'
  } else if (routeLower.includes('orange')) {
    return 'Orange Line features incredible amounts of elf energy in JP'
  } else if (
    (factors.dayOfWeek === 5 || factors.dayOfWeek === 6) &&
    (factors.hour >= 22 || factors.hour <= 3)
  ) {
    return 'Peak weekend night hours for elf activity'
  } else if (factors.hour >= 18 || factors.hour <= 2) {
    return 'Prime evening hours for mischielf'
  } else if (factors.distanceFromNearestHub <= 15) {
    return 'Commuter Rail is a great way to find elves'
  } else if (factors.occupancyBonus > 1.1) {
    return 'Crowded car increases elf encounter probability'
  } else if (factors.distanceFromNearestHub <= 1) {
    return 'Deep in elf territory with high queer density'
  } else {
    return 'Standard elf detection conditions apply. No purchase necessary.'
  }
}
