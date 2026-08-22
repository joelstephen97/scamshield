# ScamShield Privacy Policy

_Last updated: 2026-08-23_

ScamShield analyzes web pages **on your device** to warn you about scams and
phishing. We designed it so your browsing stays private.

## What we collect
**Nothing.** ScamShield does not transmit your browsing history, the pages you
visit, URLs, form contents, messages you check, or any personal data to us or
any third party. All scam/phishing analysis runs locally inside the extension.

## Threat-list download
ScamShield periodically **downloads** an updated blocklist of known scam
domains (a static JSON file, by default from ScamShield's public GitHub feed;
you can change or disable this URL in Settings). This is a one-way download of
the same file for every user — nothing about you or your browsing is sent with
the request beyond what any file download implies (your IP address reaching
GitHub's servers). The feed and its build process are open source.

## Local storage
ScamShield stores your settings, your list of trusted sites, and a protection
history (site names and event types only — never full addresses) in your
browser's local extension storage. This never leaves your device, can be
cleared in Settings, and is removed when you uninstall the extension.

## Optional community reporting (off by default)
If you turn on "Help make ScamShield smarter" in Settings, ScamShield sends a small report to our relay (https://scamshield-relay-seven.vercel.app/api/report) in two cases: (1) when it rates a page *dangerous*, at most once per site per day; (2) when you press "Report a mistake" / "Report this site as a scam". A report contains only: the site name (hostname), the verdict and its internal reason codes, numeric risk signals derived from the address and page layout (hashed word counts and counts of forms/inputs/links — never the text itself), matched brand names, the extension version, and the hour. It never contains the full address (path or query), page text, anything you typed, cookies, or any identifier of you or your device. Reports are kept for 180 days and used only to improve detection. Turn the option off at any time; queued reports are discarded.

## Icon check
To recognise brand look-alikes, ScamShield fetches the icon files (favicon / logo) that the page references — usually from the same site, sometimes from a CDN the site uses. These requests contain no cookies or credentials, and no third party learns anything about you or your browsing.

## Permissions
See the permissions justification in the listing. We request the minimum needed
to read the current page for analysis and to block known-bad sites.

## Contact
Questions: jojostev@gmail.com
