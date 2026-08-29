# Firefox AMO Listing

**Name:** Parry — Scam & Phishing Protection
**Summary:** On-device scam & phishing protection: warns you, spots brand look-alikes, checks messages. Nothing leaves your device.
**Categories:** Privacy & Security
**License:** GNU General Public License v3.0 or later (GPL-3.0-or-later) — source: https://github.com/joelstephen97/parry
**Homepage:** https://joelstephen97.github.io/parry/
**Support URL:** https://github.com/joelstephen97/parry/issues

**Description:** (reuse the Chrome description text above)

**What's new in 0.5.0 (since the 0.3.1 store version):** (reuse the Chrome "What's new" text above)

**Notes for AMO reviewers:**
- No remote code. All detection logic is unminified vanilla JS, bundled
  directly in the package under `engine/` and `model/`.
- The ONNX runtime and its WebAssembly binary were removed in 0.5.0; both the
  URL model and the new page-content model run as plain JS with no wasm and
  no web-accessible resources.
- All analysis is on-device. Optional anonymous reporting (host name +
  anonymized risk signals only, never URLs or page text) is off by default
  and only fires for pages flagged dangerous or reported as a mistake.
- Icon/logo fetches for brand look-alike matching are same-site requests to
  the page you're already on (no cookies/credentials sent, nothing shared
  with a third party).
- Source of the models: trained offline via `model/train.py` and
  `model/train_page.py` (both included in the repo).

**Privacy policy URL:** https://joelstephen97.github.io/parry/privacy.html
**Also published on:** Chrome Web Store — https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl
