# Changelog

All notable changes to ScamShield. Versions are git tags (`vX.Y.Z`); the version on the [Chrome Web Store](https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl) may lag a tag by a few days while Google reviews it. Privacy-relevant changes are also reflected in the [privacy policy](https://joelstephen97.github.io/scamshield/privacy.html).

## 0.12.1 — 2026-09-06

### Changed
- **Store updates now apply as soon as they arrive.** Chrome and Firefox
  download a new ScamShield version in the background but only switch to it
  once the extension is idle, which in practice meant the next browser
  restart, sometimes days later. ScamShield now listens for the downloaded
  update and reloads itself the moment no popup, settings page or block page
  is open and no threat-feed, rule or report job is mid-write; while any of
  those is busy it re-checks every minute and applies the update regardless
  after 30 minutes. On Chrome it also asks the browser to look for a new
  version alongside the 12-hour feed refresh. No new permissions, no new
  network requests, nothing leaves the device. Your settings, allowlist,
  pauses and statistics are all in storage and survive the reload.
- Chrome Web Store promo tiles use the real ScamShield icon; the Bangla
  listing was re-aligned with the English canon.

## 0.12.0 — 2026-09-03

### New
- **A ScamShield block page for known scam sites.** Domains on the block
  list have always been stopped at the network level, but until now that
  showed Chrome's bare "blocked by client" error and left no trace: the
  catch was not counted, not in history, and there was no way to get
  through if the list was wrong. A main-frame navigation to a listed domain
  (threat feed or the packaged ruleset) now lands on `blocked.html`, which
  names the site, says why it was blocked (with the feed sources when the
  domain is in the 0.9 feed), offers "Go back to safety" and "Copy report",
  and a "Visit anyway" link that pauses ScamShield on that site for an hour.
  Each block counts once toward threats blocked (so it also feeds the
  earned review ask), the statistics ring, and the protection history
  ("Blocked site" chip). Implemented as a declarativeNetRequest redirect
  rule (up to 2,500 domains per rule) — no new permissions, no
  web-accessible resources, nothing leaves the device.

### Fixed
- **Pausing or trusting a site now works at the network level too.** Every
  paused or trusted site gets a higher-priority allow rule, so the popup's
  pause menu (and the new block page's "Visit anyway") can actually let a
  block-listed site load. Previously a network-blocked site could never be
  paused because its page never loaded.
- **"Block known scam sites" off now removes the downloaded block rules at
  once** instead of leaving them active until the next 12-hour refresh.

## 0.11.1 — 2026-09-03

### Fixed
- **Firefox: built-in data-collection consent declared.** AMO now requires
  every new extension to declare Firefox's data-collection consent in the
  manifest; the 0.11.0 Firefox package would have been refused at upload.
  ScamShield declares `required: ["none"]` (it collects nothing by default)
  and the opt-in community reporting as an optional `websiteActivity`
  grant, which Settings now requests from Firefox 140+ the moment you turn
  the reporting switch on (deny it and the switch stays off). Minimum
  Firefox is now 142 (the version the consent system needs on Android; 140
  on desktop). The Chrome build is unchanged apart from the version number.
- The end-to-end suite can now run against an unpacked release zip
  (`SCAMSHIELD_EXT_PATH`), which is how this release was verified.

## 0.11.0 — 2026-09-03

### Store listing
- **Rewritten in response to a Chrome Web Store keyword-spam rejection**
  ("Yellow Argon", 2026-09-03). The description that was live on the item
  still named ten UAE banks and agencies in one breath; Google flagged the
  list as excessive metadata. The whole listing is now plain text (the
  store never rendered the old `**bold**`, it showed the asterisks), names
  no more than three brands in any one place, drops competitor names from
  the FAQ, and is retranslated into all 19 other languages from the new
  canon. `tests/unit/listings.test.js` now fails on markdown, the flagged
  names, competitor names or any comma-run of five or more capitalised
  names, in any locale. Sixth store screenshot added for the QR scan.
- The nine QR-scan UI strings and the what's-new banner are translated into
  all 19 locales (they had shipped in English only in the 0.11.0-dev build).

### New
- **QR-code ("quishing") scanning — on your device.** ScamShield can now
  decode QR codes shown in a page's images and check where they lead *before*
  you scan them with your phone. Open the popup and press "Scan now" on any
  page, or leave the default-on automatic scan to catch QR-phishing in webmail
  without a click. Every code is decoded and checked locally — nothing about
  the QR or the page leaves your device. New "Scan QR codes automatically"
  toggle under Settings → Scams.

### Improved
- **Card-theft protection now covers auto-submitted forms.** The cross-origin
  credential/card-exfil warning previously fired only on forms you submit
  yourself; it now also catches forms a page submits *programmatically* to a
  different domain — a path scam scripts used to slip past the warning.
- **Refreshed competitor comparison.** The "how ScamShield compares" page now
  covers the full 2026 field, including the new cloud AI scam-checkers (Norton
  Genie, Trend Micro, Bitdefender Scamio), and states the contrast plainly:
  those send your messages to a server; ScamShield checks everything on your
  device.
- **Wider false-positive allowlist** in the threat feed — more regional bank,
  government and marketplace domains (UAE, South-East Asia, India), so a
  poisoned source can never cause one of them to be blocked.

### Fixed
- Silenced a console warning flood on sites (such as Gmail) whose
  Permissions-Policy disallows `unload`: the tech-support-scam detector's event
  hook no longer forwards those already-blocked registrations through its own
  frame, so the browser stops attributing the policy warning to ScamShield.

## 0.10.0 — 2026-08-30

### New
- **SERP safety badges** — on Google, Bing and DuckDuckGo results pages,
  each result now gets a small red or amber dot when its domain is on the
  block list, the warn list, or matches a strong brand-lookalike, so a risky
  result is visible before you click it rather than after. Results are
  checked in one batched, network-free lookup against the feed already
  cached on your device; a clean result gets no badge at all — there's no
  green noise. Handles infinite-scroll and paginated results as they load.
- **Cross-origin credential/card exfil warning** — a password or card-number
  form that submits to a different domain than the one you're on (and isn't
  a known SSO or payment processor) now shows a dismissible warning before
  it goes through, the same way the existing leaky-form guard already warns
  on beaconed form fields.
- **"New site" signal** — a newly-registered-domain Bloom filter (updated
  weekly, on-device, same privacy model as the rest of the threat feed) adds
  a quiet, capped piece of evidence when a page's domain was registered
  very recently, easing off once you've safely visited that domain for 30+
  days.
- **Copy-shareable catch report** — dangerous and suspicious warnings (both
  the in-page banner and the popup) now have a "Copy report" button that
  puts a plain-text summary — defanged hostname, verdict, top reasons, and
  a link back to the project — on your clipboard, for pasting into a group
  chat or forum thread.
- **Uninstall feedback page** — uninstalling ScamShield now opens a static,
  no-tracking page (`goodbye.html`) with a link to say why you left and a
  link straight to the false-positive report flow. No form, no analytics,
  no account — there's nothing else to send.

### Fixed
- **False-positive hardening.** Risk-table evidence (abused-TLD and
  dyndns/free-hoster membership) can no longer, on its own or compounded
  with weak URL signals, push a verdict to *dangerous* — it still counts
  fully toward *suspicious*. Benchmarked against 1.09M URLs: the
  benign-flagged-at-dangerous rate fell from 0.17% to 0.05%, with detection
  recall at *suspicious or above* unchanged.

No new permissions; no new data collection. SERP badges reuse the existing
search-engine content-script matches, the "new site" signal is another feed
file downloaded the same way as the rest of the threat feed, and the
uninstall page is static and collects nothing.

## 0.9.0 — 2026-08-29

### Threat filter, rebuilt
- **parry-feed pipeline v2**: aggregates 14 license-vetted open-source
  threat databases (Phishing.Database, PhishDestroy, MetaMask,
  ScamSniffer, HaGeZi, polkadot-js, malware-filter and more) into
  ~425k confirmed-bad domains (block tier) + ~1M watchlist domains
  (warn tier), gated against the Tranco top-100k and brand allowlists.
  OpenPhish and URLhaus were removed — their licenses never allowed
  redistribution. The feed repo is now GPL-3.0 with per-source attribution.
- **On-device matcher**: the extension downloads the feed as sorted 40-bit
  hash fingerprints (~2 MB block / ~5 MB warn), stores them in IndexedDB and
  checks pages with a local binary search. Hits are confirmed against an
  exact-domain shard before any hard warning, and the warning shows which
  sources reported the domain. Updates are sha256-verified deltas every 6
  hours via CDN; the legacy blocklist keeps updating for older installs.
- **Brand lookalike upgrades**: allowlist-first matching, homoglyph and
  edit-distance detection with strict guards (evidence-only, capped below
  hard-block on its own).
- **New URL risk signals** (ported from Google's Apache-2.0
  suspicious-site-reporter, with NOTICE): deep subdomain chains, ≥22-char
  labels, IDN flags, shortener hosts; plus abused-TLD / dynamic-DNS /
  badware-hoster tables from the feed.
- No new permissions; no new data collection — feed downloads are the only
  network activity, disclosed in the privacy policy.

## 0.8.0 — 2026-08-29

### Naming note
- 0.8.0 briefly renamed the project to "Parry" in this repository. The
  rename was reverted in 0.10.0, before any store submission carried it —
  store users only ever saw ScamShield. Repo and feed URLs are unchanged.

### New
- **Redesigned popup** — a time-boxed *Pause protection* menu (1 hour, 1 day
  or Always) replaces the old trust wording; hero counters show threats
  stopped since install and this week at a glance; every warning opens to a
  *Why this verdict?* panel listing the exact reasons behind it; and a
  rotating footer alternates a quiet privacy reminder, the earned review ask
  and a support link instead of showing all three at once.
- **Comparison page** — [`docs/comparison.md`](docs/comparison.md), a sourced
  feature-and-privacy comparison against Guardio, Malwarebytes Browser
  Guard, Norton Safe Web, McAfee WebAdvisor, Bitdefender TrafficLight,
  Netcraft, Avast Online Security and ScamAdviser, with every claim traced
  to that product's own listing or disclosure.

0.8.0 adds no new permissions and makes no new network requests.

## 0.7.1 — 2026-08-28

### New
- **Popup language switcher** — a globe button in the popup header, next to
  Settings, opens the same 20-language picker the Settings page already has.
  Picking a language writes the same `uiLang` setting the Settings dropdown
  does (they stay in sync either way) and reloads the popup in that language
  immediately.

0.7.1 adds no new permissions, no new messages, and makes no new network
requests — it reuses the language override shipped in 0.7.0.

## 0.7.0 — 2026-08-28

### New
- **Statistics tab** — a new tab in Settings pairs the number that should stay
  rare (threats stopped) with the number that's always moving (pages checked
  on-device), plus privacy findings and a daily activity chart, toggleable
  between the last 7 days, 30 days, and a since-install lifetime view. Every
  count is computed and stored on-device; nothing here is ever transmitted.
- **Earned review ask** — after ScamShield has actually blocked something
  twice and been installed at least 7 days, the popup shows a quiet,
  in-popup-only ask for a review — never a page warning, and never while a
  page warning is on screen. *Maybe later* snoozes it for 90 days and asks at
  most twice; *No thanks* is permanent. Chrome only (there's no Firefox
  listing to review yet).
- **Language override** — a Settings dropdown lets you pick ScamShield's
  language independently of your browser's, defaulting to "Browser default."
  The choice is stored in one setting (`uiLang`) and syncs across your
  devices only if you've already turned on your own browser's sync — it has
  no effect on the language the Chrome Web Store listing itself displays.

0.7.0 adds no new permissions and makes no new network requests.

## 0.6.1 — 2026-08-28

### Fixed
- **Popup right edge no longer clipped on Windows.** With classic (non-overlay)
  scrollbars, the scrollbar/reserved gutter shrank the popup viewport while the
  page stayed a fixed 340px wide, silently cutting off the right edge (the
  Support link, card padding). Scrolling now happens inside the popup body, so a
  scrollbar takes its width from the content — which reflows — instead of
  clipping it.
- Status card no longer draws a colored left accent line; the state color lives
  in the icon alone.

## 0.6.0 — 2026-08-25

The "real problems only" release — every feature is driven by validated
real-world scam and privacy data, and none of it adds a permission. Nothing
still leaves your device by default.

### New protection
- **ClickFix / fake-CAPTCHA blocker** — the fastest-growing malware delivery
  trick of 2025 (fake "verify you're human" pages that get you to paste a
  command into Windows Run). ScamShield now overwrites the malicious clipboard
  payload and blocks the page full-screen.
- **Fake browser-update blocker** — a browser "update" prompt rendered *by a
  web page* is always fake. Blocked full-screen when the download doesn't go to
  the real browser vendor.
- **Tech-support scare pages** — a decisive new signal (a phone number inside a
  fake security alert that name-drops Microsoft/Apple) plus alarm-audio
  detection, and the escape button now dismantles the page's screen-lock and
  Back-button traps before it leaves.
- **Delivery-fee phishing** — fake DHL/FedEx/Aramex/Royal Mail/Evri/Emirates
  Post/DPD "pay a small redelivery fee" card pages are blocked.
- **Wallet drainer upgrades** — EIP-6963 multi-wallet support, EIP-7702
  account-delegation detection, and clearer plain-language explanations of what
  a "Permit" signature actually authorises.
- **IDN homograph detection** — domains that spell a brand with look-alike
  foreign characters (e.g. Cyrillic "аррӏе") are now caught and named.

### New privacy tools (all on-device)
- **Leaky-form warning** — tells you when a site sends the email or phone you
  typed to a tracker *before* you press submit (plain or hashed).
- **Fingerprinting detection** — names the script building a device fingerprint
  to track you across sites.
- **Notification-trap warning** — flags the "click Allow to continue" pop-up
  spam trick.
- **Fake-shop checks** — fake countdowns that reset, fake "only 2 left"
  pressure, hotlinked trust badges, off-platform payment (Zelle/wire/crypto)
  and missing contact details, surfaced in a popup shopping card.
- **Sponsored-result check** — on Google/Bing/DuckDuckGo, flags a sponsored
  result whose ad goes somewhere other than the site it shows.

### Warnings that actually work
- A new **full-screen interstitial tier** for the near-certain scams, with an
  enforced few-second delay before "Continue anyway" and a real vs. fake domain
  comparison — reserved for near-zero-false-positive detections so it never
  cries wolf.
- **Site-engagement gating** quietly suppresses low-confidence warnings on
  sites you visit often (fewer false alarms).
- **Strict mode** — one toggle that blocks even "suspicious" pages full-screen
  with simpler wording, for helping a less-confident relative stay safe.

### Control, privacy & reach
- Settings reorganised into clear categories, with every new feature
  individually toggleable.
- **Full 20-language localization** (English, Chinese, Hindi, Spanish, Arabic,
  French, Bengali, Portuguese, Russian, Urdu, Indonesian, German, Japanese,
  Marathi, Telugu, Turkish, Tamil, Vietnamese, Korean, Italian) — every
  user-visible string, not just the core UI: engine reason codes (via the new
  `ui/reasons.js` resolver), options hints and aria-labels, popup, in-page
  warnings, onboarding, and the Chrome Web Store listing copy itself
  (`store/listings/`). RTL layout (`ar`, `ur`) and locale-aware date/time
  formatting via `Intl`. Non-English translations are AI-generated and
  pending native-speaker review (`ur`, `mr`, `te` highest priority).
- **Settings export/import** and optional **cross-device sync** (your browser's
  own sync; still no ScamShield account or server).
- A **"what leaves your device" receipt** in Settings listing the only three
  requests ScamShield can make, so you can verify zero-telemetry yourself.

### Platform
- Now scans inside **iframes** (`all_frames`) — iframe-hosted phishing forms
  were invisible before.
- Blocklist capacity raised from 5,000 to **30,000** rules on Chrome (reads the
  runtime limit; Firefox stays at its 5,000 cap).
- ES-module service worker; `minimum_chrome_version` 121.

**No new permissions.** Still `storage`, `declarativeNetRequest`, `alarms` and
http/https access, exactly as 0.3.1.

## 0.5.0 — 2026-08-22

### Since 0.3.1 (what users updating from the store version get)
- **Page analysis** — an on-device model now reads the page's wording, layout
  and form structure (not just the address) to catch brand-new phishing pages
  a URL-only check would miss. Trained on a 375-positive / 2,542-negative live
  crawl (holdout AUC 0.886). Conservative by design: on its own, content
  analysis only ever raises a yellow "suspicious" banner — it takes a second,
  corroborating signal to turn a page red.
- **Brand look-alike detection by icon** — favicons/logos are hash-matched
  against a 64-brand table (49 with icon hashes), including UAE banks, telcos and
  government services: Emirates NBD, ADCB, FAB, Mashreq, RAKBANK, e&, du,
  Noon, Aramex, Talabat, Careem, ADNOC, DEWA, ICP, MOHRE, Dubai Police, UAE
  PASS, Emirates, Etihad — plus PayPal, Microsoft, Google, Apple, DHL and
  more. A page using a brand's icon with a password form on the wrong domain
  is flagged, even if the brand's name never appears anywhere on the page.
  The favicon-hotlink loophole (serving the real brand's icon file directly)
  is closed.
- **Real threat feed, on by default** — a daily-rebuilt list (OpenPhish +
  URLhaus, false-positive filtered) with a bundled snapshot; Settings show
  last-updated time and rule count.
- **Scam message checker** — paste any SMS/WhatsApp/email text or link into
  the popup for an instant on-device verdict.
- **Protection history** and a one-click **"Take me to the real site"**
  rescue button on brand-impersonation warnings.
- **Redesigned popup and settings** — a single status card with one clear
  action (*Leave this page* / *Show why*), plain-language reasons, *Trust
  this site for 1 hour / until tomorrow / always*, *Report a mistake*, stats
  and recent history, dark mode, and explained toggles throughout Settings.
- **Smaller and faster** — about 0.6 MB unpacked / ~170 KB zipped, down from
  14 MB: the ONNX runtime is gone. Both models now run as plain JS, with no
  WebAssembly and no web-accessible resources.
- **Optional community reporting, off by default** — "Help make ScamShield
  smarter" sends only the site's host name and anonymous risk signals, and
  only for pages flagged dangerous or that you report as a mistake. Never
  URLs, page text, or anything that identifies you. Not sold, and not used
  for anything other than improving detection accuracy.
- **URL model retrained** as gradient-boosted trees running as pure JS,
  with deep-link negatives added to fix a path-length bias (accuracy 0.988,
  ROC-AUC 0.998).
- **No new permissions.** Settings, trusted sites and history from 0.3.1
  carry over unchanged; the update is a drop-in.

### Added / Changed / Fixed (detail)

**Engine & models**
- feat: drop ONNX runtime — URL model runs as pure JS (14 MB -> ~0.6 MB unpacked)
- feat(engine): pure-JS gradient-boosted URL model evaluator
- fix(engine): bounds check and baseline validation for url_model; add malformed tree test
- feat(model): retrain URL model as gradient-boosted trees; JSON export + 200-URL parity
- feat(engine): shared page-content feature extractor (browser + linkedom)
- fix(engine): unparseable form action is FOREIGN, not same-host (page_features)
- feat(engine): pure-JS page-content logistic model evaluator
- fix(engine): page_model lazy-load and inline-model edge cases
- feat(model): page-content training crawler (feature rows only, no HTML stored)
- fix(model): dedup crawl rows by hostname+path, cap positives per host
- feat(model): crawler — Phishing.Database positives source, --conc and --shuffle flags
- fix(model): crawler feed downloads get their own timeout/size budget
- fix(model): crawler uses today's Phishing.Database files; source-ordered positives
- feat(engine): conservative fusion of page-content and icon signals
- feat(engine): dHash primitives for icon/logo brand matching
- feat(engine): 60-brand table with auth domains, icon hashes, word-boundary name matching
- feat(model): page-content classifier trained on live crawl; int8 export + parity
- fix(model): page-model threshold chosen for <=0.5% FPR on all legit pages (min 0.80)
- fix(tools): order-independent brand icon ambiguity guard (sub-brand keeps the hash)
- fix(engine): hotmail.com under microsoft so the icon guard keeps Microsoft's hash
- feat(engine): visual brand-impersonation rules; drop favicon-host exemption
- feat: page analysis — content model + icon brand matching wired into scan (gated, fail-open, no new permissions)
- fix(content): icon corroboration only from the visual-impersonation flag; timer cleanup
- test(e2e): HTTPS fixture server; page-analysis e2e un-fixme'd

**Reporting**
- feat(engine): pure report payload builder (host-level, no URL path/text)
- fix(engine): report payload size backstop and numeric guards
- feat: opt-in community reporting — queued host-level reports, user reports, GitHub fallback
- feat(relay): scamshield report relay - validate, rate-limit, store, export, purge
- fix(relay): strict numeric validation, input validation, constant-time tokens, trusted client IP, cron header

**Docs**
- docs: disclose opt-in reporting and same-site icon fetch

**UI, store & release**
- feat(ui): design tokens, theme, time-boxed trust, tab stats & leave-tab messages
- feat(ui): redesigned popup - status card, evidence, time-boxed trust, report, stats
- feat(ui): redesigned options - sidebar sections, explained toggles, feed status, appearance
- fix(ui): popup hidden-attr override, trust menu a11y, faster init
- feat(ui): in-page warning card, leave/report actions, overlay evidence rows
- feat(ui): onboarding - detector cards, pin step, reporting note
- feat: point reporting at the live relay; privacy docs; alt/aria carve-out hardening; relay gitignore
- fix(content): alt/aria SSO false positive, timer leak; popup drops unused URL model
- perf(engine): iterative body-text walk with a node/char budget
- fix(engine): brand icon provenance + logo-vs-icon gating, dictionary-word names, session-cached parallel icon hashing
- fix(model): retrain URL model with deep-link negatives + a regression gate; verdict fallback
- docs(model): document --compare-onnx target and updated retrain numbers
- fix(build): package model/page-content.js; guard against missing manifest files
- feat(store): composed 1280x800 screenshots tooling and refreshed promo tiles
- test(e2e): popup report test tolerant of GitHub login redirect
- test(e2e): 0.3.1 → 0.5.0 storage upgrade; options tab a11y + mark-as-mistake test

## 0.4.0 — 2026-08-08

### Added
- **Real threat feed, on by default.** The blocklist now actually blocks
  things: a daily-rebuilt open-source feed
  (github.com/joelstephen97/scamshield-feed; OpenPhish + URLhaus sources,
  Tranco top-10k false-positive guard, shared-hosting scoping, 5,000-rule
  cap) is the default OTA source, fetched on install and every 12 h. A
  500-rule static snapshot ships inside the package for out-of-the-box
  protection. Options gained a "Reset to official feed" button. Existing
  installs with an unconfigured feed URL are migrated to the default.
- **Scam message checker.** Paste any SMS/WhatsApp/email text into the popup
  for an instant on-device verdict (`engine/message_rules.js`): credential-ask
  detection with a negation guard (real "do not share your OTP" messages stay
  safe), grouped scam-topic phrases (delivery-fee, bank-threat, job, crypto,
  prize) with urgency as an amplifier only, and every embedded link scored by
  the page URL engine.
- **Protection history.** Local-only ring buffer (200 events, hostnames only,
  never full URLs) of warnings and blocks across all detectors, rendered in
  Settings with a clear button.
- **"Take me to the real site."** Brand-impersonation warnings now include a
  one-click rescue button to the impersonated brand's genuine website.
- **One-time support ask.** After the first dangerous block, a single
  never-repeated toast invites sponsoring the project.

### Changed
- **Model retrained on real-world data** (18,032 rows: OpenPhish + URLhaus
  positives, Tranco-derived negatives incl. regional ccTLD storefront logins).
  Holdout: accuracy 0.987, precision 0.998, recall 0.976, ROC-AUC 0.996.
  Dataset builder: `model/build_dataset.py` (deterministic, public sources).

## 0.3.1 — 2026-08-08

### Fixed
- **Chrome Web Store rejection (Use of Permissions).** Removed the unused
  `scripting` permission from both manifests — content scripts are statically
  declared and the `chrome.scripting` API was never called.
- **False positives on real regional brand sites.** `amazon.ae`, `amazon.co.uk`,
  `google.com.sg`, `netflix.co.jp` and similar ccTLD storefront logins were
  flagged as brand impersonation / lookalikes. `BRAND_DOMAINS` and
  `SAFE_DOMAINS` now carry regional storefronts and brand infra
  (`microsoftonline.com`, `primevideo.com`, …), and an exact-brand SLD on an
  ordinary ccTLD is treated as on-brand — while `amazon.tk` (high-abuse TLD)
  is now correctly flagged, a new true positive.
- **Approximate eTLD+1 parsing.** One canonical `registrableDomain()` (with a
  ~150-entry multi-label public-suffix subset) in `engine/constants.js`
  replaces three naive last-two-label copies; `.co.uk`/`.com.sg`-style hosts
  now parse correctly everywhere, including the popup trust list. Cross-domain
  credential posts between different `.com.sg` domains are now detected (they
  previously compared equal).
- **SSO logins were blocked as phishing.** Password forms posting to known
  identity providers (Google, Microsoft, Okta, Auth0, …
  `KNOWN_AUTH_PROVIDERS`) no longer trigger the dangerous verdict or the
  submit-guard modal.
- **Suspicious-token matching uses word boundaries.** "windows" no longer
  counts as `win`, "accountant" as `account`, "freelance" as `free`.
- **Trusted sites could still show wallet/clipboard/tech-scam warnings.** The
  MAIN-world detector bridges now respect the built-in safe list and the
  user's trusted-sites list, like the page scanner always did.
- **Wallet overlay collision auto-allowed the request.** If a second risky
  wallet request arrived while a warning was already on screen it was silently
  approved; it is now denied with the standard user-rejected error (4001) and
  a toast, and does not inflate the threats-blocked counter.

### Changed
- Narrowed `web_accessible_resources` from `vendor/*` to the two ONNX-runtime
  files actually loaded from page context (smaller fingerprinting surface).
- `SUSPICIOUS_TLDS` gained `pw`, `cc`, `ws`, `icu`, `buzz`.
- Parity fixtures are now generated (`npm run gen:parity`, 15 URLs) and
  cross-checked against the Python extractor (`model/check_parity.py`);
  `model/train.py` mirrors the new feature semantics. Model retrain on real
  data is deferred to the next release (rule fusion bounds the drift: the
  model can only raise the rule score, never lower it).
- Tests: 89 unit (+28), 12 e2e (+2: safe-domain suppression, SSO no-modal).

## 0.3.0 — 2026-06-06

### Added
- **Crypto-wallet drainer guard.** A MAIN-world hook on `window.ethereum.request`
  pre-screens dangerous operations (blind `eth_sign`, unlimited ERC-20 `approve`,
  `setApprovalForAll`, Permit2/Seaport transfer grants) and shows a confirm overlay
  before the wallet popup; cancelling rejects with EIP-1193 4001. Fail-open on any
  internal error so legitimate dApps never break. Recovery-phrase harvesting forms
  are flagged dangerous. Pure logic in `engine/wallet_rules.js`.
- **Clipboard-hijack guard.** Hooks `navigator.clipboard.writeText` and copy events
  to warn (non-blocking toast) when a page writes a shell command or a crypto
  address to the clipboard ("paste-this-to-verify" / ClickFix scams).
  `engine/clipboard_rules.js`.
- **Fake tech-support / scare-page guard.** Throttles `alert`/`confirm`/`prompt`
  floods, notes forced fullscreen and back-button traps, detects scare text +
  "call this number", and offers a one-click escape overlay. `engine/techscam_rules.js`.
- **Brand-visual phishing.** `scoreDom` now flags pages that name/brand themselves as
  a popular brand (title, og:site_name, favicon, logo alt) on an off-brand domain
  with a login form. New `BRAND_DOMAINS` map; expanded `SAFE_DOMAINS`.
- **Real OTA blocklist updater** (replaces the stub): download-only fetch of a
  user-configured `{version, rules}` JSON → `updateDynamicRules`, on a 12h alarm and
  on demand. Never uploads.
- **First-run onboarding page**, a local-only **"threats blocked" counter**, and
  **donation/support** wiring (popup, options, README, FUNDING.yml).
- **Guides:** `docs/GUIDE.md` (usage + how it works), `docs/MONETIZATION.md`,
  `docs/PUBLISHING.md`.

### Tests
- +21 unit tests (wallet/clipboard/techscam/brand) → 57 total; +4 e2e → 10 total.

## 0.2.0 — 2026-06-05

### Added
- **Programmatic `form.submit()` interception.** A MAIN-world guard hooks
  `HTMLFormElement.submit()` and emits a cancelable event the isolated content
  script acts on, closing the credential-phishing bypass that capture-phase
  `submit` listeners can't see. Native behaviour is preserved for non-guarded
  forms (no spurious `submit` event).
- **SPA re-scanning.** The guard surfaces `pushState`/`replaceState`/`popstate`
  so the content script re-evaluates client-side route changes (debounced).
- **Built-in safe-domain allowlist** for top legitimate sites (host/subdomain
  match) to minimize false positives.
- **Accessible warnings:** banner `role=alert`; phishing overlay `role=dialog` +
  `aria-modal`, Escape-to-cancel, and focus moved to the Cancel button.
- **Real icon art** (green shield + white check, antialiased) replacing
  placeholder squares.
- **Honest model evaluation.** `train.py` now reports stratified holdout
  precision/recall/F1/AUC, then refits on all rows for the shipped ONNX. Seed
  dataset expanded to 255 diverse rows (synthetic; swap a real corpus via
  `--data` for realistic metrics).

### Fixed
- `blockKnownBad` toggle is now wired to `declarativeNetRequest.updateEnabledRulesets`
  (previously inert).

## 0.1.0 — 2026-06-05

Initial release: on-device heuristics + ONNX URL classifier, warning banner,
fake-login-form guard, scam-content hiding, `declarativeNetRequest` blocklist,
popup + options, Chromium + Firefox builds, and a store-submission package.
