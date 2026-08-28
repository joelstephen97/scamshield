// ui/stats_view.js — pure view arithmetic for the Statistics tab.
//
// background/stats.js owns the counters; this file owns the shapes the
// dashboard draws: a zero-filled (and, over long spans, grouped) bar series
// and the ordered "threats by type" rows. Nothing here touches chrome.* or the
// DOM — state comes in as arguments and plain objects go out — so the whole
// module is unit-testable under plain `node --test`.
//
// UMD like the engine/ui modules: loadable as a <script> from options.html and
// require()-able from Node tests.
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('../background/stats.js') : root.SSStats);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSStatsView = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (SSStats) {
  'use strict';

  const DAY = 86400000;
  // The ring in background/stats.js keeps 90 days, so "All time" can never draw
  // more than that however old the install is (the tiles still show the true
  // all-time totals, which are plain counters).
  const ALL_MAX_DAYS = 90;
  // Above this many days the chart groups days into equal buckets rather than
  // drawing hairline bars. 14 keeps every bar wide enough to hover.
  const MAX_BARS = 14;
  const FIELDS = ['checked', 'threats', 'privacy'];

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function at(now) {
    return typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
  }
  // UTC day boundaries, matching SSStats.dayKey: pure arithmetic, DST-proof,
  // and stable if the user travels.
  function dayKey(t) { return new Date(t).toISOString().slice(0, 10); }
  function startOfDay(t) { return Date.parse(dayKey(t) + 'T00:00:00Z'); }

  // How many days the chart covers for a period. 'all' runs from the install
  // day to today, clamped to the ring's length — `clamped` tells the caller to
  // say "last 90 days" instead of "since install".
  function spanDays(period, now, installedAt) {
    const p = String(period);
    if (p === '7' || p === '30') return { days: Number(p), clamped: false };
    const t = at(now);
    const inst = (typeof installedAt === 'number' && Number.isFinite(installedAt) && installedAt > 0) ? installedAt : t;
    const raw = Math.round((startOfDay(t) - startOfDay(inst)) / DAY) + 1;
    const days = Math.min(Math.max(raw, 1), ALL_MAX_DAYS);
    return { days, clamped: raw > ALL_MAX_DAYS };
  }

  // Zero-filled bar series ending today, oldest first. Days missing from the
  // ring (no activity) become zeros rather than gaps. The fixed 7/30-day
  // periods always draw one bar per day; only "All time" — whose span grows
  // without bound until the ring caps it — groups days into equal buckets once
  // it passes MAX_BARS. The oldest bucket is the short one, so the newest bars
  // always represent a full group.
  function series(statsDaily, period, now, installedAt) {
    const { days, clamped } = spanDays(period, now, installedAt);
    const grouped = String(period) !== '7' && String(period) !== '30';
    const byDay = new Map();
    for (const b of (Array.isArray(statsDaily) ? statsDaily : [])) {
      if (!b || typeof b.d !== 'string') continue;
      byDay.set(b.d, b);
    }
    const end = startOfDay(at(now));
    const start = end - (days - 1) * DAY;
    const groupDays = (grouped && days > MAX_BARS) ? Math.ceil(days / MAX_BARS) : 1;

    const bars = [];
    for (let toT = end; toT >= start; toT -= groupDays * DAY) {
      const fromT = Math.max(toT - (groupDays - 1) * DAY, start);
      const bar = { from: dayKey(fromT), to: dayKey(toT), days: Math.round((toT - fromT) / DAY) + 1, checked: 0, threats: 0, privacy: 0 };
      for (let t = fromT; t <= toT; t += DAY) {
        const rec = byDay.get(dayKey(t));
        if (!rec) continue;
        for (const f of FIELDS) bar[f] += num(rec[f]);
      }
      bars.unshift(bar);
    }
    return { period: String(period), days, groupDays, clamped, from: dayKey(start), to: dayKey(end), bars };
  }

  // Bar heights as percentages of the tallest bar. An all-zero series returns
  // all zeros (the CSS min-height draws a flat baseline) instead of dividing by
  // zero or drawing a full-height row of empty bars.
  function heights(bars) {
    const max = (Array.isArray(bars) ? bars : []).reduce((m, b) => Math.max(m, num(b && b.checked)), 0);
    return (Array.isArray(bars) ? bars : []).map((b) => (max > 0 ? Math.round(num(b && b.checked) / max * 100) : 0));
  }

  // "Threats by type" rows: every category always present (a zero row draws an
  // empty track), ordered by count descending and, for ties, by the fixed
  // taxonomy order so the list never reshuffles between renders. `pct` is
  // relative to the biggest category, matching the chart's scaling.
  function catRows(threatsByType, categories) {
    const cats = Array.isArray(categories) && categories.length
      ? categories
      : ((SSStats && SSStats.CATEGORIES) || []);
    const src = (threatsByType && typeof threatsByType === 'object') ? threatsByType : {};
    const rows = cats.map((key, i) => ({ key, count: num(src[key]), order: i }));
    const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
    rows.sort((a, b) => (b.count - a.count) || (a.order - b.order));
    return rows.map((r) => ({ key: r.key, count: r.count, pct: max > 0 ? Math.round(r.count / max * 100) : 0 }));
  }

  return { DAY, ALL_MAX_DAYS, MAX_BARS, dayKey, spanDays, series, heights, catRows };
});
