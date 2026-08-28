'use strict';
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
const F = globalThis.SSFormat, I = globalThis.SSIcons, REVIEW = globalThis.SSReview;
const UI_LANG = (() => { try { return api.i18n.getUILanguage(); } catch (_) { return 'en'; } })();
// SSi18n.t returns '' (never key-echo) on a genuine miss, so the fallback
// argument here actually gets used instead of being dead code.
const T = (k, subs, fb) => { const v = globalThis.SSi18n && globalThis.SSi18n.t(k, subs); return v || fb || k; };
const R = globalThis.SSReasons;
const bidi = (s) => (R && R.bidiWrap ? R.bidiWrap(s) : (s == null ? '' : String(s)));
const send = (type, extra) => new Promise((res) => { try { api.runtime.sendMessage(Object.assign({ type }, extra || {}), (r) => res(r)); } catch (_) { res(null); } });
// Statistics tab state (rendered by the block at the bottom of this file).
const SV = globalThis.SSStatsView, SSTATS = globalThis.SSStats;
let statsPeriod = '7', statsToken = 0;
function flash(t) { $('status').textContent = t; $('status').classList.add('show'); setTimeout(() => $('status').classList.remove('show'), 1200); }
function showTab(name, userInitiated) {
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + name;
  for (const a of document.querySelectorAll('nav a')) {
    const cur = a.dataset.tab === name;
    a.classList.toggle('cur', cur); a.setAttribute('aria-selected', String(cur));
  }
  try { history.replaceState(null, '', '#' + name); } catch (_) {}
  if (userInitiated) { const h = $('tab-' + name).querySelector('h2'); if (h) h.focus(); }
  // Counters move while the page is open (any tab the user scans bumps them),
  // and getStats can trail the last bump by a moment, so the dashboard re-reads
  // on every activation instead of rendering a snapshot taken at page load.
  if (name === 'stats') loadStats();
}
for (const a of document.querySelectorAll('nav a')) a.addEventListener('click', (e) => { e.preventDefault(); showTab(a.dataset.tab, true); });
$('brandmark').insertAdjacentHTML('afterbegin', I.shield('safe'));
try { const v = api.runtime.getManifest().version; $('ver').textContent = T('fmtVersion', [bidi(v)], 'Version ' + v); $('aboutver').textContent = v; } catch (_) {}
// Earned review ask (0.7.0): the always-available "leave a review" link is
// Chrome only (no AMO listing to deep-link to). Sets nothing — this is a
// separate, zero-pressure channel from the popup's earned ask-card.
// Not `typeof browser === 'undefined'`: modern Chrome (Chromium 148, 2026)
// now ships its own native `browser.*` alias, so that check is no longer a
// reliable Chrome/Firefox signal. Uses ui/review.js's isChromeFromManifest()
// (same pure helper popup.js's isChromeBuild() calls) against our OWN
// packaged manifest instead — only the Firefox build carries
// `browser_specific_settings`.
try {
  const isChrome = REVIEW ? REVIEW.isChromeFromManifest(api.runtime.getManifest()) : true;
  // Fails open (assumes Chrome) when the module didn't load or getManifest()
  // throws. Intentional and low-stakes: worst case is a working CWS link
  // shown on a browser that isn't actually Chrome, never a broken feature.
  if (isChrome) $('reviewaboutrow').hidden = false;
} catch (_) { $('reviewaboutrow').hidden = false; }

const CHIPKEY = (k) => 'chip' + k.charAt(0).toUpperCase() + k.slice(1);
const KIND = (k) => T(CHIPKEY(k), null, F.detectorLabel(k));
const LEVELKEY = { safe: 'levelSafe', suspicious: 'levelSuspicious', dangerous: 'levelDangerous', unknown: 'levelUnknown' };
const LEVEL = (lvl) => T(LEVELKEY[lvl] || 'levelUnknown', null, F.levelText(lvl));
function bindSwitch(id, key) {
  const el = $(id); const wrap = el.closest('.switch');
  el.addEventListener('change', async () => { await send('setSettings', { patch: { [key]: el.checked } }); wrap.classList.toggle('on', el.checked); flash(T('saved', null, 'Saved')); });
}
function setSwitch(id, on) { $(id).checked = !!on; $(id).closest('.switch').classList.toggle('on', !!on); }
async function load() {
  const s = await send('getSettings');
  if (!s) { flash(T('toastExtensionError', null, 'Extension error — try reopening.')); return; }
  setSwitch('enabled', s.enabled); setSwitch('block', s.blockKnownBad); setSwitch('hide', s.hideScamContent); setSwitch('pageanalysis', s.pageAnalysis !== false); setSwitch('report', s.reportingOptIn);
  setSwitch('clickfix', s.clickFixGuard !== false); setSwitch('fakeupdate', s.fakeUpdateGuard !== false);
  setSwitch('techscam', s.techScamGuard !== false); setSwitch('clipboard', s.clipboardGuard !== false);
  setSwitch('wallet', s.walletGuard !== false); setSwitch('strict', s.strictMode === true);
  setSwitch('leakyform', s.leakyFormGuard !== false); setSwitch('fingerprint', s.fingerprintDetect !== false); setSwitch('notifyguard', s.notificationGuard !== false);
  setSwitch('shop', s.shopGuard !== false); setSwitch('serp', s.serpCheck !== false);
  setSwitch('sync', s.syncEnabled === true);
  $('net-feed').textContent = s.otaUrl ? (s.lastOtaAt ? F.relTime(s.lastOtaAt, undefined, UI_LANG) : T('receiptOnInstall12h', null, 'on install + every 12h')) : T('receiptDisabled', null, 'disabled');
  $('net-report').textContent = s.reportingOptIn ? (s.lastReportAt ? F.relTime(s.lastReportAt, undefined, UI_LANG) : T('receiptWhenFlagged', null, 'when flagged')) : T('receiptOffDefault', null, 'off (default)');
  $('otaurl').value = s.otaUrl || ''; $('theme').value = s.theme || 'auto';
  if (s.lastOtaAt) {
    const relStr = F.relTime(s.lastOtaAt, undefined, UI_LANG);
    const countStr = Number(s.lastOtaCount || 0).toLocaleString();
    $('feedstatus').textContent = T('fmtUpdatedRules', [bidi(relStr), bidi(countStr)], `Updated ${relStr} · ${countStr} rules`);
  } else {
    $('feedstatus').textContent = T('feedNeverUpdated', null, 'Never updated');
  }
  $('feeddot').classList.toggle('ok', !!s.lastOtaAt);
  renderAllow(s.allowlist || [], s.pausedSites || {});
  const h = await send('getHistory'); renderHistory((h && h.history) || []);
}
function li(text, meta, btnText, onClick) {
  const el = document.createElement('li'); const t = document.createElement('span'); t.textContent = text; el.appendChild(t);
  if (meta) { const m = document.createElement('span'); m.className = 'meta'; m.textContent = meta; el.appendChild(m); }
  if (btnText) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = btnText; b.addEventListener('click', onClick); el.appendChild(b); }
  return el;
}
function renderAllow(list, paused) {
  $('allowlist').replaceChildren(); $('pausedlist').replaceChildren();
  if (!list.length) $('allowlist').appendChild(li(T('optNoneYet', null, 'None yet')));
  for (const d of list) $('allowlist').appendChild(li(d, '', T('remove', null, 'Remove'), async () => { await send('removeAllow', { domain: d }); load(); }));
  const entries = Object.entries(paused);
  if (!entries.length) $('pausedlist').appendChild(li(T('optNoneRightNow', null, 'None right now')));
  for (const [d, until] of entries) {
    const whenStr = new Date(until).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
    $('pausedlist').appendChild(li(d, T('fmtUntilTime', [bidi(whenStr)], 'until ' + whenStr), T('untrust', null, 'Untrust'), async () => { await send('unpauseSite', { domain: d }); load(); }));
  }
}
function renderHistory(list) {
  $('history').replaceChildren();
  if (!list.length) { $('history').appendChild(li(T('optNothingYetGood', null, 'Nothing yet — that’s a good thing.'))); return; }
  for (const e of list.slice(0, 200)) $('history').appendChild(li(`${KIND(e.kind)} · ${e.host || T('unknownSite', null, 'unknown site')}`, `${LEVEL(e.level)} · ${new Date(e.ts).toLocaleString()}`, T('markMistake', null, 'Mark as mistake'), async () => { const r = await send('userReport', { host: e.host, level: e.level }); flash(r && r.via === 'relay' ? T('toastThanksSent', null, 'Thanks — sent') : T('toastOpenedReport', null, 'Opened a report')); }));
}
bindSwitch('enabled', 'enabled'); bindSwitch('block', 'blockKnownBad'); bindSwitch('hide', 'hideScamContent'); bindSwitch('pageanalysis', 'pageAnalysis'); bindSwitch('report', 'reportingOptIn');
bindSwitch('clickfix', 'clickFixGuard'); bindSwitch('fakeupdate', 'fakeUpdateGuard'); bindSwitch('techscam', 'techScamGuard'); bindSwitch('clipboard', 'clipboardGuard'); bindSwitch('wallet', 'walletGuard'); bindSwitch('strict', 'strictMode');
bindSwitch('leakyform', 'leakyFormGuard'); bindSwitch('fingerprint', 'fingerprintDetect'); bindSwitch('notifyguard', 'notificationGuard');
bindSwitch('shop', 'shopGuard'); bindSwitch('serp', 'serpCheck');
$('sync').addEventListener('change', async () => { const r = await send('setSync', { on: $('sync').checked }); $('sync').closest('.switch').classList.toggle('on', $('sync').checked); flash($('sync').checked ? (r && r.ok ? T('toastSyncOn', null, 'Sync on') : T('toastSyncUnavailable', null, 'Sync unavailable')) : T('toastSyncOff', null, 'Sync off')); });
$('exportbtn').addEventListener('click', async () => {
  const data = await send('exportSettings');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'scamshield-settings.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); flash(T('toastExported', null, 'Exported'));
});
$('importbtn').addEventListener('click', () => $('importfile').click());
$('importfile').addEventListener('change', async () => {
  const f = $('importfile').files[0]; if (!f) return;
  try { const obj = JSON.parse(await f.text()); const r = await send('importSettings', { data: obj }); flash(r && r.ok ? T('toastImported', null, 'Imported') : T('toastInvalidFile', null, 'Invalid file')); load(); }
  catch (_) { flash(T('toastInvalidFile', null, 'Invalid file')); }
  $('importfile').value = '';
});
$('whatsent').addEventListener('click', () => { $('whatsentbody').hidden = !$('whatsentbody').hidden; });
$('theme').addEventListener('change', async () => { await send('setSettings', { patch: { theme: $('theme').value } }); globalThis.SSTheme.applyTheme($('theme').value); flash(T('saved', null, 'Saved')); });
$('otaurl').addEventListener('change', async () => { await send('setSettings', { patch: { otaUrl: $('otaurl').value.trim() } }); flash(T('saved', null, 'Saved')); });
$('checkupd').addEventListener('click', async () => { flash(T('toastCheckingUpdates', null, 'Checking…')); const r = await send('checkForUpdates'); flash(r && r.ok ? (r.updated ? T('fmtUpdatedToVersion', [bidi(r.version)], 'Updated to v' + r.version) : T('toastAlreadyUpToDate', null, 'Already up to date')) : T('toastUpdateFailed', null, 'Update failed')); load(); });
$('clearhist').addEventListener('click', async () => { await send('clearHistory'); renderHistory([]); flash(T('toastHistoryCleared', null, 'History cleared')); });
$('resetfeed').addEventListener('click', async () => { const d = await send('getDefaultFeedUrl'); if (!d || !d.url) return; $('otaurl').value = d.url; await send('setSettings', { patch: { otaUrl: d.url } }); flash(T('resetToOfficialFeed', null, 'Reset to official feed')); });

// ---------------------------------------------------------------------------
// Statistics tab. Every number here is read from storage.local through the
// service worker's getStats and rendered on this page — nothing is computed
// remotely, sent anywhere, or kept anywhere else.
// ---------------------------------------------------------------------------
const CAT_EN = { phishing: 'Phishing', fakeShop: 'Fake shop', wallet: 'Wallet drainer', techSupport: 'Tech-support', clipboard: 'Clipboard', clickfix: 'Fake CAPTCHA', fakeUpdate: 'Fake update', other: 'Other' };
const CAT = (k) => T('statsCat' + k.charAt(0).toUpperCase() + k.slice(1), null, CAT_EN[k] || k);
const CHART_TITLE_EN = { statsChartTitle7d: 'Pages checked · last 7 days', statsChartTitle30d: 'Pages checked · last 30 days', statsChartTitleAll: 'Pages checked · since install', statsChartTitle90d: 'Pages checked · last 90 days' };
// Locale-aware formatters, each falling back to English rather than throwing on
// a runtime that rejects the UI language tag.
function intlDate(opts) { try { return new Intl.DateTimeFormat(UI_LANG, opts); } catch (_) { return new Intl.DateTimeFormat('en', opts); } }
function num(n) { const v = Number(n) || 0; try { return v.toLocaleString(UI_LANG); } catch (_) { return String(v); } }
// Day buckets are UTC (background/stats.js), so they are formatted in UTC too —
// otherwise a bar would be labelled with the previous day west of Greenwich.
function dayMs(key) { const t = Date.parse(key + 'T00:00:00Z'); return Number.isFinite(t) ? t : null; }
function dayText(key) { const t = dayMs(key); return t == null ? key : intlDate({ day: 'numeric', month: 'short', timeZone: 'UTC' }).format(t); }
function barRangeText(bar) {
  if (!bar || bar.days <= 1) return dayText(bar && bar.to);
  const a = dayMs(bar.from), b = dayMs(bar.to);
  if (a == null || b == null) return dayText(bar.to);
  const f = intlDate({ day: 'numeric', month: 'short', timeZone: 'UTC' });
  try { return f.formatRange(a, b); } catch (_) { return f.format(a) + ' – ' + f.format(b); }
}
function barTip(bar) {
  const d = bidi(barRangeText(bar)), c = bidi(num(bar.checked));
  if (bar.threats === 1) return T('fmtStatsBarTipThreat', [d, c], `${d} · ${c} pages checked · 1 threat stopped`);
  if (bar.threats > 1) { const t = bidi(num(bar.threats)); return T('fmtStatsBarTipThreats', [d, c, t], `${d} · ${c} pages checked · ${t} threats stopped`); }
  return T('fmtStatsBarTip', [d, c], `${d} · ${c} pages checked`);
}
function renderBars(ser) {
  const wrap = $('st-bars'); wrap.replaceChildren();
  const hs = SV.heights(ser.bars);
  ser.bars.forEach((bar, i) => {
    const b = document.createElement('div'); b.className = 'b' + (bar.threats > 0 ? ' hit' : '');
    const tip = document.createElement('span'); tip.className = 'tip'; tip.textContent = barTip(bar);
    const fill = document.createElement('i'); fill.style.height = hs[i] + '%';
    b.append(tip, fill); wrap.appendChild(b);
  });
}
function renderCats(byType) {
  const wrap = $('st-cats'); wrap.replaceChildren();
  for (const row of SV.catRows(byType)) {
    const el = document.createElement('div'); el.className = 'cat';
    const label = document.createElement('span'); label.textContent = CAT(row.key);
    const track = document.createElement('div'); track.className = 'track';
    const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = row.pct + '%';
    track.appendChild(fill);
    const n = document.createElement('b'); n.textContent = num(row.count);
    el.append(label, track, n); wrap.appendChild(el);
  }
}
// History rows carry a level, not a pill: dangerous pages were blocked,
// suspicious ones only warned. Anything else (no such event today, but the
// history is a shared ring other detectors can write to) gets the neutral
// privacy pill rather than being dropped.
function pillFor(level) {
  if (level === 'dangerous') return { cls: 'danger', text: T('statsPillBlocked', null, 'Blocked') };
  if (level === 'suspicious') return { cls: 'warn', text: T('statsPillWarned', null, 'Warned') };
  return { cls: 'info', text: T('chipPrivacy', null, 'Privacy') };
}
function renderStatsRecent(list) {
  const ul = $('st-recent'); ul.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li'); const s = document.createElement('span'); s.className = 'host';
    s.textContent = T('optNothingYetGood', null, 'Nothing yet — that’s a good thing.'); li.appendChild(s); ul.appendChild(li); return;
  }
  for (const e of list.slice(0, 3)) {
    const li = document.createElement('li');
    const p = pillFor(e.level); const pill = document.createElement('span'); pill.className = 'pill ' + p.cls; pill.textContent = p.text;
    const host = document.createElement('span'); host.className = 'host'; host.textContent = e.host || T('unknownSite', null, 'unknown site');
    const time = document.createElement('time'); time.textContent = F.relTime(e.ts, undefined, UI_LANG);
    li.append(pill, host, time); ul.appendChild(li);
  }
}
function renderStats(st, hist) {
  const daily = st.statsDaily || [];
  const now = Date.now();
  const ser = SV.series(daily, statsPeriod, now, Number(st.installedAt) || now);
  const sums = SSTATS.summarize(daily, ser.days, now);
  // 7/30 days come from the day ring, which is the only place a per-day number
  // exists; "All time" reads the three lifetime counters instead, so it stays
  // right after an install outlives the ring's 90 days.
  const all = statsPeriod === 'all';
  const checked = all ? Number(st.pagesCheckedTotal) || 0 : sums.checked;
  const threats = all ? Number(st.threatsBlocked) || 0 : sums.threats;
  const privacy = all ? Number(st.privacyFindingsTotal) || 0 : sums.privacy;

  // getStats always sends a real epoch, but an Invalid Date would throw inside
  // Intl and leave the whole dashboard on its "—" placeholders.
  const installedAt = Number(st.installedAt) > 0 ? Number(st.installedAt) : now;
  const sinceStr = intlDate({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(installedAt));
  $('statssince').textContent = T('fmtStatsSince', [bidi(sinceStr)], 'Protecting this browser since ' + sinceStr);
  $('st-checked').textContent = num(checked);
  $('st-threats').textContent = num(threats);
  $('st-privacy').textContent = num(privacy);
  $('st-rules').textContent = num(st.feedRuleCount);
  $('st-threats-tile').classList.toggle('zero', threats === 0);
  $('st-threats-sub').textContent = threats === 0
    ? T('statsThreatsNone', null, "You're clear — nothing slipped through")
    : threats === 1
      ? T('statsScamsBlockedOne', null, '1 scam never reached you')
      : T('fmtStatsScamsBlocked', [bidi(num(threats))], num(threats) + ' scams never reached you');

  const titleKey = statsPeriod === '7' ? 'statsChartTitle7d'
    : statsPeriod === '30' ? 'statsChartTitle30d'
      : ser.clamped ? 'statsChartTitle90d' : 'statsChartTitleAll';
  const title = T(titleKey, null, CHART_TITLE_EN[titleKey]);
  $('st-charttitle').textContent = title;
  $('st-axstart').textContent = dayText(ser.from);
  renderBars(ser);
  // The bars repeat what the tiles and axis already say, so one label on the
  // chart is enough for a screen reader — 30 announced bars would not be.
  $('st-bars').setAttribute('aria-label', title);
  renderCats(st.threatsByType);
  renderStatsRecent(hist);
}
async function loadStats() {
  const token = ++statsToken;
  const [st, h] = await Promise.all([send('getStats'), send('getHistory')]);
  if (token !== statsToken) return; // a newer period/activation already won
  if (!st) { flash(T('toastExtensionError', null, 'Extension error — try reopening.')); return; }
  renderStats(st, (h && h.history) || []);
}
for (const b of document.querySelectorAll('#statsseg button')) {
  b.addEventListener('click', () => {
    statsPeriod = b.dataset.p;
    for (const x of document.querySelectorAll('#statsseg button')) {
      const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on));
    }
    loadStats();
  });
}

showTab((location.hash || '#protection').slice(1).replace(/[^a-z]/g, '') || 'protection');
load();
