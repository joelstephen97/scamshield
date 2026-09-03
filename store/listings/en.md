<!--
  Canonical English store listing. Every other store/listings/<locale>.md is a
  translation of this file.

  FORMAT RULE (Chrome Web Store rejection "Yellow Argon", 2026-09-03): the
  store shows the description as PLAIN TEXT. Markdown is never rendered, so
  there must be no **bold**, *italics*, `code`, or # headings inside the
  section bodies. Section titles inside the description are plain uppercase
  lines; bullets are a plain "•". The four "## ..." headings below are the
  file's own structure (tests/unit/listings.test.js reads them) and are
  never pasted into the dashboard.

  KEYWORD RULE (same rejection): no list of more than four named brands,
  banks, companies, agencies or competitors anywhere in the listing. Google
  flagged the old "Emirates NBD, ADCB, FAB, Mashreq, e&, du, Noon, UAE PASS,
  MOHRE, Dubai Police" list as keyword spam. Describe categories ("regional
  banks, telecom and government services") instead of naming them, and never
  name competitor products.

  NOTE: two of our _locales directory names differ from the locale codes the
  Chrome Web Store developer dashboard expects when uploading a translated
  listing: `pt_BR` must be entered as `pt-BR`, and `zh_CN` must be entered as
  `zh-CN` (hyphen, not underscore, and the dashboard is case-sensitive about
  the region suffix). Every other locale code matches its directory name.
-->

## Name

Scam & Phishing Blocker: ScamShield

## Short description

Blocks scam sites, phishing pages and fake shops. 100% on-device: your browsing never leaves your computer.

## Full description

ScamShield warns you before a scam or phishing page tricks you, and it does all of its checking inside your browser. There is no server. What you browse, type or paste is never sent anywhere.

WHY SCAMSHIELD

Most scam blockers send the pages you visit to a company's servers and wait for a verdict. ScamShield runs the same detection on your own device instead. That means no account, no outage that leaves you unprotected, and no record of your browsing that could leak or be sold later.

It is free, with no premium tier, no trial and no "upgrade to unlock real-time protection". The whole product is the free product.

WHAT IT BLOCKS

• Fake bank and brand logins. ScamShield compares the page's icon and logo against a table of 64 well-known brands (PayPal, Microsoft and Google among them, plus regional banks, telecom and government services) and spots look-alike domains that copy a brand name with foreign characters. A fake login with the right logo on the wrong domain is caught even when the address looks unfamiliar.

• Fake shops. Fake countdown timers, "only 2 left" pressure, copied trust badges, requests to pay outside the platform and missing contact details are shown in a shopping card before you check out.

• Crypto wallet drainers. Warns before risky approvals and blind signatures, including account-delegation and multi-wallet requests, and blocks attempts to steal your recovery phrase.

• Tech-support scams. A full-screen block for "your PC is infected, call this number" pages, with a one-click exit that first defuses the page's screen-lock and Back-button traps.

• ClickFix and clipboard attacks. A fake "verify you are human" check that talks you into pasting a command into Windows Run. ScamShield replaces the malicious clipboard text and blocks the page before it can run.

• Leaky forms. Warns the moment a site sends the email or phone number you typed to a tracker, before you press submit. Also names fingerprinting scripts and "click Allow to continue" notification traps.

• Risky search results. On Google, Bing and DuckDuckGo, a small red or amber dot marks a result whose domain is known-bad or a close brand look-alike, so you see the risk before you click.

• QR codes. Decodes QR codes shown in a page's images and checks where they lead before you scan them with your phone.

HOW IT WORKS

1. ScamShield reads the page on your device the moment you open it: its wording, layout, login forms and icons. It can also read a message you paste into the popup.

2. An on-device model and a set of rules score what it finds. One weak signal only ever produces a quiet "suspicious" note. A "dangerous" verdict needs several independent signals to agree, so real pages are rarely flagged by mistake.

3. You get a plain-language reason, not just a red banner, with a one-click fix: "Leave this page" on a dangerous warning, or "Take me to the real site" on a brand-impersonation page. If ScamShield got it wrong, pause the warning on that site for an hour, a day, or always.

STATISTICS AND EXPLANATIONS

Every warning opens a "Why this verdict?" panel that lists the exact reasons: a brand icon on the wrong domain, a look-alike address, a password field posting to another site. The Statistics tab in Settings shows pages checked, threats stopped and privacy findings, with a daily chart for the last 7 days, the last 30 days, or your totals since install. Every number is computed and stored on your device.

PRIVACY

ScamShield asks for access to the pages you visit because that is how the on-device analysis reads them. The check happens locally, in your browser.

The one thing that leaves your device by default is a plain file download: the public list of known scam domains, fetched from ScamShield's open-source feed so blocking works right after install and while you are offline. Nothing about you or your browsing rides along with that download.

Optional community reporting, off by default, can send an anonymized host name and a numeric risk signal for a page flagged dangerous. Never a URL, page text or anything you typed, and only if you turn it on yourself. Settings > About shows exactly what has left your device.

FAQ

How is ScamShield different from other scam blockers and AI scam-checkers?

Most of them check pages by sending information to their own servers: the addresses you visit, a device ID, or the message you paste into a chatbot. ScamShield has no server. Reading the page, matching brand icons, scanning a pasted message and decoding QR codes all happen on your device. A sourced comparison against the wider field is in docs/comparison.md in the project's GitHub repository.

Is ScamShield really free? What's the catch?

Yes, and there is no catch. ScamShield does not run a server to bill you for, so there is nothing to upsell. Many rivals give away a limited free tier and charge monthly for real protection, or cross-sell into a paid security suite. ScamShield stays small, on-device and useful enough that you leave it installed. If you want to support development, there is a donation link in the extension, never a paywall.

ALSO INSIDE

• Scam message checker: paste any SMS, WhatsApp or email text for an instant, fully private verdict.

• Sponsored-result check on search pages: flags an ad that goes somewhere other than the site it shows.

• Strict mode: one toggle blocks even "suspicious" pages full-screen with simpler wording, for a less tech-confident family member.

• Your language: all 20 languages, picked from the popup or Settings, independent of your browser's language.

• Settings export/import and optional cross-device sync through your browser's own sync. Still no ScamShield account or server.

• Dark mode, protection history, one-click rescue links and hidden fake prize/giveaway content.

Hard numbers, not adjectives: 20 languages with full menu, warning and settings translations; around 900 automated tests; a blocklist of over 425,000 confirmed scam domains plus a million-domain watchlist, updated continuously from an open-source feed; and an install under 1 MB.

Source code, privacy policy and issue tracker: github.com/joelstephen97/scamshield

## What's new (0.11.1)

• QR code scanning, on your device. ScamShield now decodes QR codes in a page's images and checks where they lead before you scan them with your phone. This is the on-device answer to "quishing" (QR-code phishing) emails. Scan any page from the popup, or leave the automatic scan on. Nothing about the code leaves your device.

• Card-theft protection now covers auto-submitted forms. A login or card form that a page submits to another domain by itself, not only one you submit, now triggers the same cross-site warning.

• A wider false-positive allowlist in the threat feed, so more regional bank, government and marketplace domains can never be blocked by a poisoned source.

• Fewer console warnings on sites such as Gmail.

No new permissions. Still storage, declarativeNetRequest, alarms and http/https access, the same as every version since 0.3.1.
