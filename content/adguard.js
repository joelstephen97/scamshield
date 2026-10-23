// content/adguard.js — scam-ad hiding (0.15.0, Task 17a). NOT an ad blocker: an ad is collapsed only when it
// leads to a listed/risky site (the link guard's lookup) or its own text carries two independent scam patterns.
// Page content outside a known ad container is never read or touched.
//
// Two entry points, one file:
//   start(deps)       top frame: finds ad containers (engine/ad_rules.js AD_SELECTOR), collapses bad ones to a slim tag.
//   startFrame(deps)  inside an ad-sized sub-frame: if its own anchors lead to a listed site, covers the frame.
// Cost: one MutationObserver that only queues added nodes, work in idle time, ONE batched lookup per round through
// SS.linkGuard.request (shared cache and 200 hosts/min budget), no getComputedStyle (one getBoundingClientRect, and
// only for an ad about to be collapsed), nothing at all in a sub-frame that is not ad-sized or has no links.
(function (root) {
  'use strict';
  const SS = root.ScamShield = root.ScamShield || {};
  const QUEUE_ROOTS = 300, ROUND_CONTAINERS = 60, MAX_ANCHORS = 20, MAX_TEXT = 3000, MAX_RETRIES = 3, RETRY_MS = 60000;
  let started = false, frameStarted = false;

  // The collapsed tag: a slim bar the width of the ad, "Scam ad hidden · Show". Light DOM, classes in content.css.
  function buildTag(doc, deps, onShow) {
    const tag = doc.createElement('div');
    tag.className = 'scamshield-ad-hidden';
    tag.setAttribute('role', 'note');
    const label = doc.createElement('span');
    label.textContent = deps.t('adHiddenTag', null, 'Scam ad hidden');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = deps.t('adHiddenShow', null, 'Show');
    // A real click only: a script in the ad cannot "click Show" on the user's behalf.
    btn.addEventListener('click', (e) => { if (e.isTrusted) onShow(); }, true);
    tag.appendChild(label);
    tag.appendChild(btn);
    return tag;
  }

  function start(deps) {
    if (started) return false;
    const A = SS.adRules, G = SS.linkGuard;
    if (!A || !G || typeof G.request !== 'function' || !deps || typeof deps.surface !== 'function') return false;
    try { if (root.window !== root.window.top) return false; } catch (_) { return false; }
    if (!/^https?:$/.test(location.protocol) || !document.documentElement) return false;
    started = true;

    const SEL = A.AD_SELECTOR;
    const collapsed = new Map();      // container -> tag
    const restored = new WeakSet();   // containers the user chose to show: never collapsed again
    const retry = new Set();          // containers whose hosts the budget refused
    let rootsQueue = [], timer = 0, idleId = 0, working = false, retryTimer = 0, retries = 0, hiddenCount = 0;

    function outermost(el) {
      let top = el, p;
      while (top.parentElement && (p = top.parentElement.closest(SEL))) top = p;
      return top;
    }
    function containersOf(node, out) {
      if (!node || node.nodeType !== 1) return;
      try {
        if (node.closest) { const own = node.closest(SEL); if (own) out.add(outermost(own)); }
        if (typeof node.querySelectorAll === 'function') for (const el of node.querySelectorAll(SEL)) { out.add(outermost(el)); if (out.size >= ROUND_CONTAINERS * 4) break; }
      } catch (_) { /* a hostile page can break selectors engines never: ignore */ }
    }
    function destinationsOf(el) {
      const hosts = new Set();
      const add = (href) => {
        const d = A.adDestination(href, location.href, location.hostname);
        if (d && !deps.isTrusted(d.host)) hosts.add(d.host);
      };
      if (el.tagName === 'IFRAME') add(el.getAttribute('src') || '');
      let n = 0;
      for (const a of el.querySelectorAll('a[href]')) { add(typeof a.href === 'string' && a.href ? a.href : a.getAttribute('href') || ''); if (++n >= MAX_ANCHORS) break; }
      return hosts;
    }

    function collapse(el) {
      if (collapsed.has(el) || restored.has(el) || !el.isConnected || !el.parentNode) return false;
      if (el.getClientRects().length === 0) return false; // not rendered: nothing to hide
      const w = el.getBoundingClientRect().width;
      const tag = buildTag(document, deps, () => {
        restored.add(el);
        collapsed.delete(el);
        el.classList.remove('scamshield-ad-collapsed');
        if (tag.parentNode) tag.parentNode.removeChild(tag);
      });
      if (w > 0) tag.style.inlineSize = Math.round(w) + 'px';
      el.parentNode.insertBefore(tag, el);
      el.classList.add('scamshield-ad-collapsed');
      collapsed.set(el, tag);
      hiddenCount++;
      return true;
    }

    async function round() {
      if (working) return;
      working = true;
      try {
        const found = new Set();
        const roots = rootsQueue; rootsQueue = [];
        for (const r of roots) containersOf(r, found);
        for (const el of retry) found.add(el);
        retry.clear();
        const list = [];
        for (const el of found) {
          if (!el.isConnected || collapsed.has(el) || restored.has(el)) continue;
          list.push(el);
          if (list.length >= ROUND_CONTAINERS) break;
        }
        const work = list.map((el) => ({ el, hosts: destinationsOf(el), text: (el.textContent || '').slice(0, MAX_TEXT) }));
        const allHosts = new Set();
        for (const w of work) for (const h of w.hosts) allHosts.add(h);
        const levels = allHosts.size ? await G.request(Array.from(allHosts)) : new Map();
        let before = hiddenCount;
        for (const w of work) {
          const lv = Array.from(w.hosts).map((h) => levels.get(h) || null);
          if (A.shouldCollapse({ levels: lv, text: w.text })) collapse(w.el);
          else if (Array.from(w.hosts).some((h) => !levels.has(h))) retry.add(w.el); // unknown (budget/SW), not clean
        }
        if (hiddenCount > before) deps.surface('ad-hidden', true, { count: hiddenCount });
        if (retry.size && retries < MAX_RETRIES && !retryTimer) {
          retryTimer = setTimeout(() => { retryTimer = 0; retries++; schedule(); }, RETRY_MS);
        }
      } catch (_) { /* best effort, never break the page */ }
      finally { working = false; }
      if (rootsQueue.length) schedule();
    }
    function schedule() {
      if (timer || idleId) return;
      const run = () => { timer = 0; idleId = 0; round(); };
      try { if (typeof root.requestIdleCallback === 'function') { idleId = root.requestIdleCallback(run, { timeout: 1500 }); return; } } catch (_) {}
      timer = setTimeout(run, 250);
    }

    try {
      const mo = new MutationObserver((records) => {
        for (const rec of records) for (const n of rec.addedNodes) if (n.nodeType === 1 && rootsQueue.length < QUEUE_ROOTS) rootsQueue.push(n);
        if (rootsQueue.length) schedule();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) { return false; }
    rootsQueue.push(document.documentElement);
    schedule();
    return true;
  }

  // ---- inside an ad iframe -------------------------------------------------------------------------------
  function looksLikeAdFrame() {
    const A = SS.adRules;
    try {
      if (root.window === root.window.top || !A) return false;
      return /^https?:$/.test(location.protocol) && A.isAdSized(root.innerWidth, root.innerHeight);
    } catch (_) { return false; }
  }

  // deps: { send(type, extra), t(key, subs, fallback), isTrusted(host, settings) }
  function startFrame(deps) {
    if (frameStarted || !looksLikeAdFrame() || !deps) return false;
    frameStarted = true;
    const A = SS.adRules, L = SS.linkRules;
    let settings = null, done = false, checking = false, lastN = -1;

    function cover() {
      if (document.querySelector('.scamshield-ad-tile')) return;
      const tile = buildTag(document, deps, () => { if (tile.parentNode) tile.parentNode.removeChild(tile); });
      tile.className = 'scamshield-ad-hidden scamshield-ad-tile'; // opaque, fills this frame, frame-local light DOM
      (document.body || document.documentElement).appendChild(tile);
    }
    async function check() {
      if (done || checking) return;
      const anchors = document.querySelectorAll('a[href]');
      if (!anchors.length || anchors.length === lastN) return; // nothing new to look at
      lastN = anchors.length;
      checking = true;
      try {
        if (!settings) settings = await deps.send('getSettings');
        if (!settings || !settings.enabled || settings.adGuard === false) { done = true; return; }
        const hosts = new Set();
        let n = 0;
        for (const a of anchors) {
          const d = A.adDestination(typeof a.href === 'string' && a.href ? a.href : a.getAttribute('href') || '', location.href, location.hostname);
          if (d && !deps.isTrusted(d.host, settings)) hosts.add(d.host);
          if (++n >= MAX_ANCHORS) break;
        }
        if (!hosts.size) return;
        const res = await deps.send('checkFeedBatch', { hosts: Array.from(hosts).slice(0, 10) });
        const results = res && res.results;
        if (!results) return;
        for (const h of hosts) {
          const level = L.levelFor(results[h]);
          if (level === 'block' || level === 'warn') { done = true; cover(); return; }
        }
      } catch (_) { /* best effort */ }
      finally { checking = false; }
    }
    // The ad's anchors usually arrive a moment after load: look now, then twice more, never again.
    check();
    setTimeout(check, 1500);
    setTimeout(check, 4000);
    return true;
  }

  SS.adGuard = { start, startFrame, looksLikeAdFrame };
})(typeof globalThis !== 'undefined' ? globalThis : self);
