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
  const LABELS = {
    countdownReset: ['Fake countdown', 'A "hurry, offer ends" timer resets every visit — the urgency is fake.'],
    offPlatformPay: ['Risky payment', 'Checkout pushes you to Zelle/Venmo/CashApp/wire/crypto — you cannot get this money back if it is a scam.'],
    fakeScarcity: ['Fake scarcity', 'Injected "only a few left / N people viewing" pressure widgets.'],
    badgeHotlink: ['Fake trust badge', 'A "secure"/"verified" badge that is just an image, linking nowhere.'],
    missingContact: ['No contact info', 'No real address, phone or company details — normal for a throwaway scam shop.']
  };
  // Weights toward the single "shopping risk" score.
  // Off-platform payment (Zelle/wire/crypto on a shop) is close to decisive on
  // its own; a resetting countdown is strong but needs one corroborator.
  const WEIGHT = { offPlatformPay: 3, countdownReset: 2, fakeScarcity: 1, badgeHotlink: 1, missingContact: 1 };

  function scoreShop(input) {
    const s = input || {};
    if (!s.isStorefront) return { level: 'none', flags: [], score: 0 };
    const flags = [];
    let score = 0;
    const add = (code) => { flags.push({ code, label: LABELS[code][0], detail: LABELS[code][1] }); score += WEIGHT[code]; };
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

  return { scoreShop };
});
