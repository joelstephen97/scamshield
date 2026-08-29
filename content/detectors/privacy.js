// MAIN world. Privacy detectors (0.6.0), all detection-only, all fail-open.
//  - Leaky forms: after you type into an email/phone field, watch outbound
//    fetch/XHR/sendBeacon/Image.src for your value (plain or hashed) going to
//    a third-party origin — BEFORE you press submit.
//  - Fingerprinting: instrument canvas/WebGL/audio/font/navigator surfaces and
//    attribute a fingerprinting burst to the script origin that caused it.
//  - Notification lure: annotate Notification.requestPermission so a
//    "click Allow to prove you're human" trick can't fire silently.
// Nothing here blocks page behaviour by default; it emits events the isolated
// world turns into warnings, gated by settings there.
(function () {
  'use strict';
  if (window.__scamshieldPrivacyHook) return;
  window.__scamshieldPrivacyHook = true;

  const P = (window.Parry && window.Parry.privacy) || null;
  if (!P) return; // engine not present in MAIN world — nothing to do

  // ---------- shared: attribute the currently-running script origin ----------
  function callerOrigin() {
    try {
      const stack = (new Error()).stack || '';
      const lines = stack.split('\n');
      for (const ln of lines) {
        const m = ln.match(/https?:\/\/[^\s):]+/);
        if (m) {
          const u = new URL(m[0]);
          if (u.origin !== location.origin) return u.origin; // first third-party frame
          if (!callerOrigin._self) callerOrigin._self = u.origin;
        }
      }
    } catch (_) {}
    return callerOrigin._self || location.origin;
  }

  function emit(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {} }

  // ---------- (1) leaky forms ----------
  let armed = false;                 // only after the user types PII
  const needles = { plain: [], md5: [], sha1: [], sha256: [] };
  const leaked = new Set();          // origin|kind already reported

  function armFrom(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v.length < 6 || needles.plain.indexOf(v) !== -1) return;
    // Arm plaintext + md5 synchronously so a beacon fired in the SAME input
    // event (before async hashing resolves) is still inspected.
    needles.plain.push(v);
    armed = true;
    try { needles.md5.push(P.md5(v)); } catch (_) {}
    addHashes(v);
  }
  async function addHashes(v) {
    try {
      const enc = new TextEncoder().encode(v);
      if (window.crypto && crypto.subtle) {
        const [s1, s256] = await Promise.all([
          crypto.subtle.digest('SHA-1', enc).catch(() => null),
          crypto.subtle.digest('SHA-256', enc).catch(() => null)
        ]);
        const hex = (buf) => buf ? Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('') : null;
        const h1 = hex(s1), h256 = hex(s256);
        if (h1) needles.sha1.push(h1);
        if (h256) needles.sha256.push(h256);
      }
    } catch (_) {}
  }

  document.addEventListener('input', (e) => {
    const t = e && e.target;
    if (!t || !t.tagName) return;
    const type = (t.getAttribute && (t.getAttribute('type') || '')).toLowerCase();
    const name = ((t.getAttribute && (t.getAttribute('name') || t.getAttribute('autocomplete') || t.id)) || '').toLowerCase();
    if (type === 'email' || type === 'tel' || /email|e-mail|phone|mobile|tel/.test(name)) {
      if (typeof t.value === 'string' && t.value.indexOf('@') !== -1 || type === 'tel' || /phone|mobile|tel/.test(name)) armFrom(t.value);
    }
  }, true);

  function inspectOutbound(where, dest, payloads) {
    if (!armed) return;
    let destOrigin = location.origin;
    try { destOrigin = new URL(dest, location.href).origin; } catch (_) {}
    if (destOrigin === location.origin) return; // first-party echo isn't a leak we warn on
    for (const p of payloads) {
      let dec = p;
      try { dec = decodeURIComponent(String(p).replace(/\+/g, ' ')); } catch (_) { dec = p; }
      const kind = P.findLeak(p, needles) || P.findLeak(dec, needles);
      if (kind) {
        const key = destOrigin + '|' + kind;
        if (leaked.has(key)) return;
        leaked.add(key);
        let destHost = destOrigin; try { destHost = new URL(dest, location.href).hostname; } catch (_) {}
        emit('scamshield:leaky-form', { destHost, destOrigin, kind, where });
        return;
      }
    }
  }

  // fetch
  try {
    const of = window.fetch;
    if (of) window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const body = (init && typeof init.body === 'string') ? init.body : '';
        inspectOutbound('fetch', url, [url, body]);
      } catch (_) {}
      return of.apply(this, arguments);
    };
  } catch (_) {}
  // XHR
  try {
    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__ssURL = u; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) { try { inspectOutbound('xhr', this.__ssURL || '', [this.__ssURL || '', typeof b === 'string' ? b : '']); } catch (_) {} return os.apply(this, arguments); };
  } catch (_) {}
  // sendBeacon
  try {
    if (navigator.sendBeacon) {
      const ob = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) { try { inspectOutbound('beacon', url, [url, typeof data === 'string' ? data : '']); } catch (_) {} return ob(url, data); };
    }
  } catch (_) {}
  // Image.src (pixel exfil)
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true, enumerable: desc.enumerable,
        get: desc.get,
        set: function (v) { try { inspectOutbound('img', v, [String(v)]); } catch (_) {} return desc.set.call(this, v); }
      });
    }
  } catch (_) {}

  // ---------- (2) fingerprinting ----------
  const fpCounts = {};               // per origin → surface counts
  let fpReported = false;
  let fpBudget = 400;                // stop attributing after this many probes
  function bump(surface) {
    if (fpReported || fpBudget <= 0) return;
    fpBudget--;
    const o = callerOrigin();
    const c = fpCounts[o] || (fpCounts[o] = {});
    c[surface] = (c[surface] || 0) + 1;
    scheduleFpCheck();
  }
  let fpTimer = null;
  function scheduleFpCheck() {
    if (fpReported || fpTimer) return;
    fpTimer = setTimeout(() => {
      fpTimer = null;
      for (const origin of Object.keys(fpCounts)) {
        const r = P.scoreFingerprint(fpCounts[origin]);
        if (r.isFp) { fpReported = true; emit('scamshield:fingerprint', { origin, surfaces: r.surfaces }); return; }
      }
    }, 800);
  }
  function wrap(obj, name, surface, guard) {
    try {
      const orig = obj[name];
      if (typeof orig !== 'function') return;
      obj[name] = function () { try { if (!guard || guard.apply(this, arguments)) bump(surface); } catch (_) {} return orig.apply(this, arguments); };
    } catch (_) {}
  }
  try { wrap(HTMLCanvasElement.prototype, 'toDataURL', 'canvasReadback'); } catch (_) {}
  try { wrap(HTMLCanvasElement.prototype, 'toBlob', 'canvasReadback'); } catch (_) {}
  try { wrap(CanvasRenderingContext2D.prototype, 'getImageData', 'canvasReadback'); } catch (_) {}
  try { wrap(CanvasRenderingContext2D.prototype, 'measureText', 'fontProbe'); } catch (_) {}
  try { if (window.WebGLRenderingContext) wrap(WebGLRenderingContext.prototype, 'getParameter', 'webglParams'); } catch (_) {}
  try { if (window.OfflineAudioContext) wrap(OfflineAudioContext.prototype, 'startRendering', 'audioFingerprint'); } catch (_) {}
  try { wrap(Element.prototype, 'getBoundingClientRect', 'rectMeasure', function () { return false; }); } catch (_) {} // measured but not counted (too common); kept for parity

  // ---------- (3) notification lure ----------
  try {
    if (window.Notification && Notification.requestPermission) {
      const orig = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = function () {
        try { emit('scamshield:notify-request', { origin: location.origin }); } catch (_) {}
        return orig.apply(this, arguments);
      };
    }
  } catch (_) {}
})();
