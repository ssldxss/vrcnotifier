'use strict';
// 前端独立进程: 托管 public/ 静态页面。
// 页面左上角配置后端地址(默认 http://127.0.0.1:3000), 前后端通过 token 鉴权。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function createFrontendServer({ root, logger = console } = {}) {
  const base = path.resolve(root);
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let p;
      try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); res.end('Bad Request'); return; }
      if (p === '/' || p === '') p = '/index.html';
      const file = path.normalize(path.join(base, p));
      if (file !== base && !file.startsWith(base + path.sep)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache'
        });
        res.end(data);
      });
    } catch (e) {
      logger.error && logger.error('[frontend] 处理请求失败: ' + e.message);
      res.writeHead(500); res.end('Internal Server Error');
    }
  });
}

if (require.main === module) {
  const port = parseInt(process.env.FRONTEND_PORT || process.argv[2] || '8080', 10);
  const server = createFrontendServer({ root: path.join(__dirname, 'public') });
  server.listen(port, () => {
    console.log(`[frontend] 前端运行中: http://localhost:${port} (后端默认 http://127.0.0.1:3000)`);
  });
}

module.exports = { createFrontendServer };
