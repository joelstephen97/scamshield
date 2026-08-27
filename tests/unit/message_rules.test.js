// tests/unit/message_rules.test.js
const test = require('node:test');
const assert = require('node:assert');
const { scoreMessage } = require('../../engine/message_rules');

// --- scam samples ---

test('OTP-sharing request is dangerous', () => {
  const r = scoreMessage('Dear customer, your bank account will be blocked today. Share your OTP to verify your identity.');
  assert.equal(r.level, 'dangerous', JSON.stringify(r));
  assert.ok(r.reasons.some((x) => x.code === 'msgOtpAsk' && x.kind === 'message'));
});

test('customs-fee parcel scam with bad link is flagged', () => {
  const r = scoreMessage('Your parcel is held at customs. Pay the delivery fee within 24 hours: http://track-parcel-secure.tk/pay');
  assert.notEqual(r.level, 'safe', JSON.stringify(r));
  const wording = r.reasons.find((x) => x.code === 'msgScamWording');
  assert.ok(wording); assert.equal(wording.params[0], 'held at customs');
  assert.equal(r.links.length, 1);
  assert.ok(r.links[0].score >= 0.2);
});

test('prize/lucky-draw message is flagged', () => {
  const r = scoreMessage('Congratulations you have been selected for our lucky draw! Claim your prize now, offer expires today.');
  assert.notEqual(r.level, 'safe', JSON.stringify(r));
});

test('too-good job offer is flagged', () => {
  const r = scoreMessage('Earn AED 500 per day working from home, no experience needed! Limited slots, reply YES now.');
  assert.notEqual(r.level, 'safe', JSON.stringify(r));
});

test('crypto doubling pitch is flagged', () => {
  const r = scoreMessage('Guaranteed returns! We double your investment in 7 days. Risk-free investment, join today.');
  assert.notEqual(r.level, 'safe', JSON.stringify(r));
});

test('dangerous link alone makes the message dangerous', () => {
  const r = scoreMessage('hello please check http://amaz0n-verify-login.tk/account');
  assert.equal(r.level, 'dangerous', JSON.stringify(r));
});

// --- benign samples: must stay safe ---

test('legit OTP message with do-not-share warning is safe', () => {
  const r = scoreMessage('482913 is your OTP for logging in. Do not share it with anyone. It expires in 10 minutes.');
  assert.equal(r.level, 'safe', JSON.stringify(r));
});

test('genuine delivery notification is safe', () => {
  const r = scoreMessage('Your DHL parcel 1234567890 was delivered today at 14:32. Thank you for shopping with us.');
  assert.equal(r.level, 'safe', JSON.stringify(r));
});

test('ordinary chat message is safe', () => {
  const r = scoreMessage("Team lunch tomorrow at 1pm, don't be late! Bring the slides please.");
  assert.equal(r.level, 'safe', JSON.stringify(r));
});

test('order confirmation with legit regional link is safe', () => {
  const r = scoreMessage('Your Amazon order #403-555 has shipped. Track it here: https://www.amazon.ae/orders');
  assert.equal(r.level, 'safe', JSON.stringify(r));
});

test('empty and malformed input do not throw', () => {
  assert.doesNotThrow(() => scoreMessage(''));
  assert.doesNotThrow(() => scoreMessage(null));
  assert.equal(scoreMessage('').level, 'safe');
});
