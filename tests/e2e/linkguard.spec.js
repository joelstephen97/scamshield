// tests/e2e/linkguard.spec.js — live link guard (0.15.0, Task 15): links to known scam sites are marked
// wherever they appear, including ones inserted later, and a click asks first.
// The feed is a fixture (runFeedUpdate with a local meta.json), exactly like serp-badges.spec.js: hash-set
// membership only, so the blocked sentinel needs no exact shard. Fixture pages only, never a live site.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Blockset = require('../../engine/blockset');

const FEED_DIR = path.join(__dirname, 'feed-fixtures');
const FEED_BASE_URL = 'http://localhost:5599/feed/';
const PAGE = 'http://localhost:5599/linkguard.html';
const SENTINEL = 'scamshield-test-blocked.example';
const POPULAR = 'en.wikipedia.org';

function hash40For(domain) { return Blockset.hash40FromBytes(crypto.createHash('sha256').update(domain).digest()); }
function buildRecords(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const buf = Buffer.alloc(sorted.length * 5);
  sorted.forEach((v, i) => { buf.writeUInt32BE(Math.floor(v / 256), i * 5); buf.writeUInt8(v % 256, i * 5 + 4); });
  return buf;
}
let seq = 0;
async function installFeed(sw, blockDomains) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
  const set40 = buildRecords(blockDomains.map(hash40For));
  const warn40 = buildRecords([hash40For('linkguard-unused-warn.example')]);
  fs.writeFileSync(path.join(FEED_DIR, 'set40.bin'), set40);
  fs.writeFileSync(path.join(FEED_DIR, 'warn40.bin'), warn40);
  fs.writeFileSync(path.join(FEED_DIR, 'risk.json'), JSON.stringify({ tlds: {}, dyndns: [], hosters: [] }));
  const meta = {
    version: 'linkguard-' + Date.now() + '-' + (seq++), generatedAt: new Date().toISOString(),
    counts: { block: blockDomains.length, warn: 1, total: blockDomains.length + 1 },
    sha256: { set40: crypto.createHash('sha256').update(set40).digest('hex'), deltaFromPrev: null },
    prev: null, urls: { cdn: FEED_BASE_URL, fallback: FEED_BASE_URL }, ttlHours: 6
  };
  fs.writeFileSync(path.join(FEED_DIR, 'meta.json'), JSON.stringify(meta));
  await sw.evaluate((url) => runFeedUpdate(url), FEED_BASE_URL + 'meta.json');
}
const confirmDialog = (page) => page.locator('.scamshield-linkconfirm');

test('a link inserted 3 s after load (infinite scroll) is marked block within 3 s, and a trusted click asks first', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE + '?late=1');
  await expect(page.locator('#late')).toHaveCount(0);
  await expect(page.locator('#late')).toHaveClass(/scamshield-link-block/, { timeout: 7000 }); // appears at 3 s, marked right after
  await expect(page.locator('#late')).toHaveAttribute('data-ss-pill', /.+/);
  // Unobtrusive: still an inline anchor, its display never touched.
  expect(await page.locator('#late').evaluate((a) => getComputedStyle(a).display)).toBe('inline');
  await page.locator('#late').click();
  await expect(confirmDialog(page)).toBeVisible();
  await expect(confirmDialog(page)).toContainText(/block list/i);
  // "Go back" is the default focus; the page stays.
  expect(await page.evaluate(() => { const h = document.querySelector('scamshield-surface'); return !!h && h.shadowRoot.activeElement && h.shadowRoot.activeElement.textContent; })).toBe('Go back');
  await confirmDialog(page).getByRole('button', { name: 'Go back' }).click();
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(page.url()).toBe(PAGE + '?late=1');
});

test('ctrl-click and middle-click on a blocked link also ask, and open nothing', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  let opened = 0;
  context.on('page', () => { opened++; });
  await page.locator('#wrapped').click({ modifiers: ['Control'] });
  await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: 'Go back' }).click();
  await page.locator('#wrapped').click({ button: 'middle' });
  await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: 'Go back' }).click();
  await page.waitForTimeout(500);
  expect(opened).toBe(0);
});

test('a Google-wrapped /url?q= link to the sentinel is unwrapped and marked', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
});

test('"Open anyway" navigates, and the block page is the final gate', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  // The DNR redirect rules are built on boot; the final gate only exists once they are in.
  await expect.poll(() => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules().then((rs) => rs.some((r) => r.action.type === 'redirect'))), { timeout: 8000 }).toBe(true);
  const page = await context.newPage();
  await page.goto(PAGE + '?late=1');
  await expect(page.locator('#late')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  await page.locator('#late').click();
  await page.waitForTimeout(450); // the button is armed 300 ms after the dialog appears
  await confirmDialog(page).getByRole('button', { name: 'Open anyway' }).click();
  await expect(page).toHaveURL(/blocked\.html/, { timeout: 8000 });
});

test('a link to a popular host is never marked, even when the feed lists it; the SW reports it popular', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL, POPULAR]);
  const batch = await sw.evaluate((h) => checkFeedBatchHosts([h]), POPULAR);
  expect(batch.results[POPULAR].popular).toBe(true);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 7000 }); // positive canary: the pass ran
  await expect(page.locator('#popular')).not.toHaveClass(/scamshield-link/);
  await page.locator('#popular').evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await page.locator('#popular').click();
  await expect(confirmDialog(page)).toHaveCount(0);
});

test('a feed with 0 matches marks nothing on a link-heavy page (benign canary), the sentinel feed marks (positive canary)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, ['linkguard-unrelated.example']);
  const page = await context.newPage();
  await page.goto(PAGE + '?many=1');
  await expect(page.locator('a.many')).toHaveCount(40);
  await page.waitForTimeout(2500);
  await expect(page.locator('[class*="scamshield-link-"]')).toHaveCount(0);
  await expect(page.locator('[data-ss-pill]')).toHaveCount(0);
  await installFeed(sw, [SENTINEL]);
  const page2 = await context.newPage();
  await page2.goto(PAGE + '?many=1');
  await expect(page2.locator('[class*="scamshield-link-"]')).toHaveCount(2, { timeout: 7000 }); // only #wrapped and #card
});

test('a blocked result on a search results page gets the SERP dot only (no second link mark), and a click on it still asks first', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(BASE_HTTPS.replace('localhost', 'www.google.com') + '/search?block=' + SENTINEL);
  await expect(page.locator('#badge-block-result .scamshield-serp-badge-danger')).toBeVisible({ timeout: 8000 });
  // One annotation per result (final fix B3): the SERP dot is there, so the link mark steps aside; the click confirm still applies.
  await page.waitForTimeout(1500);
  await expect(page.locator('#badge-block-result a')).not.toHaveClass(/scamshield-link-/);
  await expect(page.locator('#badge-block-result a')).not.toHaveAttribute('data-ss-pill', /.+/);
  await page.locator('#badge-block-result a').evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await page.locator('#badge-block-result a').click();
  await expect(confirmDialog(page)).toBeVisible();
});

test('surface log records link-block once per page and link-confirm when the dialog shows', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
  const page = await context.newPage();
  await page.goto(PAGE + '?late=1');
  await expect(page.locator('#late')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  await page.locator('#late').click();
  await expect(confirmDialog(page)).toBeVisible();
  const kinds = () => sw.evaluate(async () => (((await chrome.storage.local.get('surfaceLog')).surfaceLog) || []).map((r) => r.kind));
  await expect.poll(kinds, { timeout: 5000 }).toContain('link-confirm'); // the log write is fire-and-forget
  expect((await kinds()).filter((k) => k === 'link-block').length).toBe(1);
});

test('the page swapping the href while the confirm is open cannot redirect "Open anyway" to another destination', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  await page.locator('#wrapped').click();
  await expect(confirmDialog(page)).toBeVisible();
  await page.evaluate(() => { document.getElementById('wrapped').href = 'http://linkguard-swapped.example/evil'; });
  await page.waitForTimeout(450);
  await confirmDialog(page).getByRole('button', { name: 'Open anyway' }).click();
  await expect(confirmDialog(page)).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(page.url()).toBe(PAGE); // nothing opened: neither the swapped URL nor the original
  expect(context.pages().filter((p) => p.url().includes('linkguard-swapped')).length).toBe(0);
});

test('an image-card anchor (display:block) gets a corner badge, not a flow pill; an inline link keeps the flow pill', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#card')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  await expect(page.locator('#card')).toHaveClass(/scamshield-link-card/);
  expect(await page.locator('#card').evaluate((a) => getComputedStyle(a, '::after').position)).toBe('absolute');
  await expect(page.locator('#wrapped')).not.toHaveClass(/scamshield-link-card/);
  expect(await page.locator('#wrapped').evaluate((a) => getComputedStyle(a, '::after').position)).toBe('static');
});

test('a relative link resolves through <base> (a.href), so it is looked up at its real host', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE + '?base=1');
  await expect(page.locator('#rel')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
});

// 0.15.0 final fix B3: coverage when the queues saturate, and recovery from a failed lookup.
test('a 700-node append saturates the root queue; the catch-all still marks a late link past the cap (and the 700 clean links stay unmarked)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  await page.evaluate(() => {
    for (let i = 0; i < 700; i++) {
      const d = document.createElement('div');
      d.innerHTML = '<a class="bulk" id="bulk' + i + '" href="' + (i === 650 ? 'http://scamshield-test-blocked.example/bulk' : 'http://linkguard-clean-one.example/p' + i) + '">item ' + i + '</a>';
      document.body.appendChild(d); // 700 separate insertions: 700 queued roots, cap 500
    }
  });
  await expect(page.locator('#bulk650')).toHaveClass(/scamshield-link-block/, { timeout: 12000 });
  await expect(page.locator('a.bulk[class*="scamshield-link-"]')).toHaveCount(1);
});

test('a failed lookup (service worker error once) leaves the link unmarked at first and marks it after the 30 s retry', async ({ context }) => {
  test.setTimeout(80000);
  const SECOND = 'linkguard-second-blocked.example';
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL, SECOND]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  await page.goto(PAGE);
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 7000 }); // the guard is up
  const ext = ctxs.find((x) => x.auxData && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
  // Mock in the extension's own world: the next checkFeedBatch message fails once (as if the service worker were unreachable).
  await cdp.send('Runtime.evaluate', { contextId: ext.id, expression: `(function(){ const a = (globalThis.browser || globalThis.chrome).runtime; const o = a.sendMessage.bind(a); let fails = 1; a.sendMessage = function (m, cb) { if (m && m.type === 'checkFeedBatch' && fails-- > 0) { if (cb) cb(undefined); return; } return o(m, cb); }; })()` });
  await page.evaluate((h) => { const a = document.createElement('a'); a.id = 'second'; a.href = 'http://' + h + '/x'; a.textContent = 'second'; document.body.appendChild(a); }, SECOND);
  await page.waitForTimeout(3000);
  await expect(page.locator('#second')).not.toHaveClass(/scamshield-link-/);                      // the first lookup failed
  await expect(page.locator('#second')).toHaveClass(/scamshield-link-block/, { timeout: 45000 }); // retried after 30 s
});

test('a re-render that strips the mark classes gets them back', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  await page.locator('#wrapped').evaluate((a) => { a.className = ''; });
  await expect(page.locator('#wrapped')).toHaveClass(/scamshield-link-block/, { timeout: 4000 });
});

test('"Open anyway" ignores a click that lands within 300 ms of the dialog appearing (double-click on the link)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE + '?late=1');
  await expect(page.locator('#late')).toHaveClass(/scamshield-link-block/, { timeout: 7000 });
  await page.locator('#late').click();
  await expect(confirmDialog(page)).toBeVisible();
  // A real click on the armed-late button, issued at once through the browser input path.
  const box = await page.evaluate(() => { const b = [...document.querySelector('scamshield-surface').shadowRoot.querySelectorAll('button')].find((x) => /open anyway/i.test(x.textContent)); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(600);
  expect(page.url()).toBe(PAGE + '?late=1');
  await expect(confirmDialog(page)).toBeVisible(); // nothing happened: still asking
});
