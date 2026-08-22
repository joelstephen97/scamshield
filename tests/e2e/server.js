const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'pages');
http.createServer((req, res) => {
  const name = (req.url.split('?')[0] === '/' ? '/clean.html' : req.url.split('?')[0]);
  const file = path.join(dir, path.basename(name));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(file).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.ico' ? 'image/x-icon' : 'text/html';
    res.writeHead(200, { 'content-type': type }); res.end(buf);
  });
}).listen(5599, () => console.log('fixtures on 5599'));
