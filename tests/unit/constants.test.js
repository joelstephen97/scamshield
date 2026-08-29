// tests/unit/constants.test.js
const test = require('node:test');
const assert = require('node:assert');
const C = require('../../engine/constants');

test('FEATURE_NAMES is a non-empty unique list', () => {
  assert.ok(Array.isArray(C.FEATURE_NAMES));
  assert.equal(C.FEATURE_NAMES.length, 17);
  assert.equal(new Set(C.FEATURE_NAMES).size, C.FEATURE_NAMES.length);
});

test('risk thresholds are ordered', () => {
  assert.ok(C.THRESHOLDS.suspicious < C.THRESHOLDS.dangerous);
});

test('brand and tld lists are present', () => {
  assert.ok(C.POPULAR_BRANDS.includes('paypal'));
  assert.ok(C.SUSPICIOUS_TLDS.includes('zip'));
  assert.ok(C.SUSPICIOUS_TOKENS.includes('verify'));
});

test('SAFE_DOMAINS is a non-empty list of top legitimate sites', () => {
  assert.ok(Array.isArray(C.SAFE_DOMAINS));
  assert.ok(C.SAFE_DOMAINS.includes('google.com'));
  assert.ok(C.SAFE_DOMAINS.includes('paypal.com'));
});

test('SAFE_DOMAINS includes regional brand storefronts', () => {
  assert.ok(C.SAFE_DOMAINS.includes('amazon.ae'));
  assert.ok(C.SAFE_DOMAINS.includes('amazon.co.uk'));
  assert.ok(C.SAFE_DOMAINS.includes('microsoftonline.com'));
});

test('registrableDomain handles multi-label public suffixes', () => {
  assert.equal(C.registrableDomain('www.amazon.co.uk'), 'amazon.co.uk');
  assert.equal(C.registrableDomain('a.b.google.com.sg'), 'google.com.sg');
  assert.equal(C.registrableDomain('dbs.com.sg'), 'dbs.com.sg');
  assert.equal(C.registrableDomain('www.example.com'), 'example.com');
  assert.equal(C.registrableDomain('example.com'), 'example.com');
});

test('registrableDomain passes through single labels, IPs, and trailing dots', () => {
  assert.equal(C.registrableDomain('localhost'), 'localhost');
  assert.equal(C.registrableDomain('192.168.0.1'), '192.168.0.1');
  assert.equal(C.registrableDomain('example.com.'), 'example.com');
  assert.equal(C.registrableDomain(''), '');
});

test('registrableParts splits sld and suffix', () => {
  assert.deepEqual(C.registrableParts('www.amazon.co.uk'),
    { domain: 'amazon.co.uk', sld: 'amazon', suffix: 'co.uk' });
  assert.deepEqual(C.registrableParts('login.microsoftonline.com'),
    { domain: 'microsoftonline.com', sld: 'microsoftonline', suffix: 'com' });
});

test('isSafeHost matches exact and subdomain of safe domains', () => {
  assert.ok(C.isSafeHost('amazon.ae'));
  assert.ok(C.isSafeHost('www.amazon.ae'));
  assert.ok(C.isSafeHost('help.netflix.com'));
  assert.ok(!C.isSafeHost('evilamazon.ae'));
  assert.ok(!C.isSafeHost('amazon.ae.evil.tk'));
});

test('KNOWN_AUTH_PROVIDERS lists major SSO registrable domains', () => {
  assert.ok(C.KNOWN_AUTH_PROVIDERS.includes('google.com'));
  assert.ok(C.KNOWN_AUTH_PROVIDERS.includes('microsoftonline.com'));
  assert.ok(C.KNOWN_AUTH_PROVIDERS.includes('okta.com'));
});

test('KNOWN_BRAND_REGISTRABLES is the flattened BRAND_DOMAINS set', () => {
  assert.ok(C.KNOWN_BRAND_REGISTRABLES.includes('microsoftonline.com'));
  assert.ok(C.KNOWN_BRAND_REGISTRABLES.includes('amazon.ae'));
  assert.ok(C.KNOWN_BRAND_REGISTRABLES.includes('paypal.com'));
});

test('SUSPICIOUS_TLDS includes newer high-abuse TLDs', () => {
  for (const t of ['pw', 'cc', 'ws', 'icu', 'buzz']) {
    assert.ok(C.SUSPICIOUS_TLDS.includes(t), t);
  }
});

const C2 = require('../../engine/constants');
test('BRANDS has ≥ 55 entries with keys, names, domains', () => {
  assert.ok(C2.BRANDS.length >= 55);
  for (const b of C2.BRANDS) { assert.ok(b.key && b.names.length && b.domains.length); assert.equal(typeof b.nameMatch, 'boolean'); }
});
test('original 19 brands still in POPULAR_BRANDS (URL lookalike behaviour floor)', () => {
  for (const k of ['paypal','google','apple','microsoft','amazon','facebook','instagram','netflix','whatsapp','binance','coinbase','metamask','dbs','maybank','wise','revolut','linkedin','outlook','gmail']) assert.ok(C2.POPULAR_BRANDS.includes(k), k);
});
test('brandNameIn is word-boundary and skips icon-only brands', () => {
  assert.equal(C2.brandNameIn('Log in to PayPal'), 'paypal');
  assert.equal(C2.brandNameIn('paypalsecure'), null);
  assert.equal(C2.brandNameIn('Our products are on sale'), null); // "du" must not match inside "products"
  assert.equal(C2.brandNameIn('Emirates NBD Online Banking'), 'emiratesnbd');
});
test('BRAND_DOMAINS carries auth domains for microsoft and uaepass', () => {
  assert.ok(C2.BRAND_DOMAINS.microsoft.includes('microsoftonline.com'));
  assert.ok(C2.BRAND_DOMAINS.uaepass.includes('uaepass.ae'));
});
test('brandNameIn does not false-positive on dictionary-word brand names', () => {
  assert.equal(C2.brandNameIn('Meta Trader login'), null);
  assert.equal(C2.brandNameIn('Azure DevOps'), null);
  assert.equal(C2.brandNameIn('Microsoft Azure portal'), 'microsoft');
});
test('brandDisplayName returns the canonical mixed-case name', () => {
  assert.equal(C2.brandDisplayName('paypal'), 'PayPal');
  assert.equal(C2.brandDisplayName('hsbc'), 'HSBC');
  assert.equal(C2.brandDisplayName('usps'), 'USPS');
  assert.equal(C2.brandDisplayName('dbs'), 'DBS Bank');
  assert.equal(C2.brandDisplayName('uaepass'), 'UAE PASS');
  assert.equal(C2.brandDisplayName('unknown-brand-xyz'), 'unknown-brand-xyz'); // falls back to key
  assert.equal(C2.brandDisplayName('mashreq'), 'Mashreq'); // no explicit display: title-cased names[0]
});

// --- SERP badge helpers (0.10.0, Task C1) -----------------------------------
test('unwrapSerpRedirect unwraps a Google /url?q= redirect wrapper', () => {
  const href = 'https://www.google.com/url?q=https://evil-lookalike.tk/pay&sa=U&ved=abc';
  assert.equal(C.unwrapSerpRedirect(href, 'https://www.google.com/search?q=x'), 'https://evil-lookalike.tk/pay');
});
test('unwrapSerpRedirect unwraps a Google ad /url?adurl= redirect wrapper', () => {
  const href = 'https://www.google.com/url?adurl=https://ad-dest.example/x&ust=1';
  assert.equal(C.unwrapSerpRedirect(href, 'https://www.google.com/search?q=x'), 'https://ad-dest.example/x');
});
test('unwrapSerpRedirect passes through an ordinary organic result href unchanged', () => {
  const href = 'https://en.wikipedia.org/wiki/Example';
  assert.equal(C.unwrapSerpRedirect(href, 'https://www.google.com/search?q=x'), href);
});
test('unwrapSerpRedirect resolves a relative href against the page it was found on', () => {
  assert.equal(C.unwrapSerpRedirect('/relative/path', 'https://example.com/page'), 'https://example.com/relative/path');
});
test('unwrapSerpRedirect rejects non-http(s) schemes and unparsable input', () => {
  assert.equal(C.unwrapSerpRedirect('javascript:alert(1)', 'https://www.google.com/'), null);
  assert.equal(C.unwrapSerpRedirect('', 'https://www.google.com/'), null);
});
test('unwrapSerpRedirect on a Google host with no recognised wrapper param returns the URL itself', () => {
  const href = 'https://maps.google.com/maps?q=coffee';
  assert.equal(C.unwrapSerpRedirect(href, 'https://www.google.com/search?q=x'), href);
});

test('dedupeCapped keeps first-seen order and drops duplicates', () => {
  assert.deepEqual(C.dedupeCapped(['a', 'b', 'a', 'c', 'b'], 10), ['a', 'b', 'c']);
});
test('dedupeCapped enforces the cap even with no duplicates', () => {
  assert.deepEqual(C.dedupeCapped(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
});
test('dedupeCapped tolerates null/undefined entries and a missing/empty list', () => {
  assert.deepEqual(C.dedupeCapped(['a', null, undefined, 'b'], 10), ['a', 'b']);
  assert.deepEqual(C.dedupeCapped(null, 10), []);
  assert.deepEqual(C.dedupeCapped([], 10), []);
});

// --- Cross-origin credential/card exfil watch (0.10.0, Task C2) ------------

test('luhnValid accepts real test-card numbers and rejects a single-digit tamper', () => {
  assert.ok(C.luhnValid('4111111111111111')); // Visa test PAN
  assert.ok(C.luhnValid('5500005555555559')); // Mastercard test PAN
  assert.ok(C.luhnValid('340000000000009')); // Amex test PAN (15 digits)
  assert.ok(!C.luhnValid('4111111111111112')); // last digit tampered
  assert.ok(!C.luhnValid(''));
  assert.ok(!C.luhnValid('abc'));
});

test('isPanShaped enforces the 13-19 digit window on top of Luhn, ignoring separators', () => {
  assert.ok(C.isPanShaped('4111 1111 1111 1111'));
  assert.ok(C.isPanShaped('4111-1111-1111-1111'));
  assert.ok(!C.isPanShaped('411111111111')); // 12 digits: below the floor even if some 12-digit string passed Luhn
  assert.ok(!C.isPanShaped('41111111111111111111')); // 20 digits: above the ceiling
  assert.ok(!C.isPanShaped('4111111111111112')); // right length, fails Luhn
  assert.ok(!C.isPanShaped(''));
  assert.ok(!C.isPanShaped(null));
});

test('isCredExfilAllowlisted matches by registrable domain, subdomains included', () => {
  assert.ok(C.isCredExfilAllowlisted('accounts.google.com'));
  assert.ok(C.isCredExfilAllowlisted('login.microsoftonline.com'));
  assert.ok(C.isCredExfilAllowlisted('appleid.apple.com'));
  assert.ok(C.isCredExfilAllowlisted('checkout.stripe.com'));
  assert.ok(C.isCredExfilAllowlisted('pay.google.com'));
  assert.ok(C.isCredExfilAllowlisted('www.paypal.com'));
  assert.ok(C.isCredExfilAllowlisted('checkout.paypal.com'));
  // Registrable-domain match, not exact-host: a sibling subdomain of the same
  // allowlisted domain clears too.
  assert.ok(C.isCredExfilAllowlisted('google.com'));
  assert.ok(C.isCredExfilAllowlisted('some-other-subdomain.paypal.com'));
  assert.ok(!C.isCredExfilAllowlisted('paypal.com.evil.tk'));
  assert.ok(!C.isCredExfilAllowlisted('stripe.com.attacker.example'));
});

test('crossOriginCredPostHost flags a genuine cross-origin post and returns its registrable domain', () => {
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/checkout', 'https://collector.evil.tk/grab'), 'evil.tk');
  // Relative action resolved against the page URL.
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/checkout', '//collector.evil.tk/grab'), 'evil.tk');
});

test('crossOriginCredPostHost clears same-site posts, including subdomains and multi-label suffixes', () => {
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/pay', '/submit'), null);
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/pay', 'https://api.example.com/submit'), null);
  assert.equal(C.crossOriginCredPostHost('https://www.amazon.co.uk/pay', 'https://checkout.amazon.co.uk/submit'), null);
});

test('crossOriginCredPostHost clears known SSO/payment allowlist targets', () => {
  assert.equal(C.crossOriginCredPostHost('https://myapp.example.com/login', 'https://accounts.google.com/o/oauth2'), null);
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/checkout', 'https://checkout.stripe.com/pay/cs_123'), null);
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/checkout', 'https://www.paypal.com/checkoutnow'), null);
});

test('crossOriginCredPostHost never flags a self-post (no action) or a non-http(s) action', () => {
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/pay', ''), null);
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/pay', null), null);
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/pay', 'javascript:void(document.forms[0].submit())'), null);
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/pay', 'about:blank'), null);
  assert.equal(C.crossOriginCredPostHost('https://shop.example.com/pay', 'mailto:evil@evil.tk'), null);
});

test('crossOriginCredPostHost fails safe on an unparsable page URL', () => {
  assert.equal(C.crossOriginCredPostHost('not a url', 'https://evil.tk/grab'), null);
});
