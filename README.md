# ScamShield

On-device scam & phishing detection for Chromium (Chrome/Edge/Brave) and Firefox.
All classification runs locally — no browsing data leaves your device.

## How it works
A pure engine (engine/) extracts URL + DOM features, runs heuristics and a small
ONNX model (onnxruntime-web, on-device), and fuses them into a verdict
(safe / suspicious / dangerous). A content script warns you, guards fake login
forms, and hides scam content. A declarativeNetRequest ruleset blocks known-bad
domains. See docs/superpowers/specs for the design.

## Features
- On-device heuristics + ONNX URL classifier (no data leaves the device).
- Warning banner for suspicious/dangerous pages (with reasons).
- Fake-login-form guard: intercepts submits to a foreign domain — including
  programmatic `form.submit()` via a MAIN-world hook — and confirms before send.
- **Crypto-wallet guard**: warns before risky `window.ethereum` requests
  (blind-sign, unlimited approvals, setApprovalForAll, Permit2/Seaport grants)
  and flags wallet recovery-phrase harvesting.
- **Clipboard-hijack guard**: warns when a page copies a shell command or swaps a
  crypto address onto your clipboard ("paste this to verify" / ClickFix scams).
- **Tech-support scare-page guard**: throttles alert/`beforeunload` loops, detects
  fake-virus scare text + "call this number", and offers a one-click escape.
- **Brand-visual phishing**: catches pages that impersonate a brand by name/logo
  on an off-brand domain with a login form.
- Hides "you won a prize" / giveaway scam content.
- Re-scans on SPA route changes (history pushState/replaceState/popstate).
- Built-in safe-domain allowlist for top sites to minimize false positives.
- `declarativeNetRequest` blocklist + optional download-only OTA blocklist updates.
- Local-only "threats blocked" counter (never transmitted) and first-run onboarding.
- Accessible warnings (role=alert / role=dialog, Escape-to-cancel, focus mgmt).
- Chromium (Chrome/Edge/Brave) and Firefox (128+) builds.

## Support
ScamShield is free and on-device. If it helped you, please consider supporting
development — [GitHub Sponsors](https://github.com/sponsors/joelstephen97) or
[PayPal](https://www.paypal.me/joelstephen1). Donations never change the
privacy promise: nothing leaves your device. See `docs/MONETIZATION.md`.

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

## Take it live
See store/submission-checklist.md. You need: a Chrome Web Store developer
account ($5 one-time), a Firefox AMO account (free), final icons, screenshots,
and a hosted privacy-policy URL (text in store/privacy-policy.md).

## Privacy
No browsing data is transmitted. Optional anonymous reporting is off by default.
See store/privacy-policy.md.
