const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'pages');
const relay = { bodies: [] }; // mock relay memory, shared by the HTTP and HTTPS listeners

function handler(req, res) {
  const url = req.url.split('?')[0];
  if (url === '/relay' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      try { relay.bodies.push(JSON.parse(b)); } catch (_) { relay.bodies.push({ bad: b }); }
      res.writeHead(204); res.end();
    }); return;
  }
  if (url === '/relay/last') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ count: relay.bodies.length, last: relay.bodies[relay.bodies.length - 1] || null }));
    return;
  }
  if (url === '/relay/reset') { relay.bodies = []; res.writeHead(204); res.end(); return; }
  const name = (url === '/' ? '/clean.html' : url);
  const file = path.join(dir, path.basename(name));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(file).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.ico' ? 'image/x-icon' : 'text/html';
    res.writeHead(200, { 'content-type': type }); res.end(buf);
  });
}

http.createServer(handler).listen(5599, () => console.log('fixtures on 5599'));

// HTTPS twin, self-signed test-only cert (tests/e2e/certs) — lets e2e specs
// exercise the URL model's is_https feature realistically instead of every
// fixture scoring near-certain "phishing" purely for being served over http.
const certDir = path.join(__dirname, 'certs');
try {
  const key = fs.readFileSync(path.join(certDir, 'localhost.key'));
  const cert = fs.readFileSync(path.join(certDir, 'localhost.crt'));
  https.createServer({ key, cert }, handler).listen(5600, () => console.log('fixtures on 5600 (https)'));
} catch (e) {
  console.warn('HTTPS fixtures server not started (missing cert):', e.message);
}
