# scamshield-relay

Part of [Parry](../README.md) — see the README section [Optional community reporting (the relay)](../README.md#optional-community-reporting-the-relay) for the end-to-end data flow and the [privacy policy](https://joelstephen97.github.io/scamshield/privacy.html) §5 for the user-facing promise this service must keep. Live: https://scamshield-relay-seven.vercel.app/api/health · License: GPL-3.0-or-later (same as the extension).

Opt-in report receiver for the Parry browser extension. Receives host-level, anonymised risk reports (never URLs, page text, or identifiers), stores them in Postgres, exports NDJSON for model training, purges after 180 days. IPs are used only for in-memory rate limiting and never stored.

This service lives in the `relay/` folder of the `scamshield` repo (this is not a standalone repo). When deploying on Vercel, set the project's **Root Directory** to `relay`. It has its own `package.json`, dependencies, and test suite, independent of the extension's root `package.json`, so it can be split out into its own repository later without any code changes if desired.

## Deploy (Vercel)
1. `vercel login` · `vercel link` (new project `scamshield-relay`, Root Directory `relay`)
2. Postgres: `vercel integration add neon` (Marketplace) → sets `DATABASE_URL`; run `schema.sql` once (Neon console or `psql "$DATABASE_URL" -f schema.sql`).
3. `vercel env add EXPORT_TOKEN production` (long random) · `vercel env add CRON_SECRET production`
4. `vercel deploy --prod` → note the URL; put `https://<project>.vercel.app/api/report` into the extension's `DEFAULT_RELAY_URL`.

## Endpoints
POST /api/report · GET /api/health · GET /api/export?since=&limit= (Bearer EXPORT_TOKEN) · GET /api/purge (cron, Bearer CRON_SECRET + `x-vercel-cron` header)

## Security notes
- **Bearer tokens** (`EXPORT_TOKEN`, `CRON_SECRET`) are compared in constant time via `lib/auth.js` (`crypto.timingSafeEqual`), not `===`.
- **`/api/purge`** requires both a valid `Authorization: Bearer $CRON_SECRET` *and* the `x-vercel-cron` header, which Vercel Cron sets on scheduled invocations. A leaked `CRON_SECRET` alone cannot trigger a purge from outside Vercel's cron system; to trigger it manually (e.g. via curl) you must send both.
- **`/api/report`** rejects oversized requests twice: a pre-parse check on the `content-length` header (fast-fail before the body is touched) and a post-parse check on the parsed JSON size, since `content-length` can be absent or wrong.
- **Rate-limit IP** is derived from `x-real-ip` when present, otherwise the *last* comma-separated entry of `x-forwarded-for` (the hop appended by the platform, not attacker-controlled), capped to 64 chars. This IP is used only as an in-memory bucket key and is never stored in the database.
- **`score`, `ts`, `pageFeatures.tokens` values, and `iconMatches[].distance`** must all be finite numbers (`Number.isFinite`) — `NaN`/`Infinity` are rejected.
- **`/api/export`** validates `since` (must parse to a valid date) and `limit` (integer, 1–20000) and returns `400` on bad input; DB failures on both `/api/export` and `/api/purge` return `500` instead of throwing.

## Operations
- Secrets (`EXPORT_TOKEN`, `CRON_SECRET`, `DATABASE_URL`) live only in the Vercel project environment (and the maintainer's password manager) — never in the repo.
- Pull data for retraining: `model/pull_reports.py --url https://scamshield-relay-seven.vercel.app/api/export --token $EXPORT_TOKEN` (see `model/README.md`).
- Retention: the daily cron (`vercel.json`, 04:00 UTC) deletes rows older than 180 days; the privacy policy promises this, so do not lengthen it without updating the policy.
- Changing the payload contract means changing `engine/report_payload.js`, `lib/validate.js`, the privacy policy and the CWS data-use disclosure together.

## Tests
`npm test` (run inside `relay/`)
