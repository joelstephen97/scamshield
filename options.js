'use strict';
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function load() {
  const s = await api.runtime.sendMessage({ type: 'getSettings' });
  $('enabled').checked = !!s.enabled;
  $('block').checked = !!s.blockKnownBad;
  $('hide').checked = !!s.hideScamContent;
  $('report').checked = !!s.reportingOptIn;
  renderAllow(s.allowlist || []);
}
function renderAllow(list) {
  $('allowlist').innerHTML = '';
  if (!list.length) { $('allowlist').innerHTML = '<li>None yet</li>'; return; }
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
load();
