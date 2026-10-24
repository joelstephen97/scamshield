// engine/linkguard_rules.js — pure helpers for the live link guard (0.15.0, Task 15).
// Which links to look up, which verdict marks them, how many hosts one page may spend per
// minute. No DOM, no chrome.*: content/linkguard.js wires these to the page.
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, { linkRules: mod });
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';

  // The destination a link really leads to: redirect wrappers unwrapped (engine/constants.js table),
  // http(s) only, and null for a link that stays on the page's own registrable domain.
  function destination(href, baseHref, pageHost) {
    if (!href || typeof href !== 'string') return null;
    const real = C.unwrapSerpRedirect(href, baseHref);
    if (!real) return null;
    let u;
    try { u = new URL(real); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    if (!host) return null;
    const page = String(pageHost || '').toLowerCase();
    if (host === page) return null;
    if (page && C.registrableDomain(host) === C.registrableDomain(page)) return null;
    return { url: u.href, host };
  }

  // Marking level for one SW result { level, popular, lookalike }. A popular host is never marked
  // (doctrine: no heuristic-only interruptions on popular sites). A brand lookalike ALONE never marks a link
  // (0.15.0 final): the benign sweep showed it marking brand-owned sister domains (github.careers,
  // github.community, go.thehub-amazon.com) on the brand's own pages. Only list verdicts mark; the page-level
  // engine still judges a lookalike destination when it is opened.
  function levelFor(r) {
    if (!r || typeof r !== 'object' || r.popular) return null;
    if (r.level === 'block') return 'block';
    if (r.level === 'warn') return 'warn';
    return null;
  }

  // At most `cap` NEW distinct hosts per `windowMs`. Fixed window: simple, bounded, no timers.
  function newHostBudget(cap, windowMs) {
    let start = -Infinity, used = 0;
    return {
      take(now) {
        if (now - start >= windowMs) { start = now; used = 0; }
        if (used >= cap) return false;
        used++;
        return true;
      }
    };
  }

  // The hosts worth one batched lookup now: not already cached, distinct, inside the budget, capped.
  function planBatch(hosts, cache, budget, now, maxBatch) {
    const out = [], seen = new Set();
    for (const h of hosts || []) {
      if (out.length >= maxBatch) break;
      if (!h || seen.has(h) || cache.has(h)) continue;
      seen.add(h);
      if (!budget.take(now)) break;
      out.push(h);
    }
    return out;
  }

  // Which events the capture listener acts on: real input only, and every way to open a link that a
  // scam page could rely on (plain, ctrl/cmd/shift click, middle click, Enter on a focused link).
  function shouldIntercept(e) {
    if (!e || e.isTrusted !== true) return false;
    if (e.type === 'click') return !e.button;
    if (e.type === 'auxclick') return e.button === 1;
    if (e.type === 'keydown') return e.key === 'Enter';
    return false;
  }

  return { destination, levelFor, newHostBudget, planBatch, shouldIntercept };
});
