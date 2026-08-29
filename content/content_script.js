(function (root) {
  'use strict';
  if (root.__scamshieldIsolatedGuard) return; // avoid duplicate listeners on re-injection
  root.__scamshieldIsolatedGuard = true;
  const api = root.browser || root.chrome;
  const SS = root.ScamShield;
  // Localised string with English fallback, same pattern as content/actions.js
  // (no shared module between the two content scripts, so this stays a tiny
  // local copy rather than a new file). The user's language override is read
  // from SSReasons, the one module both files do share — actions.js runs first
  // in both manifests and is what asks the service worker for the dictionary,
  // so this file only consumes it.
  function t(key, subs, fallback) {
    try { const R = root.SSReasons; if (R && R.tOverride) { const o = R.tOverride(key, subs); if (o) return o; } } catch (_) {}
    try { const m = api && api.i18n && api.i18n.getMessage(key, subs); if (m) return m; } catch (_) {}
    return fallback != null ? fallback : key;
  }
  const bidi = (s) => (root.SSReasons && root.SSReasons.bidiWrap) ? root.SSReasons.bidiWrap(s) : (s == null ? '' : String(s));
  // Same shared pattern as content/actions.js: every element carrying
  // localized text gets an explicit dir so RTL locales lay it out correctly.
  function setDir(node) {
    try { node.setAttribute('dir', root.SSReasons && root.SSReasons.isRTL() ? 'rtl' : 'ltr'); } catch (_) {}
  }
  // all_frames (0.6.0): the isolated script now runs in every frame so
  // iframe-hosted phishing forms are no longer invisible. Sub-frames run a
  // lean pass (URL + DOM rules + form guard); page-level UI stays top-frame.
  const IS_TOP = (() => { try { return window === window.top; } catch (_) { return false; } })();

  function send(type, extra) {
    return new Promise((res) => {
      try { api.runtime.sendMessage(Object.assign({ type }, extra), (r) => res(r)); }
      catch (_) { res(null); }
    });
  }

  function needsPageAnalysis(signals, urlRules, domRules) {
    if (signals.hasPasswordField) return true;
    if (Math.max(urlRules.score, domRules.score) >= 0.3) return true;
    return [...document.querySelectorAll('form')].some((f) =>
      f.querySelectorAll('input:not([type]),input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="password"]').length >= 2);
  }
  function iconCandidates() {
    const out = [];
    const add = (h) => { try { const u = new URL(h, location.href); if (/^https?:$/.test(u.protocol)) out.push(u.href); } catch (_) {} };
    document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach((l) => add(l.getAttribute('href') || ''));
    add('/favicon.ico');
    [...document.querySelectorAll('img')].filter((i) => /logo/i.test((i.getAttribute('src') || '') + ' ' + (i.getAttribute('alt') || '') + ' ' + i.className + ' ' + i.id) && (i.naturalWidth >= 40 || i.width >= 40)).slice(0, 2).forEach((i) => add(i.getAttribute('src') || ''));
    return [...new Set(out)].slice(0, 6);
  }
  // Clears the timeout however the race settles, so a fast-resolving `p`
  // doesn't leave a dangling setTimeout alive for the full `ms` (timer leak).
  const withTimeout = (p, ms) => {
    let t;
    const timeout = new Promise((r) => { t = setTimeout(() => r(null), ms); });
    return Promise.race([p, timeout]).finally(() => clearTimeout(t));
  };

  // Card-number input candidates: attribute heuristic only (autocomplete or a
  // "card" name/id/placeholder) — shared by the delivery-fee-scam signal and
  // the cross-origin exfil watch (0.10.0, Task C2) below. Neither ever reads
  // .value from this selector alone; the exfil watch only inspects the value
  // at submit time, gated on an actual Luhn pass (engine/constants.js
  // isPanShaped) — see guardExfilForms.
  const CARD_INPUT_SEL = 'input[autocomplete="cc-number"], input[name*="card" i], input[id*="card" i], input[placeholder*="card" i]';

  function registrable(host) {
    if (SS && typeof SS.registrableDomain === 'function') return SS.registrableDomain(host);
    return String(host || '').toLowerCase().split('.').filter(Boolean).slice(-2).join('.');
  }

  // Built-in safe list OR the user's own trusted sites. Gates every warning
  // surface (page scan, wallet overlay, clipboard toast, tech-scam overlay) —
  // a site the user trusts must never nag them.
  function isTrustedHost(host, settings) {
    if (SS && typeof SS.isSafeHost === 'function' && SS.isSafeHost(host)) return true;
    const reg = registrable(host);
    if (SS && SS.isPaused && SS.isPaused(settings && settings.pausedSites, reg, Date.now())) return true;
    return ((settings && settings.allowlist) || []).includes(reg);
  }

  // --- MAIN-world detector bridges (registered once; re-injection guard above) ---
  function reply(id, allow) {
    try { window.dispatchEvent(new CustomEvent('scamshield:wallet-decision', { detail: { id, allow } })); } catch (_) {}
  }
  window.addEventListener('scamshield:wallet-confirm', async (e) => {
    const detail = (e && e.detail) || {};
    const settings = await send('getSettings');
    if (!settings || !settings.enabled || settings.walletGuard === false) { reply(detail.id, true); return; }
    if (isTrustedHost(location.hostname, settings)) { reply(detail.id, true); return; }
    if (!SS || !SS.actions) { reply(detail.id, true); return; }
    SS.actions.walletConfirmOverlay(detail, (allow, meta) => {
      reply(detail.id, allow);
      if (!allow && !(meta && meta.collision)) send('bumpThreats', { kind: 'wallet' });
    });
  });
  window.addEventListener('scamshield:clipboard-alert', async (e) => {
    const settings = await send('getSettings');
    if (!settings || !settings.enabled || !SS || !SS.actions) return;
    if (settings.clipboardGuard === false && settings.clickFixGuard === false) return;
    if (isTrustedHost(location.hostname, settings)) return;
    const detail = (e && e.detail) || {};
    // ClickFix escalation (0.6.0): a dangerous clipboard payload PLUS
    // paste-and-run instructions in the page text = the fake-CAPTCHA malware
    // pattern. Neutralise the clipboard and block the interaction outright.
    if (detail.level === 'dangerous' && settings.clickFixGuard !== false && SS.scoreClickFix && SS.actions.dangerInterstitial) {
      const text = (document.body ? document.body.innerText : '').slice(0, 20000);
      const cf = SS.scoreClickFix({ text, clipboardLevel: 'dangerous' });
      if (cf.level === 'dangerous') {
        try { await navigator.clipboard.writeText(t('guardClipboardBlockedPayload', null, 'Blocked by ScamShield — this site put a dangerous command on your clipboard. Do not paste it anywhere.')); } catch (_) { /* overwrite is best-effort */ }
        SS.actions.dangerInterstitial(
          { level: 'dangerous', reasons: cf.reasons, flags: cf.flags },
          { onLeave: () => send('leaveTab'), onReport: () => send('userReport', { label: 'false_positive' }) }
        );
        send('reportVerdict', { verdict: { level: 'dangerous', score: 0.95, reasons: cf.reasons, reasonCodes: cf.reasons.map((x) => x.code), flags: cf.flags, modelUsed: false }, subframe: !IS_TOP });
        send('bumpThreats', { kind: 'clipboard' });
        return;
      }
    }
    if (settings.clipboardGuard === false) return;
    SS.actions.clipboardToast(detail);
    send('bumpThreats', { kind: 'clipboard' });
  });
  let techSignal = { dialogFloodCount: 0, fullscreenOnLoad: false, beforeUnloadCount: 0, alarmAudio: false };
  let techShown = false;
  window.addEventListener('scamshield:techscam-signal', async (e) => {
    techSignal = Object.assign(techSignal, (e && e.detail) || {});
    if (techShown || !SS || typeof SS.scoreTechScam !== 'function' || !SS.actions) return;
    const settings = await send('getSettings');
    if (!settings || !settings.enabled || settings.techScamGuard === false) return;
    if (isTrustedHost(location.hostname, settings)) return;
    const text = (document.body ? document.body.innerText : '').slice(0, 20000);
    const r = SS.scoreTechScam({
      text, fullscreenOnLoad: techSignal.fullscreenOnLoad, alarmAudio: techSignal.alarmAudio,
      dialogFloodCount: techSignal.dialogFloodCount, historyTrap: techSignal.beforeUnloadCount >= 2
    });
    if (r.score >= (SS.THRESHOLDS ? SS.THRESHOLDS.dangerous : 0.8)) {
      techShown = true;
      SS.actions.techScamEscapeOverlay({ level: 'dangerous', reasons: r.reasons }, () => {
        // Dismantle the page's traps (fullscreen, beforeunload, alarm audio)
        // in the MAIN world, then actually leave via the service worker.
        try { window.dispatchEvent(new CustomEvent('scamshield:techscam-escape')); } catch (_) {}
        send('leaveTab');
      });
      send('reportVerdict', { verdict: { level: 'dangerous', score: r.score, reasons: r.reasons, reasonCodes: r.reasons.map((x) => x.code), flags: r.flags || [], modelUsed: false }, subframe: !IS_TOP });
      send('bumpThreats', { kind: 'techscam' });
    }
  });

  // --- Privacy pack bridges (0.6.0) — detection-only, gated by settings ---
  const privacySeen = new Set();
  window.addEventListener('scamshield:leaky-form', async (e) => {
    const d = (e && e.detail) || {};
    const settings = await send('getSettings');
    if (!settings || !settings.enabled || settings.leakyFormGuard === false) return;
    if (isTrustedHost(location.hostname, settings)) return;
    const key = 'leak|' + d.destHost + '|' + d.kind;
    if (privacySeen.has(key)) return; privacySeen.add(key);
    const text = d.kind === 'plain'
      ? t('guardLeakyFormPlain', [bidi(d.destHost)], 'This site sent your email/phone to ' + d.destHost + ' in plain text — before you pressed submit.')
      : t('guardLeakyFormHashed', [bidi(d.destHost), bidi(d.kind.toUpperCase())], 'This site sent your email/phone to ' + d.destHost + ' as a hashed (' + d.kind.toUpperCase() + ') identifier — before you pressed submit.');
    if (SS.actions && SS.actions.privacyToast) {
      SS.actions.privacyToast({ text });
    }
    send('privacyFinding', { finding: { kind: 'leaky-form', host: d.destHost, detail: d.kind } });
  });
  window.addEventListener('scamshield:fingerprint', async (e) => {
    const d = (e && e.detail) || {};
    const settings = await send('getSettings');
    if (!settings || !settings.enabled || settings.fingerprintDetect === false) return;
    if (isTrustedHost(location.hostname, settings)) return;
    let host = d.origin; try { host = new URL(d.origin).hostname; } catch (_) {}
    const key = 'fp|' + host;
    if (privacySeen.has(key)) return; privacySeen.add(key);
    send('privacyFinding', { finding: { kind: 'fingerprint', host, detail: (d.surfaces || []).join(',') } });
  });
  window.addEventListener('scamshield:notify-request', async () => {
    const settings = await send('getSettings');
    if (!settings || !settings.enabled || settings.notificationGuard === false) return;
    if (isTrustedHost(location.hostname, settings)) return;
    // Lure heuristic: a permission prompt on a page that also shows "allow to
    // continue / prove you are human" copy is the classic push-scam trick.
    const bt = (document.body ? document.body.innerText : '').toLowerCase();
    if (/allow.{0,20}(to (continue|proceed|verify|watch|download)|if you are not a robot|to confirm you are human)|click\s+allow/i.test(bt)) {
      if (SS.actions && SS.actions.privacyToast) {
        SS.actions.privacyToast({ level: 'warn', text: t('guardNotifyLure', null, 'This site is trying to get notification permission using a "click Allow to continue" trick. You can safely Block it.') });
      }
      send('privacyFinding', { finding: { kind: 'notify-lure', host: location.hostname, detail: '' } });
    }
  });

  function collectSignals(settings) {
    settings = settings || {};
    const pageHost = location.hostname;
    const passwordForms = [...document.querySelectorAll('form')]
      .filter((f) => f.querySelector('input[type="password"]'));
    const passwordFormActions = passwordForms.map((f) => f.getAttribute('action') || location.href);
    const AUTH = (SS && SS.KNOWN_AUTH_PROVIDERS) || [];
    const foreignForms = passwordForms.filter((f) => {
      try {
        const h = new URL(f.getAttribute('action') || location.href, location.href).hostname;
        const actionDomain = registrable(h);
        // Mirrors scoreDom: posting to a known identity provider is federated
        // login (SSO), not credential exfiltration — no submit guard.
        return actionDomain !== registrable(pageHost) && !AUTH.includes(actionDomain);
      } catch (_) { return false; }
    });
    // Cross-origin credential/card exfil watch (0.10.0, Task C2): the same
    // "posts off-domain" idea as foreignForms above, widened to also catch
    // PAN-shaped card forms, kept warn-tier (a dismissible toast, not the
    // blocking phishing overlay), and gated on its own settings check —
    // see guardExfilForms in content/actions.js and its call site below.
    // Forms already caught by foreignForms are excluded here so the same
    // submit doesn't trigger both the blocking overlay AND this toast.
    const exfilForms = [...document.querySelectorAll('form')]
      .filter((f) => !foreignForms.includes(f))
      .filter((f) => {
        const hasPassword = !!f.querySelector('input[type="password"]');
        if (!hasPassword && !f.querySelector(CARD_INPUT_SEL)) return false;
        // A password-bearing form the EXISTING form-guard already exempts as
        // federated login (KNOWN_AUTH_PROVIDERS) must stay exempt here too —
        // this signal's own allowlist is payment-processor-focused and
        // deliberately narrower, so it must never re-warn on a provider the
        // form-guard has already cleared.
        if (hasPassword) {
          try {
            const actionDomain = registrable(new URL(f.getAttribute('action') || location.href, location.href).hostname);
            if (AUTH.includes(actionDomain)) return false;
          } catch (_) {}
        }
        return !!(SS && SS.crossOriginCredPostHost && SS.crossOriginCredPostHost(location.href, f.getAttribute('action')));
      });

    const hiddenIframeCount = [...document.querySelectorAll('iframe')].filter((fr) => {
      const cs = getComputedStyle(fr);
      return cs.display === 'none' || cs.visibility === 'hidden' ||
        (fr.offsetWidth <= 1 && fr.offsetHeight <= 1);
    }).length;

    const text = (document.body ? document.body.innerText : '').toLowerCase().slice(0, 20000);
    const scamPhrases = SS.SCAM_PHRASES.filter((p) => text.includes(p));

    // Candidate scam blocks: elements whose text contains a scam phrase, kept small.
    const scamBlocks = [];
    if (SS && SS.SCAM_PHRASES) {
      let scanned = 0;
      for (const node of document.querySelectorAll('div,section,aside,a')) {
        if (scamBlocks.length >= 10 || ++scanned > 2000) break;
        const t = (node.innerText || '').toLowerCase();
        if (t.length < 200 && SS.SCAM_PHRASES.some((p) => t.includes(p))) scamBlocks.push(node);
      }
    }

    // Brand signals (content-based impersonation).
    const titleBrand = (document.title || '').toLowerCase();
    const ogEl = document.querySelector('meta[property="og:site_name"]');
    const ogSiteName = ogEl ? (ogEl.getAttribute('content') || '') : '';
    const iconEl = document.querySelector('link[rel~="icon"]');
    let faviconHost = '';
    try { faviconHost = iconEl ? new URL(iconEl.getAttribute('href'), location.href).hostname : ''; } catch (_) {}
    // Brand-name surface from alt/aria text. Two carve-outs against false
    // positives from legitimate third-party SSO buttons ("Continue with
    // Google", "Sign in with Facebook" on a non-Google/Facebook site):
    //  - img[alt] only counts when the image itself is icon/logo-sized
    //    (rendered or natural width >= 24px) or its src/class/id names it a
    //    logo, not tiny inline glyphs;
    //  - an img[alt]/[aria-label] element is skipped when it (or its direct
    //    ancestor chain) sits inside a button/link/role=button whose own
    //    VISIBLE text is an SSO CTA — that's the button's own "Sign in with
    //    X" label, not a claim the page IS brand X. Hidden/aria-hidden
    //    children (e.g. a visually-hidden duplicate label) are stripped
    //    before reading the button's text so they can't hide or fake a match.
    const SSO_CTA_RE = /\b(?:sign in|sign-in|log in|log-in|login|continue) with\b/i;
    const insideSsoButton = (n) => {
      const btn = n.closest && n.closest('button,a,[role="button"]');
      if (!btn) return false;
      const clone = btn.cloneNode(true);
      clone.querySelectorAll('[hidden],[aria-hidden="true"]').forEach((el) => el.remove());
      return SSO_CTA_RE.test(clone.textContent || '');
    };
    const altImgs = [...document.querySelectorAll('img[alt]')]
      .filter((n) => {
        const bigEnough = (n.naturalWidth || 0) >= 24 || (n.width || 0) >= 24;
        const looksLikeLogo = /logo/i.test((n.getAttribute('src') || '') + ' ' + n.className + ' ' + n.id);
        return (bigEnough || looksLikeLogo) && !insideSsoButton(n);
      })
      .map((n) => n.getAttribute('alt') || '');
    const ariaEls = [...document.querySelectorAll('[aria-label]')]
      .filter((n) => !insideSsoButton(n))
      .map((n) => n.getAttribute('aria-label') || '');
    const logoAltBrands = altImgs.concat(ariaEls).slice(0, 40).map((t) => t.toLowerCase());

    // Seed-phrase harvesting: recovery-phrase wording + many word inputs / a textarea.
    const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
    const mentionsSeed = (SS.SEED_PHRASE_HINTS || []).some((p) => bodyText.includes(p));
    const manyWordInputs = document.querySelectorAll('input[type="text"],input:not([type]),textarea').length >= 12;
    const seedPhraseForm = mentionsSeed && (manyWordInputs || document.querySelector('textarea') != null);

    // ClickFix instruction cluster (0.6.0) — engine/clickfix_rules.js.
    const clickfix = (SS.scoreClickFix && settings.clickFixGuard !== false) ? SS.scoreClickFix({ text: bodyText }) : null;

    // Fake browser-update prompt (0.6.0) — only pay for the anchor walk when
    // the page even talks about updating.
    let fakeUpdate = null;
    if (SS.scoreFakeUpdate && settings.fakeUpdateGuard !== false && /update|out.of.date|outdated/i.test(bodyText)) {
      const updateAnchorHosts = [];
      let hasBlobDownload = false;
      let walked = 0;
      for (const a of document.querySelectorAll('a[href], a[download], button')) {
        if (++walked > 300) break;
        const t = ((a.textContent || '') + ' ' + (a.getAttribute('aria-label') || '')).toLowerCase();
        if (!/update|download|install/.test(t)) continue;
        if (a.hasAttribute('download')) hasBlobDownload = true;
        const href = a.getAttribute('href');
        if (!href) continue;
        if (/^(blob|data):/i.test(href)) { hasBlobDownload = true; continue; }
        try {
          const u = new URL(href, location.href);
          if (/^https?:$/.test(u.protocol)) updateAnchorHosts.push(registrable(u.hostname));
        } catch (_) {}
      }
      fakeUpdate = SS.scoreFakeUpdate({ text: bodyText, updateAnchorHosts, hasBlobDownload });
    }

    // Delivery-fee scam signals (0.6.0): card-number input + small-fee wording.
    const hasCardInput = !!document.querySelector(CARD_INPUT_SEL);
    const deliveryFeeText = /(redeliver|redelivery|customs|clearance|delivery|shipping|postage)\s+fee|unpaid\s+(postage|customs|fee)|pay\s+(a\s+)?(small\s+)?fee|schedule.{0,24}redelivery/i.test(bodyText);

    return {
      signals: {
        pageHost, hasPasswordField: passwordForms.length > 0, passwordFormActions, hiddenIframeCount, scamPhrases,
        titleBrand, ogSiteName, faviconHost, logoAltBrands, seedPhraseForm,
        clickfix, fakeUpdate, hasCardInput, deliveryFeeText
      },
      foreignForms, scamBlocks, exfilForms
    };
  }

  // --- Fake-shop signal collection (0.6.0), badge/popup tier only ---
  function parseCountdownSeconds() {
    // Find a MM:SS / HH:MM:SS countdown; return the largest total seconds seen.
    let best = 0, scanned = 0;
    for (const el of document.querySelectorAll('[class*="countdown" i],[class*="timer" i],[id*="countdown" i],time,span,div,b')) {
      if (++scanned > 400) break;
      const t = (el.textContent || '').trim();
      const m = t.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
      if (!m) continue;
      const secs = m[3] ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
      if (secs > best && secs <= 48 * 3600) best = secs;
    }
    return best;
  }
  async function collectShop(bodyText, pageHost) {
    const looksLikeShop = /add to (cart|bag|basket)|proceed to checkout|checkout|shopping cart|order summary|free shipping|buy now/i.test(bodyText) ||
      !!document.querySelector('[class*="add-to-cart" i],[id*="add-to-cart" i],[class*="addtocart" i],[name*="checkout" i]');
    if (!looksLikeShop) return { isStorefront: false };
    const fakeScarcity = (bodyText.match(/only\s+\d+\s+left|selling fast|\d+\s+(people|others)\s+(are\s+)?(viewing|watching|looking)|in\s+\d+\s+carts/gi) || []).length;
    const offPlatformPay = /\b(zelle|venmo|cash\s?app|western union|moneygram|wire transfer|bank transfer|pay(?:ing)? (?:by|with) (?:crypto|bitcoin|usdt))\b/i.test(bodyText);
    const badgeHotlink = [...document.querySelectorAll('img')].some((im) => {
      const s = ((im.getAttribute('src') || '') + ' ' + (im.getAttribute('alt') || '')).toLowerCase();
      if (!/secure|verified|trust|guarante|ssl|norton|mcafee/.test(s)) return false;
      let host = ''; try { host = new URL(im.src, location.href).hostname; } catch (_) { return false; }
      const crossOrigin = registrable(host) !== registrable(pageHost);
      const linked = !!im.closest('a[href]');
      return crossOrigin && !linked;
    });
    const hasContact = !!document.querySelector('a[href*="contact" i],a[href*="about" i],a[href*="imprint" i],a[href^="tel:"],a[href^="mailto:"]') ||
      /\b(contact us|customer service|our address|registered office|company (number|registration))\b/i.test(bodyText);
    const missingContact = !hasContact;
    let countdownReset = false;
    const secs = parseCountdownSeconds();
    if (secs > 0) { try { const r = await send('shopCountdown', { domain: registrable(pageHost), seconds: secs }); countdownReset = !!(r && r.reset); } catch (_) {} }
    return { isStorefront: true, fakeScarcity, offPlatformPay, badgeHotlink, missingContact, countdownReset };
  }

  // Sponsored-search destination check (0.6.0). Search engines are trusted
  // hosts (run() returns early), so this runs separately. It flags a sponsored
  // result whose displayed domain differs from where the link actually goes —
  // the malvertising seam (fake download/bank sites). Conservative: requires an
  // explicit "Sponsored/Ad" marker AND a real domain mismatch, so it can't
  // false-positive on organic results.
  const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org)$/i;
  function checkSerp() {
    let flagged = 0;
    const anchors = document.querySelectorAll('a[href^="http"]');
    let scanned = 0;
    for (const a of anchors) {
      if (++scanned > 600 || flagged >= 8) break;
      if (a.__ssSerp) continue;
      // Is this anchor inside a labelled sponsored/ad block?
      let n = a, sponsored = false, hops = 0;
      while (n && hops++ < 6) {
        const lbl = ((n.getAttribute && (n.getAttribute('aria-label') || n.getAttribute('data-text-ad') || '')) || '') + ' ' + (n.className || '');
        if (/sponsored|\bads?\b|data-text-ad/i.test(String(lbl))) { sponsored = true; break; }
        n = n.parentElement;
      }
      if (!sponsored) {
        // Also accept a sibling "Sponsored" caption near the result.
        const cite = a.closest('div,li,article');
        if (cite && /\bsponsored\b|\bad\b·|·\s*ad\b/i.test((cite.innerText || '').slice(0, 60))) sponsored = true;
      }
      if (!sponsored) continue;
      let destHost = ''; try { destHost = new URL(a.href).hostname; } catch (_) { continue; }
      const destReg = registrable(destHost);
      // Displayed domain: a cite element or a domain-looking text token.
      const cite = a.querySelector('cite') || a.closest('div,li,article') && (a.closest('div,li,article').querySelector('cite'));
      let shownReg = '';
      if (cite) { const m = (cite.textContent || '').match(/([a-z0-9-]+\.)+[a-z]{2,}/i); if (m) shownReg = registrable(m[0].replace(/^https?:\/\//, '')); }
      if (!shownReg || shownReg === destReg) continue;
      // Mismatch on a sponsored result → mark it.
      a.__ssSerp = true;
      const chip = document.createElement('span');
      chip.className = 'scamshield-serp';
      setDir(chip);
      chip.textContent = t('serpAdMismatch', [bidi(destReg), bidi(shownReg)], '⚠ ScamShield: this ad goes to ' + destReg + ', not ' + shownReg);
      (a.closest('div,li,article') || a).appendChild(chip);
      flagged++;
    }
    return flagged;
  }

  // Per-result SERP safety badges (0.10.0, Task C1). Extends the sponsored-
  // mismatch check above into the same settings.serpCheck-gated surface, but
  // covers every organic result too: a red dot when the destination hits the
  // feed BLOCK set, an amber dot on a warn-set hit or a high-confidence local
  // URL signal (strong/strongest brand-fuzzy match, or the abused-TLD+
  // dyndns/hoster combo — both computed via engine/blockset.js +
  // engine/risk_rules.js reused as-is, batched into ONE background message
  // per scan pass so a 50-result page never costs 50 round trips, and never
  // a network fetch: checkFeedBatch is hash-set membership only, no exact-
  // shard lookup — a badge is advisory, never an interstitial).
  const SERP_BADGE_CAP = 50;
  let serpBadgeBudget = SERP_BADGE_CAP;
  let serpBadgeRunning = false;
  let serpBadgePending = false;
  let serpObserverStarted = false;
  let serpObserverTimer = null;

  // Resolves a result anchor to the hostname it actually leads to, unwrapping
  // a same-engine tracking redirect first (Google's /url?q=, /aclk, etc — see
  // engine/constants.js unwrapSerpRedirect) so a wrapped href doesn't get
  // mistaken for a link back into the search engine itself.
  function serpResultHost(a) {
    const href = a && a.getAttribute && a.getAttribute('href');
    if (!href || !SS || typeof SS.unwrapSerpRedirect !== 'function') return null;
    const real = SS.unwrapSerpRedirect(href, location.href);
    if (!real) return null;
    try { const u = new URL(real); return /^https?:$/.test(u.protocol) ? u.hostname : null; } catch (_) { return null; }
  }

  function badgeGlyph() {
    return '<svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true" focusable="false"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>';
  }
  function paintSerpBadge(a, level) {
    const dot = document.createElement('span');
    dot.className = 'scamshield-serp-badge scamshield-serp-badge-' + level;
    setDir(dot);
    dot.setAttribute('role', 'img');
    const label = level === 'danger'
      ? t('serpBadgeDanger', null, 'ScamShield: this result is on our threat block list')
      : t('serpBadgeCaution', null, 'ScamShield: this result shows scam warning signs');
    dot.setAttribute('aria-label', label);
    dot.setAttribute('title', label);
    dot.innerHTML = badgeGlyph();
    // Sibling of the anchor, inline-block + margin only (content/content.css)
    // — never an absolute overlay, so it can't shift or cover result layout.
    a.insertAdjacentElement('afterend', dot);
  }

  // Walks visible result anchors, skipping ones already handled and links
  // that resolve back into the search engine itself, and reserves this
  // page's badge budget synchronously (before the async batch round trip)
  // so a MutationObserver tick firing mid-flight can't double-count work.
  function collectSerpBadgeTargets() {
    if (serpBadgeBudget <= 0) return [];
    const anchors = document.querySelectorAll('a[href]');
    const targets = [];
    let scanned = 0;
    for (const a of anchors) {
      if (serpBadgeBudget <= 0 || ++scanned > 4000) break;
      if (a.__ssSerpBadge) continue;
      a.__ssSerpBadge = true;
      const host = serpResultHost(a);
      if (!host || SEARCH_HOSTS.test(host)) continue;
      targets.push({ a, host });
      serpBadgeBudget--;
    }
    return targets;
  }

  async function annotateSerpResults() {
    if (serpBadgeRunning) { serpBadgePending = true; return; }
    serpBadgeRunning = true;
    try {
      do {
        serpBadgePending = false;
        const targets = collectSerpBadgeTargets();
        if (!targets.length) break;
        const hosts = SS.dedupeCapped(targets.map((tg) => tg.host), SERP_BADGE_CAP);
        let feedResults = {};
        try {
          const res = await send('checkFeedBatch', { hosts });
          feedResults = (res && res.results) || {};
        } catch (_) { /* best-effort — local signals below still apply */ }
        for (const { a, host } of targets) {
          if (!a.isConnected) continue; // removed before the round trip resolved
          const feedHit = feedResults[host];
          let level = null;
          if (feedHit === 'block') level = 'danger';
          else if (feedHit === 'warn') level = 'caution';
          else if (SS.fuzzyBrandMatch && SS.allowlistBrandMatch && !SS.allowlistBrandMatch(host)) {
            const fuzzy = SS.fuzzyBrandMatch(host);
            if (fuzzy && (fuzzy.grade === 'strongest' || fuzzy.grade === 'strong')) level = 'caution';
          }
          if (level) paintSerpBadge(a, level);
        }
      } while (serpBadgePending);
    } catch (_) { /* badges are best-effort — never break the results page */ }
    finally { serpBadgeRunning = false; }
  }

  // MutationObserver for infinite-scroll/paginated SERPs, throttled to one
  // pass per burst of DOM churn (matches the 400ms debounce content_script.js
  // already uses for same-document navigation, below).
  function ensureSerpBadgeObserver() {
    if (serpObserverStarted || !('MutationObserver' in root)) return;
    serpObserverStarted = true;
    try {
      const mo = new MutationObserver(() => {
        clearTimeout(serpObserverTimer);
        serpObserverTimer = setTimeout(() => { annotateSerpResults(); }, 400);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  // Cross-origin credential/card exfil watch (0.10.0, Task C2) — a warn-tier
  // sibling of guardForms above. `forms` are already known (at the point they
  // were collected) to hold a password input or a card-attribute-shaped input
  // AND to post cross-origin to a non-allowlisted host; this listener does the
  // one check that can only happen at submit time — reading the actual typed
  // value and running it through Luhn (engine/constants.js isPanShaped) —
  // before deciding whether to warn at all. A password field never needs that
  // extra check: its mere presence plus a foreign, non-allowlisted action is
  // already the signal. Nothing is prevented unless the check actually trips,
  // so an unflagged submit (e.g. a "card" field that isn't holding a PAN)
  // proceeds exactly as if this listener didn't exist.
  function guardExfilForms(forms) {
    forms.forEach((form) => {
      if (form.__scamshieldExfilGuarded) return;
      form.__scamshieldExfilGuarded = true;
      form.addEventListener('submit', (ev) => {
        const hasPassword = !!form.querySelector('input[type="password"]');
        let kind = null;
        if (hasPassword) {
          kind = 'password';
        } else {
          const panInput = [...form.querySelectorAll(CARD_INPUT_SEL)]
            .find((inp) => SS.isPanShaped && SS.isPanShaped(inp.value));
          if (panInput) kind = 'card';
        }
        if (!kind) return; // not shaped like a credential/card post — let it submit
        const destHost = SS.crossOriginCredPostHost && SS.crossOriginCredPostHost(location.href, form.getAttribute('action'));
        if (!destHost) return; // action changed since collection, or no longer flaggable — fail open
        ev.preventDefault(); ev.stopPropagation();
        const reason = { code: 'crossOriginCredPost', kind: 'page', params: [destHost] };
        if (SS.actions && SS.actions.crossOriginCredToast) {
          // form.submit() is the isolated world's native (unhooked) method, so
          // "Send anyway" really submits without re-triggering this listener —
          // same technique guardForms uses for its own "Submit anyway".
          SS.actions.crossOriginCredToast(reason, () => form.submit());
        } else {
          form.submit(); // never trap the user behind a UI that failed to load
        }
        send('privacyFinding', { finding: { kind: 'cross-origin-cred-post', host: destHost, detail: kind } });
      }, true);
    });
  }

  async function run() {
    if (!SS || typeof SS.scoreUrl !== 'function') return; // engine not loaded
    // Sub-frame gate: only frames a user can actually interact with, and only
    // when they hold something phishable — keeps all_frames near-free on
    // ad-heavy pages (dozens of tiny/empty iframes early-exit here).
    if (!IS_TOP) {
      if (window.innerWidth < 80 || window.innerHeight < 80) return;
      if (!document.querySelector('form, input[type="password"]')) return;
    }
    const settings = await send('getSettings');
    if (!settings || !settings.enabled) return;
    const pageDomain = registrable(location.hostname);
    // Sponsored-search check runs even on (trusted) search-engine hosts.
    if (IS_TOP && settings.serpCheck !== false && SEARCH_HOSTS.test(location.hostname)) {
      try { checkSerp(); } catch (_) {}
      try { annotateSerpResults(); ensureSerpBadgeObserver(); } catch (_) {}
    }
    // Trusted (built-in safe list or user allowlist): report safe, do nothing else.
    if (isTrustedHost(location.hostname, settings)) {
      if (IS_TOP) await send('reportVerdict', { verdict: { level: 'safe', score: 0, reasons: [], modelUsed: false } });
      return;
    }

    const { signals, foreignForms, scamBlocks, exfilForms } = collectSignals(settings);
    // riskTlds (0.9.0, Task B3): risk.json's abused-TLD weight table, mirrored
    // into settings by background/service_worker.js's runFeedUpdate() — no new
    // message round-trip needed since `settings` is already fetched above.
    const urlRules = SS.scoreUrl(location.href, settings.riskTlds);
    let domRules = SS.scoreDom(signals);
    let modelProb = null, contentProb = null, iconMatch = false, pf = null;
    const borderline = Math.max(urlRules.score, domRules.score) >= 0.3 || signals.hasPasswordField;
    if (borderline && SS.isAvailable && SS.isAvailable()) modelProb = await SS.predict(SS.extractUrlFeatures(location.href));
    // Icon hashing + the page-content model are top-frame only: favicons are a
    // document-level concept and the page model was trained on full pages.
    if (IS_TOP && settings.pageAnalysis !== false && needsPageAnalysis(signals, urlRules, domRules)) {
      try {
        const iconsP = withTimeout(send('hashIcons', { urls: iconCandidates() }), 1200);
        if (SS.isPageModelAvailable && SS.isPageModelAvailable()) {
          pf = SS.extractPageFeatures(document, { host: location.hostname });
          const r = SS.scorePageContent(pf); if (!Number.isNaN(r.prob)) contentProb = r.prob;
        }
        const icons = await iconsP;
        if (icons && icons.matches && icons.matches.length) {
          signals.iconMatches = icons.matches; domRules = SS.scoreDom(signals);
          iconMatch = (domRules.flags || []).includes('brand-impersonation-visual');
        }
      } catch (_) { /* page analysis is best-effort */ }
    }
    let verdict = SS.fuse({ modelProb, urlRules, domRules, contentProb, iconMatch });

    // v0.9 threat-feed check (Task B2). Full hostname, not the registrable
    // domain — the feed pipeline deliberately keeps shared-hosting
    // subdomains distinct (e.g. *.web.app, *.pages.dev), so collapsing here
    // would defeat that. Every frame runs this (all_frames, like the form
    // guard): an iframe-hosted phishing form on a feed-listed domain must not
    // be invisible just because the top frame is clean. A block-tier hit gets
    // the same dangerous+interstitial treatment as a legacy OTA-blocklist
    // hit; a warn-tier hit is a suspicious-tier evidence signal. Both carry a
    // feed-* flag so the engagement gate below (which only ever suppresses a
    // flag-less "suspicious") can never silently swallow validated feed intel.
    try {
      // Bounded: the SW's shard fetch is itself timeout-capped, but the page
      // verdict must never wait on a wedged SW either (resolves null on cap).
      const feedHit = await withTimeout(send('checkFeed', { host: location.hostname }), 10000);
      if (feedHit && feedHit.hit === 'block') {
        const reason = { code: 'feedBlock', kind: 'link', params: [String((feedHit.sources || []).length)] };
        verdict = Object.assign({}, verdict, {
          level: 'dangerous', score: Math.max(verdict.score, 0.97),
          reasons: [reason].concat(verdict.reasons || []),
          reasonCodes: [reason.code].concat(verdict.reasonCodes || []),
          flags: ['feed-block'].concat(verdict.flags || [])
        });
      } else if (feedHit && feedHit.hit === 'warn' && verdict.level !== 'dangerous') {
        // An unverified hit (exact shard unavailable) has no source list yet
        // — floor the count at 1 so the warning never reads "0 sources".
        const reason = { code: 'feedWarn', kind: 'link', params: [String(Math.max(1, (feedHit.sources || []).length))] };
        verdict = Object.assign({}, verdict, {
          level: 'suspicious', score: Math.max(verdict.score, 0.6),
          reasons: [reason].concat(verdict.reasons || []),
          reasonCodes: [reason.code].concat(verdict.reasonCodes || []),
          flags: ['feed-warn'].concat(verdict.flags || [])
        });
      }
    } catch (_) { /* feed check is best-effort — never blocks the rest of the scan */ }

    // risk.json dyndns/hoster membership (0.9.0, Task B3). The abused-TLD half
    // of risk.json is scored synchronously inside SS.scoreUrl() above; this
    // half needs an async SHA-256 (background/service_worker.js's
    // checkRiskHosting()) so it folds in as post-hoc evidence here, the same
    // pattern the feed check above uses. Risk-table-class evidence (0.10.0,
    // Task C6 — see ancient-dreaming-breeze benchmark finding): folded via
    // SS.foldRiskEvidence so it can never by itself lift the verdict into
    // "dangerous" (only ever "suspicious"), and never touches a verdict
    // already dangerous on other grounds.
    try {
      const riskHit = await withTimeout(send('checkRisk', { host: location.hostname }), 3000);
      if (riskHit && riskHit.hit) {
        verdict = SS.foldRiskEvidence(verdict, 0.30, { code: 'riskDynamicHost', kind: 'link' }, 'risk-hosting');
      }
    } catch (_) { /* risk-table check is best-effort — never blocks the rest of the scan */ }

    // "New site" signal (0.10.0, Task C3): nrd.bloom membership (background/
    // service_worker.js checkNrdHost()), approximating Netcraft's "New Site"
    // domain-age indicator on-device. Risk-table-class evidence (Task C6):
    // same SS.foldRiskEvidence choke point as the dyndns/hoster fold above,
    // so this can never by itself push a page past "suspicious" alone — even
    // stacked with other risk-table signals — and never touches an
    // already-dangerous verdict. A genuine first-ever visit to this install
    // strengthens the reason's wording via the params slot.
    try {
      const nrdHit = await withTimeout(send('checkNrd', { host: location.hostname }), 3000);
      if (nrdHit && nrdHit.hit) {
        const extra = nrdHit.strengthen ? ', and you have never visited it before' : '';
        verdict = SS.foldRiskEvidence(verdict, 0.20, { code: 'newDomain', kind: 'link', params: [extra] }, 'new-domain', { minLevel: 'suspicious' });
      }
    } catch (_) { /* NRD check is best-effort — never blocks the rest of the scan */ }

    // Fake-shop check (0.6.0) — top frame, storefront pages only. Reported to
    // the popup's shopping card; a strong result nudges the verdict to at most
    // suspicious (never a full-screen block — these signals are probabilistic).
    if (IS_TOP && settings.shopGuard !== false && SS.scoreShop) {
      try {
        const shop = await collectShop((document.body ? document.body.innerText : ''), location.hostname);
        const sr = SS.scoreShop(shop);
        if (sr.flags.length) {
          send('shopFindings', { flags: sr.flags, level: sr.level });
          if (sr.level === 'suspicious' && verdict.level === 'safe') {
            // The shop detail sentence leads the evidence list; keep reasonCodes
            // (used by the report payload) in step with reasons.
            const shopReason = { code: 'shop_' + sr.flags[0].code + '_detail', kind: 'shop' };
            verdict = Object.assign({}, verdict, { level: 'suspicious', score: Math.max(verdict.score, 0.55),
              reasons: [shopReason].concat(verdict.reasons || []),
              reasonCodes: [shopReason.code].concat(verdict.reasonCodes || []) });
          }
        }
      } catch (_) { /* shop check is best-effort */ }
    }
    // Engagement gating (0.6.0, mirrors Chrome's lookalike personalisation):
    // a flag-less "suspicious" — pure heuristic/model probability, no decisive
    // signal — is suppressed on sites this user visits often. Dangerous
    // verdicts and decisive flags are never gated.
    if (verdict.level === 'suspicious' && !(verdict.flags || []).length) {
      const eng = await send('getEngagement', { domain: pageDomain });
      if (eng && eng.engaged) {
        verdict = Object.assign({}, verdict, { level: 'safe', reasons: [], reasonCodes: [], suppressed: 'engagement' });
      }
    }
    try { window.__ssLastVerdict = verdict; } catch (_) {}
    let report = null;
    try {
      report = {
        url: location.href, urlFeatures: Array.from(SS.extractUrlFeatures(location.href)),
        pageFeatures: (pf ? { tokens: pf.tokens, dense: pf.dense } : null),
        iconMatches: signals.iconMatches || [], detectors: ['page']
      };
    } catch (_) { report = null; }
    await send('reportVerdict', { verdict, report, subframe: !IS_TOP });
    if (verdict.level === 'dangerous') send('bumpThreats');

    if (verdict.level !== 'safe' && IS_TOP) {
      // Impersonation verdicts get a rescue link to the brand's real site.
      if (verdict.brand && SS.BRAND_DOMAINS && SS.BRAND_DOMAINS[verdict.brand]) {
        verdict.brandUrl = 'https://' + SS.BRAND_DOMAINS[verdict.brand][0] + '/';
        verdict.brandLabel = SS.brandDisplayName ? SS.brandDisplayName(verdict.brand) : verdict.brand;
      }
      // Interstitial tier (0.6.0): decisive, near-zero-FP flags block the
      // interaction outright; everything else keeps the banner. The
      // credential-form case stays a banner because its ACTIVE moment is the
      // submit guard — the interstitial is for scams with no submit moment.
      const DECISIVE_INTERSTITIAL = ['seed-phrase-harvest', 'clickfix', 'fake-browser-update', 'delivery-fee-scam', 'feed-block'];
      const handlers = { onLeave: () => send('leaveTab'), onReport: () => send('userReport', { label: 'false_positive' }) };
      // Strict mode (0.6.0): for a less-confident user, ANY non-safe verdict
      // gets the blocking interstitial, not just decisive flags.
      const decisive = verdict.level === 'dangerous' && (verdict.flags || []).some((f) => DECISIVE_INTERSTITIAL.includes(f));
      if ((decisive || settings.strictMode === true) && SS.actions.dangerInterstitial) {
        // "Continue anyway" on a decisive scam just dismisses (no trust granted —
        // one click must never permanently trust a seed-phrase harvester). In
        // strict mode on a merely-suspicious page it trusts, so the user isn't
        // re-blocked every load.
        const extra = decisive ? handlers : Object.assign({}, handlers, { onDismiss: () => send('allowSite', { domain: pageDomain }) });
        SS.actions.dangerInterstitial(verdict, extra);
      } else {
        SS.actions.showBanner(verdict, async () => {
          await send('allowSite', { domain: pageDomain });
          SS.actions.clearAll();
        }, handlers);
      }
      // One-time-ever support ask, only after ScamShield visibly earned it.
      if (verdict.level === 'dangerous' && !settings.supportAskShown && SS.actions.supportToast) {
        send('setSettings', { patch: { supportAskShown: true } });
        setTimeout(() => SS.actions.supportToast(), 1500);
      }
    }
    // The form guard runs in every frame — blocking a submit inside a
    // credential iframe is exactly the all_frames win. Content hiding stays
    // top-frame (frames are too small for the overlay tag to make sense).
    if (foreignForms.length) SS.actions.guardForms(foreignForms, verdict.reasons, () => send('userReport', { label: 'false_positive' }));
    // Reuses leakyFormGuard (0.10.0, Task C2): the closest existing warn-tier
    // "form leak before/at submit" toggle — see task-c2-report.md for why no
    // new setting was added.
    if (settings.leakyFormGuard !== false && exfilForms.length) guardExfilForms(exfilForms);
    if (settings.hideScamContent && scamBlocks.length && IS_TOP) SS.actions.hideScamBlocks(scamBlocks);
  }

  let lastUrl = location.href;
  let navTimer = null;
  window.addEventListener('scamshield:navigate', () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    clearTimeout(navTimer);
    // A same-document SPA re-search (e.g. a new query on a search engine
    // that doesn't hard-navigate) gets a fresh badge budget — the old result
    // anchors are gone from the DOM either way, so the cap should reset with
    // them rather than staying exhausted for the rest of the tab's life.
    serpBadgeBudget = SERP_BADGE_CAP;
    navTimer = setTimeout(() => { if (SS && SS.actions) SS.actions.clearAll(); run(); }, 400);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})(typeof globalThis !== 'undefined' ? globalThis : self);
