// tests/unit/qr.test.js — QR decode-orchestration helpers (Task P4).
// engine/qr.js vendors jsQR (Apache-2.0, see /NOTICE) for the actual pixel
// decode, which needs a real canvas/getImageData and so has no Node
// coverage here. What IS pure and DOM-free — and what this file covers — is
// every decision content/content_script.js makes AROUND that decode: which
// payloads are worth scoring, which images are worth even trying, how many
// images one pass may spend time on, and how to recognise the expected
// cross-origin-canvas failure so it can be skipped silently.
const test = require('node:test');
const assert = require('node:assert');
const QR = require('../../engine/qr.js');

test('engine/qr.js exposes the vendored jsQR decoder as a callable, plus the helpers', () => {
  assert.equal(typeof QR, 'function', 'require(engine/qr.js) should still be the jsQR decode function');
  assert.equal(typeof QR.extractQrUrl, 'function');
  assert.equal(typeof QR.shouldScanImage, 'function');
  assert.equal(typeof QR.withinScanBudget, 'function');
  assert.equal(typeof QR.isTaintedCanvasError, 'function');
});

test('extractQrUrl accepts only http(s) payloads, trimmed', () => {
  assert.equal(QR.extractQrUrl('https://evil.example/pay'), 'https://evil.example/pay');
  assert.equal(QR.extractQrUrl('  http://example.com  '), 'http://example.com');
  assert.equal(QR.extractQrUrl('HTTPS://Example.com'), 'HTTPS://Example.com');
});

test('extractQrUrl rejects non-URL and non-http(s) QR payloads', () => {
  assert.equal(QR.extractQrUrl('BEGIN:VCARD\nFN:Jane Doe\nEND:VCARD'), null);
  assert.equal(QR.extractQrUrl('WIFI:T:WPA;S:home;P:secret;;'), null);
  assert.equal(QR.extractQrUrl('mailto:someone@example.com'), null);
  assert.equal(QR.extractQrUrl('ftp://files.example.com/x'), null);
  assert.equal(QR.extractQrUrl(''), null);
  assert.equal(QR.extractQrUrl('   '), null);
  assert.equal(QR.extractQrUrl(null), null);
  assert.equal(QR.extractQrUrl(undefined), null);
});

test('shouldScanImage gates on both dimensions clearing the minimum', () => {
  assert.equal(QR.shouldScanImage(48, 48, 48), true);
  assert.equal(QR.shouldScanImage(47, 48, 48), false);
  assert.equal(QR.shouldScanImage(48, 47, 48), false);
  assert.equal(QR.shouldScanImage(120, 120, 120), true);
  assert.equal(QR.shouldScanImage(119, 200, 120), false);
  // Missing/garbage dimensions never scan.
  assert.equal(QR.shouldScanImage(undefined, undefined, 48), false);
  assert.equal(QR.shouldScanImage(0, 0, 48), false);
});

test('withinScanBudget stops exactly at the cap, never over it', () => {
  assert.equal(QR.withinScanBudget(0, 30), true);
  assert.equal(QR.withinScanBudget(29, 30), true);
  assert.equal(QR.withinScanBudget(30, 30), false);
  assert.equal(QR.withinScanBudget(31, 30), false);
});

test('isTaintedCanvasError recognises the cross-origin SecurityError and skips gracefully', () => {
  // Both Chrome and Firefox set DOMException.name to 'SecurityError' for a
  // tainted-canvas getImageData() failure — the name check alone covers real
  // browsers.
  assert.equal(QR.isTaintedCanvasError({ name: 'SecurityError', message: "Failed to execute 'getImageData'" }), true);
  assert.equal(QR.isTaintedCanvasError(new DOMExceptionLike('SecurityError', 'tainted canvases may not be exported')), true);
  // Message-based fallback for a runtime that reports the same failure under
  // a different error name.
  assert.equal(QR.isTaintedCanvasError({ name: 'Error', message: 'the canvas has been tainted by cross-origin data' }), true);
});

test('isTaintedCanvasError does not misclassify unrelated errors, and never throws on nullish input', () => {
  assert.equal(QR.isTaintedCanvasError({ name: 'TypeError', message: 'x is not a function' }), false);
  assert.equal(QR.isTaintedCanvasError(new Error('decode failed')), false);
  assert.equal(QR.isTaintedCanvasError(null), false);
  assert.equal(QR.isTaintedCanvasError(undefined), false);
});

function DOMExceptionLike(name, message) { this.name = name; this.message = message; }
