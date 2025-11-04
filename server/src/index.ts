import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { appRouter } from "./routes/app.js";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/api", appRouter);

// Log all registered routes (for debugging)
console.log("[SERVER] Routes registered:");
console.log("[SERVER] - POST /api/employees");
console.log("[SERVER] - GET /api/employees");

// 404 handler - log unmatched routes
app.use((req, res, next) => {
  console.log(`[404] ${req.method} ${req.path} - Route not found`);
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(port, () => {
  console.log(`API listening on :${port}`);
});

