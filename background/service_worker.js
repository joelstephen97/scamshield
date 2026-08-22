'use strict';
try { importScripts('../engine/constants.js', '../engine/image_hash.js', '../engine/brand_icons.js'); } catch (_) { /* Firefox background page loads them via manifest */ }
const api = globalThis.browser || globalThis.chrome;

// Official ScamShield feed: rebuilt daily by GitHub Actions from OpenPhish +
// URLhaus with a Tranco top-10k false-positive guard. Download-only static
// JSON — no user or browsing data is ever sent. Users can point this at
// their own feed or clear it in settings to disable updates.
const DEFAULT_FEED_URL = 'https://raw.githubusercontent.com/joelstephen97/scamshield-feed/main/blocklist.json';

const DEFAULTS = {
  enabled: true,
  hideScamContent: true,
  blockKnownBad: true,
  reportingOptIn: false,     // anonymized reporting, OFF by default
  allowlist: [],             // array of registrable domains the user trusts
  blocklistVersion: 1,
  modelVersion: 1,
  otaUrl: DEFAULT_FEED_URL,  // static JSON URL for blocklist updates; '' = disabled
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

async function getSettings() {
  const stored = await api.storage.local.get('settings');
  return Object.assign({}, DEFAULTS, stored.settings || {});
}
async function setSettings(patch) {
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
  return next;
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
  api.alarms.onAlarm.addListener((a) => { if (a.name === 'ota') runOtaUpdate(); });
}

api.runtime.onInstalled.addListener(async (details) => {
  const cur = await api.storage.local.get('settings');
  if (!cur.settings) await api.storage.local.set({ settings: DEFAULTS });
  // Migration: pre-0.4.0 installs stored otaUrl '' (feature existed but had no
  // default). '' means "never configured", so it is safe to adopt the official
  // feed; users who intentionally clear the field afterwards stay cleared
  // because the migration only runs on version updates.
  else if (details && details.reason === 'update' && cur.settings.otaUrl === '') {
    await api.storage.local.set({ settings: Object.assign({}, cur.settings, { otaUrl: DEFAULT_FEED_URL }) });
  }
  if (details && details.reason === 'install' && api.tabs) {
    try { api.tabs.create({ url: api.runtime.getURL('onboarding.html') }); } catch (_) {}
  }
  runOtaUpdate(); // fresh rules right away instead of waiting for the 12h alarm
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
        if (msg.kind) recordEvent({ host: hostOfSender(sender), kind: msg.kind, level: 'dangerous' });
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
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async response
});
