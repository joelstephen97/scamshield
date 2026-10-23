// ui/onboarding.js — the three-step welcome (0.15.0, Task 19): See it work -> why the permission -> pin it.
// One step is visible at a time; onboarding.html#2 opens on a given step (demo.html returns to #2). Without
// this script every step stays visible in order, so the page degrades to a plain read-through.
'use strict';
(function () {
  const i18n = globalThis.SSi18n;
  const $ = (id) => document.getElementById(id);
  const TOTAL = 3;
  let cur = 1;
  const T = (key, subs, fallback) => { try { const v = i18n && i18n.t ? i18n.t(key, subs) : ''; return v || fallback; } catch (_) { return fallback; } };

  function renderCount() {
    $('count').textContent = T('obStepCount', [String(cur), String(TOTAL)], 'Step ' + cur + ' of ' + TOTAL);
    document.querySelectorAll('.prog li').forEach((li, i) => li.classList.toggle('on', i < cur));
  }
  function show(n, moveFocus) {
    cur = Math.min(TOTAL, Math.max(1, n | 0 || 1));
    document.querySelectorAll('section.step').forEach((s) => { s.hidden = Number(s.dataset.step) !== cur; });
    renderCount();
    try { history.replaceState(null, '', cur === 1 ? location.pathname : '#' + cur); } catch (_) {}
    // Keyboard and screen-reader users follow the step change: focus lands on the new step's heading.
    if (moveFocus) { try { $('s' + cur + 'h').focus(); } catch (_) {} }
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.go), true)));
  show(parseInt(String(location.hash).slice(1), 10) || 1, false);
  // The language override (Options) lands asynchronously: re-word the count when it does.
  if (i18n && i18n.ready) i18n.ready.then(renderCount).catch(() => {});
})();
