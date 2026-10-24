// tests/e2e/perf-budget.spec.js — link guard + ad guard main-thread budget (0.15.0, Task 17b).
// window.__ssPerf = {batches, maxMs, totalMs} lives in the extension's isolated world; read through CDP.
// Fixture: 200 links + 20 ad slots, then 100 more links + 10 more ad slots added after load.
// Three runs, assert on the median (a loaded CI box can spike one run); thresholds as briefed: maxMs <= 4, totalMs <= 50.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('ad-heavy page: link-guard and ad-guard batches stay within maxMs <= 4 and totalMs <= 50 (median of 3)', async ({ context }) => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
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
    const before = await read('window.__ssPerf.batches');
    await page.evaluate(() => window.addMore());
    // the dynamic add must really have been processed: more batches, so its cost is inside the numbers
    await expect.poll(async () => await read('window.__ssPerf.batches'), { timeout: 8000 }).toBeGreaterThan(before);
    await page.waitForTimeout(2000);
    const { perf: p, rescan } = JSON.parse(await read('JSON.stringify({ perf: window.__ssPerf, rescan: window.__ssRescanStats })'));
    runs.push({ batches: p.batches, maxMs: p.maxMs, totalMs: p.totalMs, rescanTriggerMs: rescan.triggerMs });
    await page.close();
  }
  console.log('PERF runs ' + JSON.stringify(runs.map((r) => ({ b: r.batches, max: +r.maxMs.toFixed(2), total: +r.totalMs.toFixed(2), trig: +r.rescanTriggerMs.toFixed(2) }))));
  const m = { maxMs: median(runs.map((r) => r.maxMs)), totalMs: median(runs.map((r) => r.totalMs)) };
  console.log('PERF median ' + JSON.stringify(m));
  expect(m.maxMs).toBeLessThanOrEqual(4);
  expect(m.totalMs).toBeLessThanOrEqual(50);
});

// 0.15.0 final fix B4: class churn is invisible to the rescan watch.
test('an animated page (classes toggling ~60 times a second for 3 s) causes 0 rescans and < 5 ms of rescan observer time', async ({ context }) => {
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
  await page.goto('http://localhost:5599/rescan-animated.html');
  await expect.poll(async () => await read('window.__ssLastTier'), { timeout: 8000 }).toBe('quiet');
  await page.waitForFunction(() => window.__animDone === true, null, { timeout: 12000 });
  await page.waitForTimeout(800);
  const st = JSON.parse(await read('JSON.stringify(window.__ssRescanStats)'));
  console.log('ANIM rescan stats ' + JSON.stringify(st));
  expect(st.rescans).toBe(0);
  expect(st.triggers).toBe(0);
  expect(st.triggerMs + st.observerMs).toBeLessThan(5);
});
