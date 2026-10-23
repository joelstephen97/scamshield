// content/surfaces/primitives.js — the shadow-host every in-page warning surface renders into
// (0.15.0, Part 2). One open shadow root per surface kind, appended to <html> (never <body>, so
// `body.inert` can't disable it), top-layer via popover where available. A closed root would add
// nothing — a page can host.remove() either way — so the real gates are: isTrusted on every control,
// top-layer placement, a click-geometry check (insideCard) and the existing arm delay on Trust.
(function (root) {
  'use strict';
  const TAG = 'scamshield-surface';
  const KINDS = ['banner', 'interstitial', 'toast', 'ack', 'dialog'];
  const REATTACH_MAX = 3, REATTACH_WINDOW_MS = 10000;

  const live = new Map();       // kind -> record { kind, host, shadow, card, closing, stamps }
  const cards = new WeakMap();  // shadowRoot -> card (lets onTrustedClick find its card at click time)
  const sheets = new Map();     // css text -> CSSStyleSheet (cached)
  let observer = null;

  function sheetFor(text) {
    if (sheets.has(text)) return sheets.get(text);
    let s = null;
    try { s = new CSSStyleSheet(); s.replaceSync(text); } catch (_) { s = null; }
    sheets.set(text, s);
    return s;
  }
  // adoptedStyleSheets (Chrome >=121, Firefox >=142). If a content-script realm refuses the sheets,
  // fall back to <style> nodes inside the same shadow root — still invisible to page CSS.
  function applyCss(shadow, texts) {
    let ok = false;
    try {
      const list = texts.map(sheetFor);
      if (list.every(Boolean) && 'adoptedStyleSheets' in shadow) { shadow.adoptedStyleSheets = list; ok = shadow.adoptedStyleSheets.length === list.length; }
    } catch (_) { ok = false; }
    if (ok) return;
    for (const text of texts) { const st = document.createElement('style'); st.textContent = text; shadow.appendChild(st); }
  }

  function insideCard(btn, card) {
    if (!btn || !card) return false;
    const b = btn.getBoundingClientRect(), c = card.getBoundingClientRect(), t = 1;
    return b.left >= c.left - t && b.right <= c.right + t && b.top >= c.top - t && b.bottom <= c.bottom + t;
  }
  // Click guard: a real user input (isTrusted — page script can't forge it) on a control that really
  // sits inside its card (a page can't park a decoy button over the viewport). Light-DOM nodes (the
  // banner/dialogs until Tasks 12-13 move them) keep the isTrusted-only check.
  function onTrustedClick(node, fn, cardArg) {
    node.addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      let card = cardArg;
      if (!card) { try { card = cards.get(node.getRootNode()); } catch (_) { card = null; } }
      if (card && !insideCard(node, card)) return;
      fn(e);
    });
  }

  function popoverShow(host) {
    try { if (typeof host.showPopover === 'function') host.showPopover(); } catch (_) { /* not connected / already open: fixed positioning still holds */ }
  }
  function place(rec) {
    const parent = document.documentElement;
    if (!parent) return false;
    parent.appendChild(rec.host);
    if (rec.topLayer === 'popover') popoverShow(rec.host);
    return true;
  }

  function onMutations() {
    const now = Date.now();
    for (const rec of Array.from(live.values())) {
      if (rec.closing || rec.host.isConnected) continue;
      rec.stamps = rec.stamps.filter((s) => now - s < REATTACH_WINDOW_MS);
      if (rec.stamps.length >= REATTACH_MAX) { live.delete(rec.kind); continue; } // give up silently
      rec.stamps.push(now);
      place(rec);
    }
    if (!live.size && observer) { observer.disconnect(); observer = null; }
  }
  function watch() {
    if (observer || typeof MutationObserver === 'undefined' || !document.documentElement) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true });
  }

  function unmount(kind) {
    const rec = live.get(kind);
    if (!rec) return;
    rec.closing = true; live.delete(kind);
    try { rec.host.remove(); } catch (_) {}
    if (!live.size && observer) { observer.disconnect(); observer = null; }
  }
  function isMounted(kind) {
    const rec = live.get(kind);
    return !!(rec && !rec.closing);
  }

  // kind: banner|interstitial|toast|ack|dialog. buildFn(shadowRoot) returns the card element.
  // A second mount of the same kind replaces the first (state is module-level, never a DOM query).
  function mount(kind, buildFn, opts) {
    const o = opts || {};
    if (!KINDS.includes(kind)) throw new Error('unknown surface kind: ' + kind);
    unmount(kind);
    const css = root.ScamShield && root.ScamShield.surfaceCss || {};
    const host = document.createElement(TAG);
    host.setAttribute('data-kind', kind);
    host.setAttribute('data-theme', o.theme === 'dark' || o.theme === 'light' ? o.theme : 'auto');
    host.setAttribute('style', 'all:initial!important;position:fixed!important;z-index:2147483647!important;inset:auto!important');
    if (o.topLayer === 'popover') host.setAttribute('popover', 'manual');
    const shadow = host.attachShadow({ mode: 'open' });
    applyCss(shadow, [css.base || '', css[kind === 'ack' ? 'toast' : kind === 'interstitial' ? 'dialog' : kind] || '']);
    const card = buildFn(shadow);
    if (card) { if (card.parentNode !== shadow) shadow.appendChild(card); cards.set(shadow, card); }
    const rec = { kind, host, shadow, card, closing: false, stamps: [], topLayer: o.topLayer };
    live.set(kind, rec);
    place(rec);
    watch();
    return { host, root: shadow, card, close() { if (live.get(kind) === rec) unmount(kind); else { rec.closing = true; try { host.remove(); } catch (_) {} } } };
  }

  const api = { mount, unmount, isMounted, onTrustedClick, insideCard };
  root.ScamShield = root.ScamShield || {};
  root.ScamShield.surfaces = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
