(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Fake-shop signals (0.6.0). Badge/popup tier ONLY — these are probabilistic
  // and the research is explicit that fake-shop heuristics are noisy, so they
  // never drive a full-screen block and never exceed "suspicious", and then
  // only when several independent flags stack. We deliberately DON'T do
  // "too-good price" (no catalogue baseline → false-positive machine), fake-
  // review text classification, or domain age (needs network).
  //
  // input signals (all computed on-device in the content script):
  //   isStorefront   : looks like a shop (cart/checkout/price/add-to-cart)
  //   fakeScarcity   : count of "only N left" / "N people viewing" widgets
  //   countdownReset : a countdown timer reset to (near) the same value on
  //                    revisit — near-conclusive fakery (persisted per origin)
  //   badgeHotlink   : a trust/secure badge image hotlinked from an unrelated
  //                    CDN with no link to a live profile
  //   offPlatformPay : checkout steers to Zelle/Venmo/CashApp/wire/crypto
  //   missingContact : no contact / imprint / company info anywhere
  //
  // Flags are code-only — the UI resolves reason_shop_<code> (short label) and
  // reason_shop_<code>_detail (sentence) through ui/reasons.js.
  // Weights toward the single "shopping risk" score.
  // Off-platform payment (Zelle/wire/crypto on a shop) is close to decisive on
  // its own; a resetting countdown is strong but needs one corroborator.
  const WEIGHT = { offPlatformPay: 3, countdownReset: 2, fakeScarcity: 1, badgeHotlink: 1, missingContact: 1 };

  function scoreShop(input) {
    const s = input || {};
    if (!s.isStorefront) return { level: 'none', flags: [], score: 0 };
    const flags = [];
    let score = 0;
    const add = (code) => { flags.push({ code }); score += WEIGHT[code]; };
    if (s.countdownReset) add('countdownReset');
    if (s.offPlatformPay) add('offPlatformPay');
    if ((s.fakeScarcity || 0) > 0) add('fakeScarcity');
    if (s.badgeHotlink) add('badgeHotlink');
    if (s.missingContact) add('missingContact');
    // A single soft flag is just a note; a strong flag or two stacked flags
    // make it "suspicious". Never higher.
    let level = 'none';
    if (score >= 3) level = 'suspicious';
    else if (score >= 1) level = 'note';
    return { level, flags, score };
  }

  // (0.15.0) Largest MM:SS / HH:MM:SS countdown in a piece of text, in seconds (0 = none).
  // Clock times are not countdowns: "Open 9:00-18:00", "Opens 09:00", "Hours: 10:00",
  // "Closes at 18:00", "5:30 pm" and any HH:MM - HH:MM range are skipped, so a shop's
  // opening hours can never feed the "countdown reset" flag.
  function countdownSecondsFromText(text) {
    const t = String(text == null ? '' : text);
    const re = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
    let m, best = 0;
    while ((m = re.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 16), m.index);
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 14);
      if (/^\s?(am|pm)\b/i.test(after)) continue;
      if (/\b(open|opens|opening|hours?|closes?|closing)\s*(at|:)?\s*$/i.test(before)) continue;
      if (/^\s*(-|\u2013|\u2014|to)\s*\d{1,2}:\d{2}/i.test(after)) continue;
      if (/\d{1,2}:\d{2}\s*(-|\u2013|\u2014|to)\s*$/i.test(before)) continue;
      const secs = m[3] ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
      if (secs > best && secs <= 48 * 3600) best = secs;
    }
    return best;
  }

  return { scoreShop, countdownSecondsFromText };
});
