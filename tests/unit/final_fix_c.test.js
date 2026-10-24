// tests/unit/final_fix_c.test.js — 0.15.0 final fix wave C (service worker, pages, listings).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const C = require('../../engine/constants.js');
const SL = require('../../engine/surface_log.js');

// ---- 4. domain-taking handlers are bound to the sender --------------------------------------------------------
const EXT = 'chrome-extension://abcdef/';
const web = (tabUrl, frameUrl) => ({ tab: { id: 1, url: tabUrl }, url: frameUrl || tabUrl, frameId: 0 });
test('senderOwnsDomain: a content script may only name the site its tab is on', () => {
  assert.strictEqual(C.senderOwnsDomain(web('https://www.example.com/a'), 'example.com', EXT), true);
  assert.strictEqual(C.senderOwnsDomain(web('https://login.example.co.uk/'), 'Example.co.uk ', EXT), true);
  assert.strictEqual(C.senderOwnsDomain(web('https://evil.example/'), 'paypal.com', EXT), false);
  assert.strictEqual(C.senderOwnsDomain(web('https://evil.example/'), '', EXT), false);
  assert.strictEqual(C.senderOwnsDomain(web('not a url'), 'example.com', EXT), false);
  assert.strictEqual(C.senderOwnsDomain({ tab: { id: 1 } }, 'example.com', EXT), false);
});
test('senderOwnsDomain: tenant hosts compare by scope, never by the shared apex', () => {
  assert.strictEqual(C.senderOwnsDomain(web('https://mine.pages.dev/'), 'mine.pages.dev', EXT), true);
  assert.strictEqual(C.senderOwnsDomain(web('https://mine.pages.dev/'), 'pages.dev', EXT), false);
  assert.strictEqual(C.senderOwnsDomain(web('https://mine.pages.dev/'), 'other.pages.dev', EXT), false);
});
test('senderOwnsDomain: the popup (no tab) and our own pages (tab, extension url) are exempt', () => {
  assert.strictEqual(C.senderOwnsDomain({ url: EXT + 'popup.html' }, 'anything.example', EXT), true);
  assert.strictEqual(C.senderOwnsDomain(undefined, 'anything.example', EXT), true);
  assert.strictEqual(C.senderOwnsDomain({ tab: { id: 2, url: EXT + 'blocked.html#https://bad.example/' }, url: EXT + 'blocked.html' }, 'bad.example', EXT), true);
  // a web frame is still a web sender
  assert.strictEqual(C.senderOwnsDomain({ tab: { id: 2, url: 'https://x.example/' }, url: 'https://x.example/' }, 'bad.example', EXT), false);
});
test('every domain-taking handler checks senderOwns before it acts', () => {
  const sw = read('background/service_worker.js');
  for (const c of ['trustSite', 'muteWarning', 'pauseSite', 'warnBudget', 'warnDismissed', 'unquietSite', 'falseAlarm']) {
    const i = sw.indexOf("case '" + c + "'");
    assert.ok(i > 0, c);
    assert.ok(/senderOwns\(sender, msg\.domain\)/.test(sw.slice(i, i + 260)), c + ' is bound to the sender');
  }
  assert.ok(/warnBudget'[\s\S]{0,260}allow: true/.test(sw), 'warnBudget fails open on a mismatch');
});

// ---- 5. i18n resolves per call across [chrome, browser] -------------------------------------------------------
function loadI18n(globals) {
  const sandbox = Object.assign({ document: { readyState: 'complete', documentElement: { getAttribute: () => null, setAttribute() {} }, querySelectorAll: () => [] } }, globals);
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('ui/i18n.js'), sandbox);
  return sandbox.SSi18n;
}
test('i18n.t: a partial browser alias without i18n does not hide chrome.i18n', () => {
  const I = loadI18n({ browser: { runtime: {} }, chrome: { i18n: { getMessage: (k) => 'chrome:' + k, getUILanguage: () => 'en' } } });
  assert.strictEqual(I.t('hello'), 'chrome:hello');
});
test('i18n.t: first non-empty answer wins; a throwing or empty provider falls through; never the raw key', () => {
  const I = loadI18n({ browser: { i18n: { getMessage: () => '' } }, chrome: { i18n: { getMessage: (k) => (k === 'known' ? 'yes' : '') } } });
  assert.strictEqual(I.t('known'), 'yes');
  assert.strictEqual(I.t('missing'), '');
  const J = loadI18n({ browser: { i18n: { getMessage: () => { throw new Error('boom'); } } }, chrome: { i18n: { getMessage: () => 'ok' } } });
  assert.strictEqual(J.t('x'), 'ok');
  const K = loadI18n({});
  assert.strictEqual(K.t('x'), '');
});

// ---- 7. SYNCED_KEYS keep the user toggles added since the list was written -----------------------------------
test('SYNCED_KEYS includes linkGuard, adGuard, serpCheck and shopGuard (and each is a real default)', () => {
  const sw = read('background/service_worker.js');
  const m = /const SYNCED_KEYS = \[([\s\S]*?)\];/.exec(sw);
  const keys = m[1].replace(/\/\/.*$/gm, '').match(/'[A-Za-z]+'/g).map((x) => x.slice(1, -1));
  for (const k of ['linkGuard', 'adGuard', 'serpCheck', 'shopGuard']) {
    assert.ok(keys.includes(k), k + ' is synced / exported');
    assert.ok(new RegExp('\\n  ' + k + ': ').test(sw), k + ' has a default');
  }
  assert.ok(!keys.includes('enabled'), 'the master switch stays device-local');
});

// ---- 8. surface log: identical consecutive row within 2 minutes -----------------------------------------------
test('surface log skips an identical consecutive host+kind row within 2 minutes only', () => {
  const l = SL.appendRow([], { host: 'a.example', kind: 'banner' }, 1000);
  assert.strictEqual(SL.appendRow(l, { host: 'a.example', kind: 'banner' }, 1000 + 60000), l);
  assert.strictEqual(SL.appendRow(l, { host: 'a.example', kind: 'banner' }, 1000 + 119999), l);
  assert.strictEqual(SL.appendRow(l, { host: 'a.example', kind: 'banner' }, 1000 + 120000).length, 2);
  assert.strictEqual(SL.appendRow(l, { host: 'a.example', kind: 'toast-leak' }, 2000).length, 2);
  assert.strictEqual(SL.appendRow(l, { host: 'b.example', kind: 'banner' }, 2000).length, 2);
  // only the CONSECUTIVE row counts: a.banner, b.banner, a.banner is three rows
  const three = SL.appendRow(SL.appendRow(l, { host: 'b.example', kind: 'banner' }, 2000), { host: 'a.example', kind: 'banner' }, 3000);
  assert.strictEqual(three.length, 3);
});

// ---- 1/2/3/6/9/10 wiring that has no browser-free behaviour ---------------------------------------------------
test('blocked.js: an escalated page never calls history.back(); it closes the tab or parks on about:blank', () => {
  const js = read('ui/blocked.js');
  const fn = js.slice(js.indexOf("$('back').addEventListener"));
  assert.ok(/if \(escalated\) \{ await leaveEscalated\(\); return; \}/.test(fn.slice(0, 200)), 'escalated branch precedes history.back');
  const leave = js.slice(js.indexOf('async function leaveEscalated'), js.indexOf("$('back').addEventListener"));
  assert.ok(!/history\.back/.test(leave));
  assert.ok(/tabs\.remove/.test(leave) && /about:blank/.test(leave));
});
const V = (level) => ({ level, score: 0, reasons: [] });
const fresh = () => ({ url: 'https://x.example/', top: null, sub: null, counted: false, loadId: '' });
test('mergeFrameReport: an early additive stop is not wiped by the later quiet main scan of the same load', () => {
  const fv = fresh();
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L1', verdict: V('dangerous'), tier: 'stop' });
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L1', verdict: V('safe'), tier: 'quiet' });
  assert.strictEqual(fv.tier, 'stop');
  assert.strictEqual(fv.top.level, 'dangerous');
});
test('mergeFrameReport: warn, pause, reload (a new loadId) clears the tier; the same id never lowers it', () => {
  const fv = fresh();
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L1', verdict: V('dangerous'), tier: 'warn' });
  assert.strictEqual(fv.tier, 'warn');
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L1', verdict: V('safe'), tier: 'quiet' });
  assert.strictEqual(fv.tier, 'warn');
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L2', verdict: V('safe'), tier: 'quiet' });
  assert.strictEqual(fv.tier, 'quiet');
  assert.strictEqual(fv.top.level, 'safe');
});
test('mergeFrameReport: a sub-frame stop holds within a load and is cleared by a reload', () => {
  const fv = fresh();
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L1', verdict: V('safe'), tier: 'quiet' });
  const r = C.mergeFrameReport(fv, { fromSubframe: true, loadId: '', verdict: V('dangerous'), tier: 'stop' });
  assert.strictEqual(r.silentSub, false);
  assert.strictEqual(fv.tier, 'stop'); assert.strictEqual(fv.sub.level, 'dangerous');
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L1', verdict: V('safe'), tier: 'quiet' });
  assert.strictEqual(fv.sub.level, 'dangerous');
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L2', verdict: V('safe'), tier: 'quiet' });
  assert.strictEqual(fv.sub, null); assert.strictEqual(fv.tier, 'quiet');
});
test('mergeFrameReport: a silent sub-frame (ad / captcha iframe) changes nothing; a report without an id only rises', () => {
  const fv = fresh();
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: 'L1', verdict: V('suspicious'), tier: 'warn' });
  const r = C.mergeFrameReport(fv, { fromSubframe: true, loadId: '', verdict: V('dangerous'), tier: 'warn' });
  assert.strictEqual(r.silentSub, true); assert.strictEqual(fv.sub, null); assert.strictEqual(fv.tier, 'warn');
  C.mergeFrameReport(fv, { fromSubframe: false, loadId: '', verdict: V('safe'), tier: 'quiet' });
  assert.strictEqual(fv.tier, 'warn');
});
test('reportVerdict wiring: the worker merges through mergeFrameReport; the content script sends a per-load id', () => {
  const sw = read('background/service_worker.js');
  assert.ok(/ScamShield\.mergeFrameReport\(fv, \{ fromSubframe, loadId, verdict: msg\.verdict, tier \}\)/.test(sw));
  const cs = read('content/content_script.js');
  assert.ok(/type === 'reportVerdict' \? \{ loadId: LOAD_ID \}/.test(cs));
  assert.ok(/LOAD_ID = Math\.random\(\)/.test(cs.slice(cs.indexOf("addEventListener('scamshield:navigate'"))), 'a new id on an SPA route change');
});
test('sub-frame trust / mute / false alarm name the TOP host, and an ack needs { ok: true }', () => {
  const act = read('content/actions.js'), cs = read('content/content_script.js');
  assert.ok(/SS\.scopeDomain\(siteHost\(\)\)/.test(act));
  assert.ok(/topHostFromFrame\(\) \|\| location\.hostname/.test(act));
  assert.strictEqual((act.match(/if \(r && r\.ok\) (ack|trustAck)\(/g) || []).length, 4);
  assert.ok(/scopeOf\(siteHost\(\)\)/.test(cs) && /if \(r && r\.ok && SS\.actions && SS\.actions\.ackSurface\)/.test(cs));
  assert.ok(/send\('falseAlarm', \{ domain: scopeOf\(siteHost\(\)\) \}\)/.test(cs));
});
test('handleUserReport falls back to the persisted verdict before the default', () => {
  const sw = read('background/service_worker.js');
  assert.ok(/lastVerdict\.get\(tabId\) \|\| \(tabId != null \? await readPersistedVerdict\(tabId\) : null\) \|\| \{ level: 'safe'/.test(sw));
});
test('openLink retries tabs.create without openerTabId (Firefox for Android)', () => {
  const sw = read('background/service_worker.js');
  const i = sw.indexOf("case 'openLink'");
  const body = sw.slice(i, i + 1400);
  assert.ok(/tabs\.create\(\{ url, openerTabId: tabId, active: true \}\); \} catch \(_\) \{ await api\.tabs\.create\(\{ url, active: true \}\)/.test(body));
});
test("removeTrust also clears that site's quietSites entry", () => {
  const sw = read('background/service_worker.js');
  const i = sw.indexOf('async function removeTrust');
  assert.ok(/updateQuietSite\(d, \(\) => \(\{ entry: null \}\)\)/.test(sw.slice(i, i + 700)));
});
test('popup: quiet tier with no reasons becomes the safe card; the review ask fails closed without a surface log', () => {
  const js = read('popup.js');
  assert.ok(/if \(quietTier && !quiet\) level = 'safe';/.test(js));
  assert.ok(/if \(!Array\.isArray\(log\)\) \{ reviewEligible = false; return; \}/.test(js));
});
test('privacy.html lists quietSites and the surface log as local, capped and clearable', () => {
  const html = read('privacy.html');
  const sec = html.slice(html.indexOf('Data stored on your device'), html.indexOf('3. Threat-list download'));
  assert.ok(/quiet sites/i.test(sec) && /What ScamShield showed/.test(sec));
  assert.ok(/capped/.test(sec) && /Clear/.test(sec) && /never transmitted/.test(sec));
});

// ---- 11. listings -----------------------------------------------------------------------------------------------
test('every listing describes scroll-time protection in the FULL description, and the English is exact', () => {
  const dir = path.join(root, 'store', 'listings');
  const en = fs.readFileSync(path.join(dir, 'en.md'), 'utf8');
  const full = (s) => s.slice(s.indexOf('## Full description'), s.indexOf('## What'));
  assert.ok(/scam links are marked before you click them, and scam ads are hidden \(this is not a general ad blocker\)/.test(full(en)));
  const enRows = full(en).split(/\r?\n/).filter((l) => l.startsWith('• '));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const rows = full(fs.readFileSync(path.join(dir, f), 'utf8')).split(/\r?\n/).filter((l) => l.startsWith('• '));
    assert.strictEqual(rows.length, enRows.length, f + ' has the same bullet count as en');
    if (f !== 'en.md') {
      const i = enRows.findIndex((l) => /^• Protection while you scroll/.test(l));
      assert.notStrictEqual(rows[i], enRows[i], f + ': translated, not an English copy');
    }
  }
});
