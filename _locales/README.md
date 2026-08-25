# Translations

ScamShield ships in 20 languages: en, zh_CN, hi, es, ar, fr, bn, pt_BR, ru, ur,
id, de, ja, mr, te, tr, ta, vi, ko, it.

## How it works

- `en/messages.json` is the source of truth and is **complete**.
- Every other locale translates the **core user-facing strings** — the warning
  headlines, the primary buttons, the popup status, the message-checker
  verdicts, and the settings navigation. These are the strings a user reads
  when ScamShield is actively protecting them.
- `chrome.i18n.getMessage` falls back to English **per key**, so any string a
  locale hasn't translated yet (e.g. the longer settings hint paragraphs)
  renders in English rather than blank. Adding a key to a locale simply
  overrides that fallback.
- RTL locales (`ar`, `ur`) get `dir="rtl"` on the extension pages automatically
  (`ui/i18n.js`), and the injected in-page warnings use direction-neutral
  layout.

## Quality / review status

**The non-English files are AI-generated translations and have not yet been
reviewed by native speakers.** They are wired and shipping so the extension is
usable in each language, but before leaning on any locale for a public store
listing it should get a native-speaker pass — especially the safety-critical
lines (`techScamBody`, `walletRiskyBody`, `popupDangerSummary`,
`interstitialReassure`). Corrections are welcome as PRs against the relevant
`_locales/<code>/messages.json`.

## Adding or extending a locale

1. Copy a key from `en/messages.json` into the target locale file and translate
   the `message`.
2. Keep any `$BRAND$` placeholder verbatim (it is substituted with the real
   brand name at runtime).
3. `npm test` runs `tests/unit/i18n.test.js`, which fails on JSON errors, empty
   messages, orphan keys (a key not present in `en`), or a dropped `$BRAND$`.

## Remaining i18n work (tracked)

- Translate the full settings-hint paragraph set (currently English fallback)
  in each locale.
- Localise the engine **reason strings** (`engine/heuristics.js`,
  `engine/*_rules.js`) — they are still English in every locale and are the
  largest remaining chunk.
- Native-speaker review pass per the note above.
