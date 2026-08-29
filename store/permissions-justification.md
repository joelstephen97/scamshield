# Permission Justifications (for store reviewers)

- **storage** — save user settings and the trusted-sites allowlist locally.
- **declarativeNetRequest** — block known scam/phishing domains using a static
  ruleset. The extension does not read or intercept the user's network traffic;
  blocking is rule-based and privacy-preserving.
- **alarms** — schedule an optional, periodic (12h) download-only refresh of the
  scam-domain blocklist. Only runs if the user sets an update URL; nothing is uploaded.
- **content scripts on http(s)** — statically declared in the manifest (the
  `chrome.scripting` API is not used and not requested). They read the current
  page's URL and DOM to detect phishing forms and scam content. Analysis is
  on-device; no page data is transmitted.
- **host_permissions http/https** — required so protection works on any site the
  user visits, since scams can be hosted anywhere.

**Network activity:** The only network calls are (1) a one-way download of the threat-feed blocklist (optional, can be disabled in Settings), (2) optional opt-in community reports (off by default, sent to a relay only when you turn on "Help make Parry smarter"), and (3) same-site icon fetches to recognise brand look-alikes (no cookies or credentials sent; no third party learns about your browsing).

**Version 0.5.0:** No new permissions were added. The ONNX runtime and web-accessible resources were removed in this version.

## CWS data-use disclosure (0.5.0)

**What data does this extension collect?**
- Website content (derived numeric features only; only when user opts in to community reporting via "Help make Parry smarter" toggle in Settings)
- Web history (hostname of flagged pages; only when user opts in to community reporting)

**How is the data used?**
Not sold. Used only to improve detection accuracy. Not used for any other purpose, and not used to determine creditworthiness or other financial eligibility.
