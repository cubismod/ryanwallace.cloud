import L from "leaflet";
import "@petoc/leaflet-double-touch-drag-zoom";
import "leaflet/dist/leaflet.css";
import "@petoc/leaflet-double-touch-drag-zoom/src/leaflet-double-touch-drag-zoom.css";
import "leaflet.fullscreen";
import "leaflet-easybutton";

var map = L.map("map", {
  doubleTouchDragZoom: true,
  fullscreenControl: true,
  fullscreenControlOptions: {
    position: "topleft",
    title: "Fullscreen",
  },
}).setView([42.36565, -71.05236], 13);

var baseLayerLoaded = false;

document.getElementById("map").scrollIntoView({ behavior: "smooth" });

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

var geoJsonLayer = null;

function return_colors(route) {
  if (route.startsWith("Green")) {
    return "#008150";
  }
  if (route.startsWith("Blue")) {
    return "#2F5DA6";
  }
  if (route.startsWith("CR")) {
    return "#7B388C";
  }
  if (route.startsWith("Red") || route.startsWith("Mattapan")) {
    return "#FA2D27";
  }
  if (route.startsWith("Orange")) {
    return "#FD8A03";
  }
  if (
    route.startsWith("74") ||
    route.startsWith("75") ||
    route.startsWith("SL")
  ) {
    return "#9A9C9D";
  }
  return "#3e2426";
}

function pointToLayer(feature, latlng) {
  var icon_size = 22;
  var icon = "bus-yellow.svg";
  var opacity = 1.0;
  var z_index = 0;
  if (feature.properties["marker-symbol"] === "bus") {
    opacity = 0.8;
    icon_size = 15;
  }
  if (feature.properties["marker-size"] === "small") {
    icon_size = 17;
  }
  if (feature.properties["marker-color"] === "#008150") {
    icon = "rail-light.svg";
  }
  if (feature.properties["marker-color"] === "#2F5DA6") {
    icon = "rail-metro-blue.svg";
  }
  if (feature.properties["marker-color"] === "#FA2D27") {
    icon = "rail-metro-red.svg";
  }
  if (feature.properties["marker-color"] === "#FD8A03") {
    icon = "rail-metro-orange.svg";
  }
  if (feature.properties["marker-color"] === "#7B388C") {
    icon = "rail.svg";
  }
  if (feature.properties["marker-symbol"] === "building") {
    icon = "entrance-alt1.svg";
    opacity = 0.6;
  }
  if (feature.properties.route && feature.properties.route.startsWith("SL")) {
    icon = "bus-silver.svg";
    opacity = 0.9;
  }
  if (icon != "entrance-alt1.svg") {
    z_index = 1000;
  }

  var icon = L.icon({
    iconUrl: `/images/icons/${icon}`,
    iconSize: L.point(icon_size, icon_size),
  });

  return L.marker(latlng, {
    icon: icon,
    title: feature.id,
    opacity: opacity,
    zIndexOffset: z_index,
    riseOnHover: true,
    riseOffset: 2000,
  });
}

function onEachFeature(feature, layer) {
  var update_time = new Date();
  if (feature.geometry.type === "LineString" && feature.properties.route) {
    layer.bindPopup(`<b>${feature.properties.route}</b>`);
  }
  if (feature.geometry.type === "Point") {
    if (feature.properties["marker-symbol"] === "building") {
      layer.bindPopup(`<b>${feature.properties.name} Stop</b>`);
    } else {
      layer.bindPopup(
        `<b>Route: ${feature.properties.route}</b> <br />ID: ${
          feature.id
        }<br />Status: ${feature.properties.status}<br />Stop: ${
          feature.properties.stop
        } <br />Speed: ${
          feature.properties.speed
        }<br /><i>Update Time: ${update_time.toTimeString()}</i>`
      );
    }
  }
}

function annotate_map() {
  if (!baseLayerLoaded) {
    $.getJSON("https://vehicles.ryanwallace.cloud/shapes", function (data) {
      var baseLayer = L.geoJSON(data, {
        style: (feature) => {
          if (feature.geometry.type === "LineString") {
            var weight = 4;
            if (feature.properties.route.startsWith("CR")) {
              weight = 3;
            }
            if (
              Number.parseInt(feature.properties.route) ==
              feature.properties.route
            ) {
              weight = 2;
            }
            return {
              color: return_colors(feature.properties.route),
              weight: weight,
            };
          }
        },
        pointToLayer: pointToLayer,
        onEachFeature: onEachFeature,
      }).addTo(map);
    });
    baseLayerLoaded = true;
  }

  $.getJSON("https://vehicles.ryanwallace.cloud/", function (data) {
    if (geoJsonLayer) {
      map.removeLayer(geoJsonLayer);
    }
    geoJsonLayer = L.geoJSON(data, {
      pointToLayer: pointToLayer,
      onEachFeature: onEachFeature,
    }).addTo(map);
    console.log("Map loaded");
  });
}

annotate_map();
window.setInterval(annotate_map, 15000);

L.easyButton({
  position: "topright",
  states: [
    {
      stateName: "refresh",
      onClick: (btn, map) => {
        annotate_map();
      },
      icon: "<span class='refresh'>&olarr;</span>",
    },
  ],
}).addTo(map);

L.easyButton({
  position: "topright",
  states: [
    {
      stateName: "locate",
      onClick: (btn, map) => {
        map.locate({ enableHighAccuracy: true, setView: true });
      },
      icon: "<span class='odot'>&odot;</span>",
    },
  ],
}).addTo(map);

document.addEventListener("visibilitychange", (event) => {
  if (document.visibilityState === "visible") {
    annotate_map();
  }
});

window.addEventListener("focus", annotate_map);
