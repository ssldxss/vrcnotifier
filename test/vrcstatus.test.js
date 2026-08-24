const test = require('node:test');
const assert = require('node:assert');
const { createVrcStatus } = require('../src/vrcstatus');

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function fakeFetch(handlers) {
  const calls = [];
  const impl = (url, options = {}) => new Promise((resolve, reject) => {
    const key = Object.keys(handlers).find((k) => url.endsWith(k));
    const h = key ? handlers[key] : handlers.default;
    calls.push(url);
    const timer = setTimeout(() => {
      if (!h) { reject(new Error('unhandled ' + url)); return; }
      if (h.throw) { reject(new Error(h.throw)); return; }
      if (h.status && h.status !== 200) {
        resolve({ ok: false, status: h.status, json: async () => ({}), headers: { get: () => null } });
        return;
      }
      resolve({ ok: true, status: 200, json: async () => h.body || {}, headers: { get: () => null } });
    }, h && h.latencyMs ? h.latencyMs : 5);
    if (options && options.signal) {
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
    }
  });
  impl.calls = calls;
  return impl;
}

const operational = {
  status: { description: 'All Systems Operational', indicator: 'none' },
  page: { updated_at: '2026-08-13T00:00:00Z' }
};

test('vrcstatus: lazy fetch, no request until status() called', async () => {
  const f = fakeFetch({ 'status.json': { body: operational } });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  assert.equal(f.calls.length, 0, '构造时不请求');
  const st = await s.status();
  assert.equal(f.calls.length, 1);
  assert.equal(st.state, 'normal');
  assert.equal(st.description, 'All Systems Operational');
});

test('vrcstatus: caches result for 30s, refetches after expiry', async () => {
  const f = fakeFetch({ 'status.json': { body: operational } });
  let t = 1000;
  const s = createVrcStatus({ fetchImpl: f, logger: silent, now: () => t, cacheTtlMs: 30000 });
  const a = await s.status();
  t += 10000;
  const b = await s.status();
  assert.equal(f.calls.length, 1, '30s 内命中内存缓存');
  assert.deepEqual(a, b);
  t += 21000; // 距首次超过 30s
  await s.status();
  assert.equal(f.calls.length, 2, '缓存过期后重新请求');
});

test('vrcstatus: concurrent calls share one inflight request', async () => {
  const f = fakeFetch({ 'status.json': { body: operational, latencyMs: 40 } });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  const [a, b] = await Promise.all([s.status(), s.status()]);
  assert.equal(f.calls.length, 1, '并发调用只发一次请求');
  assert.equal(a.state, 'normal');
  assert.equal(b.state, 'normal');
});

test('vrcstatus: minor maps to degraded with summary, major maps to outage', async () => {
  const f = fakeFetch({
    'status.json': { body: { status: { description: 'Degraded Performance', indicator: 'minor' }, page: { updated_at: 'x' } } },
    'summary.json': { body: { components: [{ name: 'API', status: 'operational' }, { name: 'Web', status: 'degraded_performance' }] } }
  });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  const st = await s.status();
  assert.equal(st.state, 'degraded');
  assert.equal(st.summary, 'Web');

  const f2 = fakeFetch({
    'status.json': { body: { status: { description: 'Major System Outage', indicator: 'critical' }, page: { updated_at: 'x' } } },
    'summary.json': { body: { components: [{ name: 'API', status: 'major_outage' }] } }
  });
  const s2 = createVrcStatus({ fetchImpl: f2, logger: silent });
  const st2 = await s2.status();
  assert.equal(st2.state, 'outage');
  assert.equal(st2.summary, 'API');
});

test('vrcstatus: fetch failure maps to unknown with error detail', async () => {
  const f = fakeFetch({ 'status.json': { throw: 'network down' } });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  const st = await s.status();
  assert.equal(st.state, 'unknown');
  assert.equal(st.description, '无法获取');
  assert.equal(st.summary, 'network down');
});

test('vrcstatus: 获取失败沿用上次成功状态(stale), 恢复后清除标记', async () => {
  let mode = 'ok';
  const f = (url) => new Promise((resolve, reject) => {
    setTimeout(() => {
      if (mode === 'fail') { reject(new Error('network down')); return; }
      resolve({ ok: true, status: 200, json: async () => operational, headers: { get: () => null } });
    }, 5);
  });
  let t = 1000;
  const s = createVrcStatus({ fetchImpl: f, logger: silent, now: () => t, cacheTtlMs: 60000 });
  const a = await s.status();
  assert.equal(a.state, 'normal');
  assert.equal(a.stale, undefined, '成功获取无 stale 标记');

  mode = 'fail';
  t += 61000; // 超过 TTL → 重新请求(失败)
  const b = await s.status();
  assert.equal(b.state, 'normal', '获取失败沿用上次成功状态');
  assert.equal(b.stale, true, '标记 stale');
  assert.equal(b.description, 'All Systems Operational');

  const c = await s.status(); // TTL 内复用, 不重新请求
  assert.equal(c.state, 'normal');
  assert.equal(c.stale, true);

  t += 61000; // 再次过期重取(仍失败), 继续沿用上次成功
  const d = await s.status();
  assert.equal(d.state, 'normal');
  assert.equal(d.stale, true);

  mode = 'ok';
  t += 61000;
  const e = await s.status();
  assert.equal(e.state, 'normal');
  assert.equal(e.stale, undefined, '恢复后清除 stale 标记');
});

test('vrcstatus: 获取成功输出 debug 日志', async () => {
  const logs = [];
  const logger = { debug: (...a) => logs.push(a.join(' ')), info: () => {}, warn: () => {}, error: () => {} };
  const f = fakeFetch({ 'status.json': { body: operational } });
  const s = createVrcStatus({ fetchImpl: f, logger });
  await s.status();
  assert.ok(logs.some((l) => l.includes('[vrcstatus]') && l.includes('状态获取成功')), '成功时输出获取成功日志');
  assert.ok(logs.some((l) => l.includes('normal')), '日志含状态值');
  // 缓存命中(不重新请求)不应重复输出
  logs.length = 0;
  await s.status();
  assert.equal(logs.length, 0, '缓存命中不重复输出日志');
});
