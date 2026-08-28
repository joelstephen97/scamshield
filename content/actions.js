(function (root) {
  'use strict';
  const NS = 'scamshield';
  const api = root.browser || root.chrome;
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

  function clearAll() {
    document.querySelectorAll('.' + NS + '-banner, .' + NS + '-overlay').forEach((n) => n.remove());
    document.querySelectorAll('.' + NS + '-hidden-block').forEach((n) => {
      n.classList.remove(NS + '-hidden-block');
      const t = n.querySelector('.' + NS + '-hidden-tag'); if (t) t.remove();
    });
  }

  const SHIELD = (inner) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5l8-3z"/>' + inner + '</svg>';
  const ICON = { dangerous: SHIELD('<path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'), suspicious: SHIELD('<path d="M12 8v5"/><path d="M12 16h.01"/>') };
  function iconSpan(kind) { const s = el('span', 'ss-ico'); s.innerHTML = ICON[kind]; return s; }

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
  function showBanner(verdict, onAllow, extra) {
    if (document.querySelector('.' + NS + '-banner')) return;
    const x = extra || {};
    const danger = verdict.level === 'dangerous';
    const bar = el('div', NS + '-banner ' + (danger ? 'danger' : 'suspicious'));
    bar.setAttribute('role', 'alert');
    setDir(bar);
    const ico = el('span', 'ss-ico'); ico.innerHTML = ICON[danger ? 'dangerous' : 'suspicious'];
    const text = el('div', 'ss-text');
    const head = verdict.brandLabel
      ? (danger ? t('bannerDangerBrand', [bidi(verdict.brandLabel)], 'Dangerous page — looks like ' + verdict.brandLabel + ", but isn't") : t('bannerSuspicious', null, 'Suspicious page'))
      : (danger ? t('bannerDanger', null, 'Dangerous page') : t('bannerSuspicious', null, 'Suspicious page'));
    text.append(el('b', null, head), el('span', null, reasonText(verdict.reasons[0]) || (danger ? t('popupDangerSummary', null, "Don't enter passwords or card details here.") : t('popupSuspiciousSummary', null, 'Take care before typing anything here.'))));
    if (verdict.brandLabel && verdict.brandUrl) {
      const cmp = compareRow(verdict.brandLabel, verdict.brandUrl);
      if (cmp) text.appendChild(cmp);
    }
    const acts = el('div', 'ss-acts');
    if (danger) { const leave = el('button', 'ss-leave', t('leaveThisPage', null, 'Leave this page')); leave.addEventListener('click', () => { x.onLeave ? x.onLeave() : history.back(); }); acts.appendChild(leave); }
    if (verdict.brandUrl) { const rescue = el('button', 'ss-rescue', t('takeMeToReal', [bidi(verdict.brandLabel || 'site')], 'Take me to the real ' + (verdict.brandLabel || 'site'))); rescue.addEventListener('click', () => { location.href = verdict.brandUrl; }); acts.appendChild(rescue); }
    if (!danger) { const why = el('button', 'ss-why', t('showWhy', null, 'Show why')); why.addEventListener('click', () => { text.querySelector('span').textContent = verdict.reasons.slice(0, 3).map(reasonText).join(' · '); why.remove(); }); acts.appendChild(why); }
    const trust = el('button', 'ss-trust', t('trustThisSite', null, 'Trust this site')); trust.addEventListener('click', () => { onAllow && onAllow(); bar.remove(); });
    const report = el('button', 'ss-report', t('reportMistake', null, 'Report a mistake')); report.addEventListener('click', () => { report.textContent = t('thanks', null, 'Thanks'); report.disabled = true; x.onReport && x.onReport(); });
    const close = el('button', 'ss-x', '✕'); close.setAttribute('aria-label', t('ariaDismiss', null, 'Dismiss')); close.addEventListener('click', () => bar.remove());
    acts.append(trust, report, close);
    bar.append(ico, text, acts);
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
    const ov = el('div', NS + '-overlay ' + NS + '-interstitial');
    ov.setAttribute('role', 'alertdialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', t('ariaScamWarning', null, 'Scam warning'));
    setDir(ov);
    const card = el('div', 'ss-card');
    const h3 = el('h3');
    h3.append(iconSpan('dangerous'), el('span', null, HEADS[Math.floor(Math.random() * HEADS.length)]));
    card.append(h3);
    const why = el('p', null, reasonText(verdict.reasons[0]) || t('interstitialFallback', null, 'This page matches the pattern of a known scam.'));
    card.append(why);
    if (verdict.brandLabel && verdict.brandUrl) {
      const cmp = compareRow(verdict.brandLabel, verdict.brandUrl);
      if (cmp) card.appendChild(cmp);
    }
    const ul = el('ul', 'ss-evidence');
    for (const r of (verdict.reasons || []).slice(1, 4)) { const li = el('li'); li.append(el('span', 'ss-chip', t('chipWhy', null, 'Why')), el('span', null, reasonText(r))); ul.appendChild(li); }
    if (ul.children.length) card.appendChild(ul);
    card.append(el('p', 'ss-sub', t('interstitialReassure', null, 'Nothing you typed has been sent yet. Leaving now is safe.')));
    const actions = el('div', 'ss-actions');
    const leave = el('button', 'ss-primary', t('leaveThisPage', null, 'Leave this page'));
    leave.addEventListener('click', () => { x.onLeave ? x.onLeave() : history.back(); });
    actions.append(leave);
    if (verdict.brandUrl) {
      const rescue = el('button', 'ss-rescue-ghost', t('takeMeToReal', [bidi(verdict.brandLabel || 'site')], 'Go to the real ' + (verdict.brandLabel || 'site')));
      rescue.addEventListener('click', () => { location.href = verdict.brandUrl; });
      actions.append(rescue);
    }
    const stay = el('button', 'ss-danger-ghost', t('continueAnyway', null, 'Continue anyway'));
    armDelayed(stay, 3);
    stay.addEventListener('click', () => { ov.remove(); if (x.onDismiss) x.onDismiss(); });
    actions.append(stay);
    const rep = el('button', 'ss-report', t('reportMistake', null, 'Report a mistake'));
    rep.addEventListener('click', () => { rep.textContent = t('thanks', null, 'Thanks'); rep.disabled = true; x.onReport && x.onReport(); });
    actions.prepend(rep);
    card.append(actions);
    ov.append(card);
    document.documentElement.appendChild(ov);
    leave.focus();
  }

  // One-time-ever, shown only right after a dangerous page was blocked.
  function supportToast() {
    if (document.querySelector('.' + NS + '-toast')) return;
    const toast = el('div', NS + '-toast warn');
    toast.setAttribute('role', 'status');
    setDir(toast);
    const a = el('a', null, t('toastSupportAsk', null, 'ScamShield just protected you — it’s free and runs on your device. Chip in? ❤'));
    a.href = 'https://github.com/sponsors/joelstephen97';
    a.target = '_blank'; a.rel = 'noopener';
    const x = el('button', null, t('dismiss', null, 'Dismiss')); x.addEventListener('click', () => toast.remove());
    toast.append(a, x); (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => toast.remove(), 20000);
  }

  // Intercept submit on password forms that post off-domain.
  // NOTE: capture-phase 'submit' catches user-initiated submits (click, Enter,
  // requestSubmit) — the path credential phishing relies on. It does NOT catch
  // programmatic HTMLFormElement.submit(), which bypasses event listeners and
  // would require a MAIN-world injected hook (deferred to a later version).
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
        const back = el('button', 'ss-primary', t('cancelRecommended', null, 'Cancel (recommended)'));
        const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        back.addEventListener('click', close);
        const go = el('button', 'ss-danger-ghost', t('submitAnyway', null, 'Submit anyway'));
        armDelayed(go, 3);
        // form.submit() here runs the isolated world's native (unhooked) method,
        // so it really submits without re-triggering this guard.
        go.addEventListener('click', () => { document.removeEventListener('keydown', onKey, true); ov.remove(); form.submit(); });
        actions.append(go, back);
        const rep = el('button', 'ss-report', t('reportMistake', null, 'Report a mistake')); rep.addEventListener('click', () => { rep.textContent = t('thanks', null, 'Thanks'); rep.disabled = true; onReport && onReport(); }); actions.prepend(rep);
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
      const toast = el('div', NS + '-toast warn');
      toast.setAttribute('role', 'alert');
      setDir(toast);
      toast.append(iconSpan('suspicious'), el('span', 'ss-msg',
        t('guardWalletCollision', null, 'ScamShield blocked a wallet request while another warning was open. Close it and retry.')));
      (document.body || document.documentElement).appendChild(toast);
      setTimeout(() => toast.remove(), 12000);
      onDecision(false, { collision: true });
      return;
    }
    const ov = el('div', NS + '-overlay');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', t('walletRiskyTitle', null, 'Risky wallet request'));
    setDir(ov);
    const card = el('div', 'ss-card');
    const h3 = el('h3'); h3.append(iconSpan('suspicious'), el('span', null, t('walletRiskyTitle', null, 'Risky wallet request')));
    card.append(h3,
      el('p', null, reasonText(detail.reasons && detail.reasons[0]) || t('guardWalletFallback', null, 'This site is requesting a sensitive wallet action.')),
      el('p', 'ss-sub', t('walletRiskyBody', null, 'If you did not expect this, cancel. Drainers use these requests to steal your crypto.')));
    const actions = el('div', 'ss-actions');
    const cancel = el('button', 'ss-primary', t('cancelRecommended', null, 'Cancel (recommended)'));
    const proceed = el('button', 'ss-danger-ghost', t('proceedAnyway', null, 'Proceed anyway'));
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
  function privacyToast(detail) {
    const toast = el('div', NS + '-toast ' + (detail.level === 'warn' ? 'warn' : ''));
    toast.setAttribute('role', 'status');
    setDir(toast);
    toast.append(iconSpan('suspicious'), el('span', 'ss-msg', detail.text || t('guardPrivacyFallback', null, 'A privacy issue was detected on this page.')));
    const x = el('button', null, t('dismiss', null, 'Dismiss')); x.addEventListener('click', () => toast.remove());
    toast.append(x); (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => toast.remove(), 14000);
  }

  function clipboardToast(detail) {
    const old = document.querySelector('.' + NS + '-toast'); if (old) old.remove();
    const toast = el('div', NS + '-toast ' + (detail.level === 'dangerous' ? 'danger' : 'warn'));
    toast.setAttribute('role', 'alert');
    setDir(toast);
    toast.append(iconSpan(detail.level === 'dangerous' ? 'dangerous' : 'suspicious'), el('span', 'ss-msg', reasonText(detail.reasons && detail.reasons[0]) || t('guardClipboardFallback', null, 'A site changed your clipboard.')));
    const x = el('button', null, t('dismiss', null, 'Dismiss')); x.addEventListener('click', () => toast.remove());
    toast.append(x); (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => toast.remove(), 12000);
  }

  function techScamEscapeOverlay(verdict, onLeave) {
    if (document.querySelector('.' + NS + '-overlay')) return;
    const ov = el('div', NS + '-overlay');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', t('techScamTitle', null, 'Possible tech-support scam'));
    setDir(ov);
    const card = el('div', 'ss-card');
    const h3 = el('h3'); h3.append(iconSpan('dangerous'), el('span', null, t('techScamTitle', null, 'Possible tech-support scam')));
    card.append(h3,
      el('p', null, reasonText(verdict.reasons && verdict.reasons[0]) || t('guardTechScamFallback', null, 'This page is using scare tactics.')),
      el('p', 'ss-sub', t('techScamBody', null, 'This is a web page, not your computer — your computer is fine. Real security warnings never lock your screen or show a phone number. Do not call, and do not pay.')));
    const actions = el('div', 'ss-actions');
    const leave = el('button', 'ss-primary', t('getMeOut', null, 'Get me out (close this page)'));
    const stay = el('button', null, t('dismiss', null, 'Dismiss'));
    const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    leave.addEventListener('click', () => { close(); onLeave && onLeave(); });
    stay.addEventListener('click', close);
    actions.append(leave, stay); card.append(actions); ov.append(card);
    document.documentElement.appendChild(ov);
    document.addEventListener('keydown', onKey, true); leave.focus();
  }

  root.ScamShield = root.ScamShield || {};
  root.ScamShield.actions = { showBanner, guardForms, hideScamBlocks, clearAll, walletConfirmOverlay, clipboardToast, techScamEscapeOverlay, supportToast, dangerInterstitial, armDelayed, privacyToast };
})(typeof globalThis !== 'undefined' ? globalThis : self);
