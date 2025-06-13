import L from "leaflet";
import "@petoc/leaflet-double-touch-drag-zoom";
import "leaflet/dist/leaflet.css";
import "@petoc/leaflet-double-touch-drag-zoom/src/leaflet-double-touch-drag-zoom.css";
import "leaflet.fullscreen";
import "leaflet-easybutton";
import "leaflet-arrowheads";
import "invert-color";
import DOMPurify from "dompurify";
import invert from "invert-color";
import DataTable from "datatables.net-dt";
import { MaptilerLayer } from "@maptiler/leaflet-maptilersdk";
import { formatDistance } from "date-fns";

var map = L.map("map", {
  doubleTouchDragZoom: true,
  fullscreenControl: true,
  fullscreenControlOptions: {
    position: "topleft",
    title: "Fullscreen",
    forcePseudoFullscreen: true,
  },
}).setView([42.36565, -71.05236], 13);

const lines = ["rl", "gl", "bl", "ol", "sl", "cr"];
const vehicleTypes = ["light", "heavy", "regional", "bus"];
const vehicleCountMap = createVehicleCountMap();
const vehicles_url =
  process.env.VEHICLES_URL || "https://vehicles.ryanwallace.cloud";

var baseLayerLoaded = false;

document.getElementById("map").scrollIntoView({ behavior: "smooth" });

const mtLayer = new MaptilerLayer({
  apiKey: process.env.MT_KEY,
  style: "streets-v2",
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

function createVehicleCountMap() {
  const vehicleCountMap = new Map();
  for (const line of lines) {
    vehicleCountMap.set(line, new Map());
  }
  return vehicleCountMap;
}

function clearMap() {
  for (const line of lines) {
    for (const vehicleType of vehicleTypes) {
      vehicleCountMap.get(line)?.set(vehicleType, 0);
    }
  }
}

function incrementMapItem(route, vehicleType) {
  const existing = vehicleCountMap.get(route)?.get(vehicleType);
  if (existing !== undefined) {
    vehicleCountMap.get(route).set(vehicleType, existing + 1);
  } else {
    vehicleCountMap.get(route).set(vehicleType, 1);
  }
}

function calculateTotal(dimension) {
  var total = 0;
  if (lines.includes(dimension)) {
    // we are retrieving the total for a line
    for (const vehicleType of vehicleTypes) {
      total += vehicleCountMap.get(dimension)?.get(vehicleType) || 0;
    }
    return total;
  } else if (vehicleTypes.includes(dimension)) {
    // we are retrieving the total for a vehicle type
    for (const line of lines) {
      total += vehicleCountMap.get(line)?.get(dimension) || 0;
    }
    return total;
  } else if (dimension === "all") {
    // we are retrieving the total for all dimensions
    for (const line of lines) {
      for (const vehicleType of vehicleTypes) {
        total += vehicleCountMap.get(line)?.get(vehicleType) || 0;
      }
    }
    return total;
  }
}

function updateTable() {
  for (const line of lines) {
    for (const vehicleType of vehicleTypes) {
      const id = `${line}-${vehicleType}`;
      const element = document.getElementById(id);
      if (element) {
        element.innerHTML =
          DOMPurify.sanitize(vehicleCountMap.get(line)?.get(vehicleType)) || 0;
      }
    }
    const totalElement = document.getElementById(`${line}-total`);
    if (totalElement) {
      totalElement.innerHTML = DOMPurify.sanitize(calculateTotal(line));
    }
  }
  for (const vehicleType of vehicleTypes) {
    const element = document.getElementById(`${vehicleType}-total`);
    if (element) {
      element.innerHTML = DOMPurify.sanitize(calculateTotal(vehicleType));
    }
  }
  const element = document.getElementById("total");
  if (element) {
    element.innerHTML = DOMPurify.sanitize(calculateTotal("all"));
  }
}

function pointToLayer(feature, latlng) {
  var icon_size = 28;
  var icon = "bus-yellow.svg";
  var opacity = 1.0;
  var zIndex = 0;
  var status = "";
  var station = "";
  var stopOrGo = "";
  // will enable this at a later point once i work out the UI
  // if (feature.properties["status"] === "STOPPED_AT") {
  //   stopOrGo = "-stop"
  // } else if (feature.properties["status"] === "INCOMING_AT" || feature.properties["status"] === "IN_TRANSIT_TO") {
  //   stopOrGo = "-go"
  // }
  if (feature.properties["marker-symbol"] === "building") {
    icon = "entrance-alt1";
    icon_size = 18;
    opacity = 1;
    zIndex = -10;
  } else {
    if (feature.properties["marker-symbol"] === "bus") {
      opacity = 0.8;
      icon_size = 25;
    }
    if (feature.properties["marker-size"] === "small") {
      icon_size = 27;
    }
    if (feature.properties["marker-color"] === "#008150") {
      icon = "rail-light";
      incrementMapItem("gl", "light");
    }
    if (feature.properties["marker-color"] === "#2F5DA6") {
      icon = "rail-metro-blue";
      incrementMapItem("bl", "heavy");
    }
    if (feature.properties["marker-color"] === "#FA2D27") {
      icon = "rail-metro-red";
      if (feature.properties["route"] === "Mattapan") {
        incrementMapItem("rl", "light");
      } else {
        incrementMapItem("rl", "heavy");
      }
    }
    if (feature.properties["marker-color"] === "#FD8A03") {
      icon = "rail-metro-orange";
      incrementMapItem("ol", "heavy");
    }
    if (feature.properties["marker-color"] === "#7B388C") {
      icon = "rail";
      incrementMapItem("cr", "regional");
    }
    if (feature.properties.route && feature.properties.route.startsWith("SL")) {
      incrementMapItem("sl", "bus");
      icon = "bus-silver";
      opacity = 0.9;
    }
    if (
      process.env.PRIDE_TRAIN_ID &&
      feature.properties.carriages &&
      feature.properties.carriages.includes(process.env.PRIDE_TRAIN_ID)
    ) {
      icon = "rail-light-pride";
      icon_size = 35;
    }
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
    zIndexOffset: zIndex,
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
      let occupancy = "";
      if (feature.properties["occupancy_status"]) {
        occupancy = `<br />Occupancy: ${feature.properties["occupancy_status"]}`;
      }
      let carriages = "";
      if (feature.properties["carriages"]) {
        carriages += "Cars:<br /><ul>";
        for (const carriage of feature.properties["carriages"]) {
          carriages += `<li>${carriage}</li>`;
        }
        carriages += "</ul>";
      }
      const popup = L.popup({
        content: `<b>Route: ${feature.properties.route}</b> <br />ID: ${
          feature.id
        }<br />Status: ${feature.properties.status}<br />Stop: ${
          feature.properties.stop
        }${speed}${occupancy}<br />${carriages}
        <small>Update Time: ${update_time.toLocaleTimeString()}</small>`,
        keepInView: true,
      });

      if (
        feature.properties["stop-coordinates"] &&
        feature.properties["status"] != "STOPPED_AT"
      ) {
        const coords = [
          [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
          [
            feature.properties["stop-coordinates"][1],
            feature.properties["stop-coordinates"][0],
          ],
        ];
        const line1 = L.polyline(coords, {
          color: invert(feature.properties["marker-color"], true),
          weight: 15,
        });
        const line2 = L.polyline(coords, {
          color: feature.properties["marker-color"],
          weight: 7,
        });
        line1.arrowheads();
        line2.arrowheads();

        layer.addEventListener("click", () => {
          line1.addTo(map);
          line2.addTo(map);
          map.panInsideBounds(line1.getBounds());
          window.setTimeout(() => {
            line1.removeFrom(map);
            line2.removeFrom(map);
          }, 10000);
        });
      }

      layer.bindPopup(popup);
    }
  }
}

function calculateAffectedLines(data) {
  const checks = [
    { test: (route) => route.startsWith("CR"), class: "cr" },
    { test: (route) => route.startsWith("7"), class: "sl" },
    { test: (route) => route === "Blue", class: "bl" },
    { test: (route) => route === "Red", class: "rl" },
    { test: (route) => route === "Green", class: "gl" },
    { test: (route) => route === "Orange", class: "ol" },
  ];

  const afLines = new Set();
  for (const entity of data) {
    for (const check of checks) {
      if (check.test(entity.route)) {
        afLines.add(entity.route);
      }
    }
  }
  return [...afLines].join(", ");
}

function alerts() {
  $.getJSON(`${vehicles_url}/alerts`, function (data) {
    const msgs = new Set();
    const dataSet = [];

    for (const alert of data.data) {
      if (alert.attributes && !msgs.has(alert.attributes.header)) {
        if (
          alert.attributes.active_period.length > 0 &&
          alert.attributes.active_period[0].end
        ) {
          // skip alert if end time already passed
          const end_time = alert.attributes.active_period[0].end;
          if (Date.parse(end_time) < Date.now()) {
            continue;
          }
        }
        const rowData = [
          alert.attributes.severity,
          formatDistance(
            new Date(
              alert.attributes.updated_at || alert.attributes.created_at
            ),
            new Date(),
            { addSuffix: true }
          ),
          alert.attributes.header,
          calculateAffectedLines(alert.attributes.informed_entity),
        ];
        dataSet.push(rowData);
      }
    }
    new DataTable("#alerts", {
      columns: [
        { title: "Severity", className: "dt-body-center" },
        { title: "Updated" },
        { title: "Alert", className: "alert-body" },
        { title: "Lines Affected" },
      ],
      data: dataSet,
      ordering: false,
      paging: false,
    });
  });
}

function annotate_map() {
  clearMap();
  $.getJSON(vehicles_url, function (data) {
    if (geoJsonLayer) {
      map.removeLayer(geoJsonLayer);
    }
    geoJsonLayer = L.geoJSON(data, {
      pointToLayer: pointToLayer,
      onEachFeature: onEachFeature,
    }).addTo(map);
    console.log("Map loaded");
    window.setTimeout(() => {
      updateTable();
    }, 100);
  });
  if (!baseLayerLoaded) {
    $.getJSON(`${vehicles_url}/shapes`, function (data) {
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

document.getElementById("refresh-rate").addEventListener("change", (event) => {
  window.clearInterval(intervalID);
  var newVal = parseInt(event.target.value);
  if (newVal) {
    intervalID = window.setInterval(annotate_map, event.target.value * 1000);
  }
});

alerts();
