'use strict';
// 头像缓存: 缩略图 key 解析 + 服务端下载 + 原子写盘 + in-flight 并发去重 + mtime TTL 清理。
// 文件系统即索引: data/avatars/{key} 存在即缓存命中, 不建表; mtime 即最后访问时间。

const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 2 * 1024 * 1024; // 单张上限, 防止异常大文件

// 统一头像图片到 /api/1/image/ 形态:
// 已是缩略图 -> 原样; 原图 /file/{fileId}/{version}/file -> /image/{fileId}/{version}/256; 其他 -> null
const DOWNLOAD_TIMEOUT_MS = 10 * 1000;

function toThumbUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(String(url));
    const thumb = u.pathname.match(/^\/api\/1\/image\/(file_[A-Za-z0-9-]+)\/(\d+)\/(\d+)$/);
    if (thumb) return u.origin + u.pathname;
    const full = u.pathname.match(/^\/api\/1\/file\/(file_[A-Za-z0-9-]+)\/(\d+)\/file$/);
    if (full) return `${u.origin}/api/1/image/${full[1]}/${full[2]}/256`;
    return null;
  } catch (e) {
    return null;
  }
}

// 本地缓存文件无扩展名, 按魔数推断图片类型
function detectImageType(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
  } catch (e) {
    return null;
  }
}

function createAvatarCache({ dir, logger = null, fetchImpl = fetch, userAgent = 'vrcnotifier/1.0', ttlMs = 30 * 24 * 3600 * 1000, downloadTimeoutMs = DOWNLOAD_TIMEOUT_MS }) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  const inFlight = new Map(); // key -> Promise

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 从缩略图 URL 提取缓存 key: /api/1/image/{fileId}/{version}/{size} -> {fileId}_{version}_{size}
  function thumbKeyFromUrl(url) {
    try {
      const u = new URL(String(url));
      const m = u.pathname.match(/^\/api\/1\/image\/(file_[A-Za-z0-9-]+)\/(\d+)\/(\d+)$/);
      return m ? `${m[1]}_${m[2]}_${m[3]}` : null;
    } catch (e) {
      return null;
    }
  }

  function filePath(key) {
    return path.join(dir, key);
  }

  function cached(key) {
    const p = filePath(key);
    try { fs.accessSync(p, fs.constants.R_OK); return p; } catch (e) { return null; }
  }

  // 每次访问刷新 mtime(即 TTL 续期)
  function touch(key) {
    const p = filePath(key);
    try { const t = new Date(); fs.utimesSync(p, t, t); return true; } catch (e) { return false; }
  }

  async function download(key, url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), downloadTimeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'image/*' }, signal: ac.signal });
    } catch (e) {
      throw Object.assign(new Error(`下载失败: ${e.message}`), { code: 'DOWNLOAD' });
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 200) {
      throw Object.assign(new Error(`下载失败: HTTP ${res.status}`), { code: 'DOWNLOAD' });
    }
    const ct = String(res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    if (!/^image\//.test(ct)) {
      throw Object.assign(new Error(`非图片响应: ${ct}`), { code: 'DOWNLOAD' });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      throw Object.assign(new Error(`图片大小异常: ${buf.length} bytes`), { code: 'DOWNLOAD' });
    }
    ensureDir();
    // 原子写盘: 先写临时文件再 rename
    const tmp = path.join(dir, `.${key}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, filePath(key));
    return { contentType: ct, size: buf.length };
  }

  // 下载或复用进行中的下载(并发去重); 失败不缓存, 下次请求重新下载
  function serve(key, url) {
    let p = inFlight.get(key);
    if (!p) {
      p = download(key, url)
        .then((info) => {
          log.info(`[avatar] 已下载并缓存 key=${key} size=${info.size} bytes`);
          return { filePath: filePath(key), ...info };
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, p);
    }
    return p;
  }

  // 清理超过 ttl 未访问(按 mtime)的缓存文件
  function sweep() {
    ensureDir();
    const now = Date.now();
    let removed = 0;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const p = path.join(dir, name);
      let st;
      try { st = fs.statSync(p); } catch (e) { continue; }
      if (!st.isFile()) continue;
      if (now - st.mtimeMs > ttlMs) {
        try { fs.unlinkSync(p); removed++; } catch (e) { log.warn(`[avatar] 清理失败 ${name}: ${e.message}`); }
      }
    }
    if (removed > 0) log.info(`[avatar] 已清理过期缓存 ${removed} 个`);
    return removed;
  }

  // 清空全部缓存文件(登出"清除缓存"用)
  function clear() {
    ensureDir();
    let removed = 0;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      try { fs.unlinkSync(path.join(dir, name)); removed++; } catch (e) { /* 跳过无法删除的文件 */ }
    }
    if (removed > 0) log.info(`[avatar] 已清空缓存 ${removed} 个`);
    return removed;
  }

  return { thumbKeyFromUrl, cached, touch, serve, sweep, clear, dir };
}

module.exports = { createAvatarCache, toThumbUrl, detectImageType };
