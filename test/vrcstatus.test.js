const test = require('node:test');
const assert = require('node:assert');
const { createVrcStatus } = require('../src/vrcstatus');

const silent = { info: () => {}, warn: () => {}, error: () => {} };

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

test('vrcstatus: fetch failure maps to degraded with error detail', async () => {
  const f = fakeFetch({ 'status.json': { throw: 'network down' } });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  const st = await s.status();
  assert.equal(st.state, 'degraded');
  assert.equal(st.description, '无法获取 VRC 服务器状态');
  assert.equal(st.summary, 'network down');
});
