// Runs in the MAIN world (page JS context) to hook page-level APIs the isolated
// content script cannot see. It never reads page data; it only emits cancelable
// signals the isolated content script decides to act on.
(function () {
  'use strict';
  if (window.__scamshieldMainGuard) return;
  window.__scamshieldMainGuard = true;

  // (A) Hook programmatic form.submit() (which bypasses the 'submit' event per
  // spec). Emit a cancelable custom event; if the isolated world cancels it,
  // skip the native submit. Non-guarded forms are never cancelled, so native
  // form.submit() behaviour is preserved and no real 'submit' event is fired.
  const nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    let allowed = true;
    try {
      allowed = this.dispatchEvent(new CustomEvent('scamshield:formsubmit', { bubbles: true, cancelable: true }));
    } catch (e) { /* ignore */ }
    if (allowed) return nativeSubmit.apply(this, arguments);
  };

  // (B) Surface SPA route changes (isolated world can't see history calls).
  function emitNav() { try { window.dispatchEvent(new CustomEvent('scamshield:navigate')); } catch (e) {} }
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    if (typeof orig === 'function') {
      history[m] = function () { const r = orig.apply(this, arguments); emitNav(); return r; };
    }
  }
  window.addEventListener('popstate', emitNav);

  // (C) Popup / redirect interception (0.15.0, Task 16). Blocked-host refusal depends on the isolated world's
  // link-guard cache, so it is off when the link guard is off (settings.linkGuard === false). Best effort: a page can restore the prototypes, and
  // DNR stays the hard gate for known-bad hosts. Everything is try/catch and falls back to the native call; the
  // only page data read is the URL argument. The decision comes back synchronously through a cancelable event
  // (the same pattern as formsubmit): the isolated world vetoes only a destination already cached as 'block'.
  // The URL crosses as a plain string (safe on Firefox without cloneInto).
  // Fail closed: a warned document keeps popup/fullscreen/notification limits until reload; page-driven history changes
  // cannot clear it (a scam page can call history.pushState itself, and there is no authenticated channel back from
  // the isolated world). The tier is one-way for the life of the document.
  let tier = ''; // 'warn' | 'stop' | '' - set by the isolated world; a closure variable, never on window
  try {
    window.addEventListener('scamshield:tier', (e) => {
      // Once warn/stop is accepted a later lower tier event (a page forging '') is ignored.
      try { const d = e && e.detail; if (d === 'warn' || d === 'stop') tier = (tier === 'stop' || d === 'stop') ? 'stop' : 'warn'; } catch (_) { /* keep */ }
    });
  } catch (_) { /* ignore */ }
  const warned = () => tier === 'warn' || tier === 'stop';
  function noteBlocked(reason) {
    try { window.dispatchEvent(new CustomEvent('scamshield:popup-blocked', { detail: String(reason) })); } catch (_) { /* ignore */ }
  }
  // true = the isolated world vetoed this destination.
  function vetoed(u) {
    try {
      const s = u == null ? '' : String(u);
      if (!s) return false;
      return !window.dispatchEvent(new CustomEvent('scamshield:open', { detail: s, cancelable: true }));
    } catch (_) { return false; }
  }
  const noActivation = () => {
    try { return !!navigator.userActivation && navigator.userActivation.isActive === false; } catch (_) { return false; }
  };

  try {
    const nativeOpen = window.open;
    if (typeof nativeOpen === 'function') {
      window.open = function (url) {
        try {
          if (vetoed(url)) { noteBlocked('blocked-open'); return null; }
          if (warned() && noActivation()) { noteBlocked('popunder'); return null; }
        } catch (_) { /* fall through to native */ }
        return nativeOpen.apply(this, arguments);
      };
    }
  } catch (_) { /* ignore */ }

  // Location.assign/replace are [LegacyUnforgeable] in some engines (own properties of the location object), in
  // which case this assignment is a harmless no-op; it only helps where the prototype carries them.
  try {
    for (const m of ['assign', 'replace']) {
      const native = Location.prototype[m];
      if (typeof native !== 'function') continue;
      try {
        Location.prototype[m] = function (url) {
          try { if (vetoed(url)) { noteBlocked('blocked-open'); return undefined; } } catch (_) { /* native */ }
          return native.apply(this, arguments);
        };
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }

  // A script-clicked <a target=_blank href=blocked> is the old popup trick. Only a new-tab anchor is judged.
  try {
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      try {
        if (/^_blank$/i.test(this.target || '') && vetoed(this.href)) { noteBlocked('blocked-open'); return undefined; }
      } catch (_) { /* native */ }
      return nativeClick.apply(this, arguments);
    };
  } catch (_) { /* ignore */ }

  // (D) Credential exfil to a Telegram bot / Discord webhook (0.15.0). Phishing kits POST the typed login straight to
  // https://api.telegram.org/bot<id>:<token>/sendMessage (fetch, jQuery $.ajax = XHR, or sendBeacon). fetch, XHR
  // open/send and sendBeacon are wrapped; when the destination is one of those two endpoints, a cancelable
  // 'scamshield:exfil' event carries a JSON STRING {service, url, body} (body capped at 8 KB) to the isolated world,
  // which cancels it only if a typed secret is in the request. Never cancelled otherwise: a contact form that
  // messages a bot keeps working. Everything is try/catch and falls back to the native call.
  // exfilServiceOf is a copy of engine/exfil_rules.js (engine files are not loaded in the MAIN world);
  // tests/unit/exfil_rules.test.js runs both against one table.
  try {
    const TG_PATH = /^\/bot\d{5,}:[A-Za-z0-9_-]{30,}\/[A-Za-z]+$/;
    const DC_PATH = /^\/api\/webhooks\/\d{5,}\/[A-Za-z0-9_-]{20,}(?:\/.*)?$/;
    const exfilServiceOf = (url) => {
      try {
        const u = new URL(String(url));
        if (u.protocol !== 'https:' || u.username || u.password) return null;
        const h = u.hostname.toLowerCase();
        if (h === 'api.telegram.org') return TG_PATH.test(u.pathname) ? 'telegram' : null;
        if (h === 'discord.com' || h === 'discordapp.com') return DC_PATH.test(u.pathname) ? 'discord' : null;
      } catch (_) { /* not a URL */ }
      return null;
    };
    const bodyText = (b) => {
      try {
        if (typeof b === 'string') return b.slice(0, 8192);
        if (typeof URLSearchParams === 'function' && b instanceof URLSearchParams) return b.toString().slice(0, 8192);
        if (typeof FormData === 'function' && b instanceof FormData) {
          let out = '';
          for (const [k, v] of b.entries()) { out += k + '=' + (typeof v === 'string' ? v : '') + '&'; if (out.length >= 8192) break; }
          return out.slice(0, 8192);
        }
      } catch (_) { /* '' */ }
      return '';
    };
    // true = the isolated world cancelled the event (a typed secret is in the request): block it.
    const exfilVetoed = (url, body) => {
      try {
        const service = exfilServiceOf(url);
        if (!service) return false;
        const detail = JSON.stringify({ service, url: String(url).slice(0, 2048), body: bodyText(body) });
        return !window.dispatchEvent(new CustomEvent('scamshield:exfil', { detail, cancelable: true }));
      } catch (_) { return false; }
    };

    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
      window.fetch = function (input, init) {
        try {
          const url = typeof Request === 'function' && input instanceof Request ? input.url : String(input);
          if (exfilVetoed(url, init && init.body)) return Promise.reject(new TypeError('Failed to fetch'));
        } catch (_) { /* native */ }
        return nativeFetch.apply(this, arguments);
      };
    }

    const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (XHR && typeof XHR.open === 'function' && typeof XHR.send === 'function') {
      const nativeXhrOpen = XHR.open, nativeXhrSend = XHR.send;
      const urls = new WeakMap();
      XHR.open = function (method, url) {
        try { urls.set(this, url); } catch (_) { /* ignore */ }
        return nativeXhrOpen.apply(this, arguments);
      };
      XHR.send = function (body) {
        try {
          if (urls.has(this) && exfilVetoed(new URL(String(urls.get(this)), document.baseURI).href, body)) {
            const xhr = this;
            try { Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true }); Object.defineProperty(xhr, 'status', { value: 0, configurable: true }); } catch (_) { /* ignore */ }
            setTimeout(() => {
              for (const type of ['readystatechange', 'error', 'loadend']) { try { xhr.dispatchEvent(new Event(type)); } catch (_) { /* ignore */ } }
            }, 0);
            return undefined;
          }
        } catch (_) { /* native */ }
        return nativeXhrSend.apply(this, arguments);
      };
    }

    if (navigator && typeof navigator.sendBeacon === 'function') {
      const nativeBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function (url, data) {
        try { if (exfilVetoed(new URL(String(url), document.baseURI).href, data)) return false; } catch (_) { /* native */ }
        return nativeBeacon.apply(this, arguments);
      };
    }
  } catch (_) { /* ignore */ }

  // On a warned page: no forced fullscreen, and a notification prompt resolves 'default' without asking.
  try {
    for (const name of ['requestFullscreen', 'webkitRequestFullscreen']) {
      const nativeFs = Element.prototype[name];
      if (typeof nativeFs !== 'function') continue;
      Element.prototype[name] = function () {
        try { if (warned()) { noteBlocked('fullscreen'); return Promise.resolve(); } } catch (_) { /* native */ }
        return nativeFs.apply(this, arguments);
      };
    }
  } catch (_) { /* ignore */ }
  try {
    if (typeof Notification === 'function' && typeof Notification.requestPermission === 'function') {
      const nativeReq = Notification.requestPermission;
      Notification.requestPermission = function (cb) {
        try {
          if (warned()) {
            noteBlocked('notification');
            if (typeof cb === 'function') { try { cb('default'); } catch (_) { /* page callback */ } }
            return Promise.resolve('default');
          }
        } catch (_) { /* native */ }
        return nativeReq.apply(this, arguments);
      };
    }
  } catch (_) { /* ignore */ }
})();
