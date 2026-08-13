const test = require('node:test');
const assert = require('node:assert');
const { createVrcStatus } = require('../src/vrcstatus');

const silent = { info: () => {}, warn: () => {}, error: () => {} };

// 按 URL 后缀分发的假 fetch, 记录 Referer
function fakeFetch(handlers) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, referer: options.headers && options.headers.Referer });
    const key = Object.keys(handlers).find((k) => url.endsWith(k));
    const h = key ? handlers[key] : handlers.default;
    if (!h) throw new Error('unhandled ' + url);
    if (h.throw) throw new Error(h.throw);
    if (h.status && h.status !== 200) {
      return { ok: false, status: h.status, json: async () => ({}), headers: { get: () => null } };
    }
    return { ok: true, status: 200, json: async () => h.body || {}, headers: { get: () => null } };
  };
  impl.calls = calls;
  return impl;
}

test('vrcstatus: All Systems Operational maps to normal, no summary fetch', async () => {
  const f = fakeFetch({
    'status.json': { body: { status: { description: 'All Systems Operational', indicator: 'none' }, page: { updated_at: '2026-08-13T00:00:00Z' } } }
  });
  const s = createVrcStatus({ apiUrl: 'https://status.vrchat.com/api/v2', fetchImpl: f, logger: silent, now: () => 1000 });
  await s.check();
  const st = s.status();
  assert.equal(st.state, 'normal');
  assert.equal(st.description, 'All Systems Operational');
  assert.equal(st.summary, null);
  assert.equal(st.fetchedAt, 1000);
  assert.equal(f.calls.length, 1, '正常时不拉 summary');
  assert.equal(f.calls[0].referer, 'https://vrcx.app');
});

test('vrcstatus: minor indicator maps to degraded with component summary', async () => {
  const f = fakeFetch({
    'status.json': { body: { status: { description: 'Degraded Performance', indicator: 'minor' }, page: { updated_at: '2026-08-13T00:00:00Z' } } },
    'summary.json': {
      body: {
        components: [
          { name: 'API', status: 'operational' },
          { name: 'Web', status: 'degraded_performance' },
          { name: 'SDK', status: 'major_outage' }
        ]
      }
    }
  });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  await s.check();
  const st = s.status();
  assert.equal(st.state, 'degraded');
  assert.equal(st.description, 'Degraded Performance');
  assert.equal(st.summary, 'Web, SDK');
});

test('vrcstatus: major/critical indicator maps to outage', async () => {
  const f = fakeFetch({
    'status.json': { body: { status: { description: 'Major System Outage', indicator: 'critical' }, page: { updated_at: '2026-08-13T00:00:00Z' } } },
    'summary.json': { body: { components: [{ name: 'API', status: 'major_outage' }] } }
  });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  await s.check();
  assert.equal(s.status().state, 'outage');
  assert.equal(s.status().summary, 'API');
});

test('vrcstatus: fetch failure maps to degraded with error detail', async () => {
  const f = fakeFetch({ 'status.json': { throw: 'network down' } });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  await s.check();
  const st = s.status();
  assert.equal(st.state, 'degraded');
  assert.equal(st.description, '无法获取 VRC 服务器状态');
  assert.equal(st.summary, 'network down');
});

test('vrcstatus: summary failure keeps state without summary', async () => {
  const f = fakeFetch({
    'status.json': { body: { status: { description: 'Partial System Outage', indicator: 'major' }, page: { updated_at: null } } },
    'summary.json': { status: 500 }
  });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  await s.check();
  const st = s.status();
  assert.equal(st.state, 'outage');
  assert.equal(st.summary, null);
});

test('vrcstatus: starts as unknown before check', () => {
  const s = createVrcStatus({ fetchImpl: fakeFetch({}), logger: silent });
  assert.equal(s.status().state, 'unknown');
});
