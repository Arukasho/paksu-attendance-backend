const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const checkinRoutes = require("./routes/checkin.routes");
const adminEventsRoutes = require("./routes/admin/events.routes");
const adminParticipantsRoutes = require("./routes/admin/participants.routes");
const adminDashboardRoutes = require("./routes/admin/dashboard.routes");

const app = express();

const Sentry = require("@sentry/node");
Sentry.setupExpressErrorHandler(app);

const errorHandler = require("./middleware/errorHandler");

app.set("trust proxy", 1);

const allowedOrigins = [
  "https://absensi-paksu.online",
  "https://www.absens-paksu.online",
  "https://admin.absens-paksu.online",
  "http://localhost:3001",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

app.use(express.json());

// Simple health check — hit this first to confirm the server + DB connection work
app.get("/health", async (req, res) => {
  res.json({ status: "ok" });
});

app.use("/v1/auth", authRoutes);
app.use("/v1/users", usersRoutes);
app.use("/v1/checkin", checkinRoutes);
app.use("/v1/admin/events", adminEventsRoutes);
app.use("/v1/admin/participants", adminParticipantsRoutes);
app.use("/v1/admin/dashboard", adminDashboardRoutes);

// 404 fallback for unmatched routes
app.use((req, res) => {
  res
    .status(404)
    .json({ error: true, code: "not_found", message: "Route not found." });
});

// Must be registered last — catches errors thrown/passed via next(err) anywhere above
app.use(errorHandler);

module.exports = app;
