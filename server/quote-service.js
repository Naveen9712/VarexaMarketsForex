/* =========================================================
   Quote service
   ---------------------------------------------------------
   Polls Twelve Data on a schedule and keeps the latest quotes
   in memory. Website visitors read this cache through
   /api/quotes, so visitor traffic never uses API credits.

   Credit budgeting
   - Twelve Data charges 1 credit per symbol per /quote call.
   - Per minute: never more symbols than TD_CREDITS_PER_MINUTE.
   - Per day (Basic plan only): the refresh interval is
     stretched so a full day of polling stays under 90% of
     TD_DAILY_CREDITS. Set TD_DAILY_CREDITS=0 on paid plans.
   - Closed markets are re-checked less often (TD_CLOSED_REFRESH_SECONDS).

   Failure handling
   - 401 bad key            -> pause 10 min, status "auth_error"
   - 403 symbol not in plan -> instrument "unavailable", retried after 24 h
   - 404 symbol not found   -> instrument "unavailable", retried after 24 h
   - 429 minute limit       -> wait for the next minute
   - 429 daily limit        -> pause until 00:00 UTC, keep last prices
   - network / 5xx          -> keep last prices, retry with backoff
   ========================================================= */
"use strict";

const { ADVERTISED_FEED } = require("./instruments");

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const HISTORY_POINTS = 120;
const REALTIME_MAX_LAG_MIN = 3; // provider candle older than this while the market is open = delayed

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nextUtcMidnight(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

class QuoteService {
  constructor({
    client,
    instruments,
    configured = true,
    creditsPerMinute = 8,
    dailyCredits = 800,
    minRefreshSec = 60,
    closedRefreshSec = 3600,
    now = () => Date.now(),
    logger = console,
  }) {
    this.client = client;
    this.configured = configured;
    this.cpm = Math.max(1, creditsPerMinute);
    this.daily = Math.max(0, dailyCredits);
    this.minRefreshMs = Math.max(60, minRefreshSec) * 1000;
    this.closedRefreshMs = Math.max(60, closedRefreshSec) * 1000;
    this.now = now;
    this.log = logger;

    this.state = new Map(); // id -> per-instrument state
    for (const inst of instruments) {
      this.state.set(inst.id, {
        inst,
        status: inst.td ? "pending" : "unavailable",
        reason: inst.td ? null : "no_feed",
        quote: null,
        fetchedAt: null,
        nextAt: 0,
        failures: 0,
        history: [],
      });
    }

    this.pausedUntil = 0;
    this.globalStatus = configured ? "warming_up" : "not_configured";
    this.globalMessage = configured ? null : "Live prices are not configured on the server.";
    this.lastSuccessAt = null;
    this.day = utcDay(this.now());
    this.usedToday = 0;
    this.timer = null;
    this.running = false;
  }

  /* ---------- scheduling ---------- */

  activeIds() {
    return [...this.state.values()].filter((s) => s.inst.td && s.reason !== "not_in_plan" && s.reason !== "symbol_not_found").map((s) => s.inst.id);
  }

  /** Refresh interval for open markets, in ms, given the plan's limits. */
  openIntervalMs() {
    const n = Math.max(1, this.activeIds().length);
    const byMinute = Math.ceil(n / this.cpm) * MINUTE;
    const byDay = this.daily > 0 ? Math.ceil((n * DAY) / (this.daily * 0.9) / MINUTE) * MINUTE : 0;
    return Math.max(this.minRefreshMs, byMinute, byDay);
  }

  closedIntervalMs() {
    return Math.max(this.closedRefreshMs, this.openIntervalMs());
  }

  start() {
    if (this.timer || !this.configured) return;
    const loop = async () => {
      await this.tick().catch((e) => this.log.error("[quotes] tick failed:", e.message));
      // run shortly after each minute boundary, when Twelve Data's per-minute credits reset
      const t = this.now();
      this.timer = setTimeout(loop, MINUTE - (t % MINUTE) + 1500);
      if (this.timer.unref) this.timer.unref();
    };
    loop();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** One polling round. Public so tests can drive it. */
  async tick() {
    if (!this.configured || this.running) return;
    const now = this.now();
    if (now < this.pausedUntil) return;

    const today = utcDay(now);
    if (today !== this.day) { this.day = today; this.usedToday = 0; }

    const due = [...this.state.values()]
      .filter((s) => s.inst.td && s.nextAt <= now)
      .sort((a, b) => a.nextAt - b.nextAt);
    if (!due.length) return;

    const dayLeft = this.daily > 0 ? this.daily - this.usedToday : Infinity;
    const take = due.slice(0, Math.max(0, Math.min(this.cpm, dayLeft)));
    if (!take.length) {
      this.pause(nextUtcMidnight(now) + MINUTE, "daily_limit", "Daily data limit reached. Prices resume after 00:00 UTC.");
      return;
    }

    this.running = true;
    try {
      const symbols = take.map((s) => s.inst.td);
      const { results } = await this.client.quotes(symbols);
      this.usedToday += symbols.length;
      for (const s of take) this.apply(s, results[s.inst.td], now);
      this.lastSuccessAt = new Date(now).toISOString();
      this.refreshGlobalStatus();
    } catch (e) {
      this.handleRequestError(e, take, now);
    } finally {
      this.running = false;
    }
  }

  pause(until, status, message) {
    this.pausedUntil = until;
    this.globalStatus = status;
    this.globalMessage = message;
  }

  handleRequestError(e, take, now) {
    switch (e.kind) {
      case "auth":
        this.log.error("[quotes] Twelve Data rejected the API key (401). Check TWELVE_DATA_API_KEY.");
        this.pause(now + 10 * MINUTE, "auth_error", "Live prices are temporarily unavailable.");
        break;
      case "minute_limit":
        this.log.warn("[quotes] Per-minute credit limit reached; waiting for the next minute.");
        this.globalStatus = "rate_limited";
        this.globalMessage = "Price updates are briefly paused by the data provider's rate limit.";
        break;
      case "daily_limit":
        this.log.warn("[quotes] Daily credit limit reached; pausing until 00:00 UTC.");
        this.usedToday = this.daily || this.usedToday;
        this.pause(nextUtcMidnight(now) + MINUTE, "daily_limit", "Daily data limit reached. Prices resume after 00:00 UTC.");
        break;
      case "not_in_plan":
        // whole request refused for plan reasons: treat each symbol as unavailable
        for (const s of take) this.markUnavailable(s, "not_in_plan", now);
        this.refreshGlobalStatus();
        break;
      default: {
        // network, 5xx, bad_request: keep last prices and retry with backoff
        this.log.warn(`[quotes] Request failed (${e.kind}${e.code ? " " + e.code : ""}): ${e.message}`);
        for (const s of take) {
          s.failures += 1;
          s.nextAt = now + Math.min(15 * MINUTE, MINUTE * 2 ** Math.min(s.failures - 1, 4));
          if (!s.quote) { s.status = "error"; s.reason = "provider_error"; }
        }
        this.globalStatus = this.lastSuccessAt ? "degraded" : "error";
        this.globalMessage = "Prices may be out of date while the data provider is unreachable.";
      }
    }
  }

  markUnavailable(s, reason, now) {
    s.status = "unavailable";
    s.reason = reason;
    s.quote = null;
    s.nextAt = now + DAY; // try again tomorrow in case the plan or symbol changes
  }

  apply(s, result, now) {
    if (!result || result.error) {
      const err = (result && result.error) || { kind: "provider", message: "No result" };
      if (err.kind === "not_in_plan") {
        if (s.reason !== "not_in_plan") this.log.warn(`[quotes] ${s.inst.td}: not included in the current Twelve Data plan.`);
        return this.markUnavailable(s, "not_in_plan", now);
      }
      if (err.kind === "not_found") {
        if (s.reason !== "symbol_not_found") this.log.warn(`[quotes] ${s.inst.td}: symbol not found. Run npm run check:symbols.`);
        return this.markUnavailable(s, "symbol_not_found", now);
      }
      s.failures += 1;
      s.nextAt = now + Math.min(15 * MINUTE, MINUTE * 2 ** Math.min(s.failures - 1, 4));
      if (!s.quote) { s.status = "error"; s.reason = "provider_error"; }
      return;
    }

    const q = result.quote;
    const price = num(q.close);
    if (price === null) {
      s.failures += 1;
      s.nextAt = now + 5 * MINUTE;
      if (!s.quote) { s.status = "error"; s.reason = "provider_error"; }
      return;
    }

    const prevClose = num(q.previous_close);
    const change = num(q.change) ?? (prevClose !== null ? price - prevClose : null);
    const pct = num(q.percent_change) ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : null);
    // last_quote_at = start of the latest 1-minute candle (unix seconds)
    const lastQuoteAt = num(q.last_quote_at);
    const isOpen = typeof q.is_market_open === "boolean" ? q.is_market_open : null;

    s.quote = {
      price,
      bid: num(q.bid), // not returned by Twelve Data's REST /quote; kept for a future bid/ask source
      ask: num(q.ask),
      previousClose: prevClose,
      change,
      percentChange: pct,
      open: num(q.open),
      high: num(q.high),
      low: num(q.low),
      currency: q.currency || null,
      exchange: q.exchange || null,
      isMarketOpen: isOpen,
      quoteTime: lastQuoteAt ? new Date(lastQuoteAt * 1000).toISOString() : null,
    };
    s.status = "ok";
    s.reason = null;
    s.failures = 0;
    s.fetchedAt = now;
    s.nextAt = now + (isOpen === false ? this.closedIntervalMs() : this.openIntervalMs());

    const last = s.history[s.history.length - 1];
    if (!last || last[1] !== price || now - last[0] > 30 * MINUTE) {
      s.history.push([now, price]);
      // keep roughly the last 24 hours
      while (s.history.length > HISTORY_POINTS || (s.history.length && now - s.history[0][0] > DAY)) s.history.shift();
    }
  }

  refreshGlobalStatus() {
    const states = [...this.state.values()].filter((s) => s.inst.td);
    const anyOk = states.some((s) => s.status === "ok");
    const anyErr = states.some((s) => s.status === "error");
    if (!anyOk && states.every((s) => s.status === "pending")) { this.globalStatus = "warming_up"; this.globalMessage = null; return; }
    if (!anyOk) { this.globalStatus = "error"; this.globalMessage = "Live prices are temporarily unavailable."; return; }
    this.globalStatus = anyErr ? "degraded" : "ok";
    this.globalMessage = anyErr ? "Some prices could not be updated." : null;
  }

  /* ---------- output ---------- */

  feedFor(s, now) {
    if (s.status !== "ok" || !s.quote) return { feed: s.status === "unavailable" ? "unavailable" : "pending", delayMinutes: null };
    if (s.quote.isMarketOpen === false) return { feed: "closed", delayMinutes: null };
    if (s.quote.quoteTime) {
      // provider lag = when we fetched minus the provider's latest candle (candle start, so allow a few minutes)
      const lagMin = Math.max(0, Math.round((s.fetchedAt - Date.parse(s.quote.quoteTime)) / MINUTE) - 1);
      if (lagMin > REALTIME_MAX_LAG_MIN) return { feed: "delayed", delayMinutes: lagMin };
      return { feed: "realtime", delayMinutes: 0 };
    }
    const adv = ADVERTISED_FEED[s.inst.assetClass] || "unspecified";
    return { feed: adv, delayMinutes: null };
  }

  snapshot() {
    const now = this.now();
    const openMs = this.openIntervalMs();
    const instruments = [...this.state.values()].map((s) => {
      const { feed, delayMinutes } = this.feedFor(s, now);
      const interval = s.quote && s.quote.isMarketOpen === false ? this.closedIntervalMs() : openMs;
      return {
        id: s.inst.id,
        symbol: s.inst.td,
        assetClass: s.inst.assetClass,
        status: s.status,
        reason: s.reason,
        ...(s.quote || {
          price: null, bid: null, ask: null, previousClose: null, change: null, percentChange: null,
          open: null, high: null, low: null, currency: null, exchange: null, isMarketOpen: null, quoteTime: null,
        }),
        fetchedAt: s.fetchedAt ? new Date(s.fetchedAt).toISOString() : null,
        feed,
        delayMinutes,
        stale: !!(s.fetchedAt && now - s.fetchedAt > interval * 2.5),
        history: s.history.map(([t, p]) => [t, p]),
      };
    });
    return {
      provider: "Twelve Data",
      status: this.globalStatus,
      message: this.globalMessage,
      generatedAt: new Date(now).toISOString(),
      lastSuccessAt: this.lastSuccessAt,
      refresh: { openSeconds: Math.round(openMs / 1000), closedSeconds: Math.round(this.closedIntervalMs() / 1000) },
      bidAskAvailable: instruments.some((i) => i.bid !== null && i.ask !== null),
      instruments,
    };
  }
}

module.exports = { QuoteService };
