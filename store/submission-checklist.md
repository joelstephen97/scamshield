# Store submission checklist

Live listing (Chrome Web Store): **https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl** (item ID `fojjjofjimbfoddafoampojopijnlihl`).
Firefox AMO: not yet listed — add the URL here, in `README.md`, `index.html` and `privacy.html` once live.

Listing copy lives in `chrome-listing.md` / `firefox-listing.md`; permissions + data-use text in `permissions-justification.md`; privacy policy at https://joelstephen97.github.io/scamshield/privacy.html (source `privacy-policy.md` → `/privacy.html`).

## Chrome Web Store (dashboard → item → Package / Store listing / Privacy)
- [ ] **Package:** upload `dist/scamshield-chrome.zip` (replaces the current draft; 0.4.0 was never uploaded and is superseded).
- [ ] **Store listing:** description + "What's new" from `chrome-listing.md`; category *Productivity → Tools* (or *Privacy & Security*); language English; homepage `https://joelstephen97.github.io/scamshield/`; support URL `https://github.com/joelstephen97/scamshield/issues`.
- [ ] **Localized listings (0.8.0):** in the dashboard's language selector (Store listing tab), add each of the 19 translated languages and paste its Name / Short description / Full description / What's new from `store/listings/<locale>.md`. Two directory names don't match the dashboard's language codes: `pt_BR` → select `pt-BR`, `zh_CN` → select `zh-CN` (hyphen, case-sensitive region suffix); every other locale code matches its `store/listings/` filename exactly. Firefox AMO stays English-only for now (its listing form has no per-language variants in `firefox-listing.md`'s current setup).
- [ ] **Graphics:** icon 128 (`assets/icons/icon128.png`), 5 screenshots 1280×800 from `screenshots/01–05`, small promo tile `promo-small-440x280.png`, marquee `promo-marquee-1400x560.png`.
- [ ] **Privacy tab — single purpose:** "Warns users about scam and phishing pages and blocks known scam domains, analysing pages on-device."
- [ ] **Privacy tab — permission justifications:** paste from `permissions-justification.md` (storage / declarativeNetRequest / alarms / host permissions / content scripts). **Remote code:** No.
- [ ] **Privacy tab — data usage:** tick only **Website content** and **Web history**, both described as "only when the user opts in to community reporting (off by default); hostname + derived numeric features, never URLs or page text". Certify all three statements (not sold, not used for unrelated purposes, not used for creditworthiness).
- [ ] **Privacy policy URL:** `https://joelstephen97.github.io/scamshield/privacy.html`.
- [ ] **Reviewer notes (0.10.0)** (supersedes the 0.9.0-era note previously here — see History for the older texts): "No new permissions since 0.3.1 (still storage, declarativeNetRequest, alarms + http/https). 0.10.0 adds: (1) per-result safety badges on Google/Bing/DuckDuckGo search pages — a content-script-only feature using the existing search-engine host matches already in manifest.json, no new host permissions, and looked up against the feed already cached on-device (no per-result network request); (2) a warning when a card-number or password form submits cross-origin, built on the existing form-guard content script; (3) a 'new domain' signal from a weekly Bloom-filter download (nrd.bloom) fetched from the same feed CDN as the rest of the threat feed — another plain file download, same privacy model, no new host; (4) a 'Copy report' clipboard button on warnings (user-gesture clipboard write, needs no permission); (5) `chrome.runtime.setUninstallURL()` now points at a static GitHub Pages page (`goodbye.html`) shown only when the user removes the extension — no permission, no data collection, the page reads only the version number already present in its own URL query string; and (6) a false-positive hardening fix — domain-hosting risk evidence (abused TLDs, free-hosting/dynamic-DNS) can no longer push a verdict to 'dangerous' on its own, benchmarked at 1.09M URLs (benign-flagged-dangerous 0.17% → 0.05%). No new network requests beyond the nrd.bloom file already described. CWS data-use form answers unchanged. Source: github.com/joelstephen97/scamshield."
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

- **0.9.0** — parry-feed pipeline v2 (425k+ block / ~1M warn domains, 14 aggregated sources), on-device fingerprint matcher with exact-shard confirmation, brand-lookalike upgrades, new URL risk signals (subdomain depth, long labels, IDN, shorteners, abused-TLD/dyndns/hoster tables). No new permissions.

### 0.9.0 data-use note
Nothing changed on the CWS data-use form: still tick only **Website content** and **Web history**, both described as opt-in community reporting only. The bigger threat feed and new risk signals are plain file downloads and on-device scoring — no new data collection.
