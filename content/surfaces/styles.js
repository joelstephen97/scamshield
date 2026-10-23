// content/surfaces/styles.js — CSS text for the in-page surfaces (0.15.0, Part 2).
// Shipped as JS strings (applied with adoptedStyleSheets) so the manifest needs no
// web_accessible_resources, which would be a fingerprinting surface. Logical properties only (RTL).
// `all:initial` on the host resets every inherited/standard property but NOT custom properties, so
// the tokens below live on :host while font/colour go on each card class.
(function (root) {
  'use strict';
  const LIGHT = '--ss-surface:#fff;--ss-text:#15211B;--ss-muted:#5E6F67;--ss-hair:#DFE7E2;--ss-accent:#0B6E4F;--ss-danger:#B42318;--ss-warn:#9A5B00;--ss-warn-bg:#FFF1D6;--ss-radius:10px;--ss-chip:6px;--ss-danger-bg:#FDE9E7;--ss-accent-soft:#E3F1EA;--ss-safe:#1B7F3B;--ss-safe-bg:#E5F4EA;--ss-ground:#F5F8F6;--ss-unknown-bg:#EEF1EF;';
  const DARK = '--ss-surface:#171F1B;--ss-text:#E7EEEA;--ss-muted:#9AAAA2;--ss-hair:#27342D;--ss-accent:#3FB489;--ss-danger:#F87171;--ss-warn:#FBBF24;--ss-warn-bg:#2A2110;--ss-danger-bg:#2D1513;--ss-accent-soft:#16302A;--ss-safe:#4ADE80;--ss-safe-bg:#10281A;--ss-ground:#0F1513;--ss-unknown-bg:#1F2623;';

  // Shared by every surface: tokens (light default, dark by attribute or by OS when auto), box model,
  // and the tile / button / comparison primitives that actions.js builds.
  const base =
    ':host{' + LIGHT + 'color-scheme:light}\n' +
    ':host([data-theme=dark]){' + DARK + 'color-scheme:dark}\n' +
    '@media (prefers-color-scheme: dark){:host([data-theme=auto]){' + DARK + 'color-scheme:dark}}\n' +
    '*{box-sizing:border-box;font:inherit}\n' +
    '.ss-tile{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none}\n' +
    '.ss-tile svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}\n' +
    '.ss-tile.danger{background:var(--ss-danger-bg);color:var(--ss-danger)}.ss-tile.warn{background:var(--ss-warn-bg);color:var(--ss-warn)}.ss-tile.info{background:var(--ss-accent-soft);color:var(--ss-accent)}.ss-tile.ok{background:var(--ss-safe-bg);color:var(--ss-safe)}\n' +
    '.ss-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;min-width:24px;padding:0 12px;border-radius:8px;border:1px solid var(--ss-hair);background:var(--ss-surface);color:var(--ss-text);font-weight:500;cursor:pointer;white-space:nowrap;line-height:1.2}\n' +
    '.ss-btn.primary{background:var(--ss-accent);color:#fff;border-color:var(--ss-accent);font-weight:600}\n' +
    '.ss-btn.quiet{border-color:transparent;background:transparent;color:var(--ss-accent)}\n' +
    '.ss-btn.ss-x,.ss-btn.ss-more{width:32px;padding:0;border-color:transparent;background:transparent;color:var(--ss-muted);font-size:16px}\n' +
    '.ss-btn:focus-visible{outline:2px solid var(--ss-accent);outline-offset:2px}\n' +
    '.ss-btn:disabled{opacity:.55;cursor:not-allowed}\n' +
    '@media (pointer: coarse){.ss-btn{min-height:44px;min-width:44px}.ss-btn.ss-x,.ss-btn.ss-more{width:44px}}\n' +
    '.ss-compare{display:flex;gap:8px;align-items:center;margin-top:8px;padding:8px 10px;border:1px solid var(--ss-hair);border-radius:var(--ss-chip);background:var(--ss-surface);color:var(--ss-text);max-inline-size:100%;overflow:hidden}\n' +
    '.ss-compare small{display:block;font-size:11px;color:var(--ss-muted)}\n' +
    '.ss-compare b{font-weight:600;word-break:break-all}\n' +
    '.ss-compare .ss-cmp-fake b{color:var(--ss-danger);text-decoration:line-through}\n' +
    '.ss-compare .ss-cmp-real b{color:var(--ss-accent)}\n' +
    '.ss-compare .ss-cmp-vs{color:var(--ss-muted);flex:none;font-weight:700}\n';

  // Filled in by Tasks 12-13 (banner, interstitial and dialogs move onto the host then).
  const banner = '';
  const dialog = '';

  // Toast family + trust acknowledgement. The ack carries both root classes (it is a toast-shaped bar).
  const toast =
    '.scamshield-toast,.scamshield-ack{position:fixed;inset-block-end:calc(12px + env(safe-area-inset-bottom,0px));inset-inline-end:calc(12px + env(safe-area-inset-right,0px));z-index:2147483647;inline-size:min(380px,calc(100vw - 24px));background:var(--ss-surface);color:var(--ss-text);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;border:1px solid var(--ss-hair);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.22),0 1px 2px rgba(0,0,0,.08);padding:12px 12px 10px;display:grid;grid-template-columns:36px 1fr;gap:4px 12px;align-items:start}\n' +
    '.scamshield-ack{grid-template-columns:36px 1fr auto;align-items:center}\n' +
    '@media (max-width:599px){.scamshield-toast,.scamshield-ack{inset-inline:calc(12px + env(safe-area-inset-left,0px)) calc(12px + env(safe-area-inset-right,0px));inline-size:auto}}\n' +
    '@media (prefers-reduced-motion: no-preference){.scamshield-toast,.scamshield-ack{animation:ss-in .18s ease-out}@keyframes ss-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}\n' +
    '.scamshield-toast .ss-title{font-weight:600;line-height:1.3;padding-block-start:2px}\n' +
    '.scamshield-toast .ss-body{grid-column:2;color:var(--ss-muted);font-size:13px;line-height:1.45}\n' +
    '.scamshield-toast .ss-acts{grid-column:2;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-block-start:8px}\n' +
    '.scamshield-toast .ss-acts .ss-x{margin-inline-start:auto}\n' +
    '.scamshield-toast .ss-acts .ss-report{color:var(--ss-muted);text-decoration:underline;text-underline-offset:2px}\n' +
    '.scamshield-ack .ss-title{grid-column:2}\n' +
    '.scamshield-ack .ss-acts{grid-column:3;margin-block-start:0}\n' +
    '.scamshield-toast .ss-prog{grid-column:1/-1;block-size:2px;background:var(--ss-hair);border-radius:2px;margin-block-start:8px;overflow:hidden}\n' +
    '.scamshield-toast .ss-prog i{display:block;block-size:100%;inline-size:100%;background:var(--ss-accent);opacity:.6;transform-origin:0 50%;transition:transform linear}\n' +
    '[dir=rtl] .scamshield-toast .ss-prog i{transform-origin:100% 50%}\n' +
    '@media (prefers-reduced-motion: reduce){.scamshield-toast .ss-prog i{transition:none}}\n';

  root.ScamShield = root.ScamShield || {};
  root.ScamShield.surfaceCss = { base, banner, dialog, toast };
})(typeof globalThis !== 'undefined' ? globalThis : self);
