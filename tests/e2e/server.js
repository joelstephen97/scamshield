const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const dir = path.join(__dirname, 'pages');
// v0.9 threat-feed fixtures (Task B2 e2e): meta.json/set40.bin/warn40.bin/
// exact-*.jsonl.gz built by tests/e2e/feed.spec.js at module-load time and
// served under /feed/<name> — the existing `dir` route above only ever
// serves .html/.png/.ico fixture pages, so this is the "tiny static file
// route" the task brief allows adding for binary feed formats. Sub-paths
// (/feed/hard-benign/nrd.bloom) are allowed too, so a spec that needs its own
// independent feed can point meta.urls at its own directory: runFeedUpdate()
// always fetches the companion files by fixed NAME relative to that base.
const feedDir = path.join(__dirname, 'feed-fixtures');
const relay = { bodies: [] }; // mock relay memory, shared by the HTTP and HTTPS listeners
// Request log, shared by both listeners: lets a spec assert that a navigation
// never actually reached a fixture host (tests/e2e/hot-list.spec.js — a
// declarativeNetRequest redirect must stop the request before the network).
const hits = [];

// Resolves a URL path under `root`, refusing anything that escapes it.
// Returns null for a traversal attempt. Single files keep working exactly as
// before (a bare '/clean.html' resolves to pages/clean.html).
function safeJoin(root, rel) {
  const decoded = decodeURIComponent(rel).replace(/^\/+/, '');
  const file = path.resolve(root, decoded);
  const rootWithSep = path.resolve(root) + path.sep;
  return file.startsWith(rootWithSep) ? file : null;
}

function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.json') return 'application/json';
  if (ext === '.html') return 'text/html';
  return 'application/octet-stream';
}

function handler(req, res) {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/hits')) {
    hits.push({ host: String(req.headers.host || '').toLowerCase(), url, method: req.method });
    // Bounded: a dev server reused across many runs (reuseExistingServer)
    // would otherwise grow forever. Specs reset the log before the window
    // they assert on, so the cap can never truncate a live assertion.
    if (hits.length > 2000) hits.splice(0, hits.length - 2000);
  }
  if (url === '/hits') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(hits));
    return;
  }
  if (url === '/hits/reset') { hits.length = 0; res.writeHead(204); res.end(); return; }
  if (url.startsWith('/feed/')) {
    const file = safeJoin(feedDir, url.slice('/feed'.length));
    if (!file) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      const headers = { 'content-type': contentTypeFor(file) };
      // The hot list (and any future JSON feed file) is fetched with an
      // If-None-Match header in production, so the fixture server has to
      // supply an ETag for that path to be exercised at all. Derived from the
      // bytes, so a rewritten fixture always gets a new one.
      if (path.extname(file).toLowerCase() === '.json') {
        headers.ETag = '"' + crypto.createHash('sha1').update(buf).digest('hex') + '"';
        headers['cache-control'] = 'no-cache';
      }
      res.writeHead(200, headers);
      res.end(buf);
    });
    return;
  }
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
  // Fixture pages live flat in pages/, except the hand-authored hard-benign
  // look-alikes in pages/hard-benign/ (tests/e2e/hard-benign.spec.js).
  const file = safeJoin(dir, name);
  if (!file) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': contentTypeFor(file) }); res.end(buf);
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
