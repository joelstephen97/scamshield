'use strict';
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
const SS = globalThis.Parry, F = globalThis.SSFormat, I = globalThis.SSIcons, R = globalThis.SSReasons, REVIEW = globalThis.SSReview;
// The locale the Intl formatters use. `let`, not `const`: a language override
// has to move the timestamps too, or the popup reads German with English
// relative times. Reassigned once, at the top of init().
let UI_LANG = (() => { try { return api.i18n.getUILanguage(); } catch (_) { return 'en'; } })();
// SSi18n.t returns '' (never key-echo) on a genuine miss, so the fallback
// argument here actually gets used instead of being dead code.
const T = (k, subs, fb) => { const v = globalThis.SSi18n && globalThis.SSi18n.t(k, subs); return v || fb || k; };
const bidi = (s) => (R && R.bidiWrap ? R.bidiWrap(s) : (s == null ? '' : String(s)));
const LEVELTXT = { safe: 'popupSafe', suspicious: 'popupSuspicious', dangerous: 'popupDangerous', unknown: 'popupUnknown' };
const levelLabel = (lvl) => T(LEVELTXT[lvl] || 'popupUnknown', null, F.levelText(lvl));
const send = (type, extra) => new Promise((res) => { try { api.runtime.sendMessage(Object.assign({ type }, extra || {}), (r) => res(r)); } catch (_) { res(null); } });
const registrable = (h) => (SS && SS.registrableDomain) ? SS.registrableDomain(h) : String(h || '').split('.').slice(-2).join('.');
const brandName = (key) => SS.brandDisplayName ? SS.brandDisplayName(key) : key;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1400); }
// Reads UI_LANG at call time, and falls back to English rather than throwing on
// a runtime that rejects the tag (same pattern as SSFormat.relTime). A 1-day
// pause resumes on a different calendar day almost every time it's picked, so
// a bare hour:minute ("3:45 PM") would be ambiguous about which day — add the
// month/day whenever the resume moment isn't today.
function timeOfDay(ts) {
  const opts = { hour: '2-digit', minute: '2-digit' };
  const d = new Date(ts), now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (!sameDay) { opts.month = 'short'; opts.day = 'numeric'; }
  try { return d.toLocaleTimeString(UI_LANG, opts); } catch (_) { return d.toLocaleTimeString('en', opts); }
}

let tab = null, domain = null, settings = null, verdict = null, level = 'unknown';

function renderStatus(level, host, summary, levelTextOverride) {
  $('status').className = 'card status ' + level;
  $('statusicon').innerHTML = I.shield(level); $('level').textContent = levelTextOverride || levelLabel(level); $('host').textContent = host || '';
  $('summary').hidden = !summary; $('summary').textContent = summary || '';
}
// Evidence chips are driven by the reason's own `kind` (link|brand|page|wallet|
// clipboard|techscam|shop|message) — no more guessing from the English text.
const chipLabel = (kind) => T('chip' + kind.charAt(0).toUpperCase() + kind.slice(1), null, F.detectorLabel(kind));
function renderEvidence(reasons, open) {
  const ul = $('reasons'); ul.replaceChildren();
  for (const r of (reasons || []).slice(0, 5)) {
    const kind = R.reasonKind(r);
    const li = document.createElement('li'); const chip = document.createElement('span'); chip.className = 'chip' + (kind === 'brand' ? ' brand' : '');
    chip.textContent = chipLabel(kind);
    const span = document.createElement('span'); span.textContent = R.resolveReason(r); li.append(chip, span); ul.appendChild(li);
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
    !settings.enabled ? T('popupPausedSummary', null, 'Protection is paused — turn it on to resume.') :
    checking ? '' :
    level === 'dangerous' ? (brand ? T('popupBrandDangerSummary', [bidi(brand)], `Looks like ${brand}, but isn't. Don't enter your password here.`) : T('popupDangerSummary', null, "Don't enter passwords or card details here.")) :
    level === 'suspicious' ? T('popupSuspiciousSummary', null, 'Take care before typing anything here.') : '',
    checking ? T('popupChecking', null, 'Checking…') : undefined);
  renderEvidence(verdict && verdict.reasons, level === 'dangerous');
  $('leave').hidden = level !== 'dangerous'; $('showwhy').hidden = level !== 'suspicious';
  $('leave').textContent = T('leaveThisPage', null, 'Leave this page'); $('showwhy').textContent = T('showWhy', null, 'Show why');
  const rescueUrl = verdict && verdict.brand && SS.BRAND_DOMAINS[verdict.brand] ? 'https://' + SS.BRAND_DOMAINS[verdict.brand][0] + '/' : null;
  $('rescue').hidden = !(level === 'dangerous' && rescueUrl); if (rescueUrl) $('rescue').textContent = T('takeMeToReal', [bidi(brand)], 'Take me to the real ' + brand);
  $('reportbtn').hidden = checking;
  if (!checking) $('reportbtn').textContent = level === 'safe' || level === 'unknown' ? T('reportScam', null, 'Report: this is a scam') : T('reportSafe', null, 'Report: this is safe');
  renderReviewAsk(level);
}
// Earned review ask (0.7.0): a quiet card below the status card, shown only
// after ui/review.js's pure predicate says it's earned (2nd real block, 7+
// day-old install, Chrome only — no AMO listing to ask for on Firefox, state
// pending/eligible-snooze) AND the current tab's verdict isn't an active
// warning (never "please review us" beneath a dangerous/suspicious card —
// the eligible state just waits for a popup open on a clean/unknown page).
// The three buttons each report an action to the SW (which owns the
// reviewAsk storage.local state) and hide the card; "Rate" is a real
// <a target="_blank"> (zero new API surface) that also records the state
// change so the card never returns.
//
// Chrome/Firefox detection: NOT `typeof browser === 'undefined'`. Modern
// Chrome (verified: Chromium 148, 2026) now ships its own native `browser.*`
// promise-API alias for cross-browser compatibility, so `browser` is defined
// on real Chrome too — that check would make isChrome false everywhere and
// the ask would never show. Instead this reads our OWN packaged manifest via
// ui/review.js's isChromeFromManifest(): only the Firefox build
// (manifest.firefox.json) carries `browser_specific_settings` (the Gecko
// extension ID) — Chrome's manifest.json never has it, regardless of what
// globals the browser injects.
function isChromeBuild() {
  // Fails open (assumes Chrome) on any getManifest() error. Intentional and
  // low-stakes: the worst case is a working CWS review link/card shown on a
  // browser that isn't actually Chrome, never a broken feature.
  try { return REVIEW.isChromeFromManifest(api.runtime.getManifest()); } catch (_) { return true; }
}
// Fetches eligibility once (cheap, and independent of which page the popup
// happens to be over) and caches it in module scope; renderReviewAsk() below
// applies the tab-verdict gate and can be called from multiple places
// (renderVerdictUI's first render, its poll re-render, and the non-http
// early-return branch) without re-fetching or re-evaluating eligibility.
let reviewEligible = false, reviewCount = 0, reviewListenersBound = false;
async function initReviewAsk() {
  if (!REVIEW) return;
  if (!isChromeBuild()) return;
  const ctx = await send('getReviewAsk');
  if (!ctx) return;
  const ra = ctx.reviewAsk || {};
  reviewCount = settings.threatsBlocked || 0;
  reviewEligible = REVIEW.eligible({
    isChrome: true, threatsBlocked: reviewCount, installedAt: ctx.installedAt, now: Date.now(),
    state: ra.state, snoozeUntil: ra.snoozeUntil, asks: ra.asks
  });
}
function bindReviewButtonsOnce() {
  if (reviewListenersBound) return;
  reviewListenersBound = true;
  const hide = () => { $('askcard').hidden = true; };
  $('askrate').addEventListener('click', () => { send('reviewAskAction', { action: 'rate' }); hide(); });
  $('asklater').addEventListener('click', async () => { await send('reviewAskAction', { action: 'later' }); hide(); });
  $('askno').addEventListener('click', async () => { await send('reviewAskAction', { action: 'no' }); hide(); });
}
// Idempotent — safe to call repeatedly (e.g. once with the "checking"/unknown
// level, again once pollVerdict's later re-render knows the real verdict): it
// only toggles visibility/text, and binds the button listeners at most once.
function renderReviewAsk(lvl) {
  if (!REVIEW) return;
  if (!REVIEW.shouldShowCard(reviewEligible, lvl)) { $('askcard').hidden = true; return; }
  $('askbody').textContent = T('reviewAskBody', [bidi(String(reviewCount))],
    `Parry has now stopped ${reviewCount} scams for you. If it's earned it, a short review helps other people find it — it's free and always will be.`);
  $('askcard').hidden = false;
  bindReviewButtonsOnce();
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
  const until = paused ? timeOfDay(paused) : '';
  $('trustedtext').textContent = always ? T('paused', null, 'Paused') : paused ? T('pausedUntil', [bidi(until)], 'Paused until ' + until) : '';
}
// Mutual exclusion (fix, review round 1): each button's click handler
// stopPropagation()s so the OTHER menu's document-level outside-click
// listener never sees the click and never closes it — opening one menu has
// to close the other directly, not rely on the outside-click listener.
function setTrustMenu(open) {
  if (open) setLangMenu(false);
  $('trustmenu').hidden = !open; $('trust').setAttribute('aria-expanded', String(open));
  if (open) { const first = $('trustmenu').querySelector('.dditem'); if (first) first.focus(); }
}
function setLangMenu(open) {
  if (open) setTrustMenu(false);
  $('langdd').hidden = !open; $('langbtn').setAttribute('aria-expanded', String(open));
  if (open) { const cur = $('langdd').querySelector('.cur') || $('langdd').querySelector('.langitem'); if (cur) cur.focus(); }
}
// Popup header language switcher (0.7.1): writes the SAME setting the options
// page's dropdown does (uiLang), built from the same autonym list
// (SSReasons.LOCALES/LANG_NAMES) options.js's buildLangOptions() already
// reads — one source of truth, no duplicated 20-language list. Autonyms are
// never message keys: a picker has to read the same in every locale, so a
// Spanish speaker hunting for Japanese finds 日本語. Picking an item saves the
// setting, then reloads the popup so every string on it — not just the ones
// this file could patch in place — re-renders in the new language at once,
// the same "save then reload" pattern options.js's `#lang` change handler
// uses.
function buildLangMenu() {
  const dd = $('langdd'); dd.replaceChildren();
  const current = (settings && settings.uiLang) || 'auto';
  const mk = (value, label) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.className = 'dditem langitem' + (value === current ? ' cur' : '');
    b.dataset.lang = value;
    const span = document.createElement('span'); span.textContent = label;
    const chk = document.createElement('span'); chk.className = 'chk'; chk.textContent = value === current ? '✓' : '';
    b.append(span, chk);
    b.addEventListener('click', async () => {
      setLangMenu(false);
      await send('setSettings', { patch: { uiLang: value } });
      location.reload();
    });
    return b;
  };
  dd.appendChild(mk('auto', T('optLangAuto', null, 'Browser default')));
  for (const code of (R ? R.LOCALES : [])) dd.appendChild(mk(code, (R && R.LANG_NAMES && R.LANG_NAMES[code]) || code));
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
  // Fired BEFORE the language wait below so the two reads overlap: the popup's
  // critical path is the verdict, and nothing here should queue behind a
  // locale fetch that only matters on the override path.
  const settingsPromise = send('getSettings');
  // Language override (0.7.0): resolved before the first string is written, so
  // the popup never renders in English and then swaps under the user. On the
  // default 'auto' setting this is a single local storage read and nothing
  // about the popup changes.
  try {
    const lang = await globalThis.SSi18n.ready;
    if (lang) UI_LANG = R.intlTag(lang); // timestamps follow the chosen language too
  } catch (_) { /* fall back to the browser language */ }
  $('lockline').textContent = T('runsOnDevice', null, 'Runs on your device · nothing leaves your browser');
  $('brandmark').insertAdjacentHTML('afterbegin', I.shield('safe')); $('opts').innerHTML = I.gear(); $('langbtn').innerHTML = I.globe(); $('lockline').insertAdjacentHTML('afterbegin', I.lock());
  try { $('ver').textContent = api.runtime.getManifest().version; } catch (_) {}
  settings = await settingsPromise;
  if (!settings) { renderStatus('unknown', '', T('toastExtensionError', null, 'Extension error — try reopening.')); return; }
  $('enabled').checked = !!settings.enabled; $('enabledwrap').classList.toggle('on', !!settings.enabled); $('enabledlbl').textContent = settings.enabled ? T('on', null, 'On') : T('paused', null, 'Paused');
  $('enabled').addEventListener('change', async () => { settings = await send('setSettings', { patch: { enabled: $('enabled').checked } }); $('enabledwrap').classList.toggle('on', !!settings.enabled); $('enabledlbl').textContent = settings.enabled ? T('on', null, 'On') : T('paused', null, 'Paused'); });
  $('opts').addEventListener('click', (e) => { e.preventDefault(); api.runtime.openOptionsPage(); });
  // Language switcher (0.7.1): wired unconditionally (unlike the Trust menu
  // below, which only exists on http(s) tabs) — switching language has
  // nothing to do with which site the popup happened to open over.
  buildLangMenu();
  $('langbtn').addEventListener('click', (e) => { e.stopPropagation(); setLangMenu($('langdd').hidden); });
  document.addEventListener('click', (e) => { if (!$('langdd').hidden && !$('langdd').contains(e.target) && e.target !== $('langbtn')) setLangMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('langdd').hidden) { setLangMenu(false); $('langbtn').focus(); } });
  $('support').addEventListener('click', (e) => { e.preventDefault(); api.tabs.create({ url: 'https://github.com/sponsors/joelstephen97' }); });
  // openOptionsPage() cannot carry a #hash, so the Statistics deep link opens
  // the options page as a normal tab (options_page/options_ui both open in a
  // tab already) and lets the tab router pick the section up from the hash.
  $('viewall').addEventListener('click', (e) => { e.preventDefault(); api.tabs.create({ url: api.runtime.getURL('options.html#stats') }); window.close(); });
  $('tile-all').querySelector('b').textContent = String(settings.threatsBlocked || 0);
  await initReviewAsk();
  if (settings.whatsNewSeen !== '0.6.0') { $('whatsnew').hidden = false; $('whatsnewlink').addEventListener('click', (e) => { e.preventDefault(); api.tabs.create({ url: 'https://github.com/joelstephen97/parry/blob/main/CHANGELOG.md' }); }); $('whatsnewx').addEventListener('click', async () => { $('whatsnew').hidden = true; await send('setSettings', { patch: { whatsNewSeen: '0.6.0' } }); }); }

  tab = await currentTab();
  const http = tab && tab.url && /^https?:/.test(tab.url);
  if (!http) {
    const protocol = tab && tab.url ? new URL(tab.url).protocol.replace(':', '') : '';
    renderStatus('unknown', protocol ? T('fmtProtocolPage', [bidi(protocol)], protocol + ' page') : '', T('popupNotHttp', null, "Browser pages and the web store aren't scanned."));
    renderReviewAsk('unknown');
    renderHistory(); return;
  }
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

  $('trust').textContent = T('popupPauseMenu', null, 'Pause protection ▾');
  $('trust').hidden = false; renderTrust();
  $('trust').addEventListener('click', (e) => { e.stopPropagation(); setTrustMenu($('trustmenu').hidden); });
  document.addEventListener('click', (e) => { if (!$('trustmenu').hidden && !$('trustmenu').contains(e.target) && e.target !== $('trust')) setTrustMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('trustmenu').hidden) { setTrustMenu(false); $('trust').focus(); } });
  // Scoped to #trustmenu: the popup's language dropdown (0.7.1) also uses the
  // shared .dditem class for its rows, and a bare `.dditem` selector here
  // would double-bind this Trust handler onto every language item too.
  for (const b of document.querySelectorAll('#trustmenu .dditem')) b.addEventListener('click', async () => {
    const r = await send('pauseSite', { domain, choice: b.dataset.choice }); setTrustMenu(false);
    settings = await send('getSettings'); renderTrust(); toast(r && r.until ? T('toastPausedForNow', null, 'Paused for now') : T('paused', null, 'Paused'));
  });
  $('untrust').addEventListener('click', async () => { await send('unpauseSite', { domain }); settings = await send('getSettings'); renderTrust(); toast(T('toastResumed', null, 'Protection resumed')); });

  $('reportbtn').addEventListener('click', async () => {
    const r = await send('userReport', { label: level === 'safe' || level === 'unknown' ? 'scam' : 'false_positive', tabId: tab.id });
    $('reportbtn').hidden = true; $('reportdone').hidden = false; $('reportdone').textContent = r && r.via === 'relay' ? T('toastThanksSent', null, 'Thanks — sent') : T('toastThanksNoted', null, 'Thanks — noted');
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
    const chip = document.createElement('span'); chip.className = 'chip' + (shop.level === 'suspicious' ? ' brand' : ''); chip.textContent = R.resolveReason({ code: 'shop_' + f.code }) || T('popupShopFlagFallback', null, 'Flag');
    const span = document.createElement('span'); span.textContent = R.resolveReason({ code: 'shop_' + f.code + '_detail' });
    li.append(chip, span); ul.appendChild(li);
  }
}
function renderPrivacy(findings) {
  if (!findings.length) return;
  $('privacycard').hidden = false;
  const ul = $('privacylist'); ul.replaceChildren();
  const label = { 'leaky-form': () => T('chipDataLeak', null, 'Data leak'), fingerprint: () => T('chipTracking', null, 'Tracking'), 'notify-lure': () => T('chipPopups', null, 'Pop-ups') };
  const text = (f) =>
    f.kind === 'leaky-form' ? (f.detail && f.detail !== 'plain'
      ? T('popupPrivacyLeakHashed', [bidi(f.host)], 'Sent your email/phone to ' + f.host + ' (hashed) before you submitted.')
      : T('popupPrivacyLeakPlain', [bidi(f.host)], 'Sent your email/phone to ' + f.host + ' before you submitted.')) :
    f.kind === 'fingerprint' ? T('popupPrivacyFingerprint', [bidi(f.host)], f.host + ' is fingerprinting your device to track you.') :
    f.kind === 'notify-lure' ? T('popupPrivacyNotifyLure', null, 'This site tried a "click Allow" notification trick.') :
    T('popupPrivacyDefaultText', null, 'Privacy issue detected.');
  for (const f of findings.slice(0, 5)) {
    const li = document.createElement('li');
    const chip = document.createElement('span'); chip.className = 'chip brand'; chip.textContent = label[f.kind] ? label[f.kind]() : T('chipPrivacy', null, 'Privacy');
    const span = document.createElement('span'); span.textContent = text(f);
    li.append(chip, span); ul.appendChild(li);
  }
}
function renderHistoryList(list) {
  if (!list.length) return; $('recent').hidden = false; const ul = $('hist'); ul.replaceChildren();
  for (const e of list.slice(0, 3)) {
    const li = document.createElement('li'); const chip = document.createElement('span'); chip.className = 'chip' + (e.kind === 'page' ? '' : ' brand'); chip.textContent = chipLabel(e.kind);
    const hs = document.createElement('span'); hs.className = 'h'; hs.textContent = e.host || T('unknownSite', null, 'unknown site'); const t = document.createElement('time'); t.textContent = F.relTime(e.ts, undefined, UI_LANG);
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
    $('msglevel').textContent = r.level === 'safe' ? T('msgSafe', null, 'Looks safe — no scam signals found') : r.level === 'suspicious' ? T('msgSuspicious', null, 'Suspicious — treat with caution') : T('msgDangerous', null, 'Almost certainly a scam');
    $('msgwhy').textContent = r.reasons.slice(0, 3).map((x) => R.resolveReason(x)).join(' · ');
  });
}
wireMessageChecker();
init().catch((err) => { renderStatus('unknown', '', T('toastExtensionError', null, 'Extension error — try reopening.')); console.error('[Parry] popup init failed:', err); });
