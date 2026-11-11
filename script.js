/* =========================================================
   Varexa Markets — Forex & CFD homepage prototype
   All market data in this file is ILLUSTRATIVE SAMPLE DATA.
   Replace the INSTRUMENTS list and the generators with a real
   price feed (e.g. a TradingView widget or a licensed data API)
   for production.
   ========================================================= */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = { up: "#27c77a", down: "#f0525b", gold: "#E3C078", grid: "rgba(227, 192, 120,0.08)", text: "#9fbab0", ink: "#0A1F1A" };

  /* ---------- Sample instruments ---------- */
  const INSTRUMENTS = [
    { id: "eurusd", sym: "EUR/USD", name: "Euro / US Dollar", cat: "forex", badge: "sym-fx", mark: "€$", price: 1.0862, dp: 4, chg: 0.21, spread: 0.0001 },
    { id: "gbpusd", sym: "GBP/USD", name: "British Pound / US Dollar", cat: "forex", badge: "sym-fx", mark: "£$", price: 1.2934, dp: 4, chg: 0.36, spread: 0.0001 },
    { id: "usdjpy", sym: "USD/JPY", name: "US Dollar / Japanese Yen", cat: "forex", badge: "sym-fx", mark: "$¥", price: 149.82, dp: 2, chg: -0.18, spread: 0.01 },
    { id: "audusd", sym: "AUD/USD", name: "Australian Dollar / US Dollar", cat: "forex", badge: "sym-fx", mark: "A$", price: 0.6571, dp: 4, chg: -0.27, spread: 0.0001 },
    { id: "usdchf", sym: "USD/CHF", name: "US Dollar / Swiss Franc", cat: "forex", badge: "sym-fx", mark: "$₣", price: 0.8823, dp: 4, chg: 0.09, spread: 0.0002 },
    { id: "xauusd", sym: "XAU/USD", name: "Gold / US Dollar", cat: "metals", badge: "sym-gold", mark: "Au", price: 3912.4, dp: 2, chg: 0.84, spread: 0.44 },
    { id: "xagusd", sym: "XAG/USD", name: "Silver / US Dollar", cat: "metals", badge: "sym-silver", mark: "Ag", price: 47.85, dp: 2, chg: 1.12, spread: 0.03 },
    { id: "wti", sym: "WTI", name: "US Crude Oil", cat: "energy", badge: "sym-energy", mark: "OIL", price: 68.42, dp: 2, chg: -0.65, spread: 0.03 },
    { id: "brent", sym: "Brent", name: "UK Brent Oil", cat: "energy", badge: "sym-energy", mark: "BR", price: 72.1, dp: 2, chg: -0.48, spread: 0.03 },
    { id: "us500", sym: "US 500", name: "US 500 Index", cat: "indices", badge: "sym-index", mark: "500", price: 6512.3, dp: 1, chg: 0.42, spread: 0.5 },
    { id: "ustec", sym: "US Tech 100", name: "US Tech 100 Index", cat: "indices", badge: "sym-index", mark: "100", price: 23410.5, dp: 1, chg: 0.67, spread: 1.0 },
    { id: "ger40", sym: "Germany 40", name: "Germany 40 Index", cat: "indices", badge: "sym-index", mark: "40", price: 23980.2, dp: 1, chg: -0.22, spread: 1.0 },
    { id: "aapl", sym: "Apple", name: "Apple Inc. CFD", cat: "stocks", badge: "sym-stock", mark: "AA", price: 228.4, dp: 2, chg: 0.55, spread: 0.06 },
    { id: "tsla", sym: "Tesla", name: "Tesla Inc. CFD", cat: "stocks", badge: "sym-stock", mark: "TS", price: 252.1, dp: 2, chg: -1.34, spread: 0.1 },
    { id: "nvda", sym: "Nvidia", name: "NVIDIA Corp. CFD", cat: "stocks", badge: "sym-stock", mark: "NV", price: 178.3, dp: 2, chg: 1.48, spread: 0.06 },
  ];
  const byId = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));
  const FEATURED = ["eurusd", "xauusd", "us500", "wti"];

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

  /** Random-walk close series that ends at `end`. */
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

    // Highlight the nav item for the section in view
    const links = [...nav.querySelectorAll("ul a")];
    const map = new Map(links.map((a) => [a.getAttribute("href"), a]));
    const sections = ["#about", "#advantages", "#markets", "#platforms", "#services", "#education", "#news"]
      .map((s) => document.querySelector(s)).filter(Boolean);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            links.forEach((l) => l.classList.remove("is-active"));
            (map.get("#" + en.target.id) || links[0]).classList.add("is-active");
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

  /* ---------- Ticker tape ---------- */
  function renderTicker() {
    const track = document.getElementById("tickerTrack");
    if (!track) return;
    const items = INSTRUMENTS.map((i) =>
      `<span class="tick" data-tick="${i.id}"><b>${i.sym}</b><span class="p">${fmt(i.price, i.dp)}</span><span class="${i.chg >= 0 ? "up" : "down"}">${fmtChg(i.chg)}</span></span>`
    ).join("");
    track.innerHTML = items + items; // duplicated for a seamless loop
  }

  /* ---------- Featured movers ---------- */
  function renderMovers() {
    const grid = document.getElementById("moverGrid");
    if (!grid) return;
    grid.innerHTML = FEATURED.map((id) => {
      const i = byId[id];
      const vals = series(i.price, 40, 0.004, seedOf(id + "spark"));
      return `<article class="mover" data-mover="${id}">
        <span class="sym-badge ${i.badge}">${i.mark}</span>
        <span class="mover-name">${i.sym}</span>
        <span class="mover-sub">${i.name}</span>
        <div class="mover-spark">${sparkSVG(vals, 200, 54, i.chg >= 0)}</div>
        <div class="mover-foot"><span class="mover-price">${fmt(i.price, i.dp)}</span><span class="chg ${i.chg >= 0 ? "up" : "down"}">${fmtChg(i.chg)}</span></div>
      </article>`;
    }).join("");
  }

  /* ---------- Market table ---------- */
  let currentFilter = "all";
  function renderTable() {
    const body = document.getElementById("marketBody");
    if (!body) return;
    const rows = INSTRUMENTS.filter((i) => currentFilter === "all" || i.cat === currentFilter);
    body.innerHTML = rows.map((i) => {
      const bid = i.price - i.spread / 2, ask = i.price + i.spread / 2;
      const vals = series(i.price, 30, 0.003, seedOf(i.id + "row"));
      return `<tr data-row="${i.id}">
        <td><div class="inst"><span class="sym-badge ${i.badge}">${i.mark}</span><div><b>${i.sym}</b><span>${i.name}</span></div></div></td>
        <td class="num"><span class="price-cell" data-bid>${fmt(bid, i.dp)}</span></td>
        <td class="num"><span class="price-cell" data-ask>${fmt(ask, i.dp)}</span></td>
        <td class="num"><span class="pill-chg ${i.chg >= 0 ? "up" : "down"}" data-chg>${fmtChg(i.chg)}</span></td>
        <td class="hide-sm spark-cell">${sparkSVG(vals, 110, 32, i.chg >= 0)}</td>
      </tr>`;
    }).join("");
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

  /* ---------- Simulated price movement (sample only) ---------- */
  function flash(el, up) {
    if (!el) return;
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth;
    el.classList.add(up ? "flash-up" : "flash-down");
    setTimeout(() => el.classList.remove("flash-up", "flash-down"), 700);
  }

  function tickPrices() {
    const r = Math.random;
    for (let k = 0; k < 4; k++) {
      const i = INSTRUMENTS[Math.floor(r() * INSTRUMENTS.length)];
      const move = (r() - 0.5) * 0.0012;
      const before = i.price;
      i.price = i.price * (1 + move);
      i.chg = +(i.chg + move * 100).toFixed(2);
      const up = i.price >= before;

      const row = document.querySelector(`[data-row="${i.id}"]`);
      if (row) {
        const bid = row.querySelector("[data-bid]"), ask = row.querySelector("[data-ask]"), chg = row.querySelector("[data-chg]");
        bid.textContent = fmt(i.price - i.spread / 2, i.dp);
        ask.textContent = fmt(i.price + i.spread / 2, i.dp);
        chg.textContent = fmtChg(i.chg);
        chg.className = "pill-chg " + (i.chg >= 0 ? "up" : "down");
        flash(bid, up); flash(ask, up);
      }
      document.querySelectorAll(`[data-tick="${i.id}"]`).forEach((t) => {
        t.querySelector(".p").textContent = fmt(i.price, i.dp);
        const c = t.querySelector(".p + span");
        c.textContent = fmtChg(i.chg); c.className = i.chg >= 0 ? "up" : "down";
      });
      const mv = document.querySelector(`[data-mover="${i.id}"]`);
      if (mv) {
        mv.querySelector(".mover-price").textContent = fmt(i.price, i.dp);
        const c = mv.querySelector(".mover-foot .chg");
        c.textContent = fmtChg(i.chg); c.className = "chg " + (i.chg >= 0 ? "up" : "down");
      }
    }
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
  document.addEventListener("DOMContentLoaded", () => {
    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();
    renderTicker();
    renderMovers();
    renderTable();
    initMarketTabs();
    initNav();
    initDecor();
    initForm();
    initChat();
    icons();
    if (!reduceMotion) setInterval(tickPrices, 2200);
  });
})();