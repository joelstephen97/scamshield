// tests/unit/listings.test.js — localized store listing integrity (Task 5, 0.6.0)
//
// store/listings/<locale>.md holds the Chrome Web Store listing copy for each
// of the 20 shipped locales (en + 19 translations). Each file must have the
// four canonical sections, a short description that fits the CWS 132-character
// field limit, and no leftover $NAME$-style placeholder tokens from the
// translation pass.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LISTINGS_DIR = path.join(__dirname, '../../store/listings');

// Same 20-locale set as tests/unit/i18n.test.js.
const EXPECTED = ['en', 'zh_CN', 'hi', 'es', 'ar', 'fr', 'bn', 'pt_BR', 'ru', 'ur',
  'id', 'de', 'ja', 'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'it'];

const HEADINGS = ['## Name', '## Short description', '## Full description', "## What's new (0.6.0)"];

function truncateList(items, n = 10) {
  if (items.length <= n) return items.join(', ');
  return items.slice(0, n).join(', ') + `, … (+${items.length - n} more)`;
}

test('all 20 locales have a store listing file', () => {
  for (const loc of EXPECTED) {
    assert.ok(fs.existsSync(path.join(LISTINGS_DIR, `${loc}.md`)), 'missing listing: ' + loc);
  }
});

for (const loc of EXPECTED) {
  test(`store listing (${loc}): has all four sections, no placeholder residue`, () => {
    const p = path.join(LISTINGS_DIR, `${loc}.md`);
    if (!fs.existsSync(p)) return; // "all 20 locales" test above already reports this
    const content = fs.readFileSync(p, 'utf8');

    const missingHeadings = HEADINGS.filter((h) => !content.includes(h));
    assert.strictEqual(
      missingHeadings.length,
      0,
      `${loc}.md: missing heading(s): ${truncateList(missingHeadings)}`
    );

    // No leftover $NAME$-style placeholder tokens anywhere in the file — the
    // listings are plain prose, not chrome.i18n messages, so nothing should
    // still look like an unresolved substitution token from the translation
    // pass or a copy/paste from messages.json.
    const strayTokens = content.match(/\$[A-Z0-9_]+\$/g) || [];
    assert.strictEqual(
      strayTokens.length,
      0,
      `${loc}.md: leftover placeholder token(s): ${truncateList(strayTokens)}`
    );
  });

  test(`store listing (${loc}): short description is <= 132 characters`, () => {
    const p = path.join(LISTINGS_DIR, `${loc}.md`);
    if (!fs.existsSync(p)) return;
    const content = fs.readFileSync(p, 'utf8');

    const match = content.match(/## Short description\r?\n\r?\n([\s\S]*?)\r?\n\r?\n##/);
    assert.ok(match, `${loc}.md: could not isolate "## Short description" section body`);

    const body = match[1].trim();
    const length = [...body].length; // count by codepoint, not UTF-16 code unit
    assert.ok(
      length <= 132,
      `${loc}.md: short description is ${length} characters (CWS limit is 132): "${body}"`
    );
  });
}
