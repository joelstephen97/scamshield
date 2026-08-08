'use strict';
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function load() {
  const s = await api.runtime.sendMessage({ type: 'getSettings' });
  $('enabled').checked = !!s.enabled;
  $('block').checked = !!s.blockKnownBad;
  $('hide').checked = !!s.hideScamContent;
  $('report').checked = !!s.reportingOptIn;
  $('otaurl').value = s.otaUrl || '';
  renderAllow(s.allowlist || []);
  const h = await api.runtime.sendMessage({ type: 'getHistory' });
  renderHistory((h && h.history) || []);
}
const KIND_LABELS = {
  page: 'Scam page warning', wallet: 'Wallet request blocked',
  clipboard: 'Clipboard hijack caught', techscam: 'Scare page blocked'
};
function renderHistory(list) {
  $('history').replaceChildren();
  if (!list.length) { const li = document.createElement('li'); li.textContent = 'Nothing yet — that’s a good thing.'; $('history').appendChild(li); return; }
  for (const e of list.slice(0, 50)) {
    const li = document.createElement('li');
    const when = new Date(e.ts).toLocaleString();
    li.textContent = `${when} — ${KIND_LABELS[e.kind] || e.kind} (${e.level}) — ${e.host || 'unknown site'}`;
    li.className = 'hist-' + e.level;
    $('history').appendChild(li);
  }
}
function renderAllow(list) {
  $('allowlist').innerHTML = '';
  if (!list.length) { const li = document.createElement('li'); li.textContent = 'None yet'; $('allowlist').appendChild(li); return; }
  for (const d of list) {
    const li = document.createElement('li');
    li.textContent = d;
    const b = document.createElement('button'); b.textContent = 'Remove';
    b.addEventListener('click', async () => { await api.runtime.sendMessage({ type: 'removeAllow', domain: d }); load(); });
    li.appendChild(b); $('allowlist').appendChild(li);
  }
}
function flash(t){ $('status').textContent = t; setTimeout(() => ($('status').textContent = ''), 1200); }
function bind(id, key) {
  $(id).addEventListener('change', async () => {
    await api.runtime.sendMessage({ type: 'setSettings', patch: { [key]: $(id).checked } });
    flash('Saved');
  });
}
bind('enabled', 'enabled'); bind('block', 'blockKnownBad');
bind('hide', 'hideScamContent'); bind('report', 'reportingOptIn');

$('otaurl').addEventListener('change', async () => {
  await api.runtime.sendMessage({ type: 'setSettings', patch: { otaUrl: $('otaurl').value.trim() } });
  flash('Saved');
});
$('checkupd').addEventListener('click', async () => {
  flash('Checking…');
  const r = await api.runtime.sendMessage({ type: 'checkForUpdates' });
  flash(r && r.ok ? (r.updated ? ('Updated to v' + r.version) : 'Already up to date') : 'Update failed');
});
$('clearhist').addEventListener('click', async () => {
  await api.runtime.sendMessage({ type: 'clearHistory' });
  renderHistory([]);
  flash('History cleared');
});
$('resetfeed').addEventListener('click', async () => {
  const d = await api.runtime.sendMessage({ type: 'getDefaultFeedUrl' });
  if (!d || !d.url) return;
  $('otaurl').value = d.url;
  await api.runtime.sendMessage({ type: 'setSettings', patch: { otaUrl: d.url } });
  flash('Reset to official feed');
});
load();
