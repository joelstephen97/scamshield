(function (root) {
  'use strict';
  const NS = 'scamshield';
  const api = root.browser || root.chrome;
  // Fire-and-forget message to the service worker, same shape as
  // content_script.js's own send() — used only by the trust/undo flow below,
  // which this file owns end-to-end (registrableDomain(location.hostname) +
  // the trustSite/untrustSite round trip) so every warning surface shares
  // ONE implementation instead of each caller wiring its own.
  const send = (type, data) => new Promise((resolve) => {
    try { api.runtime.sendMessage(Object.assign({ type }, data || {}), (r) => resolve(r || null)); }
    catch (_) { resolve(null); }
  });
  // Localised string with English fallback. Content scripts can call
  // chrome.i18n.getMessage; getMessage itself falls back to en per-key. The
  // user's language override (0.7.0), when one has arrived, wins over both.
  function t(key, subs, fallback) {
    try { const R = root.SSReasons; if (R && R.tOverride) { const o = R.tOverride(key, subs); if (o) return o; } } catch (_) {}
    try { const m = api && api.i18n && api.i18n.getMessage(key, subs); if (m) return m; } catch (_) {}
    return fallback != null ? fallback : key;
  }
  // Language override: a content script cannot fetch the packaged locale file
  // (it would have to be web-accessible), so the service worker hands over the
  // dictionary. Strictly fire-and-forget — a warning must never wait on it.
  // Until it lands (usually well before the first verdict, which needs its own
  // round trip) everything renders in the browser language exactly as it does
  // today, and SSReasons.setOverride() then applies to every later string,
  // including content_script.js's own t() and every engine reason, because both
  // files share this world's single SSReasons instance.
  //
  // The setting is read locally first (content scripts have storage access) so
  // the default 'auto' path — almost every user, in every frame of every page,
  // and this runs with all_frames — costs one local read and sends no message
  // at all. Only a real override pays for the round trip. Guarded so a
  // re-injection into an already-initialised frame does not re-ask.
  //
  // Promises, not callbacks: on Firefox `api` is the promise-only `browser`
  // namespace, where a trailing callback is simply never invoked. Both
  // storage.local.get and runtime.sendMessage return a promise when called
  // without one, on Chrome (MV3, and our floor is 121) and on Firefox alike.
  if (!root.__scamshieldLangAsked) {
    root.__scamshieldLangAsked = true;
    try {
      api.storage.local.get('settings').then((cur) => {
        const lang = cur && cur.settings && cur.settings.uiLang;
        if (!lang || lang === 'auto') return; // following the browser: nothing to fetch
        return api.runtime.sendMessage({ type: 'getLangDict' }).then((r) => {
          if (r && r.lang && r.dict && root.SSReasons) root.SSReasons.setOverride(r.lang, r.dict);
        });
      }).catch(() => { /* no worker/storage right now — stay on the browser language */ });
    } catch (_) { /* torn-down extension context */ }
  }
  // Engine reasons are structured ({ code, kind, params }); ui/reasons.js turns
  // one into localized text. It is loaded before this file in both manifests,
  // but stay defensive so a missing resolver degrades instead of throwing.
  function reasonText(r) {
    const R = root.SSReasons;
    if (r == null) return '';
    return R ? R.resolveReason(r) : (typeof r === 'string' ? r : '');
  }
  // Isolates an LTR run (hostname, URL, count) so it reads correctly when
  // substituted into a right-to-left sentence. A no-op when ui/reasons.js
  // isn't loaded (defensive only; it always is in both manifests).
  function bidi(s) {
    const R = root.SSReasons;
    return R && R.bidiWrap ? R.bidiWrap(s) : (s == null ? '' : String(s));
  }
  // Every injected root (banner/overlay/toast) gets an explicit dir so RTL
  // locales lay it out correctly regardless of the host page's own direction.
  function setDir(node) {
    try { node.setAttribute('dir', root.SSReasons && root.SSReasons.isRTL() ? 'rtl' : 'ltr'); } catch (_) {}
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Security fix (0.13.0, Task 11 review round 1): every state-changing
  // control the banner/interstitial expose (trust, undo, dismiss, "Leave
  // this page", "Continue anyway", "Report a mistake", the real-site rescue
  // link) lives in the page's own DOM, injected by a content script that
  // runs in the SAME document as whatever the scam page's own script can
  // reach. Without this guard, that script can call
  // `document.querySelector('.scamshield-banner .ss-trust').click()` (or
  // dispatch a synthetic MouseEvent) the instant the UI renders and silently
  // allowlist itself, dismiss the warning, or otherwise act on the user's
  // behalf. `Event.isTrusted` is set by the browser itself and cannot be
  // spoofed by page script — only a real user input (mouse/keyboard/CDP,
  // which is how Playwright's locator.click() drives it too) sets it true.
  function onTrustedClick(node, fn) {
    node.addEventListener('click', (e) => { if (!e.isTrusted) return; fn(e); });
  }

  // --- Shared surface primitives (0.14.0, Task 4) ---------------------------
  // tile()/button()/timer()/toast() are the building blocks every toast below
  // (and the banner/interstitial in Tasks 5/6) is built from, so there is one
  // implementation of "what does a warning surface look like" instead of one
  // per caller.
  const TILE = { danger: '<path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5l8-3z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>', warn: '<path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5l8-3z"/><path d="M12 8v5"/><path d="M12 16h.01"/>', info: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 10l3 2-3 2M13 14h3"/>', ok: '<path d="M20 6L9 17l-5-5"/>' };
  function tile(kind) { const s = el('span', 'ss-tile ' + (TILE[kind] ? kind : 'info')); s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<svg viewBox="0 0 24 24">' + (TILE[kind] || TILE.info) + '</svg>'; return s; }
  function button(cls, label, opts) { const b = el('button', 'ss-btn ' + cls + (opts && opts.primary ? ' primary' : '') + (opts && opts.quiet ? ' quiet' : ''), label); b.type = 'button'; return b; }
  // WCAG 2.2.1: an auto-hide timer pauses while the pointer or focus is on the surface.
  function timer(node, ms, onDone) {
    let left = ms, started = Date.now(), handle = null, done = false;
    const bar = node.querySelector('.ss-prog i');
    const paint = () => { if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(' + (left / ms) + ')'; requestAnimationFrame(() => { bar.style.transition = 'transform ' + left + 'ms linear'; bar.style.transform = 'scaleX(0)'; }); } };
    const start = () => { if (done) return; started = Date.now(); handle = setTimeout(() => { done = true; onDone(); }, left); paint(); };
    const pause = () => { if (done || handle == null) return; clearTimeout(handle); handle = null; left = Math.max(0, left - (Date.now() - started)); if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(' + (left / ms) + ')'; } };
    node.addEventListener('mouseenter', pause); node.addEventListener('focusin', pause);
    // Fix round 1: a mouseleave must not resume the timer while keyboard
    // focus is still inside the surface (e.g. tabbing through its buttons
    // with the pointer elsewhere) — same "stays paused while focus is
    // inside" guard focusout already has.
    node.addEventListener('mouseleave', () => { if (!node.contains(document.activeElement)) start(); });
    node.addEventListener('focusout', () => { if (!node.contains(document.activeElement)) start(); });
    start();
    return { cancel: () => { done = true; clearTimeout(handle); } };
  }
  // Controller ruling (0.14.0, Task 4 fix round): toast() replaces only an
  // existing .scamshield-toast, NEVER a .scamshield-ack — the support toast
  // fires 1.5s after a dangerous verdict and must not wipe the Undo bar that
  // a trust click just raised. ackSurface (below) is itself built via toast(),
  // so calling it still clears whatever plain toast was on screen.
  function toast(opts) {
    const o = opts || {};
    // Fix round 1: ackSurface's bar now carries BOTH `scamshield-toast` and
    // `scamshield-ack` (so it keeps the .ss-title/.ss-acts styling that is
    // scoped under `.scamshield-toast .ss-X` in content.css) — so this dedupe
    // must explicitly exclude `.scamshield-ack` or it would remove the Undo
    // bar itself, regressing ruling 1 (a toast never replaces the ack).
    document.querySelectorAll('.' + NS + '-toast:not(.' + NS + '-ack)').forEach((n) => n.remove()); // one plain toast at a time
    const box = el('div', NS + '-toast ' + (o.kind || 'info'));
    box.setAttribute('role', o.role || 'status'); setDir(box);
    box.append(tile(o.kind === 'notice' ? 'info' : (o.kind || 'info')), el('div', 'ss-title', o.title || ''));
    if (o.body) box.append(el('div', 'ss-body', o.body));
    const acts = el('div', 'ss-acts');
    for (const a of (o.actions || [])) { const b = button(a.cls || '', a.label, { primary: !!a.primary }); onTrustedClick(b, () => { a.onClick && a.onClick(); if (a.closes !== false) close(); }); acts.appendChild(b); }
    if (o.muteKind && o.onMute) { const m = button('ss-mute', t('dontWarnHere', null, "Don't warn me on this site"), { quiet: true }); onTrustedClick(m, () => { close(); o.onMute(); }); acts.appendChild(m); }
    const x = button('ss-x', '✕'); x.setAttribute('aria-label', t('ariaDismiss', null, 'Dismiss')); onTrustedClick(x, close); acts.appendChild(x);
    box.appendChild(acts);
    let tm = null;
    if (!o.persist) { const p = el('div', 'ss-prog'); p.setAttribute('aria-hidden', 'true'); p.appendChild(el('i')); box.appendChild(p); }
    function close() { if (tm) tm.cancel(); box.remove(); o.onClose && o.onClose(); }
    (document.body || document.documentElement).appendChild(box);
    if (!o.persist) tm = timer(box, o.timeoutMs || 10000, () => box.remove());
    return box;
  }

  // "Copy report" (0.10.0, Task C4) — Privacy Badger's popup Share button,
  // adapted for organic distribution: a plain-text summary of the CURRENT
  // verdict, built fresh on every click so it always matches what's on
  // screen, that a person can paste into WhatsApp/Reddit to warn others.
  // Offered only on the banner and the interstitial, i.e. only ever on a
  // dangerous/suspicious verdict — both call sites below are already gated
  // that way by content_script.js (showBanner/dangerInterstitial are never
  // invoked for a 'safe' verdict).
  function buildReportText(verdict) {
    const R = root.SSReasons;
    const dangerous = verdict.level === 'dangerous';
    const levelLabel = dangerous ? t('popupDangerous', null, 'Dangerous page') : t('popupSuspicious', null, 'Suspicious page');
    const hostText = bidi(R && R.defangHost ? R.defangHost(location.hostname) : location.hostname);
    const headerLine = t('copyReportHeader', [hostText], '⚠ ScamShield flagged this site: ' + location.hostname);
    const verdictLine = t('copyReportVerdict', [levelLabel], 'Verdict: ' + levelLabel);
    const signalsLabel = t('copyReportSignals', null, 'Signals:');
    const footerLine = t('copyReportFooter', null, 'Checked on-device by ScamShield — free, open-source: https://joelstephen97.github.io/scamshield/');
    const reasons = (verdict.reasons || []).slice(0, 4).map(reasonText).filter(Boolean);
    return (R && R.buildCopyReportText)
      ? R.buildCopyReportText({ headerLine, verdictLine, signalsLabel, reasons, footerLine })
      : [headerLine, verdictLine, signalsLabel].concat(reasons.map((r) => '- ' + r), [footerLine]).join('\n');
  }
  function copiedToast() {
    return toast({ kind: 'ok', title: t('toastCopied', null, 'Copied'), timeoutMs: 2500 });
  }
  function copyReportButton(verdict) {
    const btn = el('button', 'ss-copy', t('copyReportBtn', null, 'Copy report'));
    // Guarded like every other in-page control (0.13.0 final review): page
    // script could otherwise synthesise a click and read the composed report
    // text out of the clipboard.
    onTrustedClick(btn, () => {
      const text = buildReportText(verdict);
      // e2e test hook (same pattern as content_script.js's window.__ssLastVerdict):
      // lets a spec assert the exact composed string without depending on
      // headless Chromium's clipboard permission behaviour.
      try { window.__ssLastCopyReport = text; } catch (_) {}
      const R = root.SSReasons;
      const copy = R && R.copyToClipboard ? R.copyToClipboard(text) : Promise.resolve(false);
      copy.then((ok) => { if (ok) copiedToast(); });
    });
    return btn;
  }

  function clearAll() {
    // Fix round 1: a banner's ⋯ menu attaches capture-phase document
    // listeners for as long as it's open (see showBanner's bar.__ssTeardown).
    // clearAll() only ever holds the DOM node, not that closure, so it must
    // invoke the stashed teardown before ripping the node out — otherwise a
    // SPA route change (scamshield:navigate) that catches the menu open
    // leaks both listeners forever.
    document.querySelectorAll('.' + NS + '-banner').forEach((n) => { if (n.__ssTeardown) n.__ssTeardown(); n.remove(); });
    document.querySelectorAll('.' + NS + '-overlay').forEach((n) => n.remove());
    document.querySelectorAll('.' + NS + '-hidden-block').forEach((n) => {
      n.classList.remove(NS + '-hidden-block');
      const t = n.querySelector('.' + NS + '-hidden-tag'); if (t) t.remove();
    });
  }

  // Evidence-backed friction (0.6.0): a short enforced delay before the risky
  // choice becomes clickable measurably improves warning adherence. Used on
  // every "proceed anyway" style button.
  function armDelayed(btn, seconds) {
    const label = btn.textContent;
    let left = seconds == null ? 3 : seconds;
    btn.disabled = true;
    const countdown = () => t('guardCountdown', [label, bidi(left)], label + ' (' + left + ')');
    btn.textContent = countdown();
    const tick = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(tick); btn.disabled = false; btn.textContent = label; }
      else btn.textContent = countdown();
    }, 1000);
    return () => clearInterval(tick);
  }

  // Side-by-side domain comparison for impersonation warnings — research says
  // showing the real vs. fake domain is what actually changes behaviour.
  function compareRow(brandLabel, brandUrl) {
    let realHost = '';
    try { realHost = new URL(brandUrl).hostname.replace(/^www\./, ''); } catch (_) {}
    if (!realHost) return null;
    const row = el('div', 'ss-compare');
    const fake = el('span', 'ss-cmp-fake'); fake.append(el('small', null, t('compareThisSite', null, 'This site')), el('b', null, location.hostname));
    const real = el('span', 'ss-cmp-real'); real.append(el('small', null, t('compareRealSite', [bidi(brandLabel)], 'Real ' + brandLabel)), el('b', null, realHost));
    row.append(fake, el('span', 'ss-cmp-vs', '≠'), real);
    return row;
  }
  // "Trust this site" parity, undo, and origin tag (0.13.0, Task 11) — the #1
  // feature ask across rival reviews (a permanent allowlist) plus a real
  // escape hatch (R3) on every warning surface, not just the banner. All
  // three surfaces (banner, interstitial, block page) end up calling
  // trustSite the same way, so the click-through and the undo affordance
  // live here once instead of in each caller.
  function regDomain() {
    try {
      const SS = root.ScamShield;
      return (SS && typeof SS.registrableDomain === 'function') ? SS.registrableDomain(location.hostname) : location.hostname;
    } catch (_) { return location.hostname; }
  }
  // A small standalone status bar, same visual family as the toasts above —
  // deliberately NOT nested inside the banner/interstitial it replaces, since
  // those are already gone (bar.remove()/ov.remove() already ran) by the time
  // this shows. `restore` re-opens the original surface fresh (a real Undo,
  // not a resurrected stale DOM node) with the exact verdict it was called with.
  // Two call shapes (0.14.0): the legacy `ackSurface(domain, restore)` used by
  // the banner/interstitial trust buttons, and the object form
  // `ackSurface({ text, onUndo, restore })` used by muteHandler (Task 2) and
  // Task 4's redesigned toasts. Both render the same bar.
  function ackSurface(arg, restoreArg) {
    let text, onUndo, restore;
    if (arg && typeof arg === 'object') {
      text = arg.text; onUndo = arg.onUndo; restore = arg.restore;
    } else {
      const domain = arg;
      text = t('ackTrusted', [bidi(domain)], "ScamShield won't flag " + domain + ' again.');
      onUndo = () => send('untrustSite', { domain });
      restore = restoreArg;
    }
    const old = document.querySelector('.' + NS + '-ack'); if (old) old.remove();
    // Built on the same toast() primitive as every other surface (tile 'ok',
    // title, .ss-undo action). Fix round 1: ADD the .scamshield-ack class
    // rather than replacing the root class outright — .ss-title's font-weight
    // and .ss-acts's flex layout in content.css are scoped under
    // `.scamshield-toast .ss-X`, so dropping `scamshield-toast` silently lost
    // both. Keeping both classes means `.scamshield-ack` (which is declared
    // after the shared `.scamshield-toast,.scamshield-ack` rule in
    // content.css) still wins the grid-template-columns override. persist:true
    // — an acknowledgement never auto-hides.
    const bar = toast({
      kind: 'ok', persist: true, title: text,
      actions: [{ cls: 'ss-undo', label: t('undo', null, 'Undo'), onClick: async () => { await onUndo(); restore && restore(); } }]
    });
    bar.classList.add(NS + '-ack');
    return bar;
  }
  // `onAllow` null/undefined → a plain button with no click behaviour of its
  // own (the caller wires its own dismiss-only listener, also trusted-click
  // guarded). Used by the QR-scan banner (surfaceQrVerdict in
  // content_script.js), where the current page and the flagged (decoded)
  // destination are different domains, so a single click must never
  // allowlist the QR's — possibly scam — destination.
  //
  // Two defences against a scam page self-trusting via its own script
  // (review round 1, Critical): the click must be `isTrusted` (real user
  // input — see onTrustedClick above), AND the button must have been on
  // screen for at least 300ms before it accepts a click, in case a page ever
  // finds a way to forward/synthesize a trusted event onto it the instant it
  // renders (e.g. a click already in flight on an element it then covers).
  const TRUST_ARM_MS = 300;
  function trustButton(onAllow) {
    const btn = button('ss-trust', t('trustThisSite', null, 'Trust this site'));
    if (onAllow) {
      const armedAt = performance.now();
      onTrustedClick(btn, (e) => { if (performance.now() < armedAt + TRUST_ARM_MS) return; onAllow(e); });
    }
    return btn;
  }
  function showBanner(verdict, extra) {
    if (document.querySelector('.' + NS + '-banner')) return;
    const x = extra || {}; const danger = verdict.level === 'dangerous';
    const bar = el('div', NS + '-banner ' + (danger ? 'danger' : 'suspicious'));
    bar.setAttribute('role', danger ? 'alert' : 'status'); setDir(bar);
    const text = el('div', 'ss-text');
    const head = verdict.brandLabel ? (danger ? t('bannerDangerBrand', [bidi(verdict.brandLabel)], 'Dangerous page — looks like ' + verdict.brandLabel + ", but isn't") : t('bannerTakeCare', null, 'Take care on this site')) : (danger ? t('bannerDanger', null, 'Dangerous page') : t('bannerTakeCare', null, 'Take care on this site'));
    const reason = el('span', 'ss-reason', reasonText(verdict.reasons[0]) || (danger ? t('popupDangerSummary', null, "Don't enter passwords or card details here.") : t('popupSuspiciousSummary', null, 'Take care before typing anything here.')));
    text.append(el('b', null, head), reason);
    const more = (verdict.reasons || []).slice(1, 4);
    if (more.length) { const why = el('button', 'ss-why', t('whyShort', null, 'Why?')); why.type = 'button'; why.setAttribute('aria-expanded', 'false'); onTrustedClick(why, () => { const ul = el('ul', 'ss-why-list'); for (const r of more) ul.appendChild(el('li', null, reasonText(r))); reason.after(ul); why.remove(); }); reason.appendChild(why); }
    bar.append(tile(danger ? 'danger' : 'warn'), text);
    const acts = el('div', 'ss-acts'); const menu = el('div', 'ss-menu'); menu.setAttribute('role', 'menu'); menu.hidden = true;
    const leave = button('ss-leave', t('leaveThisPage', null, 'Leave this page')); onTrustedClick(leave, () => { bar.__ssTeardown && bar.__ssTeardown(); x.onLeave ? x.onLeave() : history.back(); });
    const rescue = verdict.brandUrl ? button('ss-rescue', t('takeMeToReal', [bidi(verdict.brandLabel || 'site')], 'Take me to the real ' + (verdict.brandLabel || 'site')), { primary: true }) : null;
    if (rescue) onTrustedClick(rescue, () => { bar.__ssTeardown && bar.__ssTeardown(); location.href = verdict.brandUrl; });
    // Single guarded listener (not two): bar.remove() lives inside onAllow
    // itself, right before the await, so the banner still disappears the
    // instant a real trusted click lands — same UX as before, one fewer
    // unguarded listener to audit.
    // 0.13.0 final review: `noTrust` (the QR-scan surface) used to render a
    // "Trust this site" button that merely dismissed the banner — a label
    // that lied about what the click did. The button is simply not rendered
    // there now; "Dismiss" (the ✕) is the honest control for that surface.
    const trust = x.noTrust ? null : trustButton(async () => { bar.__ssTeardown && bar.__ssTeardown(); bar.remove(); const domain = regDomain(); await send('trustSite', { domain, via: x.trustVia || 'banner' }); ackSurface({ text: t('ackTrusted', [bidi(domain)], "ScamShield won't flag " + domain + ' again.'), onUndo: () => send('untrustSite', { domain }), restore: () => showBanner(verdict, extra) }); });
    const report = button('ss-report', t('reportMistake', null, 'Report a mistake')); onTrustedClick(report, () => { report.textContent = t('thanks', null, 'Thanks'); report.disabled = true; x.onReport && x.onReport(); closeMenu(); });
    const copyBtn = copyReportButton(verdict); copyBtn.classList.add('ss-btn'); onTrustedClick(copyBtn, () => closeMenu());
    // Visible row (Hick): danger = filled primary (rescue, else Leave) + outlined Leave (when rescue is primary) + ⋯ + ✕;
    // suspicious = outlined Trust + ⋯ + ✕ (nothing filled on a suspicious page). Trust (danger), Report, Copy live in the menu.
    if (danger) { if (rescue) { acts.append(rescue, leave); } else { leave.classList.add('primary'); acts.appendChild(leave); } if (trust) menu.appendChild(trust); }
    else if (trust) acts.appendChild(trust);
    menu.append(report, copyBtn);
    // The brand comparison sits INSIDE .ss-text under the reason (second line only when a brand is known).
    if (verdict.brandLabel && verdict.brandUrl) { const cmp = compareRow(verdict.brandLabel, verdict.brandUrl); if (cmp) text.appendChild(cmp); }
    const moreBtn = button('ss-more', '⋯'); moreBtn.setAttribute('aria-label', t('moreActions', null, 'More actions')); moreBtn.setAttribute('aria-haspopup', 'menu'); moreBtn.setAttribute('aria-expanded', 'false');
    const closeMenu = () => { menu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey, true); };
    // The two document-level listeners above are armed only while the menu
    // is open, but the bar can also leave the DOM without ever going through
    // closeMenu (Trust's onAllow, Leave/rescue navigating away, or clearAll()
    // on a SPA route change) — fix round 1: any of those must still tear the
    // listeners down, or a long-lived tab accumulates one pair of capture-
    // phase document listeners per banner ever shown. Stashing the teardown
    // on the element lets clearAll() (which only holds the DOM node, not this
    // closure) reach it too.
    bar.__ssTeardown = closeMenu;
    const onDoc = (e) => { if (!acts.contains(e.target)) closeMenu(); }; const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    // Escape must close the menu the instant it's open, so its listener
    // attaches synchronously here. Only the outside-click listener is
    // deferred a tick — otherwise the very click that opened the menu would
    // immediately bubble to document and close it right back.
    onTrustedClick(moreBtn, () => { if (menu.hidden) { menu.hidden = false; moreBtn.setAttribute('aria-expanded', 'true'); document.addEventListener('keydown', onKey, true); setTimeout(() => { document.addEventListener('click', onDoc, true); }, 0); } else closeMenu(); });
    const close = button('ss-x', '✕'); const choice = danger ? '1h' : '1d';
    close.setAttribute('aria-label', danger ? t('hideForAnHour', null, 'Hide for an hour') : t('hideForToday', null, 'Hide for today')); close.title = close.getAttribute('aria-label');
    onTrustedClick(close, () => { closeMenu(); bar.remove(); if (!x.noTrust && x.onHide) x.onHide(choice); });
    acts.append(moreBtn, close, menu); bar.appendChild(acts);
    (document.body || document.documentElement).appendChild(bar);
  }

  // Full-page interstitial (0.6.0) — the interaction-blocking tier, reserved
  // for near-zero-false-positive detections (decisive flags and the guard
  // detectors). Research: active warnings are heeded by ~79% vs ~20-30% for
  // passive banners, but false positives burn trust — so this only ever fires
  // on signals with an essentially zero legitimate base rate. The headline
  // varies mildly between showings (polymorphism resists habituation) and the
  // escape hatch is delayed a few seconds.
  function dangerInterstitial(verdict, x) {
    if (document.querySelector('.' + NS + '-interstitial')) return;
    x = x || {};
    const HEADS = [
      t('interstitialHead1', null, 'Stop — this page is trying to scam you'),
      t('interstitialHead2', null, 'Hold on — this looks like a scam page'),
      t('interstitialHead3', null, "Don't go further — scam warning")
    ];
    const ov = el('div', NS + '-overlay ' + NS + '-interstitial'); ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', t('ariaScamWarning', null, 'Scam warning')); setDir(ov);
    const card = el('div', 'ss-card'); const head = el('div', 'ss-head'); const h3 = el('h3', null, HEADS[Math.floor(Math.random() * HEADS.length)]); head.append(tile('danger'), h3); card.append(head);
    card.append(el('p', 'ss-lead', reasonText(verdict.reasons[0]) || t('interstitialFallback', null, 'This page matches the pattern of a known scam.')));
    // Address box, same as blocked.html: label + the page URL, LTR-isolated.
    const addr = el('div', 'ss-addr'); addr.append(el('small', null, t('thisPage', null, 'This page')), el('code', null, location.href.slice(0, 200))); card.append(addr);
    if (verdict.brandLabel && verdict.brandUrl) { const cmp = compareRow(verdict.brandLabel, verdict.brandUrl); if (cmp) card.appendChild(cmp); }
    const ul = el('ul', 'ss-evidence'); for (const r of (verdict.reasons || []).slice(1, 4)) { const li = el('li'); li.append(el('span', 'ss-chip', t('chipWhy', null, 'Why')), el('span', null, reasonText(r))); ul.appendChild(li); } if (ul.children.length) card.appendChild(ul);
    card.append(el('p', 'ss-sub', t('interstitialReassure', null, 'Nothing you typed has been sent yet. Leaving now is safe.')));
    const actions = el('div', 'ss-actions'); const leave = button('ss-primary', t('leaveThisPage', null, 'Leave this page')); onTrustedClick(leave, () => { x.onLeave ? x.onLeave() : history.back(); }); actions.append(leave);
    const copyBtn = copyReportButton(verdict); copyBtn.classList.add('ss-btn'); actions.append(copyBtn);
    if (verdict.brandUrl) { const rescue = button('ss-rescue-ghost', t('takeMeToReal', [bidi(verdict.brandLabel || 'site')], 'Go to the real ' + (verdict.brandLabel || 'site'))); onTrustedClick(rescue, () => { location.href = verdict.brandUrl; }); actions.prepend(rescue); }
    card.append(actions);
    const details = el('details', 'ss-details'); const sum = el('summary', null, t('detailsAndOptions', null, 'Details and other options')); details.append(sum);
    const row1 = el('div', 'ss-dt'); const stay = button('ss-danger-ghost', t('continueAnyway', null, 'Continue anyway')); armDelayed(stay, 3);
    // Continue = pause this site for 1 hour (the block page's "Visit anyway" rule), never a permanent trust.
    onTrustedClick(stay, () => { ov.remove(); send('pauseSite', { domain: regDomain(), choice: '1h' }); if (x.onDismiss) x.onDismiss(); });
    row1.append(stay, el('span', 'ss-consequence', t('continuePausesHour', null, 'Pauses ScamShield on this site for 1 hour.'))); details.append(row1);
    const row2 = el('div', 'ss-dt');
    const trust = x.noTrust ? null : trustButton(async () => { ov.remove(); const domain = regDomain(); await send('trustSite', { domain, via: x.trustVia || 'interstitial' }); ackSurface({ text: t('ackTrusted', [bidi(domain)], "ScamShield won't flag " + domain + ' again.'), onUndo: () => send('untrustSite', { domain }), restore: () => dangerInterstitial(verdict, x) }); });
    if (trust) { trust.className = 'ss-trust ss-trust-link'; trust.textContent = t('blockedTrustSite', null, 'Not a scam? Trust this site'); row2.append(trust); }
    const rep = el('button', 'ss-report', t('reportMistake', null, 'Report a mistake')); rep.type = 'button'; onTrustedClick(rep, () => { rep.textContent = t('thanks', null, 'Thanks'); rep.disabled = true; x.onReport && x.onReport(); });
    row2.append(rep); details.append(row2); card.append(details);
    card.append(el('p', 'ss-foot', t('blockedFooter', null, 'Blocked on your device. Nothing about this page was sent anywhere.')));
    ov.append(card); document.documentElement.appendChild(ov); leave.focus();
  }

  // One-time-ever, shown 1.5s after a dangerous page was blocked. Controller
  // ruling: must never appear over an open trust acknowledgement — that toast
  // fires right when a "Trust this site" click is landing, and wiping the
  // Undo bar out from under the user would be far worse than skipping the ask.
  function supportToast() {
    if (document.querySelector('.' + NS + '-toast') || document.querySelector('.' + NS + '-ack')) return;
    return toast({
      kind: 'ok', title: t('toastSupportAsk', null, 'ScamShield just protected you — it’s free and runs on your device. Chip in? ❤'),
      actions: [{ cls: 'ss-support', label: t('supportOpen', null, 'Open'), onClick: () => window.open('https://github.com/sponsors/joelstephen97', '_blank', 'noopener') }],
      timeoutMs: 20000
    });
  }

  // Intercept submit on password forms that post off-domain.
  // NOTE: capture-phase 'submit' catches user-initiated submits (click, Enter,
  // requestSubmit — which fires a real, cancelable submit event per spec, so
  // it was never actually a gap here). Programmatic HTMLFormElement.submit()
  // DOES bypass the native submit event entirely; content/main_world_guard.js
  // hooks it in the MAIN world and re-dispatches a cancelable
  // 'scamshield:formsubmit' event on the form, which this guard also listens
  // for below. content/content_script.js's guardExfilForms (the cross-origin
  // credential/card exfil toast) listens for the same event to close the
  // identical bypass for its own submits (Task P5).
  function guardForms(foreignForms, reasons, onReport) {
    foreignForms.forEach((form) => {
      if (form.__scamshieldGuarded) return;
      form.__scamshieldGuarded = true;
      const onSubmit = (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (document.querySelector('.' + NS + '-overlay')) return;
        const ov = el('div', NS + '-overlay');
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', t('ariaPhishingWarning', null, 'Possible phishing warning'));
        setDir(ov);
        const card = el('div', 'ss-card');
        let dest = '';
        try { dest = new URL(form.getAttribute('action') || location.href, location.href).hostname; } catch (_) {}
        card.append(
          el('h3', null, t('phishingStop', null, 'Stop — possible phishing')),
          el('p', null, dest
            ? t('guardFormDestKnown', [bidi(dest), bidi(location.hostname)], 'This form sends your password to ' + dest + ', not to ' + location.hostname + '. Sending a password to a different website is how scammers steal logins.')
            : t('guardFormDestUnknown', null, 'This form sends your password to a different website than the one you are visiting. This is a common way scammers steal logins.'))
        );
        const ul = el('ul', 'ss-evidence');
        for (const r of (reasons || []).slice(0, 3)) { const li = el('li'); li.append(el('span', 'ss-chip', t('chipPage', null, 'Page')), el('span', null, reasonText(r))); ul.appendChild(li); }
        card.appendChild(ul);
        const actions = el('div', 'ss-actions');
        const back = button('ss-primary', t('cancelRecommended', null, 'Cancel (recommended)'));
        const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        back.addEventListener('click', close);
        const go = button('ss-danger-ghost', t('submitAnyway', null, 'Submit anyway'));
        armDelayed(go, 3);
        // form.submit() here runs the isolated world's native (unhooked) method,
        // so it really submits without re-triggering this guard.
        go.addEventListener('click', () => { document.removeEventListener('keydown', onKey, true); ov.remove(); form.submit(); });
        actions.append(back, go);
        const rep = button('ss-report', t('reportMistake', null, 'Report a mistake')); rep.addEventListener('click', () => { rep.textContent = t('thanks', null, 'Thanks'); rep.disabled = true; onReport && onReport(); }); actions.prepend(rep);
        card.append(actions); ov.append(card);
        document.documentElement.appendChild(ov);
        document.addEventListener('keydown', onKey, true);
        back.focus();
      };
      form.addEventListener('submit', onSubmit, true);
      form.addEventListener('scamshield:formsubmit', onSubmit, true);
    });
  }

  function hideScamBlocks(blocks) {
    blocks.forEach((node) => {
      if (node.classList.contains(NS + '-hidden-block')) return;
      node.classList.add(NS + '-hidden-block');
      const tag = el('div', NS + '-hidden-tag', t('guardHiddenTag', null, 'Hidden by ScamShield'));
      setDir(tag);
      node.appendChild(tag);
    });
  }

  function walletConfirmOverlay(detail, onDecision) {
    if (document.querySelector('.' + NS + '-overlay')) {
      // Another warning is already on screen. Deny, never silently approve —
      // a drainer could fire a decoy request first and slip the real one
      // through the collision path. The dApp receives a standard user-rejected
      // error (4001) and can simply retry. collision:true tells the bridge
      // this denial is synthetic, not a user-confirmed threat.
      toast({ kind: 'warn', role: 'alert', title: t('guardWalletCollision', null, 'ScamShield blocked a wallet request while another warning was open. Close it and retry.'), timeoutMs: 12000 });
      onDecision(false, { collision: true });
      return;
    }
    const ov = el('div', NS + '-overlay');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', t('walletRiskyTitle', null, 'Risky wallet request'));
    setDir(ov);
    const card = el('div', 'ss-card');
    const head = el('div', 'ss-head'); const h3 = el('h3', null, t('walletRiskyTitle', null, 'Risky wallet request')); head.append(tile('warn'), h3);
    card.append(head,
      el('p', null, reasonText(detail.reasons && detail.reasons[0]) || t('guardWalletFallback', null, 'This site is requesting a sensitive wallet action.')),
      el('p', 'ss-sub', t('walletRiskyBody', null, 'If you did not expect this, cancel. Drainers use these requests to steal your crypto.')));
    const actions = el('div', 'ss-actions');
    const cancel = button('ss-primary', t('cancelRecommended', null, 'Cancel (recommended)'));
    const proceed = button('ss-danger-ghost', t('proceedAnyway', null, 'Proceed anyway'));
    armDelayed(proceed, 3);
    const done = (allow) => { document.removeEventListener('keydown', onKey, true); ov.remove(); onDecision(allow); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
    cancel.addEventListener('click', () => done(false));
    proceed.addEventListener('click', () => done(true));
    actions.append(cancel, proceed); card.append(actions); ov.append(card);
    document.documentElement.appendChild(ov);
    document.addEventListener('keydown', onKey, true); cancel.focus();
  }

  // Privacy findings are informational (badge/popup tier), never blocking.
  // `detail.muteKind`/`onMute` (0.14.0) let the leaky-form/notify-lure
  // listeners in content_script.js offer the shared "Don't warn me on this
  // site" control instead of each wiring its own.
  function privacyToast(detail) {
    const d = detail || {};
    return toast({
      kind: 'warn', role: 'status', title: d.title || '',
      body: d.text || t('guardPrivacyFallback', null, 'A privacy issue was detected on this page.'),
      muteKind: d.muteKind, onMute: d.onMute
    });
  }

  // Cross-origin credential/card exfil watch (0.10.0, Task C2) — warn-tier
  // sibling of guardForms above, rendered as a dismissible toast (like the
  // leaky-form/notify-lure privacy findings) instead of the blocking
  // "possible phishing" overlay. The submit that triggered this was already
  // paused (content/content_script.js's guardExfilForms calls preventDefault
  // before calling here), so — unlike privacyToast, which is purely
  // informational — this toast persists (no timer) and carries an explicit
  // "Submit anyway" so a legitimate but unlisted cross-origin post isn't
  // silently stuck forever. `onMute` (0.14.0) is the 'credpost' mute handler.
  function crossOriginCredToast(reason, onProceed, onMute) {
    return toast({
      kind: 'danger', role: 'alert', persist: true,
      title: t('credPostTitle', null, 'This form sends what you type to another site'),
      body: reasonText(reason),
      actions: [
        { cls: 'ss-keep', label: t('keepMyDetails', null, 'Keep my details'), primary: true },
        { cls: 'ss-send', label: t('submitAnyway', null, 'Submit anyway'), onClick: onProceed }
      ],
      muteKind: 'credpost', onMute
    });
  }

  // 0.14.0: notice/warn tiers are informational, not an interruption — role
  // "status" (polite) instead of "alert" (assertive) for screen readers.
  // 'notice' (a user-initiated copy — e.g. a shell command off an install
  // page, or a crypto address) gets its own title/body pair keyed off the
  // reason code; 'warn' (the site wrote to the clipboard on its own) keeps a
  // single generic title. Both offer the shared 'clipboard' mute.
  function clipboardToast(detail) {
    const d = detail || {};
    const reason = (d.reasons && d.reasons[0]) || {};
    const host = bidi(d.host);
    if (d.tier === 'notice') {
      const isAddr = reason.code === 'clipboardCryptoAddress';
      return toast({
        kind: 'notice', role: 'status',
        title: isAddr
          ? t('clipboardNoticeAddrTitle', [host], 'You copied a crypto address from ' + d.host)
          : t('clipboardNoticeCmdTitle', [host], 'You copied a terminal command from ' + d.host),
        body: isAddr
          ? t('clipboardNoticeAddrBody', null, 'Check it matches the address you expected before sending anything.')
          : t('clipboardNoticeCmdBody', null, 'Only run it if you trust this site. Real sites never ask you to paste commands to "verify" anything.'),
        muteKind: 'clipboard', onMute: d.onMute
      });
    }
    return toast({
      kind: 'warn', role: 'status',
      title: t('clipboardWarnTitle', [host], d.host + ' changed your clipboard on its own'),
      body: reasonText(reason) || t('guardClipboardFallback', null, 'A site changed your clipboard.'),
      muteKind: 'clipboard', onMute: d.onMute
    });
  }

  function techScamEscapeOverlay(verdict, onLeave) {
    if (document.querySelector('.' + NS + '-overlay')) return;
    const ov = el('div', NS + '-overlay');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', t('techScamTitle', null, 'Possible tech-support scam'));
    setDir(ov);
    const card = el('div', 'ss-card');
    const head = el('div', 'ss-head'); const h3 = el('h3', null, t('techScamTitle', null, 'Possible tech-support scam')); head.append(tile('danger'), h3);
    card.append(head,
      el('p', null, reasonText(verdict.reasons && verdict.reasons[0]) || t('guardTechScamFallback', null, 'This page is using scare tactics.')),
      el('p', 'ss-sub', t('techScamBody', null, 'This is a web page, not your computer — your computer is fine. Real security warnings never lock your screen or show a phone number. Do not call, and do not pay.')));
    const actions = el('div', 'ss-actions');
    const leave = button('ss-primary', t('getMeOut', null, 'Get me out (close this page)'));
    const stay = button('', t('dismiss', null, 'Dismiss'));
    const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    leave.addEventListener('click', () => { close(); onLeave && onLeave(); });
    stay.addEventListener('click', close);
    actions.append(leave, stay); card.append(actions); ov.append(card);
    document.documentElement.appendChild(ov);
    document.addEventListener('keydown', onKey, true); leave.focus();
  }

  root.ScamShield = root.ScamShield || {};
  root.ScamShield.actions = { showBanner, guardForms, hideScamBlocks, clearAll, walletConfirmOverlay, clipboardToast, techScamEscapeOverlay, supportToast, dangerInterstitial, armDelayed, privacyToast, crossOriginCredToast, ackSurface };
})(typeof globalThis !== 'undefined' ? globalThis : self);
