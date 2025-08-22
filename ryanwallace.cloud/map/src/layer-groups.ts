import * as L from 'leaflet'

function createClusterIcon(cluster: any, lineType: string): L.DivIcon {
  const childCount = cluster.getChildCount()
  return new L.DivIcon({
    html: `<div><span>${childCount}</span></div>`,
    className: `marker-cluster-icon marker-cluster-${lineType}`,
    iconSize: new L.Point(40, 40)
  })
}

let clusteringEnabled = false

export const layerGroups: Record<string, L.LayerGroup> = {
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

export function isClusteringEnabled(): boolean {
  return clusteringEnabled
}

export async function enableClustering(map: L.Map): Promise<void> {
  if (clusteringEnabled) return
  // Load styles and plugin on demand to keep initial bundle light
  await Promise.all([
    import('leaflet.markercluster/dist/MarkerCluster.css'),
    import('leaflet.markercluster/dist/MarkerCluster.Default.css')
  ]).catch(() => {})
  await import('leaflet.markercluster')

  const makeClusterGroup = (lineType: string, radius: number) =>
    (L as any).markerClusterGroup({
      maxClusterRadius: radius,
      iconCreateFunction: (cluster: any) => createClusterIcon(cluster, lineType)
    }) as L.LayerGroup

  const newGroups: Record<string, L.LayerGroup> = {
    red: makeClusterGroup('red', 40),
    blue: makeClusterGroup('blue', 40),
    green: makeClusterGroup('green', 50),
    orange: makeClusterGroup('orange', 40),
    silver: makeClusterGroup('silver', 50),
    commuter: makeClusterGroup('commuter', 30),
    amtrak: makeClusterGroup('amtrak', 80)
  }

  // Move layers from plain groups to cluster groups and swap
  for (const key of Object.keys(layerGroups)) {
    const oldGroup = layerGroups[key]
    const newGroup = newGroups[key]
    const wasOnMap = map.hasLayer(oldGroup)

    const layers: L.Layer[] = []
    oldGroup.eachLayer((l) => layers.push(l))
    oldGroup.clearLayers()

    layers.forEach((l) => newGroup.addLayer(l))

    if (wasOnMap) {
      map.removeLayer(oldGroup)
      newGroup.addTo(map)
    }

    layerGroups[key] = newGroup
  }

  // Attach spiderfied handler to apply stored effects
  for (const key of Object.keys(layerGroups)) {
    const group: any = layerGroups[key] as any
    if (group && typeof group.on === 'function') {
      group.on('spiderfied', (event: any) => {
        const { applyStoredElfEffects } = require('./marker-manager')
        event.markers?.forEach((marker: L.Marker) => {
          setTimeout(() => applyStoredElfEffects(marker), 10)
        })
      })
    }
  }

  clusteringEnabled = true
}
