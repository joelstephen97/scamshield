'use strict';
// engine/challenge.js — bot-challenge page recogniser (0.15.0).
const test = require('node:test');
const assert = require('node:assert');
const { isChallengePage } = require('../../engine/challenge');

const long = 'lorem ipsum '.repeat(120);

test('DataDome-style wording + captcha-delivery iframe is a challenge', () => {
  assert.strictEqual(isChallengePage({ title: 'example.com', textSample: 'We detected unusual activity from your device', bodyTextLength: 4000,
    frameHosts: ['geo.captcha-delivery.com'] }), true);
});
test('wording + short body (no vendor frame) is a challenge', () => {
  assert.strictEqual(isChallengePage({ title: 'Just a moment...', textSample: 'Checking your browser before accessing', bodyTextLength: 120, frameHosts: [] }), true);
  assert.strictEqual(isChallengePage({ title: '', textSample: 'Press & Hold to confirm you are human', bodyTextLength: 80 }), true);
});
test('each vendor host counts', () => {
  for (const h of ['captcha-delivery.com', 'geo.captcha-delivery.com', 'client.px-cdn.net', 'captcha.perimeterx.net', 'challenges.cloudflare.com', 'newassets.hcaptcha.com', 'www.google.com/recaptcha/api2/anchor']) {
    assert.strictEqual(isChallengePage({ title: 'Access to this page has been denied', textSample: '', bodyTextLength: 3000, frameHosts: [h] }), true, h);
  }
});
test('wording alone on a long page is NOT a challenge (a phish can quote it)', () => {
  assert.strictEqual(isChallengePage({ title: 'Verify you are human', textSample: 'please verify you are a human', bodyTextLength: 5000, frameHosts: ['ads.example.net'] }), false);
});
test('challenge frame without wording is NOT a challenge (any login page embeds recaptcha)', () => {
  assert.strictEqual(isChallengePage({ title: 'Sign in', textSample: 'Enter your password', bodyTextLength: 200, frameHosts: ['hcaptcha.com'] }), false);
});
test('handles missing input', () => {
  assert.strictEqual(isChallengePage(), false);
  assert.strictEqual(isChallengePage({}), false);
});
test('long body is never short-circuited by an unrelated short sample', () => {
  assert.strictEqual(isChallengePage({ title: 'Blog', textSample: long.slice(0, 200), bodyTextLength: long.length, frameHosts: [] }), false);
});

test('a visible credential field disables the challenge override (lookalike phish quoting the wording)', () => {
  assert.strictEqual(isChallengePage({ title: 'Verify you are human', textSample: 'verify you are human', bodyTextLength: 100, frameHosts: ['hcaptcha.com'], hasCredentialField: true }), false);
});
