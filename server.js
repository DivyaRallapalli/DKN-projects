'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleEnquiryRequest } = require('./lib/enquiry');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.normalize(path.join(ROOT, relative));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

const server = http.createServer(async function (req, res) {
  try {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath === '/api/enquiry') {
      await handleEnquiryRequest(req, res);
      return;
    }

    const filePath = safePath(urlPath);
    if (!filePath) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, function (err, stats) {
      const target = (!err && stats.isDirectory()) ? path.join(filePath, 'index.html') : filePath;
      fs.readFile(target, function (readErr, data) {
        if (readErr) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream');
        res.end(data);
      });
    });
  } catch (err) {
    res.statusCode = 500;
    res.end('Server error');
  }
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('DKN Projects listening on http://127.0.0.1:' + PORT);
});
