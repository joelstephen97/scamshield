# Permission Justifications (for store reviewers)

- **storage** — save user settings and the trusted-sites allowlist locally.
- **declarativeNetRequest** — block known scam/phishing domains using a static
  ruleset plus a downloaded dynamic ruleset. The extension does not read or
  intercept the user's network traffic; blocking is rule-based and
  privacy-preserving. Since 0.12.0 a small number of dynamic *redirect* rules
  send a top-level navigation to a listed domain to the extension's own
  `blocked.html` page (with the blocked address in the URL fragment) so the
  user sees an explanation instead of a bare browser error; dynamic *allow*
  rules mirror the sites the user has paused or trusted. No web-accessible
  resources are declared; the redirect target is the extension's own page.
- **alarms** — schedule two optional, periodic, **download-only** refreshes of the
  scam-domain block list: the main feed every 12 hours, and (since 0.13.0) an
  hourly "hot list" of domains reported in the last 48 hours, so a phishing site
  that appeared this morning is blocked within about an hour instead of at the
  next daily rebuild. Both fetch the same static files every other user fetches,
  from the project's public open-source feed; the request carries no query, no
  identifier and nothing about the user or their browsing, and the hourly one is
  conditional (ETag), so it is usually a 304. Both stop entirely when the user
  turns "Block known scam sites" off or clears the feed URL. Nothing is uploaded.
- **content scripts on http(s)** — statically declared in the manifest (the
  `chrome.scripting` API is not used and not requested). They read the current
  page's URL and DOM to detect phishing forms and scam content. Analysis is
  on-device; no page data is transmitted.
- **host_permissions http/https** — required so protection works on any site the
  user visits, since scams can be hosted anywhere.

**Network activity:** The only network calls are (1) a one-way download of the threat-feed blocklist (optional, can be disabled in Settings), (2) optional opt-in community reports (off by default, sent to a relay only when you turn on "Help make ScamShield smarter"), and (3) same-site icon fetches to recognise brand look-alikes (no cookies or credentials sent; no third party learns about your browsing).

**Version 0.5.0:** No new permissions were added. The ONNX runtime and web-accessible resources were removed in this version.

## CWS data-use disclosure (0.5.0)

**What data does this extension collect?**
- Website content (derived numeric features only; only when user opts in to community reporting via "Help make ScamShield smarter" toggle in Settings)
- Web history (hostname of flagged pages; only when user opts in to community reporting)

**How is the data used?**
Not sold. Used only to improve detection accuracy. Not used for any other purpose, and not used to determine creditworthiness or other financial eligibility.
