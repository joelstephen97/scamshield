// tests/e2e/perf-budget.spec.js — link guard + ad guard main-thread budget (0.15.0, Task 17b).
// window.__ssPerf = {batches, maxMs, totalMs} lives in the extension's isolated world; read through CDP.
// Fixture: 200 links + 20 ad slots, then 100 more links + 10 more ad slots added after load.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');

test('ad-heavy page: link-guard and ad-guard batches stay within maxMs <= 4 and totalMs <= 50', async ({ context }) => {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  const read = async (expression) => {
    const ext = ctxs.find((x) => x.auxData && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
    if (!ext) return null;
    return cdp.send('Runtime.evaluate', { expression, contextId: ext.id, returnByValue: true }).then((r) => r.result.value);
  };
  await page.goto('http://localhost:5599/adguard-heavy.html');
  await expect.poll(async () => (await read('window.__ssPerf && window.__ssPerf.batches')) || 0, { timeout: 10000 }).toBeGreaterThan(1);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.addMore());
  await page.waitForTimeout(3500);
  const perf = await read('JSON.stringify({ perf: window.__ssPerf, rescan: window.__ssRescanStats })');
  const { perf: p, rescan } = JSON.parse(perf);
  console.log('PERF ' + JSON.stringify({ batches: p.batches, maxMs: +p.maxMs.toFixed(2), totalMs: +p.totalMs.toFixed(2), rescanTriggerMs: +rescan.triggerMs.toFixed(2) }));
  expect(p.batches).toBeGreaterThan(1);
  expect(p.maxMs).toBeLessThanOrEqual(4);
  expect(p.totalMs).toBeLessThanOrEqual(50);
});
