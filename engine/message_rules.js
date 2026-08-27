(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield,
                       req ? require('./heuristics') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C, H) {
  'use strict';
  const { THRESHOLDS, SCAM_PHRASES } = C;

  // Message-specific phrase groups (SMS / WhatsApp / email bodies). Grouped so
  // one topic hit scores once — three delivery phrases are one delivery scam,
  // not three scams. Phrases are fee/threat-shaped on purpose: "your parcel
  // was delivered" must NOT hit, "pay the delivery fee" must.
  const MESSAGE_PHRASE_GROUPS = {
    delivery: [
      'held at customs', 'customs fee', 'delivery fee', 'redelivery fee',
      'shipping fee required', 'pay to release', 'parcel is held',
      'package is on hold', 'unpaid customs', 'address is incomplete, update'
    ],
    'bank-threat': [
      'account will be blocked', 'account will be suspended', 'account has been frozen',
      'card will be deactivated', 'kyc has expired', 'update your kyc',
      'net banking will be suspended', 'debit card blocked', 'pan card update'
    ],
    job: [
      'work from home', 'working from home', 'earn per day', 'no experience needed',
      'no experience required', 'limited slots', 'part-time job offer', 'daily payout',
      'hiring urgently', 'reply yes'
    ],
    crypto: [
      'double your investment', 'guaranteed returns', 'risk-free investment',
      'profit daily', 'investment plan', 'crypto giveaway', 'trading signals'
    ],
    prize: [
      'lucky draw', 'lottery', 'you have been selected', 'claim your prize',
      'you won', 'you have won', 'congratulations you'
    ],
    urgency: [
      'within 24 hours', 'within 48 hours', 'act now', 'final notice',
      'last warning', 'immediately or', 'offer expires', 'expires today'
    ]
  };
  // Urgency alone is marketing, not fraud — it only ever amplifies.
  const AMPLIFIER_GROUPS = ['urgency'];

  // Asking the recipient to hand over a secret. No legitimate service does
  // this. The negation guard keeps real OTP messages ("do not share your
  // OTP") safe.
  const CRED_ASK_RE = /\b(share|send|reply with|provide|give|confirm|tell us)\b[^.!?\n]{0,40}\b(otp|one[- ]?time password|pin|cvv|passcode|password|card number)\b/;
  const CRED_NEG_RE = /\b(do not|don't|dont|never|not to)\b[^.!?\n]{0,30}\b(share|send|give|provide|disclose|reveal)\b/;

  const URL_RE = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;

  function scoreMessage(text) {
    const raw = String(text || '');
    const t = raw.toLowerCase().replace(/\s+/g, ' ');
    const reasons = [];
    let score = 0;

    // 1. Credential harvesting ask — decisive on its own.
    if (CRED_ASK_RE.test(t) && !CRED_NEG_RE.test(t)) {
      score = Math.max(score, 0.85);
      reasons.push({ code: 'msgOtpAsk', kind: 'message' });
    }

    // 2. Scam phrase groups (message-specific + the page-level classics).
    const groupsHit = [];
    let extraPhrases = 0; // additional hits within an already-hit group
    for (const [group, phrases] of Object.entries(MESSAGE_PHRASE_GROUPS)) {
      const hits = phrases.filter((p) => t.includes(p));
      if (hits.length) { groupsHit.push({ group, hit: hits[0] }); extraPhrases += hits.length - 1; }
    }
    const classic = (SCAM_PHRASES || []).find((p) => t.includes(p));
    if (classic && !groupsHit.some((g) => g.hit === classic)) {
      groupsHit.push({ group: 'classic', hit: classic });
    }
    const substantive = groupsHit.filter((g) => !AMPLIFIER_GROUPS.includes(g.group));
    const amplifiers = groupsHit.length - substantive.length;
    if (substantive.length) {
      score += Math.min(0.6, 0.3 * substantive.length + 0.1 * extraPhrases + 0.15 * amplifiers);
      reasons.push({ code: 'msgScamWording', kind: 'message', params: [substantive[0].hit] });
      if (amplifiers) reasons.push({ code: 'msgUrgencyDeadline', kind: 'message' });
    }

    // 3. Links, judged by the same URL engine that scans pages.
    const links = [];
    const seen = new Set();
    for (const m of raw.match(URL_RE) || []) {
      const url = m.startsWith('www.') ? 'http://' + m : m;
      if (seen.has(url) || links.length >= 10) continue;
      seen.add(url);
      const r = H.scoreUrl(url);
      links.push({ url, score: r.score, reasons: r.reasons });
    }
    const worst = links.reduce((a, l) => Math.max(a, l.score), 0);
    if (worst >= THRESHOLDS.suspicious) {
      score = Math.max(score, worst);
      const bad = links.find((l) => l.score === worst);
      reasons.push({ code: 'msgDangerousLink', kind: 'message', params: [bad.url] });
    } else if (worst > 0 && substantive.length) {
      score += 0.1; // scammy wording + a slightly-off link beats either alone
    }

    score = Math.max(0, Math.min(1, score));
    let level = 'safe';
    if (score >= THRESHOLDS.dangerous) level = 'dangerous';
    else if (score >= THRESHOLDS.suspicious) level = 'suspicious';
    return { level, score: Number(score.toFixed(4)), reasons, links };
  }

  return { scoreMessage };
});
