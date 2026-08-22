'use strict';
try { importScripts('../engine/constants.js', '../engine/trust.js', '../engine/features.js', '../engine/image_hash.js', '../engine/brand_icons.js', '../engine/report_payload.js'); } catch (_) { /* Firefox background page loads them via manifest */ }
const api = globalThis.browser || globalThis.chrome;

// Official ScamShield feed: rebuilt daily by GitHub Actions from OpenPhish +
// URLhaus with a Tranco top-10k false-positive guard. Download-only static
// JSON — no user or browsing data is ever sent. Users can point this at
// their own feed or clear it in settings to disable updates.
const DEFAULT_FEED_URL = 'https://raw.githubusercontent.com/joelstephen97/scamshield-feed/main/blocklist.json';
// Community reporting relay: opt-in only, off by default. Placeholder host
// until Task 6 deploys the real relay; users can point this at their own or
// clear it to disable even when opted in.
const DEFAULT_RELAY_URL = 'https://scamshield-relay-seven.vercel.app/api/report';
const PLACEHOLDER_RELAY_URL = 'https://scamshield-relay.vercel.app/api/report';

const DEFAULTS = {
  enabled: true,
  hideScamContent: true,
  blockKnownBad: true,
  reportingOptIn: false,     // anonymized reporting, OFF by default
  allowlist: [],             // array of registrable domains the user trusts
  blocklistVersion: 1,
  modelVersion: 2,
  otaUrl: DEFAULT_FEED_URL,  // static JSON URL for blocklist updates; '' = disabled
  reportUrl: DEFAULT_RELAY_URL, // community-reporting relay endpoint; '' = disabled
  threatsBlocked: 0,         // local-only stat, never transmitted
  lastBlocklistVersion: 0,
  supportAskShown: false,    // one-time "you were just protected" support toast
  pageAnalysis: true,        // on-device page-content model + icon brand matching
  theme: 'auto',             // 'auto' | 'light' | 'dark' — extension-page appearance
  pausedSites: {},           // domain -> until (ms epoch); time-boxed "trust this site"
  whatsNewSeen: '',          // last extension version whose what's-new was acknowledged
  lastOtaAt: 0,              // ms epoch of the last blocklist OTA attempt (success or no-op)
  lastOtaCount: 0            // number of blocklist rules from the last successful OTA
};

// Local-only protection history: ring buffer of { ts, host, kind, level }.
// Hostnames only, never full URLs; capped; user-clearable. Never transmitted.
const HISTORY_CAP = 200;
async function recordEvent(evt) {
  try {
    const cur = await api.storage.local.get('history');
    const list = Array.isArray(cur.history) ? cur.history : [];
    const last = list[0];
    // collapse repeats (SPA rescans, repeated toasts) within a minute
    if (last && last.host === evt.host && last.kind === evt.kind &&
        last.level === evt.level && Date.now() - last.ts < 60000) return;
    list.unshift({ ts: Date.now(), host: evt.host || '', kind: evt.kind || 'page', level: evt.level || 'suspicious' });
    await api.storage.local.set({ history: list.slice(0, HISTORY_CAP) });
  } catch (_) { /* history is best-effort */ }
}
function hostOfSender(sender) {
  try { return new URL(sender.tab && sender.tab.url).hostname; } catch (_) { return ''; }
}

// Icon hashing for visual brand matching. Fetches the page's own icons only.
// L1 cache is an in-memory Map (per SW lifetime); L2 is api.storage.session
// when available (Chrome ≥102 / Firefox ≥115 — both above our minimums, so
// this is guarded rather than assumed), which survives SW eviction/restarts
// without persisting to disk. Both layers share the 24h TTL and a 2000-entry
// FIFO cap; storage.session additionally tracks its own key index
// (iconCacheIndex) since storage.session has no native enumeration. Never
// stores page URLs, only icon URLs/hashes, and nothing crosses into
// storage.local. Falls back silently to fetch-only when storage.session is
// unavailable (older browsers, or the API missing entirely).
const iconCache = new Map(); globalThis.__iconCache = iconCache;
const ICON_TTL = 24 * 3600 * 1000, ICON_MAX_BYTES = 200 * 1024, ICON_TIMEOUT = 3000;
const ICON_SESSION_CAP = 2000;
const hasSessionStorage = !!(api.storage && api.storage.session);

function sessionIconKey(url) { return 'icon:' + url; }

async function sessionCacheGet(url) {
  if (!hasSessionStorage) return undefined;
  try {
    const key = sessionIconKey(url);
    const stored = await api.storage.session.get(key);
    const entry = stored[key];
    if (entry && Date.now() - entry.ts < ICON_TTL) return entry.hash;
  } catch (_) { /* best-effort */ }
  return undefined;
}

// iconCacheIndex is a single shared key with no atomic RMW/increment
// primitive in storage.session, so concurrent read-modify-writes (e.g. the
// Promise.all in handleHashIcons hashing several icons at once) could each
// read the same stale index and clobber one another's appended key.
// iconIndexChain serializes just the index update; the per-key
// storage.session.set() below (the icon hash entry itself) stays concurrent.
let iconIndexChain = Promise.resolve();
async function updateIconIndex(key) {
  const idx = await api.storage.session.get('iconCacheIndex');
  let list = Array.isArray(idx.iconCacheIndex) ? idx.iconCacheIndex : [];
  list = list.filter((k) => k !== key);
  list.push(key);
  if (list.length > ICON_SESSION_CAP) {
    const evict = list.splice(0, list.length - ICON_SESSION_CAP);
    await api.storage.session.remove(evict);
  }
  await api.storage.session.set({ iconCacheIndex: list });
}

async function sessionCacheSet(url, hash) {
  if (!hasSessionStorage) return;
  try {
    const key = sessionIconKey(url);
    await api.storage.session.set({ [key]: { hash, ts: Date.now() } });
    iconIndexChain = iconIndexChain.then(() => updateIconIndex(key)).catch(() => {});
    await iconIndexChain;
  } catch (_) { /* best-effort */ }
}

async function hashIconUrl(url) {
  const hit = iconCache.get(url);
  if (hit && Date.now() - hit.ts < ICON_TTL) return hit.hash;
  const sessionHit = await sessionCacheGet(url);
  if (sessionHit !== undefined) {
    iconCache.set(url, { hash: sessionHit, ts: Date.now() });
    return sessionHit;
  }
  let hash = null;
  let t = null;
  try {
    const ctl = new AbortController(); t = setTimeout(() => ctl.abort(), ICON_TIMEOUT);
    const res = await fetch(url, { credentials: 'omit', redirect: 'follow', signal: ctl.signal, cache: 'force-cache' });
    const ct = res.headers.get('content-type') || '';
    const len = Number(res.headers.get('content-length') || 0);
    if (res.ok && len <= ICON_MAX_BYTES && (/^image\//i.test(ct) || /\.ico(\?|$)/i.test(url)) && !/svg/i.test(ct)) {
      const blob = await res.blob();
      if (blob.size <= ICON_MAX_BYTES) hash = await globalThis.ScamShield.hashImageBlob(blob);
    }
  } catch (_) { hash = null; } finally { clearTimeout(t); }
  iconCache.set(url, { hash, ts: Date.now() });
  if (iconCache.size > 2000) iconCache.delete(iconCache.keys().next().value);
  sessionCacheSet(url, hash);
  return hash;
}
async function handleHashIcons(urls) {
  const SS = globalThis.ScamShield;
  const table = (SS.BRAND_ICONS && SS.BRAND_ICONS.brands) || [];
  const maxDist = (SS.THRESHOLDS && SS.THRESHOLDS.iconHamming) || 6;
  const entryByHash = new Map();
  for (const b of table) for (const e of (b.entries || [])) if (!entryByHash.has(e.hash)) entryByHash.set(e.hash, e);
  const targets = (urls || []).slice(0, 6).map(String);
  const results = await Promise.all(targets.map((url) => hashIconUrl(url)));
  const hashes = [], matches = [];
  for (let i = 0; i < targets.length; i++) {
    const url = targets[i], hash = results[i];
    if (!hash) continue;
    hashes.push({ url, hash });
    const m = SS.matchBrand(hash, table, maxDist);
    if (m) {
      const e = entryByHash.get(m.hash);
      matches.push({ brand: m.brand, distance: m.distance, url, kind: e ? e.kind : undefined });
    }
  }
  return { hashes, matches };
}

// Ensures the base `settings` key exists before any read/write proceeds.
// Started synchronously at script-evaluation time (before onMessage/onInstalled
// listeners can be reached), so it always wins the race against the very first
// getSettings()/setSettings() call from either onInstalled's own migration
// logic or an external caller (e.g. tests driving the SW directly) — avoids a
// TOCTOU clobber where onInstalled's unconditional DEFAULTS write lands after
// (and wipes out) an early setSettings() patch. Re-created fresh each time the
// SW script re-evaluates, so it never blocks a later wake-up where onInstalled
// does not fire again (already-installed extensions only get onInstalled once).
const settingsInitPromise = (async () => {
  try {
    const cur = await api.storage.local.get('settings');
    if (!cur.settings) await api.storage.local.set({ settings: DEFAULTS });
  } catch (_) { /* best-effort */ }
})();

async function getSettings() {
  await settingsInitPromise;
  const stored = await api.storage.local.get('settings');
  const merged = Object.assign({}, DEFAULTS, stored.settings || {});
  merged.pausedSites = globalThis.ScamShield.prunePaused(merged.pausedSites, Date.now());
  return merged;
}
// All setSettings() callers (onInstalled, runOtaUpdate, message handlers,
// tests driving the SW directly via sw.evaluate) read-modify-write the same
// `settings` key. Without serialization, two concurrent calls can each read
// the pre-patch value and then write back-to-back, so the second write's
// stale merge silently clobbers the first call's patch (a classic TOCTOU
// race). Chaining every call through `settingsChain` guarantees each call's
// read only ever happens after the previous call's write has landed.
let settingsChain = Promise.resolve();
async function setSettings(patch) {
  await settingsInitPromise;
  const run = async () => {
    const next = Object.assign(await getSettings(), patch);
    await api.storage.local.set({ settings: next });
    if ('blockKnownBad' in patch && api.declarativeNetRequest && api.declarativeNetRequest.updateEnabledRulesets) {
      try {
        await api.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: patch.blockKnownBad ? ['blocklist'] : [],
          disableRulesetIds: patch.blockKnownBad ? [] : ['blocklist']
        });
      } catch (e) { /* ruleset toggle is best-effort */ }
    }
    if ('reportingOptIn' in patch && !patch.reportingOptIn) await api.storage.local.set({ reportQueue: [] });
    return next;
  };
  const result = settingsChain.then(run, run);
  settingsChain = result.then(() => {}, () => {});
  return result;
}

// ---- Opt-in community reporting (spec §6). Nothing runs unless reportingOptIn. ----
const QUEUE_CAP = 50, REPORT_RETRIES = 3, AUTO_REPORT_TTL = 24 * 3600 * 1000;
async function queueReport(payload) {
  if (!payload) return false;
  const cur = await api.storage.local.get('reportQueue');
  const q = Array.isArray(cur.reportQueue) ? cur.reportQueue : [];
  q.push(Object.assign({ _tries: 0 }, payload));
  await api.storage.local.set({ reportQueue: q.slice(-QUEUE_CAP) });
  flushReports();
  return true;
}
// `flushPending` avoids a lost-update: if queueReport() fires while a flush is
// already in-flight, the naive "if (flushing) return" would silently drop the
// new item until the next 12h alarm. Instead we mark a pending re-run and loop
// once more before releasing the lock, so an item queued mid-flush still goes
// out this cycle.
let flushing = false, flushPending = false;
async function flushReports() {
  if (flushing) { flushPending = true; return; }
  flushing = true;
  try {
    do {
      flushPending = false;
      const s = await getSettings();
      if (!s.reportingOptIn || !s.reportUrl) { await api.storage.local.set({ reportQueue: [] }); break; }
      const cur = await api.storage.local.get('reportQueue');
      const q = Array.isArray(cur.reportQueue) ? cur.reportQueue : [];
      const keep = [];
      for (const item of q) {
        const { _tries, ...body } = item;
        let ok = false, drop = false;
        try {
          const res = await fetch(s.reportUrl, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          ok = res.ok; drop = res.status >= 400 && res.status < 500;
        } catch (_) { ok = false; }
        if (!ok && !drop && _tries + 1 < REPORT_RETRIES) keep.push(Object.assign({}, item, { _tries: _tries + 1 }));
      }
      await api.storage.local.set({ reportQueue: keep });
    } while (flushPending);
  } finally { flushing = false; }
}
function manifestVersion() { try { return api.runtime.getManifest().version; } catch (_) { return ''; } }
async function maybeAutoReport(tabUrl, verdict, report, detectors) {
  const s = await getSettings();
  if (!s.reportingOptIn || !verdict || verdict.level !== 'dangerous') return;
  let host; try { host = new URL(tabUrl).hostname; } catch (_) { return; }
  const SS = globalThis.ScamShield;
  const reg = SS.registrableDomain(host);
  if (SS.isSafeHost(host) || (s.allowlist || []).includes(reg)) return;
  const cur = await api.storage.local.get('reportedHosts');
  const seen = cur.reportedHosts || {};
  if (seen[reg] && Date.now() - seen[reg] < AUTO_REPORT_TTL) return;
  seen[reg] = Date.now();
  for (const k of Object.keys(seen)) if (Date.now() - seen[k] > AUTO_REPORT_TTL) delete seen[k];
  await api.storage.local.set({ reportedHosts: seen });
  const input = Object.assign({ url: tabUrl, verdict, detectors: detectors || ['page'] }, report || {});
  if (!input.urlFeatures) input.urlFeatures = SS.extractUrlFeatures(tabUrl);
  await queueReport(SS.buildReportPayload(Object.assign({ kind: 'auto', label: 'dangerous', extVersion: manifestVersion(), now: Date.now() }, input)));
}
function githubIssueUrl(host, verdict) {
  const title = encodeURIComponent(`[${(verdict && verdict.level) || 'report'}] ${host}`);
  const reasons = (verdict && verdict.reasons) || [];
  const reasonsBlock = reasons.length ? `Reasons:\n- ${reasons.join('\n- ')}\n\n` : '';
  const body = encodeURIComponent(`Site: ${host}\nVerdict: ${(verdict && verdict.level) || 'n/a'} (score ${(verdict && verdict.score) || 0})\n${reasonsBlock}What happened:\n`);
  return `https://github.com/joelstephen97/scamshield/issues/new?title=${title}&body=${body}`;
}
const lastReportInput = new Map(); // tabId → report input (from content script)
async function handleUserReport(msg, sender) {
  const s = await getSettings();
  let tabId = msg.tabId != null ? msg.tabId : (sender.tab && sender.tab.id);
  let tab = null; try { tab = tabId != null ? await api.tabs.get(tabId) : null; } catch (_) {}
  let url = tab && tab.url;
  let verdict = lastVerdict.get(tabId) || { level: 'safe', score: 0, reasons: [] };
  // Options-page "Mark as mistake" has no scanned tab of its own — accept an
  // explicit host/level override from a history row instead.
  if (typeof msg.host === 'string' && msg.host && (!url || !/^https?:/.test(url))) {
    url = 'https://' + msg.host + '/';
    verdict = { level: msg.level || 'dangerous', score: 0, reasons: [] };
  }
  if (!url || !/^https?:/.test(url)) return { ok: false, via: 'off' };
  let host; try { host = new URL(url).hostname; } catch (_) { return { ok: false, via: 'off' }; }
  if (!s.reportingOptIn || !s.reportUrl) {
    const issueUrl = githubIssueUrl(host, verdict);
    try { await api.tabs.create({ url: issueUrl }); } catch (_) {}
    return { ok: true, via: 'github', issueUrl };
  }
  const SS = globalThis.ScamShield;
  const input = Object.assign({ url, verdict, detectors: ['page'], urlFeatures: SS.extractUrlFeatures(url) }, lastReportInput.get(tabId) || {});
  const payload = SS.buildReportPayload(Object.assign({ kind: 'user', label: msg.label === 'scam' ? 'scam' : 'false_positive', extVersion: manifestVersion(), now: Date.now() }, input));
  const queued = await queueReport(payload);
  if (!queued) return { ok: false, via: 'off' };
  return { ok: true, via: 'relay' };
}

// Download-only over-the-air blocklist update. Fetches a user-configured JSON
// ({ version, rules: [...] }); never uploads anything. Falls back silently.
async function runOtaUpdate() {
  const s = await getSettings();
  if (!s.otaUrl) return { ok: false, reason: 'no-url' };
  try {
    const res = await fetch(s.otaUrl, { method: 'GET', cache: 'no-cache' });
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const data = await res.json();
    if (!data || typeof data.version !== 'number' || !Array.isArray(data.rules)) return { ok: false, reason: 'bad-shape' };
    if (data.version <= (s.lastBlocklistVersion || 0)) { await setSettings({ lastOtaAt: Date.now() }); return { ok: true, version: data.version, updated: false }; }
    const rules = data.rules.slice(0, 5000).map((r, i) => ({
      id: 100000 + i, priority: 1, action: { type: 'block' },
      condition: { urlFilter: String(r.urlFilter || r), resourceTypes: ['main_frame', 'sub_frame'] }
    }));
    if (api.declarativeNetRequest && api.declarativeNetRequest.updateDynamicRules) {
      const existing = await api.declarativeNetRequest.getDynamicRules();
      await api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map((r) => r.id), addRules: s.blockKnownBad ? rules : []
      });
    }
    await setSettings({ lastBlocklistVersion: data.version, lastOtaAt: Date.now(), lastOtaCount: rules.length });
    return { ok: true, version: data.version, updated: true, count: rules.length };
  } catch (e) {
    return { ok: false, reason: 'fetch-failed' };
  }
}

if (api.alarms) {
  api.alarms.create('ota', { periodInMinutes: 720 }); // every 12h
  api.alarms.onAlarm.addListener((a) => { if (a.name === 'ota') { runOtaUpdate(); flushReports(); } });
}

api.runtime.onInstalled.addListener(async (details) => {
  await settingsInitPromise; // base defaults are guaranteed to exist once this resolves
  // Migration: pre-0.4.0 installs stored otaUrl '' (feature existed but had no
  // default). '' means "never configured", so it is safe to adopt the official
  // feed; users who intentionally clear the field afterwards stay cleared
  // because the migration only runs on version updates.
  if (details && details.reason === 'update') {
    const cur = await getSettings();
    if (cur.otaUrl === '') await setSettings({ otaUrl: DEFAULT_FEED_URL });
    // Migration: point pre-existing installs at the live relay. Only touches
    // the old placeholder value (or a missing/undefined field, which reads as
    // the placeholder via DEFAULTS); a user-customised reportUrl is untouched.
    if (cur.reportUrl === PLACEHOLDER_RELAY_URL || cur.reportUrl == null) {
      await setSettings({ reportUrl: DEFAULT_RELAY_URL });
    }
  }
  if (details && details.reason === 'install' && api.tabs) {
    try { api.tabs.create({ url: api.runtime.getURL('onboarding.html') }); } catch (_) {}
  }
  runOtaUpdate(); // fresh rules right away instead of waiting for the 12h alarm
  flushReports();
});

// Per-tab last verdict, kept in memory but re-derivable; popup reads via message.
// L2 mirror in storage.session (same best-effort pattern as the icon cache
// above) survives SW eviction between the content script's reportVerdict and
// the popup's getVerdict — without it, a popup opened right after the SW was
// evicted would see an empty in-memory Map and wrongly report "safe".
const lastVerdict = new Map();
function sessionVerdictKey(tabId) { return 'verdict:' + tabId; }
async function persistVerdict(tabId, verdict) {
  if (!hasSessionStorage) return;
  try { await api.storage.session.set({ [sessionVerdictKey(tabId)]: verdict }); } catch (_) { /* best-effort */ }
}
async function readPersistedVerdict(tabId) {
  if (!hasSessionStorage) return null;
  try { const key = sessionVerdictKey(tabId); const stored = await api.storage.session.get(key); return stored[key] != null ? stored[key] : null; } catch (_) { return null; }
}
async function clearPersistedVerdict(tabId) {
  if (!hasSessionStorage) return;
  try { await api.storage.session.remove(sessionVerdictKey(tabId)); } catch (_) { /* best-effort */ }
}
if (api.tabs && api.tabs.onRemoved) {
  api.tabs.onRemoved.addListener((tabId) => {
    lastVerdict.delete(tabId);
    clearPersistedVerdict(tabId);
  });
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case 'getSettings':
        sendResponse(await getSettings()); break;
      case 'setSettings':
        sendResponse(await setSettings(msg.patch || {})); break;
      case 'allowSite': {
        const s = await getSettings();
        if (!s.allowlist.includes(msg.domain)) s.allowlist.push(msg.domain);
        await setSettings({ allowlist: s.allowlist });
        sendResponse({ ok: true, allowlist: s.allowlist }); break;
      }
      case 'removeAllow': {
        const s = await getSettings();
        await setSettings({ allowlist: s.allowlist.filter((d) => d !== msg.domain) });
        sendResponse({ ok: true }); break;
      }
      case 'reportVerdict': {
        const tabId = sender.tab && sender.tab.id;
        if (tabId != null) {
          lastVerdict.set(tabId, msg.verdict);
          persistVerdict(tabId, msg.verdict);
          if (msg.report) lastReportInput.set(tabId, msg.report);
          maybeAutoReport(sender.tab && sender.tab.url, msg.verdict, msg.report, ['page']);
          const level = msg.verdict && msg.verdict.level;
          if (level === 'dangerous') api.action.setBadgeText({ tabId, text: '!' });
          else if (level === 'suspicious') api.action.setBadgeText({ tabId, text: '?' });
          else api.action.setBadgeText({ tabId, text: '' });
          if (level !== 'safe') {
            api.action.setBadgeBackgroundColor({ tabId, color: level === 'dangerous' ? '#c0392b' : '#e1a200' });
            recordEvent({ host: hostOfSender(sender), kind: 'page', level });
          }
        }
        sendResponse({ ok: true }); break;
      }
      case 'getVerdict': {
        let v = lastVerdict.get(msg.tabId);
        if (v == null) v = await readPersistedVerdict(msg.tabId);
        sendResponse(v || null); break;
      }
      case 'bumpThreats': {
        const s = await getSettings();
        await setSettings({ threatsBlocked: (s.threatsBlocked || 0) + 1 });
        // 'page' threats are already logged by reportVerdict; detector kinds
        // (wallet/clipboard/techscam) log here with their own label.
        if (msg.kind) {
          recordEvent({ host: hostOfSender(sender), kind: msg.kind, level: 'dangerous' });
          maybeAutoReport(sender.tab && sender.tab.url, { level: 'dangerous', score: 1, flags: [msg.kind] }, null, [msg.kind]);
        }
        sendResponse({ ok: true }); break;
      }
      case 'getHistory': {
        const cur = await api.storage.local.get('history');
        sendResponse({ history: Array.isArray(cur.history) ? cur.history : [] }); break;
      }
      case 'clearHistory':
        await api.storage.local.set({ history: [] });
        sendResponse({ ok: true }); break;
      case 'checkForUpdates':
        sendResponse(await runOtaUpdate()); break;
      case 'getDefaultFeedUrl':
        sendResponse({ url: DEFAULT_FEED_URL }); break;
      case 'hashIcons':
        sendResponse(await handleHashIcons(msg.urls)); break;
      case 'userReport':
        sendResponse(await handleUserReport(msg, sender)); break;
      case 'pauseSite': {
        const s = await getSettings(); const SS = globalThis.ScamShield;
        const until = SS.pauseUntil(msg.choice, Date.now());
        if (until === null) { if (!s.allowlist.includes(msg.domain)) s.allowlist.push(msg.domain); await setSettings({ allowlist: s.allowlist }); sendResponse({ ok: true, until: null }); break; }
        const ps = Object.assign({}, s.pausedSites, { [msg.domain]: until });
        await setSettings({ pausedSites: ps }); sendResponse({ ok: true, until }); break;
      }
      case 'unpauseSite': {
        const s = await getSettings(); const ps = Object.assign({}, s.pausedSites); delete ps[msg.domain];
        await setSettings({ pausedSites: ps, allowlist: s.allowlist.filter((d) => d !== msg.domain) }); sendResponse({ ok: true }); break;
      }
      case 'getTabStats': {
        const cur = await api.storage.local.get('history'); const list = Array.isArray(cur.history) ? cur.history : [];
        const SS = globalThis.ScamShield;
        sendResponse({ siteCount: list.filter((e) => SS.registrableDomain(e.host) === msg.domain).length }); break;
      }
      case 'leaveTab': {
        const tabId = msg.tabId != null ? msg.tabId : (sender.tab && sender.tab.id);
        try { await api.tabs.goBack(tabId); } catch (_) { try { await api.tabs.update(tabId, { url: 'about:blank' }); } catch (_2) {} }
        sendResponse({ ok: true }); break;
      }
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async response
});
