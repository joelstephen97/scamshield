// MAIN world. Defangs dialog floods and notes scare-page behaviors, emitting
// counts the isolated world combines with page text.
(function () {
  'use strict';
  if (window.__scamshieldTechHook) return;
  window.__scamshieldTechHook = true;

  let dialogFloodCount = 0;
  let fullscreenOnLoad = false;
  let beforeUnloadCount = 0;
  let alarmAudio = false;
  let escaped = false; // once the user hits "Get me out", stop new traps

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('scamshield:techscam-signal', {
        detail: { dialogFloodCount, fullscreenOnLoad, beforeUnloadCount, alarmAudio }
      }));
    } catch (_) {}
  }

  // Alarm audio: scare pages loop a siren/voice clip. Check for playing,
  // looping/autoplaying media and speech synthesis shortly after load.
  function checkAlarmAudio() {
    try {
      if (alarmAudio) return;
      const media = document.querySelectorAll('audio, video');
      for (const m of media) {
        if ((!m.paused || m.autoplay) && (m.loop || !m.hasAttribute('controls'))) { alarmAudio = true; break; }
      }
      if (!alarmAudio && window.speechSynthesis && window.speechSynthesis.speaking) alarmAudio = true;
      if (alarmAudio) emit();
    } catch (_) {}
  }
  setTimeout(checkAlarmAudio, 1500);
  setTimeout(checkAlarmAudio, 4000);

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

  // Count beforeunload handlers being added (back-button / leave traps); after
  // an escape, refuse to register new ones so the page can't re-trap the tab.
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type) {
    if (type === 'beforeunload') {
      beforeUnloadCount++;
      if (escaped) return undefined; // trap neutralised
    }
    return origAdd.apply(this, arguments);
  };

  // Escape hook (0.6.0: hardened): exit fullscreen AND dismantle the leave
  // traps — clear onbeforeunload, block future registrations, stop alarm media.
  window.addEventListener('scamshield:techscam-escape', () => {
    escaped = true;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (_) {}
    try { window.onbeforeunload = null; document.body && (document.body.onbeforeunload = null); } catch (_) {}
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {}
    try { document.querySelectorAll('audio, video').forEach((m) => { m.pause(); m.loop = false; }); } catch (_) {}
  });

  if (document.readyState !== 'loading') emit();
  else document.addEventListener('DOMContentLoaded', emit);
})();
