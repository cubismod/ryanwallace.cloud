import * as L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

function createClusterIcon(
  cluster: L.MarkerCluster,
  lineType: string
): L.DivIcon {
  const childCount = cluster.getChildCount()
  return new L.DivIcon({
    html: `<div><span>${childCount}</span></div>`,
    className: `marker-cluster-icon marker-cluster-${lineType}`,
    iconSize: new L.Point(40, 40)
  })
}

export const layerGroups = {
  red: L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, 'red')
  }),
  blue: L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, 'blue')
  }),
  green: L.markerClusterGroup({
    maxClusterRadius: 50,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, 'green')
  }),
  orange: L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, 'orange')
  }),
  silver: L.markerClusterGroup({
    maxClusterRadius: 50,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, 'silver')
  }),
  commuter: L.markerClusterGroup({
    maxClusterRadius: 80,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, 'commuter')
  }),
  amtrak: L.markerClusterGroup({
    maxClusterRadius: 80,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, 'amtrak')
  })
}

export const shapesLayerGroups = {
  red: L.layerGroup(),
  blue: L.layerGroup(),
  green: L.layerGroup(),
  orange: L.layerGroup(),
  silver: L.layerGroup(),
  commuter: L.layerGroup()
}

export function getLayerGroupForRoute(route: string): L.MarkerClusterGroup {
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
