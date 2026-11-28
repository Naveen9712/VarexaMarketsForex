"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { QuoteService } = require("../server/quote-service");
const { TwelveDataError } = require("../server/twelvedata");
const { loadInstruments } = require("../server/instruments");

const silent = { log() {}, warn() {}, error() {} };
const T0 = Date.UTC(2026, 10, 25, 12, 0, 0); // a Wednesday, 12:00 UTC

function quote(sym, { open = true, lagSec = 60, nowMs = T0 } = {}) {
  const now = Math.floor(nowMs / 1000);
  return { symbol: sym, close: "1.2000", previous_close: "1.1900", change: "0.01", percent_change: "0.8403", is_market_open: open, last_quote_at: now - lagSec, currency: "USD" };
}

function makeService({ handler, now, ...opts }) {
  const calls = [];
  const client = { quotes: async (symbols) => { calls.push(symbols); return handler(symbols); } };
  const svc = new QuoteService({ client, instruments: loadInstruments({}), logger: silent, now: () => now.t, ...opts });
  return { svc, calls };
}

test("never asks for more symbols per minute than the credit limit", async () => {
  const now = { t: T0 };
  const { svc, calls } = makeService({ now, handler: (s) => ({ results: Object.fromEntries(s.map((x) => [x, { quote: quote(x, { nowMs: now.t }) }])) }) });
  await svc.tick();
  assert.equal(calls[0].length, 8);
  now.t += 61000;
  await svc.tick();
  assert.equal(calls[1].length, 4); // 12 mapped symbols in total, indices have none
  assert.ok(calls.flat().every((s) => s), "no null symbols requested");
});

test("daily budget stretches the refresh interval on the Basic plan", () => {
  const now = { t: T0 };
  const { svc } = makeService({ now, handler: () => ({ results: {} }) });
  // 12 active symbols, 800/day at 90% -> 12*86400/720 = 1440 s
  assert.equal(svc.openIntervalMs() / 1000, 1440);
  const paid = makeService({ now, handler: () => ({ results: {} }), dailyCredits: 0, creditsPerMinute: 55 }).svc;
  assert.equal(paid.openIntervalMs() / 1000, 60);
});

test("403 and 404 symbols become unavailable and are not retried every minute", async () => {
  const now = { t: T0 };
  const { svc, calls } = makeService({
    now,
    handler: (s) => ({ results: Object.fromEntries(s.map((x) => [x,
      x.startsWith("X") || x.startsWith("WTI") ? { error: { kind: "not_in_plan", code: 403, message: "Grow plan" } }
        : { quote: quote(x, { nowMs: now.t }) }])) }),
  });
  await svc.tick(); now.t += 61000; await svc.tick();
  const snap = svc.snapshot();
  const gold = snap.instruments.find((i) => i.id === "xauusd");
  assert.equal(gold.status, "unavailable");
  assert.equal(gold.reason, "not_in_plan");
  assert.equal(snap.instruments.find((i) => i.id === "us500").reason, "no_feed");
  // after disabling 4 commodities, 8 symbols remain -> 960 s interval
  assert.equal(snap.refresh.openSeconds, 960);
  now.t += 61000; await svc.tick();
  assert.ok(!calls[2] || !calls[2].includes("XAU/USD"), "gold not retried");
});

test("minute rate limit keeps prices and retries next minute; daily limit pauses until midnight", async () => {
  const now = { t: T0 };
  let mode = "ok";
  const { svc, calls } = makeService({
    now,
    handler: (s) => {
      if (mode === "minute") throw new TwelveDataError("minute_limit", "limit", 429);
      if (mode === "daily") throw new TwelveDataError("daily_limit", "day", 429);
      return { results: Object.fromEntries(s.map((x) => [x, { quote: quote(x, { nowMs: now.t }) }])) };
    },
  });
  await svc.tick();
  mode = "minute"; now.t += 61000; await svc.tick();
  assert.equal(svc.snapshot().status, "rate_limited");
  assert.equal(svc.snapshot().instruments.find((i) => i.id === "eurusd").price, 1.2, "last price kept");
  mode = "daily"; now.t += 61000; await svc.tick();
  assert.equal(svc.snapshot().status, "daily_limit");
  const n = calls.length;
  now.t += 5 * 60000; await svc.tick();
  assert.equal(calls.length, n, "no calls while paused");
});

test("bad key pauses polling and never leaks the key", async () => {
  const now = { t: T0 };
  const { svc } = makeService({ now, handler: () => { throw new TwelveDataError("auth", "bad key", 401); } });
  await svc.tick();
  const snap = svc.snapshot();
  assert.equal(snap.status, "auth_error");
  assert.ok(!JSON.stringify(snap).includes("apikey"));
});

test("feed label: real-time, delayed, closed", async () => {
  const now = { t: T0 };
  const { svc } = makeService({
    now,
    handler: (s) => ({ results: Object.fromEntries(s.map((x) => [x, { quote:
      x === "EUR/USD" ? quote(x, { nowMs: now.t, lagSec: 60 })
        : x === "GBP/USD" ? quote(x, { nowMs: now.t, lagSec: 20 * 60 })
        : quote(x, { nowMs: now.t, open: false }) }])) }),
  });
  await svc.tick();
  const by = Object.fromEntries(svc.snapshot().instruments.map((i) => [i.id, i]));
  assert.equal(by.eurusd.feed, "realtime");
  assert.equal(by.gbpusd.feed, "delayed");
  assert.ok(by.gbpusd.delayMinutes >= 18);
  assert.equal(by.usdjpy.feed, "closed");
  assert.equal(by.eurusd.bid, null, "no bid/ask from REST quote");
  assert.equal(by.eurusd.previousClose, 1.19);
});

test("not configured: no calls, clear status", async () => {
  const now = { t: T0 };
  const { svc, calls } = makeService({ now, configured: false, handler: () => ({ results: {} }) });
  await svc.tick();
  assert.equal(calls.length, 0);
  assert.equal(svc.snapshot().status, "not_configured");
});
