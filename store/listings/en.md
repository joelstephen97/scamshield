<!--
  Canonical English store listing. This is the source text Task 4's
  translation agents work from to produce the other 19 locale listings.

  NOTE: two of our _locales directory names differ from the locale codes the
  Chrome Web Store developer dashboard expects when uploading a translated
  listing: `pt_BR` must be entered as `pt-BR`, and `zh_CN` must be entered as
  `zh-CN` (hyphen, not underscore, and the dashboard is case-sensitive about
  the region suffix). Every other locale code matches its directory name.
-->

## Name

ScamShield — Scam & Phishing Protection

## Short description

On-device scam & phishing protection: warns you, spots brand look-alikes, checks messages. Nothing leaves your device.

## Full description

ScamShield warns you before a scam or phishing page tricks you — entirely on
your device. It reads more than the address bar: it looks at the page's
wording, layout and login form, and it recognises when a page is wearing a
brand's icon or logo on the wrong domain, so it catches convincing look-alikes
that a URL-only checker would miss. Got a suspicious WhatsApp, SMS or email?
Paste it into the popup for an instant, private verdict.

One click gets you back to safety: *Leave this page* on a dangerous warning,
or *Take me to the real site* on a brand-impersonation page. If ScamShield
gets it wrong, *Trust this site* for an hour, until tomorrow, or always — and
*Report a mistake* in one tap.

Private by design: nothing you browse, type or check ever leaves your
device. The only network activity is downloading the public threat-feed
file, and — only if you opt in — sending an anonymized host name and risk
signal for a flagged page. A Settings page shows exactly what leaves your
device so you can verify zero-telemetry yourself.

Available in 20 languages, including full menu, warning and settings
translations — not just a translated store listing.

Features:
• Real-time phishing & scam warnings with plain-language reasons
• Page analysis: an on-device model reads the page itself — wording, layout,
  login forms — to catch brand-new phishing pages, not just known-bad URLs
• Brand look-alike detection: icons and logos hash-matched against a
  64-brand table (49 with icon hashes), including UAE banks, telcos and
  government services (Emirates NBD, ADCB, FAB, Mashreq, e&, du, Noon,
  UAE PASS, MOHRE, Dubai Police…), plus IDN homograph domains (look-alike
  foreign characters standing in for Latin letters)
• Scam message checker: paste any SMS/WhatsApp/email text for an instant,
  fully-private verdict
• Detects fake login forms that send your password to another site
  (single-sign-on logins via Google/Microsoft/Okta are recognized as safe)
• Privacy pack: warns when a site sends your email/phone to a tracker before
  you press submit, names fingerprinting scripts, and flags "click Allow to
  continue" notification-permission traps
• Shopping checks: fake countdowns, fake "only 2 left" pressure, hotlinked
  trust badges, off-platform payment requests and missing contact details,
  surfaced in a popup shopping card
• Sponsored-result check on Google/Bing/DuckDuckGo — flags an ad that goes
  somewhere other than the site it shows
• Full-screen interstitial for near-certain scams (ClickFix fake-CAPTCHA
  clipboard attacks, fake browser-update prompts, delivery-fee phishing,
  tech-support scare pages), with an enforced pause and a real-vs-fake domain
  comparison, reserved for near-zero-false-positive detections
• Strict mode: one toggle that blocks even "suspicious" pages full-screen
  with simpler wording, for a less tech-confident family member
• One-click rescue: *Take me to the real site* on brand-impersonation pages,
  *Leave this page* on any dangerous warning
• Trust a site for 1 hour, until tomorrow, or always — and report a mistake
  in one tap
• Blocks known scam domains — refreshed daily from an open-source feed
  (OpenPhish + URLhaus, heavily filtered against false positives)
• Crypto-wallet guard: warns before risky approvals & blind signatures
  (including EIP-7702 account-delegation and multi-wallet EIP-6963 support);
  blocks recovery-phrase theft
• Clipboard-hijack guard: warns when a site copies a command to your clipboard
• Hides fake prize/giveaway scam content
• Settings export/import and optional cross-device sync (your browser's own
  sync — still no ScamShield account or server)
• Protection history and stats, stored only on your device; dark mode
• Optional community reporting, off by default — never URLs or page text
• Smaller and faster: ~0.6 MB unpacked, no heavy runtime
• 100% on-device analysis — no tracking, no data collection

## What's new (0.7.0)

- New Statistics tab in Settings: pages checked on-device, threats stopped,
  privacy findings, and a daily activity chart for the last 7/30/90 days —
  all counted and stored on your device, never sent anywhere.
- A quiet, dismissible review prompt appears in the popup only after
  ScamShield has actually blocked something twice — decline it once and it's
  gone for good.
- New language override in Settings: pick ScamShield's own language
  independently of your browser's, with sync-across-devices support if
  you've turned on your browser's own sync.

No new permissions. Still `storage`, `declarativeNetRequest`, `alarms` and
http/https access, exactly as 0.3.1.
