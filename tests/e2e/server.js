const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'pages');

function handler(req, res) {
  const name = (req.url.split('?')[0] === '/' ? '/clean.html' : req.url.split('?')[0]);
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
