# ScamShield

On-device scam & phishing detection for Chromium (Chrome/Edge/Brave) and Firefox.
All classification runs locally — no browsing data leaves your device.

## How it works
A pure engine (engine/) extracts URL + DOM features, runs heuristics and a small
ONNX model (onnxruntime-web, on-device), and fuses them into a verdict
(safe / suspicious / dangerous). A content script warns you, guards fake login
forms, and hides scam content. A declarativeNetRequest ruleset blocks known-bad
domains. See docs/superpowers/specs for the design.

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
To use a bigger dataset, pass `--data path/to/urls.csv` with `url,label` columns
(label 1 = phishing). Then re-run the parity check (tests/unit/parity.test.js).

## Take it live
See store/submission-checklist.md. You need: a Chrome Web Store developer
account ($5 one-time), a Firefox AMO account (free), final icons, screenshots,
and a hosted privacy-policy URL (text in store/privacy-policy.md).

## Privacy
No browsing data is transmitted. Optional anonymous reporting is off by default.
See store/privacy-policy.md.
