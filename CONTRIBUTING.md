# Contributing to Parry

Thanks for helping make scam protection better for everyone. This page covers the things that are easy to get wrong; the [README](README.md) covers the architecture.

## The fastest ways to help

1. **Report a false positive or a missed scam.** In the extension, press **Report a mistake** (popup → status card). If community reporting is off (the default) it opens a pre-filled GitHub issue in a new tab — add a screenshot if you can. Or [open an issue](https://github.com/joelstephen97/parry/issues/new) by hand with: the hostname (not the full URL if it contains anything personal), what Parry said, what it should have said, extension version and browser.
2. **Add a brand or a safe domain** (see below) — regional banks, telcos and government portals are the most valuable additions.
3. **Improve detection** with a unit-tested rule or a model retrain.

## Ground rules (please read before a PR)

- **No new permissions. Ever.** Active users are on the store version; adding a permission disables the extension for all of them until they re-approve it. The manifest must stay exactly `storage`, `declarativeNetRequest`, `alarms` + http/https host permissions (`tests/unit/build_manifest.test.js` guards this).
- **Nothing leaves the device** except the three documented requests (feed download, same-site icon fetch, opt-in report). Do not add telemetry, analytics, remote config, or remote code. A PR that changes network behaviour must update [`privacy.html`](privacy.html), [`store/privacy-policy.md`](store/privacy-policy.md) and [`store/permissions-justification.md`](store/permissions-justification.md) in the same change.
- **Storage is additive.** New settings get a default in `DEFAULTS` in `background/service_worker.js`; never rename or rewrite existing keys. `tests/e2e/upgrade.spec.js` boots on a 0.3.1 storage fixture.
- **Conservative first.** Content/visual signals alone may raise *suspicious*, never *dangerous*; `engine/verdict.js` needs a corroborating URL rule/model/icon match for red. Prefer a miss over a false positive on a legitimate login page.
- **Vanilla JS, no bundler, no TypeScript.** Engine modules are DOM-free UMD wrappers so they run in the browser, `node --test` and the crawler. Keep them that way.
- **Keep the package small** — `scripts/build.js` fails if the zip grows past 2.5 MB; the current build is ~170 KB. No new runtimes or vendored libraries.

## Development setup

```bash
git clone https://github.com/joelstephen97/parry
cd scamshield
npm install
npx playwright install chromium
npm test                        # 375 unit + 34 e2e
```

Load the folder unpacked in `chrome://extensions` (Developer mode) to try changes live. `node tests/e2e/server.js` serves the fixture pages (`http://localhost:5599/phishing-login.html` shows a warning).

Windows note: run Playwright headed with `set HEADLESS=false && npx playwright test`. Python tooling for the models lives in `model/.venv` (see [`model/README.md`](model/README.md)).

## Tests

- Every detector/rule change needs a unit test in `tests/unit/` (`node --test`).
- Anything user-visible (banner, popup, options, overlays) needs an e2e in `tests/e2e/` against a fixture page under `tests/e2e/pages/`. Fixture hosts are mapped to 127.0.0.1 in `playwright.config.js` (`--host-resolver-rules`); HTTPS fixtures use the committed self-signed cert.
- If you touch a model or its feature extractor, regenerate parity (`npm run gen:parity`, then the Python trainer) so `tests/unit/*_parity.test.js` still pass — they assert JS == Python to 1e-4.
- If you touch the popup/options/in-page UI, re-run `npm run screenshots` and commit the refreshed PNGs (don't hand-edit them).

## How to add…

**A safe domain (false-positive fix)** — `SAFE_DOMAINS` in `engine/constants.js`. Add the *registrable* domain (e.g. `amazon.ae`), never hosting infrastructure (`amazonaws.com`, `pages.dev`) or anything a scammer can register under. Add a unit test in `tests/unit/constants.test.js` or `heuristics-url.test.js`.

**A brand** — `BRANDS` in `engine/constants.js` (`display` name, official domains, optional `brandNameIn` tokens). Then `npm run build:brands` to hash its favicon/logo into `engine/brand_icons.json` (the order-independent ambiguity guard in `tools/lib/brand_hash_guard.js` will refuse a hash that collides with another brand) and `npm run measure:icon-fp` to confirm no false positives against the benign icon set. Short or generic names (du, noon, wise) should be icon-only — set them up so the name alone never scores.

**A URL/DOM rule** — `engine/heuristics.js` (`scoreUrl` / `scoreDom`), weighted so that a single rule stays below the *dangerous* threshold unless it is a hard signal (credential form posting cross-origin, punycode look-alike of a brand). Tests in `tests/unit/heuristics-*.test.js`.

**Feed rules** — the blocklist is built in [scamshield-feed](https://github.com/joelstephen97/parry-feed); open issues/PRs there for sources or FP-guard changes. `rules/blocklist.json` here is a snapshot produced by `node build.js --snapshot` in that repo.

**Relay changes** — `relay/` has its own `package.json` and tests (`cd relay && npm test`). Keep the payload contract in `engine/report_payload.js` and `relay/lib/validate.js` in sync, and never add a field that could identify a user or carry page text/URL paths.

## Commits and pull requests

- Conventional prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`; scope in parentheses when useful (`fix(engine): …`).
- One logical change per commit; tests in the same commit as the code they cover.
- PRs: describe the user-visible effect, link the issue, and paste the `npm test` summary. Update `CHANGELOG.md` under an *Unreleased* heading.
- By contributing you agree your work is released under the project license (GPL-3.0-or-later, see [LICENSE](LICENSE)).

## Code of conduct

Be kind and constructive. Harassment or personal attacks are not tolerated; the maintainer may close or lock threads that don't meet that bar. Questions: jojostev@gmail.com.
