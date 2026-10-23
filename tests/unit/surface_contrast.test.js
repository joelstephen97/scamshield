// tests/unit/surface_contrast.test.js — WCAG contrast of the surface palette (0.15.0, Task 12).
// The Task 11 review found dark-theme white-on-#3FB489 primary buttons at ~2.6:1 and the dark danger
// banner (white on #F87171) is just as weak, so every text/background pair the banner and toasts use
// is computed here from the real tokens in content/surfaces/styles.js.
const test = require('node:test');
const assert = require('node:assert');
require('../../content/surfaces/styles.js');
const CSS = globalThis.ScamShield.surfaceCss;

function tokens(block) { const o = {}; for (const m of block.matchAll(/--(ss-[a-z-]+):\s*(#[0-9a-fA-F]{3,6})/g)) o[m[1]] = m[2].length === 4 ? '#' + [...m[2].slice(1)].map((c) => c + c).join('') : m[2]; return o; }
const light = tokens(CSS.base.match(/:host\{([^}]*)\}/)[1]);
const dark = tokens(CSS.base.match(/:host\(\[data-theme=dark\]\)\{([^}]*)\}/)[1]);
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const [name, T0] of [['light', light], ['dark', dark]]) {
  // dark overrides only some tokens; the rest inherit from light in the cascade
  const T = Object.assign({}, light, T0);
  const pairs = [
    ['primary button: on-accent on accent', T['ss-on-accent'], T['ss-accent']],
    ['danger banner: white on danger-solid', '#FFFFFF', T['ss-danger-solid']],
    ['danger banner primary: danger-solid on white', T['ss-danger-solid'], '#FFFFFF'],
    ['body text on surface', T['ss-text'], T['ss-surface']],
    ['muted text on surface', T['ss-muted'], T['ss-surface']],
    ['accent text on surface', T['ss-accent'], T['ss-surface']],
    ['accent text on accent-soft (menu hover)', T['ss-accent'], T['ss-accent-soft']],
    ['warn text on warn-bg (suspicious banner)', T['ss-warn'], T['ss-warn-bg']],
    ['body text on warn-bg', T['ss-text'], T['ss-warn-bg']],
    ['danger text on danger-bg', T['ss-danger'], T['ss-danger-bg']],
    // Interstitial + dialogs (0.15.0, Task 13): the stop page paints text straight on --ss-ground; chips and ghosts sit on the card
    ['dialog: body text on ground (interstitial)', T['ss-text'], T['ss-ground']],
    ['dialog: muted text on ground (interstitial)', T['ss-muted'], T['ss-ground']],
    ['dialog: accent link on ground (interstitial)', T['ss-accent'], T['ss-ground']],
    ['dialog: danger ghost button on surface', T['ss-danger'], T['ss-surface']],
    ['dialog: danger text on ground', T['ss-danger'], T['ss-ground']],
    ['dialog: chip, muted on unknown-bg', T['ss-muted'], T['ss-unknown-bg']],
    ['dialog: Report a mistake (accent) on surface', T['ss-accent'], T['ss-surface']],
    ['dialog: warn tile, warn on warn-bg', T['ss-warn'], T['ss-warn-bg']]
  ];
  for (const [label, fg, bg] of pairs) {
    test(`contrast ${name}: ${label} >= 4.5`, () => {
      assert.ok(fg && bg, 'token missing: ' + label);
      const r = ratio(fg, bg);
      assert.ok(r >= 4.5, `${label} is ${r.toFixed(2)}:1 (${fg} on ${bg})`);
    });
  }
}

test('banner css: bottom sheet under 600px, floating card capped at 880px, no nowrap/ellipsis on text', () => {
  assert.match(CSS.banner, /min\(880px/);
  assert.match(CSS.banner, /@media \(max-width:\s*599px\)/);
  assert.match(CSS.banner, /safe-area-inset-bottom/);
  assert.doesNotMatch(CSS.banner, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(CSS.banner, /(^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/);
  assert.doesNotMatch(CSS.banner, /text-align:\s*(left|right)/);
});

test('toast css: RTL progress and safe-area variants match the root element itself', () => {
  assert.doesNotMatch(CSS.toast, /\[dir=rtl\]\s+\.scamshield-toast/);
  assert.match(CSS.toast, /\.scamshield-toast\[dir=rtl\]\s+\.ss-prog i/);
  assert.match(CSS.toast, /\[dir=rtl\][^{]*\{[^}]*safe-area-inset-left/);
});

test('dialog css: native modal frame, centred scrolling card, clamp() type, phone stack >= 44px, logical properties, on-accent primary', () => {
  const D = CSS.dialog;
  assert.ok(D.length > 500, 'dialog slot is filled');
  assert.match(D, /inline-size:min\(560px,100vw - 32px\)/);
  assert.match(D, /max-block-size:calc\(100dvh - 24px\)/);
  assert.match(D, /overflow:auto/);
  assert.match(D, /align-items:center/);
  assert.match(D, /clamp\(/);
  assert.match(D, /@media \(max-width:599px\)/);
  assert.match(D, /flex-direction:column/);
  assert.match(D, /min-block-size:44px/);
  assert.match(D, /::backdrop/);
  assert.match(D, /\.ss-primary\{[^}]*color:var\(--ss-on-accent\)/);
  assert.doesNotMatch(D, /\.ss-primary\{[^}]*color:#fff/);
  assert.doesNotMatch(D, /(^|[;{\s])(left|right|top|bottom|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/);
  assert.doesNotMatch(D, /text-align:\s*(left|right)/);
});

test('banner css (Task 12 review): RTL swaps the phone safe-area insets; the sheet scrolls instead of overflowing', () => {
  assert.match(CSS.banner, /\.scamshield-banner\[dir=rtl\]\{padding-inline:max\(14px,env\(safe-area-inset-right[^}]*env\(safe-area-inset-left/);
  assert.match(CSS.banner, /max-block-size:calc\(100dvh - 24px\);overflow:auto/);
});

test('content.css keeps only light-DOM page classes (no surface rules left behind)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const css = fs.readFileSync(path.join(__dirname, '../../content/content.css'), 'utf8');
  assert.doesNotMatch(css, /\.scamshield-(overlay|interstitial|banner|toast|ack)\b|\.ss-/);
  assert.match(css, /\.scamshield-hidden-block/);
  assert.match(css, /\.scamshield-serp/);
});
