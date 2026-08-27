// tests/unit/i18n.test.js — locale file integrity (0.6.0)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, '../../_locales');
const EN = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en/messages.json'), 'utf8'));
const enKeys = new Set(Object.keys(EN));

// The 20 target locales must all exist and be valid.
const EXPECTED = ['en', 'zh_CN', 'hi', 'es', 'ar', 'fr', 'bn', 'pt_BR', 'ru', 'ur',
  'id', 'de', 'ja', 'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'it'];

test('all 20 target locales are present', () => {
  for (const loc of EXPECTED) {
    assert.ok(fs.existsSync(path.join(LOCALES_DIR, loc, 'messages.json')), 'missing locale: ' + loc);
  }
});

test('en base is complete (every message non-empty) and MSG name/description exist', () => {
  for (const [k, v] of Object.entries(EN)) assert.ok(v && typeof v.message === 'string' && v.message.length, 'empty en message: ' + k);
  for (const k of ['extName', 'extShortName', 'extDescription']) assert.ok(enKeys.has(k), 'missing manifest key: ' + k);
});

test('no locale has orphan keys, empty messages, or unresolved placeholders', () => {
  for (const loc of fs.readdirSync(LOCALES_DIR)) {
    const p = path.join(LOCALES_DIR, loc, 'messages.json');
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8')); // valid JSON or throws
    for (const [k, v] of Object.entries(data)) {
      if (loc !== 'en') assert.ok(enKeys.has(k), `${loc}: orphan key not in en: ${k}`);
      assert.ok(v && typeof v.message === 'string' && v.message.trim().length, `${loc}: empty message for ${k}`);
      // A key that uses a $BRAND$ placeholder in en must keep it in every locale.
      if (/\$BRAND\$/.test((EN[k] && EN[k].message) || '')) {
        assert.ok(/\$BRAND\$/.test(v.message), `${loc}: ${k} dropped the $BRAND$ placeholder`);
      }
    }
  }
});

test('placeholder-bearing en keys declare their placeholders', () => {
  for (const [k, v] of Object.entries(EN)) {
    if (/\$BRAND\$/.test(v.message)) assert.ok(v.placeholders && v.placeholders.brand, `en: ${k} uses $BRAND$ but declares no placeholder`);
  }
});

// --- Strict locale parity (Task 3) -----------------------------------------
// en/messages.json is the frozen canonical key set (~311 keys). Every other
// locale must reach exact parity with it: same keys, same placeholder
// declarations, and no stray/HTML content. This is expected to fail RED on
// all 19 non-en locales until Task 4's translation agents fill them in.

const NON_EN_LOCALES = EXPECTED.filter((loc) => loc !== 'en');

function tokensOf(message) {
  // All $NAME$-style tokens in a message, e.g. $HOST$, $ALGO$, $BRAND$.
  return message.match(/\$[A-Z0-9_]+\$/g) || [];
}

function truncateList(items, n = 10) {
  if (items.length <= n) return items.join(', ');
  return items.slice(0, n).join(', ') + `, … (+${items.length - n} more)`;
}

// One top-level test per locale, so a `node --test` run names every
// offending locale file individually instead of collapsing into a single
// pass/fail line (matches the loop-generated-tests pattern used elsewhere,
// e.g. tests/unit/parity.test.js).
for (const loc of NON_EN_LOCALES) {
  test(`locale parity (keys): ${loc} matches en key set exactly`, () => {
    const p = path.join(LOCALES_DIR, loc, 'messages.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const locKeys = new Set(Object.keys(data));

    const missing = [...enKeys].filter((k) => !locKeys.has(k));
    const extra = [...locKeys].filter((k) => !enKeys.has(k));

    assert.strictEqual(
      missing.length,
      0,
      `${loc}: missing ${missing.length} key(s) present in en: ${truncateList(missing)}`
    );
    assert.strictEqual(
      extra.length,
      0,
      `${loc}: has ${extra.length} extra key(s) not in en: ${truncateList(extra)}`
    );
  });
}

test('every non-en locale declares identical placeholders and preserves all $TOKEN$s', () => {
  for (const loc of NON_EN_LOCALES) {
    const p = path.join(LOCALES_DIR, loc, 'messages.json');
    if (!fs.existsSync(p)) continue; // key-parity test above already fails this locale
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));

    for (const [k, enEntry] of Object.entries(EN)) {
      const locEntry = data[k];
      if (!locEntry) continue; // key-parity test above already reports this

      // 1. The `placeholders` object (names + content mapping) must match en exactly.
      const enPlaceholders = enEntry.placeholders || {};
      const locPlaceholders = locEntry.placeholders || {};
      const enPhNames = Object.keys(enPlaceholders);
      if (enPhNames.length) {
        assert.ok(
          locEntry.placeholders,
          `${loc}: ${k} is missing the placeholders object declared in en (${truncateList(enPhNames)})`
        );
        for (const name of enPhNames) {
          assert.ok(
            locPlaceholders[name],
            `${loc}: ${k} is missing placeholder "${name}" declared in en`
          );
          assert.strictEqual(
            locPlaceholders[name] && locPlaceholders[name].content,
            enPlaceholders[name].content,
            `${loc}: ${k} placeholder "${name}" has content "${locPlaceholders[name] && locPlaceholders[name].content}", expected "${enPlaceholders[name].content}" (must match en exactly)`
          );
        }
      }

      // 2. Every $TOKEN$ that appears in the en message must appear exactly
      //    once in the locale message too (order may differ; count must match).
      const enTokenCounts = {};
      for (const t of tokensOf(enEntry.message)) enTokenCounts[t] = (enTokenCounts[t] || 0) + 1;
      const locTokenCounts = {};
      for (const t of tokensOf(locEntry.message)) locTokenCounts[t] = (locTokenCounts[t] || 0) + 1;

      for (const [token, count] of Object.entries(enTokenCounts)) {
        assert.strictEqual(
          locTokenCounts[token] || 0,
          count,
          `${loc}: ${k} message must contain ${token} exactly ${count} time(s) (as in en), found ${locTokenCounts[token] || 0}`
        );
      }
    }
  }
});

test('no locale message contains HTML angle brackets', () => {
  for (const loc of EXPECTED) {
    const p = path.join(LOCALES_DIR, loc, 'messages.json');
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [k, v] of Object.entries(data)) {
      assert.ok(!/[<>]/.test(v.message), `${loc}: ${k} message contains HTML angle brackets: ${v.message}`);
    }
  }
});

test('no locale message contains a stray $TOKEN$ not declared by en for that key', () => {
  for (const loc of NON_EN_LOCALES) {
    const p = path.join(LOCALES_DIR, loc, 'messages.json');
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));

    for (const [k, locEntry] of Object.entries(data)) {
      const enEntry = EN[k];
      if (!enEntry) continue; // key-parity test above already reports orphan keys
      const enTokens = new Set(tokensOf(enEntry.message));
      const locTokens = new Set(tokensOf(locEntry.message));
      const stray = [...locTokens].filter((t) => !enTokens.has(t));
      assert.strictEqual(
        stray.length,
        0,
        `${loc}: ${k} message has stray token(s) not declared by en: ${truncateList(stray)}`
      );
    }
  }
});
