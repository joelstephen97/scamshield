'use strict';
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);

function registrable(host){return String(host||'').toLowerCase().split('.').filter(Boolean).slice(-2).join('.');}

async function init() {
  const settings = await api.runtime.sendMessage({ type: 'getSettings' });
  $('enabled').checked = !!settings.enabled;
  $('hide').checked = !!settings.hideScamContent;

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const verdict = tab ? await api.runtime.sendMessage({ type: 'getVerdict', tabId: tab.id }) : null;
  const level = (verdict && verdict.level) || 'safe';
  $('status').className = 'status ' + level;
  $('level').textContent = level === 'safe' ? 'No threats detected'
    : level === 'suspicious' ? 'Suspicious page' : 'Dangerous page';
  const reasons = (verdict && verdict.reasons) || [];
  $('reasons').innerHTML = reasons.map((r) => '<li>' + r.replace(/[<>&]/g, '') + '</li>').join('');

  if (tab && tab.url && /^https?:/.test(tab.url)) {
    const domain = registrable(new URL(tab.url).hostname);
    const trust = $('trust');
    trust.hidden = false;
    trust.textContent = (settings.allowlist || []).includes(domain) ? 'Untrust this site' : 'Trust this site';
    trust.addEventListener('click', async () => {
      if ((settings.allowlist || []).includes(domain)) await api.runtime.sendMessage({ type: 'removeAllow', domain });
      else await api.runtime.sendMessage({ type: 'allowSite', domain });
      window.close();
    });
  }

  $('enabled').addEventListener('change', () => api.runtime.sendMessage({ type: 'setSettings', patch: { enabled: $('enabled').checked } }));
  $('hide').addEventListener('change', () => api.runtime.sendMessage({ type: 'setSettings', patch: { hideScamContent: $('hide').checked } }));
  $('opts').addEventListener('click', (e) => { e.preventDefault(); api.runtime.openOptionsPage(); });
}
init();
