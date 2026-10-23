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
  let live = null; // set by start(): the synchronous cache lookup popup interception uses

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
    const deferred = new Set();       // anchors whose host the budget refused: re-queued next window
    let retryTimer = 0;
    function armRetry(ms) {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = 0;
        for (const a of deferred) if (a.isConnected) anchorQueue.add(a);
        deferred.clear();
        if (anchorQueue.size) schedule();
      }, ms);
    }

    const pillText = (level) => level === 'block' ? deps.t('linkPillBlock', null, 'Blocked link') : deps.t('linkPillWarn', null, 'Risky link');
    function mark(a, level) {
      if (!a.isConnected) return;
      if (!level) {
        if (a.hasAttribute('data-ss-pill')) { a.classList.remove('scamshield-link-block', 'scamshield-link-warn', 'scamshield-link-card'); a.removeAttribute('data-ss-pill'); }
        return; // a clean link is never written to
      }
      a.classList.remove('scamshield-link-block', 'scamshield-link-warn');
      a.classList.add('scamshield-link-' + level);
      a.setAttribute('data-ss-pill', pillText(level));
      // A block/flex/grid anchor (an image card) gets the pill as a corner badge instead of a flow ::after, so
      // nothing shifts. One getComputedStyle per MARKED anchor, never for unmarked ones.
      try { if (!/^inline/.test(getComputedStyle(a).display)) a.classList.add('scamshield-link-card'); else a.classList.remove('scamshield-link-card'); } catch (_) {}
      deps.surface('link-' + level, true); // once per page per kind
    }
    // a.href is the browser-resolved URL (honours <base>); an SVG <a> has an object there, so fall back to the attribute.
    const hrefOf = (a) => (typeof a.href === 'string' && a.href) ? a.href : (a.getAttribute('href') || '');
    const hostOf = (a) => {
      const d = R.destination(hrefOf(a), location.href, location.hostname);
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
      return !!results;
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
        let failed = false;
        for (;;) {
          const hosts = R.planBatch(need.filter((h) => !inflight.has(h)), cache, budget, Date.now(), BATCH);
          if (!hosts.length) break;
          if (!(await lookup(hosts))) { failed = true; break; } // a failed lookup must not burn more budget on the same hosts
        }
        // Hosts the budget refused (or a failure skipped) keep their anchors for the next window.
        for (const h of Array.from(waiting.keys())) {
          if (inflight.has(h) || cache.has(h)) continue;
          for (const a of waiting.get(h)) deferred.add(a);
          waiting.delete(h);
        }
        if (deferred.size) armRetry(failed ? 30000 : 60000);
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

    // Synchronous verdict for a host (0.15.0, Task 16): 'block' | 'warn' | null. An unknown host answers null AND
    // queues one lookup (through the same budget and batch rules), so the next attempt is decided.
    live = {
      levelOf(host) {
        if (typeof host !== 'string' || !host) return null;
        if (cache.has(host)) return cache.get(host);
        if (!inflight.has(host)) {
          try {
            const hosts = R.planBatch([host], cache, budget, Date.now(), 1);
            if (hosts.length) lookup(hosts);
          } catch (_) { /* best effort */ }
        }
        return null;
      }
    };

    // ---- click interception --------------------------------------------------------------------------
    function anchorFor(e) {
      let path = [];
      try { path = e.composedPath ? e.composedPath() : []; } catch (_) { path = []; }
      for (const n of path) if (n && n.nodeType === 1 && n.tagName === 'A' && n.hasAttribute('href')) return n;
      return null;
    }
    // Opens ONLY the snapshot taken at click time. If the page swapped the href while the dialog was up, the
    // user agreed to a different destination than the one they would now get, so nothing is opened.
    function openTarget(a, snap) {
      let d = null;
      try { d = hostOf(a); } catch (_) { d = null; }
      if (!d || d.host !== snap.host || hrefOf(a) !== snap.url) return;
      const newTab = snap.type === 'auxclick' || snap.ctrlKey || snap.metaKey || snap.shiftKey || snap.target === '_blank';
      // A block-list host is opened browser-side so DNR can land on blocked.html (a page-started navigation
      // would end on the browser's own "blocked by client" error). A warn link is an ordinary navigation.
      if (snap.level === 'block') { deps.send('openLink', { url: snap.url, newTab }); return; }
      try {
        if (newTab) root.open(snap.url, '_blank', 'noopener,noreferrer');
        else location.assign(snap.url);
      } catch (_) {}
    }
    function onEvent(e) {
      if (!R.shouldIntercept(e)) return;
      const a = anchorFor(e);
      if (!a) return;
      const d = hostOf(a);
      const level = d && cache.get(d.host);
      if (!level) return; // not a marked link
      const actions = SS.actions;
      if (!actions || typeof actions.linkConfirm !== 'function') return;
      // Decide BEFORE preventDefault. If the confirm cannot show (another dialog or interstitial is up), a warn
      // link goes through as if we were not here; a block link stays blocked and says so.
      const canAsk = typeof actions.linkConfirmAvailable === 'function' ? actions.linkConfirmAvailable() : true;
      if (!canAsk && level === 'warn') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!canAsk) { if (typeof actions.linkBlockedToast === 'function') actions.linkBlockedToast(); return; }
      const snap = { type: e.type, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, target: a.target, level, host: d.host, url: hrefOf(a) };
      actions.linkConfirm({
        level, host: d.host,
        onShown: () => deps.surface('link-confirm'),
        onOpen: () => openTarget(a, snap)
      });
    }
    for (const type of ['click', 'auxclick', 'keydown']) document.addEventListener(type, onEvent, true);
    return true;
  }

  SS.linkGuard = { start, levelOf: (host) => (live ? live.levelOf(host) : null) };
})(typeof globalThis !== 'undefined' ? globalThis : self);
