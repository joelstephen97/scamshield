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
  // Promise style, kept for consistency rather than necessity: Firefox's
  // `browser.*` does invoke a trailing callback (Schemas.sys.mjs pops it), so
  // callbacks would work there too. Both storage.local.get and
  // runtime.sendMessage return a promise when called without one, on Chrome
  // (MV3, and our floor is 121) and on Firefox alike.
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
  // (0.15.0) The implementation moved to content/surfaces/primitives.js so shadow-hosted surfaces can
  // also check click geometry (the button must sit inside its card); light-DOM nodes keep isTrusted only.
  const surfaces = () => root.ScamShield.surfaces;
  function onTrustedClick(node, fn) { surfaces().onTrustedClick(node, fn); }

  // Theme (0.15.0): the Options theme (auto|light|dark) is a synced setting that lives in
  // storage.local.settings. Read it once and follow changes, so every host gets data-theme without a
  // round trip at show time. content_script.js also hands it over via setTheme() when it loads settings.
  let theme = 'auto';
  const goodTheme = (v) => (v === 'dark' || v === 'light' ? v : 'auto');
  function setTheme(v) { theme = goodTheme(v); }
  try {
    api.storage.local.get('settings').then((cur) => { if (cur && cur.settings) setTheme(cur.settings.theme); }).catch(() => {});
    api.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.settings && ch.settings.newValue) setTheme(ch.settings.newValue.theme); });
  } catch (_) { /* torn-down extension context */ }
  const reducedMotion = () => { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

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
    // (0.15.0) reduced motion: no drain animation, the bar stays a static full-width hairline.
    const still = reducedMotion();
    const paint = () => { if (bar && still) { bar.style.transition = 'none'; bar.style.transform = 'none'; return; } if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(' + (left / ms) + ')'; requestAnimationFrame(() => { bar.style.transition = 'transform ' + left + 'ms linear'; bar.style.transform = 'scaleX(0)'; }); } };
    // Fix round 2: re-entrancy guard. mouseleave and focusout can both fire for
    // the same "pointer and focus left" gesture; without the `handle != null`
    // check the second one stacks a SECOND setTimeout on top of the first and
    // the surface's onDone runs twice (and the earlier handle leaks).
    const start = () => { if (done || handle != null) return; started = Date.now(); handle = setTimeout(() => { done = true; onDone(); }, left); paint(); };
    const pause = () => { if (done || handle == null) return; clearTimeout(handle); handle = null; left = Math.max(0, left - (Date.now() - started)); if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(' + (left / ms) + ')'; } };
    node.addEventListener('mouseenter', pause); node.addEventListener('focusin', pause);
    // (0.15.0) touch has no hover: a real tap on the toast body pauses it too (resumes like hover does).
    node.addEventListener('pointerdown', (e) => { if (e.isTrusted) pause(); });
    const focusInside = () => node.contains(node.getRootNode().activeElement);
    // Fix round 1: a mouseleave must not resume the timer while keyboard
    // focus is still inside the surface (e.g. tabbing through its buttons
    // with the pointer elsewhere) — same "stays paused while focus is
    // inside" guard focusout already has.
    node.addEventListener('mouseleave', () => { if (!focusInside()) start(); });
    node.addEventListener('focusout', () => { if (!focusInside()) start(); });
    start();
    return { cancel: () => { done = true; clearTimeout(handle); } };
  }
  // Controller ruling (0.14.0, Task 4 fix round): a plain toast never replaces the ack — the support
  // toast fires 1.5s after a dangerous verdict and must not wipe the Undo bar a trust click just
  // raised. (0.15.0) Each lives in its own shadow host ('toast' / 'ack'), so that now holds by
  // construction: mounting one kind replaces only that kind. ackSurface (below) is built via toast()
  // with `ack: true`, which swaps the host kind and keeps both root classes for the shared styling.
  function toast(opts) {
    const o = opts || {};
    const S = surfaces();
    let box = null, tm = null, handle = null;
    // close() is idempotent: tm.cancel() on a spent timer is a no-op, and so is removing a gone host.
    function close() { if (tm) tm.cancel(); if (handle) handle.close(); o.onClose && o.onClose(); }
    handle = S.mount(o.ack ? 'ack' : 'toast', () => {
      box = el('div', NS + '-toast ' + (o.ack ? NS + '-ack ' : '') + (o.kind || 'info'));
      box.setAttribute('role', o.role || 'status'); setDir(box);
      box.append(tile(o.kind === 'notice' ? 'info' : (o.kind || 'info')), el('div', 'ss-title', o.title || ''));
      if (o.body) box.append(el('div', 'ss-body', o.body));
      const acts = el('div', 'ss-acts');
      for (const a of (o.actions || [])) { const b = button(a.cls || '', a.label, { primary: !!a.primary }); onTrustedClick(b, () => { a.onClick && a.onClick(); if (a.closes !== false) close(); }); acts.appendChild(b); }
      if (o.muteKind && o.onMute && canStore()) { const m = button('ss-mute', t('dontWarnHere', null, "Don't warn me on this site"), { quiet: true }); onTrustedClick(m, () => { close(); o.onMute(); }); acts.appendChild(m); }
      // (0.15.0) mistake control: only when the caller can actually report; omitted otherwise.
      if (typeof o.onReport === 'function') { const r = button('ss-report', t('reportMistake', null, 'Report a mistake'), { quiet: true }); onTrustedClick(r, () => { r.textContent = t('thanks', null, 'Thanks'); r.disabled = true; o.onReport(); }); acts.appendChild(r); }
      const x = button('ss-x', '✕'); x.setAttribute('aria-label', t('ariaDismiss', null, 'Dismiss')); onTrustedClick(x, close); acts.appendChild(x);
      box.appendChild(acts);
      if (!o.persist) { const p = el('div', 'ss-prog'); p.setAttribute('aria-hidden', 'true'); p.appendChild(el('i')); box.appendChild(p); }
      return box;
    }, { topLayer: 'popover', theme });
    // The auto-hide goes through close() so o.onClose fires whether dismissed or timed out.
    if (!o.persist) tm = timer(box, o.timeoutMs || 10000, close);
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
    // Fix round 2: built through button() so it gets type="button" (no stray
    // form submits) and .ss-btn styling here, once, instead of every call site
    // remembering to classList.add('ss-btn') afterwards.
    const btn = button('ss-copy', t('copyReportBtn', null, 'Copy report'));
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
    // (0.15.0) the banner lives in a shadow host now; its menu teardown is module state, not a DOM property.
    if (bannerTeardown) { bannerTeardown(); bannerTeardown = null; }
    surfaces().unmount('banner');
    // 0.14.1: never the wallet overlay — removing it without a decision would
    // strand (and, on the MAIN side, eventually fail open) a pending request.
    // (0.15.0) The interstitial and the other dialogs are shadow-hosted <dialog>s; unmounting restores body.inert.
    surfaces().unmount('interstitial');
    if (!walletOpen) surfaces().unmount('dialog');
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
  // 0.14.1: on a bare tenant apex ('wordpress.com') the worker refuses to store
  // a trust / pause / mute (it would cover every tenant), so no surface may
  // offer a control that would be refused.
  function canStore() {
    try { const SS = root.ScamShield; return !(SS && SS.isTenantApex && SS.isTenantApex(regDomain())); } catch (_) { return true; }
  }
  function regDomain() {
    try {
      const SS = root.ScamShield;
      // 0.14.1: scopeDomain, not registrableDomain — trusting evil.pages.dev
      // must not trust every site on pages.dev.
      if (SS && typeof SS.scopeDomain === 'function') return SS.scopeDomain(location.hostname);
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
    let text, onUndo, restore, onReport;
    if (arg && typeof arg === 'object') {
      text = arg.text; onUndo = arg.onUndo; restore = arg.restore; onReport = arg.onReport;
    } else {
      const domain = arg;
      text = t('ackTrusted', [bidi(domain)], "ScamShield won't flag " + domain + ' again.');
      onUndo = () => send('untrustSite', { domain });
      restore = restoreArg;
    }
    // Built on the same toast() primitive as every other surface (tile 'ok',
    // title, .ss-undo action). Fix round 1: ADD the .scamshield-ack class
    // rather than replacing the root class outright — .ss-title's font-weight
    // and .ss-acts's flex layout in content.css are scoped under
    // `.scamshield-toast .ss-X`, so dropping `scamshield-toast` silently lost
    // both. Keeping both classes means `.scamshield-ack` (which is declared
    // after the shared `.scamshield-toast,.scamshield-ack` rule in
    // content.css) still wins the grid-template-columns override.
    // Fix round 2: the bar auto-hides after 10s instead of persisting forever —
    // it is an acknowledgement, not a warning, and a permanently parked bar in
    // the corner of every trusted page is its own nuisance. timer()'s WCAG
    // 2.2.1 pause-on-hover/focus still applies, so Undo is always reachable
    // for as long as the user is actually pointing at or tabbed into it.
    const bar = toast({
      ack: true, kind: 'ok', timeoutMs: 10000, title: text,
      // (0.15.0, Task 18) "This site is fine" reports silently; this optional button sends the deliberate report
      // (non-quiet, so it may open the GitHub issue when community reporting is off). toast() renders it behind onTrustedClick.
      onReport: typeof onReport === 'function' ? () => onReport({ explicit: true }) : undefined,
      actions: [{ cls: 'ss-undo', label: t('undo', null, 'Undo'), onClick: async () => { await onUndo(); restore && restore(); } }]
    });
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
    // Fix round 2: on the danger banner the trust button lives inside the ⋯ menu, so it is unreachable (hidden)
    // until the menu opens — by then the 300ms arm has long since elapsed and the guard protects nothing. The
    // caller re-arms it (btn.__ssRearm) at the moment it becomes reachable.
    if (onAllow) armedClick(btn, onAllow);
    return btn;
  }
  // Arms a control against instant clicks: ignores a (trusted) click until TRUST_ARM_MS after render, and
  // after every __ssRearm() (see trustButton for why the menu re-arms on open). Shared by "Trust this
  // site" and "This site is fine", the two controls that allowlist the site from a banner.
  function armedClick(btn, onAllow) {
    let armedAt = performance.now();
    btn.__ssRearm = () => { armedAt = performance.now(); };
    onTrustedClick(btn, (e) => { if (performance.now() < armedAt + TRUST_ARM_MS) return; onAllow(e); });
    return btn;
  }
  // The open banner's menu teardown (document-level listeners), reachable from clearAll().
  let bannerTeardown = null;
  let walletOpen = false; // the 'dialog' host currently holds a pending wallet confirmation (clearAll must not drop it)
  function showBanner(verdict, extra) {
    const S = surfaces();
    if (S.isMounted('banner')) return;
    const x = extra || {}; const danger = verdict.level === 'dangerous';
    let closeMenu = () => {};
    // (0.15.0, Task 12) Built inside the 'banner' shadow host: a floating card at the top centre on >=600px and
    // a bottom sheet on phones (content/surfaces/styles.js). Hiding unmounts the host.
    S.mount('banner', () => {
      const bar = el('div', NS + '-banner ' + (danger ? 'danger' : 'suspicious'));
      bar.setAttribute('role', danger ? 'alert' : 'status'); setDir(bar);
      const text = el('div', 'ss-text');
      const head = verdict.brandLabel ? (danger ? t('bannerDangerBrand', [bidi(verdict.brandLabel)], 'Dangerous page — looks like ' + verdict.brandLabel + ", but isn't") : t('bannerTakeCare', null, 'Take care on this site')) : (danger ? t('bannerDanger', null, 'Dangerous page') : t('bannerTakeCare', null, 'Take care on this site'));
      const reason = el('span', 'ss-reason', reasonText(verdict.reasons[0]) || (danger ? t('popupDangerSummary', null, "Don't enter passwords or card details here.") : t('popupSuspiciousSummary', null, 'Take care before typing anything here.')));
      text.append(el('b', null, head), reason);
      // "Why?" toggles the extra reasons (aria-expanded) instead of being a one-way reveal.
      const more = (verdict.reasons || []).slice(1, 4);
      if (more.length) {
        const why = el('button', 'ss-why', t('whyShort', null, 'Why?')); why.type = 'button'; why.setAttribute('aria-expanded', 'false');
        const ul = el('ul', 'ss-why-list'); ul.hidden = true; for (const r of more) ul.appendChild(el('li', null, reasonText(r)));
        onTrustedClick(why, () => { ul.hidden = !ul.hidden; why.setAttribute('aria-expanded', ul.hidden ? 'false' : 'true'); });
        reason.appendChild(why); text.appendChild(ul);
      }
      bar.append(tile(danger ? 'danger' : 'warn'), text);
      const acts = el('div', 'ss-acts'); const menu = el('div', 'ss-menu'); menu.setAttribute('role', 'menu'); menu.hidden = true;
      const dismiss = () => { closeMenu(); S.unmount('banner'); };
      const leave = button('ss-leave', t('leaveThisPage', null, 'Leave this page')); onTrustedClick(leave, () => { closeMenu(); x.onLeave ? x.onLeave() : history.back(); });
      const rescue = verdict.brandUrl ? button('ss-rescue', t('takeMeToReal', [bidi(verdict.brandLabel || 'site')], 'Take me to the real ' + (verdict.brandLabel || 'site')), { primary: true }) : null;
      if (rescue) onTrustedClick(rescue, () => { closeMenu(); location.href = verdict.brandUrl; });
      // `noTrust` (the QR-scan surface) renders no trust control: the page and the flagged destination are
      // different domains, so a click must never allowlist the QR's possibly-scam destination.
      const trustable = !x.noTrust && canStore();
      const ack = (domain, restore, onReport) => ackSurface({ text: t('ackTrusted', [bidi(domain)], "ScamShield won't flag " + domain + ' again.'), onUndo: () => send('untrustSite', { domain }), restore, onReport });
      const trust = trustable ? trustButton(async () => { dismiss(); const domain = regDomain(); await send('trustSite', { domain, via: x.trustVia || 'banner' }); ack(domain, () => showBanner(verdict, Object.assign({}, extra, { restore: true }))); }) : null;
      // "This site is fine" (0.15.0, Task 12): the mistake control. It reports (userReport false_positive +
      // falseAlarm via x.onReport), THEN trusts the site (via:'mistake') and shows the ack with Undo. Because it
      // allowlists, it passes the same gates as Trust: isTrusted + insideCard (onTrustedClick) and the arm
      // delay, which restarts each time the menu opens. Where trust is unavailable (QR surface, bare tenant
      // apex) it stays the report-only "Report a mistake".
      const fine = button('ss-report', trustable ? t('mistakeSiteFine', null, 'This site is fine') : t('reportMistake', null, 'Report a mistake'));
      if (trustable) {
        armedClick(fine, async () => { dismiss(); x.onReport && x.onReport({ quiet: true }); const domain = regDomain(); await send('trustSite', { domain, via: 'mistake' }); ack(domain, () => showBanner(verdict, Object.assign({}, extra, { restore: true })), x.onReport); });
      } else {
        onTrustedClick(fine, () => { fine.textContent = t('thanks', null, 'Thanks'); fine.disabled = true; x.onReport && x.onReport(); closeMenu(true); });
      }
      const copyBtn = copyReportButton(verdict); onTrustedClick(copyBtn, () => closeMenu(true));
      // Visible row (Hick): danger = filled primary (rescue, else Leave) + outlined Leave (when rescue is primary) + ⋯ + ✕;
      // suspicious = outlined Trust + ⋯ + ✕ (nothing filled on a suspicious page). Trust (danger), "This site is fine", Copy live in the menu.
      if (danger) { if (rescue) { acts.append(rescue, leave); } else { leave.classList.add('primary'); acts.appendChild(leave); } if (trust) menu.appendChild(trust); }
      else if (trust) acts.appendChild(trust);
      menu.append(fine, copyBtn);
      // (0.15.0, Task 19) role=menuitem only on what really sits inside the role=menu: on the suspicious banner Trust is a plain
      // button in the visible row, and a menuitem outside a menu is an axe 'aria-required-parent' (critical) violation.
      for (const b of [trust, fine, copyBtn]) if (b && menu.contains(b)) b.setAttribute('role', 'menuitem');
      // The brand comparison sits INSIDE .ss-text under the reason (second line only when a brand is known).
      if (verdict.brandLabel && verdict.brandUrl) { const cmp = compareRow(verdict.brandLabel, verdict.brandUrl); if (cmp) text.appendChild(cmp); }
      const moreBtn = button('ss-more', '⋯'); moreBtn.setAttribute('aria-label', t('moreActions', null, 'More actions')); moreBtn.setAttribute('aria-haspopup', 'menu'); moreBtn.setAttribute('aria-expanded', 'false');
      const items = () => Array.from(menu.querySelectorAll('[role=menuitem]')).filter((b) => !b.disabled);
      // Menu keyboard model (0.15.0): ArrowUp/Down move (wrapping), Home/End jump, Escape closes, and focus
      // returns to the ⋯ trigger on close. Keys count only when trusted (page script can dispatch KeyboardEvents).
      // The document listeners exist only while the menu is open and are removed on every exit path (item
      // activation, Trust/Leave/rescue, ✕, clearAll()), so a long-lived tab never accumulates them.
      const onDoc = (e) => { const path = e.composedPath ? e.composedPath() : []; if (!path.includes(acts)) closeMenu(); };
      const onKey = (e) => {
        if (!e.isTrusted) return;
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
        const list = items(); if (!list.length) return;
        const at = list.indexOf(bar.getRootNode().activeElement);
        let next = null;
        if (e.key === 'ArrowDown') next = list[(at + 1) % list.length];
        else if (e.key === 'ArrowUp') next = list[(at <= 0 ? list.length : at) - 1];
        else if (e.key === 'Home') next = list[0];
        else if (e.key === 'End') next = list[list.length - 1];
        if (next) { e.preventDefault(); next.focus(); }
      };
      closeMenu = (refocus) => {
        const wasOpen = !menu.hidden;
        menu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey, true);
        if (refocus === true && wasOpen) { try { moreBtn.focus(); } catch (_) {} }
      };
      bannerTeardown = () => closeMenu();
      onTrustedClick(moreBtn, () => {
        if (!menu.hidden) { closeMenu(true); return; }
        menu.hidden = false; moreBtn.setAttribute('aria-expanded', 'true');
        for (const b of [trust, fine]) b && b.__ssRearm && b.__ssRearm(); // unreachable until now, so the arm window restarts here
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => { document.addEventListener('click', onDoc, true); }, 0); // not the click that opened it
        const first = items()[0]; if (first) first.focus();
      });
      // ArrowDown on the trigger opens the menu too (Enter/Space already click it).
      moreBtn.addEventListener('keydown', (e) => { if (e.isTrusted && e.key === 'ArrowDown' && menu.hidden) { e.preventDefault(); moreBtn.click(); } });
      // (0.14.1) The ✕ says what it does. On a bare tenant apex canStore() is false, so ✕ only dismisses
      // this page (nothing is stored) and must not claim "for a day/an hour": it keeps the generic label.
      // (0.15.0) The label text is visible from 600px; on a phone the ✕ is a 44px icon button and the
      // aria-label (always present) carries the meaning.
      const choice = danger ? '1h' : '1d';
      const closeLabel = !canStore() ? t('ariaDismiss', null, 'Dismiss') : danger ? t('bannerHideHour', null, 'Hide for an hour') : t('bannerHideDay', null, 'Hide for a day');
      const close = button('ss-x', ''); const glyph = el('span', 'ss-x-glyph', '✕'); glyph.setAttribute('aria-hidden', 'true'); close.append(glyph, el('span', 'ss-x-label', closeLabel));
      close.setAttribute('aria-label', closeLabel); close.title = closeLabel;
      onTrustedClick(close, () => { dismiss(); if (x.onDismiss) { try { x.onDismiss(); } catch (_) {} } /* (0.15.0, Task 17b) always, even where nothing is stored: a mid-scroll rescan must not re-show it */ if (!x.noTrust && x.onHide && canStore()) x.onHide(choice); });
      acts.append(moreBtn, close, menu); bar.appendChild(acts);
      return bar;
    }, { topLayer: 'popover', theme, onShown: x.restore ? undefined : x.onShown }); // (0.15.0) an Undo restore is not a new showing: no second surface-log row
  }

  // --- Modal dialogs (0.15.0, Task 13) -----------------------------------------
  // The interstitial and the form-guard / wallet / tech-scam dialogs are native <dialog>s opened with
  // showModal() inside a shadow host (content/surfaces/primitives.js): top layer, the rest of the page inert
  // natively, Tab trapped, focus returned. On top of that:
  //  - body.inert is also set (and the PREVIOUS value restored), so assistive tech and page script focus can't
  //    reach the page. The host sits on <html>, not in <body>, so the dialog itself stays interactive. A counter
  //    makes the LAST dialog to close restore it if two ever stack.
  //  - a page script that closes the dialog (dialog.close(), Escape twice without a gesture) is undone: we track
  //    our own closes with a flag and re-showModal() after any other close, at most 3 times; after that the
  //    surface is torn down cleanly (inert restored) rather than left half-open.
  //  - Escape arrives as the dialog `cancel` event (and a trusted keydown); each surface maps it to its old
  //    Escape behaviour, or none (the interstitial is a stop page, not dismissible).
  let inertDepth = 0, inertPrev = false;
  function inertOn() {
    const b = document.body;
    if (!b) return; // nothing to make inert yet: do not count a hold we cannot release
    if (inertDepth++ > 0) return;
    try { inertPrev = b.inert === true; b.inert = true; } catch (_) {}
  }
  function inertOff() {
    if (inertDepth === 0) return;
    if (--inertDepth > 0) return;
    try { const b = document.body; if (b) b.inert = inertPrev; } catch (_) {}
  }
  // Safety net: if the page is inert by us but no modal is mounted any more (a dialog torn down by a path we did not
  // see, a bfcache restore), give the page back. Not while an escalation to blocked.html is in flight.
  let escalating = false;
  function inertSweep() {
    try {
      if (inertDepth === 0 || escalating) return;
      const S = root.ScamShield && root.ScamShield.surfaces;
      if (S && (S.isMounted('interstitial') || S.isMounted('dialog'))) return;
      inertDepth = 0; if (document.body) document.body.inert = inertPrev;
    } catch (_) {}
  }
  try { window.addEventListener('pageshow', inertSweep); document.addEventListener('visibilitychange', inertSweep); } catch (_) {}
  // A sub-frame under 200x200 CSS px (an ad / captcha frame) has no room for a dialog; the service worker
  // already handles the badge and the stop for frames, so the frame itself shows nothing.
  function tinyFrame() {
    try { return window !== window.top && (window.innerWidth < 200 || window.innerHeight < 200); } catch (_) { return true; }
  }
  const FOCUSABLE = 'button, summary, a[href], input, select, textarea, [tabindex]';
  // o: { role, label, onEscape(ctl), onGiveUp(ctl), onDetached(), onUnmount(), onShown() }
  // fill(dialog, ctl) builds the card, appends it to the dialog and returns { card, safe } (the .ss-card, and the
  // control that takes initial focus: the safe action).
  function modal(kind, cls, o, fill) {
    const S = surfaces();
    let dlg = null, safe = null, handle = null, ours = false, held = false, hold = false, reopened = 0;
    const release = () => { if (held) { held = false; inertOff(); } };
    const ctl = {
      dialog: null,
      close() {
        ours = true;
        try { if (dlg && dlg.open) dlg.close(); } catch (_) {}
        if (!hold) release();
        if (handle) handle.close(); else S.unmount(kind);
      }
    };
    const show = () => {
      if (!dlg || !dlg.isConnected || ours) return;
      try { if (document.fullscreenElement && document.exitFullscreen) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); } } catch (_) {}
      try {
        // A host the page removed and we re-attached keeps `open` but lost its modal state.
        if (dlg.hasAttribute('open') && !dlg.matches(':modal')) dlg.removeAttribute('open');
        if (!dlg.open) dlg.showModal();
      } catch (_) {}
      if (!held && dlg.open) { held = true; inertOn(); } // only count a hold the dialog really took
      try { if (safe) safe.focus(); } catch (_) {}
    };
    const focusables = () => Array.from(dlg.querySelectorAll(FOCUSABLE)).filter((n) => {
      if (n.disabled || n.getAttribute('tabindex') === '-1') return false;
      const d = n.closest('details');
      if (d && !d.open && !(n.tagName === 'SUMMARY' && n.parentNode === d)) return false; // folded away
      return n.getClientRects().length > 0;
    });
    // The native modal dialog already keeps Tab inside, but it can hand focus to the browser UI; wrap explicitly.
    const trap = (e) => {
      const list = focusables(); if (!list.length) return;
      const act = dlg.getRootNode().activeElement;
      const at = list.indexOf(act);
      if (e.shiftKey) { if (at <= 0) { e.preventDefault(); list[list.length - 1].focus(); } }
      else if (at === -1 || at === list.length - 1) { e.preventDefault(); list[0].focus(); }
    };
    // Defeated by page script (closed past 3 reopenings, or host re-attach cap): let the surface escalate (the
    // interstitial asks the SW for blocked.html) and keep body.inert until that navigation, with a timed release as fallback.
    const escalate = () => {
      if (typeof o.onGiveUp !== 'function' || hold) return;
      hold = true; escalating = true; o.onGiveUp(ctl);
      setTimeout(() => { hold = false; escalating = false; release(); }, 4000);
    };
    const esc = () => { if (!ours && typeof o.onEscape === 'function') o.onEscape(ctl); };
    handle = S.mount(kind, () => {
      dlg = el('dialog', cls);
      if (o.role) dlg.setAttribute('role', o.role);
      if (o.label) dlg.setAttribute('aria-label', o.label);
      setDir(dlg);
      const built = fill(dlg, ctl);
      safe = built.safe;
      dlg.addEventListener('keydown', (e) => {
        if (!e.isTrusted) return; // a page can dispatch KeyboardEvents; only real keys count
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); esc(); }
        else if (e.key === 'Tab') trap(e);
      });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (e.isTrusted) esc(); });
      dlg.addEventListener('close', () => {
        if (ours) return;
        if (reopened < 3) { reopened++; show(); return; }
        escalate();
        ctl.close();
      });
      return { el: dlg, card: built.card };
    }, {
      theme, onShown: o.onShown, onAttach: show, onDetached: o.onDetached, onGaveUp: escalate,
      onUnmount: () => { ours = true; if (!hold) release(); if (typeof o.onUnmount === 'function') o.onUnmount(); }
    });
    ctl.dialog = dlg;
    show();
    return ctl;
  }
  function trustAck(domain, restore, onReport) {
    return ackSurface({ text: t('ackTrusted', [bidi(domain)], "ScamShield won't flag " + domain + ' again.'), onUndo: () => send('untrustSite', { domain }), restore, onReport });
  }

  // Full-page interstitial (0.6.0) — the interaction-blocking tier, reserved
  // for near-zero-false-positive detections (decisive flags and the guard
  // detectors). Research: active warnings are heeded by ~79% vs ~20-30% for
  // passive banners, but false positives burn trust — so this only ever fires
  // on signals with an essentially zero legitimate base rate. The headline
  // varies mildly between showings (polymorphism resists habituation) and the
  // escape hatch is delayed a few seconds.
  // (0.15.0, Task 13) A <dialog> in the 'interstitial' shadow host. The "Continue to this site (unsafe)" countdown
  // starts when Details is OPENED (not at build, when nobody can see it), and Trust / "This site is fine" re-arm on
  // every toggle. Escape does nothing: this is a stop page.
  function dangerInterstitial(verdict, x) {
    const S = surfaces();
    if (S.isMounted('interstitial') || tinyFrame()) return;
    x = x || {};
    const HEADS = [
      t('interstitialHead1', null, 'Stop — this page is trying to scam you'),
      t('interstitialHead2', null, 'Hold on — this looks like a scam page'),
      t('interstitialHead3', null, "Don't go further — scam warning")
    ];
    const trustable = !x.noTrust && canStore();
    modal('interstitial', NS + '-overlay ' + NS + '-interstitial', { role: 'alertdialog', label: t('ariaScamWarning', null, 'Scam warning'), onEscape: null, onGiveUp: () => { send('escalateBlocked', { url: location.href }); } }, (dlg, ctl) => {
      const card = el('div', 'ss-card'); const head = el('div', 'ss-head'); const h3 = el('h3', null, HEADS[Math.floor(Math.random() * HEADS.length)]); head.append(tile('danger'), h3); card.append(head);
      card.append(el('p', 'ss-lead', reasonText(verdict.reasons[0]) || t('interstitialFallback', null, 'This page matches the pattern of a known scam.')));
      // Address box, same as blocked.html: label + the page URL, LTR-isolated.
      const addr = el('div', 'ss-addr'); addr.append(el('small', null, t('thisPage', null, 'This page')), el('code', null, location.href.slice(0, 200))); card.append(addr);
      if (verdict.brandLabel && verdict.brandUrl) { const cmp = compareRow(verdict.brandLabel, verdict.brandUrl); if (cmp) card.appendChild(cmp); }
      const ul = el('ul', 'ss-evidence'); for (const r of (verdict.reasons || []).slice(1, 4)) { const li = el('li'); li.append(el('span', 'ss-chip', t('chipWhy', null, 'Why')), el('span', null, reasonText(r))); ul.appendChild(li); } if (ul.children.length) card.appendChild(ul);
      card.append(el('p', 'ss-sub', t('interstitialReassure', null, "If you already typed a password or card number on this page, change it now.")));
      const actions = el('div', 'ss-actions'); const leave = button('ss-primary', t('leaveThisPage', null, 'Leave this page')); onTrustedClick(leave, () => { x.onLeave ? x.onLeave() : history.back(); }); actions.append(leave);
      const copyBtn = copyReportButton(verdict); actions.append(copyBtn);
      // Fix round 2: append, not prepend — the row reads Leave, Copy report,
      // "Go to the real site", so the recommended action stays first.
      if (verdict.brandUrl) { const rescue = button('ss-rescue-ghost', t('takeMeToReal', [bidi(verdict.brandLabel || 'site')], 'Go to the real ' + (verdict.brandLabel || 'site'))); onTrustedClick(rescue, () => { location.href = verdict.brandUrl; }); actions.append(rescue); }
      card.append(actions);
      const details = el('details', 'ss-details'); const sum = el('summary', null, t('detailsAndOptions', null, 'Details and other options')); details.append(sum);
      const row1 = el('div', 'ss-dt');
      const stayLabel = t('continueUnsafe', null, 'Continue to this site (unsafe)');
      const stay = button('ss-danger-ghost', stayLabel); stay.disabled = true; // armed (3 s) each time Details opens
      // Continue = pause this site for 1 hour (the block page's "Visit anyway" rule), never a permanent trust.
      onTrustedClick(stay, () => { ctl.close(); if (canStore()) send('pauseSite', { domain: regDomain(), choice: '1h' }); if (x.onDismiss) x.onDismiss(); });
      // 0.14.1: on a bare tenant-apex host nothing is stored (canStore() false), so Continue only proceeds once.
      const consequence = canStore() ? t('continuePausesHour', null, 'Pauses ScamShield on this site for 1 hour.') : t('continueOnce', null, 'Continues to this page once. ScamShield stays on.');
      row1.append(stay, el('span', 'ss-consequence', consequence)); details.append(row1);
      const row2 = el('div', 'ss-dt');
      const trust = trustable ? trustButton(async () => { ctl.close(); const domain = regDomain(); await send('trustSite', { domain, via: x.trustVia || 'interstitial' }); trustAck(domain, () => dangerInterstitial(verdict, x)); }) : null;
      if (trust) { trust.className = 'ss-trust ss-trust-link'; trust.textContent = t('blockedTrustSite', null, 'Not a scam? Trust this site'); row2.append(trust); }
      // "This site is fine" (0.15.0, Task 12): reports, THEN trusts (via:'mistake') with an Undo ack, behind the same gates as Trust.
      // Where trust is unavailable (bare tenant apex, QR surface) it stays the report-only "Report a mistake".
      const fine = el('button', 'ss-report', trustable ? t('mistakeSiteFine', null, 'This site is fine') : t('reportMistake', null, 'Report a mistake')); fine.type = 'button';
      if (trustable) armedClick(fine, async () => { ctl.close(); x.onReport && x.onReport({ quiet: true }); const domain = regDomain(); await send('trustSite', { domain, via: 'mistake' }); trustAck(domain, () => dangerInterstitial(verdict, x), x.onReport); });
      else onTrustedClick(fine, () => { fine.textContent = t('thanks', null, 'Thanks'); fine.disabled = true; x.onReport && x.onReport(); });
      row2.append(fine); details.append(row2); card.append(details);
      let stopCount = null;
      details.addEventListener('toggle', () => {
        if (stopCount) { stopCount(); stopCount = null; }
        if (details.open) {
          stopCount = armDelayed(stay, 3);
          for (const b of [trust, fine]) b && b.__ssRearm && b.__ssRearm(); // the arm window restarts whenever Details opens
        } else { stay.disabled = true; stay.textContent = stayLabel; }
      });
      // 0.14.1: not blockedFooter — that text says nothing was sent, which is true of blocked.html only.
      card.append(el('p', 'ss-foot', t('interstitialFooter', null, "ScamShield checked this page on your device.")));
      dlg.append(card);
      return { card, safe: leave };
    });
  }

  // One-time-ever, shown 1.5s after a dangerous page was blocked. Controller
  // ruling: must never appear over an open trust acknowledgement — that toast
  // fires right when a "Trust this site" click is landing, and wiping the
  // Undo bar out from under the user would be far worse than skipping the ask.
  function supportToast() {
    if (surfaces().isMounted('toast') || surfaces().isMounted('ack') || surfaces().isMounted('interstitial') || surfaces().isMounted('dialog')) return false; // (0.15.0) a toast behind a modal dialog is inert
    toast({
      kind: 'ok', title: t('toastSupportAsk', null, 'ScamShield just protected you — it’s free and runs on your device. Chip in? ❤'),
      actions: [{ cls: 'ss-support', label: t('supportOpen', null, 'Open'), onClick: () => window.open('https://github.com/sponsors/joelstephen97', '_blank', 'noopener') }],
      timeoutMs: 20000
    });
    return true;
  }
  // (0.15.0, Task 13) Top-frame explanation for a credential form a tiny sub-frame blocked silently.
  function frameFormBlockedToast(onShown) {
    toast({ kind: 'danger', role: 'alert', title: t('frameFormBlocked', null, 'ScamShield blocked a sign-in form inside an embedded frame because it sends your password to another site'), timeoutMs: 15000 });
    if (typeof onShown === 'function') onShown();
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
  // (0.15.0, Task 13) The overlay is a <dialog> in the 'dialog' shadow host; `onShown` is called once per real
  // showing (the surface log), so callers no longer count DOM nodes around the submit.
  function guardForms(foreignForms, reasons, onReport, onShown) {
    foreignForms.forEach((form) => {
      if (form.__scamshieldGuarded) return;
      form.__scamshieldGuarded = true;
      const onSubmit = (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        // No room for a dialog in a tiny frame (an ad / hidden iframe): the credential POST is still blocked, silently,
        // the stop verdict goes to the SW (badge + history) and the TOP frame, which has room, is told so it can explain.
        if (tinyFrame()) {
          const rs = Array.isArray(reasons) ? reasons : [];
          send('reportVerdict', { verdict: { level: 'dangerous', score: 0.9, reasons: rs, reasonCodes: rs.map((r) => r && r.code).filter(Boolean), flags: ['credential-form-foreign-domain'], modelUsed: false }, subframe: true, tier: 'stop' });
          send('relayToTop', { kind: 'frameFormBlocked' });
          return;
        }
        const S = surfaces();
        if (S.isMounted('dialog') || S.isMounted('interstitial')) return;
        let dest = '';
        try { dest = new URL(form.getAttribute('action') || location.href, location.href).hostname; } catch (_) {}
        modal('dialog', NS + '-overlay', {
          role: 'dialog', label: t('ariaPhishingWarning', null, 'Possible phishing warning'),
          onEscape: (ctl) => ctl.close(),
          onShown: () => { if (typeof onShown === 'function') onShown('form-guard'); }
        }, (dlg, ctl) => {
          const card = el('div', 'ss-card');
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
          // Fix round 2: all three controls are trusted-click guarded like every
          // other in-page control. The armDelayed() countdown alone was not
          // enough — page script could simply wait out the 3s and then
          // .click() "Submit anyway" itself, posting the password to the
          // attacker's host with no user involvement at all.
          onTrustedClick(back, () => ctl.close());
          const go = button('ss-danger-ghost', t('submitAnyway', null, 'Submit anyway'));
          armDelayed(go, 3);
          // form.submit() here runs the isolated world's native (unhooked) method,
          // so it really submits without re-triggering this guard.
          onTrustedClick(go, () => { ctl.close(); form.submit(); });
          actions.append(back, go);
          const rep = button('ss-report', t('reportMistake', null, 'Report a mistake')); onTrustedClick(rep, () => { rep.textContent = t('thanks', null, 'Thanks'); rep.disabled = true; onReport && onReport(); }); actions.prepend(rep);
          card.append(actions); dlg.append(card);
          return { card, safe: back };
        });
      };
      form.addEventListener('submit', onSubmit, true);
      form.addEventListener('scamshield:formsubmit', onSubmit, true);
    });
  }

  // Returns how many blocks were newly hidden (already-hidden nodes are skipped), so the caller logs the surface
  // from this count instead of counting DOM nodes before and after (0.15.0).
  function hideScamBlocks(blocks) {
    let n = 0;
    blocks.forEach((node) => {
      if (node.classList.contains(NS + '-hidden-block')) return;
      n++;
      node.classList.add(NS + '-hidden-block');
      const tag = el('div', NS + '-hidden-tag', t('guardHiddenTag', null, 'Hidden by ScamShield'));
      setDir(tag);
      node.appendChild(tag);
    });
    return n;
  }

  // (0.15.0, Task 13) A <dialog> in the 'dialog' host. Every way it can end without a trusted "Proceed anyway"
  // is a denial, never an approval: Cancel, Escape, the page removing the host (onDetached returns false so the
  // primitive does not re-attach it) and the page closing the dialog more than 3 times. `onReport` (optional)
  // adds the report-only "Report a mistake".
  function walletConfirmOverlay(detail, onDecision, onReport) {
    const S = surfaces();
    // A frame too small for a dialog cannot ask: deny (synthetic, like a collision), never approve.
    if (tinyFrame()) { onDecision(false, { collision: true }); return; }
    if (S.isMounted('dialog') || S.isMounted('interstitial')) {
      // Another warning is already on screen. Deny, never silently approve —
      // a drainer could fire a decoy request first and slip the real one
      // through the collision path. The dApp receives a standard user-rejected
      // error (4001) and can simply retry. collision:true tells the bridge
      // this denial is synthetic, not a user-confirmed threat.
      toast({ kind: 'warn', role: 'alert', title: t('guardWalletCollision', null, 'ScamShield blocked a wallet request while another warning was open. Close it and retry.'), timeoutMs: 12000 });
      onDecision(false, { collision: true });
      return;
    }
    let decided = false;
    const decide = (allow) => { if (decided) return; decided = true; walletOpen = false; onDecision(allow); };
    walletOpen = true;
    const ctl = modal('dialog', NS + '-overlay ' + NS + '-wallet', {
      role: 'dialog', label: t('walletRiskyTitle', null, 'Risky wallet request'),
      onEscape: () => { decide(false); ctl.close(); },
      onDetached: () => false,       // removed by page script = denied (0.14.1), not re-attached
      onUnmount: () => decide(false) // any other end without a trusted decision is a denial too
    }, (dlg, c) => {
      const card = el('div', 'ss-card');
      const head = el('div', 'ss-head'); const h3 = el('h3', null, t('walletRiskyTitle', null, 'Risky wallet request')); head.append(tile('warn'), h3);
      card.append(head,
        el('p', null, reasonText(detail.reasons && detail.reasons[0]) || t('guardWalletFallback', null, 'This site is requesting a sensitive wallet action.')),
        el('p', 'ss-sub', t('walletRiskyBody', null, 'If you did not expect this, cancel. Drainers use these requests to steal your crypto.')));
      const actions = el('div', 'ss-actions');
      const cancel = button('ss-primary', t('cancelRecommended', null, 'Cancel (recommended)'));
      const proceed = button('ss-danger-ghost', t('proceedAnyway', null, 'Proceed anyway'));
      armDelayed(proceed, 3);
      const done = (allow) => { decide(allow); c.close(); };
      // Fix round 2: trusted-click guarded — a drainer page must not be able to
      // .click() "Proceed anyway" for the user once the 3s arm has elapsed.
      onTrustedClick(cancel, () => done(false));
      onTrustedClick(proceed, () => done(true));
      actions.append(cancel, proceed);
      if (typeof onReport === 'function') { const rep = button('ss-report', t('reportMistake', null, 'Report a mistake')); onTrustedClick(rep, () => { rep.textContent = t('thanks', null, 'Thanks'); rep.disabled = true; onReport(); }); actions.append(rep); }
      card.append(actions); dlg.append(card);
      return { card, safe: cancel };
    });
    // Tell the MAIN-world hook the warning is on screen so its 8 s fail-open
    // timer stops and the request waits for the user.
    // (0.14.1) cloneInto on Firefox so the MAIN-world hook can read detail.id
    // (Xray wrappers otherwise throw "Permission denied"); Chrome has no cloneInto.
    try {
      const d = { id: detail.id };
      window.dispatchEvent(new CustomEvent('scamshield:wallet-ack', { detail: typeof cloneInto === 'function' ? cloneInto(d, window) : d }));
    } catch (_) {}
  }

  // (0.15.0, Task 15) Live link guard confirm: a click on a link marked block/warn lands here instead of
  // navigating. A <dialog> in the 'dialog' host; "Go back" is the default focus, and every way out except a
  // trusted "Open anyway" (Escape, page removing the host, closing it) leaves the user where they were.
  // o: { level: 'block'|'warn', host, onOpen(), onShown() }. Returns false when it could not be shown (another
  // dialog is up, or a frame too small): the caller then lets the click through un-prompted only for warn.
  function linkConfirmAvailable() { const S = surfaces(); return !(tinyFrame() || S.isMounted('dialog') || S.isMounted('interstitial')); }
  // A blocked link stays blocked when the confirm cannot be shown; this says so. The toast host is a popover (top
  // layer, opened after any dialog), so it shows over an open dialog too.
  function linkBlockedToast() {
    if (tinyFrame()) return false;
    toast({ kind: 'danger', role: 'alert', title: t('linkBlockedToast', null, 'Blocked link \u2014 ScamShield stopped it'), timeoutMs: 6000 });
    return true;
  }
  // (0.15.0, Task 16) A page tried to open a blocked site (or, on a warned page, a popunder / forced fullscreen).
  function popupBlockedToast() {
    if (tinyFrame()) return false;
    toast({ kind: 'danger', role: 'alert', title: t('popupBlockedToast', null, 'ScamShield stopped this page from opening a blocked site'), timeoutMs: 6000 });
    return true;
  }
  function popunderBlockedToast() {
    if (tinyFrame()) return false;
    toast({ kind: 'danger', role: 'alert', title: t('popunderBlockedToast', null, 'ScamShield stopped this page from opening a new window'), timeoutMs: 6000 });
    return true;
  }
  function linkConfirm(o) {
    const S = surfaces();
    if (!linkConfirmAvailable()) return false;
    const block = o.level === 'block';
    const title = block
      ? t('linkConfirmBlock', null, "This link goes to a site on ScamShield's block list")
      : t('linkConfirmWarn', null, 'This link looks risky');
    const ctl = modal('dialog', NS + '-overlay ' + NS + '-linkconfirm', {
      role: 'alertdialog', label: title,
      onEscape: () => ctl.close(),
      onDetached: () => false, // removed by page script = stay on the page
      onShown: o.onShown
    }, (dlg, c) => {
      const card = el('div', 'ss-card');
      const head = el('div', 'ss-head'); head.append(tile(block ? 'danger' : 'warn'), el('h3', null, title));
      card.append(head, el('p', 'ss-sub', bidi(o.host || '')));
      const actions = el('div', 'ss-actions');
      const back = button('ss-primary', t('linkGoBack', null, 'Go back'));
      const open = button('ss-danger-ghost', t('linkOpenAnyway', null, 'Open anyway'));
      onTrustedClick(back, () => c.close());
      onTrustedClick(open, () => { c.close(); if (typeof o.onOpen === 'function') o.onOpen(); });
      actions.append(back, open);
      card.append(actions); dlg.append(card);
      return { card, safe: back };
    });
    return true;
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
      muteKind: d.muteKind, onMute: d.onMute, onReport: d.onReport
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
  function crossOriginCredToast(reason, onProceed, onMute, onReport) {
    return toast({
      kind: 'danger', role: 'alert', persist: true,
      title: t('credPostTitle', null, 'This form sends what you type to another site'),
      body: reasonText(reason),
      actions: [
        { cls: 'ss-keep', label: t('keepMyDetails', null, 'Keep my details'), primary: true },
        { cls: 'ss-send', label: t('submitAnyway', null, 'Submit anyway'), onClick: onProceed }
      ],
      muteKind: 'credpost', onMute, onReport
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
        muteKind: 'clipboard', onMute: d.onMute, onReport: d.onReport
      });
    }
    return toast({
      kind: 'warn', role: 'status',
      title: t('clipboardWarnTitle', [host], d.host + ' changed your clipboard on its own'),
      body: reasonText(reason) || t('guardClipboardFallback', null, 'A site changed your clipboard.'),
      muteKind: 'clipboard', onMute: d.onMute, onReport: d.onReport
    });
  }

  function techScamEscapeOverlay(verdict, onLeave, onReport) {
    const S = surfaces();
    if (tinyFrame() || S.isMounted('dialog') || S.isMounted('interstitial')) return;
    modal('dialog', NS + '-overlay', {
      role: 'dialog', label: t('techScamTitle', null, 'Possible tech-support scam'),
      onEscape: (ctl) => ctl.close()
    }, (dlg, ctl) => {
      const card = el('div', 'ss-card');
      const head = el('div', 'ss-head'); const h3 = el('h3', null, t('techScamTitle', null, 'Possible tech-support scam')); head.append(tile('danger'), h3);
      card.append(head,
        el('p', null, reasonText(verdict.reasons && verdict.reasons[0]) || t('guardTechScamFallback', null, 'This page is using scare tactics.')),
        el('p', 'ss-sub', t('techScamBody', null, 'This is a web page, not your computer — your computer is fine. Real security warnings never lock your screen or show a phone number. Do not call, and do not pay.')));
      const actions = el('div', 'ss-actions');
      const leave = button('ss-primary', t('getMeOut', null, 'Get me out (close this page)'));
      const stay = button('', t('dismiss', null, 'Dismiss'));
      // Fix round 2: trusted-click guarded — a tech-support scam page must not be
      // able to dismiss its own warning overlay by synthesising a Dismiss click.
      onTrustedClick(leave, () => { ctl.close(); onLeave && onLeave(); });
      onTrustedClick(stay, () => ctl.close());
      actions.append(leave, stay);
      if (typeof onReport === 'function') { const rep = button('ss-report', t('reportMistake', null, 'Report a mistake')); onTrustedClick(rep, () => { rep.textContent = t('thanks', null, 'Thanks'); rep.disabled = true; onReport(); }); actions.append(rep); }
      card.append(actions); dlg.append(card);
      return { card, safe: leave };
    });
  }

  root.ScamShield = root.ScamShield || {};
  root.ScamShield.actions = { showBanner, guardForms, hideScamBlocks, clearAll, walletConfirmOverlay, clipboardToast, techScamEscapeOverlay, supportToast, dangerInterstitial, armDelayed, privacyToast, crossOriginCredToast, ackSurface, setTheme, frameFormBlockedToast, linkConfirm, linkConfirmAvailable, linkBlockedToast, popupBlockedToast, popunderBlockedToast };
})(typeof globalThis !== 'undefined' ? globalThis : self);
