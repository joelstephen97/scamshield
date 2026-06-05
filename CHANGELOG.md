# Changelog

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
