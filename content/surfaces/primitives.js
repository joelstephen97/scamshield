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
      // A popup menu (role=menu) inside the card hangs below it by design, so its items are checked against the
      // menu's own box (the menu itself must be a descendant of the card, i.e. ours, not a page node).
      if (card && !insideCard(node, card)) {
        const menu = node.closest && node.closest('[role=menu]');
        if (!(menu && card.contains(menu) && insideCard(node, menu))) return;
      }
      fn(e);
    });
  }

  // ---- zoomed-out touch pages (0.15.0, Task 14b) ----------------------------------------------------------------
  // A phone page with no <meta viewport> gets a ~980px layout viewport shown zoomed out (~0.38x). The surfaces' media
  // queries then see 980px and render the desktop card at a third of its size. Detect that and compensate:
  //   s = layout viewport width / device width in CSS px, with device width = visualViewport.width * visualViewport.scale
  // (pinch zoom changes width and scale in opposite directions, so s does not move when the user pinches).
  // s > 1.15 on a coarse pointer => data-compact on the host. CSS (styles.js) then forces the phone layout and zooms
  // the card by z = 1 / visualViewport.scale, i.e. layout px per device px right now, so it stays device sized while
  // the user pinches. The host itself is pinned to the visual viewport rect (contain:layout makes it the containing
  // block of the fixed cards), so the bottom sheet sits at the bottom of what the user sees. Dialogs are top layer and
  // ignore the host box, so they get the visual viewport's size and centre offset as variables instead.
  const COMPACT_S = 1.15;
  const BASE_STYLE = 'all:initial!important;position:fixed!important;z-index:2147483647!important;inset:auto!important';
  let vvBound = false, vvRaf = 0;
  const num = (n) => Math.round(n * 100) / 100;
  function compactMetrics() {
    try {
      if (typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches) return null;
      if (typeof CSS === 'undefined' || !CSS.supports || !CSS.supports('zoom', '1')) return null;
      const vv = window.visualViewport, lw = window.innerWidth, lh = window.innerHeight;
      if (!lw || !lh) return null;
      // Device width in CSS px: the visual viewport's width times its scale. screen.width is the fallback (Chrome and
      // Firefox Android both report device CSS px there) when there is no visualViewport.
      const dev = vv && vv.width && vv.scale ? vv.width * vv.scale : (window.screen && window.screen.width) || 0;
      if (!dev) return null;
      const sc = lw / dev;
      if (!(sc > COMPACT_S)) return null;
      const scale = vv && vv.scale > 0 ? vv.scale : 1 / sc;
      const z = Math.min(8, Math.max(0.25, 1 / scale));
      const vw = vv ? vv.width : lw, vh = vv ? vv.height : lh, ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0;
      return { z: num(z), vw: num(vw), vh: num(vh), ox: num(ox), oy: num(oy), dx: num(ox + vw / 2 - lw / 2), dy: num(oy + vh / 2 - lh / 2) };
    } catch (_) { return null; }
  }
  function applyCompact(rec, m) {
    const host = rec.host, key = m ? [m.z, m.vw, m.vh, m.ox, m.oy, m.dx, m.dy].join() : '';
    if (rec.compactKey === key) return;
    rec.compactKey = key;
    if (!m) { host.removeAttribute('data-compact'); host.setAttribute('style', BASE_STYLE); return; }
    host.setAttribute('data-compact', '');
    host.setAttribute('style', BASE_STYLE + ';left:' + m.ox + 'px!important;top:' + m.oy + 'px!important;width:' + m.vw + 'px!important;height:' + m.vh + 'px!important;contain:layout!important;pointer-events:none!important' +
      ';--ss-z:' + m.z + ';--ss-vw:' + m.vw + ';--ss-vh:' + m.vh + ';--ss-dx:' + m.dx + ';--ss-dy:' + m.dy);
  }
  function updateCompact() {
    vvRaf = 0;
    const m = compactMetrics();
    for (const rec of live.values()) applyCompact(rec, m);
  }
  function scheduleCompact() {
    if (vvRaf) return;
    vvRaf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(updateCompact) : setTimeout(updateCompact, 16);
  }
  function syncViewportWatch() {
    const vv = typeof window !== 'undefined' && window.visualViewport;
    if (live.size && !vvBound) {
      if (vv && vv.addEventListener) { vv.addEventListener('resize', scheduleCompact); vv.addEventListener('scroll', scheduleCompact); }
      window.addEventListener('resize', scheduleCompact);
      vvBound = true;
    } else if (!live.size && vvBound) {
      if (vv && vv.removeEventListener) { vv.removeEventListener('resize', scheduleCompact); vv.removeEventListener('scroll', scheduleCompact); }
      window.removeEventListener('resize', scheduleCompact);
      vvBound = false;
    }
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

  // (0.15.0, Task 13) A surface can hook its own lifecycle: onDetached (page removed the host; return false
  // to NOT re-attach, e.g. the wallet confirm treats removal as a denial), onAttach (host put back, so a
  // <dialog> can showModal() again) and onUnmount (every exit path, once: restores body.inert etc.).
  function ended(rec) {
    if (rec.ended) return;
    rec.ended = true;
    if (rec.opts && typeof rec.opts.onUnmount === 'function') { try { rec.opts.onUnmount(); } catch (_) {} }
  }
  function onMutations() {
    const now = Date.now();
    for (const rec of Array.from(live.values())) {
      if (rec.closing || rec.host.isConnected) continue;
      const o = rec.opts || {};
      if (typeof o.onDetached === 'function') {
        let keep = true;
        try { keep = o.onDetached() !== false; } catch (_) { keep = true; }
        if (!keep) { rec.closing = true; live.delete(rec.kind); ended(rec); continue; }
      }
      rec.stamps = rec.stamps.filter((s) => now - s < REATTACH_WINDOW_MS);
      if (rec.stamps.length >= REATTACH_MAX) { // give up; a surface that must not just vanish (the interstitial) escalates first
        if (typeof o.onGaveUp === 'function') { try { o.onGaveUp(); } catch (_) {} }
        live.delete(rec.kind); ended(rec); continue;
      }
      rec.stamps.push(now);
      if (place(rec) && typeof o.onAttach === 'function') { try { o.onAttach(); } catch (_) {} }
    }
    if (!live.size && observer) { observer.disconnect(); observer = null; }
    syncViewportWatch();
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
    ended(rec); // before the node leaves, so a surface can close its own <dialog> with its own flag set
    try { rec.host.remove(); } catch (_) {}
    if (!live.size && observer) { observer.disconnect(); observer = null; }
    syncViewportWatch();
  }
  function isMounted(kind) {
    const rec = live.get(kind);
    return !!(rec && !rec.closing);
  }

  // kind: banner|interstitial|toast|ack|dialog. buildFn(shadowRoot) returns the card element (or { el, card }).
  // A second mount of the same kind replaces the first (state is module-level, never a DOM query).
  function mount(kind, buildFn, opts) {
    const o = opts || {};
    if (!KINDS.includes(kind)) throw new Error('unknown surface kind: ' + kind);
    unmount(kind);
    const css = root.ScamShield && root.ScamShield.surfaceCss || {};
    const host = document.createElement(TAG);
    host.setAttribute('data-kind', kind);
    host.setAttribute('data-theme', o.theme === 'dark' || o.theme === 'light' ? o.theme : 'auto');
    host.setAttribute('style', BASE_STYLE);
    if (o.topLayer === 'popover') host.setAttribute('popover', 'manual');
    const shadow = host.attachShadow({ mode: 'open' });
    applyCss(shadow, [css.base || '', css[kind === 'ack' ? 'toast' : kind === 'interstitial' ? 'dialog' : kind] || '']);
    // buildFn returns the top node, or { el, card } when the node the click-geometry check should use (the
    // dialog's .ss-card) is not the node that goes into the shadow root (the full-viewport <dialog>).
    const built = buildFn(shadow);
    const top = built && built.el ? built.el : built;
    const card = built && built.el ? built.card : built;
    if (top) { if (top.parentNode !== shadow) shadow.appendChild(top); }
    if (card) cards.set(shadow, card);
    const rec = { kind, host, shadow, card, closing: false, stamps: [], topLayer: o.topLayer, opts: o, ended: false };
    live.set(kind, rec);
    applyCompact(rec, compactMetrics());
    place(rec);
    watch();
    syncViewportWatch();
    // (0.15.0) onShown(kind): the surface log is written from here, once per real mount, so callers no longer
    // infer "it was shown" from before/after DOM counts or listener order. A throwing callback never breaks the mount.
    if (typeof o.onShown === 'function') { try { o.onShown(kind); } catch (_) {} }
    return { host, root: shadow, card, close() { if (live.get(kind) === rec) unmount(kind); else { rec.closing = true; ended(rec); try { host.remove(); } catch (_) {} } } };
  }

  const api = { mount, unmount, isMounted, onTrustedClick, insideCard };
  root.ScamShield = root.ScamShield || {};
  root.ScamShield.surfaces = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
