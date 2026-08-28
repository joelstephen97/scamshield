'use strict';
// Engine deps arrive three ways: Chrome's module SW imports them in
// background/sw.js; Firefox's event page loads them via manifest scripts; and
// a classic-worker context (tests driving this file directly) falls back to
// importScripts here. In the module SW `importScripts` is undefined — the
// ReferenceError lands in the catch and the imports from sw.js already won.
try { importScripts('../engine/constants.js', '../engine/trust.js', '../engine/features.js', '../engine/image_hash.js', '../engine/brand_icons.js', '../engine/report_payload.js', '../engine/engagement.js', './stats.js'); } catch (_) { /* deps already loaded by sw.js (Chrome) or the manifest (Firefox) */ }
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
  // Per-feature guards (0.6.0) — all on by default; individually toggleable.
  clickFixGuard: true,       // ClickFix / fake-CAPTCHA paste-and-run blocker
  fakeUpdateGuard: true,     // fake browser-update overlay blocker
  walletGuard: true,         // risky wallet-request interstitial
  clipboardGuard: true,      // clipboard-hijack toast
  techScamGuard: true,       // tech-support scare-page escape
  leakyFormGuard: true,      // warn when a site sends your email before submit
  fingerprintDetect: true,   // detect + name device-fingerprinting scripts
  notificationGuard: true,   // guard the "click Allow to verify" push lure
  shopGuard: true,           // fake-shop red-flag checks (popup card, note tier)
  serpCheck: true,           // sponsored-search destination mismatch check
  strictMode: false,         // treat "suspicious" as blocking, simpler wording
  theme: 'auto',             // 'auto' | 'light' | 'dark' — extension-page appearance
  pausedSites: {},           // domain -> until (ms epoch); time-boxed "trust this site"
  whatsNewSeen: '',          // last extension version whose what's-new was acknowledged
  lastOtaAt: 0,              // ms epoch of the last blocklist OTA attempt (success or no-op)
  lastOtaCount: 0,           // number of blocklist rules from the last successful OTA
  lastReportAt: 0,           // ms epoch of the last community report actually sent
  syncEnabled: false         // mirror settings to chrome.storage.sync (opt-in)
};

// Settings mirrored to chrome.storage.sync when syncEnabled (0.6.0). Only
// user preferences + trusted sites — never stats, feed cursors or queues, and
// never anything that could identify the user. Kept well under sync's 8KB/item.
const SYNCED_KEYS = ['enabled', 'hideScamContent', 'blockKnownBad', 'pageAnalysis',
  'clickFixGuard', 'fakeUpdateGuard', 'walletGuard', 'clipboardGuard', 'techScamGuard',
  'leakyFormGuard', 'fingerprintDetect', 'notificationGuard', 'strictMode',
  'reportingOptIn', 'allowlist', 'theme', 'otaUrl'];

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

// Site-engagement counter (0.6.0): clean top-frame visits only, so a flagged
// page can never build enough engagement to mute its own warnings. Local-only,
// capped + pruned in engine/engagement.js, never transmitted.
let engagementChain = Promise.resolve();
function recordEngagement(tabUrl) {
  engagementChain = engagementChain.then(async () => {
    try {
      const u = new URL(tabUrl);
      if (!/^https?:$/.test(u.protocol)) return;
      const SS = globalThis.ScamShield;
      const reg = SS.registrableDomain(u.hostname);
      const cur = await api.storage.local.get('engagement');
      const next = SS.engagement.recordVisit(cur.engagement || {}, reg, Date.now());
      await api.storage.local.set({ engagement: next });
    } catch (_) { /* best-effort */ }
  }).catch(() => {});
  return engagementChain;
}

// ---- Local-only usage statistics (0.7.0) ----
// Five storage.local keys, all OUTSIDE the `settings` object and therefore
// outside SYNCED_KEYS: statsDaily (90-day ring from background/stats.js),
// pagesCheckedTotal, privacyFindingsTotal, threatsByType, installedAt.
// Counters never sync, never enter a report payload, and never leave the
// device. Every bump is a read-modify-write of the same keys, so they are
// serialized through statsChain the same way settings writes go through
// settingsChain — without it two bumps landing in the same tick would each
// read the pre-bump ring and the second write would silently drop the first
// count.
let statsChain = Promise.resolve();
function queueStats(run) {
  const result = statsChain.then(run, run);
  statsChain = result.then(() => {}, () => {});
  return result;
}
// field: 'checked' | 'threats' | 'privacy'. `event` is only read for threats
// (see SSStats.categoryOf for the taxonomy).
function bumpStat(field, event) {
  return queueStats(async () => {
    try {
      const S = globalThis.SSStats;
      const cur = await api.storage.local.get(['statsDaily', 'pagesCheckedTotal', 'privacyFindingsTotal', 'threatsByType']);
      const patch = { statsDaily: S.bump(cur.statsDaily, field, Date.now()) };
      if (field === 'checked') patch.pagesCheckedTotal = (Number(cur.pagesCheckedTotal) || 0) + 1;
      // The ring only remembers 90 days, so the "all time" privacy number needs
      // a lifetime counter of its own. ensurePrivacyTotal() is queued ahead of
      // every bump, so the key is already seeded by the time this reads it.
      if (field === 'privacy') patch.privacyFindingsTotal = S.privacyTotal(cur.privacyFindingsTotal, cur.statsDaily).total + 1;
      if (field === 'threats') {
        const byType = Object.assign({}, cur.threatsByType);
        const cat = S.categoryOf(event);
        byType[cat] = (Number(byType[cat]) || 0) + 1;
        patch.threatsByType = byType;
      }
      await api.storage.local.set(patch);
    } catch (_) { /* stats are best-effort — never break a scan */ }
  });
}
// "Protecting you since" needs a first-seen timestamp. onInstalled only ever
// fires once, and it already fired for everyone running 0.6.x, so this also
// runs on every SW boot — set-if-absent both times, never overwriting the real
// install date with a later one.
function ensureInstalledAt() {
  return queueStats(async () => {
    try {
      const cur = await api.storage.local.get('installedAt');
      if (!(typeof cur.installedAt === 'number' && cur.installedAt > 0)) {
        await api.storage.local.set({ installedAt: Date.now() });
      }
    } catch (_) { /* best-effort */ }
  });
}
// privacyFindingsTotal did not exist before this counter landed, and a profile
// that already has a ring must not start its lifetime total at zero. Seeded
// from the ring on the first boot that finds the key absent, then left alone
// forever — a stored 0 is a real value, not a missing one (SSStats.privacyTotal
// owns that distinction). Runs inside the same queue as bumpStat, so the seed
// is always written before any increment reads it.
function ensurePrivacyTotal() {
  return queueStats(async () => {
    try {
      const cur = await api.storage.local.get(['privacyFindingsTotal', 'statsDaily']);
      const r = globalThis.SSStats.privacyTotal(cur.privacyFindingsTotal, cur.statsDaily);
      if (r.backfilled) await api.storage.local.set({ privacyFindingsTotal: r.total });
    } catch (_) { /* best-effort */ }
  });
}
// Started at script-evaluation time so a getStats() arriving on the very first
// wake-up already sees the value (same pattern as settingsInitPromise).
const installedAtPromise = ensureInstalledAt();
const privacyTotalPromise = ensurePrivacyTotal();

// ---- Earned review ask (0.7.0) ----
// One storage.local key, OUTSIDE `settings` and therefore outside SYNCED_KEYS —
// like installedAt/statsDaily above, this never syncs and never enters a
// report payload. The eligibility predicate itself is pure (ui/review.js,
// loaded by popup.html/options.html) — this file only owns reading, lazily
// creating, and writing the { state, snoozeUntil, asks } object.
const REVIEW_ASK_DEFAULT = { state: 'pending', snoozeUntil: 0, asks: 0 };
// Every read-modify-write of reviewAsk — the lazy-create below, each of the
// three user actions, and a settings import — is serialized through this one
// chain (same pattern as settingsChain/statsChain), so none of them can race
// and clobber another. This used to be two separate chains (lazy-create on
// statsChain, actions on their own reviewAskChain), which left exactly the
// race a code review caught: an import (or an action) landing between the
// lazy-create's read and its write could get silently overwritten back to
// REVIEW_ASK_DEFAULT.
let reviewAskChain = Promise.resolve();
function queueReviewAsk(run) {
  const result = reviewAskChain.then(run, run);
  reviewAskChain = result.then(() => {}, () => {});
  return result;
}
function ensureReviewAsk() {
  return queueReviewAsk(async () => {
    try {
      const cur = await api.storage.local.get('reviewAsk');
      if (!cur.reviewAsk || typeof cur.reviewAsk !== 'object') {
        await api.storage.local.set({ reviewAsk: REVIEW_ASK_DEFAULT });
      }
    } catch (_) { /* best-effort */ }
  });
}
const reviewAskPromise = ensureReviewAsk();
async function getReviewAsk() {
  await reviewAskPromise;
  const cur = await api.storage.local.get('reviewAsk');
  return (cur.reviewAsk && typeof cur.reviewAsk === 'object') ? cur.reviewAsk : Object.assign({}, REVIEW_ASK_DEFAULT);
}
// installedAt is already lazily created above (ensureInstalledAt/installedAtPromise);
// bundled with reviewAsk here since the popup needs both in one round trip to
// evaluate ui/review.js's eligible() predicate.
async function getReviewAskContext() {
  await installedAtPromise;
  const ra = await getReviewAsk();
  const cur = await api.storage.local.get('installedAt');
  const installedAt = (typeof cur.installedAt === 'number' && cur.installedAt > 0) ? cur.installedAt : Date.now();
  return { reviewAsk: ra, installedAt };
}
function setReviewAsk(action) {
  return queueReviewAsk(async () => {
    await reviewAskPromise;
    const cur = await getReviewAsk();
    let next;
    if (action === 'rate') next = Object.assign({}, cur, { state: 'rated' });
    else if (action === 'later') next = Object.assign({}, cur, { state: 'snoozed', snoozeUntil: Date.now() + 90 * 24 * 3600 * 1000, asks: (Number(cur.asks) || 0) + 1 });
    else if (action === 'no') next = Object.assign({}, cur, { state: 'declined' });
    else return cur;
    await api.storage.local.set({ reviewAsk: next });
    return next;
  });
}
// Used by the 'importSettings' handler below — writes an already-sanitized
// reviewAsk object through the same chain as every other reviewAsk write, so
// an import can never race the lazy-create or a concurrent action click.
function importReviewAsk(patch) {
  return queueReviewAsk(async () => {
    await reviewAskPromise;
    await api.storage.local.set({ reviewAsk: patch });
    return patch;
  });
}
// Validates an imported reviewAsk object (see sanitizeImport below) the same
// defensive way sanitizeImport validates settings: unknown/garbage in, null out.
function sanitizeReviewAsk(v) {
  if (!v || typeof v !== 'object') return null;
  if (!['pending', 'snoozed', 'rated', 'declined'].includes(v.state)) return null;
  const snoozeUntilRaw = Number(v.snoozeUntil);
  // Clamp to a sane ceiling — a corrupt or hand-edited export could otherwise
  // snooze the ask for years. 90 days matches ui/review.js's SNOOZE_DAYS (the
  // longest a legitimate "Maybe later" ever sets).
  const ceiling = Date.now() + 90 * 24 * 3600 * 1000;
  const snoozeUntil = Number.isFinite(snoozeUntilRaw) && snoozeUntilRaw >= 0 ? Math.min(snoozeUntilRaw, ceiling) : 0;
  const asksRaw = Number(v.asks);
  const asks = Number.isFinite(asksRaw) && asksRaw >= 0 ? Math.floor(asksRaw) : 0;
  return { state: v.state, snoozeUntil, asks };
}

// Feed size for the stats card: the OTA count the options page shows, falling
// back to the rule count of the blocklist bundled with the extension (what is
// actually enforced before the first successful update). Cached after the first
// successful read; a failed read is NOT cached, so a transient error can't pin
// the count at 0 for the rest of the SW's life.
let staticRuleCount = null;
async function countStaticRules() {
  if (staticRuleCount !== null) return staticRuleCount;
  try {
    const res = await fetch(api.runtime.getURL('rules/blocklist.json'));
    const rules = await res.json();
    if (Array.isArray(rules)) { staticRuleCount = rules.length; return staticRuleCount; }
  } catch (_) { /* transient — fall through and retry on the next call */ }
  return 0;
}
async function getStats() {
  await installedAtPromise;
  await privacyTotalPromise;
  const cur = await api.storage.local.get(['statsDaily', 'pagesCheckedTotal', 'privacyFindingsTotal', 'threatsByType', 'installedAt']);
  const s = await getSettings();
  const byType = (cur.threatsByType && typeof cur.threatsByType === 'object') ? cur.threatsByType : {};
  return {
    installedAt: (typeof cur.installedAt === 'number' && cur.installedAt > 0) ? cur.installedAt : Date.now(),
    pagesCheckedTotal: Number(cur.pagesCheckedTotal) || 0,
    // Seeded above; privacyTotal() here only guards a read that raced a failed
    // seed (storage error), and never re-derives a real stored value.
    privacyFindingsTotal: globalThis.SSStats.privacyTotal(cur.privacyFindingsTotal, cur.statsDaily).total,
    threatsBlocked: Number(s.threatsBlocked) || 0,
    threatsByType: byType,
    statsDaily: globalThis.SSStats.normalize(cur.statsDaily),
    feedRuleCount: Number(s.lastOtaCount) || await countStaticRules()
  };
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
    // Mirror preference changes to sync when enabled (best-effort).
    if (next.syncEnabled && Object.keys(patch).some((k) => SYNCED_KEYS.includes(k))) pushSync(next);
    return next;
  };
  const result = settingsChain.then(run, run);
  settingsChain = result.then(() => {}, () => {});
  return result;
}

// ---- Settings sync + export/import (0.6.0) ----
async function pushSync(settings) {
  if (!api.storage || !api.storage.sync) return;
  try {
    const s = settings || await getSettings();
    const out = {};
    for (const k of SYNCED_KEYS) out[k] = s[k];
    await api.storage.sync.set({ ssSettings: out });
  } catch (_) { /* sync is best-effort (quota, disabled) */ }
}
async function pullSync() {
  if (!api.storage || !api.storage.sync) return { ok: false };
  try {
    const got = await api.storage.sync.get('ssSettings');
    if (got && got.ssSettings) { await setSettings(got.ssSettings); return { ok: true }; }
    return { ok: true, empty: true };
  } catch (_) { return { ok: false }; }
}
// Live-apply changes made on another device.
if (api.storage && api.storage.onChanged) {
  api.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync' || !changes.ssSettings) return;
    const s = await getSettings();
    if (!s.syncEnabled) return;
    const incoming = changes.ssSettings.newValue;
    if (incoming) { const filtered = {}; for (const k of SYNCED_KEYS) if (k in incoming) filtered[k] = incoming[k]; await setSettings(filtered); }
  });
}
async function exportSettings(s) {
  const out = { app: 'scamshield', schema: 1, exportedAt: Date.now(), settings: {} };
  for (const k of SYNCED_KEYS) out.settings[k] = s[k];
  // reviewAsk lives outside `settings`/SYNCED_KEYS (like installedAt/statsDaily),
  // but the brief calls for it to round-trip through export/import too so a
  // restored profile does not get re-asked for a review it already answered.
  out.reviewAsk = await getReviewAsk();
  return out;
}
function sanitizeImport(obj) {
  const src = obj && obj.settings ? obj.settings : obj;
  if (!src || typeof src !== 'object') return null;
  const patch = {};
  for (const k of SYNCED_KEYS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (k === 'allowlist') { if (Array.isArray(v)) patch[k] = v.filter((d) => typeof d === 'string').slice(0, 2000); }
    else if (k === 'theme') { if (['auto', 'light', 'dark'].includes(v)) patch[k] = v; }
    else if (k === 'otaUrl') { if (typeof v === 'string' && (v === '' || /^https:\/\//i.test(v))) patch[k] = v; }
    else if (typeof v === 'boolean') patch[k] = v;
  }
  return Object.keys(patch).length ? patch : null;
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
      let sentAny = false;
      for (const item of q) {
        const { _tries, ...body } = item;
        let ok = false, drop = false;
        try {
          const res = await fetch(s.reportUrl, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          ok = res.ok; drop = res.status >= 400 && res.status < 500;
        } catch (_) { ok = false; }
        if (ok) sentAny = true;
        if (!ok && !drop && _tries + 1 < REPORT_RETRIES) keep.push(Object.assign({}, item, { _tries: _tries + 1 }));
      }
      await api.storage.local.set({ reportQueue: keep });
      if (sentAny) await setSettings({ lastReportAt: Date.now() });
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
// Issue bodies stay English whatever the UI locale: reasons are rendered from
// the resolver's EN table, and their codes are appended so a report is
// searchable without reading the prose.
function githubIssueUrl(host, verdict) {
  const R = globalThis.SSReasons;
  const english = (r) => (R ? R.reasonToEnglish(r) : (typeof r === 'string' ? r : String((r && r.code) || '')));
  const title = encodeURIComponent(`[${(verdict && verdict.level) || 'report'}] ${host}`);
  const reasons = (verdict && verdict.reasons) || [];
  const reasonsBlock = reasons.length ? `Reasons:\n- ${reasons.map(english).join('\n- ')}\n\n` : '';
  const codes = reasons.filter((r) => r && r.code)
    .map((r) => r.code + ((r.params || []).length ? `(${r.params.join(', ')})` : ''));
  const codesBlock = codes.length ? `Codes: ${codes.join(', ')}\n\n` : '';
  const body = encodeURIComponent(`Site: ${host}\nVerdict: ${(verdict && verdict.level) || 'n/a'} (score ${(verdict && verdict.score) || 0})\n${reasonsBlock}${codesBlock}What happened:\n`);
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
    // Dynamic-rule budget: block rules are "safe" actions, so Chrome ≥121
    // allows 30,000 of them while Firefox caps at a flat 5,000. Reading the
    // runtime constant sizes the feed correctly on both without hardcoding.
    const dnrCap = (api.declarativeNetRequest && typeof api.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES === 'number')
      ? api.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES : 5000;
    const rules = data.rules.slice(0, dnrCap).map((r, i) => ({
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
  await ensureInstalledAt(); // first-seen stamp for "protecting you since" (never overwritten)
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
// Per-tab frame verdict split (all_frames since 0.6.0): { url, top, sub } so
// racy frame reports merge instead of clobbering; see reportVerdict below.
const frameVerdicts = new Map();
// Per-tab privacy findings (0.6.0): leaky forms, fingerprinting, notify lures.
// Session-mirrored so the popup survives SW eviction; never leaves the device.
const privacyFindings = new Map();
// Per-tab fake-shop findings (0.6.0), in-memory only (cheap to recompute).
const shopFindings = new Map();
function sessionPrivacyKey(tabId) { return 'privacy:' + tabId; }
async function persistPrivacy(tabId, list) {
  if (!hasSessionStorage) return;
  try { await api.storage.session.set({ [sessionPrivacyKey(tabId)]: list }); } catch (_) {}
}
async function readPersistedPrivacy(tabId) {
  if (!hasSessionStorage) return null;
  try { const k = sessionPrivacyKey(tabId); const s = await api.storage.session.get(k); return s[k] != null ? s[k] : null; } catch (_) { return null; }
}
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
    frameVerdicts.delete(tabId);
    privacyFindings.delete(tabId);
    shopFindings.delete(tabId);
    if (hasSessionStorage) { try { api.storage.session.remove(sessionPrivacyKey(tabId)); } catch (_) {} }
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
          // all_frames (0.6.0): every frame reports its own verdict, and frame
          // order is racy — a top frame's "safe" must not clobber an earlier
          // dangerous credential iframe, nor vice versa. Verdicts are kept per
          // tab AND per top-level URL (a report carrying a new tab URL is the
          // navigation reset), and the tab's effective verdict is the more
          // severe of {top frame, worst sub-frame}.
          const RANK = { unknown: 0, safe: 1, suspicious: 2, dangerous: 3 };
          const rankOf = (v) => (v ? (RANK[v.level] || 0) : -1);
          const fromSubframe = msg.subframe === true || (typeof sender.frameId === 'number' && sender.frameId !== 0);
          const tabUrl = (sender.tab && sender.tab.url) || '';
          let fv = frameVerdicts.get(tabId);
          if (!fv || fv.url !== tabUrl) {
            // Fresh top-level URL — clear stale privacy findings for the tab.
            if (fv && fv.url !== tabUrl && !fromSubframe) {
              privacyFindings.delete(tabId);
              shopFindings.delete(tabId);
              if (hasSessionStorage) { try { api.storage.session.remove(sessionPrivacyKey(tabId)); } catch (_) {} }
            }
            fv = { url: tabUrl, top: null, sub: null };
          }
          // Stats: one "page checked" per top-frame page view. fv.top is null
          // exactly once per (tab, top-level URL) — after that the report is a
          // detector's second opinion on a page already counted, and sub-frame
          // merges are never counted at all.
          const firstTopReport = !fromSubframe && fv.top == null;
          if (fromSubframe) {
            if (rankOf(msg.verdict) > rankOf(fv.sub)) fv.sub = Object.assign({}, msg.verdict, { subframe: true });
          } else {
            fv.top = msg.verdict;
          }
          frameVerdicts.set(tabId, fv);
          if (firstTopReport) bumpStat('checked');
          const effective = rankOf(fv.sub) > rankOf(fv.top) ? fv.sub : fv.top;
          lastVerdict.set(tabId, effective);
          persistVerdict(tabId, effective);
          if (msg.report && !fromSubframe) lastReportInput.set(tabId, msg.report);
          // Auto-reports describe the frame that detected the scam (sender.url
          // is the frame's own URL; for the top frame it equals the tab URL).
          maybeAutoReport(sender.url || tabUrl, msg.verdict, msg.report, ['page']);
          const level = effective && effective.level;
          if (level === 'dangerous') api.action.setBadgeText({ tabId, text: '!' });
          else if (level === 'suspicious') api.action.setBadgeText({ tabId, text: '?' });
          else api.action.setBadgeText({ tabId, text: '' });
          if (level !== 'safe') {
            api.action.setBadgeBackgroundColor({ tabId, color: level === 'dangerous' ? '#c0392b' : '#e1a200' });
          }
          const incomingLevel = msg.verdict && msg.verdict.level;
          if (incomingLevel && incomingLevel !== 'safe') {
            recordEvent({ host: hostOfSender(sender), kind: 'page', level: incomingLevel });
          }
          // Engagement only accrues from clean top-frame visits.
          if (!fromSubframe && incomingLevel === 'safe') recordEngagement(tabUrl);
        }
        sendResponse({ ok: true }); break;
      }
      case 'privacyFinding': {
        const tabId = sender.tab && sender.tab.id;
        if (tabId != null && msg.finding) {
          // Rehydrate from storage.session when the in-memory map is empty
          // (SW eviction mid-page), exactly as getPrivacyFindings does. Without
          // it the map would look like a fresh page: the de-dupe would re-add a
          // finding already recorded, and the stats gate below would count the
          // same page load a second time.
          let list = privacyFindings.get(tabId);
          if (list == null) list = (await readPersistedPrivacy(tabId)) || [];
          const f = msg.finding;
          // Stats count findings-pages, not raw findings: only the first one
          // for this page load counts (the list is cleared on navigation).
          const firstForPage = list.length === 0;
          if (!list.some((x) => x.kind === f.kind && x.host === f.host)) {
            list.push({ kind: f.kind, host: f.host, detail: f.detail || '', ts: Date.now() });
            privacyFindings.set(tabId, list.slice(-20));
            persistPrivacy(tabId, privacyFindings.get(tabId));
            if (firstForPage) bumpStat('privacy');
          }
        }
        sendResponse({ ok: true }); break;
      }
      case 'getPrivacyFindings': {
        let list = privacyFindings.get(msg.tabId);
        if (list == null) list = await readPersistedPrivacy(msg.tabId);
        sendResponse({ findings: list || [] }); break;
      }
      case 'shopFindings': {
        const tabId = sender.tab && sender.tab.id;
        if (tabId != null && Array.isArray(msg.flags)) shopFindings.set(tabId, { level: msg.level, flags: msg.flags.slice(0, 6) });
        sendResponse({ ok: true }); break;
      }
      case 'getShopFindings':
        sendResponse(shopFindings.get(msg.tabId) || { level: 'none', flags: [] }); break;
      case 'setSync': {
        await setSettings({ syncEnabled: !!msg.on });
        if (msg.on) { await pushSync(); sendResponse({ ok: !!(api.storage && api.storage.sync) }); }
        else { try { if (api.storage && api.storage.sync) await api.storage.sync.remove('ssSettings'); } catch (_) {} sendResponse({ ok: true }); }
        break;
      }
      case 'exportSettings':
        sendResponse(await exportSettings(await getSettings())); break;
      case 'importSettings': {
        const patch = sanitizeImport(msg.data);
        const reviewPatch = sanitizeReviewAsk(msg.data && msg.data.reviewAsk);
        if (!patch && !reviewPatch) { sendResponse({ ok: false }); break; }
        if (patch) await setSettings(patch);
        if (reviewPatch) await importReviewAsk(reviewPatch);
        sendResponse({ ok: true }); break;
      }
      case 'getReviewAsk':
        sendResponse(await getReviewAskContext()); break;
      case 'reviewAskAction':
        sendResponse(await setReviewAsk(msg.action)); break;
      case 'getEngagement': {
        const cur = await api.storage.local.get('engagement');
        const SS = globalThis.ScamShield;
        sendResponse({ engaged: SS.engagement.isEngaged(cur.engagement || {}, msg.domain, Date.now()) });
        break;
      }
      case 'shopCountdown': {
        // Fake-countdown detection: a real "sale ends" timer only ever counts
        // down. If we saw this origin's timer at N seconds a while ago and it
        // is now back near (or above) N, the urgency is fake. Stored per
        // registrable domain, capped, pruned.
        let reset = false;
        try {
          const cur = await api.storage.local.get('shopTimers');
          const map = cur.shopTimers || {};
          const prev = map[msg.domain];
          const now = Date.now();
          const secs = Number(msg.seconds) || 0;
          if (prev && now - prev.ts > 45000 && secs >= prev.seconds - 5) reset = true;
          // keep the max-ish baseline for this origin
          if (!prev || secs > prev.seconds || now - prev.ts > 6 * 3600 * 1000) map[msg.domain] = { seconds: secs, ts: now };
          const keys = Object.keys(map);
          if (keys.length > 300) { keys.sort((a, b) => map[a].ts - map[b].ts); for (const k of keys.slice(0, keys.length - 300)) delete map[k]; }
          await api.storage.local.set({ shopTimers: map });
        } catch (_) {}
        sendResponse({ reset }); break;
      }
      case 'getVerdict': {
        let v = lastVerdict.get(msg.tabId);
        if (v == null) v = await readPersistedVerdict(msg.tabId);
        sendResponse(v || null); break;
      }
      case 'bumpThreats': {
        const s = await getSettings();
        await setSettings({ threatsBlocked: (s.threatsBlocked || 0) + 1 });
        // Same event, split by category for the stats breakdown: detector kinds
        // carry msg.kind, a whole-page block carries none and is classified
        // from the verdict this tab just reported.
        const threatTab = sender.tab && sender.tab.id;
        bumpStat('threats', { kind: msg.kind || 'page', verdict: threatTab != null ? lastVerdict.get(threatTab) : null });
        // 'page' threats are already logged by reportVerdict; detector kinds
        // (wallet/clipboard/techscam) log here with their own label.
        if (msg.kind) {
          recordEvent({ host: hostOfSender(sender), kind: msg.kind, level: 'dangerous' });
          maybeAutoReport(sender.tab && sender.tab.url, { level: 'dangerous', score: 1, flags: [msg.kind] }, null, [msg.kind]);
        }
        sendResponse({ ok: true }); break;
      }
      case 'getStats':
        sendResponse(await getStats()); break;
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

// Since the Chrome SW became an ES module (0.6.0), top-level bindings are
// module-scoped. Re-attach the debug/test surface that used to live on the
// classic worker's global scope — the e2e suite drives these via
// worker.evaluate, and they're handy in the SW console.
Object.assign(globalThis, { DEFAULT_FEED_URL, getSettings, setSettings, handleUserReport, runOtaUpdate, flushReports, queueReport, exportSettings, sanitizeImport, pushSync, pullSync, getStats, bumpStat, ensurePrivacyTotal, ensureInstalledAt, getReviewAsk, getReviewAskContext, setReviewAsk, sanitizeReviewAsk, ensureReviewAsk, importReviewAsk });
