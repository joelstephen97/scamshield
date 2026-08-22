# ScamShield

On-device scam & phishing detection for Chromium (Chrome/Edge/Brave) and Firefox.
All classification runs locally — no browsing data leaves your device.

## How it works
A pure engine (engine/) extracts URL + DOM features, runs heuristics, and two
small on-device models — a gradient-boosted URL classifier and a page-content
classifier that reads the page's wording, layout and login form — and fuses
them into a verdict (safe / suspicious / dangerous). Both models run as plain
JS: no WebAssembly runtime, no web-accessible resources. A content script
warns you, guards fake login forms, and hides scam content. A
declarativeNetRequest ruleset blocks known-bad domains.

## Features
- On-device heuristics + a pure-JS gradient-boosted URL classifier (no data
  leaves the device, no bundled runtime).
- **Page analysis**: an on-device model reads the page itself — wording,
  layout, login-form structure — to catch brand-new phishing pages a
  URL-only check would miss. Conservative by design: content signals alone
  only ever raise a yellow "suspicious" warning; a second, corroborating
  signal is needed to turn a page red.
- **Brand look-alike detection by icon**: favicons/logos are hash-matched
  against a 64-brand table (49 with icon hashes), including UAE banks,
  telcos and government services (Emirates NBD, ADCB, FAB, Mashreq, e&, du,
  Noon, UAE PASS, MOHRE, Dubai Police…), so a page using a brand's icon on
  the wrong domain is flagged even if the brand's name never appears.
- Warning banner for suspicious/dangerous pages (with plain-language reasons)
  and a one-click *Take me to the real site* rescue link on brand
  impersonation.
- Fake-login-form guard: intercepts submits to a foreign domain — including
  programmatic `form.submit()` via a MAIN-world hook — and confirms before send.
- **Crypto-wallet guard**: warns before risky `window.ethereum` requests
  (blind-sign, unlimited approvals, setApprovalForAll, Permit2/Seaport grants)
  and flags wallet recovery-phrase harvesting.
- **Clipboard-hijack guard**: warns when a page copies a shell command or swaps a
  crypto address onto your clipboard ("paste this to verify" / ClickFix scams).
- **Tech-support scare-page guard**: throttles alert/`beforeunload` loops, detects
  fake-virus scare text + "call this number", and offers a one-click escape.
- Hides "you won a prize" / giveaway scam content.
- **Scam message checker**: paste any SMS/WhatsApp/email text into the popup
  for an instant, fully-private verdict.
- Re-scans on SPA route changes (history pushState/replaceState/popstate).
- Built-in safe-domain allowlist for top sites to minimize false positives;
  trust a site for 1 hour, until tomorrow, or always.
- Real threat feed on by default — a daily-rebuilt open-source blocklist
  (OpenPhish + URLhaus), plus optional download-only OTA blocklist updates.
- Local-only protection history and "threats blocked" counter (never
  transmitted), and first-run onboarding.
- **Optional community reporting, off by default** — "Help make ScamShield
  smarter" sends only the site's host name and anonymized risk signals for
  dangerous verdicts or reported mistakes; never URLs, page text, or anything
  identifying.
- Accessible warnings (role=alert / role=dialog, Escape-to-cancel, focus mgmt),
  dark mode, and a redesigned popup and settings.
- Chromium (Chrome/Edge/Brave) and Firefox (128+) builds.

## Size
About **1 MB unpacked / ~90 KB zipped**, down from 14 MB in earlier versions —
removing the ONNX runtime and running both models as plain JS is most of the
saving.

## Screenshots
See `store/screenshots/` for the current set: the popup on a dangerous
look-alike page, the in-page rescue banner, the popup's safe state with the
message checker open, the redesigned Options (dark mode), and the
wallet/scare-page overlay. The same set is used for the Chrome Web Store and
Firefox AMO listings.

## Support
ScamShield is free and on-device. If it helped you, please consider supporting
development — [GitHub Sponsors](https://github.com/sponsors/joelstephen97) or
[PayPal](https://www.paypal.me/joelstephen1). Donations never change the
privacy promise: nothing leaves your device.

## Develop
- `npm install` then `npx playwright install chromium`
- Unit tests: `npm run test:unit`
- E2E tests: `npm run test:e2e` (headed: `set HEADLESS=false && npx playwright test`)
- All: `npm test`
- Build store zips: `npm run build` → dist/

## Load it manually (test live)
**Chrome/Edge/Brave:** go to chrome://extensions → enable Developer mode →
Load unpacked → select this folder. Visit tests/e2e/pages/phishing-login.html
(serve via `node tests/e2e/server.js`, then http://localhost:5599/phishing-login.html)
to see the warning.

**Firefox:** about:debugging#/runtime/this-firefox → Load Temporary Add-on →
select manifest.firefox.json. (Temporary add-ons are removed on restart.)

## Retrain the model (optional — a working model is committed)
```
cd model
python -m venv .venv && .venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python train.py --data data/sample.csv --out phishing-url.onnx
```
`train.py` reports honest holdout metrics (stratified 25% test split:
precision/recall/F1/AUC) and then refits on all rows for the shipped model. The
bundled `data/sample.csv` is a small **synthetic seed set** — its holdout scores
are optimistic because it's trivially separable. For realistic metrics, pass
`--data path/to/urls.csv` with `url,label` columns (label 1 = phishing), e.g. a
PhishTank/OpenPhish + Tranco mix. Then re-run the parity check
(tests/unit/parity.test.js).

## Privacy
All analysis runs on your device. Optionally (off by default), you can help ScamShield improve by turning on "Help make ScamShield smarter" to send anonymized reports — only when a page is flagged *dangerous* or when you report a mistake. Icon fetches (favicon/logo) are from the same site you visit, with no cookies or credentials; no third party learns about your browsing. No new permissions were added in v0.5.0, and the ONNX runtime and web-accessible resources were removed. Read the full [privacy policy](https://joelstephen97.github.io/scamshield/privacy.html).
