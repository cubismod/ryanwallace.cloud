import DataTable from "datatables.net-dt";
import moment from "moment";

const filter =
  "?filter%5Bdirection_id%5D=0&filter%5Broute_type%5D=2&filter%5Bstop%5D=place-north%2Cplace-sstat%2Cplace-bbsta%2Cplace-rugg%2Cplace-NEC-1851";

async function fetch_mbta_departures() {
  const url = "https://api-v3.mbta.com/schedules" + filter;
  const response = await fetch(url);
  if (response.ok) {
    const data = await response.json();
    return data.data.filter(
      (item) => Date.parse(item.attributes.departure_time) > Date
    );
  }
  return [];
}

async function fetch_mbta_realtime_predictions() {
  const url = "https://api-v3.mbta.com/predictions" + filter;
  const response = await fetch(url);
  if (response.ok) {
    const data = await response.json();
    return data.data;
  }
  return [];
}

function convert_station_id(station_id) {
  if (station_id.includes("NEC-1851")) {
    return "Providence Station";
  }
  if (station_id.includes("BNT")) {
    return "North Station";
  }
  if (station_id.includes("NEC-2287")) {
    return "South Station";
  }
  if (station_id.includes("NEC-1851")) {
    return "Back Bay Station";
  }
  if (station_id.includes("NEC-2265")) {
    return "Ruggles Station";
  }
}

async function query_track_predictions(departures) {
  const predictions = [];
  for (const departure of departures) {
    console.log(departure);
    const params = {
      station_id: departure.relationships.stop.data.id,
      route_id: departure.relationships.route.data.id,
      trip_id: departure.relationships.trip.data.id,
      headsign: departure.relationships.route.data.id,
      direction_id: "0",
      scheduled_time:
        departure.attributes.departure_time ||
        departure.attributes.arrival_time,
    };
    const searchParams = new URLSearchParams(params);
    const url = `${
      process.env.TRACKS_URL
    }/predictions?${searchParams.toString()}`;
    const response = await fetch(url, {
      method: "POST",
    });
    const data = await response.json();
    if (data.success) {
      predictions.push([
        convert_station_id(params.station_id),
        params.route_id,
        data.prediction.headsign || params.headsign,
        {
          display: new Date(
            departure.attributes.departure_time
          ).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          timestamp: new Date(departure.attributes.departure_time).getTime(),
        },
        data.prediction.predicted_platform_code,
        `${Math.round(data.prediction.confidence_score * 100)}%`,
      ]);
    }
  }
  return predictions;
}

async function track() {
  let predictions = [];
  const departures = await fetch_mbta_departures();
  const realtime_predictions = await fetch_mbta_realtime_predictions();
  if (realtime_predictions.length === 0) {
    predictions = await query_track_predictions(
      departures.concat(realtime_predictions)
    );
  } else {
    predictions = await query_track_predictions(departures);
  }
  new DataTable("#track", {
    data: predictions,
    columns: [
      { title: "Station" },
      { title: "Route" },
      { title: "Destination" },
      {
        title: "Scheduled",
        render: {
          _: "display",
          sort: "timestamp",
        },
      },
      { title: "Predicted Track", className: "dt-body-center" },
      { title: "Confidence", className: "dt-body-center" },
    ],
    order: [[3, "asc"]],
    responsive: true,
    ordering: true,
  });
}

track();
