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
  // The tier (section C below) is reset here and ONLY here: a navigation this guard itself observed (its own
  // pushState/replaceState hooks and popstate) and that changed the URL. A new route starts quiet; if the new
  // page is still dangerous the isolated world re-sends its tier after its re-scan (~0.4 s). Trust/pause
  // changed mid-document take effect after the next navigation or reload (documented limit).
  let tier = ''; // 'warn' | 'stop' | '' - set by the isolated world; a closure variable, never on window
  let navHref = '';
  try { navHref = location.href; } catch (_) { /* ignore */ }
  function emitNav() {
    try { const h = location.href; if (h !== navHref) { navHref = h; tier = ''; } } catch (_) { /* keep */ }
    try { window.dispatchEvent(new CustomEvent('scamshield:navigate')); } catch (e) {}
  }
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
  try {
    window.addEventListener('scamshield:tier', (e) => {
      // Once warn/stop is accepted a later lower tier event (a page forging '') is ignored; only an observed navigation resets it.
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
