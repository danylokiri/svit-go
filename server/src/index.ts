import "dotenv/config";
import path from "node:path";
import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { startCleanup } from "./lib/cleanup.js";
import { attachUser } from "./middleware/auth.js";
import { toursRouter } from "./routes/tours.js";
import { authRouter } from "./routes/auth.js";
import { bookingsRouter } from "./routes/bookings.js";
import { savedRouter } from "./routes/saved.js";
import { aiRouter } from "./routes/ai.js";
import { aiTourRouter } from "./routes/ai-tour.js";
import { aiExplainRouter } from "./routes/ai-explain.js";
import { aiCompareRouter } from "./routes/ai-compare.js";
import { reviewsRouter } from "./routes/reviews.js";
import { organizersRouter } from "./routes/organizers.js";
import { organizerCabinetRouter } from "./routes/organizer-cabinet.js";
import { analyticsRouter } from "./routes/analytics.js";
import { currencyRouter } from "./routes/currency.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { adminRouter } from "./routes/admin.js";

const app = express();

// helmet — sane defaults for security headers (X-Content-Type-Options,
// X-Frame-Options, HSTS in prod, no MIME-sniffing, etc). We turn off CSP
// because we don't ship inline policies for a JSON API; the Vercel frontend
// has its own. crossOriginResourcePolicy is loosened so images served from
// /tours/* are usable on the cross-origin frontend domain.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Render sits behind a reverse proxy — without trust proxy, req.ip would
// always be the LB IP and our anon AI rate-limit would collapse to one bucket.
app.set("trust proxy", 1);

app.use(cors({ origin: config.corsOrigin, credentials: true }));
// gzip/brotli — Express has no compression by default. /api/tours alone
// drops from ~12KB to ~2KB on the wire, /api/tours/map-data 8KB → 1.5KB.
// `threshold: 512` skips compression for tiny payloads where the CPU cost
// outweighs the savings.
app.use(compression({ threshold: 512 }));
app.use(express.json({ limit: "1mb" }));
app.use(attachUser);

// Generic per-IP throttle. AI routes have their own tier-based daily cap
// on top; this is a catch-all for cheap traffic-spike abuse (someone
// hammering /api/tours from a script). Authed admins / organisers go
// well above 300/5min during normal cabinet work (photo uploads, batch
// reject, etc.), so the limiter SKIPS them — they already have an
// authenticated identity we trust.
app.use("/api/", rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate limit exceeded — try again later" },
  // attachUser runs BEFORE this in the middleware chain, so userId /
  // organizerId / adminId are populated by the time we hit this skip.
  skip: (req) => {
    const r = req as { userId?: number; organizerId?: number; adminId?: number };
    return !!(r.userId || r.organizerId || r.adminId);
  },
}));

// In production, organizer uploads live on a persistent disk (UPLOADS_DIR)
// outside the bundled frontend assets. We serve them from /tours/* so the
// frontend's <TourImage> picks them up via the same URLs as build-time
// images, no codeshape change required.
if (process.env.UPLOADS_DIR) {
  const uploadsTours = path.resolve(process.env.UPLOADS_DIR, "tours");
  app.use("/tours", express.static(uploadsTours, {
    // Long cache — filenames are content-keyed (hero.webp, gallery-1.webp).
    // When an organizer re-uploads, the URL stays the same so browsers
    // will cache stale; that's acceptable for the demo and a fix would be
    // adding a content hash to the filename.
    maxAge: "30d",
    immutable: false,
  }));
}

// Health
app.get("/", (_req, res) => {
  res.json({ name: "svitgo-api", version: "0.1.0", ok: true });
});

// Routes
app.use("/api/tours", toursRouter);
app.use("/api/auth", authRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/saved", savedRouter);
app.use("/api/ai", aiRouter);
app.use("/api/ai", aiTourRouter);          // mounts /api/ai/ask-tour
app.use("/api/ai", aiExplainRouter);       // mounts /api/ai/explain-pick
app.use("/api/ai", aiCompareRouter);       // mounts /api/ai/compare-analysis
app.use("/api/reviews", reviewsRouter);
app.use("/api/organizers", organizersRouter);
app.use("/api/organizer", organizerCabinetRouter);   // singular = cabinet (owner-only)
app.use("/api/analytics", analyticsRouter);
app.use("/api/currency", currencyRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/admin", adminRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

app.listen(config.port, () => {
  console.log(`✓ svitgo-api listening on http://localhost:${config.port}`);
  // Kick off periodic AiQuery cleanup (retention defined in config.ts).
  startCleanup();
});
