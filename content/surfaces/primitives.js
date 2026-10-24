// content/surfaces/primitives.js — the shadow-host every in-page warning surface renders into
// (0.15.0, Part 2). One open shadow root per surface kind, appended to <html> (never <body>, so
// `body.inert` can't disable it), top-layer via popover where available. A closed root would add
// nothing — a page can host.remove() either way — so the real gates are: isTrusted on every control,
// top-layer placement, a click-geometry check (insideCard) and the existing arm delay on Trust.
// The roots stay open on purpose (the e2e suite pierces them; closed adds little against page JS). They are hardened by
// watching instead (final fix B): host attributes are re-asserted, a removed card / closed dialog is put back, and when
// another top-layer element appears after ours, ours is re-stacked above it (all rate limited, see below).
(function (root) {
  'use strict';
  const TAG = 'scamshield-surface';
  const KINDS = ['banner', 'interstitial', 'toast', 'ack', 'dialog'];
  const REATTACH_MAX = 3, REATTACH_WINDOW_MS = 10000;

  const live = new Map();       // kind -> record { kind, host, shadow, card, closing, stamps }
  const cards = new WeakMap();  // shadowRoot -> card (lets onTrustedClick find its card at click time)
  const sheets = new Map();     // css text -> CSSStyleSheet (cached)
  let observer = null, topObserver = null, hostObserver = null, shadowObserver = null;

  function sheetFor(text) {
    if (sheets.has(text)) return sheets.get(text);
    let s = null;
    try { s = new CSSStyleSheet(); s.replaceSync(text); } catch (_) { s = null; }
    sheets.set(text, s);
    return s;
  }
  // adoptedStyleSheets (Chrome >=121, Firefox >=142). Constructed sheets are exempt from the page's CSP, so this is the
  // path that works under a strict style-src. If a content-script realm refuses the sheets, fall back to <style> nodes
  // inside the same shadow root — still invisible to page CSS, but a page CSP without 'unsafe-inline' in style-src can
  // block those, in which case the surface renders unstyled (known, documented limit; Chrome >=121 / Firefox >=142 always
  // take the first path). Host inline styles are set through the CSSOM (host.style.cssText), which CSP does not govern,
  // never through setAttribute('style').
  function applyCss(shadow, texts) {
    let ok = false;
    try {
      const list = texts.map(sheetFor);
      if (list.every(Boolean) && 'adoptedStyleSheets' in shadow) { shadow.adoptedStyleSheets = list; ok = shadow.adoptedStyleSheets.length === list.length; }
    } catch (_) { ok = false; }
    if (ok) return;
    for (const text of texts) { const st = document.createElement('style'); st.textContent = text; shadow.appendChild(st); }
  }

  // pt (optional {x, y} client coordinates of a pointer click): a click whose point lies inside the card rect also passes,
  // so a control that spills a pixel or two (zoom rounding, a focus ring) is not refused for a click that is plainly on the card.
  function insideCard(btn, card, pt) {
    if (!btn || !card) return false;
    const b = btn.getBoundingClientRect(), c = card.getBoundingClientRect(), t = 1;
    if (b.left >= c.left - t && b.right <= c.right + t && b.top >= c.top - t && b.bottom <= c.bottom + t) return true;
    return !!(pt && typeof pt.x === 'number' && typeof pt.y === 'number' && c.width > 0 && c.height > 0 &&
      pt.x >= c.left && pt.x <= c.right && pt.y >= c.top && pt.y <= c.bottom && b.width > 0 && b.height > 0 &&
      b.right > c.left && b.left < c.right && b.bottom > c.top && b.top < c.bottom);
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
      const pt = e.detail > 0 ? { x: e.clientX, y: e.clientY } : null; // a keyboard activation has no pointer position
      if (card && !insideCard(node, card, pt)) {
        const menu = node.closest && node.closest('[role=menu]');
        if (!(menu && card.contains(menu) && insideCard(node, menu, pt))) return;
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
    if (!m) { host.removeAttribute('data-compact'); setStyle(rec, BASE_STYLE); return; }
    host.setAttribute('data-compact', '');
    setStyle(rec, BASE_STYLE + ';left:' + m.ox + 'px!important;top:' + m.oy + 'px!important;width:' + m.vw + 'px!important;height:' + m.vh + 'px!important;contain:layout!important;pointer-events:none!important' +
      ';--ss-z:' + m.z + ';--ss-vw:' + m.vw + ';--ss-vh:' + m.vh + ';--ss-dx:' + m.dx + ';--ss-dy:' + m.dy);
  }
  // The host's inline style goes through the CSSOM (CSP-safe, also in Firefox under a strict style-src). rec.style keeps
  // the normalised text so the attribute watch can tell a page edit from our own write.
  function setStyle(rec, text) {
    rec.styleIntent = text;
    try { rec.host.style.cssText = text; } catch (_) { try { rec.host.setAttribute('style', text); } catch (__) {} }
    rec.style = rec.host.style.cssText;
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
  // Re-attach / re-assert bookkeeping shared by every repair below: at most REATTACH_MAX repairs of a surface inside
  // REATTACH_WINDOW_MS, then it gives up (a surface that must not just vanish, the interstitial, escalates first).
  function allow(rec, now) {
    rec.stamps = rec.stamps.filter((s) => now - s < REATTACH_WINDOW_MS);
    if (rec.stamps.length >= REATTACH_MAX) {
      const o = rec.opts || {};
      if (typeof o.onGaveUp === 'function') { try { o.onGaveUp(); } catch (_) {} }
      live.delete(rec.kind); ended(rec);
      try { rec.host.remove(); } catch (_) {}
      return false;
    }
    rec.stamps.push(now);
    return true;
  }
  function isNewcomer(n) {
    try {
      if (!n || n.nodeType !== 1 || n.localName === TAG) return false;
      if (n.localName === 'dialog') return n.hasAttribute('open');
      return n.hasAttribute('popover') && n.matches(':popover-open');
    } catch (_) { return false; }
  }
  function onMutations(records) {
    const now = Date.now();
    let newcomer = false;
    if (records) for (const r of records) { if (r.type === 'childList') for (const n of r.addedNodes) if (isNewcomer(n)) newcomer = true; }
    for (const rec of Array.from(live.values())) {
      if (rec.closing || rec.host.isConnected) continue;
      const o = rec.opts || {};
      if (typeof o.onDetached === 'function') {
        let keep = true;
        try { keep = o.onDetached() !== false; } catch (_) { keep = true; }
        if (!keep) { rec.closing = true; live.delete(rec.kind); ended(rec); continue; }
      }
      if (!allow(rec, now)) continue;
      if (place(rec) && typeof o.onAttach === 'function') { try { o.onAttach(); } catch (_) {} }
    }
    if (newcomer) restack();
    if (!live.size && observer) stopWatch();
    syncViewportWatch();
  }

  // (a) Host attributes: a page that rewrites the host's style (display:none, a tiny size, z-index) or sets `hidden` /
  // removes `popover` gets BASE_STYLE (and the compact variant) back at once.
  function onHostAttrs(records) {
    const now = Date.now();
    const seen = new Set();
    for (const r of records) {
      const host = r.target;
      for (const rec of live.values()) {
        if (rec.host !== host || rec.closing || seen.has(rec)) continue;
        let bad = false;
        if (host.hasAttribute('hidden')) bad = true;
        if (host.style.cssText !== rec.style) bad = true;
        if (rec.topLayer === 'popover' && !host.hasAttribute('popover')) bad = true;
        if (!bad) continue;
        seen.add(rec);
        if (!allow(rec, now)) continue;
        try { host.removeAttribute('hidden'); } catch (_) {}
        if (rec.topLayer === 'popover' && !host.hasAttribute('popover')) { try { host.setAttribute('popover', 'manual'); popoverShow(host); } catch (_) {} }
        setStyle(rec, rec.styleIntent);
      }
    }
  }

  // (b) Inside our shadow root: the card (or full-viewport dialog) removed, or a <dialog> that lost `open` without a
  // close event, is put back. A modal re-opens through its own onAttach (showModal), a plain card is re-appended.
  function onShadowMutations(records) {
    const now = Date.now();
    const seen = new Set();
    for (const r of records) {
      const sh = r.target && r.target.getRootNode ? r.target.getRootNode() : null;
      for (const rec of live.values()) {
        if (rec.closing || seen.has(rec) || rec.shadow !== sh) continue;
        const top = rec.top;
        const gone = top && top.parentNode !== rec.shadow;
        const closed = top && !gone && top.localName === 'dialog' && !top.open && rec.opts && typeof rec.opts.onAttach === 'function';
        if (!gone && !closed) continue;
        seen.add(rec);
        if (!allow(rec, now)) continue;
        if (gone) { try { rec.shadow.appendChild(top); } catch (_) {} }
        const o = rec.opts || {};
        if (typeof o.onAttach === 'function') { try { o.onAttach(); } catch (_) {} }
      }
    }
  }

  // (c) A new top-layer element after ours (a page dialog/popover opened over a warning) is stacked above it. We re-open
  // ours: close()+showModal() for a modal (through the surface's own onRestack), hidePopover()+showPopover() for a popover
  // host, modals first so the popover toasts end up on top of them as before. Rate limited: one pass per 400 ms and 20 per 10 s.
  let restackStamps = [], restackLast = 0;
  function restack() {
    const now = Date.now();
    if (now - restackLast < 400) return;
    restackStamps = restackStamps.filter((s) => now - s < 10000);
    if (restackStamps.length >= 20) return;
    restackLast = now; restackStamps.push(now);
    const recs = Array.from(live.values()).filter((r) => !r.closing && r.host.isConnected);
    for (const rec of recs) if (rec.opts && typeof rec.opts.onRestack === 'function') { try { rec.opts.onRestack(); } catch (_) {} }
    for (const rec of recs) {
      if (rec.topLayer !== 'popover') continue;
      try { if (typeof rec.host.hidePopover === 'function') rec.host.hidePopover(); } catch (_) {}
      popoverShow(rec.host);
    }
  }
  function onTopLayerMutations(records) {
    let newcomer = false;
    for (const r of records) {
      if (r.type === 'attributes') { if (isNewcomer(r.target)) newcomer = true; }
      else for (const n of r.addedNodes) if (isNewcomer(n)) newcomer = true;
    }
    if (newcomer) restack();
  }

  function watch() {
    if (observer || typeof MutationObserver === 'undefined' || !document.documentElement) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true });
    try {
      topObserver = new MutationObserver(onTopLayerMutations);
      topObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['open'], subtree: true });
      if (document.body) topObserver.observe(document.body, { childList: true });
    } catch (_) { topObserver = null; }
    try { hostObserver = new MutationObserver(onHostAttrs); } catch (_) { hostObserver = null; }
    try { shadowObserver = new MutationObserver(onShadowMutations); } catch (_) { shadowObserver = null; }
    for (const rec of live.values()) observeRec(rec);
  }
  function observeRec(rec) {
    try { if (hostObserver) hostObserver.observe(rec.host, { attributes: true, attributeFilter: ['style', 'hidden', 'popover'] }); } catch (_) {}
    try { if (shadowObserver) shadowObserver.observe(rec.shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] }); } catch (_) {}
  }
  function stopWatch() {
    for (const o of [observer, topObserver, hostObserver, shadowObserver]) if (o) { try { o.disconnect(); } catch (_) {} }
    observer = topObserver = hostObserver = shadowObserver = null;
  }

  function unmount(kind) {
    const rec = live.get(kind);
    if (!rec) return;
    rec.closing = true; live.delete(kind);
    ended(rec); // before the node leaves, so a surface can close its own <dialog> with its own flag set
    try { rec.host.remove(); } catch (_) {}
    if (!live.size && observer) stopWatch();
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
    const rec = { kind, host, shadow, card, top, closing: false, stamps: [], topLayer: o.topLayer, opts: o, ended: false, style: '', styleIntent: BASE_STYLE };
    setStyle(rec, BASE_STYLE);
    live.set(kind, rec);
    applyCompact(rec, compactMetrics());
    place(rec);
    watch();
    if (hostObserver) observeRec(rec);
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
