# Changelog

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
