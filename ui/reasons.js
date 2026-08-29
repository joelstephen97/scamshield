// ui/reasons.js — the UI boundary for engine reasons.
//
// Engine modules emit structured reasons ({ code, kind, params }) and never
// English text, so the same verdict can be shown in any locale and reported to
// GitHub in English. This file is the only place that turns a code into words:
// the user's language override first (0.7.0, see below), then chrome.i18n (key
// "reason_<code>"), then the EN table below.
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
    // engine/brand_match.js, engine/site_signals.js, engine/risk_rules.js — v0.9 detection upgrades (Task B3)
    brandFuzzyMatch: "This domain closely resembles $1's real domain — check the address bar carefully before entering anything.",
    deepSubdomainChain: 'Domain has an unusually deep chain of subdomains below its real domain — a common cloaking trick.',
    longHostLabel: 'Domain contains an unusually long part, often used to bury a fake brand name or hide the real domain.',
    shortenerHost: 'This is a link-shortener domain ($1) — the real destination is hidden until you click it.',
    riskAbusedTld: "Domain's top-level domain ($1) has a high rate of scam abuse in ScamShield's threat-feed risk tables.",
    riskDynamicHost: 'Domain is hosted on a dynamic-DNS or free-hosting provider frequently abused for scam pages.',
    // background/service_worker.js — v0.9 threat-feed matcher (Task B2)
    feedBlock: "This domain matches ScamShield's threat feed, confirmed by $1 independent source(s).",
    feedWarn: "This domain matches a lower-confidence entry in ScamShield's threat feed ($1 source(s)) — proceed carefully.",
    // background/service_worker.js checkNrdHost() — "new site" signal (0.10.0, Task C3)
    newDomain: 'Domain appears on a newly-registered-domains list — most scam sites are only days old$1.',
    // engine/heuristics.js — scoreDom
    credentialFormForeignDomain: 'A password form on this page sends your credentials to a different site.',
    // engine/constants.js crossOriginCredPostHost + content/content_script.js guardExfilForms (0.10.0, Task C2)
    crossOriginCredPost: 'This form sends your password or card details to $1 — a different site than the one you are on.',
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

  // Left-to-right isolate: wraps a hostname/URL/number so it renders correctly
  // when embedded in a right-to-left sentence (Arabic, Hebrew, Persian, Urdu)
  // without disturbing the surrounding punctuation's bidi order. Unicode
  // Isolate marks are invisible and harmless in LTR text too, so this is safe
  // to apply unconditionally to every interpolated run.
  const LRI = '⁦', PDI = '⁩';
  function bidiWrap(s) { return s == null ? '' : LRI + String(s) + PDI; }

  // `$$` is chrome.i18n's escape for a literal dollar sign, and it is unescaped
  // HERE rather than in messagesToDict() because order matters: chrome resolves
  // placeholders and unescapes in one pass, so "$$1" must come out as the
  // literal "$1" and never as an argument. Unescaping while building the
  // dictionary would turn "$$1" into "$1" and this function would then
  // substitute it — silently swallowing a literal. The alternation below tries
  // `$$` first, so both cases land correctly, and every override lookup goes
  // through this one function (tOverride and resolveReason both call it).
  function subst(tmpl, params, isolate) {
    return String(tmpl).replace(/\$\$|\$(\d)/g, (m, i) => {
      if (i === undefined) return '$';
      const v = params && params[i - 1];
      if (v == null) return '';
      return isolate ? bidiWrap(v) : String(v);
    });
  }

  // ---- Per-user language override (0.7.0) ---------------------------------
  // Chrome exposes no API to render an extension in a language other than the
  // browser's, so the override is the documented AdBlock pattern: a custom
  // loader over our own packaged _locales/. Whoever can read those files hands
  // the chosen language plus a POSITIONAL dictionary to setOverride() — the
  // extension pages read the file themselves (ui/i18n.js), content scripts get
  // it from the service worker (message 'getLangDict', because a content script
  // cannot fetch an extension URL without making it web-accessible, which this
  // feature deliberately does not do). This module then answers every lookup
  // from that dictionary before touching chrome.i18n, and it is module state on
  // purpose: reasons, the page applier and the content scripts' own t() all
  // share this one instance per world, so they can never disagree about which
  // language the user is being shown.
  //
  // The 20 shipped locale directories, in the order the options dropdown lists
  // them. The single source of truth for "is this a language we can switch
  // to" — the settings validator, the options dropdown and the dictionary
  // loader all read it from here.
  const LOCALES = ['ar', 'bn', 'de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko',
    'mr', 'pt_BR', 'ru', 'ta', 'te', 'tr', 'ur', 'vi', 'zh_CN'];
  // Autonyms — each language written in itself, deliberately NOT message keys:
  // a language picker must read the same in every locale, so a Spanish speaker
  // looking for Japanese finds 日本語 and not "Japonés".
  const LANG_NAMES = {
    ar: 'العربية', bn: 'বাংলা', de: 'Deutsch', en: 'English', es: 'Español',
    fr: 'Français', hi: 'हिन्दी', id: 'Bahasa Indonesia', it: 'Italiano',
    ja: '日本語', ko: '한국어', mr: 'मराठी', pt_BR: 'Português (Brasil)',
    ru: 'Русский', ta: 'தமிழ்', te: 'తెలుగు', tr: 'Türkçe', ur: 'اردو',
    vi: 'Tiếng Việt', zh_CN: '中文（简体）'
  };

  // Locale DIRECTORY name → BCP-47 tag for Intl. Chrome's _locales/ folders use
  // an underscore ("pt_BR", "zh_CN"); Intl.DateTimeFormat / RelativeTimeFormat /
  // toLocaleString want a hyphen, and throw RangeError on the underscore form.
  // Numbers and dates have to follow the chosen language too, or a German UI
  // would still print English month names.
  function intlTag(lang) { return String(lang || '').replace('_', '-'); }

  let overrideLang = '', overrideDict = null;

  // Installs (or, with a falsy argument, clears) the active override.
  function setOverride(lang, dict) {
    const ok = !!lang && !!dict && typeof dict === 'object';
    overrideLang = ok ? String(lang) : '';
    overrideDict = ok ? dict : null;
  }
  // The language actually in force, or '' when following the browser.
  function overrideLanguage() { return overrideLang; }

  // chrome.i18n.getMessage's contract, served from the override dictionary:
  // returns '' when there is no override or the key is missing, so callers fall
  // through to chrome.i18n and then to their own English literal — exactly the
  // per-key fallback a partial translation already relies on.
  function tOverride(key, subs) {
    if (!overrideDict || !key) return '';
    const tmpl = overrideDict[key];
    if (typeof tmpl !== 'string' || !tmpl) return '';
    const params = subs == null ? [] : (Array.isArray(subs) ? subs : [subs]);
    // Callers bidi-isolate their own substitutions before calling (same as they
    // do for chrome.i18n), so nothing is wrapped a second time here.
    return subst(tmpl, params, false);
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // A parsed _locales/<lang>/messages.json → { key: positional template }.
  // Chrome's format declares named placeholders ($BRAND$) whose `content` maps
  // them onto the positional arguments getMessage() receives ("$1"); our
  // subst() speaks the positional form, so the names are resolved away here,
  // once per language, instead of on every lookup. Pure — no chrome, no fetch —
  // so the service worker, the pages and the Node unit tests share one
  // implementation.
  function messagesToDict(json) {
    const out = {};
    if (!json || typeof json !== 'object') return out;
    for (const key of Object.keys(json)) {
      const entry = json[key];
      if (!entry || typeof entry.message !== 'string') continue;
      let msg = entry.message;
      const ph = entry.placeholders;
      if (ph && typeof ph === 'object') {
        for (const name of Object.keys(ph)) {
          const def = ph[name];
          const m = /^\$([1-9])$/.exec(String((def && def.content) || ''));
          if (!m) continue; // a placeholder that isn't a positional arg can't be mapped
          // $NAME$ references are case-insensitive in Chrome's format, and one
          // name may appear more than once (reason_brandIconMismatch uses
          // $BRAND$ twice). The replacement is a function so a literal "$1"
          // never gets re-read as a capture-group reference.
          msg = msg.replace(new RegExp('\\$' + escapeRe(name) + '\\$', 'gi'), () => '$' + m[1]);
        }
      }
      out[key] = msg;
    }
    return out;
  }

  // Localised text for one reason. Legacy plain-string reasons (verdicts cached
  // by an older version) pass straight through. Params (hostnames, brand
  // names, phrases, URLs) are wrapped in bidi isolates so they read correctly
  // in right-to-left locales.
  function resolveReason(r) {
    if (typeof r === 'string') return r;
    if (!r || !r.code) return '';
    const params = (r.params || []).map(String);
    const isolated = params.map(bidiWrap);
    const over = tOverride('reason_' + r.code, isolated);
    if (over) return over;
    const api = i18n();
    if (api) {
      try { const m = api.getMessage('reason_' + r.code, isolated); if (m) return m; } catch (_) {}
    }
    return subst(EN[r.code] || r.code, params, true);
  }

  // English regardless of UI locale — for GitHub issue bodies.
  function reasonToEnglish(r) {
    if (typeof r === 'string') return r;
    if (!r || !r.code) return '';
    return subst(EN[r.code] || r.code, r.params || []);
  }

  // Evidence-chip category. 'page' is the neutral default.
  function reasonKind(r) { return (r && r.kind) || 'page'; }

  // Right-to-left UI language. With no argument it reports the language
  // actually in force: the user's override when one is set, otherwise the
  // browser's UI language.
  function isRTL(lang) {
    let l = lang;
    if (l == null) {
      l = overrideLang;
      if (!l) {
        const api = i18n();
        try { l = api && api.getUILanguage ? api.getUILanguage() : ''; } catch (_) { l = ''; }
      }
    }
    return /^(ar|he|fa|ur)\b/i.test(String(l || ''));
  }

  return { resolveReason, reasonToEnglish, reasonKind, EN, isRTL, bidiWrap,
    LOCALES, LANG_NAMES, setOverride, overrideLanguage, tOverride, messagesToDict, intlTag };
});
