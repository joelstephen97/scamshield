// ui/reasons.js — the UI boundary for engine reasons.
//
// Engine modules emit structured reasons ({ code, kind, params }) and never
// English text, so the same verdict can be shown in any locale and reported to
// GitHub in English. This file is the only place that turns a code into words:
// chrome.i18n first (key "reason_<code>"), then the EN table below.
//
// UMD like the engine modules — loadable as a content script, imported by the
// ES-module service worker, and require()-able from Node unit tests with no
// browser globals present.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSReasons = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // English source of truth. Every key here must have a matching "reason_<key>"
  // message in _locales/en/messages.json (tests/unit/reasons.test.js enforces
  // both directions). $1..$n are positional runtime values.
  const EN = {
    // engine/heuristics.js — scoreUrl
    ipHost: 'Uses a raw IP address instead of a domain name.',
    atSymbol: 'URL contains an "@" that can hide the real destination.',
    punycodeHost: 'Domain uses punycode, often used to mimic real brands.',
    idnHomograph: 'This domain imitates "$1" using look-alike foreign characters.',
    brandLookalike: 'Domain looks like it impersonates a well-known brand.',
    suspiciousTld: 'Domain uses a top-level domain frequently abused by scams.',
    noHttps: 'Connection is not secure (no HTTPS).',
    manySubdomains: 'Unusually many subdomains.',
    urgencyKeywords: 'URL contains multiple urgency/security keywords.',
    randomHost: 'Domain name looks randomly generated.',
    // engine/heuristics.js — scoreDom
    credentialFormForeignDomain: 'A password form on this page sends your credentials to a different site.',
    hiddenIframes: 'Page contains hidden frames that may capture input.',
    scamPhrase: 'Page shows classic scam/giveaway language ("$1").',
    seedPhraseAsk: 'This page asks for your wallet recovery phrase — never enter it; this steals your funds.',
    brandImpersonationContent: 'This page looks like "$1" but is not on its real website.',
    deliveryFeeScam: 'This page pretends to be $1 and asks for card details to release a package. Carriers never collect fees through pages like this.',
    brandIconMismatch: "This page uses $1's icon but is not $1's website.",
    // engine/verdict.js — page-content model
    contentPhishingPattern: 'Page wording and layout resemble known phishing pages.',
    // engine/techscam_rules.js
    techScamScareText: 'Page uses fake security-alert language ("$1").',
    techScamPhoneAsk: 'Page urges you to call a phone number for "support" — a hallmark of tech-support scams.',
    techScamFakeAlert: 'This is a web page pretending to be a system alert — your computer is fine. Real Microsoft/Apple warnings never show phone numbers.',
    techScamFullscreen: 'Page forced fullscreen to make itself hard to close.',
    techScamAlarmAudio: 'Page plays alarm audio to panic you.',
    techScamDialogFlood: 'Page spammed pop-up dialogs to trap you.',
    techScamHistoryTrap: 'Page is hijacking your Back button.',
    // engine/wallet_rules.js
    walletBlindSign: 'A site asked your wallet to blind-sign arbitrary data — a common drainer trick.',
    walletPermitApproval: 'This signature is a token approval ("Permit"). Signing it lets this site move your tokens or NFTs later, without asking you again — the most common wallet-drainer signature.',
    walletDelegation7702: 'This transaction would hand control of your account to a contract (EIP-7702 delegation) — a technique drainers use to empty wallets.',
    walletSetApprovalAll: 'This transaction grants a site control over ALL your NFTs in a collection.',
    walletUnlimitedApprove: 'This transaction gives a site UNLIMITED permission to spend your tokens.',
    walletTokenApprove: 'This transaction lets a site spend some of your tokens.',
    // engine/clickfix_rules.js
    clickfixPasteRun: 'This page put a system command on your clipboard and is telling you to paste and run it. Real websites never do this — running it would infect your computer.',
    clickfixFakeCaptcha: 'This "verification" asks you to press Win+R and paste a command. Real CAPTCHAs never ask you to run anything — this installs malware.',
    clickfixWinR: 'This page instructs you to open the Windows Run box and paste something — a pattern used to trick people into running malware.',
    clickfixCaptchaDisguise: 'The instructions are disguised as a human-verification step.',
    // engine/clipboard_rules.js
    clipboardCommand: 'A site copied a system command to your clipboard. Do NOT paste it into a terminal or the Run box.',
    clipboardCryptoAddress: 'A site put a cryptocurrency address on your clipboard — verify it before pasting.',
    // engine/fakeupdate_rules.js
    fakeUpdatePrompt: 'This page pretends your browser needs an update and offers a download. Real update prompts come from the browser itself — never from a web page. The download is very likely malware.',
    // engine/message_rules.js
    msgOtpAsk: 'Asks you to share an OTP, PIN, or password — no legitimate service ever does this.',
    msgScamWording: 'Uses known scam wording ("$1").',
    msgUrgencyDeadline: 'Adds pressure with an artificial deadline — a classic scam tactic.',
    msgDangerousLink: 'Contains a dangerous-looking link ($1).',
    // engine/shop_rules.js — each flag has a short label and a detail sentence.
    shop_countdownReset: 'Fake countdown',
    shop_countdownReset_detail: 'A "hurry, offer ends" timer resets every visit — the urgency is fake.',
    shop_offPlatformPay: 'Risky payment',
    shop_offPlatformPay_detail: 'Checkout pushes you to Zelle/Venmo/CashApp/wire/crypto — you cannot get this money back if it is a scam.',
    shop_fakeScarcity: 'Fake scarcity',
    shop_fakeScarcity_detail: 'Injected "only a few left / N people viewing" pressure widgets.',
    shop_badgeHotlink: 'Fake trust badge',
    shop_badgeHotlink_detail: 'A "secure"/"verified" badge that is just an image, linking nowhere.',
    shop_missingContact: 'No contact info',
    shop_missingContact_detail: 'No real address, phone or company details — normal for a throwaway scam shop.'
  };

  // The extension APIs are absent in Node (unit tests) and in a page that
  // loads this file standalone, so every access stays behind typeof + try.
  function i18n() {
    try {
      if (typeof browser !== 'undefined' && browser && browser.i18n) return browser.i18n;
      if (typeof chrome !== 'undefined' && chrome && chrome.i18n) return chrome.i18n;
    } catch (_) {}
    return null;
  }

  function subst(tmpl, params) {
    return String(tmpl).replace(/\$(\d)/g, (m, i) => {
      const v = params && params[i - 1];
      return v != null ? String(v) : '';
    });
  }

  // Localised text for one reason. Legacy plain-string reasons (verdicts cached
  // by an older version) pass straight through.
  function resolveReason(r) {
    if (typeof r === 'string') return r;
    if (!r || !r.code) return '';
    const params = (r.params || []).map(String);
    const api = i18n();
    if (api) {
      try { const m = api.getMessage('reason_' + r.code, params); if (m) return m; } catch (_) {}
    }
    return subst(EN[r.code] || r.code, params);
  }

  // English regardless of UI locale — for GitHub issue bodies.
  function reasonToEnglish(r) {
    if (typeof r === 'string') return r;
    if (!r || !r.code) return '';
    return subst(EN[r.code] || r.code, r.params || []);
  }

  // Evidence-chip category. 'page' is the neutral default.
  function reasonKind(r) { return (r && r.kind) || 'page'; }

  // Right-to-left UI language (defaults to the browser's UI language).
  function isRTL(lang) {
    let l = lang;
    if (l == null) {
      const api = i18n();
      try { l = api && api.getUILanguage ? api.getUILanguage() : ''; } catch (_) { l = ''; }
    }
    return /^(ar|he|fa|ur)\b/i.test(String(l || ''));
  }

  return { resolveReason, reasonToEnglish, reasonKind, EN, isRTL };
});
