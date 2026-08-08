(function (root) {
  'use strict';
  if (root.__scamshieldIsolatedGuard) return; // avoid duplicate listeners on re-injection
  root.__scamshieldIsolatedGuard = true;
  const api = root.browser || root.chrome;
  const SS = root.ScamShield;

  function send(type, extra) {
    return new Promise((res) => {
      try { api.runtime.sendMessage(Object.assign({ type }, extra), (r) => res(r)); }
      catch (_) { res(null); }
    });
  }

  function registrable(host) {
    if (SS && typeof SS.registrableDomain === 'function') return SS.registrableDomain(host);
    return String(host || '').toLowerCase().split('.').filter(Boolean).slice(-2).join('.');
  }

  // Built-in safe list OR the user's own trusted sites. Gates every warning
  // surface (page scan, wallet overlay, clipboard toast, tech-scam overlay) —
  // a site the user trusts must never nag them.
  function isTrustedHost(host, settings) {
    if (SS && typeof SS.isSafeHost === 'function' && SS.isSafeHost(host)) return true;
    return ((settings && settings.allowlist) || []).includes(registrable(host));
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
    const logoAltBrands = [...document.querySelectorAll('img[alt],[aria-label]')]
      .slice(0, 40).map((n) => (n.getAttribute('alt') || n.getAttribute('aria-label') || '').toLowerCase());

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
    const settings = await send('getSettings');
    if (!settings || !settings.enabled) return;
    const pageDomain = registrable(location.hostname);
    // Trusted (built-in safe list or user allowlist): report safe, do nothing else.
    if (isTrustedHost(location.hostname, settings)) {
      await send('reportVerdict', { verdict: { level: 'safe', score: 0, reasons: [], modelUsed: false } });
      return;
    }

    const { signals, foreignForms, scamBlocks } = collectSignals();
    const urlRules = SS.scoreUrl(location.href);
    const domRules = SS.scoreDom(signals);

    // Model: only invoke when borderline or credentials present, to limit overhead.
    let modelProb = null;
    const borderline = Math.max(urlRules.score, domRules.score) >= 0.3 || signals.hasPasswordField;
    if (borderline && SS.isAvailable && SS.isAvailable()) {
      modelProb = await SS.predict(SS.extractUrlFeatures(location.href));
    }

    const verdict = SS.fuse({ modelProb, urlRules, domRules });
    await send('reportVerdict', { verdict });
    if (verdict.level === 'dangerous') send('bumpThreats');

    if (verdict.level !== 'safe') {
      // Impersonation verdicts get a rescue link to the brand's real site.
      if (verdict.brand && SS.BRAND_DOMAINS && SS.BRAND_DOMAINS[verdict.brand]) {
        verdict.brandUrl = 'https://' + SS.BRAND_DOMAINS[verdict.brand][0] + '/';
      }
      SS.actions.showBanner(verdict, async () => {
        await send('allowSite', { domain: pageDomain });
        SS.actions.clearAll();
      });
      // One-time-ever support ask, only after ScamShield visibly earned it.
      if (verdict.level === 'dangerous' && !settings.supportAskShown && SS.actions.supportToast) {
        send('setSettings', { patch: { supportAskShown: true } });
        setTimeout(() => SS.actions.supportToast(), 1500);
      }
    }
    if (foreignForms.length) SS.actions.guardForms(foreignForms);
    if (settings.hideScamContent && scamBlocks.length) SS.actions.hideScamBlocks(scamBlocks);
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
