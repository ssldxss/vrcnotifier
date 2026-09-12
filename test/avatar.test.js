const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAvatarCache, toThumbUrl } = require('../src/avatar');

const THUMB = 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/256';
const KEY = 'file_abc-123_1_128';
const KEY_URL = 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/128';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-av-')); }

// 轮询等待条件成立, 避免用固定 sleep 造成偶发失败
async function waitFor(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return fn();
}

function imgFetch(calls = { n: 0, urls: [] }, { status = 200 } = {}) {
  return async (url) => {
    calls.n++;
    calls.urls.push(String(url));
    if (status !== 200) return { status, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{}') };
    return { status: 200, headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'image/png' : '') }, arrayBuffer: async () => Buffer.from('AVATARPNG') };
  };
}

test('thumbKeyFromUrl 用固定尺寸建 key, 与 URL 里的尺寸无关', () => {
  const c = createAvatarCache({ dir: tmpDir() });
  assert.equal(c.thumbKeyFromUrl(THUMB), 'file_abc-123_1_128');
  assert.equal(c.thumbKeyFromUrl('https://api.vrchat.cloud/api/1/image/file_abc-123/1/64'), 'file_abc-123_1_128', 'URL 是 64 也建同样的 key');
  assert.equal(c.thumbKeyFromUrl('https://api.vrchat.cloud/api/1/image/file_abc-123/9/256'), 'file_abc-123_9_128', '版本号仍取自 URL');
  assert.equal(c.thumbKeyFromUrl('https://api.vrchat.cloud/api/1/file/file_x/1/file'), null, '原图不产生 key');
  assert.equal(c.thumbKeyFromUrl('https://evil.example.com/x'), null);
  assert.equal(c.thumbKeyFromUrl('not a url'), null);
  assert.equal(c.thumbKeyFromUrl(''), null);
});

test('toThumbUrl 统一成 /api/1/image/ 形态, 尺寸固定', () => {
  assert.equal(toThumbUrl(THUMB), 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/128');
  assert.equal(toThumbUrl('https://api.vrchat.cloud/api/1/image/file_abc-123/1/64'), 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/128', '已是缩略图也换成缓存尺寸');
  assert.equal(toThumbUrl('https://api.vrchat.cloud/api/1/file/file_abc-123/1/file'), 'https://api.vrchat.cloud/api/1/image/file_abc-123/1/128');
  assert.equal(toThumbUrl('https://api.vrchat.cloud/api/1/file/file_abc-123/7/file'), 'https://api.vrchat.cloud/api/1/image/file_abc-123/7/128');
  assert.equal(toThumbUrl('https://evil.example.com/x'), null);
  assert.equal(toThumbUrl(null), null);
  assert.equal(toThumbUrl(''), null);
});

test('urlFromKey 拼出上游地址, key 形状不对返回 null', () => {
  const c = createAvatarCache({ dir: tmpDir() });
  assert.equal(c.urlFromKey(KEY), KEY_URL);
  assert.equal(c.urlFromKey('file_abc-123_9_128'), 'https://api.vrchat.cloud/api/1/image/file_abc-123/9/128');
  assert.equal(c.urlFromKey('../../etc/passwd'), null);
  assert.equal(c.urlFromKey('../' + KEY), null);
  assert.equal(c.urlFromKey('evil_key'), null);
  assert.equal(c.urlFromKey('file_abc-123_1'), null);
  assert.equal(c.urlFromKey(''), null);
  assert.equal(c.urlFromKey(null), null);
});

test('ensure 按 key 推出地址下载并写盘', async () => {
  const dir = tmpDir();
  const calls = { n: 0, urls: [] };
  const c = createAvatarCache({ dir, fetchImpl: imgFetch(calls) });
  assert.equal(await c.ensure(KEY), true);
  assert.deepEqual(calls.urls, [KEY_URL], '下载地址由 key 推出, 用的是缓存尺寸');
  assert.equal(fs.readFileSync(path.join(dir, KEY), 'utf8'), 'AVATARPNG');
  assert.equal(c.cached(KEY), path.join(dir, KEY));
});

test('ensure 本地已有则不再下载', async () => {
  const dir = tmpDir();
  const calls = { n: 0, urls: [] };
  const c = createAvatarCache({ dir, fetchImpl: imgFetch(calls) });
  await c.ensure(KEY);
  assert.equal(await c.ensure(KEY), true);
  assert.equal(calls.n, 1, '第二次应命中本地');
});

test('ensure 对形状不对的 key 不联网也不落盘', async () => {
  const dir = tmpDir();
  const calls = { n: 0, urls: [] };
  const c = createAvatarCache({ dir, fetchImpl: imgFetch(calls) });
  for (const k of ['../../etc/passwd', 'evil_key', '', 'file_abc-123_1']) {
    assert.equal(await c.ensure(k), false, `${JSON.stringify(k)} 应被拒`);
  }
  assert.equal(calls.n, 0, '不该发起下载');
  assert.deepEqual(fs.readdirSync(dir), [], '不该产生任何文件');
});

test('并发 ensure 同一个 key 只下载一次', async () => {
  const dir = tmpDir();
  const calls = { n: 0, urls: [] };
  let release;
  const gate = new Promise((r) => { release = r; });
  const fetchImpl = async (url) => { calls.n++; calls.urls.push(String(url)); await gate; return imgFetch()(); };
  const c = createAvatarCache({ dir, fetchImpl });
  const p1 = c.ensure(KEY);
  const p2 = c.ensure(KEY);
  release();
  await Promise.all([p1, p2]);
  assert.equal(calls.n, 1, '并发请求应合并为一次下载');
});

test('下载失败不缓存, 下次重新下', async () => {
  const dir = tmpDir();
  const calls = { n: 0, urls: [] };
  const fetchImpl = async (url) => {
    calls.n++;
    calls.urls.push(String(url));
    if (calls.n === 1) return { status: 500, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{}') };
    return { status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('AVATARPNG') };
  };
  const c = createAvatarCache({ dir, fetchImpl });
  await assert.rejects(() => c.ensure(KEY), /下载失败/);
  assert.equal(c.cached(KEY), null, '失败不缓存');
  assert.equal(await c.ensure(KEY), true);
  assert.equal(calls.n, 2, '失败后下次请求重新下载');
});

test('非图片响应被拒且不缓存', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, fetchImpl: async () => ({ status: 200, headers: { get: () => 'text/html' }, arrayBuffer: async () => Buffer.from('<html>') }) });
  await assert.rejects(() => c.ensure(KEY), /非图片/);
  assert.equal(c.cached(KEY), null);
});

test('超过 2MB 的图片被拒且不缓存', async () => {
  const dir = tmpDir();
  const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
  const c = createAvatarCache({ dir, fetchImpl: async () => ({ status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => big }) });
  await assert.rejects(() => c.ensure(KEY), (err) => err.code === 'DOWNLOAD');
  assert.equal(c.cached(KEY), null);
});

test('下载超时中断且不缓存', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({
    dir,
    downloadTimeoutMs: 50,
    fetchImpl: (url, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  await assert.rejects(() => c.ensure(KEY), (err) => err.code === 'DOWNLOAD');
  assert.equal(c.cached(KEY), null);
});

test('sweep 按 mtime 清理过期文件, 保留近期访问的', async () => {
  const dir = tmpDir();
  const calls = { n: 0, urls: [] };
  const c = createAvatarCache({ dir, ttlMs: 1000, fetchImpl: imgFetch(calls) });
  await c.ensure('file_old_1_128');
  await c.ensure('file_fresh_1_128');
  const oldP = path.join(dir, 'file_old_1_128');
  const freshP = path.join(dir, 'file_fresh_1_128');
  const old = new Date(Date.now() - 5000);
  fs.utimesSync(oldP, old, old);
  assert.equal(c.sweep(), 1);
  assert.equal(fs.existsSync(oldP), false);
  assert.equal(fs.existsSync(freshP), true);
});

test('sweep 也会清掉过期的临时文件', () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, ttlMs: 1000 });
  const stale = path.join(dir, '.file_x_1_128.999.111.tmp'); // 崩溃遗留: 正常只活到 rename 为止
  const fresh = path.join(dir, '.file_y_1_128.999.222.tmp');
  fs.writeFileSync(stale, 'X');
  fs.writeFileSync(fresh, 'Y');
  const old = new Date(Date.now() - 5000);
  fs.utimesSync(stale, old, old);
  assert.equal(c.sweep(), 1);
  assert.equal(fs.existsSync(stale), false, '过期的临时文件应被清掉');
  assert.equal(fs.existsSync(fresh), true, '没过期的不动');
});

test('touchPath 续期后 sweep 不删', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, ttlMs: 1000, fetchImpl: imgFetch() });
  await c.ensure(KEY);
  const p = path.join(dir, KEY);
  const old = new Date(Date.now() - 5000);
  fs.utimesSync(p, old, old);
  assert.equal(c.touchPath(p), true, '访问应刷新 mtime');
  assert.equal(c.sweep(), 0);
  assert.equal(fs.existsSync(p), true);
});

test('clear 删掉目录里的全部内容, 目录本身保留', () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir });
  fs.writeFileSync(path.join(dir, KEY), 'A');
  fs.writeFileSync(path.join(dir, '.file_x_1_128.123.456.tmp'), 'B'); // 崩溃遗留的临时文件
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'inner'), 'C');
  assert.equal(c.clear(), 3, '点文件与子目录也要算进去');
  assert.deepEqual(fs.readdirSync(dir), [], '目录应被清空');
  assert.equal(fs.existsSync(dir), true, '目录本身要保留');
});

test('缓存文件数超过上限时淘汰最旧的', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, maxFiles: 3, fetchImpl: imgFetch() });
  for (let i = 1; i <= 3; i++) {
    await c.ensure(`file_k${i}_1_128`);
    const t = new Date(Date.now() - (100 - i * 10) * 1000); // k1 最旧, k3 最新
    fs.utimesSync(path.join(dir, `file_k${i}_1_128`), t, t);
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), ['file_k1_1_128', 'file_k2_1_128', 'file_k3_1_128'], '未超限时不动');
  await c.ensure('file_k4_1_128'); // 第 4 张落盘 -> 超限, 淘汰最旧的 k1
  assert.deepEqual(fs.readdirSync(dir).sort(), ['file_k2_1_128', 'file_k3_1_128', 'file_k4_1_128']);
});

test('淘汰时打日志写明淘汰数量和上限', async () => {
  const dir = tmpDir();
  const lines = [];
  const logger = { debug: () => {}, info: (m) => lines.push(String(m)), warn: () => {}, error: () => {} };
  const c = createAvatarCache({ dir, maxFiles: 2, logger, fetchImpl: imgFetch() });
  for (let i = 1; i <= 2; i++) {
    await c.ensure(`file_k${i}_1_128`);
    const t = new Date(Date.now() - (100 - i * 10) * 1000);
    fs.utimesSync(path.join(dir, `file_k${i}_1_128`), t, t);
  }
  await c.ensure('file_k3_1_128');
  assert.ok(lines.some((l) => l === '[avatar] 缓存超限, 已淘汰最旧的 1 个 (上限 2)'), `实际日志: ${lines.join(' | ')}`);
});

test('定时器按间隔清理过期文件, 停止后不再清理', async () => {
  const dir = tmpDir();
  const c = createAvatarCache({ dir, ttlMs: 1000, fetchImpl: imgFetch() });
  await c.ensure(KEY);
  const p = path.join(dir, KEY);
  const old = new Date(Date.now() - 5000);
  c.startTimers({ intervalMs: 20 });
  c.startTimers({ intervalMs: 20 }); // 重复启动不应出问题
  fs.utimesSync(p, old, old);
  assert.ok(await waitFor(() => !fs.existsSync(p)), '定时器应清掉过期文件');
  c.stopTimers();
  c.stopTimers(); // 重复停止不应出问题
  fs.writeFileSync(p, 'X');
  fs.utimesSync(p, old, old);
  await new Promise((r) => setTimeout(r, 100)); // 远超过间隔
  assert.equal(fs.existsSync(p), true, '停止后不该再清理');
});
