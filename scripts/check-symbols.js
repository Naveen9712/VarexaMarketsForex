/* =========================================================
   Symbol check:  npm run check:symbols
   ---------------------------------------------------------
   Run once after setting TWELVE_DATA_API_KEY (locally or in
   Render > Shell). It:
     1. requests a quote for every mapped symbol and reports
        OK / not in plan / not found, plus timeliness
     2. searches Twelve Data's commodity list for gold, silver,
        WTI and Brent so you can confirm those symbols
     3. tries the index candidates (SPX, NDX, GDAXI...)
   Uses roughly 20-25 API credits, spread over 3-4 minutes
   to respect the 8-credits-per-minute Basic limit.
   ========================================================= */
"use strict";

const { createClient } = require("../server/twelvedata");
const { loadInstruments } = require("../server/instruments");

const apiKey = (process.env.TWELVE_DATA_API_KEY || "").trim();
if (!apiKey) {
  console.error("Set TWELVE_DATA_API_KEY first, e.g.  TWELVE_DATA_API_KEY=xxxx npm run check:symbols");
  process.exit(1);
}
const client = createClient({ apiKey, baseUrl: process.env.TD_BASE_URL || undefined });
const perMinute = parseInt(process.env.TD_CREDITS_PER_MINUTE, 10) || 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let usedThisMinute = 0;
async function spend(n) {
  if (usedThisMinute + n > perMinute) {
    console.log(`  ...waiting 61 s for the per-minute credit limit`);
    await sleep(61000);
    usedThisMinute = 0;
  }
  usedThisMinute += n;
}

function describe(sym, r) {
  if (r.error) {
    const why = { not_in_plan: "NOT IN YOUR PLAN", not_found: "SYMBOL NOT FOUND" }[r.error.kind] || "ERROR";
    return `${sym.padEnd(10)} ${why}  (${r.error.code || ""} ${r.error.message})`;
  }
  const q = r.quote;
  const lag = q.last_quote_at ? Math.round(Date.now() / 1000 - Number(q.last_quote_at)) : null;
  const timing = q.is_market_open === false ? "market closed" : lag === null ? "no timestamp" : lag <= 240 ? `real-time (last candle ${lag}s ago)` : `DELAYED ~${Math.round(lag / 60)} min`;
  return `${sym.padEnd(10)} OK  ${q.close}  prev close ${q.previous_close}  ${timing}  [${q.name || ""} / ${q.exchange || ""}]`;
}

async function quoteBatch(symbols) {
  const out = {};
  for (let i = 0; i < symbols.length; i += perMinute) {
    const batch = symbols.slice(i, i + perMinute);
    await spend(batch.length);
    try {
      Object.assign(out, (await client.quotes(batch)).results);
    } catch (e) {
      batch.forEach((s) => { out[s] = { error: { kind: e.kind, code: e.code, message: e.message } }; });
      if (e.kind === "auth") throw e;
    }
  }
  return out;
}

(async () => {
  const instruments = loadInstruments();
  const mapped = instruments.filter((i) => i.td);

  console.log("\n1) Mapped symbols");
  const res = await quoteBatch(mapped.map((i) => i.td));
  mapped.forEach((i) => console.log("  " + i.id.padEnd(8) + describe(i.td, res[i.td])));
  instruments.filter((i) => !i.td).forEach((i) => console.log("  " + i.id.padEnd(8) + "(no symbol mapped)"));

  console.log("\n2) Commodity catalogue matches (use these to confirm WTI / Brent / gold / silver)");
  await spend(1);
  try {
    const list = await client.get("/commodities");
    const items = Array.isArray(list.data) ? list.data : [];
    const wanted = /gold|silver|wti|brent|crude/i;
    items.filter((c) => wanted.test(`${c.name} ${c.symbol}`)).forEach((c) => console.log(`  ${String(c.symbol).padEnd(12)} ${c.name}  (${c.category || ""})`));
    if (!items.length) console.log("  (no list returned)");
  } catch (e) {
    console.log(`  Could not read the commodity list: ${e.message}`);
  }

  console.log("\n3) Index candidates");
  const cands = instruments.flatMap((i) => (i.candidates || []).map((c) => ({ id: i.id, sym: c })));
  const ires = await quoteBatch(cands.map((c) => c.sym));
  cands.forEach((c) => console.log("  " + c.id.padEnd(8) + describe(c.sym, ires[c.sym])));

  console.log("\nTo change a symbol, set TD_SYMBOL_OVERRIDES in Render, e.g. {\"brent\":\"XBR/USD\",\"us500\":\"SPX\"}\n");
})().catch((e) => {
  console.error(`\nStopped: ${e.message}`);
  process.exit(1);
});
