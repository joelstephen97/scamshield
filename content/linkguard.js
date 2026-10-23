// content/linkguard.js — live link guard (0.15.0, Task 15).
// Links to known scam sites are marked wherever they appear on a page, including ones inserted later
// (feeds, infinite scroll, comments), and a click on one asks first. Isolated world, top frame only.
//
// Cost: one MutationObserver that only queues added nodes; the work happens in idle time, one batched
// SW lookup (hash-set membership, no network) per round, at most 200 new distinct hosts a minute,
// a per-host verdict cache for the page's lifetime, and no getComputedStyle anywhere.
(function (root) {
  'use strict';
  const SS = root.ScamShield = root.ScamShield || {};
  const HOSTS_PER_MINUTE = 200, BATCH = 50, ROUND_ANCHORS = 400, QUEUE_ROOTS = 500, QUEUE_ANCHORS = 4000;
  let started = false;

  // deps: { send(type, extra), surface(kind, once), t(key, subs, fallback), isTrusted(host) }
  function start(deps) {
    if (started) return false;
    const R = SS.linkRules;
    if (!R || !deps || typeof deps.send !== 'function') return false;
    // Top frame, real web pages only: never an extension page, a data: or about: document, or a sub-frame.
    try { if (root.window !== root.window.top) return false; } catch (_) { return false; }
    if (!/^https?:$/.test(location.protocol) || !document.documentElement) return false;
    started = true;

    const cache = new Map();          // host -> 'block' | 'warn' | null (page lifetime)
    const inflight = new Set();       // hosts asked and not yet answered
    const waiting = new Map();        // host -> Set<anchor> to mark on answer
    const budget = R.newHostBudget(HOSTS_PER_MINUTE, 60000);
    let rootsQueue = [], anchorQueue = new Set(), timer = 0, idleId = 0, working = false;

    const pillText = (level) => level === 'block' ? deps.t('linkPillBlock', null, 'Blocked link') : deps.t('linkPillWarn', null, 'Risky link');
    function mark(a, level) {
      if (!a.isConnected) return;
      if (!level) {
        if (a.hasAttribute('data-ss-pill')) { a.classList.remove('scamshield-link-block', 'scamshield-link-warn'); a.removeAttribute('data-ss-pill'); }
        return; // a clean link is never written to
      }
      a.classList.remove('scamshield-link-block', 'scamshield-link-warn');
      a.classList.add('scamshield-link-' + level);
      a.setAttribute('data-ss-pill', pillText(level));
      deps.surface('link-' + level, true); // once per page per kind
    }
    const hostOf = (a) => {
      const d = R.destination(a.getAttribute('href'), location.href, location.hostname);
      return d && !deps.isTrusted(d.host) ? d : null;
    };

    function collect(rootNode) {
      if (!rootNode || rootNode.nodeType !== 1) return;
      if (rootNode.tagName === 'A') { if (rootNode.hasAttribute('href')) anchorQueue.add(rootNode); return; }
      if (typeof rootNode.querySelectorAll !== 'function') return;
      for (const a of rootNode.querySelectorAll('a[href]')) { if (anchorQueue.size >= QUEUE_ANCHORS) break; anchorQueue.add(a); }
    }

    async function lookup(hosts) {
      for (const h of hosts) inflight.add(h);
      let results = null;
      try { const res = await deps.send('checkFeedBatch', { hosts }); results = res && res.results; } catch (_) { results = null; }
      for (const h of hosts) {
        inflight.delete(h);
        if (!results) { waiting.delete(h); continue; } // SW unreachable: retry on a later sighting
        const level = R.levelFor(results[h]);
        cache.set(h, level);
        const set = waiting.get(h); waiting.delete(h);
        if (level && set) for (const a of set) mark(a, level);
      }
    }

    async function round() {
      if (working) return;
      working = true;
      try {
        const roots = rootsQueue; rootsQueue = [];
        for (const r of roots) collect(r);
        const anchors = Array.from(anchorQueue).slice(0, ROUND_ANCHORS);
        for (const a of anchors) anchorQueue.delete(a);
        const need = [];
        for (const a of anchors) {
          if (!a.isConnected) continue;
          const d = hostOf(a);
          if (!d) { if (a.hasAttribute('data-ss-pill')) mark(a, null); continue; }
          if (cache.has(d.host)) { mark(a, cache.get(d.host)); continue; }
          let set = waiting.get(d.host); if (!set) waiting.set(d.host, set = new Set());
          set.add(a);
          if (!inflight.has(d.host)) need.push(d.host);
        }
        for (;;) {
          const hosts = R.planBatch(need.filter((h) => !inflight.has(h)), cache, budget, Date.now(), BATCH);
          if (!hosts.length) break;
          await lookup(hosts);
        }
        // Hosts the budget refused stay un-asked; drop their waiters so they cannot pile up.
        for (const h of Array.from(waiting.keys())) if (!inflight.has(h) && !cache.has(h)) waiting.delete(h);
      } catch (_) { /* best effort, never break the page */ }
      finally { working = false; }
      if (rootsQueue.length || anchorQueue.size) schedule();
    }

    function schedule() {
      if (timer || idleId) return;
      const run = () => { timer = 0; idleId = 0; round(); };
      try { if (typeof root.requestIdleCallback === 'function') { idleId = root.requestIdleCallback(run, { timeout: 1000 }); return; } } catch (_) {}
      timer = setTimeout(run, 200);
    }

    function enqueue(node) {
      if (rootsQueue.length >= QUEUE_ROOTS) return;
      rootsQueue.push(node);
    }

    try {
      const mo = new MutationObserver((records) => {
        for (const rec of records) {
          if (rec.type === 'attributes') { if (rec.target.tagName === 'A') { anchorQueue.add(rec.target); } continue; }
          for (const n of rec.addedNodes) if (n.nodeType === 1) enqueue(n);
        }
        if (rootsQueue.length || anchorQueue.size) schedule();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    } catch (_) { return false; }
    enqueue(document.documentElement);
    schedule();

    // ---- click interception --------------------------------------------------------------------------
    function anchorFor(e) {
      let path = [];
      try { path = e.composedPath ? e.composedPath() : []; } catch (_) { path = []; }
      for (const n of path) if (n && n.nodeType === 1 && n.tagName === 'A' && n.hasAttribute('href')) return n;
      return null;
    }
    function openTarget(a, e, level) {
      const href = a.href;
      const newTab = e.type === 'auxclick' || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank';
      // A block-list host is opened browser-side so DNR can land on blocked.html (a page-started navigation
      // would end on the browser's own "blocked by client" error). A warn link is an ordinary navigation.
      if (level === 'block') { deps.send('openLink', { url: href, newTab }); return; }
      try {
        if (newTab) root.open(href, '_blank', 'noopener,noreferrer');
        else location.assign(href);
      } catch (_) {}
    }
    function onEvent(e) {
      if (!R.shouldIntercept(e)) return;
      const a = anchorFor(e);
      if (!a) return;
      const d = hostOf(a);
      const level = d && cache.get(d.host);
      if (!level) return; // not a marked link
      e.preventDefault();
      e.stopImmediatePropagation();
      const snap = { type: e.type, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey };
      const actions = SS.actions;
      if (!actions || typeof actions.linkConfirm !== 'function') return;
      actions.linkConfirm({
        level, host: d.host,
        onShown: () => deps.surface('link-confirm'),
        onOpen: () => openTarget(a, snap, level)
      });
    }
    for (const type of ['click', 'auxclick', 'keydown']) document.addEventListener(type, onEvent, true);
    return true;
  }

  SS.linkGuard = { start };
})(typeof globalThis !== 'undefined' ? globalThis : self);
