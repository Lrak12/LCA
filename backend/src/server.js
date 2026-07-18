import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { errorHandler, notFound } from "./middlewares/error.middleware.js";
import router from "./routes/index.js";

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

app.use("/api", router);

app.use(notFound);
app.use(errorHandler);
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));
app.listen(PORT, () => {
  console.log(`LCA server running on port ${PORT}`);
  
});