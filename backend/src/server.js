import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { errorHandler, notFound } from "./middlewares/error.middleware.js";
import router from "./routes/index.js";
import { deleteExpiredAnnouncements } from "./services/announcement.service.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

// Comma-separated list of allowed origins; defaults to local Vite dev server.
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));// for pinging server 
app.use("/api", router);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`LCA server running on port ${PORT}`);

  const cleanExpiredAnnouncements = () => deleteExpiredAnnouncements()
    .then((count) => {
      if (count) console.log(`[announcements] removed ${count} expired announcement(s) and their notifications`);
    })
    .catch((error) => console.warn("[announcements] expiry cleanup failed:", error.message));
  cleanExpiredAnnouncements();
  const announcementCleanupTimer = setInterval(cleanExpiredAnnouncements, 60 * 60 * 1000);
  announcementCleanupTimer.unref();
});
