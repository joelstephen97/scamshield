// MAIN world. Defangs dialog floods and notes scare-page behaviors, emitting
// counts the isolated world combines with page text.
(function () {
  'use strict';
  if (window.__scamshieldTechHook) return;
  window.__scamshieldTechHook = true;

  let dialogFloodCount = 0;
  let fullscreenOnLoad = false;
  let beforeUnloadCount = 0;

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('scamshield:techscam-signal', {
        detail: { dialogFloodCount, fullscreenOnLoad, beforeUnloadCount }
      }));
    } catch (_) {}
  }

  // Throttle alert/confirm/prompt: allow the first 2, then suppress (returning
  // benign values) so the page can't trap the tab. Each call bumps the count.
  for (const name of ['alert', 'confirm', 'prompt']) {
    const orig = window[name] ? window[name].bind(window) : null;
    if (!orig) continue;
    window[name] = function () {
      dialogFloodCount++;
      emit();
      if (dialogFloodCount <= 2) { try { return orig.apply(null, arguments); } catch (_) {} }
      return name === 'confirm' ? false : (name === 'prompt' ? null : undefined);
    };
  }

  // Note fullscreen forced shortly after load.
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) { fullscreenOnLoad = true; emit(); }
  }, true);

  // Count beforeunload handlers being added (back-button / leave traps).
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type) {
    if (type === 'beforeunload') { beforeUnloadCount++; }
    return origAdd.apply(this, arguments);
  };

  // Expose an escape hook the isolated world can call (exit fullscreen).
  window.addEventListener('scamshield:techscam-escape', () => {
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (_) {}
  });

  if (document.readyState !== 'loading') emit();
  else document.addEventListener('DOMContentLoaded', emit);
})();
