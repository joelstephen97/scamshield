<p align="center">
  <img src="assets/icons/icon128.png" width="96" height="96" alt="Parry icon">
</p>

<h1 align="center">Parry</h1>

<p align="center"><em>Formerly ScamShield — renamed in 0.8.0 to avoid confusion with Singapore's government ScamShield app and T-Mobile's Scam Shield service. Same extension, same privacy promise.</em></p>

<p align="center">
  <strong>On-device scam &amp; phishing protection for Chrome, Edge, Brave, Opera and Firefox.</strong><br>
  Warns you before a page tricks you, spots brand look-alikes, checks suspicious messages — and nothing you browse, type or check ever leaves your device.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl"><img alt="Chrome Web Store version" src="https://img.shields.io/chrome-web-store/v/fojjjofjimbfoddafoampojopijnlihl?label=Chrome%20Web%20Store&color=1e7d34"></a>
  <a href="https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl"><img alt="Chrome Web Store users" src="https://img.shields.io/chrome-web-store/users/fojjjofjimbfoddafoampojopijnlihl?color=1e7d34"></a>
  <a href="https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl"><img alt="Chrome Web Store rating" src="https://img.shields.io/chrome-web-store/rating/fojjjofjimbfoddafoampojopijnlihl?color=1e7d34"></a>
  <a href="LICENSE"><img alt="License: GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue"></a>
  <a href="https://github.com/joelstephen97/parry/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/joelstephen97/parry?label=release&sort=semver"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl"><b>Install from the Chrome Web Store</b></a>
  ·
  <a href="https://joelstephen97.github.io/parry/privacy.html">Privacy policy</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
  ·
  <a href="https://github.com/joelstephen97/parry-feed">Threat feed</a>
  ·
  <a href="https://github.com/joelstephen97/parry/issues/new">Report a problem</a>
  ·
  <a href="#support-the-project">Support</a>
</p>

---

## Contents

- [Install](#install)
- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Privacy](#privacy)
- [Permissions](#permissions)
- [Threat feed](#threat-feed)
- [Optional community reporting (the relay)](#optional-community-reporting-the-relay)
- [Project layout](#project-layout)
- [Development](#development)
- [Models](#models)
- [Releasing](#releasing)
- [Upgrade safety](#upgrade-safety)
- [Contributing](#contributing) · [Security](#security) · [License](#license) · [Support the project](#support-the-project)

## Install

| Browser | How |
|---|---|
| **Chrome, Edge, Brave, Opera, Vivaldi** (any Chromium browser) | Install from the **[Chrome Web Store](https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl)** (extension ID `fojjjofjimbfoddafoampojopijnlihl`). |
| **Firefox 128+** | Download `parry-firefox.zip` from the **[latest GitHub Release](https://github.com/joelstephen97/parry/releases/latest)**, unzip it, and load it via `about:debugging#/runtime/this-firefox → Load Temporary Add-on → manifest.json` (temporary add-ons are removed on restart). An [addons.mozilla.org](https://addons.mozilla.org/) listing is pending; this row will link to it once live. |
| **From source** | `chrome://extensions → Developer mode → Load unpacked → select this folder`. See [Development](#development). |

Current release: **0.8.0** (the Chrome Web Store and Firefox Add-ons listings may lag a release by a few days while they clear review) — see the [changelog](CHANGELOG.md) for what changed. The package is about **450 KB zipped**.

## What it does

Parry watches every page you open and steps in only when something looks wrong. It is **conservative by design**: a page is only marked *dangerous* when at least two independent signals agree, and a single weak signal never produces more than a yellow *suspicious* notice.

**Detection**

- **Phishing & scam warnings with plain-language reasons** — a banner on suspicious/dangerous pages and a one-click *Leave this page*.
- **Page analysis** — an on-device model reads the page itself (wording, layout, login-form structure), catching brand-new phishing pages that a URL-only check would miss.
- **Brand look-alike detection by icon** — favicons and logos are perceptually hashed and matched against a 64-brand table (49 with icon hashes) including UAE banks, telcos and government services (Emirates NBD, ADCB, FAB, Mashreq, RAKBANK, e&, du, Noon, Aramex, Talabat, Careem, ADNOC, DEWA, ICP, MOHRE, Dubai Police, UAE PASS, Emirates, Etihad) plus PayPal, Microsoft, Google, Apple, DHL and more. A page using a brand's icon with a password form on the wrong domain is flagged even if the brand's name never appears.
- **URL model + heuristics** — a gradient-boosted URL classifier and hand-written rules (look-alike domains, punycode, suspicious tokens, IP hosts, deep-path tricks, brand-in-subdomain, …), with a built-in safe-domain allowlist for top sites.
- **Known-bad domain blocking** — a `declarativeNetRequest` ruleset refreshed daily from the open-source [scamshield-feed](https://github.com/joelstephen97/parry-feed) (OpenPhish + URLhaus, heavily false-positive filtered).

**Intervention**

- **Fake-login-form guard** — intercepts a submit that would send your credentials to a foreign domain (including programmatic `form.submit()` via a MAIN-world hook) and asks first. Single-sign-on logins via Google/Microsoft/Okta etc. are recognised as legitimate.
- **"Take me to the real site"** — one-click rescue link on brand-impersonation pages.
- **Crypto-wallet guard** — warns before risky `window.ethereum` requests (blind signatures, unlimited approvals, `setApprovalForAll`, Permit2/Seaport grants) and flags recovery-phrase harvesting.
- **Clipboard-hijack guard** — warns when a page copies a shell command or swaps a crypto address onto your clipboard ("paste this to verify" / ClickFix).
- **Tech-support scare-page guard** — throttles `alert`/`beforeunload` loops, detects "your PC is infected, call this number" text, and offers a one-click escape.
- Hides "you won a prize" / giveaway scam content.

**Tools & control**

- **Scam message checker** — paste any SMS/WhatsApp/email text or link into the popup for an instant, fully private verdict.
- **Trust a site** for 1 hour, until tomorrow, or always; **Report a mistake** in one tap.
- **Protection history and stats** — a local-only log of what was blocked or flagged (hostnames and event types only).
- Redesigned popup and settings, dark mode, first-run onboarding, accessible warnings (`role=alert`/`role=dialog`, Escape-to-cancel, focus management).
- Re-scans single-page apps on route changes.

## How it works

Everything runs inside the extension. There is no server-side analysis.

```
                        ┌──────────────────────── on your device ─────────────────────────┐
page load / SPA route ─►│ engine/features.js       URL features ─┐                         │
                        │ engine/heuristics.js     URL + DOM rules├─► engine/verdict.js    │
                        │ engine/url_model.js      URL model (GB) │   conservative fusion  ├─► banner · popup ·
                        │ engine/page_features.js                 │   safe / suspicious /  │   form guard ·
                        │ engine/page_model.js     page model (LR)┤   dangerous + reasons  │   rescue link
                        │ engine/image_hash.js     icon dHash vs  │                        │
                        │   + brand_icons.json     brand table   ─┘                        │
                        │ rules/blocklist.json     declarativeNetRequest (known-bad hosts) │
                        └──────────────────────────────────────────────────────────────────┘
```

| Stage | Where | What it does |
|---|---|---|
| URL features & rules | `engine/features.js`, `engine/heuristics.js`, `engine/constants.js` | Registrable-domain parsing (~150 multi-label public suffixes), brand/safe-domain tables, look-alike and token rules. |
| URL model | `engine/url_model.js` + `model/url-model.json` | Gradient-boosted trees (scikit-learn HistGradientBoosting, exported to JSON, evaluated in pure JS). Holdout acc 0.988 / AUC 0.998. |
| Page-content model | `engine/page_features.js`, `engine/page_model.js` + `model/page-content.json` | Logistic regression over 32,768 hashed tokens (FNV-1a) + 16 dense layout/form features. The same extractor runs in the browser and in the Node crawler, so there is no Python mirror to drift. |
| Icon matching | `engine/image_hash.js`, `engine/brand_icons.json` | dHash of the page's favicon/logo compared to 49 brand hashes (Hamming ≤ 4), with an order-independent ambiguity guard so near-identical brand icons can't collide. Icons are fetched by the service worker without cookies and cached in `storage.session`. |
| Fusion | `engine/verdict.js` | Content signals alone ≤ *suspicious*. *Dangerous* needs corroboration: a URL rule ≥ 0.3, the URL model ≥ 0.7 **and** at least one URL rule ≥ 0.15, or a visual (icon) brand match. |
| Intervention | `content/content_script.js`, `content/actions.js`, `content/detectors/*` | Banner, form guard, wallet/clipboard/tech-scam guards (MAIN world), rescue link, scam-content hiding. |
| Background | `background/service_worker.js` | Settings, trust list, history, feed updates (12 h alarm), icon hashing, report queue, per-tab verdict state. |
| UI | `popup.*`, `options.*`, `onboarding.html`, `ui/*` | 340 px popup with a 4-state status card, sidebar settings, onboarding, shared design tokens (`ui/tokens.css`), light/dark themes. |

The engine modules are DOM-free UMD wrappers, so the same files run in the browser, in `node --test`, and in the training crawler.

## Privacy

**Parry collects nothing by default.** All classification runs locally. Full policy: **<https://joelstephen97.github.io/parry/privacy.html>** (source: [`privacy.html`](privacy.html) / [`store/privacy-policy.md`](store/privacy-policy.md)).

The extension makes exactly three kinds of network request:

| Request | When | What is sent | Can be turned off |
|---|---|---|---|
| **Threat-feed download** | On install, then every 12 h | A plain GET for a static JSON file from GitHub — the same file for every user. Nothing about you or your browsing. | Yes — clear the feed URL in Settings (or point it at your own feed). |
| **Icon fetch** | When a page references a favicon/logo that needs checking | A GET for the icon file the page itself references (usually same-site, sometimes the site's CDN), with no cookies or credentials. No third party is contacted. | It is part of page analysis, which can be turned off in Settings. |
| **Community report** (relay) | **Only if you opt in** ("Help make Parry smarter"), and then only for pages flagged *dangerous* (max once per site per day) or when you press *Report a mistake* | Hostname, verdict + reason codes, numeric risk signals (hashed word counts, form/input/link counts — never text), matched brand names, extension version, hour. Never the full URL, page text, anything you typed, cookies, or any identifier. | Off by default; turn off any time and queued reports are discarded. |

Everything else — settings, trusted sites, protection history (hostnames + event types only, 200-event ring buffer), queued reports while opted in — lives in the browser's extension storage, can be cleared in Settings, and is removed on uninstall.

If you report a mistake while reporting is **off**, Parry simply opens a pre-filled GitHub issue in a new tab; nothing is sent unless you submit it yourself.

## Permissions

Parry requests the minimum it needs and has **not added a permission since 0.3.1** (adding one would disable the extension for existing users until re-approved).

| Permission | Why |
|---|---|
| `storage` | Settings, trusted sites, local history/stats, report queue. |
| `declarativeNetRequest` | Block known scam domains with a static ruleset — no reading or intercepting of your traffic. |
| `alarms` | The 12-hour feed refresh and the report-queue flush. |
| Host permissions `http://*/*`, `https://*/*` | Scams can be hosted anywhere, so the content script must be able to read the current page. Content scripts are statically declared; the `scripting` API is not used. |

No remote code, no WebAssembly, no `web_accessible_resources`. Reviewer-facing detail: [`store/permissions-justification.md`](store/permissions-justification.md).

## Threat feed

The blocklist is built in a separate open-source repo, **[joelstephen97/parry-feed](https://github.com/joelstephen97/parry-feed)**, and published as a static file:

```
https://raw.githubusercontent.com/joelstephen97/parry-feed/main/blocklist.json
```

- **Sources:** [OpenPhish](https://openphish.com/) community feed + [URLhaus](https://urlhaus.abuse.ch/) online URLs, reduced to domain-level rules.
- **False-positive guards:** anything in the Tranco top-10k is dropped; on shared hosts (`pages.dev`, `netlify.app`, `github.io`, …) only the exact abusive hostname is blocked; path-based gateways (IPFS, archive.org, Drive/Dropbox) are skipped; multi-label public suffixes can never become a rule; capped at 5,000 rules.
- **Schedule:** rebuilt daily by GitHub Actions; the extension downloads it on install and every 12 hours, shows *last updated* and rule count in Settings, and ships a 501-rule snapshot in [`rules/blocklist.json`](rules/blocklist.json) so blocking works before the first download.
- **Your choice:** Settings lets you point the URL at your own feed (same `{ "version": n, "rules": ["||host^", …] }` format) or clear it to disable downloads entirely.

## Optional community reporting (the relay)

Off by default. When a user turns on *Help make Parry smarter*, anonymised host-level reports go to a tiny relay so the models can be retrained on real misses and false positives.

```
browser (opt-in)                   Vercel project "scamshield-relay"            Neon Postgres         maintainer
────────────────                   ────────────────────────────────             ─────────────         ──────────
verdict ─► engine/report_payload ─► POST /api/report ───────────────────────► reports table ─┐
           (host-level, ≤ 32 KB)    validate · size-check · 60 req/h per IP    (no IPs, URLs,  │
           queue ≤ 50, flush 12 h   (IP kept only in memory)                    or page text)   │
                                    GET /api/export  (Bearer EXPORT_TOKEN) ◄──────────────────┘─► model/pull_reports.py
                                    GET /api/purge   (Vercel Cron 04:00 UTC, rows > 180 d)         └─► train_page.py / train.py
                                    GET /api/health                                                     └─► next store release
```

- Code: [`relay/`](relay/) (Node serverless functions, own `package.json` and 25 tests; deployed with Vercel **Root Directory = `relay`**). Live at `https://scamshield-relay-seven.vercel.app` (`/api/health`).
- Data model: [`relay/schema.sql`](relay/schema.sql) — `id, received_at, kind, label, host, reg_domain, level, score, ext_version, payload jsonb`. Rows are deleted after **180 days**.
- Payload contract: [`engine/report_payload.js`](engine/report_payload.js) (what the extension sends) and [`relay/lib/validate.js`](relay/lib/validate.js) (what the relay accepts). Anything outside the contract is rejected.
- Security: constant-time bearer-token comparison, `content-length` pre-check, platform-appended client IP used only as an in-memory rate-limit key, purge requires both the cron secret and Vercel's `x-vercel-cron` header. Details in [`relay/README.md`](relay/README.md).
- Retraining: `model/pull_reports.py` pulls new rows into local training data (user-labelled rows are trusted; auto "dangerous" rows go to a review file first). New models ship **inside the next store release** — there is no over-the-air model update.

## Project layout

```
manifest.json / manifest.firefox.json   MV3 manifests (Chromium / Firefox)
background/service_worker.js            settings, trust, history, feed OTA, icon hashing, report queue
content/                                content script, actions (banner/overlays), MAIN-world detectors
engine/                                 DOM-free detection engine (UMD; runs in browser + Node)
  constants.js  features.js  heuristics.js  verdict.js  trust.js
  url_model.js  page_features.js  page_model.js  image_hash.js  brand_icons.json
  message_rules.js  wallet_rules.js  clipboard_rules.js  techscam_rules.js  report_payload.js
model/                                  training code + shipped model JSON (see model/README.md)
rules/blocklist.json                    bundled declarativeNetRequest snapshot (refreshed from the feed)
ui/                                     shared design tokens, theme, icons, formatting, onboarding script
popup.* options.* onboarding.html       extension UI
privacy.html  index.html                GitHub Pages: privacy policy + project page
relay/                                  opt-in reporting relay (Vercel + Neon) — own package.json/tests
store/                                  store listing copy, permissions justification, screenshots, promo tiles
scripts/                                build.js (zips), bundle-models.js, crawl-pages.js, gen-parity.js
tools/                                  screenshots.js, promo.js, build-brand-hashes.js, measure-icon-fp.js
tests/unit                              node --test suites (375 tests)
tests/e2e                               Playwright suites + fixture servers (HTTP :5599 / HTTPS :5600)
```

## Development

```bash
npm install
npx playwright install chromium

npm run test:unit        # node --test, 375 tests
npm run test:e2e         # Playwright, 34 tests (headed: HEADLESS=false npx playwright test)
npm test                 # both
npm run build            # dist/parry-chrome.zip + dist/parry-firefox.zip (asserts size + manifest parity)
```

Other scripts: `npm run screenshots` (regenerate `store/screenshots/*` via Playwright + `tools/frame.html`), `npm run promo` (promo tiles), `npm run build:brands` (rebuild `engine/brand_icons.json` from live brand sites), `npm run measure:icon-fp` (icon false-positive sweep), `npm run gen:parity` (200-URL JS↔Python parity set), `npm run crawl:pages` (page-model training crawl — feature rows only, no HTML stored), `npm run bundle:models` (wrap model JSON into the `.js` bundles the manifest loads).

**E2E fixtures:** `tests/e2e/server.js` serves phishing/benign fixture pages on HTTP :5599 and HTTPS :5600 (self-signed cert in `tests/e2e/certs/`); the Playwright config maps fixture hosts such as `amazon.ae`, `accounts.google.com` and `secure-paypa1-login.com` to 127.0.0.1 with `--host-resolver-rules`. To see a warning by hand: `node tests/e2e/server.js`, load the unpacked extension, open `http://localhost:5599/phishing-login.html`.

**Relay:** `cd relay && npm install && npm test`. Deploy notes in [`relay/README.md`](relay/README.md).

**Conventions:** vanilla JS, no bundler, no TypeScript; engine modules are UMD and DOM-free; every detector ships with unit tests; anything user-visible gets an e2e; commits use conventional prefixes (`feat:`, `fix:`, `docs:`, `chore:`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Models

Both models are trained offline with scikit-learn, exported to JSON, and evaluated in pure JS (no runtime, no WASM). Working models are committed, so retraining is optional. Full details, metrics and caveats: [`model/README.md`](model/README.md).

| Model | Training data | Shipped as | Last metrics |
|---|---|---|---|
| URL (HistGradientBoosting) | `model/data/real.csv` — OpenPhish + URLhaus positives, Tranco negatives expanded with realistic deep paths (`build_dataset.py`), ~22.5k rows | `model/url-model.json` → `model/url-model.js` | acc 0.988 · precision 0.993 · recall 0.983 · AUC 0.998; a deep-URL regression gate runs on every training run |
| Page content (logistic regression) | `model/data/pages.jsonl` from `npm run crawl:pages` — 2,917 rows (375 positive / 2,542 negative incl. 269 legitimate login pages), 1,915 registrable domains | `model/page-content.json` → `model/page-content.js` | grouped-holdout AUC 0.886; threshold 0.80 chosen for precision (precision 1.000, FPR 0.00 % on legit-login holdout, recall 0.107 — content alone can only raise *suspicious*) |

```bash
# Python ≥ 3.10, from the repo root
python -m venv model/.venv && model/.venv/Scripts/python -m pip install -r model/requirements.txt
model/.venv/Scripts/python model/train.py            # URL model → url-model.json + url_parity.json
model/.venv/Scripts/python model/train_page.py       # page model → page-content.json + page_parity.json
npm run bundle:models && npm run test:unit           # parity tests assert JS == Python to 1e-4
```

Known limits (honest): the page model is data-limited (few live positives on any given day) — recall will improve as opt-in reports accumulate; 15 of the 64 brands have no icon hash yet (`npm run build:brands` re-run); Firefox ICO decoding is unverified.

## Releasing

1. Bump the version in **three** places: `manifest.json`, `manifest.firefox.json`, `package.json`; update `CHANGELOG.md` and, if user-visible, the `whatsNewSeen` version in `popup.js`.
2. `npm test && npm run build` — the build asserts the zip stays small (≤ 2.5 MB) and that the staged manifest matches the source.
3. Regenerate store assets if the UI changed: `npm run screenshots && npm run promo`.
4. Commit, tag (`git tag vX.Y.Z && git push origin refs/tags/vX.Y.Z`), then publish a GitHub Release with both zips attached: `gh release create vX.Y.Z dist/parry-chrome.zip dist/parry-firefox.zip --title "Parry X.Y.Z" --notes-file <notes>` (the Firefox install instructions link to the latest release).
5. Upload `dist/parry-chrome.zip` to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) and `dist/parry-firefox.zip` to AMO, using the copy in [`store/chrome-listing.md`](store/chrome-listing.md) / [`store/firefox-listing.md`](store/firefox-listing.md) and the checklist in [`store/submission-checklist.md`](store/submission-checklist.md).

## Upgrade safety

Active users are on the store version, so every release must be a drop-in upgrade:

- **No new permissions** — manifest permissions are exactly `storage`, `declarativeNetRequest`, `alarms` + http/https host permissions (a unit test guards the built manifest).
- **Storage is additive** — new settings get defaults on update; existing settings, trusted sites and history are never rewritten. `tests/e2e/upgrade.spec.js` boots the extension on a 0.3.1 storage fixture and checks nothing breaks.
- Old placeholder URLs (feed `''`, relay placeholder) are migrated to the current defaults; a user-customised URL is left alone.

## Our promises

Security extensions live or die on trust, and several well-known ones lost it — some sold browsing history, some quietly changed hands and turned malicious after an update. Parry is built so you don't have to take that on faith:

- **No telemetry, verifiable by you.** In normal use Parry makes at most three network requests, all listed in Settings → About: the public threat-list download, opt-in community reports (off by default), and same-page favicon fetches for brand matching. Open your browser's DevTools → Network tab and check — you'll see nothing else.
- **Permissions are frozen.** `storage`, `declarativeNetRequest`, `alarms` and http/https access — the same set since 0.3.1. A unit test fails the build if that ever changes, and a new permission would disable the extension for existing users until they re-approve it.
- **Everything is auditable.** The whole extension is open source (GPL-3.0-or-later) and releases are tagged and published with the exact zips; you can diff any version against the last.
- **It will not be sold or quietly re-owned.** The extension will not be transferred to a new owner without a clear, public heads-up in this repository and the changelog. No ads, no data resale, no account, ever.
- **On-device by default.** New detection features run inside the extension; nothing about your browsing leaves your device unless you explicitly opt in to community reporting.

## Contributing

Bug reports, false positives and missed scams are the most useful contributions — the easiest way is the in-extension **Report a mistake** button (opens a pre-filled issue when reporting is off) or [open an issue](https://github.com/joelstephen97/parry/issues/new). Pull requests welcome; please read [CONTRIBUTING.md](CONTRIBUTING.md) first (tests, the no-new-permissions rule, how to add a brand or a safe domain).

## Security

Please report vulnerabilities privately to **jojostev@gmail.com** rather than in a public issue — see [SECURITY.md](SECURITY.md) for scope (extension + relay) and what to expect.

## License

Parry is free software, released under the **GNU General Public License v3.0 or later** — see [LICENSE](LICENSE). You may use, study, modify and redistribute it under the same terms. The trained model files in `model/` and the brand-icon hash table are covered by the same license. If you want to embed the detection engine in a product under different terms, get in touch.

Third-party data: the threat feed is built from the [OpenPhish](https://openphish.com/) community feed and [URLhaus](https://urlhaus.abuse.ch/) (abuse.ch), each under their own terms; brand names and icons referenced for look-alike detection belong to their respective owners and are used solely to protect users from impersonation.

## Support the project

Parry is free, ad-free and on-device. If it helped you, consider supporting development via [GitHub Sponsors](https://github.com/sponsors/joelstephen97) or [PayPal](https://www.paypal.me/joelstephen1). Donations never change the privacy promise: nothing leaves your device.

Made by [Joel Stephen](https://github.com/joelstephen97) · contact: jojostev@gmail.com
