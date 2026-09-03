# Firefox AMO Listing

**Name:** Scam & Phishing Blocker: ScamShield
**Summary:** Blocks scam sites, phishing pages and fake shops. 100% on-device: your browsing never leaves your computer.
**Categories:** Privacy & Security
**License:** GNU General Public License v3.0 or later (GPL-3.0-or-later) — source: https://github.com/joelstephen97/scamshield
**Homepage:** https://joelstephen97.github.io/scamshield/
**Support URL:** https://github.com/joelstephen97/scamshield/issues

**Description:** paste the `## Full description` section of `store/listings/en.md`
verbatim. It is plain text (no markdown), which is also what AMO's description
field expects. Do not re-add brand or competitor lists — see the two rules in
`chrome-listing.md`; the same keyword-spam policy applies on AMO.

**What's new:** paste the `## What's new (0.12.0)` section of `store/listings/en.md`.

**Data collection (manifest, Firefox 140+ built-in consent):** `required: ["none"]`
(nothing is collected by default) and `optional: ["websiteActivity"]` for the
off-by-default community reporting (anonymized host name + numeric risk signal
of a page flagged dangerous, never URLs or page text). Settings requests that
grant from Firefox the moment the user turns the reporting switch on; if it
is denied the switch stays off. `strict_min_version` is 142.0 (the consent
system's Android minimum; desktop needs 140). `web-ext lint` on the package:
0 errors; the remaining warnings are the pre-existing UNSAFE_VAR_ASSIGNMENT
notes on innerHTML writes of our own constant SVG icon strings.

**Localized listings:** AMO supports per-locale descriptions; the 19 files under
`store/listings/<locale>.md` can be pasted the same way (English-only is fine
for the first AMO submission).

**Notes for AMO reviewers (0.12.0):**
- 0.12.0 block page: a few declarativeNetRequest dynamic redirect rules
  (main_frame only, `requestDomains` + `regexSubstitution`) send a navigation
  to a block-listed domain to the extension's own `blocked.html` with the
  blocked address in the fragment; paused/trusted sites get a higher-priority
  allow rule. If the browser rejects the redirect rule the worker falls back
  to plain block rules. No web-accessible resources, no new permission.
- No remote code. All detection logic is unminified vanilla JS, bundled
  directly in the package under `engine/` and `model/`.
- No WebAssembly. Both the URL model and the page-content model run as plain
  JS; no web-accessible resources.
- All analysis is on-device, including the 0.11.0 QR-code decoder (it reads
  images already loaded in the page via a canvas; cross-origin images that
  taint the canvas are skipped). Optional anonymous reporting (host name +
  anonymized risk signals only, never URLs or page text) is off by default
  and only fires for pages flagged dangerous or reported as a mistake.
- The only default network activity is downloading the public threat-feed
  files (block/warn lists and the weekly new-domain Bloom filter) from the
  open-source feed's CDN.
- Icon/logo fetches for brand look-alike matching are same-site requests to
  the page you're already on (no cookies/credentials sent, nothing shared
  with a third party).
- Source of the models: trained offline via `model/train.py` and
  `model/train_page.py` (both included in the repo).

**Privacy policy URL:** https://joelstephen97.github.io/scamshield/privacy.html
**Also published on:** Chrome Web Store — https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl
