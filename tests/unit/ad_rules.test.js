// tests/unit/ad_rules.test.js — scam-ad rules (0.15.0, Task 17a): the pattern table, ad containers, destinations.
const test = require('node:test');
const assert = require('node:assert');
const A = require('../../engine/ad_rules.js');
const SL = require('../../engine/surface_log.js');

const names = (t) => A.matchedPatterns(t);

test('SCAM_AD_PATTERNS: each pattern fires on its own wording', () => {
  assert.deepStrictEqual(names('Elon Musk reveals the Bitcoin method banks hate'), ['celebrity-crypto']);
  assert.deepStrictEqual(names('Virus detected on your device'), ['virus-detected']);
  assert.deepStrictEqual(names('Warning: your computer is infected'), ['computer-infected']);
  assert.deepStrictEqual(names('Congratulations, you won a prize'), ['you-won']);
  assert.deepStrictEqual(names('Claim your prize today'), ['claim-prize']);
  assert.deepStrictEqual(names('The miracle cure for joint pain'), ['miracle-cure']);
  assert.deepStrictEqual(names('Doctors hate this one trick'), ['doctors-hate']);
  assert.deepStrictEqual(names('Guaranteed returns every week'), ['guaranteed-returns']);
  assert.deepStrictEqual(names('Double your money in 24 hours'), ['double-money']);
});

test('SCAM_AD_PATTERNS: word boundaries and negatives (no substring matches)', () => {
  assert.deepStrictEqual(names("You won't believe this recipe"), [], "'you won't' is not 'you won'");
  assert.deepStrictEqual(names('Bitcoin price rose today'), [], 'bitcoin alone is not celebrity-crypto');
  assert.deepStrictEqual(names('Elon Musk interview about rockets'), [], 'a celebrity alone is not crypto');
  assert.deepStrictEqual(names('Bitcoin ETF flows rose as analysts watched the fund grow'), [], 'no celebrity-endorsement phrase');
  assert.deepStrictEqual(names('unguaranteed returnsx doublex your money'), []);
  assert.deepStrictEqual(names('Miracle curets and doctors hated it'), []);
  assert.deepStrictEqual(names(''), []);
  assert.deepStrictEqual(names(null), []);
});

test('scamAdTextHit: needs at least two DIFFERENT patterns', () => {
  assert.strictEqual(A.scamAdTextHit('You won! Claim your prize now'), true);
  assert.strictEqual(A.scamAdTextHit('Claim your prize. Claim your prize.'), false, 'one pattern repeated is still one');
  assert.strictEqual(A.scamAdTextHit('You won a free phone'), false);
  assert.strictEqual(A.scamAdTextHit('Guaranteed returns, double your money'), true);
  assert.strictEqual(A.scamAdTextHit('A normal ad for running shoes'), false);
});

test('AD_SELECTOR names every container family from the brief', () => {
  for (const frag of ['ins.adsbygoogle', 'iframe[id^="google_ads_iframe"]', '[id^="div-gpt-ad"]', '.trc_rbox_container', '.trc_related_container',
    '.OUTBRAIN', '.ob-widget', '[id^="mgid"]', '.mgbox', '.rc-widget', '[aria-label="Advertisement" i]', '[data-ad-slot]']) {
    assert.ok(A.AD_SELECTOR.includes(frag), frag);
  }
});

test('adDestination: unwraps adurl= / clickurl= everywhere and url= on ad-click hosts only', () => {
  const base = 'https://news.example/story', page = 'news.example';
  const dest = 'http://scam-landing.example/offer?x=1';
  const enc = encodeURIComponent(dest);
  const host = (h) => { const d = A.adDestination(h, base, page); return d && d.host; };
  assert.strictEqual(host('https://www.googleadservices.com/pagead/aclk?sa=L&adurl=' + enc), 'scam-landing.example');
  assert.strictEqual(host('https://track.example/c?clickurl=' + enc), 'scam-landing.example');
  assert.strictEqual(host('https://ad.doubleclick.net/ddm/clk/1;2;3?url=' + enc), 'scam-landing.example');
  assert.strictEqual(host('https://paid.outbrain.com/network/redir?url=' + enc), 'scam-landing.example');
  assert.strictEqual(host('https://other.example/redirect?url=' + enc), 'other.example', 'url= is only unwrapped on ad-click hosts');
  assert.strictEqual(host('/relative'), null, 'same site');
  assert.strictEqual(host('javascript:void(0)'), null);
  assert.strictEqual(host('https://www.google.com/url?q=' + enc), 'scam-landing.example', 'the link-guard unwrap still applies');
});

test('shouldCollapse: any marked destination, or two scam patterns; popular/clean destinations never', () => {
  assert.strictEqual(A.shouldCollapse({ levels: ['block'], text: '' }), true);
  assert.strictEqual(A.shouldCollapse({ levels: [null, 'warn'], text: '' }), true);
  assert.strictEqual(A.shouldCollapse({ levels: [null, null], text: 'One pattern: you won' }), false);
  assert.strictEqual(A.shouldCollapse({ levels: [null], text: 'you won, claim your prize' }), true);
  assert.strictEqual(A.shouldCollapse({ levels: [], text: '' }), false);
  assert.strictEqual(A.shouldCollapse(null), false);
});

test('isAdSized: standard IAB sizes within a few px; articles and full-page frames are not ads', () => {
  for (const [w, h] of [[300, 250], [728, 90], [320, 50], [160, 600], [970, 250], [336, 280], [302, 252]]) assert.strictEqual(A.isAdSized(w, h), true, w + 'x' + h);
  for (const [w, h] of [[1280, 800], [600, 400], [40, 40], [0, 0], [300, 130]]) assert.strictEqual(A.isAdSized(w, h), false, w + 'x' + h);
});

test('surface log accepts ad-hidden', () => {
  assert.strictEqual(SL.appendRow([], { kind: 'ad-hidden', host: 'news.example' }, 1).length, 1);
});

test('tooBigForAd: page-sized, tall, or (generic selectors only) text-heavy containers are not ads', () => {
  const ok = { width: 300, height: 250 };
  assert.strictEqual(A.tooBigForAd(ok, 1280, 800, false, 0), false);
  assert.strictEqual(A.tooBigForAd({ width: 300, height: 1200 }, 1280, 3000, false, 0), true, 'taller than 1000px');
  assert.strictEqual(A.tooBigForAd({ width: 1200, height: 600 }, 1280, 800, false, 0), true, 'over 60% of the viewport');
  assert.strictEqual(A.tooBigForAd(ok, 1280, 800, true, 601), true, 'generic selector + long text');
  assert.strictEqual(A.tooBigForAd(ok, 1280, 800, false, 5000), false, 'specific ad selectors have no text cap');
  assert.strictEqual(A.tooBigForAd(null, 1280, 800, false, 0), true);
  assert.ok(A.CONTENT_SELECTOR.includes('article') && A.CONTENT_SELECTOR.includes('[role="main"]'));
});
