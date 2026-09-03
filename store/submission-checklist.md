# Store submission checklist

Live listing (Chrome Web Store): **https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl** (item ID `fojjjofjimbfoddafoampojopijnlihl`).
Firefox AMO: not yet listed — add the URL here, in `README.md`, `index.html` and `privacy.html` once live.

Listing copy lives in **`store/listings/en.md`** (canon) + 19 `store/listings/<locale>.md` translations; `chrome-listing.md` / `firefox-listing.md` hold the URLs, category and reviewer notes and say which section goes in which dashboard field. Permissions + data-use text in `permissions-justification.md`; privacy policy at https://joelstephen97.github.io/scamshield/privacy.html (source `privacy-policy.md` → `/privacy.html`).

**Listing text is plain text, no markdown, no entity lists** (CWS rejection "Yellow Argon", 2026-09-03 — see `chrome-listing.md`). `tests/unit/listings.test.js` fails the build on `**bold**`, `*italics*`, backticks, `- ` bullets, any named UAE bank/agency from the flagged list, any competitor product name, or a comma-run of five or more capitalised names, in any locale.

## Pre-flight (every release)
- [ ] Version bumped in `manifest.json`, `manifest.firefox.json`, `package.json` (all identical) and `CHANGELOG.md` has the section.
- [ ] `npm test` green (unit + e2e). `cd relay && npm test` green if the relay changed.
- [ ] `npm run build` → `dist/scamshield-chrome.zip` + `dist/scamshield-firefox.zip` (the build fails if > 2.5 MB or if the staged manifest drifts).
- [ ] Open the zip: contains `manifest.json`, `background/`, `content/`, `engine/`, `model/url-model.js` + `model/page-content.js` (no `.onnx`, no `vendor/`), `rules/`, `ui/`, `popup.*`, `options.*`, `onboarding.html`, `goodbye.html` is NOT packaged (it is a Pages-only file), `assets/icons/`.
- [ ] **Permissions unchanged** (`storage`, `declarativeNetRequest`, `alarms`, http/https hosts) — `tests/unit/build_manifest.test.js` enforces this. A new permission would disable the extension for existing users.
- [ ] UI changed? `npm run screenshots && npm run promo`, commit the PNGs.
- [ ] Network behaviour changed? Update `privacy-policy.md` + `/privacy.html` (date!), `permissions-justification.md`, and the CWS data-use answers below.
- [ ] `git tag vX.Y.Z && git push origin refs/tags/vX.Y.Z`, then `gh release create vX.Y.Z dist/scamshield-chrome.zip dist/scamshield-firefox.zip --title "ScamShield X.Y.Z" --notes-file <notes>`.

## Chrome Web Store (dashboard → item → Package / Store listing / Privacy)
- [ ] **Package:** upload `dist/scamshield-chrome.zip` (replaces the current draft; 0.4.0 was never uploaded and is superseded).
- [ ] **Store listing (English):** REPLACE the whole Title / Summary / Description with the `## Name` / `## Short description` / `## Full description` + `## What's new (0.12.0)` sections of `store/listings/en.md` — the description currently live on the item is the 0.5-era text that Google rejected; do not merge, overwrite. Category *Privacy & Security* (or *Productivity → Tools*); language English; homepage `https://joelstephen97.github.io/scamshield/`; support URL `https://github.com/joelstephen97/scamshield/issues`.
- [ ] **Localized listings:** in the dashboard's language selector (Store listing tab), add/replace each of the 19 translated languages and paste its Name / Short description / Full description / What's new from `store/listings/<locale>.md` (all 19 retranslated for 0.11.0 from the new plain-text canon). Two directory names don't match the dashboard's language codes: `pt_BR` → select `pt-BR`, `zh_CN` → select `zh-CN` (hyphen, case-sensitive region suffix); every other locale code matches its `store/listings/` filename exactly. Firefox AMO stays English-only for now.
- [ ] **Graphics:** icon 128 (`assets/icons/icon128.png`), 7 screenshots 1280×800 from `screenshots/01–07` (06 = QR scan, 07 = block page, new in 0.11/0.12), small promo tile `promo-small-440x280.png`, marquee `promo-marquee-1400x560.png`.
- [ ] **Privacy tab — single purpose:** "Warns users about scam and phishing pages and blocks known scam domains, analysing pages on-device."
- [ ] **Privacy tab — permission justifications:** paste from `permissions-justification.md` (storage / declarativeNetRequest / alarms / host permissions / content scripts). **Remote code:** No.
- [ ] **Privacy tab — data usage:** tick only **Website content** and **Web history**, both described as "only when the user opts in to community reporting (off by default); hostname + derived numeric features, never URLs or page text". Certify all three statements (not sold, not used for unrelated purposes, not used for creditworthiness).
- [ ] **Privacy policy URL:** `https://joelstephen97.github.io/scamshield/privacy.html`.
- [ ] **Reviewer notes (0.12.0)** (supersedes the 0.10.0 note — see History for the older texts): "No new permissions since 0.3.1 (still storage, declarativeNetRequest, alarms + http/https). This submission also replaces the store description in response to the 'Yellow Argon' keyword-spam notice: the list of regional bank/agency names has been removed from every language's listing. 0.12.0 adds a block page for domains already on the block list: a few declarativeNetRequest dynamic *redirect* rules (main_frame only, up to 2,500 domains each via requestDomains, regexSubstitution carrying the blocked address in the URL fragment) send the navigation to the extension's own blocked.html instead of Chrome's blank ERR_BLOCKED_BY_CLIENT page; the page explains the block and offers a one-hour pause, which is implemented as a higher-priority dynamic *allow* rule for that site. No web_accessible_resources are declared (a DNR redirect to the extension's own page needs none), no new host, no network activity — the page only messages the extension's own service worker to increment the local counters. 0.11 added: (1) on-device QR-code scanning — the content script draws images already loaded in the page onto a canvas and decodes any QR code locally with a bundled pure-JS decoder, then scores the decoded URL with the existing verdict engine; cross-origin images that taint the canvas are skipped, no image or decoded content leaves the device, no new permission or host; a settings toggle ('Scan QR codes automatically', default on) and a 'Scan now' button in the popup; (2) the existing cross-origin card/credential form warning now also covers forms a page submits programmatically; (3) a fix that stops the tech-support-scam detector re-registering 'unload' handlers on sites whose Permissions-Policy forbids them (console-noise only). Since 0.10.0, unchanged: search-result safety badges (content-script-only, looked up against the on-device feed), the weekly nrd.bloom new-domain file (a plain download from the same feed CDN as the threat lists), 'Copy report' (user-gesture clipboard write), and the static goodbye.html uninstall page. No new network requests. CWS data-use form answers unchanged. Source: github.com/joelstephen97/scamshield."
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
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. The new detectors are on-device and send nothing. i18n and settings sync add no data collection (sync uses the browser's own account sync). All 19 translated `store/listings/<locale>.md` files are ready to paste in per the localized-listings step above; they are AI-generated pending native review (`ur`, `mr`, `te` highest priority — see `_locales/README.md`).

- **0.7.0** — Statistics tab (local counters + 90-day daily buckets + since-install lifetime totals), earned in-popup review ask (2nd blocked threat + 7 days, Chrome only), per-user language override (`uiLang`, synced only via opt-in sync). No new permissions.

### 0.7.0 data-use note
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. The new Statistics tab, review-ask prompt and language override are all on-device/local (or synced only via the user's own existing opt-in browser sync) and send nothing over the network.

- **0.8.0** — redesigned popup (time-boxed "Pause protection" menu, since-install/this-week stats row, "Why this verdict?" disclosure, rotating footer), comparison page. No new permissions.

### 0.8.0 reviewer notes (superseded)
"No new permissions since 0.3.1 (still storage, declarativeNetRequest, alarms + http/https). 0.8.0 also redesigns the popup: the per-site allowlist control is now a time-boxed 'Pause protection' menu (1 hour / 1 day / Always), the stats row shows since-install and this-week blocked counters (all counted in chrome.storage.local, never transmitted), the existing evidence list is grouped under a 'Why this verdict?' disclosure, and the footer rotates between an on-device notice, the existing policy-compliant review ask (unchanged gating from 0.7.0), and a support link. New icon, same single purpose. No new network requests. CWS data-use form answers unchanged. Source: github.com/joelstephen97/scamshield."

- **0.9.0** — scamshield-feed pipeline v2 (425k+ block / ~1M warn domains, 14 aggregated sources), on-device fingerprint matcher with exact-shard confirmation, brand-lookalike upgrades, new URL risk signals (subdomain depth, long labels, IDN, shorteners, abused-TLD/dyndns/hoster tables). No new permissions.

### 0.9.0 data-use note
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. The bigger threat feed and new risk signals are plain file downloads and on-device scoring — no new data collection.

- **0.10.0** — SERP safety badges, cross-origin card/credential exfil warning, NRD new-domain signal (nrd.bloom), copy-shareable catch reports, goodbye.html uninstall page, FP-doctrine fix (risk evidence can't escalate to dangerous). No new permissions.

### 0.10.0 reviewer notes (superseded)
"No new permissions since 0.3.1 (still storage, declarativeNetRequest, alarms + http/https). 0.10.0 adds: (1) per-result safety badges on Google/Bing/DuckDuckGo search pages — a content-script-only feature using the existing search-engine host matches already in manifest.json, no new host permissions, and looked up against the feed already cached on-device (no per-result network request); (2) a warning when a card-number or password form submits cross-origin, built on the existing form-guard content script; (3) a 'new domain' signal from a weekly Bloom-filter download (nrd.bloom) fetched from the same feed CDN as the rest of the threat feed — another plain file download, same privacy model, no new host; (4) a 'Copy report' clipboard button on warnings (user-gesture clipboard write, needs no permission); (5) `chrome.runtime.setUninstallURL()` now points at a static GitHub Pages page (`goodbye.html`) shown only when the user removes the extension — no permission, no data collection, the page reads only the version number already present in its own URL query string; and (6) a false-positive hardening fix — domain-hosting risk evidence (abused TLDs, free-hosting/dynamic-DNS) can no longer push a verdict to 'dangerous' on its own, benchmarked at 1.09M URLs (benign-flagged-dangerous 0.17% → 0.05%). No new network requests beyond the nrd.bloom file already described. CWS data-use form answers unchanged. Source: github.com/joelstephen97/scamshield."

- **0.11.0** (Sep 2026) — **rejected 2026-09-03, "Yellow Argon" (Keyword Spam)**: the description still live on the item was the 0.5-era text naming "Emirates NBD, ADCB, FAB, Mashreq, e&, du, Noon, UAE PASS, MOHRE, Dubai Police" (">5 entities"). Fix: whole listing rewritten as plain text (the markdown `**bold**` in the 0.8–0.10 listings was also being shown literally), no brand lists beyond three names, no competitor names, all 20 locales retranslated, guard tests added, sixth screenshot (QR scan). Resubmit with the new description pasted over the old one — an appeal is not needed, the violation is real.

### 0.11.0 data-use note
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. QR decoding is on-device (canvas + bundled JS decoder) and sends nothing.
