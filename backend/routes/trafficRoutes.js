const express = require("express");
const Traffic = require("../models/Traffic");

const router = express.Router();

// Helper: Calculate simulated traffic properties
function calculateTrafficStats(statusOverride) {
  const statuses = ["Low", "Moderate", "Heavy"];
  const status = statusOverride || statuses[Math.floor(Math.random() * statuses.length)];
  let speed;
  let delayMinutes;
  let congestionIndex;

  if (status === "Low") {
    speed = Math.floor(Math.random() * 25) + 60; // 60-85 km/h
    delayMinutes = 0;
    congestionIndex = Math.floor(Math.random() * 25) + 5; // 5-30%
  } else if (status === "Moderate") {
    speed = Math.floor(Math.random() * 20) + 35; // 35-55 km/h
    delayMinutes = Math.floor(Math.random() * 10) + 5; // 5-15 mins
    congestionIndex = Math.floor(Math.random() * 30) + 35; // 35-65%
  } else {
    speed = Math.floor(Math.random() * 15) + 10; // 10-25 km/h
    delayMinutes = Math.floor(Math.random() * 25) + 15; // 15-40 mins
    congestionIndex = Math.floor(Math.random() * 30) + 70; // 70-100%
  }

  return { status, speed, delayMinutes, congestionIndex };
}

// 1. Get all traffic reports
router.get("/", async (req, res) => {
  try {
    const traffic = await Traffic.find().sort({ reportedAt: -1 }).limit(50);
    res.json(traffic);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// 2. Get traffic nearby coordinates
router.get("/nearby", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const range = parseFloat(req.query.range) || 0.08; // ~8-10 km

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Valid lat and lng query params are required" });
    }

    const nearby = await Traffic.find({
      latitude: { $gte: lat - range, $lte: lat + range },
      longitude: { $gte: lng - range, $lte: lng + range }
    }).sort({ reportedAt: -1 });

    res.json(nearby);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// 3. Generate or fetch real-time road congestion network around coordinates
router.post("/roads", async (req, res) => {
  try {
    const { lat, lng, cityName, roadsList } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "lat and lng are required in body" });
    }

    const centerLat = Number(lat);
    const centerLng = Number(lng);

    const baseNames = Array.isArray(roadsList) && roadsList.length > 0
      ? roadsList
      : [
          "Expressway",
          "Central Avenue",
          "Ring Road",
          "Ring Bypass",
          "Inner Boulevard",
          "Station Link Road",
          "Airport Highway",
          "Riverside Parkway"
        ];

    const roadTemplates = [
      {
        nameSuffix: "North-South Expressway",
        roadType: "motorway",
        status: "Heavy",
        pathOffsets: [
          [-0.015, -0.003],
          [-0.007, -0.001],
          [0.0, 0.0],
          [0.008, 0.002],
          [0.016, 0.004]
        ]
      },
      {
        nameSuffix: "East-West Arterial",
        roadType: "primary",
        status: "Moderate",
        pathOffsets: [
          [-0.003, -0.018],
          [-0.001, -0.009],
          [0.0, 0.0],
          [0.002, 0.01],
          [0.004, 0.02]
        ]
      },
      {
        nameSuffix: "City Ring Road",
        roadType: "primary",
        status: "Low",
        pathOffsets: [
          [-0.012, -0.012],
          [-0.014, 0.0],
          [-0.01, 0.014],
          [0.002, 0.016],
          [0.012, 0.012]
        ]
      },
      {
        nameSuffix: "Market / Metro Link",
        roadType: "secondary",
        status: "Heavy",
        pathOffsets: [
          [0.005, -0.012],
          [0.003, -0.004],
          [0.007, 0.004],
          [0.011, 0.01]
        ]
      },
      {
        nameSuffix: "Airport Highway",
        roadType: "motorway",
        status: "Low",
        pathOffsets: [
          [0.002, 0.008],
          [0.008, 0.018],
          [0.014, 0.026],
          [0.02, 0.035]
        ]
      },
      {
        nameSuffix: "Downtown Boulevard",
        roadType: "secondary",
        status: "Moderate",
        pathOffsets: [
          [-0.008, 0.006],
          [-0.003, 0.003],
          [0.004, -0.002],
          [0.009, -0.007]
        ]
      }
    ];

    const roadsData = roadTemplates.map((tmpl, idx) => {
      const stats = calculateTrafficStats(tmpl.status);
      const name = baseNames[idx] || `${cityName || "City"} ${tmpl.nameSuffix}`;
      const coordinates = tmpl.pathOffsets.map(([dLat, dLng]) => [
        Number((centerLat + dLat).toFixed(6)),
        Number((centerLng + dLng).toFixed(6))
      ]);

      return {
        id: `road-${idx}-${Date.now()}`,
        name,
        roadType: tmpl.roadType,
        status: stats.status,
        speed: stats.speed,
        delayMinutes: stats.delayMinutes,
        congestionIndex: stats.congestionIndex,
        coordinates,
        midpoint: coordinates[Math.floor(coordinates.length / 2)]
      };
    });

    res.json({
      center: [centerLat, centerLng],
      cityName: cityName || "Local Area",
      roads: roadsData
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate road network", error: error.message });
  }
});

// 4. Search traffic by location name
router.get("/:location", async (req, res) => {
  try {
    const rawLocation = (req.params.location || "").trim();
    if (!rawLocation) {
      return res.status(400).json({ message: "Location query is required" });
    }

    const escaped = rawLocation.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

    let traffic = await Traffic.findOne({
      location: {
        $regex: escaped,
        $options: "i"
      }
    });

    if (!traffic) {
      const stats = calculateTrafficStats();
      traffic = await Traffic.create({
        location: rawLocation,
        status: stats.status,
        speed: stats.speed,
        delayMinutes: stats.delayMinutes,
        congestionIndex: stats.congestionIndex
      });
    }

    res.json(traffic);
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});

// 5. Add custom traffic report
router.post("/", async (req, res) => {
  try {
    const { location, status, speed, latitude, longitude, city, roadType } = req.body;
    if (!location || !status || speed === undefined) {
      return res.status(400).json({ message: "location, status, and speed are required" });
    }

    const stats = calculateTrafficStats(status);

    const traffic = await Traffic.create({
      location,
      status,
      speed: Number(speed),
      delayMinutes: stats.delayMinutes,
      congestionIndex: stats.congestionIndex,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      city,
      roadType: roadType || "primary"
    });

    res.status(201).json(traffic);
  } catch (error) {
    res.status(500).json({
      message: "Could not create report",
      error: error.message
    });
  }
});

// 6. AI Traffic Assistant route analysis
router.post("/ai-assistant", async (req, res) => {
  try {
    const { cityName, roads = [], userQuery } = req.body;

    const city = cityName || "your location";

    const heavyRoads = roads.filter((r) => r.status === "Heavy");
    const moderateRoads = roads.filter((r) => r.status === "Moderate");
    const clearRoads = roads.filter((r) => r.status === "Low");

    const totalRoads = roads.length || 1;
    const avgSpeed = Math.round(
      roads.reduce((acc, r) => acc + (r.speed || 50), 0) / totalRoads
    );

    let answer = "";
    let recommendedRoutes = clearRoads.map((r) => r.name);
    let avoidRoads = heavyRoads.map((r) => r.name);
    let departureAdvice = "";

    const queryLower = (userQuery || "").toLowerCase();

    if (queryLower.includes("avoid") || queryLower.includes("busy") || queryLower.includes("congest")) {
      if (heavyRoads.length > 0) {
        answer = `In ${city}, expect major congestion on ${heavyRoads.map((r) => r.name).join(", ")}. Speeds there have dropped to ~${heavyRoads[0].speed} km/h.`;
      } else {
        answer = `Great news! No severe congestion reported across major corridors in ${city} right now.`;
      }
      departureAdvice = "Bypass central corridors to avoid sudden bottlenecks.";
    } else if (queryLower.includes("fast") || queryLower.includes("clear") || queryLower.includes("best") || queryLower.includes("route")) {
      if (clearRoads.length > 0) {
        answer = `The fastest clear routes in ${city} right now are ${clearRoads.map((r) => r.name).join(", ")}, with speeds averaging ${clearRoads[0].speed} km/h.`;
      } else {
        answer = `Traffic is moderate across ${city}. Secondary bypass routes are performing better than main arterials.`;
      }
      departureAdvice = "Optimal time to depart is within the next 15 minutes while highway flow remains green.";
    } else if (queryLower.includes("time") || queryLower.includes("depart") || queryLower.includes("leave") || queryLower.includes("when")) {
      if (heavyRoads.length > 0) {
        answer = `Peak congestion is active in ${city} near ${heavyRoads[0].name}. Leaving in 25–30 minutes will save you approx ${heavyRoads[0].delayMinutes || 15} minutes of travel time.`;
        departureAdvice = "Delay departure by 25 mins or switch to clear bypass corridors.";
      } else {
        answer = `Road conditions in ${city} are flowing smoothly right now (Average speed: ${avgSpeed} km/h). Ideal time to leave is immediately!`;
        departureAdvice = "Depart now to lock in optimal green travel times.";
      }
    } else {
      if (heavyRoads.length > 0) {
        answer = `AI Traffic Analysis for ${city}: ${heavyRoads.length} road(s) are experiencing heavy congestion (${heavyRoads.map((r) => r.name).join(", ")}). Average network speed is ${avgSpeed} km/h.`;
        departureAdvice = "Use green corridors or delay commute slightly to avoid peak bottlenecks.";
      } else {
        answer = `AI Traffic Analysis for ${city}: Traffic is moving smoothly across all monitored routes with an average network speed of ${avgSpeed} km/h!`;
        departureAdvice = "All routes green. Enjoy smooth driving!";
      }
    }

    if (recommendedRoutes.length === 0) {
      recommendedRoutes = clearRoads.length > 0 ? clearRoads.map(r => r.name) : ["Outer Ring Bypass", "Secondary Link Road"];
    }

    res.json({
      cityName: city,
      query: userQuery || "General Traffic Overview",
      answer,
      recommendedRoutes,
      avoidRoads,
      departureAdvice,
      avgSpeed,
      congestionLevel: heavyRoads.length > 1 ? "Heavy" : heavyRoads.length === 1 ? "Moderate" : "Low"
    });
  } catch (error) {
    res.status(500).json({ message: "AI assistant processing error", error: error.message });
  }
});

// 7. Streaming Server-Sent Events AI Chatbot endpoint
router.post("/ai-assistant/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { cityName, roads = [], userQuery } = req.body;
    const city = cityName || "your location";

    const heavyRoads = roads.filter((r) => r.status === "Heavy");
    const moderateRoads = roads.filter((r) => r.status === "Moderate");
    const clearRoads = roads.filter((r) => r.status === "Low");

    const totalRoads = roads.length || 1;
    const avgSpeed = Math.round(
      roads.reduce((acc, r) => acc + (r.speed || 50), 0) / totalRoads
    );

    let fullAnswer = "";
    const queryLower = (userQuery || "").toLowerCase();

    if (queryLower.includes("avoid") || queryLower.includes("busy") || queryLower.includes("congest")) {
      if (heavyRoads.length > 0) {
        fullAnswer = `In ${city}, expect major delays on ${heavyRoads.map((r) => r.name).join(", ")}. Average speeds there have dropped to ${heavyRoads[0].speed} km/h with estimated delays of +${heavyRoads[0].delayMinutes || 15} minutes. Recommend using clear bypass corridors instead.`;
      } else {
        fullAnswer = `Great news! No severe congestion reported across major corridors in ${city} right now. All primary routes are operating at optimal flow.`;
      }
    } else if (queryLower.includes("fast") || queryLower.includes("clear") || queryLower.includes("best") || queryLower.includes("route")) {
      if (clearRoads.length > 0) {
        fullAnswer = `The fastest clear routes in ${city} right now are ${clearRoads.map((r) => r.name).join(", ")}, with speeds averaging ${clearRoads[0].speed} km/h. Transit times along these corridors remain optimal.`;
      } else {
        fullAnswer = `Traffic is moderate across ${city}. Secondary bypass routes are currently performing better than main arterial expressways.`;
      }
    } else if (queryLower.includes("time") || queryLower.includes("depart") || queryLower.includes("leave") || queryLower.includes("when")) {
      if (heavyRoads.length > 0) {
        fullAnswer = `Peak congestion is active in ${city} near ${heavyRoads[0].name}. Delaying your departure by 25–30 minutes will allow traffic bottlenecks to clear, saving you approx ${heavyRoads[0].delayMinutes || 15} minutes of commute time.`;
      } else {
        fullAnswer = `Road conditions in ${city} are flowing smoothly right now with an average network speed of ${avgSpeed} km/h. The ideal time to leave is immediately!`;
      }
    } else {
      if (heavyRoads.length > 0) {
        fullAnswer = `AI Traffic Analysis for ${city}: ${heavyRoads.length} road(s) are experiencing heavy congestion (${heavyRoads.map((r) => r.name).join(", ")}). Average network speed is ${avgSpeed} km/h. Recommend using green corridors.`;
      } else {
        fullAnswer = `AI Traffic Analysis for ${city}: All monitored routes are moving smoothly with an average network speed of ${avgSpeed} km/h and zero active delays. Perfect driving conditions!`;
      }
    }

    const recommendedRoutes = clearRoads.length > 0 ? clearRoads.map((r) => r.name) : ["Outer Ring Bypass", "Secondary Link Road"];
    const avoidRoads = heavyRoads.map((r) => r.name);
    const departureAdvice = heavyRoads.length > 0
      ? "Delay departure by 25 mins or switch to clear bypass corridors."
      : "Depart now to lock in optimal green travel times.";

    // Metadata event
    res.write(`data: ${JSON.stringify({
      type: "meta",
      cityName: city,
      query: userQuery || "General Traffic Overview",
      recommendedRoutes,
      avoidRoads,
      departureAdvice,
      avgSpeed
    })}\n\n`);

    // Stream tokens word by word
    const words = fullAnswer.split(" ");
    for (let i = 0; i < words.length; i++) {
      const token = (i === 0 ? "" : " ") + words[i];
      res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    res.end();
  }
});

module.exports = router;