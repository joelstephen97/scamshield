# Chrome Web Store Listing

**Live listing:** https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl (item ID `fojjjofjimbfoddafoampojopijnlihl`)
**Homepage URL:** https://joelstephen97.github.io/scamshield/
**Support URL:** https://github.com/joelstephen97/scamshield/issues
**Privacy policy URL:** https://joelstephen97.github.io/scamshield/privacy.html
**Category:** Privacy & Security (Productivity → Tools also acceptable)
**Default language:** English

## Where the copy lives

All listing text is in **`store/listings/en.md`** (English canon) and
`store/listings/<locale>.md` (19 translations). Paste each file's four
sections into the dashboard field of the same name:

| File section | Dashboard field |
|---|---|
| `## Name` | Store listing → Title (must match `extName` in `_locales/en/messages.json`: *Scam & Phishing Blocker: ScamShield*) |
| `## Short description` | Store listing → Summary (132 chars max; `tests/unit/listings.test.js` enforces it per locale) |
| `## Full description` | Store listing → Description |
| `## What's new (X.Y.Z)` | Bottom of Description (the CWS has no separate what's-new field) |

Localized listings: Store listing tab → language selector → add each
language and paste from its file. `pt_BR` is entered as `pt-BR` and `zh_CN` as
`zh-CN`; every other code matches the filename.

## Two rules the store enforced on us (rejection "Yellow Argon", 2026-09-03)

1. **Plain text only.** The dashboard does not render markdown. The pre-0.11
   listings pasted `**Why ScamShield**` and `*Leave this page*` and the store
   showed the asterisks literally. Section titles inside the description are
   plain uppercase lines, bullets are `•`, emphasis is done with wording.
   The listing test fails on any `**`, `*x*`, backtick, markdown link or `- `
   bullet in any locale.
2. **No entity lists.** Google rejected the 0.5-era description for keyword
   spam over "Emirates NBD, ADCB, FAB, Mashreq, e&, du, Noon, UAE PASS, MOHRE,
   Dubai Police" (">5 entities"). Name categories ("regional banks, telecom
   and government services"), keep any list of real brands to three or four
   (PayPal, Microsoft and Google; Google, Bing and DuckDuckGo), and never name
   a competitor product in the description. The listing test bans the flagged
   names and any comma-run of five or more capitalised names.

## Graphics

- Icon: `assets/icons/icon128.png`
- Screenshots (1280×800): `store/screenshots/01–07` — see `store/screenshots/README.md`; regenerate with `npm run screenshots`.
- Small promo tile: `store/promo-small-440x280.png`; marquee: `store/promo-marquee-1400x560.png` (`npm run promo`).

## History

- **0.5.0** — first listing overhaul; the description carried the UAE brand list that was later flagged.
- **0.8.0** — title changed to *Scam & Phishing Blocker: ScamShield*; 20-locale listings added under `store/listings/`.
- **0.11.0** — rejected 2026-09-03 (keyword spam, "Yellow Argon", on the old 0.5-era description still live on the item). Whole listing rewritten as plain text without entity lists or competitor names, all 20 locales retranslated, sixth screenshot (QR scan) added.
