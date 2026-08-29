# Parry Privacy Policy

_Last updated: 2026-08-28 · applies to Parry 0.7.0 and later (Chrome Web Store listing `fojjjofjimbfoddafoampojopijnlihl`, Firefox build, and source builds from [github.com/joelstephen97/scamshield](https://github.com/joelstephen97/scamshield))._

_What changed in 0.7.0: a Statistics tab, an earned review ask, and a per-user language override. **None of them add a network request or a permission** — they all run inside the extension. Community reporting is still off by default, and the payload it sends when you opt in is unchanged. New items are stored **only on your device** (see below); the language choice is the only new one of the three that can travel through your browser's own opt-in sync, exactly like your existing settings._

Parry analyses web pages **on your device** to warn you about scams and phishing. It was designed so that your browsing stays private: by default it collects nothing, has no accounts, no analytics, no advertising and no trackers. The hosted copy of this policy lives at <https://joelstephen97.github.io/scamshield/privacy.html>; its source is this file.

## At a glance

| | Default | What it involves |
|---|---|---|
| Page / URL / message analysis | On | Runs entirely inside the extension. Nothing is transmitted. |
| Settings, trusted sites, protection history | On | Stored only in your browser's extension storage. |
| Threat-list download | On | Downloads the same public blocklist file as every other user. Nothing about you is sent. Can be disabled. |
| Icon check (brand look-alikes) | On (part of page analysis) | Fetches the page's own favicon/logo files without cookies. No third party contacted. Can be disabled. |
| Community reporting ("Help make Parry smarter") | **Off** | Opt-in only. Sends anonymised, host-level risk reports — never URLs, page text, or identifiers. |

## 1. What we collect

**Nothing, unless you opt in to community reporting (section 5).** Parry does not transmit your browsing history, the pages you visit, their addresses, form contents, the messages you paste into the checker, or any personal data to us or to any third party. All scam/phishing analysis — URL rules, the URL and page-content models, the icon look-alike check, the wallet/clipboard/tech-support guards and the message checker — runs locally inside the extension.

## 2. Data stored on your device

The extension keeps the following in your browser's local extension storage. It never leaves your device, can be cleared in *Settings*, and is deleted when you uninstall the extension:

- your settings (which protections are on, theme, feed URL, reporting opt-in);
- your trusted-sites list (hostnames you chose to trust, with the expiry you chose);
- protection history and stats: the last 200 events as *hostname + event type + time* — never full addresses, page content or anything you typed;
- a per-site marker so that an automatic report (if you opted in) is sent at most once per site per day;
- the queue of reports waiting to be sent (only while reporting is on; discarded the moment you turn it off);
- a small count of how often you visit each site (registrable domain only), used to quieten low-confidence warnings on sites you use a lot — capped, pruned, and never transmitted;
- a per-site record of a shop countdown timer's starting value, used only to notice a "sale ends" timer that fakes urgency by resetting on every visit;
- statistics counters for the Statistics tab: pages checked, daily activity buckets (kept for 90 days), threats by type, and privacy findings — plus a since-install lifetime total for each — all local, all on-device, never transmitted;
- review-ask state (whether you've been asked, snoozed, declined, or already rated) so the earned review prompt is shown at most as described in Settings and never repeated after you decline it;
- your language preference, if you've set one in Settings — synced only through your own browser's opt-in sync, the same as your other settings;
- short-lived per-tab state (current verdict, any privacy findings, cached icon hashes) in *session* storage, which the browser clears when it closes.

If you turn on **Sync across my devices** (off by default, in Settings → About), your settings and trusted-sites list — never your history, stats or reports — are stored in your browser's own account sync so they match across your signed-in browsers. That data travels through your browser vendor's sync (e.g. Google or Mozilla), not through any Parry server; Parry still has no account and no server that stores your data.

## 3. Threat-list download

Parry periodically **downloads** an updated blocklist of known scam domains — a static JSON file, by default from Parry's public open-source feed at `https://raw.githubusercontent.com/joelstephen97/scamshield-feed/main/blocklist.json` (built daily from the OpenPhish and URLhaus community feeds; source: [github.com/joelstephen97/scamshield-feed](https://github.com/joelstephen97/scamshield-feed)). It is the same file for every user, fetched on install and then every 12 hours. Nothing about you or your browsing is sent with the request beyond what any file download implies (your IP address reaching GitHub's servers; see [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)). In *Settings* you can point the URL at your own feed or clear it to disable downloads entirely. The download never uploads anything.

## 4. Icon check

To recognise brand look-alikes, Parry fetches the icon files (favicon / logo) that the page you are on references — usually from the same site, sometimes from a content-delivery network the site uses. These requests are made without cookies or credentials, only for icons the page itself would load anyway, and no third party learns anything about you or your browsing from them. The icons are hashed on your device and compared with a built-in table; neither the icons nor the hashes are sent anywhere. Turning off *Page analysis* in Settings also turns off the icon check.

## 5. Optional community reporting (off by default)

If — and only if — you turn on **"Help make Parry smarter"** in Settings, Parry sends a small report to our relay at `https://scamshield-relay-seven.vercel.app/api/report` in two cases:

1. automatically, when it rates a page **dangerous**, at most once per site per day; and
2. when you press **"Report a mistake"** or **"Report this site as a scam"** (you see the report before it goes).

**A report contains only:** the site name (hostname and its registrable domain), the verdict level and its internal reason codes, numeric risk signals derived from the address and the page's layout (hashed word counts and counts of forms, inputs and links — never the words themselves), the names of any brands the page appeared to imitate, the extension version, and the hour of the report. Reports are capped at 32 KB and rejected by the relay if they contain anything outside this contract.

**A report never contains:** the full address (path, query string or fragment), page text or HTML, anything you typed or pasted, cookies, your IP address, or any identifier of you, your device or your browser. Reports carry no user ID or installation ID, so they cannot be linked to you or to each other.

**How reports are handled.** The relay is a small open-source service (source in the `relay/` folder of the repository) running on Vercel serverless functions with a Neon-hosted Postgres database. Your IP address is seen by the relay only to rate-limit abuse, is held in memory for that purpose only, and is never written to the database or to logs we keep. Reports are retained for **180 days** and then deleted automatically. They are used solely to improve Parry's detection (for example to retrain the URL and page models on real misses and false positives). They are not sold, shared with advertisers or data brokers, or used for any other purpose.

**Your control.** Turn the option off at any time in Settings; queued reports are discarded immediately and no further reports are sent. Because reports contain no identifier, we cannot look up or delete "your" reports on request — there is nothing that ties them to you — but every report is deleted within 180 days regardless.

## 6. "Report a mistake" while reporting is off

If community reporting is off and you press *Report a mistake*, Parry opens a pre-filled issue form on GitHub in a new tab. Nothing is sent unless you choose to submit it, you can edit the text first, and GitHub's own [privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement) applies to anything you post there.

## 7. Third parties

Parry has no advertising, analytics or tracking SDKs. The only third-party services involved are infrastructure: **GitHub** (hosts the threat-feed file, the issue tracker and this policy), **Vercel** and **Neon** (run and store opt-in community reports, section 5), and — only if you opt in to donate — GitHub Sponsors or PayPal, which you interact with directly on their sites. None of them receive your browsing data from Parry.

## 8. Permissions

Parry requests only `storage` (your settings and history), `declarativeNetRequest` (blocking known scam domains with a static rule list — it does not read or intercept your traffic), `alarms` (the 12-hourly feed refresh) and access to http/https pages (so it can analyse the page you are on). It contains no remote code. A detailed justification is in the repository (`store/permissions-justification.md`).

## 9. Children

Parry is a general-purpose safety tool, is not directed at children, and collects no personal data from anyone.

## 10. Security

Everything the extension sends or receives uses HTTPS. Report submissions and icon fetches carry no cookies or credentials. Relay administration endpoints are token-protected and the data is purged on a schedule. Please report security problems to jojostev@gmail.com (see `SECURITY.md` in the repository).

## 11. Changes to this policy

We will update this page when the extension's data practices change (for example, when a new release adds or changes a network request) and update the date at the top. The full edit history is visible in the repository's commit log. Material changes are also called out in the changelog that the extension links to after an update.

## 12. Contact

Joel Stephen · jojostev@gmail.com · <https://github.com/joelstephen97/scamshield>
