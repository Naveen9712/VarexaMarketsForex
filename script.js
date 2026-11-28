/* =========================================================
   Varexa Markets — website scripts
   Market prices come from the site's own server (/api/quotes),
   which fetches them from Twelve Data. The Twelve Data API key
   lives only on the server (Render environment variable) and is
   never sent to the browser.
   The candle charts inside the device mockups and the About card
   remain decorative illustrations, not market data.
   ========================================================= */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = { up: "#27c77a", down: "#f0525b", gold: "#E3C078", grid: "rgba(227, 192, 120,0.08)", text: "#9fbab0", ink: "#0A1F1A" };

  /* ---------- Instruments (display details) ----------
     Twelve Data symbols are mapped on the server in server/instruments.js.
     dp = decimal places shown. */
  const INSTRUMENTS = [
    { id: "eurusd", sym: "EUR/USD", name: "Euro / US Dollar", cat: "forex", badge: "sym-fx", mark: "€$", dp: 4 },
    { id: "gbpusd", sym: "GBP/USD", name: "British Pound / US Dollar", cat: "forex", badge: "sym-fx", mark: "£$", dp: 4 },
    { id: "usdjpy", sym: "USD/JPY", name: "US Dollar / Japanese Yen", cat: "forex", badge: "sym-fx", mark: "$¥", dp: 2 },
    { id: "audusd", sym: "AUD/USD", name: "Australian Dollar / US Dollar", cat: "forex", badge: "sym-fx", mark: "A$", dp: 4 },
    { id: "usdchf", sym: "USD/CHF", name: "US Dollar / Swiss Franc", cat: "forex", badge: "sym-fx", mark: "$₣", dp: 4 },
    { id: "xauusd", sym: "XAU/USD", name: "Gold / US Dollar", cat: "metals", badge: "sym-gold", mark: "Au", dp: 2 },
    { id: "xagusd", sym: "XAG/USD", name: "Silver / US Dollar", cat: "metals", badge: "sym-silver", mark: "Ag", dp: 2 },
    { id: "wti", sym: "WTI", name: "US Crude Oil", cat: "energy", badge: "sym-energy", mark: "OIL", dp: 2 },
    { id: "brent", sym: "Brent", name: "UK Brent Oil", cat: "energy", badge: "sym-energy", mark: "BR", dp: 2 },
    { id: "us500", sym: "US 500", name: "US 500 Index", cat: "indices", badge: "sym-index", mark: "500", dp: 1 },
    { id: "ustec", sym: "US Tech 100", name: "US Tech 100 Index", cat: "indices", badge: "sym-index", mark: "100", dp: 1 },
    { id: "ger40", sym: "Germany 40", name: "Germany 40 Index", cat: "indices", badge: "sym-index", mark: "40", dp: 1 },
    { id: "aapl", sym: "Apple", name: "Apple Inc. CFD", cat: "stocks", badge: "sym-stock", mark: "AA", dp: 2 },
    { id: "tsla", sym: "Tesla", name: "Tesla Inc. CFD", cat: "stocks", badge: "sym-stock", mark: "TS", dp: 2 },
    { id: "nvda", sym: "Nvidia", name: "NVIDIA Corp. CFD", cat: "stocks", badge: "sym-stock", mark: "NV", dp: 2 },
  ];
  const byId = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));
  const FEATURED = ["eurusd", "xauusd", "us500", "wti"]; // preferred cards; unavailable ones are swapped for available instruments

  /* ---------- Helpers ---------- */
  function rng(seed) { // mulberry32
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function fmt(v, dp) {
    return Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function fmtChg(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }

  /** Random-walk series, used only for the decorative device mockups and the About card. */
  function series(end, n, vol, seed) {
    const r = rng(seed);
    const out = [end];
    for (let i = 1; i < n; i++) {
      const prev = out[i - 1];
      out.push(prev * (1 - (r() - 0.48) * vol));
    }
    return out.reverse();
  }

  /** OHLC candles ending near `end`. tfMin = minutes per candle. */
  function candles(end, n, vol, seed, tfMin) {
    const r = rng(seed);
    const closes = series(end, n, vol, seed + 7);
    const now = Math.floor(Date.now() / 1000);
    const step = tfMin * 60;
    const start = now - now % step - (n - 1) * step;
    return closes.map((c, i) => {
      const o = i === 0 ? c * (1 + (r() - 0.5) * vol) : closes[i - 1];
      const hi = Math.max(o, c) * (1 + r() * vol * 0.6);
      const lo = Math.min(o, c) * (1 - r() * vol * 0.6);
      return { time: start + i * step, open: o, high: hi, low: lo, close: c };
    });
  }

  let gradId = 0;
  function sparkSVG(values, w, h, up) {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)]);
    const line = pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const color = up ? COLORS.up : COLORS.down;
    const id = "sg" + gradId++;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <polygon points="0,${h} ${line} ${w},${h}" fill="url(#${id})"/>
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  /* ---------- Canvas drawing (platform device mockups) ---------- */
  function fitCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function drawCandles(cv, data, opts = {}) {
    if (!cv || !cv.clientWidth) return;
    const { ctx, w, h } = fitCanvas(cv);
    const padR = opts.padRight ?? 64, padT = 12, padB = 14;
    ctx.clearRect(0, 0, w, h);
    let min = Infinity, max = -Infinity;
    data.forEach((c) => { min = Math.min(min, c.low); max = Math.max(max, c.high); });
    const span = max - min || 1;
    const y = (v) => padT + (1 - (v - min) / span) * (h - padT - padB);
    const plotW = w - padR;
    const slot = plotW / data.length;
    const bw = Math.max(2, slot * 0.58);

    // grid
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    ctx.font = "11px IBM Plex Sans, sans-serif"; ctx.fillStyle = COLORS.text; ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const gy = padT + (i / 4) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(plotW, gy + 0.5); ctx.stroke();
      if (padR > 30) ctx.fillText(fmt(max - (i / 4) * span, opts.dp ?? 2), plotW + 8, gy);
    }
    // candles
    data.forEach((c, i) => {
      const x = i * slot + slot / 2;
      const color = c.close >= c.open ? COLORS.up : COLORS.down;
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, y(c.high)); ctx.lineTo(Math.round(x) + 0.5, y(c.low)); ctx.stroke();
      const top = y(Math.max(c.open, c.close)), bot = y(Math.min(c.open, c.close));
      ctx.fillRect(Math.round(x - bw / 2), top, Math.round(bw), Math.max(1.5, bot - top));
    });
    // last price line
    if (opts.lastLine !== false) {
      const last = data[data.length - 1];
      const ly = y(last.close);
      const col = last.close >= last.open ? COLORS.up : COLORS.down;
      ctx.setLineDash([4, 4]); ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(0, ly + 0.5); ctx.lineTo(plotW, ly + 0.5); ctx.stroke(); ctx.setLineDash([]);
      if (padR > 30) {
        ctx.fillStyle = col;
        const label = fmt(last.close, opts.dp ?? 2);
        const tw = ctx.measureText(label).width + 12;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(plotW + 2, ly - 10, tw, 20, 5) : ctx.rect(plotW + 2, ly - 10, tw, 20); ctx.fill();
        ctx.fillStyle = "#0E3A2E"; ctx.fillText(label, plotW + 8, ly);
      }
    }
  }

  function drawLine(cv, values, color) {
    if (!cv || !cv.clientWidth) return;
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * w, 8 + (1 - (v - min) / span) * (h - 16)]);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + "55"); g.addColorStop(1, color + "00");
    ctx.beginPath(); ctx.moveTo(0, h);
    pts.forEach((p) => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  }

  /* ---------- Icons ---------- */
  function icons() { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); }

  /* ---------- Header / navigation ---------- */
  function initNav() {
    const toggle = document.getElementById("navToggle");
    const nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;
    const close = () => { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); document.body.classList.remove("nav-open"); };
    toggle.addEventListener("click", () => {
      const open = !nav.classList.contains("is-open");
      if (open) nav.style.top = Math.max(0, toggle.closest(".site-header").getBoundingClientRect().bottom) + "px";
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("nav-open", open);
    });
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    // Inner pages (about.html etc.) set <body data-page="..."> and highlight their own menu item
    const links = [...nav.querySelectorAll("ul a")];
    const page = document.body.dataset.page;
    if (page) { links.forEach((l) => l.classList.toggle("is-active", l.dataset.nav === page)); return; }

    // Homepage: highlight the nav item for the section in view
    const map = new Map(links.map((a) => [a.dataset.nav, a]));
    const sections = ["#about", "#advantages", "#markets", "#platforms", "#services", "#education", "#news"]
      .map((s) => document.querySelector(s)).filter(Boolean);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            links.forEach((l) => l.classList.remove("is-active"));
            (map.get(en.target.id) || links[0]).classList.add("is-active");
          }
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      sections.forEach((s) => io.observe(s));
      const hero = document.querySelector(".hero");
      if (hero) new IntersectionObserver(([en]) => {
        if (en.isIntersecting) { links.forEach((l) => l.classList.remove("is-active")); links[0].classList.add("is-active"); }
      }, { rootMargin: "-45% 0px -50% 0px" }).observe(hero);
    }
  }

  /* =========================================================
     Market prices (Twelve Data via /api/quotes)
     ========================================================= */
  const QUOTES_URL = "/api/quotes";
  const POLL_MS = 30000; // reads the server cache; does not use Twelve Data credits
  let Q = {};            // id -> quote from the server
  let meta = null;       // the rest of the /api/quotes response
  let loadFailed = false;
  let tickerKey = "";
  let moverKey = "";

  const REASONS = {
    not_in_plan: "Not included in the current Twelve Data plan",
    symbol_not_found: "Symbol not found at Twelve Data",
    no_feed: "Twelve Data has no feed for this index",
    provider_error: "The data provider did not return a price",
  };

  function q(id) { return Q[id] || null; }
  function hasPrice(x) { return !!(x && x.status === "ok" && x.price != null); }
  function dir(x) { return x && x.percentChange != null && x.percentChange < 0 ? "down" : "up"; }
  function chgText(x) { return x && x.percentChange != null ? fmtChg(x.percentChange) : "—"; }
  function priceText(i, v) { return v == null ? "—" : fmt(v, i.dp); }
  function mins(sec) { const m = Math.round(sec / 60); return m >= 60 && m % 60 === 0 ? (m / 60) + " h" : m + " min"; }
  function timeText(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  }

  /** Short state shown next to the symbol: Closed, Delayed, Unavailable... */
  function stateTag(x) {
    if (!x) return { text: "Loading", title: "Waiting for prices" };
    if (x.status === "unavailable") return { text: "Unavailable", title: REASONS[x.reason] || "Not available" };
    if (x.status === "error" || (x.status === "pending" && !hasPrice(x))) return { text: x.status === "pending" ? "Loading" : "Unavailable", title: REASONS[x.reason] || "Waiting for the first update" };
    if (x.stale) return { text: "Not updated", title: "The latest update failed; showing the last price received" };
    if (x.feed === "closed") return { text: "Closed", title: "Market closed: showing the last price" };
    if (x.feed === "delayed") return { text: "Delayed " + (x.delayMinutes ? "~" + x.delayMinutes + " min" : ""), title: "Price is delayed at source" };
    return null;
  }

  /** Points for the small "Today" chart: previous close, then prices the server recorded. */
  function sparkValues(x) {
    const pts = (x.history || []).map((p) => p[1]);
    const vals = x.previousClose != null ? [x.previousClose].concat(pts) : pts;
    if (vals.length === 1) vals.push(vals[0]);
    if (vals.length === 0 && x.price != null) return [x.price, x.price];
    if (vals[vals.length - 1] !== x.price && x.price != null) vals.push(x.price);
    return vals;
  }

  /* ---------- Ticker tape ---------- */
  function renderTicker() {
    const track = document.getElementById("tickerTrack");
    if (!track) return;
    const live = INSTRUMENTS.filter((i) => hasPrice(q(i.id)));
    const list = live;
    if (!list.length) {
      tickerKey = "";
      track.innerHTML = "";
      return;
    }
    const key = list.map((i) => i.id).join(",");
    if (key !== tickerKey) {
      // rebuild only when the set of instruments changes, so the scroll animation is not restarted
      tickerKey = key;
      const items = list.map((i) => `<span class="tick" data-tick="${i.id}"><b>${i.sym}</b><span class="p">—</span><span>—</span></span>`).join("");
      track.innerHTML = items + items; // duplicated for a seamless loop
    }
    list.forEach((i) => {
      const x = q(i.id);
      track.querySelectorAll(`[data-tick="${i.id}"]`).forEach((t) => {
        t.querySelector(".p").textContent = hasPrice(x) ? fmt(x.price, i.dp) : "—";
        const c = t.querySelector(".p + span");
        c.textContent = hasPrice(x) ? chgText(x) : "—";
        c.className = hasPrice(x) && x.percentChange != null ? dir(x) : "";
      });
    });
  }

  /* ---------- Featured movers ---------- */
  function featuredIds() {
    const ok = (id) => hasPrice(q(id));
    const pick = FEATURED.filter(ok);
    INSTRUMENTS.forEach((i) => { if (pick.length < 4 && !pick.includes(i.id) && ok(i.id)) pick.push(i.id); });
    return pick;
  }

  function renderMovers() {
    const grid = document.getElementById("moverGrid");
    if (!grid) return;
    const ids = featuredIds();
    const key = ids.join(",");
    if (key !== moverKey) {
      moverKey = key;
      grid.innerHTML = ids.length ? ids.map((id) => {
        const i = byId[id];
        return `<article class="mover" data-mover="${id}">
          <span class="sym-badge ${i.badge}">${i.mark}</span>
          <span class="mover-name">${i.sym}</span>
          <span class="mover-sub">${i.name}</span>
          <div class="mover-spark"></div>
          <div class="mover-foot"><span class="mover-price">—</span><span class="chg">—</span></div>
        </article>`;
      }).join("") : `<p class="market-empty">${loadFailed ? "Could not load available prices." : meta ? "No featured instruments currently have available prices." : "Loading available prices…"}</p>`;
    }
    ids.forEach((id) => {
      const i = byId[id], x = q(id), el = grid.querySelector(`[data-mover="${id}"]`);
      if (!el) return;
      const priceEl = el.querySelector(".mover-price");
      const before = priceEl.dataset.v ? Number(priceEl.dataset.v) : null;
      priceEl.textContent = hasPrice(x) ? fmt(x.price, i.dp) : "—";
      priceEl.dataset.v = hasPrice(x) ? x.price : "";
      const c = el.querySelector(".mover-foot .chg");
      const tag = stateTag(x);
      c.textContent = hasPrice(x) ? chgText(x) : (tag ? tag.text : "—");
      c.className = "chg " + (hasPrice(x) && x.percentChange != null ? dir(x) : "");
      c.title = tag ? tag.title : "";
      el.querySelector(".mover-spark").innerHTML = hasPrice(x) ? sparkSVG(sparkValues(x), 200, 54, dir(x) === "up") : "";
      if (before != null && hasPrice(x) && x.price !== before) flash(priceEl, x.price > before);
    });
  }

  /* ---------- Market table ---------- */
  let currentFilter = "all";
  function renderTable() {
    const body = document.getElementById("marketBody");
    if (!body) return;
    const bidAsk = !!(meta && meta.bidAskAvailable);
    // Twelve Data's quote feed has no bid/ask: the two price columns then show last price and previous close
    const thBid = document.querySelector('[data-col="bid"]'), thAsk = document.querySelector('[data-col="ask"]');
    if (thBid) thBid.textContent = bidAsk ? "Sell" : "Price";
    if (thAsk) thAsk.textContent = bidAsk ? "Buy" : "Prev. close";

    const previous = {};
    body.querySelectorAll("[data-row]").forEach((r) => { previous[r.dataset.row] = r.dataset.v ? Number(r.dataset.v) : null; });

    const rows = INSTRUMENTS.filter((i) => (currentFilter === "all" || i.cat === currentFilter) && hasPrice(q(i.id)));
    if (!rows.length) {
      body.innerHTML = `<tr><td class="market-empty" colspan="5">${loadFailed ? "Could not load available prices." : meta ? "No instruments in this category currently have available prices." : "Loading available prices…"}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((i) => {
      const x = q(i.id), ok = hasPrice(x), tag = stateTag(x);
      const c1 = ok ? (bidAsk && x.bid != null ? x.bid : x.price) : null;
      const c2 = ok ? (bidAsk && x.ask != null ? x.ask : x.previousClose) : null;
      const pill = ok && x.percentChange != null
        ? `<span class="pill-chg ${dir(x)}" data-chg>${chgText(x)}</span>`
        : `<span class="pill-chg na" data-chg>—</span>`;
      return `<tr data-row="${i.id}" data-v="${ok ? x.price : ""}">
        <td><div class="inst"><span class="sym-badge ${i.badge}">${i.mark}</span><div><b>${i.sym}${tag ? ` <small class="mkt-tag" title="${tag.title}">${tag.text}</small>` : ""}</b><span>${i.name}</span></div></div></td>
        <td class="num"><span class="price-cell" data-bid>${priceText(i, c1)}</span></td>
        <td class="num"><span class="price-cell" data-ask>${priceText(i, c2)}</span></td>
        <td class="num">${pill}</td>
        <td class="hide-sm spark-cell">${ok ? sparkSVG(sparkValues(x), 110, 32, dir(x) === "up") : ""}</td>
      </tr>`;
    }).join("");

    if (!reduceMotion) rows.forEach((i) => {
      const x = q(i.id), before = previous[i.id];
      if (before != null && hasPrice(x) && x.price !== before) {
        const row = body.querySelector(`[data-row="${i.id}"]`);
        flash(row.querySelector("[data-bid]"), x.price > before);
      }
    });
  }

  function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll(".mtab").forEach((t) => {
      const on = t.dataset.filter === filter;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    renderTable();
  }

  function initMarketTabs() {
    document.querySelectorAll(".mtab").forEach((t) => t.addEventListener("click", () => setFilter(t.dataset.filter)));
    // "Explore" buttons on market cards jump to the table with the right filter
    document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => setFilter(b.dataset.goto)));
  }

  function flash(el, up) {
    if (!el || reduceMotion) return;
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth;
    el.classList.add(up ? "flash-up" : "flash-down");
    setTimeout(() => el.classList.remove("flash-up", "flash-down"), 700);
  }

  /* ---------- Status badge and source note ---------- */
  function namesWhere(test) { return INSTRUMENTS.filter((i) => test(q(i.id))).map((i) => i.sym); }
  function listText(names) { return names.length <= 2 ? names.join(" and ") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]; }

  function renderStatus() {
    const badge = document.getElementById("marketStatus");
    const note = document.getElementById("marketNote");
    if (!badge && !note) return;

    let text, mode;
    const anyPrice = INSTRUMENTS.some((i) => hasPrice(q(i.id)));
    const realtime = namesWhere((x) => hasPrice(x) && x.feed === "realtime" && !x.stale);
    const delayed = namesWhere((x) => hasPrice(x) && x.feed === "delayed");
    const every = meta && meta.refresh ? mins(meta.refresh.openSeconds) : null;

    if (!meta && loadFailed) { text = "Prices unavailable"; mode = "off"; }
    else if (!meta || meta.status === "warming_up" && !anyPrice) { text = "Loading prices…"; mode = "wait"; }
    else if (!anyPrice) { text = "Prices unavailable"; mode = "off"; }
    else if (loadFailed) { text = "Connection lost: last prices shown"; mode = "off"; }
    else if (meta.status === "daily_limit" || meta.status === "rate_limited") { text = "Updates paused: last prices shown"; mode = "off"; }
    else if (realtime.length && delayed.length) { text = "Real-time and delayed prices"; mode = "live"; }
    else if (realtime.length) { text = "Real-time source · refreshed every " + every; mode = "live"; }
    else if (delayed.length) { text = "Delayed prices"; mode = "delayed"; }
    else { text = "Markets closed: last prices shown"; mode = "closed"; }

    if (badge) {
      badge.querySelector("[data-status-text]").textContent = text;
      badge.dataset.mode = mode;
    }
    if (!note) return;

    if (!meta) {
      note.textContent = loadFailed ? "Prices could not be loaded. They appear when the site runs on its server with a Twelve Data key." : "";
      return;
    }
    const parts = [];
    parts.push("Source: Twelve Data." + (meta.lastSuccessAt ? " Last update " + timeText(meta.lastSuccessAt) + "." : ""));
    if (realtime.length) parts.push(`Real-time at source: ${listText(realtime)}. This page refreshes them every ${every}` + (meta.refresh.closedSeconds > meta.refresh.openSeconds ? ` (closed markets every ${mins(meta.refresh.closedSeconds)})` : "") + ".");
    if (delayed.length) parts.push(`Delayed at source: ${listText(delayed)}.`);
    const closed = namesWhere((x) => hasPrice(x) && x.feed === "closed");
    if (closed.length) parts.push(`Market closed: ${listText(closed)} (last price shown).`);
    if (!meta.bidAskAvailable && anyPrice) parts.push("Twelve Data's quote feed has no bid/ask, so the table shows the latest price and the previous close.");
    const why = (reason) => namesWhere((x) => x && x.status === "unavailable" && x.reason === reason);
    const notInPlan = why("not_in_plan"), noFeed = why("no_feed"), notFound = why("symbol_not_found");
    const failed = namesWhere((x) => x && x.status === "error" && !hasPrice(x));
    if (notInPlan.length) parts.push(`Not included in the current Twelve Data plan: ${listText(notInPlan)}.`);
    if (noFeed.length) parts.push(`No Twelve Data feed: ${listText(noFeed)}.`);
    if (notFound.length) parts.push(`Symbol not recognised by Twelve Data: ${listText(notFound)}.`);
    if (failed.length) parts.push(`Could not be loaded right now: ${listText(failed)}.`);
    if (meta.message && meta.status !== "ok") parts.push(meta.message);
    parts.push("Prices are indicative, not tradable quotes.");
    note.textContent = parts.join(" ");
  }

  function renderAll() {
    renderTicker();
    renderMovers();
    renderTable();
    renderStatus();
  }

  /* ---------- Loading /api/quotes ---------- */
  let pollTimer = null;
  async function loadQuotes() {
    try {
      const res = await fetch(QUOTES_URL, { headers: { Accept: "application/json" }, cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      meta = data;
      Q = Object.fromEntries((data.instruments || []).map((x) => [x.id, x]));
      loadFailed = false;
    } catch (e) {
      loadFailed = true; // keep the last prices on screen
    }
    renderAll();
    // poll faster while the server is still collecting its first prices
    const wait = meta && meta.status === "warming_up" ? 10000 : POLL_MS;
    clearTimeout(pollTimer);
    if (!document.hidden) pollTimer = setTimeout(loadQuotes, wait);
  }

  function initQuotes() {
    if (!document.getElementById("marketBody") && !document.getElementById("tickerTrack")) return;
    // opened as a local file: there is no server to ask, so show the "unavailable" state
    if (location.protocol === "file:") { loadFailed = true; renderAll(); return; }
    loadQuotes();
    // stop polling in background tabs, refresh when the visitor comes back
    document.addEventListener("visibilitychange", () => {
      clearTimeout(pollTimer);
      if (!document.hidden) loadQuotes();
    });
  }

  /* ---------- About sparkline + platform mockups ---------- */
  function initDecor() {
    const about = document.getElementById("aboutSpark");
    if (about) about.innerHTML = sparkSVG(series(1.2934, 60, 0.0025, seedOf("about")), 300, 110, true).replace(/^<svg[^>]*>|<\/svg>$/g, "");

    const device = document.getElementById("deviceCanvas");
    const phone = document.getElementById("phoneCanvas");
    if (!device && !phone) return;
    const paintDevices = () => {
      if (device) drawCandles(device, candles(1.0862, 46, 0.0022, seedOf("device"), 60), { dp: 4, padRight: 58 });
      if (phone) drawLine(phone, series(3912.4, 40, 0.004, seedOf("phone")), "#E3C078");
    };
    paintDevices();
    window.addEventListener("resize", paintDevices);
  }

  /* ---------- Contact form (front-end demo only) ---------- */
  function initForm() {
    const form = document.getElementById("contactForm");
    const status = document.getElementById("formStatus");
    if (!form || !status) return;
    const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let ok = true;
      form.querySelectorAll(".field").forEach((f) => {
        const input = f.querySelector("input, textarea");
        const valid = input.value.trim() !== "" && (input.type !== "email" || emailOk(input.value.trim()));
        f.classList.toggle("invalid", !valid);
        if (!valid) ok = false;
      });
      const consent = form.querySelector('input[name="consent"]');
      consent.closest(".check").classList.toggle("invalid", !consent.checked);
      if (!consent.checked) ok = false;

      if (!ok) {
        status.textContent = "Check the highlighted fields and try again.";
        status.className = "form-status bad";
        const first = form.querySelector(".invalid input, .invalid textarea");
        if (first) first.focus();
        return;
      }
      status.textContent = "Message sent. Our team will reply within one business day. (Demo only: nothing was submitted.)";
      status.className = "form-status ok";
      form.reset();
    });
    form.querySelectorAll("input, textarea").forEach((el) => el.addEventListener("input", () => {
      const f = el.closest(".field"); if (f) f.classList.remove("invalid");
    }));
  }

  /* ---------- Live chat placeholder ---------- */
  function initChat() {
    const panel = document.getElementById("chatPanel");
    if (!panel) return;
    document.querySelectorAll("[data-open-chat]").forEach((b) => b.addEventListener("click", () => { panel.hidden = !panel.hidden; }));
    const closeBtn = document.getElementById("chatClose");
    if (closeBtn) closeBtn.addEventListener("click", () => { panel.hidden = true; });
  }

  /* ---------- Boot ---------- */
  /* ---------- Blog listing: topic filter + search (education/, news/) ---------- */
  function initBlogFilter() {
    const toolbar = document.querySelector(".blog-toolbar");
    if (!toolbar) return;
    const posts = [...document.querySelectorAll(".blog-section .post-featured, .blog-section .post-card")];
    const chips = [...toolbar.querySelectorAll(".fchip")];
    const search = toolbar.querySelector("input[type=search]");
    const empty = document.querySelector(".blog-empty");
    const count = document.querySelector(".blog-count");
    let filter = "all";
    const apply = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      posts.forEach((p) => {
        const ok = (filter === "all" || p.dataset.cat === filter) && (!q || p.dataset.search.includes(q));
        p.hidden = !ok; if (ok) shown++;
      });
      empty.hidden = shown > 0;
      count.textContent = filter === "all" && !q ? "" : `Showing ${shown} of ${posts.length}`;
    };
    const setFilter = (f) => {
      filter = f;
      chips.forEach((c) => { const on = c.dataset.filter === f; c.classList.toggle("is-active", on); c.setAttribute("aria-pressed", String(on)); });
      apply();
    };
    chips.forEach((c) => c.addEventListener("click", () => setFilter(c.dataset.filter)));
    document.querySelectorAll("[data-filter-link]").forEach((a) => a.addEventListener("click", () => setFilter(a.dataset.filterLink)));
    document.querySelectorAll("[data-filter-reset]").forEach((b) => b.addEventListener("click", () => { search.value = ""; setFilter("all"); }));
    search.addEventListener("input", apply);
  }

  /* ---------- Article share buttons ---------- */
  function initShare() {
    const links = document.querySelectorAll("[data-share]");
    if (!links.length) return;
    const url = encodeURIComponent(location.href);
    const title = encodeURIComponent(document.title);
    const targets = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${title}`,
    };
    const status = document.querySelector(".share-status");
    links.forEach((l) => {
      const kind = l.dataset.share;
      if (targets[kind]) l.href = targets[kind];
      if (kind === "copy") l.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(location.href); status.textContent = "Link copied"; }
        catch (e) { status.textContent = "Copy this page's address from your browser"; }
        setTimeout(() => { status.textContent = ""; }, 2500);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();
    renderAll();
    initMarketTabs();
    initNav();
    initDecor();
    initForm();
    initChat();
    initBlogFilter();
    initShare();
    icons();
    initQuotes(); // homepage only: loads prices from /api/quotes
  });
})();
