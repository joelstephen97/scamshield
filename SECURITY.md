# Security policy

Parry is a security product, so we take reports about it seriously. Thank you for looking.

## Supported versions

| Component | Supported |
|---|---|
| Extension — the version currently published on the [Chrome Web Store](https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl) and the latest tag on `main` | ✅ |
| Extension — older tags | ❌ please update |
| Reporting relay (`relay/`, deployed at `scamshield-relay-seven.vercel.app`) | ✅ |
| Threat feed ([scamshield-feed](https://github.com/joelstephen97/scamshield-feed)) | ✅ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Email **jojostev@gmail.com** with the subject `Parry security`. Include:

- what the problem is and why it matters (impact),
- steps or a proof-of-concept to reproduce it (a fixture page or URL pattern is ideal),
- the extension version (Settings → About, or `chrome://extensions`) and browser,
- whether you want to be credited in the changelog.

You can expect an acknowledgement within **72 hours** and a fix or a status update within **14 days** for anything confirmed. Fixes ship as a new store release (the Chrome Web Store review adds a few days we don't control); relay fixes deploy immediately.

## What is in scope

- **Bypasses** — a phishing/scam page that defeats a guard the extension claims to provide (fake-login form guard, wallet guard, clipboard guard, tech-support scare-page guard, banner suppression, trust-list abuse).
- **Injection / escalation** — anything a web page can do to the content script, the MAIN-world detectors, the popup/options pages, or the service worker (DOM XSS in our UI, message-passing abuse, prototype pollution through the MAIN-world bridge, etc.).
- **Privacy regressions** — any network request that leaks browsing data, page text, URL paths, or identifiers, or any way to make reporting fire while the opt-in is off. The only permitted network activity is listed in the [README](README.md#privacy) and the [privacy policy](https://joelstephen97.github.io/scamshield/privacy.html).
- **Relay** — authentication bypass on `/api/export` or `/api/purge`, rate-limit bypass, storage of data outside the documented payload contract, injection through the JSON payload.
- **Supply chain** — anything in the build (`scripts/build.js`) or the model/brand-hash tooling that could ship code or data not present in the repo.

## Out of scope

- Detection misses or false positives that are not bypasses of a *guard* — those are normal bugs; please use **Report a mistake** in the extension or [open an issue](https://github.com/joelstephen97/scamshield/issues/new).
- Issues in third-party services we link to but don't operate (GitHub, Vercel, Neon, OpenPhish, URLhaus).
- Denial-of-service against the relay (it is rate-limited and stores nothing identifying; please don't load-test it).
- Reports from automated scanners without a demonstrated impact.

## Safe harbour

Good-faith research that respects users' privacy (no access to other people's data, no disruption of the relay) will not be met with legal action. Please give us reasonable time to fix before publishing.

## Hardening already in place (for reviewers)

- No remote code, no `eval`, no WebAssembly, no `web_accessible_resources`; all detection logic is unminified vanilla JS in the package.
- Manifest permissions are exactly `storage`, `declarativeNetRequest`, `alarms` + http/https host permissions; a unit test fails the build if that changes.
- Icon fetches and report POSTs use `credentials: 'omit'`.
- Relay: constant-time token comparison, `content-length` pre-check, strict payload schema, in-memory-only rate-limit IPs, 180-day purge gated on both a secret and Vercel's `x-vercel-cron` header. See [`relay/README.md`](relay/README.md).
