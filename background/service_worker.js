'use strict';
try { importScripts('../engine/constants.js', '../engine/features.js', '../engine/image_hash.js', '../engine/brand_icons.js', '../engine/report_payload.js'); } catch (_) { /* Firefox background page loads them via manifest */ }
const api = globalThis.browser || globalThis.chrome;

// Official ScamShield feed: rebuilt daily by GitHub Actions from OpenPhish +
// URLhaus with a Tranco top-10k false-positive guard. Download-only static
// JSON — no user or browsing data is ever sent. Users can point this at
// their own feed or clear it in settings to disable updates.
const DEFAULT_FEED_URL = 'https://raw.githubusercontent.com/joelstephen97/scamshield-feed/main/blocklist.json';
// Community reporting relay: opt-in only, off by default. Placeholder host
// until Task 6 deploys the real relay; users can point this at their own or
// clear it to disable even when opted in.
const DEFAULT_RELAY_URL = 'https://scamshield-relay.vercel.app/api/report';

const DEFAULTS = {
  enabled: true,
  hideScamContent: true,
  blockKnownBad: true,
  reportingOptIn: false,     // anonymized reporting, OFF by default
  allowlist: [],             // array of registrable domains the user trusts
  blocklistVersion: 1,
  modelVersion: 1,
  otaUrl: DEFAULT_FEED_URL,  // static JSON URL for blocklist updates; '' = disabled
  reportUrl: DEFAULT_RELAY_URL, // community-reporting relay endpoint; '' = disabled
  threatsBlocked: 0,         // local-only stat, never transmitted
  lastBlocklistVersion: 0,
  supportAskShown: false,    // one-time "you were just protected" support toast
  pageAnalysis: true         // on-device page-content model + icon brand matching
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

// Icon hashing for visual brand matching. Fetches the page's own icons only;
// results cached 24h (memory + storage.session when available). Never stores URLs elsewhere.
const iconCache = new Map(); globalThis.__iconCache = iconCache;
const ICON_TTL = 24 * 3600 * 1000, ICON_MAX_BYTES = 200 * 1024, ICON_TIMEOUT = 3000;
async function hashIconUrl(url) {
  const hit = iconCache.get(url);
  if (hit && Date.now() - hit.ts < ICON_TTL) return hit.hash;
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
  return hash;
}
async function handleHashIcons(urls) {
  const SS = globalThis.ScamShield;
  const table = (SS.BRAND_ICONS && SS.BRAND_ICONS.brands) || [];
  const maxDist = (SS.THRESHOLDS && SS.THRESHOLDS.iconHamming) || 6;
  const hashes = [], matches = [];
  for (const url of (urls || []).slice(0, 6)) {
    const hash = await hashIconUrl(String(url));
    if (!hash) continue;
    hashes.push({ url, hash });
    const m = SS.matchBrand(hash, table, maxDist);
    if (m) matches.push({ brand: m.brand, distance: m.distance, url });
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
  return Object.assign({}, DEFAULTS, stored.settings || {});
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
  if (!payload) return;
  const cur = await api.storage.local.get('reportQueue');
  const q = Array.isArray(cur.reportQueue) ? cur.reportQueue : [];
  q.push(Object.assign({ _tries: 0 }, payload));
  await api.storage.local.set({ reportQueue: q.slice(-QUEUE_CAP) });
  flushReports();
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
  const body = encodeURIComponent(`Site: ${host}\nVerdict: ${(verdict && verdict.level) || 'n/a'} (score ${(verdict && verdict.score) || 0})\nReasons:\n- ${((verdict && verdict.reasons) || []).join('\n- ')}\n\nWhat happened:\n`);
  return `https://github.com/joelstephen97/scamshield/issues/new?title=${title}&body=${body}`;
}
const lastReportInput = new Map(); // tabId → report input (from content script)
async function handleUserReport(msg, sender) {
  const s = await getSettings();
  let tabId = msg.tabId != null ? msg.tabId : (sender.tab && sender.tab.id);
  let tab = null; try { tab = tabId != null ? await api.tabs.get(tabId) : null; } catch (_) {}
  const url = tab && tab.url; if (!url || !/^https?:/.test(url)) return { ok: false, via: 'off' };
  const verdict = lastVerdict.get(tabId) || { level: 'safe', score: 0, reasons: [] };
  const host = new URL(url).hostname;
  if (!s.reportingOptIn || !s.reportUrl) {
    const issueUrl = githubIssueUrl(host, verdict);
    try { await api.tabs.create({ url: issueUrl }); } catch (_) {}
    return { ok: true, via: 'github', issueUrl };
  }
  const SS = globalThis.ScamShield;
  const input = Object.assign({ url, verdict, detectors: ['page'], urlFeatures: SS.extractUrlFeatures(url) }, lastReportInput.get(tabId) || {});
  await queueReport(SS.buildReportPayload(Object.assign({ kind: 'user', label: msg.label === 'scam' ? 'scam' : 'false_positive', extVersion: manifestVersion(), now: Date.now() }, input)));
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
    if (data.version <= (s.lastBlocklistVersion || 0)) return { ok: true, version: data.version, updated: false };
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
    await setSettings({ lastBlocklistVersion: data.version });
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
  }
  if (details && details.reason === 'install' && api.tabs) {
    try { api.tabs.create({ url: api.runtime.getURL('onboarding.html') }); } catch (_) {}
  }
  runOtaUpdate(); // fresh rules right away instead of waiting for the 12h alarm
  flushReports();
});

// Per-tab last verdict, kept in memory but re-derivable; popup reads via message.
const lastVerdict = new Map();

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
        sendResponse(lastVerdict.get(msg.tabId) || null); break;
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
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async response
});
