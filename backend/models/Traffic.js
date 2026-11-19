const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
  location: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["Low", "Moderate", "Heavy"],
    required: true
  },
  speed: {
    type: Number,
    required: true
  },
  latitude: {
    type: Number
  },
  longitude: {
    type: Number
  },
  city: {
    type: String
  },
  roadType: {
    type: String,
    default: "primary"
  },
  delayMinutes: {
    type: Number,
    default: 0
  },
  congestionIndex: {
    type: Number,
    min: 0,
    max: 100
  },
  reportedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for geo/location search
trafficSchema.index({ location: 1 });
trafficSchema.index({ latitude: 1, longitude: 1 });

module.exports = mongoose.models.Traffic || mongoose.model("Traffic", trafficSchema);