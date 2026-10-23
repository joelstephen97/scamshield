// content/surfaces/styles.js — CSS text for the in-page surfaces (0.15.0, Part 2).
// Shipped as JS strings (applied with adoptedStyleSheets) so the manifest needs no
// web_accessible_resources, which would be a fingerprinting surface. Logical properties only (RTL).
// `all:initial` on the host resets every inherited/standard property but NOT custom properties, so
// the tokens below live on :host while font/colour go on each card class.
(function (root) {
  'use strict';
  const LIGHT = '--ss-surface:#fff;--ss-text:#15211B;--ss-muted:#5E6F67;--ss-hair:#DFE7E2;--ss-accent:#0B6E4F;--ss-danger:#B42318;--ss-warn:#9A5B00;--ss-warn-bg:#FFF1D6;--ss-radius:10px;--ss-chip:6px;--ss-danger-bg:#FDE9E7;--ss-accent-soft:#E3F1EA;--ss-safe:#1B7F3B;--ss-safe-bg:#E5F4EA;--ss-ground:#F5F8F6;--ss-unknown-bg:#EEF1EF;--ss-on-accent:#fff;--ss-danger-solid:#B42318;';
  const DARK = '--ss-surface:#171F1B;--ss-text:#E7EEEA;--ss-muted:#9AAAA2;--ss-hair:#27342D;--ss-accent:#3FB489;--ss-danger:#F87171;--ss-warn:#FBBF24;--ss-warn-bg:#2A2110;--ss-danger-bg:#2D1513;--ss-accent-soft:#16302A;--ss-safe:#4ADE80;--ss-safe-bg:#10281A;--ss-ground:#0F1513;--ss-unknown-bg:#1F2623;--ss-on-accent:#06130E;--ss-danger-solid:#B91C1C;';

  // Phone layout, emitted under BOTH the narrow-viewport media query and :host([data-compact]) (0.15.0, Task 14b).
  // A page with no <meta viewport> gets a ~980px layout viewport on a phone, so the media query never matches;
  // primitives.js then sets data-compact and zooms the card back to device size, and the same rule list applies.
  // rules: [[selector, declarations], ...]; selectors may be comma lists (no commas inside parentheses).
  const COMPACT = ':host([data-compact]) ';
  const phone = (rules) =>
    '@media (max-width:599px){\n' + rules.map((r) => r[0] + '{' + r[1] + '}').join('\n') + '\n}\n' +
    rules.map((r) => r[0].split(',').map((x) => COMPACT + x.trim()).join(',') + '{' + r[1] + '}').join('\n') + '\n';

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
    '.ss-btn.primary{background:var(--ss-accent);color:var(--ss-on-accent);border-color:var(--ss-accent);font-weight:600}\n' +
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

  // Banner (0.15.0, Task 12): a floating card at the top centre (never full-bleed) on >=600px, a bottom
  // sheet on phones. Logical properties only; the danger tier uses --ss-danger-solid so white text stays
  // >=4.5:1 in dark too (the dark --ss-danger is a light red meant for text on dark surfaces).
  const banner =
    '.scamshield-banner{position:fixed;inset-block-start:max(12px,env(safe-area-inset-top,0px));inset-inline:0;margin-inline:auto;inline-size:min(880px,calc(100vw - 24px));z-index:2147483647;display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:var(--ss-radius);box-shadow:0 8px 28px rgba(0,0,0,.28),0 1px 2px rgba(0,0,0,.1);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ss-text)}\n' +
    '@media (prefers-reduced-motion: no-preference){.scamshield-banner{animation:ss-banner-in .18s ease-out}@keyframes ss-banner-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}}\n' +
    '.scamshield-banner.danger{background:var(--ss-danger-solid);color:#fff}\n' +
    '.scamshield-banner.danger .ss-tile{background:rgba(255,255,255,.18);color:#fff}\n' +
    '.scamshield-banner.suspicious{background:var(--ss-warn-bg);color:var(--ss-text);border:1px solid var(--ss-warn)}\n' +
    '.scamshield-banner.suspicious .ss-tile{background:var(--ss-surface);color:var(--ss-warn)}\n' +
    '.scamshield-banner .ss-text{flex:1;min-inline-size:0;display:flex;flex-direction:column;gap:2px}\n' +
    '.scamshield-banner .ss-text b{font-weight:600;line-height:1.3;overflow-wrap:anywhere}\n' +
    '.scamshield-banner .ss-reason{font-size:13px;overflow-wrap:anywhere}\n' +
    '.scamshield-banner .ss-why{display:inline-flex;align-items:center;min-block-size:32px;min-inline-size:32px;background:none;border:0;padding:0;margin-inline-start:6px;color:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer;font:inherit;font-size:13px;vertical-align:middle}\n' +
    '@media (pointer: coarse){.scamshield-banner .ss-why{min-block-size:44px;min-inline-size:44px}}\n' +
    '.scamshield-banner .ss-why:focus-visible{outline:2px solid currentColor;outline-offset:2px}\n' +
    '.scamshield-banner .ss-why-list{list-style:none;margin:6px 0 0;padding:0;font-size:13px}.scamshield-banner .ss-why-list[hidden]{display:none}.scamshield-banner .ss-why-list li{padding:3px 0}\n' +
    '.scamshield-banner .ss-compare{align-self:flex-start;margin-block-start:6px;background:rgba(255,255,255,.14);border:0;color:inherit}\n' +
    '.scamshield-banner.danger .ss-compare small{color:rgba(255,255,255,.86)}.scamshield-banner.danger .ss-compare .ss-cmp-fake b{color:#fff}.scamshield-banner.danger .ss-compare .ss-cmp-real b{color:#fff;font-weight:700}.scamshield-banner.danger .ss-compare .ss-cmp-vs{color:rgba(255,255,255,.86)}\n' +
    '.scamshield-banner .ss-acts{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;flex:0 1 auto;align-self:center;position:relative}\n' +
    '.scamshield-banner.danger .ss-acts>.ss-btn{border-color:rgba(255,255,255,.7);color:#fff;background:transparent}\n' +
    '.scamshield-banner.danger .ss-acts>.ss-btn.primary{background:#fff;color:var(--ss-danger-solid);border-color:#fff}\n' +
    '.scamshield-banner.danger .ss-acts>.ss-x,.scamshield-banner.danger .ss-acts>.ss-more{border-color:transparent}\n' +
    '.scamshield-banner.suspicious .ss-acts>.ss-btn{background:var(--ss-surface)}\n' +
    '.scamshield-banner.suspicious .ss-acts>.ss-x,.scamshield-banner.suspicious .ss-acts>.ss-more{background:transparent;color:var(--ss-text)}\n' +
    '.scamshield-banner .ss-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}\n' +
    '.scamshield-banner .ss-btn.ss-x{inline-size:auto;max-inline-size:100%;padding:4px 10px;gap:6px;white-space:normal;text-align:center;font-size:13px}\n' +
    '.scamshield-banner .ss-x .ss-x-glyph{font-size:16px;flex:none}\n' +
    '.scamshield-banner .ss-menu{position:absolute;inset-inline-end:0;inset-block-start:calc(100% + 8px);background:var(--ss-surface);color:var(--ss-text);border:1px solid var(--ss-hair);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:4px;min-inline-size:200px;max-inline-size:min(320px,calc(100vw - 24px));display:flex;flex-direction:column;z-index:1}\n' +
    '.scamshield-banner .ss-menu[hidden]{display:none}\n' +
    '.scamshield-banner .ss-menu .ss-btn{text-align:start;border-color:transparent;background:transparent;color:var(--ss-text);justify-content:flex-start;border-radius:6px;white-space:normal}\n' +
    '.scamshield-banner .ss-menu .ss-btn:hover,.scamshield-banner .ss-menu .ss-btn:focus-visible{background:var(--ss-accent-soft);color:var(--ss-accent);outline-offset:-2px}\n' +
    phone([
    [".scamshield-banner", "inset-block-start:auto;inset-block-end:0;inset-inline:0;margin-inline:0;inline-size:auto;flex-wrap:wrap;border-start-start-radius:var(--ss-radius);border-start-end-radius:var(--ss-radius);border-end-start-radius:0;border-end-end-radius:0;padding-block-end:max(12px,env(safe-area-inset-bottom,0px));padding-inline:max(14px,env(safe-area-inset-left,0px)) max(14px,env(safe-area-inset-right,0px));max-block-size:calc(100dvh - 24px);overflow:auto"],
    [".scamshield-banner[dir=rtl]", "padding-inline:max(14px,env(safe-area-inset-right,0px)) max(14px,env(safe-area-inset-left,0px))"],
    [".scamshield-banner .ss-acts", "flex:1 1 100%;inline-size:100%;align-self:stretch;justify-content:flex-start"],
    [".scamshield-banner .ss-acts>.ss-btn", "flex:1 1 auto;min-block-size:44px;min-inline-size:44px"],
    [".scamshield-banner .ss-acts>.ss-more,.scamshield-banner .ss-acts>.ss-x", "flex:0 0 auto"],
    [".scamshield-banner .ss-x .ss-x-label", "display:none"],
    [".scamshield-banner .ss-btn.ss-x", "inline-size:44px;padding:0"],
    [".scamshield-banner .ss-menu", "position:static;flex:1 1 100%;inline-size:100%;max-inline-size:none;margin-block-start:4px;box-shadow:none"],
    [".scamshield-banner .ss-menu .ss-btn", "min-block-size:44px"]
    ]) +
    // data-compact only: the card is zoomed back to device size (--ss-z) and fills the host, which primitives.js pins to the
    // visual viewport (so the sheet sits at the bottom of what the user sees). 100dvh would be the 980px layout viewport.
    ':host([data-compact]) .scamshield-banner{zoom:var(--ss-z);pointer-events:auto;max-block-size:calc(100% - 24px)}\n';

  // Interstitial + dialogs (0.15.0, Task 13): a native <dialog> opened with showModal() (top layer, the rest of the page
  // inert). The <dialog> is the full-viewport frame; its .ss-card is centred in it and scrolls on its own, so a long
  // translation can never push a button off-screen. Logical properties only; --ss-on-accent keeps the dark primary readable.
  const dialog =
    ".scamshield-overlay{position:fixed;inset:0;margin:0;padding:12px;border:0;inline-size:100%;block-size:100%;max-inline-size:none;max-block-size:none;background:transparent;color:var(--ss-text);overflow:hidden;font:13px/1.45 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif}\n" +
    ".scamshield-overlay[open]{display:flex;align-items:center;justify-content:center}\n" +
    ".scamshield-overlay::backdrop{background:rgba(10,16,13,.55)}\n" +
    ".scamshield-overlay .ss-card{box-sizing:border-box;inline-size:min(560px,100vw - 32px);max-block-size:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;background:var(--ss-surface);color:var(--ss-text);padding:20px;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);font-size:clamp(13px,.45vw + 8.5px,18px);overflow-wrap:anywhere}\n" +
    ".scamshield-overlay .ss-head{display:flex;gap:12px;align-items:center;margin-block-end:10px}\n" +
    ".scamshield-overlay h3{margin:0;font-size:1.3em;font-weight:600;line-height:1.25;letter-spacing:-.01em;color:var(--ss-text)}\n" +
    ".scamshield-overlay p{margin:0;font-size:1.04em}.scamshield-overlay .ss-sub{color:var(--ss-muted);font-size:1em;margin-block-start:10px}\n" +
    ".scamshield-overlay .ss-evidence{list-style:none;margin:12px 0 0;padding:0}.scamshield-overlay .ss-evidence li{padding:7px 0;border-block-start:1px solid var(--ss-hair);display:flex;gap:8px;font-size:1em}.scamshield-overlay .ss-evidence li:first-child{border-block-start:0;padding-block-start:0}\n" +
    ".scamshield-overlay .ss-chip{font-size:.85em;line-height:1;padding:4px 7px;border-radius:6px;background:var(--ss-unknown-bg);color:var(--ss-muted);flex:none;block-size:fit-content}\n" +
    ".scamshield-overlay .ss-actions{display:flex;gap:8px;margin-block-start:14px;justify-content:flex-end;align-items:center;flex-wrap:wrap}\n" +
    ".scamshield-overlay .ss-btn{white-space:normal;text-align:center;min-inline-size:0;max-inline-size:100%}\n" +
    ".scamshield-overlay .ss-primary{background:var(--ss-accent);color:var(--ss-on-accent);border-color:var(--ss-accent);font-weight:600}\n" +
    ".scamshield-overlay .ss-rescue-ghost{color:var(--ss-accent);border-color:var(--ss-accent);font-weight:600}\n" +
    ".scamshield-overlay .ss-danger-ghost{color:var(--ss-danger);border-color:var(--ss-danger)}\n" +
    ".scamshield-overlay .ss-report{margin-inline-end:auto;border-color:transparent;color:var(--ss-accent)}\n" +
    ".scamshield-overlay .ss-btn:focus-visible,.scamshield-overlay summary:focus-visible{outline:2px solid var(--ss-accent);outline-offset:2px}\n" +
    "/* Interstitial = full-viewport STOP PAGE (blocked.html layout): an opaque dialog, the card centred in it. */\n" +
    ".scamshield-interstitial{background:var(--ss-ground)}\n" +
    ".scamshield-interstitial .ss-card{background:transparent;box-shadow:none;border-radius:0;padding:24px}\n" +
    ".scamshield-interstitial h3{font-size:1.7em;line-height:1.2}\n" +
    ".scamshield-interstitial .ss-lead{font-size:1.12em;line-height:1.5;margin-block-end:12px;max-inline-size:60ch}\n" +
    ".scamshield-interstitial .ss-addr{background:var(--ss-surface);border:1px solid var(--ss-hair);border-radius:10px;padding:10px 12px;margin-block-end:12px}\n" +
    ".scamshield-interstitial .ss-addr small{display:block;font-size:.85em;color:var(--ss-muted);letter-spacing:.06em;text-transform:uppercase;margin-block-end:3px}\n" +
    ".scamshield-interstitial .ss-addr code{font:.96em/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;direction:ltr;unicode-bidi:isolate}\n" +
    ".scamshield-interstitial .ss-evidence{margin:0 0 12px}.scamshield-interstitial .ss-evidence li{font-size:1.04em}\n" +
    ".scamshield-interstitial .ss-sub{margin:0 0 16px}\n" +
    ".scamshield-interstitial .ss-actions{justify-content:flex-start;gap:10px;margin-block-start:0}\n" +
    ".scamshield-interstitial .ss-actions .ss-btn{min-block-size:36px;padding:0 16px}\n" +
    ".scamshield-interstitial .ss-copy{border:1px solid var(--ss-hair);color:var(--ss-text);background:var(--ss-surface)}\n" +
    ".scamshield-interstitial .ss-details{margin-block-start:18px;border-block-start:1px solid var(--ss-hair);padding-block-start:12px}\n" +
    ".scamshield-interstitial .ss-details summary{cursor:pointer;color:var(--ss-muted);font-size:1em;list-style:none;display:flex;justify-content:space-between;min-block-size:24px;align-items:center}\n" +
    ".scamshield-interstitial .ss-details summary::-webkit-details-marker{display:none}.scamshield-interstitial .ss-details summary::after{content:\"\\25BE\"}.scamshield-interstitial .ss-details[open] summary::after{content:\"\\25B4\"}\n" +
    ".scamshield-interstitial .ss-dt{display:flex;flex-wrap:wrap;gap:8px 16px;margin-block-start:10px;align-items:center;font-size:1em}\n" +
    ".scamshield-interstitial .ss-dt .ss-danger-ghost{min-block-size:32px}\n" +
    ".scamshield-interstitial .ss-consequence{color:var(--ss-muted);font-size:.96em}\n" +
    ".scamshield-interstitial .ss-trust-link,.scamshield-interstitial .ss-dt .ss-report{background:none;border:0;color:var(--ss-muted);text-decoration:underline;text-underline-offset:2px;cursor:pointer;padding:0;min-block-size:24px;font:inherit;margin:0}\n" +
    ".scamshield-interstitial .ss-dt .ss-report:disabled{text-decoration:none;cursor:default}\n" +
    ".scamshield-interstitial .ss-foot{margin-block-start:22px;font-size:.92em;color:var(--ss-muted)}\n" +
    "@media (min-width:1920px){.scamshield-overlay .ss-card{inline-size:min(680px,100vw - 32px);padding:28px}.scamshield-interstitial .ss-card{padding:32px}}\n" +
    "@media (pointer: coarse){.scamshield-interstitial .ss-trust-link,.scamshield-interstitial .ss-dt .ss-report,.scamshield-interstitial .ss-details summary{min-block-size:44px;min-inline-size:44px}.scamshield-interstitial .ss-dt .ss-danger-ghost{min-block-size:44px}}\n" +
    phone([
    [".scamshield-overlay", "padding:12px"],
    [".scamshield-overlay .ss-card", "padding:16px"],
    [".scamshield-interstitial .ss-card", "padding:16px 12px"],
    [".scamshield-overlay .ss-actions", "flex-direction:column;align-items:stretch"],
    [".scamshield-overlay .ss-actions .ss-btn", "inline-size:100%;min-block-size:44px;margin:0"],
    [".scamshield-interstitial .ss-dt", "flex-direction:column;align-items:stretch;gap:8px"],
    [".scamshield-interstitial .ss-dt .ss-danger-ghost", "inline-size:100%;min-block-size:44px;white-space:normal"],
    [".scamshield-interstitial .ss-trust-link,.scamshield-interstitial .ss-dt .ss-report", "min-block-size:44px;text-align:start"],
    [".scamshield-interstitial .ss-details summary", "min-block-size:44px"]
    ]) +
    // data-compact only: the frame stays the full layout viewport (so the opaque interstitial covers everything); the card is
    // zoomed to device size, sized from the visual viewport (--ss-vw/--ss-vh, unitless px) and moved onto its centre (--ss-dx/dy).
    ":host([data-compact]) .scamshield-overlay{pointer-events:auto;padding:0}\n" +
    ":host([data-compact]) .scamshield-overlay .ss-card{zoom:var(--ss-z);inline-size:calc(var(--ss-vw) * 1px / var(--ss-z) - 24px);max-block-size:calc(var(--ss-vh) * 1px / var(--ss-z) - 24px);transform:translate(calc(var(--ss-dx) * 1px / var(--ss-z)),calc(var(--ss-dy) * 1px / var(--ss-z)))}\n";

  // Toast family + trust acknowledgement. The ack carries both root classes (it is a toast-shaped bar).
  const toast =
    '.scamshield-toast,.scamshield-ack{position:fixed;inset-block-end:calc(12px + env(safe-area-inset-bottom,0px));inset-inline-end:calc(12px + env(safe-area-inset-right,0px));z-index:2147483647;inline-size:min(380px,calc(100vw - 24px));background:var(--ss-surface);color:var(--ss-text);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;border:1px solid var(--ss-hair);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.22),0 1px 2px rgba(0,0,0,.08);padding:12px 12px 10px;display:grid;grid-template-columns:36px 1fr;gap:4px 12px;align-items:start}\n' +
    '.scamshield-ack{grid-template-columns:36px 1fr auto;align-items:center}\n' +
    phone([[".scamshield-toast,.scamshield-ack", "inset-inline:calc(12px + env(safe-area-inset-left,0px)) calc(12px + env(safe-area-inset-right,0px));inline-size:auto"]]) +
    ':host([data-compact]) .scamshield-toast,:host([data-compact]) .scamshield-ack{zoom:var(--ss-z);pointer-events:auto}\n' +
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
    '.scamshield-toast[dir=rtl] .ss-prog i{transform-origin:100% 50%}\n' +
    '.scamshield-toast[dir=rtl],.scamshield-ack[dir=rtl]{inset-inline-end:calc(12px + env(safe-area-inset-left,0px))}\n' +
    '@media (prefers-reduced-motion: reduce){.scamshield-toast .ss-prog i{transition:none}}\n';

  root.ScamShield = root.ScamShield || {};
  root.ScamShield.surfaceCss = { base, banner, dialog, toast };
})(typeof globalThis !== 'undefined' ? globalThis : self);
