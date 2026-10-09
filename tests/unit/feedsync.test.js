// tests/unit/feedsync.test.js — 0.14.1 feed download robustness: per-tier
// incremental persistence, per-fetch timeouts, partial-failure reporting.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const F = require('../../background/feedsync');

const sha = async (buf) => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const ab = (s) => new TextEncoder().encode(s).buffer;
const BLOCK = ab('block-v2'), WARN = ab('warn'), NRD = ab('nrd');
const RISK = { tlds: { xyz: 3 } };
const RISK_TEXT = JSON.stringify(RISK);

async function makeMeta(over) {
  return Object.assign({
    version: 'v2', urls: { cdn: 'https://cdn/' },
    sha256: { set40: await sha(BLOCK), warn40: await sha(WARN), risk: await sha(new TextEncoder().encode(RISK_TEXT)) },
    nrd: { sha256: await sha(NRD) },
  }, over);
}
const emptyRec = () => ({ version: null, blockBuf: null, warnBuf: null, warnUpdatedAt: 0, riskTables: null, riskUpdatedAt: 0, nrdBuf: null, nrdUpdatedAt: 0 });

// fetchBuf/fetchJson stubs keyed by filename; a function value may throw.
function harness(files, rec) {
  const saves = [];
  const get = async (name) => { const v = files[name]; if (typeof v === 'function') return v(); return v === undefined ? null : v; };
  const deps = {
    fetchBuf: get,
    fetchJson: get,
    sha256Hex: sha,
    applyDelta: () => { throw new Error('no delta in this test'); },
    save: async (r) => { saves.push(r); },
    now: () => 1_000_000,
  };
  return { deps, saves, rec: rec || emptyRec() };
}
const allFiles = () => ({ 'set40.bin': BLOCK, 'warn40.bin': WARN, 'risk.json': { data: RISK, text: RISK_TEXT }, 'nrd.bloom': NRD });

test('happy path: every tier saved incrementally, block first, no partial', async () => {
  const h = harness(allFiles());
  const r = await F.syncFeed({ meta: await makeMeta(), rec: h.rec, deps: h.deps });
  assert.deepEqual(r.partial, []);
  assert.equal(r.version, 'v2');
  assert.equal(h.saves.length, 4);
  assert.equal(h.saves[0].version, 'v2');            // block tier hit disk first
  assert.equal(h.saves[0].warnBuf, null);
  assert.equal(h.saves[3].nrdBuf, NRD);
  assert.ok(r.blockChanged && r.warnChanged && r.riskChanged && r.nrdChanged);
});

test('warn fetch rejects: block tier saved, version advanced, risk + nrd still saved', async () => {
  const h = harness(Object.assign(allFiles(), { 'warn40.bin': () => { throw new Error('boom'); } }));
  const r = await F.syncFeed({ meta: await makeMeta(), rec: h.rec, deps: h.deps });
  assert.deepEqual(r.partial, ['warn']);
  assert.equal(r.version, 'v2');
  assert.equal(h.saves[0].version, 'v2');
  assert.equal(h.saves[0].blockBuf, BLOCK);
  assert.equal(r.rec.warnBuf, null);
  assert.ok(r.rec.riskTables && r.rec.nrdBuf);
});

test('nrd sha mismatch: nrd not saved, others saved', async () => {
  const h = harness(Object.assign(allFiles(), { 'nrd.bloom': ab('tampered') }));
  const r = await F.syncFeed({ meta: await makeMeta(), rec: h.rec, deps: h.deps });
  assert.deepEqual(r.partial, ['nrd']);
  assert.equal(r.rec.nrdBuf, null);
  assert.equal(r.rec.blockBuf, BLOCK);
  assert.equal(r.rec.warnBuf, WARN);
  assert.ok(r.rec.riskTables);
  assert.ok(h.saves.every((s) => s.nrdBuf === null));
});

test('block tier failing verification keeps the old version; other tiers still land', async () => {
  const old = Object.assign(emptyRec(), { version: 'v1', blockBuf: ab('block-v1') });
  const h = harness(Object.assign(allFiles(), { 'set40.bin': ab('tampered') }), old);
  const r = await F.syncFeed({ meta: await makeMeta(), rec: old, deps: h.deps });
  assert.deepEqual(r.partial, ['block']);
  assert.equal(r.rec.version, 'v1');
  assert.equal(r.blockChanged, false);
  assert.equal(r.rec.warnBuf, WARN);
});

test('a failed later save does not undo the block tier already saved', async () => {
  const h = harness({ 'set40.bin': BLOCK, 'warn40.bin': WARN });
  let n = 0;
  h.deps.save = async (r) => { n++; if (n === 2) throw new Error('quota'); h.saves.push(r); };
  const r = await F.syncFeed({ meta: await makeMeta(), rec: h.rec, deps: h.deps });
  assert.equal(h.saves[0].version, 'v2');
  assert.ok(r.partial.includes('warn'));
  assert.equal(r.rec.warnBuf, null); // working copy stays at the last saved state
});

test('fresh tiers (< 7 days) are not refetched; nothing changed -> no saves', async () => {
  const rec = { version: 'v2', blockBuf: BLOCK, warnBuf: WARN, warnUpdatedAt: 1_000_000 - 1000, riskTables: RISK, riskUpdatedAt: 1_000_000, nrdBuf: NRD, nrdUpdatedAt: 1_000_000 };
  const h = harness({}, rec);
  const r = await F.syncFeed({ meta: await makeMeta(), rec, deps: h.deps });
  assert.equal(h.saves.length, 0);
  assert.deepEqual(r.partial, []);
  assert.equal(r.version, 'v2');
});

// AbortSignal.timeout's timer is unref'd, so keep the loop alive while "hung".
const hang = (url, opts) => new Promise((_res, rej) => {
  const keep = setTimeout(() => {}, 5000);
  opts.signal.addEventListener('abort', () => { clearTimeout(keep); rej(new Error('aborted')); });
});

test('fetchBufFromBases: a hung base times out and falls through to the next base', async () => {
  const calls = [];
  const fetchFn = (url, opts) => { calls.push(url); return url.startsWith('https://slow/') ? hang(url, opts) : Promise.resolve({ ok: true, arrayBuffer: async () => WARN }); };
  const t0 = Date.now();
  const buf = await F.fetchBufFromBases(['https://slow/', 'https://fast/'], 'warn40.bin', 50, fetchFn);
  assert.equal(buf, WARN);
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(calls, ['https://slow/warn40.bin', 'https://fast/warn40.bin']);
});

test('syncFeed resolves (block saved) when warn/risk/nrd hang and the timeout helper bounds them', async () => {
  const fetchFn = (url, opts) => url.endsWith('set40.bin') ? Promise.resolve({ ok: true, arrayBuffer: async () => BLOCK }) : hang(url, opts);
  const saves = [];
  const bases = ['https://cdn/'];
  const deps = {
    fetchBuf: (name) => F.fetchBufFromBases(bases, name, 40, fetchFn),
    fetchJson: (name) => F.fetchJsonFromBases(bases, name, 40, fetchFn),
    sha256Hex: sha, applyDelta: () => null, save: async (r) => { saves.push(r); }, now: () => 1_000_000,
  };
  const r = await F.syncFeed({ meta: await makeMeta(), rec: emptyRec(), deps });
  assert.equal(saves[0].version, 'v2');
  assert.deepEqual(r.partial.slice().sort(), ['nrd', 'risk', 'warn']);
});

test('fetchJsonFromBases passes a timeout signal and skips bad JSON', async () => {
  let sawSignal = false;
  const fetchFn = async (url, opts) => { sawSignal = !!opts.signal; return { ok: true, text: async () => 'not json' }; };
  assert.equal(await F.fetchJsonFromBases(['https://a/'], 'risk.json', 100, fetchFn), null);
  assert.ok(sawSignal);
});

test('timeouts: 30 s for full tiers, 15 s for deltas', () => {
  assert.equal(F.FULL_TIMEOUT_MS, 30000);
  assert.equal(F.DELTA_TIMEOUT_MS, 15000);
});
