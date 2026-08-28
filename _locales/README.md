# Translations

ScamShield ships in 20 languages: en, zh_CN, hi, es, ar, fr, bn, pt_BR, ru, ur,
id, de, ja, mr, te, tr, ta, vi, ko, it.

## How it works

- `en/messages.json` is the source of truth and is **complete** (~330 keys).
- Every other locale has reached **full parity** with `en`: the same key set,
  the same placeholder declarations, and no stray content. That covers every
  user-visible string — warning headlines, buttons, popup status, the
  message-checker verdicts, settings navigation and hint paragraphs,
  options a11y hints and aria-labels — plus the full engine **reason-code**
  set (see below) and the localized store listings under `store/listings/`.
  `tests/unit/i18n.test.js` enforces this parity on every locale, every run.
- `chrome.i18n.getMessage` falls back to English **per key** as a safety net,
  so a future key added only to `en` still renders instead of going blank.
- Engine modules never emit English text directly — they emit structured
  `{ code, kind, params }` reasons, and `ui/reasons.js` is the single place
  that resolves a code to localized words: it checks `chrome.i18n` first
  (`reason_<code>`) and falls back to its own English table, wrapping
  interpolated values (hostnames, brand names) in bidi isolates so they read
  correctly in right-to-left locales too.
- RTL locales (`ar`, `ur`) get `dir="rtl"` on the extension pages automatically
  (`ui/i18n.js`), and the injected in-page warnings use direction-neutral
  layout.

## Quality / review status

**The non-English files are AI-generated translations and have not yet been
reviewed by native speakers.** They are wired and shipping so the extension is
fully usable in each language, but before leaning on any locale for
production or promotion it should get a native-speaker pass — especially the
safety-critical lines (`techScamBody`, `walletRiskyBody`, `popupDangerSummary`,
`interstitialReassure`). Of the 19 translated locales, **`ur`, `mr`, and `te`
are flagged as the highest priority for native review**. Corrections are
welcome as PRs against the relevant `_locales/<code>/messages.json` or
`store/listings/<code>.md`.

## Adding or extending a locale

1. Copy a key from `en/messages.json` into the target locale file and translate
   the `message`.
2. Keep any `$BRAND$` placeholder verbatim (it is substituted with the real
   brand name at runtime).
3. `npm test` runs `tests/unit/i18n.test.js`, which fails on JSON errors, empty
   messages, orphan/missing keys (any key not present in — or missing from —
   `en`), placeholder/token mismatches, or a dropped `$BRAND$`.
4. `tests/unit/listings.test.js` covers `store/listings/<code>.md` the same
   way: all four sections present, short description within the CWS
   132-character limit, and no leftover placeholder tokens.

## Remaining i18n work (tracked)

- Native-speaker review pass per the note above (`ur`, `mr`, `te` first, then
  the rest).
- The Firefox AMO listing is still English only; the Chrome Web Store gets the
  localized listings from `store/listings/` (see
  `store/submission-checklist.md`).
