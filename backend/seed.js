const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Traffic = require("./models/Traffic");

dotenv.config();

const sampleTraffic = [
  { location: "Main Road", status: "Heavy", speed: 15 },
  { location: "City Center", status: "Heavy", speed: 20 },
  { location: "Airport Road", status: "Low", speed: 65 },
  { location: "Silicon Highway", status: "Moderate", speed: 45 },
  { location: "Downtown Expressway", status: "Low", speed: 70 },
  { location: "Metro Bypass", status: "Moderate", speed: 40 }
];

async function seedDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smarttraffic");
    console.log("Connected to MongoDB for seeding...");

    const count = await Traffic.countDocuments();
    if (count === 0) {
      await Traffic.insertMany(sampleTraffic);
      console.log("✅ Seeded initial traffic data successfully!");
    } else {
      console.log(`Traffic collection already has ${count} records. Skipping seed.`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding error:", err.message);
    process.exit(1);
  }
}

seedDB();
