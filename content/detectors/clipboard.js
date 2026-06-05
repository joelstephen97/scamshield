// MAIN world. Watches clipboard writes for dangerous payloads and emits an alert
// the isolated world renders. Never blocks the copy (would break legit buttons).
(function () {
  'use strict';
  if (window.__scamshieldClipboardHook) return;
  window.__scamshieldClipboardHook = true;

  const analyze = (t) => {
    try {
      return (window.ScamShield && window.ScamShield.analyzeClipboardWrite)
        ? window.ScamShield.analyzeClipboardWrite(t) : { level: 'safe', reasons: [] };
    } catch (_) { return { level: 'safe', reasons: [] }; }
  };
  function emit(verdict, sample) {
    if (verdict.level === 'safe') return;
    try {
      window.dispatchEvent(new CustomEvent('scamshield:clipboard-alert', {
        detail: { level: verdict.level, reasons: verdict.reasons, sample: String(sample || '').slice(0, 120) }
      }));
    } catch (_) {}
  }

  // (A) navigator.clipboard.writeText
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function (text) { emit(analyze(text), text); return orig(text); };
    }
  } catch (_) {}

  // (B) copy-event setData hijack
  document.addEventListener('copy', (ev) => {
    try {
      const cd = ev.clipboardData;
      if (!cd) return;
      const setData = cd.setData.bind(cd);
      cd.setData = function (type, data) { if (/text/.test(type)) emit(analyze(data), data); return setData(type, data); };
    } catch (_) {}
  }, true);
})();
