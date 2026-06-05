const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'pages');
http.createServer((req, res) => {
  const name = (req.url.split('?')[0] === '/' ? '/clean.html' : req.url.split('?')[0]);
  const file = path.join(dir, path.basename(name));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(buf);
  });
}).listen(5599, () => console.log('fixtures on 5599'));
