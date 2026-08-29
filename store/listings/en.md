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

Scam & Phishing Blocker: ScamShield

## Short description

Blocks scam sites, phishing pages and fake shops. 100% on-device — your browsing never leaves your computer.

## Full description

There is no server. ScamShield reads the page you're on, the message you paste
and the shop you're checking out on — entirely inside your browser — and it
never sends what you browse, type or paste anywhere else.

**Why ScamShield**

Most scam-blocking extensions call home: they send the pages you visit, or a
hash of them, to a company's servers and get a verdict back. ScamShield doesn't,
because it doesn't have to — the same detection that would run in the cloud
runs locally instead. That means no account, no server outage that leaves
you unprotected, and nothing about your browsing to leak, subpoena or quietly
start selling later. It's free with no premium tier, no trial and no
"upgrade to unlock real-time protection" — the whole product is the free
product.

**What it blocks**

- **Lookalike bank & brand logins** — ScamShield hash-matches the page's icon and
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
  command into Windows Run. ScamShield overwrites the malicious clipboard payload
  and blocks the page full-screen before it can run.
- **Leaky forms** — warns the moment a site sends the email or phone number
  you typed to a tracker, *before* you press submit, and separately names
  fingerprinting scripts and "click Allow to continue" notification-permission
  traps.
- **Risky search results, flagged before you click** — on Google, Bing and
  DuckDuckGo, a small red or amber dot marks a result whose domain is
  already known-bad or a close brand lookalike, so you see the risk before
  you click through, not after.

**How it works**

1. ScamShield reads the page itself, on your device — its wording, layout, login
   forms and icons — the moment you open it, or the message you paste into
   the popup for a scam-message check.
2. An on-device model and a rule set score what it finds. A single weak
   signal never produces more than a quiet *suspicious* note; a *dangerous*
   verdict needs independent signals to agree, so real pages are rarely
   flagged by mistake.
3. You get a plain-language reason, not just a red banner, with a one-click
   fix: *Leave this page* on a dangerous warning, *Take me to the real site*
   on a brand-impersonation page, or — if ScamShield got it wrong — pause the
   warning on that site for an hour, a day, or always.

**Statistics & explainability**

Every warning opens to a *Why this verdict?* panel that lists the exact
reasons behind it — a brand icon on the wrong domain, a look-alike domain,
a password field posting to a foreign host — instead of an unexplained
score. The Statistics tab in Settings shows pages checked, threats stopped
and privacy findings, with a daily activity chart you can switch between the
last 7 days, the last 30 days, or your totals since install. Every number is
computed and stored on your device; none of it is ever sent anywhere.

**Privacy: what ScamShield does and doesn't do**

ScamShield asks for access to the pages you visit because that's how the
on-device analysis actually reads them — the wording, layout, login forms
and icons — the check happens locally, in your browser, not on a server
somewhere. The one thing that leaves your device by default is a plain file
download: the public threat-list of known scam domains, fetched periodically
from ScamShield's open-source feed so blocking still works right after install
and while you're offline. Nothing about you or your specific browsing rides
along with that download. Optional, off-by-default community reporting can
send an anonymized host name and a numeric risk signal for a page flagged
dangerous — never a URL, page text or anything you typed — and only if you
turn it on yourself. Settings → About shows exactly what has left your
device, so you can verify zero telemetry rather than take our word for it.

**FAQ**

**How is ScamShield different from Guardio, Malwarebytes or Norton?**

Those extensions check the pages you visit by sending information to their
own servers: Guardio and Bitdefender TrafficLight scan pages in the cloud,
Norton Safe Web runs a "Remote URL Reputation Service" and, by its own
disclosure, collects your PII, location and web history, and Avast Online
Security sends the URLs you visit along with a device ID and device info to
its servers. ScamShield has no server. Every check — reading the page, matching
brand icons, scanning a pasted message — runs on your device, and nothing
you browse, type or check is sent anywhere. Guardio's own listing also
limits its free tier to website alerts only; real-time blocking, download
protection and leak monitoring are paid features ($9.99–$34.99/mo). ScamShield's
full feature set — real-time blocking, fake-shop detection, crypto
wallet-drainer guard, tech-support-scam blocking, clipboard/ClickFix
protection, a statistics dashboard and a plain-language reason on every
warning — is free with no premium tier.

**Is ScamShield really free? What's the catch?**

Yes, and there is no catch: no premium tier, no trial, no "upgrade to unlock
real-time protection." ScamShield doesn't run a server to bill you for, so there
is nothing to upsell — the whole product is the free product. That's a
different shape from most of the category: several rivals give away a
limited free tier and charge monthly for their real protection (Guardio's
free tier is alerts-only; full blocking is $9.99–$34.99/mo), while others
are free extensions that cross-sell into a paid security suite. ScamShield earns
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
  sync, still no ScamShield account or server.
- Dark mode, protection history and one-click rescue links, hidden fake
  prize/giveaway content.

Hard numbers, not adjectives: available in **20 languages** with full menu,
warning and settings translations (not just a translated store listing);
around **875 automated tests**; a blocklist of over 425,000 confirmed scam domains (plus a million-domain watchlist),
updated continuously from an open-source feed; and an install under 1 MB
— about 450 KB zipped, no heavy runtime.

## What's new (0.10.0)

- **Risky search results, flagged before you click.** On Google, Bing and
  DuckDuckGo, a small red or amber dot now marks a search result whose
  domain is already on the block list, the watchlist, or a close brand
  lookalike — visible on the results page itself, before you click through.
  A clean result gets no badge at all.
- **Warns before a card number or password heads to another site.** A
  card-number or login form that submits to a different domain than the one
  you're on (and isn't a known payment processor or SSO provider) now shows
  a warning before it goes through, the same way the existing leaky-form
  guard already catches beaconed form fields.
- **Flags brand-new domains.** A newly-registered-domain check (on-device,
  updated weekly, same privacy model as the rest of the threat feed) adds a
  cautionary note when a page's domain was registered very recently — a
  favorite trick for scam sites that get taken down and stood back up under
  a fresh name — and eases off once you've safely visited that domain for a
  while.
- **Copy-shareable catch reports.** Every dangerous or suspicious warning
  now has a "Copy report" button that puts a short, plain-text summary —
  site, verdict, top reasons — on your clipboard, ready to paste into a
  group chat or forum thread to warn someone else.
- **Sharper false-positive discipline.** The signals used for domain-hosting
  risk (abused TLDs, free-hosting/dynamic-DNS providers) can no longer push
  a page all the way to a *dangerous* verdict on their own — only genuinely
  independent evidence can. Benchmarked against 1.09 million URLs: the rate
  of ordinary, safe pages wrongly flagged dangerous fell from 0.17% to 0.05%,
  with no drop in real threats caught.
- **A feedback page on uninstall.** If you do remove ScamShield, a small
  static page opens with a link to tell us why and a link straight to the
  false-positive report flow — no form, no analytics, nothing collected.

No new permissions. Still `storage`, `declarativeNetRequest`, `alarms` and
http/https access, exactly as 0.3.1.
