import L from "leaflet";
import "@petoc/leaflet-double-touch-drag-zoom";
import "leaflet/dist/leaflet.css";
import "@petoc/leaflet-double-touch-drag-zoom/src/leaflet-double-touch-drag-zoom.css";
import "leaflet.fullscreen";
import "leaflet-easybutton";
import "leaflet-arrowheads";

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
  var icon_size = 28;
  var icon = "bus-yellow.svg";
  var opacity = 1.0;
  var z_index = 0;
  var status = "";
  var station = "";
  var stopOrGo = "";
  // will enable this at a later point once i work out the UI
  // if (feature.properties["status"] === "STOPPED_AT") {
  //   stopOrGo = "-stop"
  // } else if (feature.properties["status"] === "INCOMING_AT" || feature.properties["status"] === "IN_TRANSIT_TO") {
  //   stopOrGo = "-go"
  // }
  if (feature.properties["marker-symbol"] === "bus") {
    opacity = 0.8;
    icon_size = 25;
  }
  if (feature.properties["marker-size"] === "small") {
    icon_size = 27;
  }
  if (feature.properties["marker-color"] === "#008150") {
    icon = "rail-light";
  }
  if (feature.properties["marker-color"] === "#2F5DA6") {
    icon = "rail-metro-blue";
  }
  if (feature.properties["marker-color"] === "#FA2D27") {
    icon = "rail-metro-red";
  }
  if (feature.properties["marker-color"] === "#FD8A03") {
    icon = "rail-metro-orange";
  }
  if (feature.properties["marker-color"] === "#7B388C") {
    icon = "rail";
  }
  if (feature.properties["marker-symbol"] === "building") {
    icon = "entrance-alt1";
    icon_size = 18;
    opacity = 1;
  }
  if (feature.properties.route && feature.properties.route.startsWith("SL")) {
    icon = "bus-silver";
    opacity = 0.9;
  }
  if (icon != "entrance-alt1") {
    z_index = 1000;
  }

  if (
    feature.geometry.type === "Point" &&
    feature.properties["marker-symbol"] !== "building"
  ) {
    status = feature.properties.status;
    station = feature.properties.stop;
  }

  var icon = L.icon({
    iconUrl: `/images/icons/${icon}${stopOrGo}.svg`,
    iconSize: L.point(icon_size, icon_size),
  });

  return L.marker(latlng, {
    icon: icon,
    title: `${feature.id} ${status} ${station}`,
    opacity: opacity,
    zIndexOffset: z_index,
    riseOnHover: true,
    riseOffset: 2000,
  });
}

function onEachFeature(feature, layer) {
  if (feature.geometry.type === "LineString" && feature.properties.route) {
    layer.bindPopup(`<b>${feature.properties.route}</b>`);
  }
  if (feature.geometry.type === "Point") {
    if (feature.properties["marker-symbol"] === "building") {
      layer.bindPopup(`<b>${feature.properties.name} Stop</b>`);
    } else {
      const update_time = new Date(feature.properties["update_time"]);
      let speed = "";
      if (
        feature.properties["speed"] &&
        feature.properties["status"] != "STOPPED_AT"
      ) {
        speed = `<br />Speed: ${feature.properties.speed} mph`;
      }
      if (feature.properties["approximate_speed"]) {
        speed += "* <small>approximate</small>";
      }
      layer.bindPopup(
        `<b>Route: ${feature.properties.route}</b> <br />ID: ${
          feature.id
        }<br />Status: ${feature.properties.status}<br />Stop: ${
          feature.properties.stop
        }${speed}<br /><small>Update Time: ${update_time.toLocaleTimeString()}</small>`
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
            if (
              feature.properties.route.startsWith("CR") ||
              feature.properties.route.startsWith("SL")
            ) {
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
var intervalID = window.setInterval(annotate_map, 15000);

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

document.getElementById("refresh-rate").addEventListener("change", (event) => {
  window.clearInterval(intervalID);
  var newVal = parseInt(event.target.value);
  if (newVal) {
    intervalID = window.setInterval(annotate_map, event.target.value * 1000);
  }
});
