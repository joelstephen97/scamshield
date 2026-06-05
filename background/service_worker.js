'use strict';
const api = globalThis.browser || globalThis.chrome;

const DEFAULTS = {
  enabled: true,
  hideScamContent: true,
  blockKnownBad: true,
  reportingOptIn: false,     // anonymized reporting, OFF by default
  allowlist: [],             // array of registrable domains the user trusts
  blocklistVersion: 1,
  modelVersion: 1
};

async function getSettings() {
  const stored = await api.storage.local.get('settings');
  return Object.assign({}, DEFAULTS, stored.settings || {});
}
async function setSettings(patch) {
  const next = Object.assign(await getSettings(), patch);
  await api.storage.local.set({ settings: next });
  if ('blockKnownBad' in patch && api.declarativeNetRequest && api.declarativeNetRequest.updateEnabledRulesets) {
    try {
      await api.declarativeNetRequest.updateEnabledRulesets(
        patch.blockKnownBad ? { enableRulesetIds: ['blocklist'] } : { disableRulesetIds: ['blocklist'] }
      );
    } catch (e) { /* ruleset toggle is best-effort */ }
  }
  return next;
}

api.runtime.onInstalled.addListener(async () => {
  const cur = await api.storage.local.get('settings');
  if (!cur.settings) await api.storage.local.set({ settings: DEFAULTS });
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
          if (level !== 'safe') api.action.setBadgeBackgroundColor({ tabId, color: level === 'dangerous' ? '#c0392b' : '#e1a200' });
        }
        sendResponse({ ok: true }); break;
      }
      case 'getVerdict': {
        sendResponse(lastVerdict.get(msg.tabId) || null); break;
      }
      case 'checkForUpdates':
        // Stub for OTA blocklist/model updates. Real impl fetches a signed
        // manifest and calls api.declarativeNetRequest.updateDynamicRules.
        sendResponse({ ok: true, blocklistVersion: (await getSettings()).blocklistVersion });
        break;
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async response
});
