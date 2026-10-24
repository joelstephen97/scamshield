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
  const TG_TEXT = /api\.telegram\.org\/bot\d{5,}:[A-Za-z0-9_-]{30,}/;
  const DC_TEXT = /discord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[A-Za-z0-9_-]{20,}/;

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

  return { exfilServiceOf, exfilEndpointInText, bodyCarriesSecret, EXFIL_TEXT_CAP: TEXT_CAP };
});
