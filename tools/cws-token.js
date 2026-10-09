#!/usr/bin/env node
/**
 * Helper: obtain (or renew) the Chrome Web Store API refresh token for
 * chrome-webstore-upload. Run with the OAuth "Desktop app" client:
 *
 *   npm run cws:token                                  (reads the client from the secrets file)
 *   node tools/cws-token.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * It starts a loopback listener, opens a Google consent URL in your normal
 * (signed-in) browser, receives the auth code on the loopback port, exchanges
 * it, and writes CWS_REFRESH_TOKEN into docs/store-secrets.local.txt
 * (git-ignored). The token is never printed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { URL } = require('url');

const secretsFile = path.join(__dirname, '..', 'docs', 'store-secrets.local.txt');
const secretsText = fs.existsSync(secretsFile) ? fs.readFileSync(secretsFile, 'utf8') : '';
const secrets = {};
for (const line of secretsText.split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) secrets[m[1]] = m[2]; }

const clientId = process.argv[2] || secrets.CWS_CLIENT_ID;
const clientSecret = process.argv[3] || secrets.CWS_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('usage: node tools/cws-token.js [<CLIENT_ID> <CLIENT_SECRET>]\n(or set CWS_CLIENT_ID and CWS_CLIENT_SECRET in docs/store-secrets.local.txt)');
  process.exit(2);
}

function saveRefreshToken(token) {
  const lines = secretsText ? secretsText.split(/\r?\n/) : [];
  const i = lines.findIndex((l) => /^\s*CWS_REFRESH_TOKEN\s*=/.test(l));
  if (i >= 0) lines[i] = 'CWS_REFRESH_TOKEN=' + token;
  else { while (lines.length && lines[lines.length - 1] === '') lines.pop(); lines.push('CWS_REFRESH_TOKEN=' + token, ''); }
  fs.writeFileSync(secretsFile, lines.join('\n'));
}

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
    if (!j.refresh_token) { console.error('Token exchange failed:', j.error || 'no refresh_token', j.error_description || ''); process.exit(1); }
    saveRefreshToken(j.refresh_token);
    console.log('\nNew refresh token saved to docs/store-secrets.local.txt. Next: npm run release:cws\n');
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
  console.log('Opening Google sign-in. If no tab opens, paste this URL into your normal browser (signed in to the CWS developer account):\n\n' + auth.href + '\n\nWaiting for the redirect on ' + redirect + ' …');
  // Best effort; rundll32 avoids cmd.exe mangling the & in the URL.
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', auth.href]]
    : process.platform === 'darwin' ? ['open', [auth.href]] : ['xdg-open', [auth.href]];
  execFile(cmd, args, () => {});
});
