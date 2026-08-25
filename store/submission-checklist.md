# Store submission checklist

Live listing (Chrome Web Store): **https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl** (item ID `fojjjofjimbfoddafoampojopijnlihl`).
Firefox AMO: not yet listed — add the URL here, in `README.md`, `index.html` and `privacy.html` once live.

Listing copy lives in `chrome-listing.md` / `firefox-listing.md`; permissions + data-use text in `permissions-justification.md`; privacy policy at https://joelstephen97.github.io/scamshield/privacy.html (source `privacy-policy.md` → `/privacy.html`).

## Pre-flight (every release)
- [ ] Version bumped in `manifest.json`, `manifest.firefox.json`, `package.json` (all identical) and `CHANGELOG.md` has the section.
- [ ] `npm test` green (unit + e2e). `cd relay && npm test` green if the relay changed.
- [ ] `npm run build` → `dist/scamshield-chrome.zip` + `dist/scamshield-firefox.zip` (~170 KB; the build fails if > 2.5 MB or if the staged manifest drifts).
- [ ] Open the zip: contains `manifest.json`, `background/`, `content/`, `engine/`, `model/url-model.js` + `model/page-content.js` (no `.onnx`, no `vendor/`), `rules/`, `ui/`, `popup.*`, `options.*`, `onboarding.html`, `assets/icons/`.
- [ ] **Permissions unchanged** (`storage`, `declarativeNetRequest`, `alarms`, http/https hosts) — `tests/unit/build_manifest.test.js` enforces this. A new permission would disable the extension for existing users.
- [ ] UI changed? `npm run screenshots && npm run promo`, commit the PNGs.
- [ ] Network behaviour changed? Update `privacy-policy.md` + `/privacy.html` (date!), `permissions-justification.md`, and the CWS data-use answers below.
- [ ] `git tag vX.Y.Z && git push origin refs/tags/vX.Y.Z`, then `gh release create vX.Y.Z dist/scamshield-chrome.zip dist/scamshield-firefox.zip --title "ScamShield X.Y.Z" --notes-file <notes>` (v0.5.0: https://github.com/joelstephen97/scamshield/releases/tag/v0.5.0).

## Chrome Web Store (dashboard → item → Package / Store listing / Privacy)
- [ ] **Package:** upload `dist/scamshield-chrome.zip` (replaces the current draft; 0.4.0 was never uploaded and is superseded).
- [ ] **Store listing:** description + "What's new" from `chrome-listing.md`; category *Productivity → Tools* (or *Privacy & Security*); language English; homepage `https://joelstephen97.github.io/scamshield/`; support URL `https://github.com/joelstephen97/scamshield/issues`.
- [ ] **Graphics:** icon 128 (`assets/icons/icon128.png`), 5 screenshots 1280×800 from `screenshots/01–05`, small promo tile `promo-small-440x280.png`, marquee `promo-marquee-1400x560.png`.
- [ ] **Privacy tab — single purpose:** "Warns users about scam and phishing pages and blocks known scam domains, analysing pages on-device."
- [ ] **Privacy tab — permission justifications:** paste from `permissions-justification.md` (storage / declarativeNetRequest / alarms / host permissions / content scripts). **Remote code:** No.
- [ ] **Privacy tab — data usage:** tick only **Website content** and **Web history**, both described as "only when the user opts in to community reporting (off by default); hostname + derived numeric features, never URLs or page text". Certify all three statements (not sold, not used for unrelated purposes, not used for creditworthiness).
- [ ] **Privacy policy URL:** `https://joelstephen97.github.io/scamshield/privacy.html`.
- [ ] **Reviewer notes (0.6.0):** "No new permissions since 0.3.1 (still storage, declarativeNetRequest, alarms + http/https). 0.6.0 adds on-device-only detectors (ClickFix/fake-CAPTCHA, fake browser-update, leaky-form and fingerprinting DETECTION, fake-shop and sponsored-result checks) — none add a network request. Content scripts now use all_frames to scan iframe-hosted phishing forms. The Chrome background is an ES-module service worker (background/sw.js). Added chrome.i18n localization (20 locales) and an opt-in chrome.storage.sync for user settings (no new permission). Community reporting is still off by default and its payload is unchanged (hostnames + numeric features, see privacy policy §5). Source: github.com/joelstephen97/scamshield."
- [ ] Submit for review. Typical turnaround: 1–3 days; updates usually faster than first review.

## Firefox AMO (addons.mozilla.org/developers)
- [ ] Submit `dist/scamshield-firefox.zip` ("On this site" distribution).
- [ ] Listing from `firefox-listing.md` (name, summary, categories, license GPL-3.0-or-later, homepage, support URL, privacy URL, screenshots, What's new).
- [ ] Reviewer notes from `firefox-listing.md` (no remote code, no wasm, models trained via `model/train.py` / `model/train_page.py`; source repo is public so no separate source upload is needed, but link it).
- [ ] Submit; once approved record the AMO URL (see top of this file).

## Post-publish
- [ ] Confirm the listing shows the new version; install it fresh in a clean profile and check the onboarding page + a fixture warning.
- [ ] Upgrade check: a profile with the previous version updates without being disabled and keeps its settings/trusted sites/history.
- [ ] Reply to reviews; watch the install/rating dashboard (there is no in-extension analytics).
- [ ] After a few weeks with reporting live: `model/pull_reports.py` → retrain → next release.

## History
- **0.3.0** (Jun 2026) — rejected: unused `scripting` permission ("Purple Potassium"). Fixed in 0.3.1 (permission removed, `web_accessible_resources` narrowed, FP overhaul).
- **0.3.1** — published (current store version before 0.5.0).
- **0.4.0** — built and tagged, never uploaded; superseded by 0.5.0.
- **0.5.0** — page analysis, icon look-alike detection, ORT removed (14 MB → ~0.6 MB), redesigned UI, opt-in reporting relay. No new permissions.
- **0.6.0** — ClickFix/fake-update/tech-scam/delivery-fee guards, privacy pack (leaky-form, fingerprinting, notification-lure), fake-shop + sponsored-result checks, tiered interstitial warnings + strict mode, all_frames iframe scanning, ES-module SW, 30k dynamic-rule budget, settings export/import + opt-in sync, 20-language i18n. No new permissions. Zip ~237 KB.

### 0.6.0 data-use note
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. The new detectors are on-device and send nothing. i18n and settings sync add no data collection (sync uses the browser's own account sync). Update the localized store listings (ar, es, hi, fr, pt_BR at minimum) from the translated `_locales`, noting they are AI-generated pending native review.
