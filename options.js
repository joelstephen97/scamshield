'use strict';
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
const F = globalThis.SSFormat, I = globalThis.SSIcons;
const UI_LANG = (() => { try { return api.i18n.getUILanguage(); } catch (_) { return 'en'; } })();
// SSi18n.t returns '' (never key-echo) on a genuine miss, so the fallback
// argument here actually gets used instead of being dead code.
const T = (k, subs, fb) => { const v = globalThis.SSi18n && globalThis.SSi18n.t(k, subs); return v || fb || k; };
const R = globalThis.SSReasons;
const bidi = (s) => (R && R.bidiWrap ? R.bidiWrap(s) : (s == null ? '' : String(s)));
const send = (type, extra) => new Promise((res) => { try { api.runtime.sendMessage(Object.assign({ type }, extra || {}), (r) => res(r)); } catch (_) { res(null); } });
function flash(t) { $('status').textContent = t; $('status').classList.add('show'); setTimeout(() => $('status').classList.remove('show'), 1200); }
function showTab(name, userInitiated) {
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + name;
  for (const a of document.querySelectorAll('nav a')) {
    const cur = a.dataset.tab === name;
    a.classList.toggle('cur', cur); a.setAttribute('aria-selected', String(cur));
  }
  try { history.replaceState(null, '', '#' + name); } catch (_) {}
  if (userInitiated) { const h = $('tab-' + name).querySelector('h2'); if (h) h.focus(); }
}
for (const a of document.querySelectorAll('nav a')) a.addEventListener('click', (e) => { e.preventDefault(); showTab(a.dataset.tab, true); });
showTab((location.hash || '#protection').slice(1).replace(/[^a-z]/g, '') || 'protection');
$('brandmark').insertAdjacentHTML('afterbegin', I.shield('safe'));
try { const v = api.runtime.getManifest().version; $('ver').textContent = T('fmtVersion', [bidi(v)], 'Version ' + v); $('aboutver').textContent = v; } catch (_) {}

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
load();
