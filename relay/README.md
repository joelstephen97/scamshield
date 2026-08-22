# scamshield-relay

Opt-in report receiver for the ScamShield browser extension. Receives host-level, anonymised risk reports (never URLs, page text, or identifiers), stores them in Postgres, exports NDJSON for model training, purges after 180 days. IPs are used only for in-memory rate limiting and never stored.

This service lives in the `relay/` folder of the `scamshield` repo (this is not a standalone repo). When deploying on Vercel, set the project's **Root Directory** to `relay`. It has its own `package.json`, dependencies, and test suite, independent of the extension's root `package.json`, so it can be split out into its own repository later without any code changes if desired.

## Deploy (Vercel)
1. `vercel login` · `vercel link` (new project `scamshield-relay`, Root Directory `relay`)
2. Postgres: `vercel integration add neon` (Marketplace) → sets `DATABASE_URL`; run `schema.sql` once (Neon console or `psql "$DATABASE_URL" -f schema.sql`).
3. `vercel env add EXPORT_TOKEN production` (long random) · `vercel env add CRON_SECRET production`
4. `vercel deploy --prod` → note the URL; put `https://<project>.vercel.app/api/report` into the extension's `DEFAULT_RELAY_URL`.

## Endpoints
POST /api/report · GET /api/health · GET /api/export?since=&limit= (Bearer EXPORT_TOKEN) · GET /api/purge (cron, Bearer CRON_SECRET)

## Tests
`npm test` (run inside `relay/`)
