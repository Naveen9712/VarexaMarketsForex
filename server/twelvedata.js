/* =========================================================
   Minimal Twelve Data REST client (server side only)
   ---------------------------------------------------------
   - The API key is sent in the Authorization header, so it
     never appears in a URL or a log line.
   - Several symbols go in one /quote request (batch). Twelve
     Data still charges 1 credit per symbol.
   - Every result is normalised to { quote } or { error }.
   ========================================================= */
"use strict";

const DEFAULT_BASE_URL = "https://api.twelvedata.com";

class TwelveDataError extends Error {
  /**
   * kind: auth | not_in_plan | not_found | minute_limit | daily_limit | bad_request | provider | network
   */
  constructor(kind, message, code) {
    super(message);
    this.kind = kind;
    this.code = code ?? null;
  }
}

function classify(code, message = "") {
  const m = String(message).toLowerCase();
  switch (Number(code)) {
    case 401: return "auth";
    case 403: return "not_in_plan";
    case 404: return "not_found";
    case 429: return /day|daily/.test(m) ? "daily_limit" : "minute_limit";
    // A 400 that names the symbol means the symbol is wrong or not covered
    case 400: return /symbol/.test(m) ? "not_found" : "bad_request";
    case 414: return "bad_request";
    default: return "provider";
  }
}

function createClient({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
  /** Remove the key from any text before it is logged or returned. */
  const scrub = (text) => (apiKey ? String(text).split(apiKey).join("[hidden]") : String(text));

  async function getJson(path, params) {
    const url = new URL(path, baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    let res;
    try {
      res = await fetchImpl(url, {
        headers: { Authorization: `apikey ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new TwelveDataError("network", scrub(e.name === "TimeoutError" ? "Request to Twelve Data timed out" : e.message));
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON body */ }

    // Twelve Data can answer an error with HTTP 200 and {status:"error"}, or with an HTTP error code.
    if (body && body.status === "error" && body.code) {
      throw new TwelveDataError(classify(body.code, body.message), scrub(body.message || "Twelve Data error"), body.code);
    }
    if (!res.ok) {
      throw new TwelveDataError(classify(res.status, body && body.message), scrub((body && body.message) || `HTTP ${res.status}`), res.status);
    }
    if (!body || typeof body !== "object") throw new TwelveDataError("provider", "Empty or invalid response from Twelve Data");
    return { body, headers: res.headers };
  }

  /**
   * Fetch quotes for several symbols in one request.
   * Resolves to { results: { [symbol]: { quote } | { error: {kind, message, code} } }, creditsLeft }
   * Throws TwelveDataError when the whole request fails (bad key, rate limit, network...).
   */
  async function quotes(symbols) {
    const single = symbols.length === 1;
    let body, headers;
    try {
      ({ body, headers } = await getJson("/quote", { symbol: symbols.join(","), dp: "6" }));
    } catch (e) {
      // With one symbol, a symbol-level error (not in plan / not found) arrives as the whole body
      if (single && (e.kind === "not_in_plan" || e.kind === "not_found")) {
        return { results: { [symbols[0]]: { error: { kind: e.kind, message: e.message, code: e.code } } }, creditsLeft: null };
      }
      throw e;
    }
    const results = {};
    for (const sym of symbols) {
      // One symbol: the quote is the body. Several: the body is keyed by symbol.
      const item = single ? body : body[sym];
      if (!item) {
        results[sym] = { error: { kind: "not_found", message: "No data returned for this symbol", code: 404 } };
      } else if (item.status === "error") {
        results[sym] = { error: { kind: classify(item.code, item.message), message: scrub(item.message || "Error"), code: item.code ?? null } };
      } else {
        results[sym] = { quote: item };
      }
    }
    const left = headers && headers.get && headers.get("api-credits-left");
    return { results, creditsLeft: left != null && left !== "" ? Number(left) : null };
  }

  /** Raw GET for the symbol-check script. */
  async function get(path, params = {}) {
    return (await getJson(path, params)).body;
  }

  return { quotes, get, scrub };
}

module.exports = { createClient, TwelveDataError, classify, DEFAULT_BASE_URL };
