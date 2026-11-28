/* =========================================================
   Varexa Markets web server
   ---------------------------------------------------------
   - Serves the website from /public
   - GET /api/quotes  -> cached Twelve Data quotes (no API key inside)
   - GET /api/health  -> simple health check for Render

   Environment variables (set them in Render > Environment):
     TWELVE_DATA_API_KEY        required, secret
     TD_CREDITS_PER_MINUTE      default 8   (Basic plan)
     TD_DAILY_CREDITS           default 800 (Basic plan; 0 = no daily cap)
     TD_MIN_REFRESH_SECONDS     default 60
     TD_CLOSED_REFRESH_SECONDS  default 3600
     TD_SYMBOL_OVERRIDES        optional JSON, e.g. {"brent":"XBR/USD"}
     TD_BASE_URL                optional, for testing against a mock server
     PORT                       set by Render
   ========================================================= */
"use strict";

const path = require("path");
const express = require("express");
const { createClient } = require("./twelvedata");
const { QuoteService } = require("./quote-service");
const { loadInstruments } = require("./instruments");

const env = process.env;
const intEnv = (name, fallback) => {
  const v = parseInt(env[name], 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

const apiKey = (env.TWELVE_DATA_API_KEY || "").trim();
if (!apiKey) console.warn("[server] TWELVE_DATA_API_KEY is not set. The site will load, but prices will show as unavailable.");

const client = createClient({ apiKey, baseUrl: env.TD_BASE_URL || undefined });
const service = new QuoteService({
  client,
  instruments: loadInstruments(env),
  configured: Boolean(apiKey),
  creditsPerMinute: intEnv("TD_CREDITS_PER_MINUTE", 8),
  dailyCredits: intEnv("TD_DAILY_CREDITS", 800),
  minRefreshSec: intEnv("TD_MIN_REFRESH_SECONDS", 60),
  closedRefreshSec: intEnv("TD_CLOSED_REFRESH_SECONDS", 3600),
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/api/quotes", (req, res) => {
  // Served from memory: visitor requests never reach Twelve Data and never use credits.
  res.set("Cache-Control", "public, max-age=15");
  res.json(service.snapshot());
});

app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, pricesConfigured: Boolean(apiKey), lastQuoteUpdate: service.lastSuccessAt });
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, {
  dotfiles: "ignore",
  extensions: ["html"],
  setHeaders(res, filePath) {
    // HTML always revalidates; versioned CSS/JS and images can be cached
    if (filePath.endsWith(".html")) res.set("Cache-Control", "no-cache");
    else res.set("Cache-Control", "public, max-age=86400");
  },
}));

app.use((req, res) => res.status(404).type("text/plain").send("Page not found"));

const port = intEnv("PORT", 3000);
const server = app.listen(port, () => {
  console.log(`[server] Varexa Markets listening on port ${port}`);
  service.start();
});

const shutdown = () => { service.stop(); server.close(() => process.exit(0)); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
