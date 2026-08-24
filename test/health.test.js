const test = require('node:test');
const assert = require('node:assert');
const { createHealthMonitor } = require('../src/health');

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

// 可编程 fetch: 支持延迟、非 200、超时中止(监听 AbortSignal)
function fakeFetch(plan) {
  const calls = [];
  const impl = (url, options = {}) => new Promise((resolve, reject) => {
    const idx = calls.length;
    calls.push({ url, options });
    const entry = plan[idx] || plan.default || { latencyMs: 10, body: { ok: true, serverName: 'mock-vrc' } };
    const timer = setTimeout(() => {
      if (entry.throw) { reject(new Error('network down')); return; }
      const status = entry.status || 200;
      const headers = {
        get: (k) => (entry.headers ? (entry.headers[String(k).toLowerCase()] || null) : null)
      };
      resolve({ ok: status >= 200 && status < 300, status, json: async () => entry.body || {}, headers });
    }, entry.latencyMs ?? 10);
    if (options && options.signal) {
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
    }
  });
  impl.calls = calls;
  return impl;
}

test('health: averages 3 samples, reports ok and serverName, no cookies', async () => {
  const fetchImpl = fakeFetch([
    { latencyMs: 100, body: { ok: true }, headers: { 'x-vrc-api-server': 'mock-vrc' } },
    { latencyMs: 200, body: { ok: true, serverName: 'mock-vrc' } },
    { latencyMs: 300, body: { ok: true, serverName: 'mock-vrc' } }
  ]);
  const h = createHealthMonitor({
    apiBaseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl, sampleCount: 3, sampleTimeoutMs: 1000, logger: silent
  });
  await h._debug.tick();
  const s = h.status();
  assert.equal(s.status, 'ok');
  assert.ok(Math.abs(s.latencyMs - 200) < 40, `avg ≈ 200, got ${s.latencyMs}`);
  assert.equal(s.serverName, 'mock-vrc');
  assert.equal(fetchImpl.calls.length, 3);
  assert.equal(fetchImpl.calls[0].url, 'https://api.vrchat.cloud/api/1/config');
  assert.equal(fetchImpl.calls[0].options.headers.Cookie, undefined, '持续探测不带 cookie');
  assert.ok(fetchImpl.calls[0].options.headers['User-Agent']);
});

test('health: discards timed-out samples and averages the rest', async () => {
  const fetchImpl = fakeFetch([
    { latencyMs: 2000 }, // 超过 sampleTimeoutMs, 中止并舍去
    { latencyMs: 100, body: { ok: true } },
    { latencyMs: 300, body: { ok: true } }
  ]);
  const h = createHealthMonitor({
    apiBaseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl, sampleCount: 3, sampleTimeoutMs: 500, logger: silent
  });
  await h._debug.tick();
  const s = h.status();
  assert.equal(s.status, 'ok');
  assert.ok(Math.abs(s.latencyMs - 200) < 40, `avg ≈ 200, got ${s.latencyMs}`);
});

test('health: all samples fail reports error with null latency', async () => {
  const fetchImpl = fakeFetch([
    { status: 500, latencyMs: 5 },
    { throw: true, latencyMs: 5 },
    { latencyMs: 2000 }
  ]);
  const h = createHealthMonitor({
    apiBaseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl, sampleCount: 3, sampleTimeoutMs: 300, logger: silent
  });
  await h._debug.tick();
  const s = h.status();
  assert.equal(s.status, 'error');
  assert.equal(s.latencyMs, null);
});

test('health: failed round after a success keeps last ok status (stale)', async () => {
  const fetchImpl = fakeFetch([
    { latencyMs: 100, body: { ok: true }, headers: { 'x-vrc-api-server': 'mock-vrc' } }, // 第 1 轮成功
    { status: 500, latencyMs: 5 },  // 第 2 轮全部失败
    { throw: true, latencyMs: 5 }
  ]);
  const h = createHealthMonitor({
    apiBaseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl, sampleCount: 1, sampleTimeoutMs: 300, logger: silent
  });
  await h._debug.tick();
  assert.equal(h.status().status, 'ok');
  const okLatency = h.status().latencyMs;
  await h._debug.tick();
  const s = h.status();
  assert.equal(s.status, 'ok', '失败后沿用上次成功状态');
  assert.equal(s.stale, true, '标记为 stale');
  assert.equal(s.latencyMs, okLatency);
  assert.equal(s.serverName, 'mock-vrc');
  // 无历史成功且整轮失败 → error
  const h2 = createHealthMonitor({
    apiBaseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl: fakeFetch([{ status: 500, latencyMs: 5 }]),
    sampleCount: 1, sampleTimeoutMs: 300, logger: silent
  });
  await h2._debug.tick();
  const s2 = h2.status();
  assert.equal(s2.status, 'error');
  assert.equal(s2.stale, undefined);
});

test('health: onSample called after each round with latest status', async () => {
  const seen = [];
  const h = createHealthMonitor({
    apiBaseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl: fakeFetch([{ latencyMs: 10, body: { ok: true } }]),
    sampleCount: 1, sampleTimeoutMs: 1000, logger: silent,
    onSample: (s) => seen.push(s)
  });
  await h._debug.tick();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].status, 'ok');
  assert.equal(typeof seen[0].latencyMs, 'number');
  // 全部失败的一轮同样推送(前端据此显示 延迟:-)
  const h2 = createHealthMonitor({
    apiBaseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl: fakeFetch([{ status: 500, latencyMs: 5 }]),
    sampleCount: 1, sampleTimeoutMs: 300, logger: silent,
    onSample: (s) => seen.push(s)
  });
  await h2._debug.tick();
  assert.equal(seen.length, 2);
  assert.equal(seen[1].status, 'error');
  assert.equal(seen[1].latencyMs, null);
});

test('health: starts in starting state and stop is idempotent', async () => {
  const h = createHealthMonitor({ apiBaseUrl: 'https://api.vrchat.cloud/api/1', fetchImpl: fakeFetch([{}]), logger: silent });
  assert.equal(h.status().status, 'starting');
  h.start();
  h.start();
  h.stop();
  h.stop();
  assert.ok(h.status().updatedAt > 0 || h.status().updatedAt === 0);
});
