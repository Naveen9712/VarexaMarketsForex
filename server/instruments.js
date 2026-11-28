/* =========================================================
   Instrument map: website id  ->  Twelve Data symbol
   ---------------------------------------------------------
   The ids match INSTRUMENTS in public/script.js.

   td: the Twelve Data symbol, or null when Twelve Data has no
       self-serve feed for that instrument. A null instrument is
       shown on the site as "unavailable" and never requested.

   assetClass decides what Twelve Data says about timeliness:
     forex, us_stock -> real-time on every plan, including Basic
     commodity       -> market data needs Grow or higher; delay
                        is not stated, so it is measured instead
     index           -> not offered on self-serve plans

   verify: true marks a symbol to confirm once with
   `npm run check:symbols` (Twelve Data does not publish these
   symbols in its public docs).

   Change a symbol without editing code by setting the
   TD_SYMBOL_OVERRIDES environment variable, for example:
     {"brent":"XBR/USD","us500":"SPX"}
   An empty string or null switches an instrument off.
   ========================================================= */
"use strict";

const INSTRUMENTS = [
  // Forex
  { id: "eurusd", td: "EUR/USD", assetClass: "forex" },
  { id: "gbpusd", td: "GBP/USD", assetClass: "forex" },
  { id: "usdjpy", td: "USD/JPY", assetClass: "forex" },
  { id: "audusd", td: "AUD/USD", assetClass: "forex" },
  { id: "usdchf", td: "USD/CHF", assetClass: "forex" },

  // Metals (spot)
  { id: "xauusd", td: "XAU/USD", assetClass: "commodity" },
  { id: "xagusd", td: "XAG/USD", assetClass: "commodity" },

  // Energies (spot)
  { id: "wti", td: "WTI/USD", assetClass: "commodity", verify: true },
  { id: "brent", td: "XBR/USD", assetClass: "commodity", verify: true },

  // Indices: no self-serve index feed at Twelve Data.
  // An ETF (SPY, QQQ) is a different instrument with a different price,
  // so it is not used as a stand-in.
  { id: "us500", td: null, assetClass: "index", candidates: ["SPX", "GSPC"] },
  { id: "ustec", td: null, assetClass: "index", candidates: ["NDX", "IXIC"] },
  { id: "ger40", td: null, assetClass: "index", candidates: ["GDAXI", "DAX"] },

  // US stocks (the site shows them as stock CFDs)
  { id: "aapl", td: "AAPL", assetClass: "us_stock" },
  { id: "tsla", td: "TSLA", assetClass: "us_stock" },
  { id: "nvda", td: "NVDA", assetClass: "us_stock" },
];

/** What Twelve Data advertises for each asset class (used when a quote has no timestamp to measure). */
const ADVERTISED_FEED = {
  forex: "realtime",
  us_stock: "realtime",
  commodity: "unspecified",
  index: "unspecified",
};

function loadInstruments(env = process.env) {
  let overrides = {};
  if (env.TD_SYMBOL_OVERRIDES) {
    try {
      overrides = JSON.parse(env.TD_SYMBOL_OVERRIDES);
    } catch (e) {
      console.warn("[instruments] TD_SYMBOL_OVERRIDES is not valid JSON and was ignored.");
    }
  }
  return INSTRUMENTS.map((i) => {
    const out = { ...i };
    if (Object.prototype.hasOwnProperty.call(overrides, i.id)) {
      const v = overrides[i.id];
      out.td = typeof v === "string" && v.trim() ? v.trim() : null;
    }
    return out;
  });
}

module.exports = { INSTRUMENTS, ADVERTISED_FEED, loadInstruments };
