import * as L from 'leaflet'

export const layerGroups = {
  red: L.layerGroup(),
  blue: L.layerGroup(),
  green: L.layerGroup(),
  orange: L.layerGroup(),
  silver: L.layerGroup(),
  commuter: L.layerGroup(),
  amtrak: L.layerGroup()
}

export const shapesLayerGroups = {
  red: L.layerGroup(),
  blue: L.layerGroup(),
  green: L.layerGroup(),
  orange: L.layerGroup(),
  silver: L.layerGroup(),
  commuter: L.layerGroup()
}

export function getLayerGroupForRoute(route: string): L.LayerGroup {
  if (route.startsWith('Red') || route.startsWith('Mattapan')) {
    return layerGroups.red
  }
  if (route.startsWith('Blue')) {
    return layerGroups.blue
  }
  if (route.startsWith('Green')) {
    return layerGroups.green
  }
  if (route.startsWith('Orange')) {
    return layerGroups.orange
  }
  if (
    route.startsWith('SL') ||
    route.startsWith('74') ||
    route.startsWith('75')
  ) {
    return layerGroups.silver
  }
  if (route.startsWith('CR')) {
    return layerGroups.commuter
  }
  if (
    route === 'Amtrak' ||
    route.startsWith('Acela') ||
    route.includes('Northeast Regional') ||
    route.includes('Downeaster')
  ) {
    return layerGroups.amtrak
  }
  return layerGroups.commuter
}

export function getShapesLayerGroupForRoute(route: string): L.LayerGroup {
  if (route.startsWith('Red') || route.startsWith('Mattapan')) {
    return shapesLayerGroups.red
  }
  if (route.startsWith('Blue')) {
    return shapesLayerGroups.blue
  }
  if (route.startsWith('Green')) {
    return shapesLayerGroups.green
  }
  if (route.startsWith('Orange')) {
    return shapesLayerGroups.orange
  }
  if (
    route.startsWith('SL') ||
    route.startsWith('74') ||
    route.startsWith('75')
  ) {
    return shapesLayerGroups.silver
  }
  if (route.startsWith('CR')) {
    return shapesLayerGroups.commuter
  }
  return shapesLayerGroups.commuter
}
