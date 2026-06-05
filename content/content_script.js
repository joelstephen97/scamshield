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
    return String(host || '').toLowerCase().split('.').filter(Boolean).slice(-2).join('.');
  }

  function collectSignals() {
    const pageHost = location.hostname;
    const passwordForms = [...document.querySelectorAll('form')]
      .filter((f) => f.querySelector('input[type="password"]'));
    const passwordFormActions = passwordForms.map((f) => f.getAttribute('action') || location.href);
    const foreignForms = passwordForms.filter((f) => {
      try {
        const h = new URL(f.getAttribute('action') || location.href, location.href).hostname;
        return registrable(h) !== registrable(pageHost);
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

    return {
      signals: { pageHost, hasPasswordField: passwordForms.length > 0, passwordFormActions, hiddenIframeCount, scamPhrases },
      foreignForms, scamBlocks
    };
  }

  async function run() {
    if (!SS || typeof SS.scoreUrl !== 'function') return; // engine not loaded
    const settings = await send('getSettings');
    if (!settings || !settings.enabled) return;
    const pageDomain = registrable(location.hostname);
    if ((settings.allowlist || []).includes(pageDomain)) return;

    // Built-in safe-domain allowlist: skip warnings on top legitimate sites.
    const host = location.hostname.toLowerCase();
    if ((SS.SAFE_DOMAINS || []).some((d) => host === d || host.endsWith('.' + d))) {
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

    if (verdict.level !== 'safe') {
      SS.actions.showBanner(verdict, async () => {
        await send('allowSite', { domain: pageDomain });
        SS.actions.clearAll();
      });
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
