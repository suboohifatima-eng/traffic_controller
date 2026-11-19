import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Helper to get road color based on traffic status
const getRoadColor = (status) => {
  switch (status) {
    case "Heavy":
      return "#ef4444"; // Red - Congested / Busy
    case "Moderate":
      return "#f59e0b"; // Amber/Yellow - Sluggish
    case "Low":
    default:
      return "#22c55e"; // Green - Clear / Smooth
  }
};

// Create custom glowing HTML DivIcon
const createUserIcon = () =>
  L.divIcon({
    className: "custom-user-marker",
    html: `
      <div class="user-pulse-ring"></div>
      <div class="user-marker-dot">📍</div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 34]
  });

const createIncidentIcon = (status) => {
  const icon = status === "Heavy" ? "🛑" : status === "Moderate" ? "⚠️" : "🚦";
  return L.divIcon({
    className: "custom-incident-marker",
    html: `<div class="incident-badge incident-${status ? status.toLowerCase() : 'low'}">${icon}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

export default function TrafficMap({
  center = [28.6139, 77.2090], // Default center
  zoom = 14,
  userLocation = null,
  roads = [],
  cityName = "Current Location",
  onLocateMe,
  isLocating = false,
  onRefreshRoads
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const roadsLayerGroupRef = useRef(null);
  const markersLayerGroupRef = useRef(null);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: true
      });

      // Official OpenStreetMap Standard Tiles (100% free, no API key required)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      roadsLayerGroupRef.current = L.layerGroup().addTo(map);
      markersLayerGroupRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Pan/Fly when center or zoom changes
  useEffect(() => {
    if (mapInstanceRef.current && center && center[0] && center[1]) {
      mapInstanceRef.current.flyTo(center, zoom, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [center[0], center[1], zoom]);

  // 3. Render User Marker
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerGroupRef.current) return;

    markersLayerGroupRef.current.clearLayers();

    if (userLocation && userLocation.lat && userLocation.lng) {
      const userMarker = L.marker([userLocation.lat, userLocation.lng], {
        icon: createUserIcon(),
        title: "Your Current Location"
      });

      userMarker.bindPopup(`
        <div class="map-popup user-popup">
          <h4>📍 Your Current Location</h4>
          <p>${userLocation.label || "GPS Position Detected"}</p>
          <small>Lat: ${userLocation.lat.toFixed(4)}, Lng: ${userLocation.lng.toFixed(4)}</small>
        </div>
      `);

      markersLayerGroupRef.current.addLayer(userMarker);
    }
  }, [userLocation]);

  // 4. Render Roads with Traffic Overlays
  useEffect(() => {
    if (!mapInstanceRef.current || !roadsLayerGroupRef.current) return;

    roadsLayerGroupRef.current.clearLayers();

    roads.forEach((road) => {
      if (!road.coordinates || road.coordinates.length < 2) return;

      const roadColor = getRoadColor(road.status);

      // Outer glow/casing line for visibility
      const casingPolyline = L.polyline(road.coordinates, {
        color: "#ffffff",
        weight: 10,
        opacity: 0.8,
        lineCap: "round",
        lineJoin: "round"
      });

      // Main colored traffic polyline
      const trafficPolyline = L.polyline(road.coordinates, {
        color: roadColor,
        weight: 6,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      });

      const popupContent = `
        <div class="map-popup road-popup">
          <div class="road-popup-header">
            <h4>🛣️ ${road.name}</h4>
            <span class="status-pill status-${road.status.toLowerCase()}">
              ${road.status === "Heavy" ? "🔴 Busy / Congested" : road.status === "Moderate" ? "🟡 Moderate Traffic" : "🟢 Free Flowing"}
            </span>
          </div>
          <div class="road-popup-stats">
            <div><strong>Avg Speed:</strong> <span>${road.speed} km/h</span></div>
            <div><strong>Est Delay:</strong> <span>${road.delayMinutes > 0 ? `+${road.delayMinutes} mins` : "No delay"}</span></div>
            <div><strong>Congestion:</strong> <span>${road.congestionIndex || (road.status === 'Heavy' ? '85' : road.status === 'Moderate' ? '50' : '15')}%</span></div>
            <div><strong>Road Category:</strong> <span>${road.roadType || 'Arterial'}</span></div>
          </div>
        </div>
      `;

      trafficPolyline.bindPopup(popupContent);
      casingPolyline.bindPopup(popupContent);

      roadsLayerGroupRef.current.addLayer(casingPolyline);
      roadsLayerGroupRef.current.addLayer(trafficPolyline);

      // Add a status pin at midpoint for heavily congested or incident roads
      if (road.status === "Heavy" && road.midpoint) {
        const incidentMarker = L.marker(road.midpoint, {
          icon: createIncidentIcon(road.status)
        });
        incidentMarker.bindPopup(`
          <div class="map-popup">
            <strong>🛑 Traffic Alert on ${road.name}</strong>
            <p>Heavy delay of ~${road.delayMinutes || 20} mins reported. Avoid if possible.</p>
          </div>
        `);
        roadsLayerGroupRef.current.addLayer(incidentMarker);
      }
    });
  }, [roads]);

  return (
    <div className="traffic-map-wrapper">
      {/* Top Map Control Bar */}
      <div className="map-toolbar">
        <div className="map-location-badge">
          <span>📍 Viewing Area:</span>
          <strong>{cityName}</strong>
        </div>

        <div className="map-actions">
          <button
            type="button"
            className="map-btn locate-btn"
            onClick={onLocateMe}
            disabled={isLocating}
          >
            {isLocating ? "📡 Detecting GPS..." : "📍 My Location"}
          </button>

          <button
            type="button"
            className="map-btn refresh-btn"
            onClick={onRefreshRoads}
            title="Refresh Live Traffic Flow"
          >
            🔄 Refresh Traffic
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="leaflet-map-canvas" ref={mapContainerRef} />

      {/* Floating Traffic Flow Legend */}
      <div className="traffic-legend">
        <h4>Live Road Status</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-bar legend-low"></span>
            <span>Smooth / Fast (&gt;60 km/h)</span>
          </div>
          <div className="legend-item">
            <span className="legend-bar legend-moderate"></span>
            <span>Moderate / Slow (35–55 km/h)</span>
          </div>
          <div className="legend-item">
            <span className="legend-bar legend-heavy"></span>
            <span>Busy / Jammed (&lt;25 km/h)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
