const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');
const PF = require('../../engine/page_features');

function load(name) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/pages', name), 'utf8');
  return parseHTML(html).document;
}
const D = PF.PAGE_DENSE_NAMES;
const idx = (n) => D.indexOf(n);

test('dense schema is the 16 documented features in order', () => {
  assert.deepEqual(D, ['n_forms', 'n_inputs', 'n_password', 'n_hidden_inputs', 'n_links',
    'external_link_ratio', 'dead_href_ratio', 'same_host_link_ratio', 'n_iframes', 'n_images',
    'n_scripts', 'text_len_log', 'has_nav_or_header_footer', 'has_lang_attr', 'has_icon_link',
    'login_words_in_inputs']);
});

test('fnv1a is the reference FNV-1a 32-bit', () => {
  assert.equal(PF.fnv1a(''), 0x811c9dc5);
  assert.equal(PF.fnv1a('a'), 0xe40c292c);
});

test('tokenize lowercases, splits on non-alnum, drops <2 chars, maps numbers to #num', () => {
  assert.deepEqual(PF.tokenize('Verify NOW: 24 hours, or x'), ['verify', 'now', '#num', 'hours', 'or']);
});

test('phishing login page: password form, foreign action, dead links, no nav', () => {
  const f = PF.extractPageFeatures(load('phish-login.html'), { host: 'secure-login.example' });
  assert.equal(f.dense.length, 16);
  assert.equal(f.dense[idx('n_password')], 1 / 3);
  assert.equal(f.dense[idx('has_nav_or_header_footer')], 0);
  assert.equal(f.dense[idx('has_lang_attr')], 0);
  assert.equal(f.dense[idx('dead_href_ratio')], 1); // all 3 anchors are # / javascript:
  assert.equal(f.dense[idx('login_words_in_inputs')], 1);
  const fbucket = PF.fnv1a('f:foreign') & (PF.PAGE_BUCKETS - 1);
  assert.ok(f.tokens[fbucket] >= 1, 'form action foreign token present');
  assert.ok(f.tokens[PF.fnv1a('t:verify') & (PF.PAGE_BUCKETS - 1)] >= 1, 'title token hashed with t: prefix');
});

test('legit login page: same-host form, nav present, lang and icon set', () => {
  const f = PF.extractPageFeatures(load('legit-login.html'), { host: 'shop.contoso.com' });
  assert.equal(f.dense[idx('has_nav_or_header_footer')], 1);
  assert.equal(f.dense[idx('has_lang_attr')], 1);
  assert.equal(f.dense[idx('has_icon_link')], 1);
  assert.ok(f.tokens[PF.fnv1a('f:same') & (PF.PAGE_BUCKETS - 1)] >= 1);
  assert.ok(f.dense[idx('same_host_link_ratio')] > 0.5);
});

test('blog page has no forms and few tokens beyond text', () => {
  const f = PF.extractPageFeatures(load('blog.html'), { host: 'kitchen.example' });
  assert.equal(f.dense[idx('n_forms')], 0);
  assert.equal(f.dense[idx('n_password')], 0);
  assert.ok(f.meta.nTokens > 20);
});

test('every dense value is within 0..1 and deterministic across calls', () => {
  const a = PF.extractPageFeatures(load('legit-login.html'), { host: 'shop.contoso.com' });
  const b = PF.extractPageFeatures(load('legit-login.html'), { host: 'shop.contoso.com' });
  assert.deepEqual(a, b);
  for (const v of a.dense) assert.ok(v >= 0 && v <= 1, String(v));
});

test('unparseable absolute form action is treated as foreign, not same-host', () => {
  const { document } = parseHTML('<form action="https://exa mple.com/p" method="post"><input type="password" name="p"></form>');
  const f = PF.extractPageFeatures(document, { host: 'shop.contoso.com' });
  const foreignBucket = PF.fnv1a('f:foreign') & (PF.PAGE_BUCKETS - 1);
  assert.ok(f.tokens[foreignBucket] >= 1, 'unparseable form action treated as foreign');
  assert.equal(f.dense[idx('n_password')], 1 / 3);
  for (const v of f.dense) assert.ok(v >= 0 && v <= 1, String(v));
});
