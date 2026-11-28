# Live market prices (Twelve Data)

The homepage market overview, ticker and featured cards now show prices from
Twelve Data instead of simulated values.

```
Browser ──GET /api/quotes──▶ Node server (Render) ──/quote, key in header──▶ Twelve Data
           (every 30 s,                (polls on a schedule,
            no key, no credits)         caches in memory)
```

- The API key lives only in the Render environment variable `TWELVE_DATA_API_KEY`.
  It is sent to Twelve Data in the `Authorization` header and is never in the
  website's files, URLs, logs or API responses.
- Visitors read the server's cache, so traffic does not use API credits.

## Project layout

| Path | What it is |
| --- | --- |
| `public/` | The website (unchanged pages, moved here so the server can't expose its own files) |
| `server/server.js` | Express server: serves `public/`, `/api/quotes`, `/api/health` |
| `server/instruments.js` | Website instrument → Twelve Data symbol map |
| `server/quote-service.js` | Polling schedule, credit budget, caching, error handling |
| `server/twelvedata.js` | Small Twelve Data client |
| `scripts/check-symbols.js` | Checks every mapped symbol against your plan |
| `test/` | Unit tests and a local mock of Twelve Data |
| `render.yaml` | Render Blueprint |

## Deploy on Render

1. Push this project to your Git repository.
2. In Render choose **New → Blueprint** and select the repository
   (or **New → Web Service** with build `npm ci --omit=dev`, start `npm start`).
3. When asked, paste your key into `TWELVE_DATA_API_KEY`.
   To change it later: service → **Environment** → edit → **Save, rebuild and deploy**.
4. Open `https://<your-service>.onrender.com/api/health` – `pricesConfigured` should be `true`.
5. Once, open the service's **Shell** and run `npm run check:symbols`
   to confirm which symbols your plan covers (uses about 20–25 credits).

If your Render static site currently hosts the website, point the domain at
this web service instead; it serves the same pages.

### Environment variables

| Name | Default | Notes |
| --- | --- | --- |
| `TWELVE_DATA_API_KEY` | – | Required. Secret. |
| `TD_CREDITS_PER_MINUTE` | `8` | Your plan's API credits per minute |
| `TD_DAILY_CREDITS` | `800` | Basic plan daily cap. Set `0` on paid plans |
| `TD_MIN_REFRESH_SECONDS` | `60` | Fastest refresh for open markets |
| `TD_CLOSED_REFRESH_SECONDS` | `3600` | Re-check interval for closed markets |
| `TD_SYMBOL_OVERRIDES` | – | JSON, e.g. `{"brent":"XBR/USD","us500":"SPX"}`; `""` switches one off |

## What to expect on the free Basic plan

- **Refresh rate:** 8 symbols × 1 credit each, kept under 90% of 800 credits a
  day, means each price refreshes about every 16 minutes. On a paid plan
  (`TD_DAILY_CREDITS=0`) it refreshes every minute.
- **Real-time at source:** forex and US stocks.
- **Not included:** gold, silver, WTI and Brent (commodities start on Grow).
  Indices (US 500, US Tech 100, Germany 40) have no self-serve feed. These rows
  show "Unavailable" rather than a substitute price.
- **No bid/ask:** Twelve Data's REST quote has no bid or ask, so the table's two
  price columns show **Price** and **Prev. close**. They switch back to
  **Sell / Buy** automatically if a bid/ask source is added later.
- **Licence:** Basic is for internal, non-display use. Showing prices on a public
  website needs a Twelve Data plan with external display rights. Check this with
  Twelve Data before going live.

## How states are shown

| State | Where it shows |
| --- | --- |
| Real-time / delayed | Status badge, row tag "Delayed ~N min", note under the table |
| Market closed | Row tag "Closed", last price kept |
| Not in plan / no feed / bad symbol | Row tag "Unavailable" (hover for the reason), note under the table |
| Rate limit (minute) | Waits for the next minute, last prices kept |
| Daily limit reached | Pauses until 00:00 UTC, badge "Updates paused" |
| Bad API key | Pauses 10 min, logged on the server, badge "Prices unavailable" |
| Provider down | Retries with backoff, last prices kept, row tag "Not updated" |

"Delayed" is measured, not assumed: if Twelve Data's latest one-minute candle is
more than 3 minutes older than the fetch time while the market is open, the row
is labelled delayed.

## Local development

```
npm install
npm test                 # unit tests
npm run mock             # terminal 1: fake Twelve Data on :4010 (no credits used)
TWELVE_DATA_API_KEY=test TD_BASE_URL=http://localhost:4010 npm start   # terminal 2
```

Or copy `.env.example` to `.env`, add your key and run `npm run dev`.
