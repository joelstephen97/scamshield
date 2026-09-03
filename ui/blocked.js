// ui/blocked.js — the network-level block page (0.12.0).
//
// Reached only by a declarativeNetRequest redirect rule (engine/dnr_rules.js
// buildRedirectRules): a main-frame navigation to a domain on the threat feed
// or the packaged static ruleset lands here with the ORIGINAL url in the
// fragment (blocked.html#https://bad.example/path). Nothing from that page ever
// loaded — the redirect happens at request time.
//
// On load the page tells the service worker ('dnrBlocked'), which counts the
// catch exactly like an in-page dangerous verdict: threatsBlocked (the
// earned-review threshold), the stats ring, and the protection history.
// Reloads inside a minute are collapsed by the worker, not here.
'use strict';
const api = globalThis.browser || globalThis.chrome;
const SS = globalThis.ScamShield, I = globalThis.SSIcons, R = globalThis.SSReasons, i18n = globalThis.SSi18n;
const $ = (id) => document.getElementById(id);
const T = (key, subs, fallback) => { try { const v = i18n && i18n.t ? i18n.t(key, subs) : ''; return v || fallback; } catch (_) { return fallback; } };
const bidi = (s) => '⁨' + s + '⁩';
const registrable = (h) => (SS && SS.registrableDomain) ? SS.registrableDomain(h) : String(h || '').split('.').slice(-2).join('.');
const send = (type, data) => new Promise((resolve) => { try { api.runtime.sendMessage(Object.assign({ type }, data || {}), (r) => resolve(r || null)); } catch (_) { resolve(null); } });

function blockedUrl() {
  let raw = location.hash.slice(1);
  try { raw = decodeURIComponent(raw); } catch (_) {}
  try { const u = new URL(raw); if (/^https?:$/.test(u.protocol)) return u; } catch (_) {}
  return null;
}
const target = blockedUrl();
const host = target ? target.hostname : '';
const domain = host ? registrable(host) : '';

function render(info) {
  try { $('hico').innerHTML = I && I.shield ? I.shield('dangerous') : ''; } catch (_) {}
  $('url').textContent = target ? target.href : '';
  if (host) $('lead').textContent = T('blockedLead', [bidi(host)], host + " is on ScamShield's list of known scam and malicious sites, so the page was stopped before it could load. Nothing ran and nothing you typed was sent.");
  const sources = info && Array.isArray(info.sources) ? info.sources.filter((s) => typeof s === 'string' && s) : [];
  if (sources.length) { $('src').removeAttribute('data-i18n'); $('src').textContent = T('blockedListedBy', [bidi(sources.slice(0, 4).join(', '))], 'Listed by ' + sources.slice(0, 4).join(', ')); }
  const fp = 'https://github.com/joelstephen97/scamshield/issues/new?title=' + encodeURIComponent('False positive: ' + host) +
    '&body=' + encodeURIComponent('Site: ' + (target ? target.href : '') + '\n\nWhat ScamShield said: blocked (known scam domain)\n\nWhat it should have said: \n');
  $('mistake').href = fp;
}

$('back').addEventListener('click', async () => {
  if (history.length > 1) { history.back(); return; }
  try { const t = await api.tabs.getCurrent(); if (t && t.id != null) { await api.tabs.remove(t.id); return; } } catch (_) {}
  location.href = api.runtime.getURL('onboarding.html');
});
$('copy').addEventListener('click', async () => {
  const hostText = bidi(R && R.defangHost ? R.defangHost(host) : host);
  const lvl = T('levelDangerous', null, 'Dangerous page');
  const text = [
    T('copyReportHeader', [hostText], '⚠ ScamShield flagged this site: ' + host),
    T('copyReportVerdict', [lvl], 'Verdict: ' + lvl),
    T('blockedListedGeneric', null, "Listed in ScamShield's block list of confirmed scam domains."),
    T('copyReportFooter', null, 'Checked on-device by ScamShield — free, open-source: https://joelstephen97.github.io/scamshield/')
  ].join('\n');
  try { await navigator.clipboard.writeText(text); $('copy').textContent = T('toastCopied', null, 'Copied'); } catch (_) {}
});
$('visit').addEventListener('click', async (e) => {
  e.preventDefault();
  if (!target || !domain) return;
  // Same path as the popup's "Pause protection → 1 hour": the worker records
  // the pause and installs the matching network allow rule before we go.
  await send('pauseSite', { domain, choice: '1h' });
  location.replace(target.href);
});

(async () => {
  if (i18n && i18n.ready) { try { await i18n.ready; } catch (_) {} }
  render(null);
  if (!target) return;
  const info = await send('dnrBlocked', { url: target.href });
  render(info);
})();
