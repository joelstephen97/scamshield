(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Credential exfil to a chat bot (0.15.0). Phishing kits send the typed login to a Telegram bot or a Discord
  // webhook: https://api.telegram.org/bot<id>:<token>/sendMessage or https://discord.com/api/webhooks/<id>/<token>.
  // The two endpoint shapes have no legitimate use on a page that asks for a password.
  //
  // content/main_world_guard.js carries a tiny inline copy of exfilServiceOf (engine files are not loaded in the MAIN
  // world). tests/unit/exfil_rules.test.js runs both copies against one table, so they cannot drift.

  const TG_PATH = /^\/bot\d{5,}:[A-Za-z0-9_-]{30,}\/[A-Za-z]+$/;
  const DC_PATH = /^\/api\/webhooks\/\d{5,}\/[A-Za-z0-9_-]{20,}(?:\/.*)?$/;
  const TEXT_CAP = 300 * 1024;
  const TG_TEXT = /(?<![\w.-])api\.telegram\.org\/bot\d{5,}:[A-Za-z0-9_-]{30,}/;
  const DC_TEXT = /(?<![\w.-])discord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[A-Za-z0-9_-]{20,}/;

  // 'telegram' | 'discord' | null. Parsed with URL, never matched as a substring, so api.telegram.org.evil.com and
  // https://evil.com/?u=api.telegram.org/bot... are not endpoints. https only.
  function exfilServiceOf(url) {
    try {
      const u = new URL(String(url));
      if (u.protocol !== 'https:' || u.username || u.password) return null;
      const h = u.hostname.toLowerCase();
      if (h === 'api.telegram.org') return TG_PATH.test(u.pathname) ? 'telegram' : null;
      if (h === 'discord.com' || h === 'discordapp.com') return DC_PATH.test(u.pathname) ? 'discord' : null;
    } catch (_) { /* not a URL */ }
    return null;
  }

  // The same check over script text. Work is capped at 300 KB.
  function exfilEndpointInText(text) {
    const s = String(text == null ? '' : text).slice(0, TEXT_CAP);
    if (TG_TEXT.test(s)) return 'telegram';
    if (DC_TEXT.test(s)) return 'discord';
    return null;
  }

  // Does the request body carry any typed secret? Plain, percent-encoded, '+'-for-space and JSON-escaped forms.
  function bodyCarriesSecret(body, secrets) {
    const b = String(body == null ? '' : body);
    if (!b || !Array.isArray(secrets)) return false;
    for (const sec of secrets) {
      if (typeof sec !== 'string' || sec.length < 4) continue;
      if (b.indexOf(sec) !== -1) return true;
      let enc = null;
      try { enc = encodeURIComponent(sec); } catch (_) { /* lone surrogate */ }
      if (enc) {
        // encodeURIComponent leaves ! ' ( ) * ~ bare; URLSearchParams / form encoders escape them (space as '+').
        const strict = enc.replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
        for (const v of [enc, enc.replace(/%20/g, '+'), strict, strict.replace(/%20/g, '+')]) if (b.indexOf(v) !== -1) return true;
      }
      const js = JSON.stringify(sec).slice(1, -1);
      if (js !== sec && b.indexOf(js) !== -1) return true;
    }
    return false;
  }

  // Static corroboration (fix round 1). A bot URL in an inline script is not enough (shops hard-code one for order
  // or chat notifications). The SAME script text must also read input data: `.val(`, `.value`, `FormData(`, or the words
  // password / passwd / pass / pwd (word-bounded). A widget that sends only document.title / location.href has none.
  const READS_INPUT = /\.val\s*\(|\.value\b|\bFormData\s*\(|\b(?:password|passwd|pass|pwd)\b/i;
  function exfilCredentialScript(text) {
    const svc = exfilEndpointInText(text);
    if (!svc) return null;
    return READS_INPUT.test(String(text).slice(0, TEXT_CAP)) ? svc : null;
  }
  // Only classic JS blocks are scanned: no type, or a JavaScript MIME type / module. JSON, ld+json, templates are data.
  const JS_TYPES = ['', 'text/javascript', 'module', 'application/javascript', 'text/ecmascript', 'application/ecmascript'];
  function isJsScriptType(type) {
    return JS_TYPES.indexOf(String(type == null ? '' : type).trim().toLowerCase()) !== -1;
  }

  // Runtime matching (fix round 1). A typed secret counts only inside the VALUE of a text-bearing parameter of the
  // request: never the path, bot token, chat_id, parse_mode or any key name (a password of 123456 must not match
  // chat_id=-1001234567890, nor `text` the key text). URL query, urlencoded body, JSON body and the guard's `k=v&`
  // serialisation are all read; an unparseable body falls back to the raw body (the URL path is never included).
  const TEXT_KEYS = {
    telegram: ['text', 'caption', 'message', 'content', 'description', 'embeds'],
    discord: ['content', 'embeds', 'username', 'payload_json']
  };
  const isAlnum = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
  // 6+ chars: bounded occurrence (non-alphanumeric or edge each side) inside the value. 4-5 chars: must be a whole
  // whitespace / newline / colon separated token of the value.
  function secretInValue(value, sec) {
    if (typeof sec !== 'string' || sec.length < 4 || !value) return false;
    const forms = [sec];
    const js = JSON.stringify(sec).slice(1, -1);
    if (js !== sec) forms.push(js);
    for (const f of forms) {
      if (sec.length < 6) {
        if (value.split(/[\s:]+/).indexOf(f) !== -1) return true;
        continue;
      }
      for (let i = value.indexOf(f); i !== -1; i = value.indexOf(f, i + 1)) {
        if (!isAlnum(value[i - 1]) && !isAlnum(value[i + f.length])) return true;
      }
    }
    return false;
  }
  function textValues(service, url, body) {
    const keys = TEXT_KEYS[service] || [];
    const out = [];
    const take = (k, v) => {
      if (keys.indexOf(String(k).toLowerCase()) === -1 || v == null) return;
      out.push(typeof v === 'string' ? v : JSON.stringify(v));
    };
    try { for (const [k, v] of new URL(String(url)).searchParams) take(k, v); } catch (_) { /* no query */ }
    const b = String(body == null ? '' : body);
    if (!b) return out;
    let parsed = false;
    if (/^\s*[{[]/.test(b)) {
      try {
        const j = JSON.parse(b);
        if (j && typeof j === 'object') { for (const k of Object.keys(j)) take(k, j[k]); parsed = true; }
      } catch (_) { /* raw fallback below */ }
    }
    if (!parsed && /^[^=&]+=/.test(b)) {
      try { for (const [k, v] of new URLSearchParams(b)) take(k, v); parsed = true; } catch (_) { /* raw fallback */ }
    }
    if (!parsed) out.push(b);
    return out;
  }
  function secretInExfilRequest(service, url, body, secrets) {
    if (!Array.isArray(secrets) || !secrets.length) return false;
    const values = textValues(service, url, body);
    return values.some((v) => secrets.some((sec) => secretInValue(v, sec)));
  }

  return { exfilCredentialScript, isJsScriptType, secretInExfilRequest, exfilServiceOf, exfilEndpointInText, bodyCarriesSecret, EXFIL_TEXT_CAP: TEXT_CAP };
});
