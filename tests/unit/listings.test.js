// tests/unit/listings.test.js — localized store listing integrity (Task 5, 0.6.0)
//
// store/listings/<locale>.md holds the Chrome Web Store listing copy for each
// of the 20 shipped locales (en + 19 translations). Each file must have the
// four canonical sections, a short description that fits the CWS 132-character
// field limit, and no leftover $NAME$-style placeholder tokens from the
// translation pass.
//
// 0.11.0 (CWS rejection "Yellow Argon", 2026-09-03) added two more guards:
//   - the dashboard shows the description as PLAIN TEXT, so no markdown
//     emphasis/code/headings may appear inside any section body (the old
//     listings pasted "**Why ScamShield**" and the store showed the asterisks
//     literally);
//   - Google flagged a ten-name list of UAE banks/agencies as keyword spam,
//     so no listing may name the flagged entities or any competitor product,
//     and no run of comma-separated capitalised names may exceed four.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LISTINGS_DIR = path.join(__dirname, '../../store/listings');

// Same 20-locale set as tests/unit/i18n.test.js.
const EXPECTED = ['en', 'zh_CN', 'hi', 'es', 'ar', 'fr', 'bn', 'pt_BR', 'ru', 'ur',
  'id', 'de', 'ja', 'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'it'];

// The three version-independent headings are required verbatim in every
// locale. The "What's new" heading carries a version number that only `en`
// (canon, owned by this task) is pinned to; the other 19 locales are a
// translation task's responsibility and may still carry an older version's
// "What's new" section — so they're only required to have SOME correctly
// formed "## What's new (X.Y.Z)" heading, not the current one.
const HEADINGS = ['## Name', '## Short description', '## Full description'];
const WHATS_NEW_RE = /## What's new \(\d+\.\d+\.\d+\)/;
const EN_WHATS_NEW_HEADING = "## What's new (0.12.0)";

// Names Google's reviewer quoted in the keyword-spam rejection, plus the
// competitor products the old FAQ name-dropped. None of them may appear in
// any listing, in any language.
const BANNED_ENTITIES = ['Emirates NBD', 'ADCB', 'FAB', 'Mashreq', 'RAKBANK', 'e&', 'Noon', 'UAE PASS',
  'MOHRE', 'Dubai Police', 'Aramex', 'Talabat', 'Careem', 'ADNOC', 'DEWA',
  'Guardio', 'Malwarebytes', 'Norton', 'Bitdefender', 'Avast', 'Trend Micro', 'Scamio', 'Genie', 'TrafficLight'];

function truncateList(items, n = 10) {
  if (items.length <= n) return items.join(', ');
  return items.slice(0, n).join(', ') + `, … (+${items.length - n} more)`;
}

// Everything after the leading <!-- --> comment: what actually gets pasted.
function pasteable(content) {
  return content.replace(/^\s*<!--[\s\S]*?-->\s*/, '');
}

test('all 20 locales have a store listing file', () => {
  for (const loc of EXPECTED) {
    assert.ok(fs.existsSync(path.join(LISTINGS_DIR, `${loc}.md`)), 'missing listing: ' + loc);
  }
});

test('store listing (en): "What\'s new" heading is pinned to the current version (0.12.0)', () => {
  const p = path.join(LISTINGS_DIR, 'en.md');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(
    content.includes(EN_WHATS_NEW_HEADING),
    `en.md: expected heading "${EN_WHATS_NEW_HEADING}" not found`
  );
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
    assert.ok(
      WHATS_NEW_RE.test(content),
      `${loc}.md: missing a "## What's new (X.Y.Z)" heading`
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

  test(`store listing (${loc}): plain text only — no markdown the store would show literally`, () => {
    const p = path.join(LISTINGS_DIR, `${loc}.md`);
    if (!fs.existsSync(p)) return;
    const body = pasteable(fs.readFileSync(p, 'utf8'));

    const bold = body.match(/\*\*[^*\n]+\*\*/g) || [];
    assert.strictEqual(bold.length, 0, `${loc}.md: markdown bold: ${truncateList(bold, 3)}`);
    const italics = body.match(/(^|[\s(])\*[^*\s][^*\n]*\*(?=[\s.,;:)]|$)/gm) || [];
    assert.strictEqual(italics.length, 0, `${loc}.md: markdown italics: ${truncateList(italics.map((s) => s.trim()), 3)}`);
    const code = body.match(/`[^`\n]+`/g) || [];
    assert.strictEqual(code.length, 0, `${loc}.md: markdown code spans: ${truncateList(code, 3)}`);
    const links = body.match(/\[[^\]\n]+\]\([^)\n]+\)/g) || [];
    assert.strictEqual(links.length, 0, `${loc}.md: markdown links: ${truncateList(links, 3)}`);
    // Only the four structural "## " headings may start with '#'; a "### X" or
    // "# X" inside a body would be pasted as-is.
    const headings = body.split(/\r?\n/).filter((l) => /^#/.test(l));
    const bad = headings.filter((l) => !HEADINGS.includes(l.trim()) && !WHATS_NEW_RE.test(l));
    assert.strictEqual(bad.length, 0, `${loc}.md: non-structural heading line(s): ${truncateList(bad, 3)}`);
    // Markdown "- " list bullets read as dashes in the dashboard; the canon
    // uses a plain "•" instead.
    const dashBullets = body.split(/\r?\n/).filter((l) => /^\s*[-*+] /.test(l));
    assert.strictEqual(dashBullets.length, 0, `${loc}.md: markdown list bullet(s): ${truncateList(dashBullets.map((s) => s.trim()), 3)}`);
  });

  test(`store listing (${loc}): no keyword-spam entity lists`, () => {
    const p = path.join(LISTINGS_DIR, `${loc}.md`);
    if (!fs.existsSync(p)) return;
    const body = pasteable(fs.readFileSync(p, 'utf8'));

    const hits = BANNED_ENTITIES.filter((e) => new RegExp('(^|[^A-Za-z])' + e.replace(/[&]/g, '\\&') + '(?![A-Za-z])').test(body));
    assert.strictEqual(hits.length, 0, `${loc}.md: names a flagged entity/competitor: ${truncateList(hits)}`);

    // A run of five or more comma-separated Capitalised Names on one line is
    // exactly the shape Google flagged (">5 entities"). Categories, not
    // names: "regional banks, telecom and government services".
    const RUN = /(?:\b[A-Z][A-Za-z0-9&.]+(?: [A-Z][A-Za-z0-9&.]+)?,\s+){4,}(?:and\s+|or\s+)?\b[A-Z][A-Za-z0-9&.]+/g;
    const runs = body.match(RUN) || [];
    assert.strictEqual(runs.length, 0, `${loc}.md: comma-run of 5+ capitalised names: ${truncateList(runs, 2)}`);
  });

  if (loc !== 'en') {
    test(`store listing (${loc}): is actually translated (no English body copied through)`, () => {
      const p = path.join(LISTINGS_DIR, `${loc}.md`);
      if (!fs.existsSync(p)) return;
      const body = pasteable(fs.readFileSync(p, 'utf8'));
      // "the" is not a word in any of the 19 target languages, so more than a
      // handful of them means an English paragraph was pasted through
      // untranslated (the 0.10.0 C4 incident).
      const the = (body.match(/\bthe\b/gi) || []).length;
      assert.ok(the <= 4, `${loc}.md: ${the} occurrences of "the" — an English passage was left untranslated`);
      for (const sentinel of ['There is no server.', 'The whole product is the free product.', 'WHAT IT BLOCKS', 'HOW IT WORKS']) {
        assert.ok(!body.includes(sentinel), `${loc}.md: untranslated English sentinel: "${sentinel}"`);
      }
    });
  }
}
