#!/usr/bin/env node
/**
 * One-time helper: obtain the Chrome Web Store API refresh token for
 * chrome-webstore-upload. Run with the OAuth "Desktop app" client:
 *
 *   node tools/cws-token.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * It starts a loopback listener, prints a Google consent URL to open in your
 * normal (signed-in) browser, receives the auth code on the loopback port,
 * exchanges it, and prints the refresh token. Nothing is stored by this
 * script — put the token in docs/store-secrets.local.txt (git-ignored).
 */
'use strict';
const http = require('http');
const { URL } = require('url');

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) { console.error('usage: node tools/cws-token.js <CLIENT_ID> <CLIENT_SECRET>'); process.exit(2); }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const code = u.searchParams.get('code');
  if (!code) { res.writeHead(400); res.end('no code'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<h2>ScamShield: token received. You can close this tab.</h2>');
  try {
    const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json();
    if (!j.refresh_token) { console.error('Token exchange failed:', JSON.stringify(j)); process.exit(1); }
    console.log('\nREFRESH_TOKEN=' + j.refresh_token + '\n');
  } catch (e) { console.error('exchange error', e.message); process.exit(1); }
  server.close();
});
let redirect = '';
server.listen(0, '127.0.0.1', () => {
  redirect = 'http://127.0.0.1:' + server.address().port;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', redirect);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'https://www.googleapis.com/auth/chromewebstore');
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  console.log('Open this URL in your normal browser (signed in to the CWS developer account) and approve:\n\n' + auth.href + '\n\nWaiting for the redirect on ' + redirect + ' …');
});
