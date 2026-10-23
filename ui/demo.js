// ui/demo.js — onboarding step 1, "See it work" (0.15.0, Task 19).
//
// demo.html loads the real surface code (content/surfaces/styles.js, primitives.js and content/actions.js) as plain
// scripts and draws the warning over a pretend "PayPa1" sign-in page. Extension pages get no content scripts, so this
// is a rendering of the warning, not the live detection path. Nothing here can reach a real site or write anything:
//  - ScamShield.isTenantApex is forced true, so actions.js offers no Trust control and "Continue anyway" stores no pause
//    (canStore() is false); noTrust:true removes the remaining allowlist paths;
//  - the real-site rescue buttons are cloned (which drops their listeners) and sent back to onboarding instead of the
//    real brand site;
//  - the Copy report buttons are removed (they would copy this page's own extension address);
//  - the address / "this site" rows that actions.js fills from location.* are replaced with the fake look-alike address.
'use strict';
(function () {
  const SS = globalThis.ScamShield;
  const A = SS && SS.actions;
  const i18n = globalThis.SSi18n;
  const $ = (id) => document.getElementById(id);
  if (!A) return;
  SS.isTenantApex = () => true;

  const FAKE_ADDR = 'https://paypa1-secure-login.example/signin';
  const FAKE_HOST = 'paypa1-secure-login.example';
  const goSetup = () => { location.href = 'onboarding.html#2'; };
  // A dangerous verdict in the shape content_script builds. brandUrl only feeds the "real site" comparison row.
  const verdict = {
    level: 'dangerous', score: 0.97, flags: ['brand-impersonation-content'], brandLabel: 'PayPal', brandUrl: 'https://www.paypal.com/',
    reasons: [
      { code: 'brandImpersonationContent', kind: 'content', params: ['PayPal'] },
      { code: 'credentialFormForeignDomain', kind: 'form' },
      { code: 'newDomain', kind: 'url' }
    ],
    reasonCodes: ['brandImpersonationContent', 'credentialFormForeignDomain', 'newDomain']
  };

  let mode = 'banner';
  function root(kind) { const h = document.querySelector('scamshield-surface[data-kind=' + kind + ']'); return h && h.shadowRoot; }
  function tidy(sr) {
    if (!sr) return;
    sr.querySelectorAll('.ss-copy').forEach((b) => b.remove());
    // The real-brand button says what it does here: it is a demo, so it goes back to setup.
    sr.querySelectorAll('.ss-rescue, .ss-rescue-ghost').forEach((b) => { const c = b.cloneNode(true); c.textContent = (i18n && i18n.t && i18n.t('demoRescue')) || 'Back to setup (this is a demo)'; b.replaceWith(c); c.addEventListener('click', goSetup); });
    sr.querySelectorAll('.ss-cmp-fake b').forEach((b) => { b.textContent = FAKE_HOST; });
    sr.querySelectorAll('.ss-addr code').forEach((c) => { c.textContent = FAKE_ADDR; });
  }
  // The banner is a floating card at the top of the viewport on >=600px: park it just below the demo's label strip
  // instead of on top of it. (On phones it is a bottom sheet and needs no help.)
  function place() {
    const sr = root('banner'); const bar = sr && sr.querySelector('.scamshield-banner');
    if (!bar) return;
    if (matchMedia('(min-width:600px)').matches) bar.style.insetBlockStart = Math.round($('strip').getBoundingClientRect().bottom + 12) + 'px';
    else bar.style.removeProperty('inset-block-start');
  }
  // The stop page covers the whole viewport, and with it the label: put the label on the card too.
  function tag(sr) {
    const card = sr && sr.querySelector('.ss-card');
    if (!card || card.querySelector('.ss-demo-tag')) return;
    const t = document.createElement('p');
    t.className = 'ss-demo-tag';
    t.textContent = (i18n && i18n.t && i18n.t('demoLabel')) || 'This is what a warning looks like';
    t.setAttribute('style', 'margin:0 0 12px;padding:4px 10px;border-radius:99px;background:var(--ss-accent-soft);color:var(--ss-accent);font-weight:600;font-size:.9em;inline-size:fit-content;max-inline-size:100%');
    card.insertBefore(t, card.firstChild);
  }
  function show(next) {
    mode = next;
    $('tabBanner').setAttribute('aria-pressed', String(mode === 'banner'));
    $('tabStop').setAttribute('aria-pressed', String(mode === 'stop'));
    A.clearAll();
    const x = {
      noTrust: true, onLeave: goSetup, onReport() {}, onHide() {},
      // "Continue anyway" on the stop page, or the banner's close button: nothing is stored; the demo shows the banner view.
      onDismiss() { if (mode === 'stop') show('banner'); }
    };
    if (mode === 'stop') { A.dangerInterstitial(verdict, x); const sr = root('interstitial'); tidy(sr); tag(sr); }
    else { A.showBanner(verdict, x); tidy(root('banner')); place(); }
  }
  $('tabBanner').addEventListener('click', () => show('banner'));
  $('tabStop').addEventListener('click', () => show('stop'));
  addEventListener('resize', place);
  // Wait for the language override (Options) so the surfaces render in the chosen language, then draw the banner.
  Promise.resolve(i18n && i18n.ready).catch(() => {}).then(() => show('banner'));
})();
