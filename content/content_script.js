(function (root) {
  'use strict';
  if (root.__scamshieldIsolatedGuard) return; // avoid duplicate listeners on re-injection
  root.__scamshieldIsolatedGuard = true;
  const api = root.browser || root.chrome;
  const SS = root.ScamShield;
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
    if (!settings || !settings.enabled) { reply(detail.id, true); return; }
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
    if (isTrustedHost(location.hostname, settings)) return;
    SS.actions.clipboardToast((e && e.detail) || {});
    send('bumpThreats', { kind: 'clipboard' });
  });
  let techSignal = { dialogFloodCount: 0, fullscreenOnLoad: false, beforeUnloadCount: 0 };
  let techShown = false;
  window.addEventListener('scamshield:techscam-signal', async (e) => {
    techSignal = Object.assign(techSignal, (e && e.detail) || {});
    if (techShown || !SS || typeof SS.scoreTechScam !== 'function' || !SS.actions) return;
    const settings = await send('getSettings');
    if (!settings || !settings.enabled) return;
    if (isTrustedHost(location.hostname, settings)) return;
    const text = (document.body ? document.body.innerText : '').slice(0, 20000);
    const r = SS.scoreTechScam({
      text, fullscreenOnLoad: techSignal.fullscreenOnLoad,
      dialogFloodCount: techSignal.dialogFloodCount, historyTrap: techSignal.beforeUnloadCount >= 2
    });
    if (r.score >= (SS.THRESHOLDS ? SS.THRESHOLDS.dangerous : 0.8)) {
      techShown = true;
      SS.actions.techScamEscapeOverlay({ level: 'dangerous', reasons: r.reasons }, () => {
        try { window.dispatchEvent(new CustomEvent('scamshield:techscam-escape')); } catch (_) {}
      });
      send('reportVerdict', { verdict: { level: 'dangerous', score: r.score, reasons: r.reasons, modelUsed: false } });
      send('bumpThreats', { kind: 'techscam' });
    }
  });

  function collectSignals() {
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

    return {
      signals: {
        pageHost, hasPasswordField: passwordForms.length > 0, passwordFormActions, hiddenIframeCount, scamPhrases,
        titleBrand, ogSiteName, faviconHost, logoAltBrands, seedPhraseForm
      },
      foreignForms, scamBlocks
    };
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
    // Trusted (built-in safe list or user allowlist): report safe, do nothing else.
    if (isTrustedHost(location.hostname, settings)) {
      if (IS_TOP) await send('reportVerdict', { verdict: { level: 'safe', score: 0, reasons: [], modelUsed: false } });
      return;
    }

    const { signals, foreignForms, scamBlocks } = collectSignals();
    const urlRules = SS.scoreUrl(location.href);
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
    // Engagement gating (0.6.0, mirrors Chrome's lookalike personalisation):
    // a flag-less "suspicious" — pure heuristic/model probability, no decisive
    // signal — is suppressed on sites this user visits often. Dangerous
    // verdicts and decisive flags are never gated.
    if (verdict.level === 'suspicious' && !(verdict.flags || []).length) {
      const eng = await send('getEngagement', { domain: pageDomain });
      if (eng && eng.engaged) {
        verdict = Object.assign({}, verdict, { level: 'safe', reasons: [], suppressed: 'engagement' });
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
      const DECISIVE_INTERSTITIAL = ['seed-phrase-harvest'];
      const handlers = { onLeave: () => send('leaveTab'), onReport: () => send('userReport', { label: 'false_positive' }) };
      if (verdict.level === 'dangerous' && (verdict.flags || []).some((f) => DECISIVE_INTERSTITIAL.includes(f)) && SS.actions.dangerInterstitial) {
        SS.actions.dangerInterstitial(verdict, handlers);
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
    if (settings.hideScamContent && scamBlocks.length && IS_TOP) SS.actions.hideScamBlocks(scamBlocks);
  }

  let lastUrl = location.href;
  let navTimer = null;
  window.addEventListener('scamshield:navigate', () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    clearTimeout(navTimer);
    navTimer = setTimeout(() => { if (SS && SS.actions) SS.actions.clearAll(); run(); }, 400);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})(typeof globalThis !== 'undefined' ? globalThis : self);
