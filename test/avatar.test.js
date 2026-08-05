const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAvatarCache, toThumbUrl } = require('../src/avatar');

const THUMB = 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/256';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-av-')); }

function imgFetch(calls = { n: 0 }, { status = 200 } = {}) {
  return async () => {
    calls.n++;
    if (status !== 200) return { status, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{}') };
    return { status: 200, headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'image/png' : '') }, arrayBuffer: async () => Buffer.from('AVATARPNG') };
  };
}

test('thumbKeyFromUrl extracts fileId_version_size, rejects others', () => {
  const c = createAvatarCache({ dir: tmpDir() });
  assert.equal(c.thumbKeyFromUrl(THUMB), 'file_abc-123_1_256');
  assert.equal(c.thumbKeyFromUrl('https://api.vrchat.cloud/api/1/file/file_x/1/file'), null, '原图不产生 key');
  assert.equal(c.thumbKeyFromUrl('https://evil.example.com/x'), null);
  assert.equal(c.thumbKeyFromUrl('not a url'), null);
  assert.equal(c.thumbKeyFromUrl(''), null);
});

test('toThumbUrl normalizes to /api/1/image/ form', () => {
  assert.equal(toThumbUrl('https://api.vrchat.cloud/api/1/image/file_abc-123/1/256'), 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/256');
  assert.equal(toThumbUrl('https://api.vrchat.cloud/api/1/file/file_abc-123/1/file'), 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/256');
  assert.equal(toThumbUrl('https://api.vrchat.cloud/api/1/file/file_abc-123/7/file'), 'https://api.vrchat.cloud/api/1/image/file_abc-123/7/256');
  assert.equal(toThumbUrl('https://evil.example.com/x'), null);
  assert.equal(toThumbUrl(null), null);
  assert.equal(toThumbUrl(''), null);
});

test('serve downloads, writes to disk and returns content type', async () => {
  const dir = tmpDir();
  const calls = { n: 0 };
  const c = createAvatarCache({ dir, fetchImpl: imgFetch(calls) });
  const info = await c.serve('k1', THUMB);
  assert.equal(info.contentType, 'image/png');
  assert.equal(fs.readFileSync(path.join(dir, 'k1'), 'utf8'), 'AVATARPNG');
  assert.equal(c.cached('k1'), path.join(dir, 'k1'));
  assert.equal(calls.n, 1);
});

test('concurrent serve for the same key downloads only once', async () => {
  const dir = tmpDir();
  const calls = { n: 0 };
  let release;
  const gate = new Promise((r) => { release = r; });
  const fetchImpl = async () => { calls.n++; await gate; return imgFetch()(); };
  const c = createAvatarCache({ dir, fetchImpl });
  const p1 = c.serve('k1', THUMB);
  const p2 = c.serve('k1', THUMB);
  release();
  await Promise.all([p1, p2]);
  assert.equal(calls.n, 1, '并发请求应合并为一次下载');
});

test('failed download is not cached and can be retried', async () => {
  const dir = tmpDir();
  const calls = { n: 0 };
  const fetchImpl = async () => {
    calls.n++;
    if (calls.n === 1) return { status: 500, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{}') };
    return imgFetch()();
  };
  const c = createAvatarCache({ dir, fetchImpl });
  await assert.rejects(() => c.serve('k1', THUMB), /下载失败/);
  assert.equal(c.cached('k1'), null, '失败不缓存');
  const info = await c.serve('k1', THUMB);
  assert.equal(info.contentType, 'image/png');
  assert.equal(calls.n, 2, '失败后下次请求重新下载');
});

test('non-image response is rejected and not cached', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, fetchImpl: async () => ({ status: 200, headers: { get: () => 'text/html' }, arrayBuffer: async () => Buffer.from('<html>') }) });
  await assert.rejects(() => c.serve('k1', THUMB), /非图片/);
  assert.equal(c.cached('k1'), null);
});

test('sweep removes stale files by mtime, keeps recently touched', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, ttlMs: 1000, fetchImpl: imgFetch() });
  await c.serve('old', THUMB);
  await c.serve('fresh', THUMB);
  const oldP = path.join(dir, 'old');
  const freshP = path.join(dir, 'fresh');
  const old = new Date(Date.now() - 5000);
  fs.utimesSync(oldP, old, old);
  assert.equal(c.sweep(), 1);
  assert.equal(fs.existsSync(oldP), false);
  assert.equal(fs.existsSync(freshP), true);
});

test('touch renews mtime so sweep keeps the file', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, ttlMs: 1000, fetchImpl: imgFetch() });
  await c.serve('k1', THUMB);
  const p = path.join(dir, 'k1');
  const old = new Date(Date.now() - 5000);
  fs.utimesSync(p, old, old);
  assert.equal(c.touch('k1'), true, '访问应刷新 mtime');
  assert.equal(c.sweep(), 0);
  assert.equal(fs.existsSync(p), true);
});
