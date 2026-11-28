/* =========================================================
   Local mock of the Twelve Data /quote endpoint (development only)
   ---------------------------------------------------------
   Lets you run the site without spending API credits:
     terminal 1:  npm run mock
     terminal 2:  TWELVE_DATA_API_KEY=test TD_BASE_URL=http://localhost:4010 npm start

   Switch scenario at runtime:
     curl -X POST "http://localhost:4010/__scenario?name=minute_limit"
   Scenarios: normal | weekend | minute_limit | daily_limit | bad_key | down | delayed
   In "normal", commodities answer 403 (not in plan) like the Basic plan,
   and index symbols answer 404.
   Prices are made up and move a little on each request.
   ========================================================= */
"use strict";

const http = require("http");

const BASE = {
  "EUR/USD": 1.0862, "GBP/USD": 1.2934, "USD/JPY": 149.82, "AUD/USD": 0.6571, "USD/CHF": 0.8823,
  "XAU/USD": 3912.4, "XAG/USD": 47.85, "WTI/USD": 68.42, "XBR/USD": 72.1,
  AAPL: 228.4, TSLA: 252.1, NVDA: 178.3,
};
const STOCKS = new Set(["AAPL", "TSLA", "NVDA"]);
const PLAN_BLOCKED = new Set((process.env.MOCK_BLOCKED || "XAU/USD,XAG/USD,WTI/USD,XBR/USD").split(",").filter(Boolean));

let scenario = process.env.MOCK_SCENARIO || "normal";
let calls = 0;
let creditsUsed = 0;
const err = (code, message) => ({ code, message, status: "error" });

function quoteFor(sym, nowSec) {
  if (!(sym in BASE)) return err(404, `**symbol** ${sym} not found`);
  if (scenario !== "all_allowed" && PLAN_BLOCKED.has(sym)) return err(403, `${sym} is available starting with the Grow plan.`);
  BASE[sym] *= 1 + (Math.random() - 0.5) * 0.001;
  const close = BASE[sym];
  const prev = close * (1 - 0.004);
  const open = scenario === "weekend" ? false : !(STOCKS.has(sym) && scenario === "stocks_closed");
  const lag = scenario === "delayed" ? 20 * 60 : 60;
  return {
    symbol: sym, name: sym, exchange: STOCKS.has(sym) ? "NASDAQ" : "Forex", currency: "USD",
    datetime: new Date(nowSec * 1000).toISOString().slice(0, 10), timestamp: nowSec - 3600, last_quote_at: nowSec - lag,
    open: String(prev), high: String(close * 1.002), low: String(prev * 0.998), close: String(close),
    previous_close: String(prev), change: String(close - prev), percent_change: String(((close - prev) / prev) * 100),
    is_market_open: open,
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (status, body, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };

  if (url.pathname === "/__scenario") { scenario = url.searchParams.get("name") || "normal"; return send(200, { scenario }); }
  if (url.pathname === "/__stats") return send(200, { scenario, calls, creditsUsed });
  if (url.pathname !== "/quote") return send(404, err(404, "Not found"));

  calls += 1;
  if (req.headers.authorization !== "apikey test" && !req.headers.authorization?.startsWith("apikey ")) return send(401, err(401, "**apikey** parameter is incorrect or not specified."));
  if (url.searchParams.has("apikey")) return send(400, err(400, "Mock: the key must be sent in the header, not the URL."));
  if (scenario === "bad_key") return send(401, err(401, "**apikey** parameter is incorrect or not specified."));
  if (scenario === "minute_limit") return send(429, err(429, "You have run out of API credits for the current minute. 9 API credits were used, with the current limit being 8."));
  if (scenario === "daily_limit") return send(429, err(429, "You have run out of API credits for the day. 801 API credits were used, with the current limit being 800."));
  if (scenario === "down") return send(500, err(500, "Internal server error"));

  const symbols = (url.searchParams.get("symbol") || "").split(",").filter(Boolean);
  creditsUsed += symbols.length;
  const nowSec = Math.floor(Date.now() / 1000);
  const headers = { "api-credits-used": String(symbols.length), "api-credits-left": String(Math.max(0, 8 - symbols.length)) };
  if (symbols.length === 1) {
    const q = quoteFor(symbols[0], nowSec);
    return send(200, q, headers); // Twelve Data returns errors for a single symbol as the body
  }
  const out = {};
  for (const s of symbols) out[s] = quoteFor(s, nowSec);
  return send(200, out, headers);
});

const port = Number(process.env.MOCK_PORT || 4010);
server.listen(port, () => console.log(`[mock] Twelve Data mock on http://localhost:${port} (scenario: ${scenario})`));
