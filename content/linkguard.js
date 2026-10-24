// content/linkguard.js — live link guard (0.15.0, Task 15).
// Links to known scam sites are marked wherever they appear on a page, including ones inserted later
// (feeds, infinite scroll, comments), and a click on one asks first. Isolated world, top frame only.
//
// Cost: one MutationObserver that only queues added nodes; the work happens in idle time, one batched
// SW lookup (hash-set membership, no network) per round, at most 200 new distinct hosts a minute,
// a per-host verdict cache (15 min for a verdict, 2 min for 'clean'), and one batched getComputedStyle read pass per
// stretch (only for anchors about to be marked, reads before writes).
(function (root) {
  'use strict';
  const SS = root.ScamShield = root.ScamShield || {};
  const HOSTS_PER_MINUTE = 200, BATCH = 50, ROUND_ANCHORS = 400, QUEUE_ROOTS = 500, QUEUE_ANCHORS = 4000;
  // (0.15.0, Task 17b) Main-thread cost of the guards, for the perf budget test: window.__ssPerf = {batches, maxMs, totalMs}
  // in the isolated world. Each "batch" is one synchronous stretch of work (no awaits inside it), timed with
  // performance.now(). Shared with the ad guard (loaded after this file); numbers only, nothing leaves the page.
  const perf = SS.perf = SS.perf || (function () {
    const P = { batches: 0, maxMs: 0, totalMs: 0 };
    try { root.__ssPerf = P; } catch (_) {}
    const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
    return { now, rec(t0) { const d = now() - t0; P.batches++; P.totalMs += d; if (d > P.maxMs) P.maxMs = d; }, stats: P };
  })();
  let started = false;
  let live = null; // set by start(): the synchronous cache lookup popup interception uses

  // deps: { send(type, extra), surface(kind, once), t(key, subs, fallback), isTrusted(host), passive? }
  // passive (0.15.0, Task 17a): the ad guard's lookup only (verdict cache + batched SW lookup + budget): no link marking,
  // no click interception, no observer. Used when the user switched the link guard off but kept the ad guard on.
  function start(deps) {
    if (started) return false;
    const R = SS.linkRules;
    if (!R || !deps || typeof deps.send !== 'function') return false;
    // Top frame, real web pages only: never an extension page, a data: or about: document, or a sub-frame.
    try { if (root.window !== root.window.top) return false; } catch (_) { return false; }
    if (!/^https?:$/.test(location.protocol) || !document.documentElement) return false;
    started = true;

    // host -> 'block' | 'warn' | null, with a lifetime: a verdict lives 15 min, a clean answer 2 min (the feed can gain
    // a host while a tab sits open). An expired entry simply reads as absent, so the next sighting looks it up again.
    const TTL_HIT = 15 * 60000, TTL_CLEAN = 2 * 60000;
    const cache = (function () {
      const m = new Map();
      return {
        has(h) { const e = m.get(h); if (!e) return false; if (e.exp <= Date.now()) { m.delete(h); return false; } return true; },
        get(h) { return this.has(h) ? m.get(h).v : undefined; },
        set(h, v) { m.set(h, { v, exp: Date.now() + (v ? TTL_HIT : TTL_CLEAN) }); }
      };
    })();
    const inflight = new Set();       // hosts asked and not yet answered
    const pending = new Map();        // host -> Promise of the lookup that will answer it (for request())
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
    const MARK_CLASSES = ['scamshield-link-block', 'scamshield-link-warn', 'scamshield-link-card'];
    // A search result already carries a SERP badge (a sibling dot, content_script.js): one annotation per link, so the
    // link mark steps aside. The click confirm still works (it is driven by the verdict cache, not by the mark).
    const serpBadged = (a) => { try { const n = a.nextElementSibling; return !!(n && n.classList && n.classList.contains('scamshield-serp-badge')); } catch (_) { return false; } };
    function unmark(a) {
      if (a.hasAttribute('data-ss-pill')) { a.classList.remove(...MARK_CLASSES); a.removeAttribute('data-ss-pill'); }
    }
    // Marks many anchors in two passes: every layout read first (a block/flex/grid anchor, i.e. an image card, gets the
    // pill as a corner badge instead of a flow ::after so nothing shifts; one getComputedStyle per anchor about to be
    // marked, never for unmarked ones), then every class/attribute write. No read follows a write, so one layout at most.
    function markMany(pairs) {
      const todo = [];
      for (const [a, level] of pairs) {
        if (!a.isConnected) continue;
        if (!level) { unmark(a); continue; } // a clean link is never written to
        if (serpBadged(a)) { unmark(a); continue; }
        todo.push([a, level]);
      }
      const card = todo.map(([a]) => { try { return !/^inline/.test(getComputedStyle(a).display); } catch (_) { return false; } });
      todo.forEach(([a, level], i) => {
        const other = level === 'block' ? 'scamshield-link-warn' : 'scamshield-link-block';
        if (a.classList.contains(other)) a.classList.remove(other);
        if (!a.classList.contains('scamshield-link-' + level)) a.classList.add('scamshield-link-' + level);
        const pill = pillText(level);
        if (a.getAttribute('data-ss-pill') !== pill) a.setAttribute('data-ss-pill', pill);
        if (card[i] !== a.classList.contains('scamshield-link-card')) a.classList.toggle('scamshield-link-card', card[i]);
        deps.surface('link-' + level, true); // once per page per kind
      });
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
      for (const a of rootNode.querySelectorAll('a[href]')) { if (anchorQueue.size >= QUEUE_ANCHORS) { catchAll(); break; } anchorQueue.add(a); }
    }
    // Queue saturation (500 roots / 4000 anchors): nothing is silently lost. The document body is queued ONCE as a
    // catch-all root, so whatever was dropped is collected again once the queue has drained. Reset when it empties.
    let catchAllQueued = false;
    function catchAll() {
      if (catchAllQueued) return;
      catchAllQueued = true;
      const b = document.body || document.documentElement;
      if (b) rootsQueue.push(b);
    }

    function lookup(hosts) {
      const p = lookupNow(hosts);
      for (const h of hosts) pending.set(h, p);
      p.then(() => { for (const h of hosts) if (pending.get(h) === p) pending.delete(h); });
      return p;
    }
    async function lookupNow(hosts) {
      for (const h of hosts) inflight.add(h);
      let results = null;
      try { const res = await deps.send('checkFeedBatch', { hosts }); results = res && res.results; } catch (_) { results = null; }
      const t0 = perf.now();
      try { applyResults(hosts, results); } finally { perf.rec(t0); }
      return !!results;
    }
    function applyResults(hosts, results) {
      const pairs = [];
      for (const h of hosts) {
        inflight.delete(h);
        if (!results) { // SW unreachable / lookup failed: keep the anchors, try again in 30 s
          const lost = waiting.get(h); waiting.delete(h);
          if (lost) { for (const a of lost) deferred.add(a); armRetry(30000); }
          continue;
        }
        const level = R.levelFor(results[h]);
        cache.set(h, level);
        const set = waiting.get(h); waiting.delete(h);
        if (level && set) for (const a of set) pairs.push([a, level]);
      }
      markMany(pairs);
    }

    function nearestFirst(list) {
      const vh = root.innerHeight || document.documentElement.clientHeight || 0;
      const scored = list.map((a) => {
        let d = 1e9;
        try { if (a.isConnected) { const r = a.getBoundingClientRect(); d = r.bottom < 0 ? -r.bottom : r.top > vh ? r.top - vh : 0; } } catch (_) {}
        return { a, d };
      });
      scored.sort((x, y) => x.d - y.d);
      return scored.map((x) => x.a);
    }

    async function round() {
      if (working) return;
      working = true;
      let t0 = perf.now();
      try {
        const roots = rootsQueue; rootsQueue = [];
        for (const r of roots) collect(r);
        let anchors = Array.from(anchorQueue);
        // More anchors than a round (or the host budget) can take: the ones in or near the viewport go first. Rects are
        // read in one batch (no writes in between); the rest wait in the queue for the next round.
        if (anchors.length > ROUND_ANCHORS) anchors = nearestFirst(anchors);
        anchors = anchors.slice(0, ROUND_ANCHORS);
        for (const a of anchors) anchorQueue.delete(a);
        if (!anchorQueue.size && !rootsQueue.length) catchAllQueued = false;
        const need = [], pairs = [];
        for (const a of anchors) {
          if (!a.isConnected) continue;
          const d = hostOf(a);
          if (!d) { if (a.hasAttribute('data-ss-pill')) pairs.push([a, null]); continue; }
          if (cache.has(d.host)) { pairs.push([a, cache.get(d.host)]); continue; }
          let set = waiting.get(d.host); if (!set) waiting.set(d.host, set = new Set());
          set.add(a);
          if (!inflight.has(d.host)) need.push(d.host);
        }
        markMany(pairs);
        perf.rec(t0); t0 = 0;
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
      finally { working = false; if (t0) perf.rec(t0); }
      if (rootsQueue.length || anchorQueue.size) schedule();
    }

    function schedule() {
      if (timer || idleId) return;
      const run = () => { timer = 0; idleId = 0; round(); };
      try { if (typeof root.requestIdleCallback === 'function') { idleId = root.requestIdleCallback(run, { timeout: 1000 }); return; } } catch (_) {}
      timer = setTimeout(run, 200);
    }

    function enqueue(node) {
      if (rootsQueue.length >= QUEUE_ROOTS) { catchAll(); return; }
      rootsQueue.push(node);
    }

    if (!deps.passive) try {
      const mo = new MutationObserver((records) => {
        for (const rec of records) {
          if (rec.type === 'attributes') {
            const tg = rec.target;
            if (tg.tagName !== 'A') continue;
            // 'class': a re-render that strips our mark classes off an anchor still carrying its pill text gets them back.
            if (rec.attributeName === 'class' && !(tg.hasAttribute('data-ss-pill') && !MARK_CLASSES.some((c) => tg.classList.contains(c)))) continue;
            if (anchorQueue.size < QUEUE_ANCHORS) anchorQueue.add(tg); else catchAll();
            continue;
          }
          for (const n of rec.addedNodes) if (n.nodeType === 1) enqueue(n);
        }
        if (rootsQueue.length || anchorQueue.size) schedule();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'class'] });
    } catch (_) { return false; }
    if (!deps.passive) { enqueue(document.documentElement); schedule(); }

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
      },
      // The user's trusted/paused sites changed: look at the whole document again (a link to a now-trusted host loses its mark).
      refresh() { if (!deps.passive) { enqueue(document.documentElement); schedule(); } },
      // Verdicts for several hosts at once (0.15.0, Task 17a): Promise<Map host -> 'block'|'warn'|null>. Reuses this
      // guard's cache, in-flight lookups, 50-host batches and 200 hosts/min budget. A host the budget refused (or a
      // failed lookup) is simply absent from the map: unknown, not clean. The caller retries later.
      async request(hosts) {
        const out = new Map();
        const want = Array.from(new Set((hosts || []).filter((h) => typeof h === 'string' && h)));
        // One planning pass only: a failed lookup must not burn more budget on the same hosts.
        const need = want.filter((h) => !cache.has(h) && !pending.has(h));
        const plan = R.planBatch(need, cache, budget, Date.now(), BATCH);
        if (plan.length) lookup(plan);
        const waits = want.filter((h) => pending.has(h)).map((h) => pending.get(h));
        if (waits.length) await Promise.all(waits);
        for (const h of want) if (cache.has(h)) out.set(h, cache.get(h));
        return out;
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
    if (!deps.passive) for (const type of ['click', 'auxclick', 'keydown']) document.addEventListener(type, onEvent, true);
    return true;
  }

  SS.linkGuard = {
    start,
    levelOf: (host) => (live ? live.levelOf(host) : null),
    request: (hosts) => (live ? live.request(hosts) : Promise.resolve(new Map())),
    refresh: () => { if (live && live.refresh) live.refresh(); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
