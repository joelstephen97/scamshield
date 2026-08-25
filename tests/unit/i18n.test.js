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
