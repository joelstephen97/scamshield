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

Scam & Phishing Blocker: Parry

## Short description

Blocks scam sites, phishing pages and fake shops. 100% on-device — your browsing never leaves your computer.

## Full description

There is no server. Parry reads the page you're on, the message you paste
and the shop you're checking out on — entirely inside your browser — and it
never sends what you browse, type or paste anywhere else.

**Why Parry**

Most scam-blocking extensions call home: they send the pages you visit, or a
hash of them, to a company's servers and get a verdict back. Parry doesn't,
because it doesn't have to — the same detection that would run in the cloud
runs locally instead. That means no account, no server outage that leaves
you unprotected, and nothing about your browsing to leak, subpoena or quietly
start selling later. It's free with no premium tier, no trial and no
"upgrade to unlock real-time protection" — the whole product is the free
product.

**What it blocks**

- **Lookalike bank & brand logins** — Parry hash-matches the page's icon and
  logo against a 64-brand table (UAE banks, telcos and government services
  included, alongside PayPal, Microsoft, Google and more) and catches IDN
  homograph domains that spell a brand using look-alike foreign characters.
  A fake login wearing the right logo on the wrong domain gets caught even
  when the address itself looks unfamiliar.
- **Fake shops** — fake countdown timers, "only 2 left" urgency, hotlinked
  trust badges, off-platform payment requests and missing contact details
  are surfaced in a popup shopping card before you check out.
- **Crypto wallet drainers** — warns before risky approvals and blind
  signatures, including EIP-7702 account-delegation and EIP-6963
  multi-wallet requests, and blocks recovery-phrase theft attempts outright.
- **Tech-support scams** — a full-screen block for "your PC is infected,
  call this number now" pages, with a one-click escape that defuses the
  page's screen-lock and Back-button traps first.
- **ClickFix & clipboard attacks** — the fastest-growing malware trick of
  2025: a fake "verify you're human" CAPTCHA that talks you into pasting a
  command into Windows Run. Parry overwrites the malicious clipboard payload
  and blocks the page full-screen before it can run.
- **Leaky forms** — warns the moment a site sends the email or phone number
  you typed to a tracker, *before* you press submit, and separately names
  fingerprinting scripts and "click Allow to continue" notification-permission
  traps.

**How it works**

1. Parry reads the page itself, on your device — its wording, layout, login
   forms and icons — the moment you open it, or the message you paste into
   the popup for a scam-message check.
2. An on-device model and a rule set score what it finds. A single weak
   signal never produces more than a quiet *suspicious* note; a *dangerous*
   verdict needs independent signals to agree, so real pages are rarely
   flagged by mistake.
3. You get a plain-language reason, not just a red banner, with a one-click
   fix: *Leave this page* on a dangerous warning, *Take me to the real site*
   on a brand-impersonation page, or — if Parry got it wrong — pause the
   warning on that site for an hour, a day, or always.

**Statistics & explainability**

Every warning opens to a *Why this verdict?* panel that lists the exact
reasons behind it — a brand icon on the wrong domain, a look-alike domain,
a password field posting to a foreign host — instead of an unexplained
score. The Statistics tab in Settings shows pages checked, threats stopped
and privacy findings, with a daily activity chart you can switch between the
last 7 days, the last 30 days, or your totals since install. Every number is
computed and stored on your device; none of it is ever sent anywhere.

**Privacy: what Parry does and doesn't do**

Parry asks for access to the pages you visit because that's how the
on-device analysis actually reads them — the wording, layout, login forms
and icons — the check happens locally, in your browser, not on a server
somewhere. The one thing that leaves your device by default is a plain file
download: the public threat-list of known scam domains, fetched periodically
from Parry's open-source feed so blocking still works right after install
and while you're offline. Nothing about you or your specific browsing rides
along with that download. Optional, off-by-default community reporting can
send an anonymized host name and a numeric risk signal for a page flagged
dangerous — never a URL, page text or anything you typed — and only if you
turn it on yourself. Settings → About shows exactly what has left your
device, so you can verify zero telemetry rather than take our word for it.

**FAQ**

**How is Parry different from Guardio, Malwarebytes or Norton?**

Those extensions check the pages you visit by sending information to their
own servers: Guardio and Bitdefender TrafficLight scan pages in the cloud,
Norton Safe Web runs a "Remote URL Reputation Service" and, by its own
disclosure, collects your PII, location and web history, and Avast Online
Security sends the URLs you visit along with a device ID and device info to
its servers. Parry has no server. Every check — reading the page, matching
brand icons, scanning a pasted message — runs on your device, and nothing
you browse, type or check is sent anywhere. Guardio's own listing also
limits its free tier to website alerts only; real-time blocking, download
protection and leak monitoring are paid features ($9.99–$34.99/mo). Parry's
full feature set — real-time blocking, fake-shop detection, crypto
wallet-drainer guard, tech-support-scam blocking, clipboard/ClickFix
protection, a statistics dashboard and a plain-language reason on every
warning — is free with no premium tier.

**Is Parry really free? What's the catch?**

Yes, and there is no catch: no premium tier, no trial, no "upgrade to unlock
real-time protection." Parry doesn't run a server to bill you for, so there
is nothing to upsell — the whole product is the free product. That's a
different shape from most of the category: several rivals give away a
limited free tier and charge monthly for their real protection (Guardio's
free tier is alerts-only; full blocking is $9.99–$34.99/mo), while others
are free extensions that cross-sell into a paid security suite. Parry earns
its keep a different way — by staying small, on-device and useful enough
that you'll leave it installed, plus optional donations. If you want to
support development, there's a link in the extension, never a paywall.

**Also inside**

- Scam message checker — paste any SMS/WhatsApp/email text for an instant,
  fully-private verdict.
- Sponsored-result check on Google/Bing/DuckDuckGo — flags an ad that goes
  somewhere other than the site it shows.
- Strict mode — one toggle blocks even "suspicious" pages full-screen with
  simpler wording, for a less tech-confident family member.
- Choose your language: all 20 languages, picked from the popup or Settings,
  independent of your browser's language.
- Settings export/import and optional cross-device sync — your browser's own
  sync, still no Parry account or server.
- Dark mode, protection history and one-click rescue links, hidden fake
  prize/giveaway content.

Hard numbers, not adjectives: available in **20 languages** with full menu,
warning and settings translations (not just a translated store listing);
around **630 automated tests**; a blocklist of thousands of scam domains,
updated continuously from an open-source feed; and an install under 1 MB
— about 450 KB zipped, no heavy runtime.

## What's new (0.8.0)

- **ScamShield is now Parry.** Two very well-known products already use the
  "ScamShield" name — Singapore's government runs its own national
  anti-scam app called ScamShield, and T-Mobile's Scam Shield is a
  widely-used US carrier scam-blocking service — so the extension has
  renamed to avoid confusion with either. Nothing about how it protects you,
  what it collects (nothing) or your settings has changed.
- **Redesigned popup:** a time-boxed *Pause protection* menu (1 hour, 1 day
  or Always) replaces the old trust wording, hero counters show threats
  stopped since install and this week at a glance, every warning opens to a
  *Why this verdict?* panel with the exact reasons behind it, and a cleaner
  rotating footer alternates a privacy reminder, an earned review ask and a
  support link.
- **New icon** — a simple deflection mark that better fits the new name.

No new permissions. Still `storage`, `declarativeNetRequest`, `alarms` and
http/https access, exactly as 0.3.1.
