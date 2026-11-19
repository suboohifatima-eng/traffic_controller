const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();


// Middleware
app.use(cors());
app.use(express.json());


// Routes
const trafficRoutes =
  require("./routes/trafficRoutes");

const authRoutes =
  require("./routes/authRoutes");


app.use(
  "/api/traffic",
  trafficRoutes
);

app.use(
  "/api/auth",
  authRoutes
);


// Health check
app.get("/", (req, res) => {

  res.json({
    message:
      "SmartTraffic API is running 🚦"
  });

});


// MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {

    console.log(
      "MongoDB connected successfully"
    );

    app.listen(
      process.env.PORT || 5001,
      () => {

        console.log(
          `Server running on port ${
            process.env.PORT || 5001
          }`
        );

      }
    );

  })
  .catch((error) => {

    console.log(
      "MongoDB connection failed:",
      error.message
    );

  });