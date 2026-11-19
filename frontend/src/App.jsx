import { useEffect, useState, useRef } from "react";
import TrafficMap from "./components/TrafficMap";
import "./index.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

export default function App() {
  const [locationInput, setLocationInput] = useState("");
  const [traffic, setTraffic] = useState([]);
  const [message, setMessage] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Map state
  const [mapCenter, setMapCenter] = useState([28.6139, 77.2090]); // Default New Delhi
  const [mapZoom, setMapZoom] = useState(13);
  const [activeCityName, setActiveCityName] = useState("New Delhi");
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [currentRoads, setCurrentRoads] = useState([]);

  // Dashboard interactive state
  const [dashFilter, setDashFilter] = useState("ALL");
  const [dashSort, setDashSort] = useState("speed_desc");
  const [dashSearchQuery, setDashSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedRoadId, setSelectedRoadId] = useState(null);

  // Autocomplete suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimerRef = useRef(null);

  // Form for reporting new traffic
  const [newLocation, setNewLocation] = useState("");
  const [newStatus, setNewStatus] = useState("Moderate");
  const [newSpeed, setNewSpeed] = useState("");
  const [reportMsg, setReportMsg] = useState("");

  // AI Assistant state
  const [aiPromptInput, setAiPromptInput] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const popularCities = [
    { name: "📍 Current Location", isGps: true },
    { name: "New Delhi", lat: 28.6139, lng: 77.2090 },
    { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
    { name: "Bengaluru", lat: 12.9716, lng: 77.5946 },
    { name: "New York", lat: 40.7128, lng: -74.0060 },
    { name: "London", lat: 51.5074, lng: -0.1278 }
  ];

  // 1. Fetch road traffic flow from backend around given coordinates
  const fetchRoadsForCoordinates = async (lat, lng, cityName, customRoads = []) => {
    try {
      const response = await fetch(`${API}/traffic/roads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lng,
          cityName,
          roadsList: customRoads
        })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentRoads(data.roads || []);
      }
    } catch (err) {
      console.error("Failed to load road traffic flow:", err);
    }
  };

  // 2. Fetch all global traffic reports from MongoDB
  const fetchAllTraffic = async () => {
    try {
      const response = await fetch(`${API}/traffic`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setTraffic(data);
      }
    } catch (error) {
      console.error("Failed to fetch traffic list:", error);
    }
  };

  // Initial load
  useEffect(() => {
    fetchAllTraffic();
    fetchRoadsForCoordinates(mapCenter[0], mapCenter[1], activeCityName);
  }, []);

  // Live Auto-Refresh Effect (refreshes metrics every 10s if enabled)
  useEffect(() => {
    let interval = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchRoadsForCoordinates(mapCenter[0], mapCenter[1], activeCityName);
      }, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, mapCenter, activeCityName]);

  // 3. Autocomplete as user types
  const handleInputChange = (e) => {
    const text = e.target.value;
    setLocationInput(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text.trim() || text.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            text
          )}&addressdetails=1&limit=5`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error("Nominatim geocoding error:", err);
      }
    }, 350);
  };

  // 4. Handle selecting a suggestion
  const handleSelectSuggestion = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const label = item.display_name;
    const shortName = item.name || item.address?.road || item.address?.city || label.split(",")[0];

    setLocationInput(shortName);
    setShowSuggestions(false);
    setSuggestions([]);

    executeLocationSearch(shortName, lat, lng, label);
  };

  // 5. Execute search for any road or city globally
  const executeLocationSearch = async (queryName, knownLat, knownLng, fullLabel) => {
    setLoading(true);
    setMessage("");

    let targetLat = knownLat;
    let targetLng = knownLng;
    let displayName = queryName;

    if (targetLat === undefined || targetLng === undefined) {
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            queryName
          )}&limit=1`
        );
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          targetLat = parseFloat(geoData[0].lat);
          targetLng = parseFloat(geoData[0].lon);
          displayName = geoData[0].name || queryName;
        }
      } catch (err) {
        console.warn("Geocoding fallback failed:", err);
      }
    }

    if (targetLat !== undefined && targetLng !== undefined) {
      setMapCenter([targetLat, targetLng]);
      setMapZoom(14);
      setActiveCityName(displayName);

      await fetchRoadsForCoordinates(targetLat, targetLng, displayName, [
        displayName,
        `${displayName} Outer`,
        `${displayName} Expressway`,
        `${displayName} Bypass`
      ]);
    }

    try {
      const response = await fetch(`${API}/traffic/${encodeURIComponent(queryName)}`);
      const data = await response.json();

      if (response.ok && data.location) {
        setSearchResult({
          ...data,
          fullLabel: fullLabel || data.location
        });
        setMessage("");

        setTraffic((prev) => {
          const exists = prev.some((item) => item.location.toLowerCase() === data.location.toLowerCase());
          return exists ? prev : [data, ...prev];
        });
      } else {
        setSearchResult(null);
        setMessage("Road/location recorded and live traffic simulated.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Server connection failed. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  // 6. Locate User via Browser GPS Geolocation
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    setMessage("📡 Detecting your live GPS location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        let streetLabel = "Your Location";
        let detectedCity = "Local Area";

        try {
          const revRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
          );
          if (revRes.ok) {
            const revData = await revRes.json();
            streetLabel = revData.address?.road || revData.name || "Your Current Road";
            detectedCity =
              revData.address?.city ||
              revData.address?.town ||
              revData.address?.suburb ||
              "Current Location";
          }
        } catch (err) {
          console.warn("Reverse geocode error:", err);
        }

        setUserLocation({ lat, lng, label: streetLabel });
        setMapCenter([lat, lng]);
        setMapZoom(15);
        setActiveCityName(detectedCity);
        setLocationInput(streetLabel);
        setIsLocating(false);
        setMessage(`📍 Located: ${streetLabel} (${detectedCity})`);

        await fetchRoadsForCoordinates(lat, lng, detectedCity, [
          streetLabel,
          `${streetLabel} Outer`,
          "Main Crossroad",
          "Connecting Expressway"
        ]);

        executeLocationSearch(streetLabel, lat, lng);
      },
      (error) => {
        setIsLocating(false);
        let errorMsg = "Unable to retrieve your location.";
        if (error.code === 1) errorMsg = "Permission denied for location access.";
        else if (error.code === 2) errorMsg = "Location unavailable.";
        else if (error.code === 3) errorMsg = "Location request timed out.";
        setMessage(`⚠️ ${errorMsg}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // 7. Handle manual traffic report submission
  const handleCreateReport = async (e) => {
    e.preventDefault();
    if (!newLocation.trim()) {
      setReportMsg("⚠️ Please enter a road/location name");
      return;
    }
    const speedNum = Number(newSpeed);
    if (!newSpeed || isNaN(speedNum) || speedNum <= 0) {
      setReportMsg("⚠️ Please enter a valid speed (km/h)");
      return;
    }

    try {
      const res = await fetch(`${API}/traffic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: newLocation.trim(),
          status: newStatus,
          speed: speedNum,
          latitude: mapCenter[0],
          longitude: mapCenter[1],
          city: activeCityName
        })
      });

      if (res.ok) {
        const created = await res.json();
        setReportMsg(`✅ Traffic report saved for ${created.location}!`);
        setNewLocation("");
        setNewSpeed("");
        fetchAllTraffic();
        setTimeout(() => setReportMsg(""), 4000);
      } else {
        setReportMsg("Failed to add report");
      }
    } catch {
      setReportMsg("Server error creating report");
    }
  };

  // 8. Streaming AI Assistant Request
  const askAiAssistant = async (customPrompt) => {
    const query = customPrompt || aiPromptInput || "General Traffic Recommendation";
    setAiLoading(true);
    setIsStreaming(true);

    setAiResponse({
      answer: "",
      recommendedRoutes: [],
      avoidRoads: [],
      departureAdvice: "",
      avgSpeed: 0
    });

    try {
      const response = await fetch(`${API}/traffic/ai-assistant/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityName: activeCityName,
          roads: currentRoads,
          userQuery: query
        })
      });

      if (!response.ok || !response.body) {
        throw new Error("Stream connection failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.replace("data: ", "").trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === "meta") {
              setAiResponse((prev) => ({
                ...prev,
                recommendedRoutes: data.recommendedRoutes || [],
                avoidRoads: data.avoidRoads || [],
                departureAdvice: data.departureAdvice || "",
                avgSpeed: data.avgSpeed || 0
              }));
            } else if (data.type === "token") {
              setAiResponse((prev) => ({
                ...prev,
                answer: (prev ? prev.answer : "") + data.text
              }));
            } else if (data.type === "done") {
              setIsStreaming(false);
            }
          } catch (e) {
            console.error("Stream parse error:", e);
          }
        }
      }
    } catch (err) {
      console.warn("Stream error, fallback:", err);
      setAiResponse({
        answer: `AI Traffic Analysis for ${activeCityName}: Traffic flow on primary arterials is active with average speeds of ${
          currentRoads[0]?.speed || 45
        } km/h. Recommend clear bypass routes.`,
        recommendedRoutes: ["Outer Bypass Corridor"],
        avoidRoads: [],
        departureAdvice: "Optimal departure is within 15 minutes."
      });
    } finally {
      setAiLoading(false);
      setIsStreaming(false);
    }
  };

  // 9. Dashboard Filter & Sort Compute Logic
  const getDisplayRoads = () => {
    let sourceList = currentRoads.length > 0 ? currentRoads : traffic.map((t) => ({
      id: t._id,
      name: t.location,
      status: t.status,
      speed: t.speed,
      delayMinutes: t.delayMinutes || (t.status === "Heavy" ? 18 : t.status === "Moderate" ? 7 : 0),
      congestionIndex: t.congestionIndex || (t.status === "Heavy" ? 82 : t.status === "Moderate" ? 48 : 12),
      roadType: t.roadType || "primary"
    }));

    // Filter by Search text inside Dashboard
    if (dashSearchQuery.trim()) {
      const q = dashSearchQuery.toLowerCase();
      sourceList = sourceList.filter((item) => item.name.toLowerCase().includes(q));
    }

    // Filter by Status Tab
    if (dashFilter !== "ALL") {
      sourceList = sourceList.filter((item) => item.status === dashFilter);
    }

    // Sort List
    sourceList = [...sourceList].sort((a, b) => {
      if (dashSort === "speed_desc") return b.speed - a.speed;
      if (dashSort === "speed_asc") return a.speed - b.speed;
      if (dashSort === "delay_desc") return (b.delayMinutes || 0) - (a.delayMinutes || 0);
      if (dashSort === "name_asc") return a.name.localeCompare(b.name);
      return 0;
    });

    return sourceList;
  };

  // Compute Dashboard Summary Stats
  const rawList = currentRoads.length > 0 ? currentRoads : traffic;
  const totalCount = rawList.length;
  const clearCount = rawList.filter((r) => (r.status || "") === "Low").length;
  const moderateCount = rawList.filter((r) => (r.status || "") === "Moderate").length;
  const busyCount = rawList.filter((r) => (r.status || "") === "Heavy").length;
  const avgSpeed = totalCount > 0
    ? Math.round(rawList.reduce((acc, r) => acc + (r.speed || 0), 0) / totalCount)
    : 0;

  const displayRoads = getDisplayRoads();

  // Handle clicking a road card to inspect & fly map
  const handleInspectRoad = (road) => {
    setSelectedRoadId(road.id || road._id);
    if (road.midpoint) {
      setMapCenter(road.midpoint);
      setMapZoom(16);
      const mapElem = document.getElementById("map");
      if (mapElem) {
        mapElem.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const getStatusIcon = (status) => {
    if (status === "Low") return "🟢";
    if (status === "Moderate") return "🟡";
    return "🔴";
  };

  const getStatusAdvice = (status) => {
    if (status === "Low") return "Free flowing, optimal transit speed.";
    if (status === "Moderate") return "Moderate traffic, expect slight delays.";
    return "Busy / Heavy congestion! Significant delay expected.";
  };

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="navbar">
        <h2>🚦 SmartTraffic Live</h2>
        <div>
          <a href="#home">Search</a>
          <a href="#map">Live Map</a>
          <a href="#traffic">Dashboard</a>
          <a href="#report">Report</a>
          <a href="#alerts">Alerts</a>
          <a href="#ai">AI Assistant</a>
        </div>
      </nav>

      {/* Hero & Global Search Section */}
      <section id="home" className="hero">
        <div className="hero-content">
          <h1>
            Track Any Road.
            <span> Save Time.</span>
          </h1>
          <p>
            Real-time interactive road congestion &amp; GPS live traffic tracking for every street and city.
          </p>

          {/* Search Input with Live Autocomplete */}
          <div className="search-container">
            <div className="search">
              <input
                type="text"
                placeholder="Search any road, street, or city (e.g. Broadway, Marine Drive, MG Road, Paris)..."
                value={locationInput}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setShowSuggestions(false);
                    executeLocationSearch(locationInput);
                  }
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
              />

              <button
                type="button"
                className="search-submit-btn"
                onClick={() => {
                  setShowSuggestions(false);
                  executeLocationSearch(locationInput);
                }}
                disabled={loading}
              >
                {loading ? "Searching..." : "Search Road"}
              </button>

              <button
                type="button"
                className="gps-quick-btn"
                onClick={handleLocateMe}
                title="Detect My Current GPS Location"
                disabled={isLocating}
              >
                {isLocating ? "📡 ..." : "📍 GPS"}
              </button>
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map((item) => (
                  <div
                    key={item.place_id}
                    className="suggestion-item"
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <span className="suggestion-icon">
                      {item.type === "city" || item.class === "boundary"
                        ? "🏙️"
                        : item.class === "highway"
                        ? "🛣️"
                        : "📍"}
                    </span>
                    <div className="suggestion-text">
                      <strong>{item.name || item.display_name.split(",")[0]}</strong>
                      <small>{item.display_name}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick City / Current Location Chips */}
          <div className="quick-tags">
            <span className="quick-tags-label">Quick Jump:</span>
            {popularCities.map((item) => (
              <button
                key={item.name}
                type="button"
                className={`tag-btn ${item.isGps ? "tag-btn-gps" : ""}`}
                onClick={() => {
                  if (item.isGps) {
                    handleLocateMe();
                  } else {
                    setLocationInput(item.name);
                    executeLocationSearch(item.name, item.lat, item.lng);
                  }
                }}
              >
                {item.name}
              </button>
            ))}
          </div>

          {/* Search Result Card */}
          {searchResult && (
            <div className="search-result-card">
              <div className="result-header">
                <span className="result-icon">{getStatusIcon(searchResult.status)}</span>
                <div>
                  <h3>{searchResult.location}</h3>
                  <span className={`status-badge status-${searchResult.status.toLowerCase()}`}>
                    {searchResult.status === "Heavy"
                      ? "🔴 Busy / Congested Road"
                      : searchResult.status === "Moderate"
                      ? "🟡 Moderate Traffic"
                      : "🟢 Free Flowing Road"}
                  </span>
                </div>
              </div>

              <div className="result-details">
                <p><strong>Average Speed:</strong> {searchResult.speed} km/h</p>
                <p><strong>Estimated Delay:</strong> {searchResult.delayMinutes || 0} mins</p>
                <p><strong>Transit Status:</strong> {getStatusAdvice(searchResult.status)}</p>
              </div>

              <button
                className="clear-result-btn"
                onClick={() => {
                  setSearchResult(null);
                  setLocationInput("");
                }}
              >
                ✕ Close Result
              </button>
            </div>
          )}

          {message && <p className="message">{message}</p>}
        </div>
      </section>

      {/* Interactive Real Leaflet Map Section */}
      <section id="map" className="map-section-container">
        <div className="section-title-wrap">
          <h2>🗺️ Live Interactive Traffic Map</h2>
          <p>
            Real-world road network with busy (🔴), moderate (🟡), and clear (🟢) traffic flow. Click on any road segment for speed &amp; delay metrics.
          </p>
        </div>

        <TrafficMap
          center={mapCenter}
          zoom={mapZoom}
          userLocation={userLocation}
          roads={currentRoads}
          cityName={activeCityName}
          onLocateMe={handleLocateMe}
          isLocating={isLocating}
          onRefreshRoads={() =>
            fetchRoadsForCoordinates(mapCenter[0], mapCenter[1], activeCityName)
          }
        />
      </section>

      {/* Interactive Road Traffic Dashboard Section */}
      <section id="traffic" className="container dashboard-section">
        <div className="dashboard-header">
          <h2>🚦 Live Road Traffic Dashboard ({activeCityName})</h2>
          <p className="dashboard-sub">
            Real-time speed, congestion percentage, and delay metrics for all monitored corridors in {activeCityName}.
          </p>

          {/* 1. Dashboard Summary Stats Bar */}
          <div className="dash-stats-bar">
            <div className="stat-card">
              <span className="stat-number">{totalCount}</span>
              <span className="stat-label">Total Corridors</span>
            </div>
            <div className="stat-card stat-clear">
              <span className="stat-number">🟢 {clearCount}</span>
              <span className="stat-label">Smooth Flow</span>
            </div>
            <div className="stat-card stat-moderate">
              <span className="stat-number">🟡 {moderateCount}</span>
              <span className="stat-label">Moderate Slow</span>
            </div>
            <div className="stat-card stat-heavy">
              <span className="stat-number">🔴 {busyCount}</span>
              <span className="stat-label">Busy / Congested</span>
            </div>
            <div className="stat-card stat-speed">
              <span className="stat-number">⚡ {avgSpeed} km/h</span>
              <span className="stat-label">City Avg Speed</span>
            </div>
          </div>

          {/* 2. Dashboard Controls & Toolbar */}
          <div className="dash-toolbar">
            {/* Filter Tabs */}
            <div className="dash-filter-tabs">
              <button
                className={`tab-btn ${dashFilter === "ALL" ? "tab-active" : ""}`}
                onClick={() => setDashFilter("ALL")}
              >
                All Roads ({totalCount})
              </button>
              <button
                className={`tab-btn tab-btn-clear ${dashFilter === "Low" ? "tab-active" : ""}`}
                onClick={() => setDashFilter("Low")}
              >
                🟢 Smooth ({clearCount})
              </button>
              <button
                className={`tab-btn tab-btn-moderate ${dashFilter === "Moderate" ? "tab-active" : ""}`}
                onClick={() => setDashFilter("Moderate")}
              >
                🟡 Moderate ({moderateCount})
              </button>
              <button
                className={`tab-btn tab-btn-heavy ${dashFilter === "Heavy" ? "tab-active" : ""}`}
                onClick={() => setDashFilter("Heavy")}
              >
                🔴 Busy ({busyCount})
              </button>
            </div>

            {/* Controls Right Group */}
            <div className="dash-controls-right">
              {/* Dashboard Search Input */}
              <div className="dash-search-box">
                <input
                  type="text"
                  placeholder="🔍 Filter dashboard roads..."
                  value={dashSearchQuery}
                  onChange={(e) => setDashSearchQuery(e.target.value)}
                />
                {dashSearchQuery && (
                  <button className="dash-clear-search" onClick={() => setDashSearchQuery("")}>
                    ✕
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <select
                className="dash-sort-select"
                value={dashSort}
                onChange={(e) => setDashSort(e.target.value)}
              >
                <option value="speed_desc">⚡ Speed: Fastest first</option>
                <option value="speed_asc">🐢 Speed: Slowest first</option>
                <option value="delay_desc">⏱️ Highest Delays</option>
                <option value="name_asc">🔤 Name (A-Z)</option>
              </select>

              {/* Live Auto Refresh Switch */}
              <button
                type="button"
                className={`auto-refresh-toggle ${autoRefresh ? "auto-refresh-active" : ""}`}
                onClick={() => setAutoRefresh(!autoRefresh)}
                title="Automatically refresh traffic metrics every 10 seconds"
              >
                <span className="live-dot"></span>
                {autoRefresh ? "Live 10s Active" : "Enable Auto-Refresh"}
              </button>
            </div>
          </div>
        </div>

        {/* 3. Dashboard Cards Grid */}
        {displayRoads.length > 0 ? (
          <div className="cards">
            {displayRoads.map((item) => {
              const roadId = item.id || item._id;
              const isSelected = selectedRoadId === roadId;
              const speedPct = Math.min(Math.round((item.speed / 100) * 100), 100);
              const congestionPct = item.congestionIndex || (item.status === 'Heavy' ? 82 : item.status === 'Moderate' ? 48 : 12);

              return (
                <div
                  className={`card card-interactive ${
                    item.status === "Heavy" ? "card-status-heavy" : ""
                  } ${isSelected ? "card-highlight" : ""}`}
                  key={roadId}
                  onClick={() => handleInspectRoad(item)}
                >
                  <div className="card-top-header">
                    <span className="traffic-icon">{getStatusIcon(item.status)}</span>
                    <span className={`status-badge status-${item.status.toLowerCase()}`}>
                      {item.status === "Heavy" ? "🔴 Busy Jam" : item.status === "Moderate" ? "🟡 Moderate" : "🟢 Free Flow"}
                    </span>
                  </div>

                  <h3>{item.name}</h3>
                  <span className="road-type-tag">
                    {item.roadType === "motorway" ? "🛣️ Motorway / Highway" : item.roadType === "primary" ? "🚘 Primary Arterial" : "🚗 Connecting Road"}
                  </span>

                  {/* Speed Bar Gauge */}
                  <div className="metric-row">
                    <div className="metric-label">
                      <span>Speed</span>
                      <strong>{item.speed} km/h</strong>
                    </div>
                    <div className="metric-bar-bg">
                      <div
                        className={`metric-bar-fill fill-${item.status.toLowerCase()}`}
                        style={{ width: `${speedPct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Congestion Percentage Bar */}
                  <div className="metric-row">
                    <div className="metric-label">
                      <span>Congestion</span>
                      <strong>{congestionPct}%</strong>
                    </div>
                    <div className="metric-bar-bg">
                      <div
                        className={`metric-bar-fill fill-congestion-${item.status.toLowerCase()}`}
                        style={{ width: `${congestionPct}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="card-footer-info">
                    <span className="card-delay-tag">
                      {item.delayMinutes > 0 ? `⏱️ +${item.delayMinutes} min delay` : "⚡ On Time"}
                    </span>
                    <button
                      type="button"
                      className="inspect-map-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInspectRoad(item);
                      }}
                    >
                      Inspect Map 🗺️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-empty-state">
            <span className="empty-icon">🔍</span>
            <h3>No Roads Match Your Filter</h3>
            <p>Try switching filter tabs or clearing your dashboard search query.</p>
            <button
              className="reset-filter-btn"
              onClick={() => {
                setDashFilter("ALL");
                setDashSearchQuery("");
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </section>

      {/* Report Traffic Section */}
      <section id="report" className="container report-section">
        <h2>📝 Report Road Traffic</h2>
        <p className="report-desc">
          Contribute real-time condition updates for any road in <strong>{activeCityName}</strong>.
        </p>

        <form onSubmit={handleCreateReport} className="report-form">
          <input
            type="text"
            placeholder="Road name (e.g. Ring Road, Grand Trunk)"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />

          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            <option value="Low">🟢 Low / Clear (Speed 60+ km/h)</option>
            <option value="Moderate">🟡 Moderate / Slow (Speed 35-55 km/h)</option>
            <option value="Heavy">🔴 Heavy / Busy Road (Speed &lt;25 km/h)</option>
          </select>

          <input
            type="number"
            placeholder="Speed (km/h)"
            value={newSpeed}
            onChange={(e) => setNewSpeed(e.target.value)}
          />

          <button type="submit">Submit Road Report</button>
        </form>

        {reportMsg && <p className="report-msg">{reportMsg}</p>}
      </section>

      {/* Real-Time Alerts */}
      <section id="alerts" className="container">
        <h2>🚨 Live Traffic Alerts ({activeCityName})</h2>

        {currentRoads
          .filter((r) => r.status === "Heavy")
          .map((r) => (
            <div className="alert alert-heavy" key={r.id}>
              🛑 <strong>Heavy Congestion on {r.name}:</strong> Average speed {r.speed} km/h with an estimated {r.delayMinutes || 15} minute delay. Avoid or take alternative corridors.
            </div>
          ))}

        <div className="alert">🚧 Road maintenance &amp; lane closure reported on primary connecting corridors.</div>
        <div className="alert">🚗 High vehicle volume near central transit hubs.</div>
        <div className="alert">🚦 Signal timing optimization active across major junctions.</div>
      </section>

      {/* AI Assistant Section */}
      <section id="ai" className="ai">
        <h2>🤖 AI Traffic Assistant</h2>
        <p>Get instant streaming smart route suggestions &amp; congestion analysis for {activeCityName}.</p>

        {/* AI Quick Prompt Buttons */}
        <div className="ai-prompts">
          <button
            type="button"
            className="ai-chip"
            onClick={() => askAiAssistant("Analyze Live Traffic")}
            disabled={aiLoading}
          >
            ⚡ Analyze Live Traffic
          </button>
          <button
            type="button"
            className="ai-chip"
            onClick={() => askAiAssistant("What are the fastest clear routes?")}
            disabled={aiLoading}
          >
            🟢 Fastest Clear Routes
          </button>
          <button
            type="button"
            className="ai-chip"
            onClick={() => askAiAssistant("Which roads should I avoid?")}
            disabled={aiLoading}
          >
            🛑 Roads to Avoid
          </button>
          <button
            type="button"
            className="ai-chip"
            onClick={() => askAiAssistant("When is the best departure time?")}
            disabled={aiLoading}
          >
            ⏱️ Best Departure Time
          </button>
        </div>

        {/* Custom Question Input */}
        <div className="ai-input-wrap">
          <input
            type="text"
            placeholder="Ask AI anything about routes or traffic (e.g. Is Airport Road clear?)..."
            value={aiPromptInput}
            onChange={(e) => setAiPromptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") askAiAssistant();
            }}
          />
          <button
            type="button"
            onClick={() => askAiAssistant()}
            disabled={aiLoading}
          >
            {aiLoading ? "Thinking..." : "Ask AI"}
          </button>
        </div>

        {/* AI Response Card */}
        {aiResponse && (
          <div className="ai-response-box">
            <div className="ai-response-header">
              <span>🤖 AI Traffic Advisor {isStreaming && <span className="ai-streaming-badge">● Streaming Live...</span>}</span>
              {aiResponse.avgSpeed > 0 && (
                <span className="ai-speed-tag">Avg Speed: {aiResponse.avgSpeed} km/h</span>
              )}
            </div>

            <p className="ai-answer-text">
              {aiResponse.answer}
              {isStreaming && <span className="streaming-cursor">▋</span>}
            </p>

            {aiResponse.recommendedRoutes && aiResponse.recommendedRoutes.length > 0 && (
              <div className="ai-route-group">
                <strong>🟢 Recommended Clear Corridors:</strong>
                <div className="ai-pills">
                  {aiResponse.recommendedRoutes.map((r, i) => (
                    <span className="ai-pill pill-clear" key={i}>
                      🛣️ {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiResponse.avoidRoads && aiResponse.avoidRoads.length > 0 && (
              <div className="ai-route-group">
                <strong>🔴 High Congestion (Avoid):</strong>
                <div className="ai-pills">
                  {aiResponse.avoidRoads.map((r, i) => (
                    <span className="ai-pill pill-avoid" key={i}>
                      🛑 {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiResponse.departureAdvice && (
              <div className="ai-departure-box">
                💡 <strong>Smart Departure Advice:</strong> {aiResponse.departureAdvice}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer>
        <h3>🚦 SmartTraffic Live</h3>
        <p>Real-time road monitoring, GPS geolocation &amp; global street navigation</p>
      </footer>
    </div>
  );
}