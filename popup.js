'use strict';
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
const SS = globalThis.ScamShield, F = globalThis.SSFormat, I = globalThis.SSIcons;
const send = (type, extra) => new Promise((res) => { try { api.runtime.sendMessage(Object.assign({ type }, extra || {}), (r) => res(r)); } catch (_) { res(null); } });
const registrable = (h) => (SS && SS.registrableDomain) ? SS.registrableDomain(h) : String(h || '').split('.').slice(-2).join('.');
const brandName = (key) => SS.brandDisplayName ? SS.brandDisplayName(key) : key;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1400); }

let tab = null, domain = null, settings = null, verdict = null, level = 'unknown';

function renderStatus(level, host, summary, levelTextOverride) {
  $('status').className = 'card status ' + level;
  $('statusicon').innerHTML = I.shield(level); $('level').textContent = levelTextOverride || F.levelText(level); $('host').textContent = host || '';
  $('summary').hidden = !summary; $('summary').textContent = summary || '';
}
function renderEvidence(reasons, open) {
  const ul = $('reasons'); ul.replaceChildren();
  for (const r of (reasons || []).slice(0, 5)) {
    const li = document.createElement('li'); const chip = document.createElement('span'); chip.className = 'chip' + (/brand|icon|looks like/i.test(r) ? ' brand' : '');
    chip.textContent = /icon|looks like|impersonat/i.test(r) ? 'Brand' : /wallet|approval|signature/i.test(r) ? 'Wallet' : /clipboard/i.test(r) ? 'Clipboard' : /pop-up|infected|support/i.test(r) ? 'Scare page' : /link|address|domain|punycode|tld|not secure|https/i.test(r) ? 'Link' : 'Page';
    const span = document.createElement('span'); span.textContent = r; li.append(chip, span); ul.appendChild(li);
  }
  $('evidence').hidden = !(open && reasons && reasons.length);
}
// Renders the status card / evidence / leave-rescue-report controls from the
// current module-scope `verdict`. Called once with the popup's first
// getVerdict() answer, then again by pollVerdict() if that first answer was
// null (the SW hadn't scanned the page yet, or was evicted and lost it).
function renderVerdictUI(host) {
  const checking = !!settings.enabled && verdict == null;
  level = !settings.enabled ? 'unknown' : (verdict ? (verdict.level || 'safe') : 'unknown');
  const brand = verdict && verdict.brand ? brandName(verdict.brand) : null;
  renderStatus(level, host,
    !settings.enabled ? 'Protection is paused — turn it on to resume.' :
    checking ? '' :
    level === 'dangerous' ? (brand ? `Looks like ${brand}, but isn't. Don't enter your password here.` : 'Don\'t enter passwords or card details here.') :
    level === 'suspicious' ? 'Take care before typing anything here.' : '',
    checking ? 'Checking…' : undefined);
  renderEvidence(verdict && verdict.reasons, level === 'dangerous');
  $('leave').hidden = level !== 'dangerous'; $('showwhy').hidden = level !== 'suspicious';
  const rescueUrl = verdict && verdict.brand && SS.BRAND_DOMAINS[verdict.brand] ? 'https://' + SS.BRAND_DOMAINS[verdict.brand][0] + '/' : null;
  $('rescue').hidden = !(level === 'dangerous' && rescueUrl); if (rescueUrl) $('rescue').textContent = 'Take me to the real ' + brand;
  $('reportbtn').hidden = checking;
  if (!checking) $('reportbtn').textContent = level === 'safe' || level === 'unknown' ? 'Report: this is a scam' : 'Report: this is safe';
}
async function pollVerdict(host) {
  for (let i = 0; i < 10; i++) {
    await new Promise((res) => setTimeout(res, 300));
    const v = await send('getVerdict', { tabId: tab.id });
    if (v != null) { verdict = v; renderVerdictUI(host); return; }
  }
}
function renderTrust() {
  const paused = settings.pausedSites && settings.pausedSites[domain];
  const always = (settings.allowlist || []).includes(domain);
  $('trust').hidden = !!paused || always; $('trusted').hidden = !(paused || always);
  $('trustedtext').textContent = always ? 'Trusted' : paused ? ('Trusted until ' + new Date(paused).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '';
}
function setTrustMenu(open) {
  $('trustmenu').hidden = !open; $('trust').setAttribute('aria-expanded', String(open));
  if (open) { const first = $('trustmenu').querySelector('.dditem'); if (first) first.focus(); }
}
// The real extension popup is a separate window, so tabs.query({active,
// currentWindow}) reliably returns the page the popup was opened over.
// tabs.getCurrent() only resolves when this script is itself running inside
// an ordinary tab (e.g. e2e tests load popup.html via context.newPage()) —
// in that case bringing the popup "tab" to front would otherwise shadow the
// real content tab, so exclude our own tab id and pick the best remaining
// candidate (there's only ever one content tab per test).
async function currentTab() {
  let self = null; try { self = await api.tabs.getCurrent(); } catch (_) {}
  if (!self) { const [t] = await api.tabs.query({ active: true, currentWindow: true }); return t || null; }
  const all = await api.tabs.query({ currentWindow: true });
  const others = all.filter((t) => t.id !== self.id);
  return others.find((t) => t.active) || others[others.length - 1] || null;
}
async function init() {
  $('brandmark').insertAdjacentHTML('afterbegin', I.shield('safe')); $('opts').innerHTML = I.gear(); $('lockline').insertAdjacentHTML('afterbegin', I.lock());
  try { $('ver').textContent = api.runtime.getManifest().version; } catch (_) {}
  settings = await send('getSettings');
  if (!settings) { renderStatus('unknown', '', 'Extension error — try reopening.'); return; }
  $('enabled').checked = !!settings.enabled; $('enabledwrap').classList.toggle('on', !!settings.enabled); $('enabledlbl').textContent = settings.enabled ? 'On' : 'Paused';
  $('enabled').addEventListener('change', async () => { settings = await send('setSettings', { patch: { enabled: $('enabled').checked } }); $('enabledwrap').classList.toggle('on', !!settings.enabled); $('enabledlbl').textContent = settings.enabled ? 'On' : 'Paused'; });
  $('opts').addEventListener('click', (e) => { e.preventDefault(); api.runtime.openOptionsPage(); });
  $('support').addEventListener('click', (e) => { e.preventDefault(); api.tabs.create({ url: 'https://github.com/sponsors/joelstephen97' }); });
  $('viewall').addEventListener('click', (e) => { e.preventDefault(); api.runtime.openOptionsPage(); });
  $('tile-all').querySelector('b').textContent = String(settings.threatsBlocked || 0);
  if (settings.whatsNewSeen !== '0.5.0') { $('whatsnew').hidden = false; $('whatsnewlink').addEventListener('click', (e) => { e.preventDefault(); api.tabs.create({ url: 'https://github.com/joelstephen97/scamshield/blob/main/CHANGELOG.md' }); }); $('whatsnewx').addEventListener('click', async () => { $('whatsnew').hidden = true; await send('setSettings', { patch: { whatsNewSeen: '0.5.0' } }); }); }

  tab = await currentTab();
  const http = tab && tab.url && /^https?:/.test(tab.url);
  if (!http) { renderStatus('unknown', tab && tab.url ? new URL(tab.url).protocol.replace(':', '') + ' page' : '', "Browser pages and the web store aren't scanned."); renderHistory(); return; }
  const host = new URL(tab.url).hostname; domain = registrable(host);
  verdict = await send('getVerdict', { tabId: tab.id });
  renderVerdictUI(host);
  if (settings.enabled && verdict == null) pollVerdict(host); // fire-and-forget; re-renders when the SW's scan lands
  $('leave').addEventListener('click', async () => { await send('leaveTab', { tabId: tab.id }); window.close(); });
  $('rescue').addEventListener('click', () => {
    const rescueUrl = verdict && verdict.brand && SS.BRAND_DOMAINS[verdict.brand] ? 'https://' + SS.BRAND_DOMAINS[verdict.brand][0] + '/' : null;
    if (rescueUrl) { api.tabs.update(tab.id, { url: rescueUrl }); window.close(); }
  });
  $('showwhy').addEventListener('click', () => { $('evidence').hidden = false; $('showwhy').hidden = true; });

  $('trust').hidden = false; renderTrust();
  $('trust').addEventListener('click', (e) => { e.stopPropagation(); setTrustMenu($('trustmenu').hidden); });
  document.addEventListener('click', (e) => { if (!$('trustmenu').hidden && !$('trustmenu').contains(e.target) && e.target !== $('trust')) setTrustMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('trustmenu').hidden) { setTrustMenu(false); $('trust').focus(); } });
  for (const b of document.querySelectorAll('.dditem')) b.addEventListener('click', async () => {
    const r = await send('pauseSite', { domain, choice: b.dataset.choice }); setTrustMenu(false);
    settings = await send('getSettings'); renderTrust(); toast(r && r.until ? 'Trusted for now' : 'Trusted');
  });
  $('untrust').addEventListener('click', async () => { await send('unpauseSite', { domain }); settings = await send('getSettings'); renderTrust(); toast('Untrusted'); });

  $('reportbtn').addEventListener('click', async () => {
    const r = await send('userReport', { label: level === 'safe' || level === 'unknown' ? 'scam' : 'false_positive', tabId: tab.id });
    $('reportbtn').hidden = true; $('reportdone').hidden = false; $('reportdone').textContent = r && r.via === 'relay' ? 'Thanks — sent' : 'Thanks — noted';
  });

  const [st, h, pf, shop] = await Promise.all([send('getTabStats', { domain }), send('getHistory'), send('getPrivacyFindings', { tabId: tab.id }), send('getShopFindings', { tabId: tab.id })]);
  $('tile-site').querySelector('b').textContent = String((st && st.siteCount) || 0);
  renderHistoryList((h && h.history) || []);
  renderPrivacy((pf && pf.findings) || []);
  renderShop(shop || { flags: [] });
}
function renderShop(shop) {
  const flags = (shop && shop.flags) || [];
  if (!flags.length) return;
  $('shopcard').hidden = false;
  const ul = $('shoplist'); ul.replaceChildren();
  for (const f of flags.slice(0, 6)) {
    const li = document.createElement('li');
    const chip = document.createElement('span'); chip.className = 'chip' + (shop.level === 'suspicious' ? ' brand' : ''); chip.textContent = f.label || 'Flag';
    const span = document.createElement('span'); span.textContent = f.detail || '';
    li.append(chip, span); ul.appendChild(li);
  }
}
function renderPrivacy(findings) {
  if (!findings.length) return;
  $('privacycard').hidden = false;
  const ul = $('privacylist'); ul.replaceChildren();
  const label = { 'leaky-form': 'Data leak', fingerprint: 'Tracking', 'notify-lure': 'Pop-ups' };
  const text = (f) =>
    f.kind === 'leaky-form' ? ('Sent your email/phone to ' + f.host + (f.detail && f.detail !== 'plain' ? ' (hashed)' : '') + ' before you submitted.') :
    f.kind === 'fingerprint' ? (f.host + ' is fingerprinting your device to track you.') :
    f.kind === 'notify-lure' ? ('This site tried a "click Allow" notification trick.') :
    'Privacy issue detected.';
  for (const f of findings.slice(0, 5)) {
    const li = document.createElement('li');
    const chip = document.createElement('span'); chip.className = 'chip brand'; chip.textContent = label[f.kind] || 'Privacy';
    const span = document.createElement('span'); span.textContent = text(f);
    li.append(chip, span); ul.appendChild(li);
  }
}
function renderHistoryList(list) {
  if (!list.length) return; $('recent').hidden = false; const ul = $('hist'); ul.replaceChildren();
  for (const e of list.slice(0, 3)) {
    const li = document.createElement('li'); const chip = document.createElement('span'); chip.className = 'chip' + (e.kind === 'page' ? '' : ' brand'); chip.textContent = F.detectorLabel(e.kind);
    const hs = document.createElement('span'); hs.className = 'h'; hs.textContent = e.host || 'unknown site'; const t = document.createElement('time'); t.textContent = F.relTime(e.ts);
    li.append(chip, hs, t); ul.appendChild(li);
  }
}
async function renderHistory() {
  const h = await send('getHistory'); renderHistoryList((h && h.history) || []);
}
function wireMessageChecker() {
  if (!SS || typeof SS.scoreMessage !== 'function') { $('msgcheck').hidden = true; return; }
  $('msgbtn').addEventListener('click', () => {
    const r = SS.scoreMessage($('msgtext').value); $('msgresult').hidden = false;
    $('msgstatus').className = 'status mini ' + r.level; $('msgicon').innerHTML = I.shield(r.level);
    $('msglevel').textContent = r.level === 'safe' ? 'Looks safe — no scam signals found' : r.level === 'suspicious' ? 'Suspicious — treat with caution' : 'Almost certainly a scam';
    $('msgwhy').textContent = r.reasons.slice(0, 3).join(' · ');
  });
}
wireMessageChecker();
init().catch((err) => { renderStatus('unknown', '', 'Extension error — try reopening.'); console.error('[ScamShield] popup init failed:', err); });
