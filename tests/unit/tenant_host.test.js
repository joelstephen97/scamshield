// tests/unit/tenant_host.test.js — credential forms on free-hosting tenants (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const fs = require('node:fs'); const path = require('node:path');
const C = require('../../engine/constants.js'); const BM = require('../../engine/brand_match.js'); const H = require('../../engine/heuristics.js');
test('tenantLabel: leftmost label of a platform tenant; null for the apex, www, and non-platforms', () => {
  assert.strictEqual(C.tenantLabel('signin-att-verifier.webflow.io'), 'signin-att-verifier');
  assert.strictEqual(C.tenantLabel('ultramaisnu.s3.us-east-005.backblazeb2.com'), 'ultramaisnu');
  assert.strictEqual(C.tenantLabel('webflow.io'), null);
  assert.strictEqual(C.tenantLabel('www.vercel.app'), null);
  assert.strictEqual(C.tenantLabel('hdfcbank.com'), null);
});
test('tenantBrandToken: hyphen/dot tokens of the tenant label against the brand pack, homoglyph-aware', () => {
  assert.strictEqual(BM.tenantBrandToken('signin-att-verifier'), 'att');
  assert.strictEqual(BM.tenantBrandToken('bellsouth-att-signing-83d69c'), 'bellsouth');
  assert.strictEqual(BM.tenantBrandToken('ledgerr-lliv'), 'ledger');   // DL-1 on a ≥6-char brand
  assert.strictEqual(BM.tenantBrandToken('bancaribe'), 'bancaribe');
  assert.strictEqual(BM.tenantBrandToken('my-portfolio-2026'), null);
  assert.strictEqual(BM.tenantBrandToken('docs'), null);
});
test('scoreDom: password form on a tenant host is +0.45; with a brand token it is dangerous', () => {
  const plain = H.scoreDom({ pageHost: 'my-portfolio-2026.vercel.app', hasPasswordField: true });
  assert.ok(plain.reasons.some((r) => r.code === 'credentialFormOnTenantHost')); assert.ok(plain.score < 0.8);
  const kit = H.scoreDom({ pageHost: 'signin-att-verifier.webflow.io', hasPasswordField: true });
  assert.ok(kit.flags.includes('brand-impersonation-tenant')); assert.ok(kit.score >= 0.9); assert.strictEqual(kit.brand, 'att');
  const noForm = H.scoreDom({ pageHost: 'signin-att-verifier.webflow.io', hasPasswordField: false });
  assert.ok(!noForm.flags.includes('brand-impersonation-tenant')); assert.ok(noForm.score < 0.5);
  const apex = H.scoreDom({ pageHost: 'vercel.com', hasPasswordField: true });
  assert.ok(!apex.reasons.some((r) => r.code === 'credentialFormOnTenantHost'));
});
test('platform_legit hosts with a password field never reach dangerous on this signal alone', () => {
  const hosts = fs.readFileSync(path.join(__dirname, 'fixtures/platform_legit.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const h of hosts) assert.ok(H.scoreDom({ pageHost: h, hasPasswordField: true }).score < 0.8, h);
});
