# Store submission checklist

Live listing (Chrome Web Store): **https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl** (item ID `fojjjofjimbfoddafoampojopijnlihl`).
Firefox AMO: not yet listed — add the URL here, in `README.md`, `index.html` and `privacy.html` once live.

Listing copy lives in `chrome-listing.md` / `firefox-listing.md`; permissions + data-use text in `permissions-justification.md`; privacy policy at https://joelstephen97.github.io/parry/privacy.html (source `privacy-policy.md` → `/privacy.html`).

## 0.8.0 rename (ScamShield → Parry) — one-time steps
This release renames the extension; do these in addition to the normal pre-flight below.
- [ ] **Chrome Web Store dashboard:** for *every* published language, update Store listing → Product name to `Scam & Phishing Blocker: Parry` and paste the new Short/Full description + "What's new (0.8.0)" from `store/listings/<locale>.md` (en is canon; the 19 translations carry the same rename).
- [ ] Upload the new icon (`assets/icons/icon128.png`) if the dashboard caches an old one separately from the package.
- [ ] Regenerate and upload new screenshots/promo tiles reflecting the redesigned popup: `npm run screenshots && npm run promo`, then upload the 5 screenshots, small promo tile and marquee.
- [ ] **Privacy tab → Privacy policy URL:** update to `https://joelstephen97.github.io/parry/privacy.html` (the repo/Pages URLs already moved in 0.8.0's migration commit; verify the dashboard field itself was actually saved, not just the source file).
- [ ] Reviewer notes: mention the rename explicitly so a reviewer doesn't flag a "new" listing — "Renamed from ScamShield to Parry (0.8.0); same extension ID, no change to data practices or permissions. Old GitHub repo/Pages URLs redirect to the new `joelstephen97/parry` location."
- [ ] **AMO (addons.mozilla.org):** same name/summary/description update in `firefox-listing.md`; update the add-on's listed name and homepage/support URLs if AMO caches them separately from the manifest.
- [ ] **Nominate for the Chrome Web Store Featured badge** once the 0.8.0 listing is live and has cleared review — Parry meets the stated criteria by design (privacy, quality, no dark patterns) and this is a natural checkpoint to ask, since the listing copy and screenshots are freshly updated.
- [ ] After both stores show the new name, do a final sweep for any leftover "ScamShield" text in dashboard-only fields the repo doesn't control (dashboard developer name/contact page, any saved-but-unpublished draft listings).

## Pre-flight (every release)
- [ ] Version bumped in `manifest.json`, `manifest.firefox.json`, `package.json` (all identical) and `CHANGELOG.md` has the section.
- [ ] `npm test` green (unit + e2e). `cd relay && npm test` green if the relay changed.
- [ ] `npm run build` → `dist/parry-chrome.zip` + `dist/parry-firefox.zip` (~170 KB; the build fails if > 2.5 MB or if the staged manifest drifts).
- [ ] Open the zip: contains `manifest.json`, `background/`, `content/`, `engine/`, `model/url-model.js` + `model/page-content.js` (no `.onnx`, no `vendor/`), `rules/`, `ui/`, `popup.*`, `options.*`, `onboarding.html`, `assets/icons/`.
- [ ] **Permissions unchanged** (`storage`, `declarativeNetRequest`, `alarms`, http/https hosts) — `tests/unit/build_manifest.test.js` enforces this. A new permission would disable the extension for existing users.
- [ ] UI changed? `npm run screenshots && npm run promo`, commit the PNGs.
- [ ] Network behaviour changed? Update `privacy-policy.md` + `/privacy.html` (date!), `permissions-justification.md`, and the CWS data-use answers below.
- [ ] `git tag vX.Y.Z && git push origin refs/tags/vX.Y.Z`, then `gh release create vX.Y.Z dist/parry-chrome.zip dist/parry-firefox.zip --title "Parry X.Y.Z" --notes-file <notes>` (v0.5.0: https://github.com/joelstephen97/parry/releases/tag/v0.5.0).

## Chrome Web Store (dashboard → item → Package / Store listing / Privacy)
- [ ] **Package:** upload `dist/parry-chrome.zip` (replaces the current draft; 0.4.0 was never uploaded and is superseded).
- [ ] **Store listing:** description + "What's new" from `chrome-listing.md`; category *Productivity → Tools* (or *Privacy & Security*); language English; homepage `https://joelstephen97.github.io/parry/`; support URL `https://github.com/joelstephen97/parry/issues`.
- [ ] **Localized listings (0.8.0):** in the dashboard's language selector (Store listing tab), add each of the 19 translated languages and paste its Name / Short description / Full description / What's new from `store/listings/<locale>.md`. Two directory names don't match the dashboard's language codes: `pt_BR` → select `pt-BR`, `zh_CN` → select `zh-CN` (hyphen, case-sensitive region suffix); every other locale code matches its `store/listings/` filename exactly. Firefox AMO stays English-only for now (its listing form has no per-language variants in `firefox-listing.md`'s current setup).
- [ ] **Graphics:** icon 128 (`assets/icons/icon128.png`), 5 screenshots 1280×800 from `screenshots/01–05`, small promo tile `promo-small-440x280.png`, marquee `promo-marquee-1400x560.png`.
- [ ] **Privacy tab — single purpose:** "Warns users about scam and phishing pages and blocks known scam domains, analysing pages on-device."
- [ ] **Privacy tab — permission justifications:** paste from `permissions-justification.md` (storage / declarativeNetRequest / alarms / host permissions / content scripts). **Remote code:** No.
- [ ] **Privacy tab — data usage:** tick only **Website content** and **Web history**, both described as "only when the user opts in to community reporting (off by default); hostname + derived numeric features, never URLs or page text". Certify all three statements (not sold, not used for unrelated purposes, not used for creditworthiness).
- [ ] **Privacy policy URL:** `https://joelstephen97.github.io/parry/privacy.html`.
- [ ] **Reviewer notes (0.8.0)** (supersedes the 0.7.0 note previously here — see History for the older texts): "Renamed from ScamShield to Parry (0.8.0): same extension ID, same publisher, no change to data practices or permissions — old GitHub repo/Pages URLs redirect to the new `joelstephen97/parry` location. No new permissions since 0.3.1 (still storage, declarativeNetRequest, alarms + http/https). 0.8.0 also redesigns the popup: the per-site allowlist control is now a time-boxed 'Pause protection' menu (1 hour / 1 day / Always), the stats row shows since-install and this-week blocked counters (all counted in chrome.storage.local, never transmitted), the existing evidence list is grouped under a 'Why this verdict?' disclosure, and the footer rotates between an on-device notice, the existing policy-compliant review ask (unchanged gating from 0.7.0), and a support link. New icon, same single purpose. No new network requests. CWS data-use form answers unchanged. Source: github.com/joelstephen97/parry."
- [ ] Submit for review. Typical turnaround: 1–3 days; updates usually faster than first review.

## Firefox AMO (addons.mozilla.org/developers)
- [ ] Submit `dist/parry-firefox.zip` ("On this site" distribution).
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
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. The new detectors are on-device and send nothing. i18n and settings sync add no data collection (sync uses the browser's own account sync). All 19 translated `store/listings/<locale>.md` files are ready to paste in per the localized-listings step above; they are AI-generated pending native review (`ur`, `mr`, `te` highest priority — see `_locales/README.md`).

- **0.7.0** — Statistics tab (local counters + 90-day daily buckets + since-install lifetime totals), earned in-popup review ask (2nd blocked threat + 7 days, Chrome only), per-user language override (`uiLang`, synced only via opt-in sync). No new permissions.

### 0.7.0 data-use note
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. The new Statistics tab, review-ask prompt and language override are all on-device/local (or synced only via the user's own existing opt-in browser sync) and send nothing over the network.
