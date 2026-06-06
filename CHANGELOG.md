# Changelog

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
