# Permission Justifications (for store reviewers)

- **storage** — save user settings and the trusted-sites allowlist locally.
- **declarativeNetRequest** — block known scam/phishing domains using a static
  ruleset. The extension does not read or intercept the user's network traffic;
  blocking is rule-based and privacy-preserving.
- **alarms** — schedule an optional, periodic (12h) download-only refresh of the
  scam-domain blocklist. Only runs if the user sets an update URL; nothing is uploaded.
- **scripting / content scripts on http(s)** — read the current page's URL and
  DOM to detect phishing forms and scam content. Analysis is on-device; no page
  data is transmitted.
- **host_permissions http/https** — required so protection works on any site the
  user visits, since scams can be hosted anywhere.

No remote code is loaded. The ML model and WASM runtime are bundled in the
package and run locally.
