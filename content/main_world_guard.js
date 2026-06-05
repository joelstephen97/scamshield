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
})();
