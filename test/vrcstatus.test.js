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

test('vrcstatus: 正常 15 分钟、异常 2 分钟后更新状态', async () => {
  const handlers = { 'status.json': { body: operational }, 'summary.json': { body: { components: [] } } };
  const f = fakeFetch(handlers);
  let t = 1000;
  const s = createVrcStatus({ fetchImpl: f, logger: silent, now: () => t });
  assert.equal((await s.status()).state, 'normal');
  handlers['status.json'].body = { status: { description: 'Major System Outage', indicator: 'major' } };
  t += 14 * 60 * 1000;
  assert.equal((await s.status()).state, 'normal', '正常结果保留 15 分钟');
  t += 60001;
  assert.equal((await s.status()).state, 'outage');
  handlers['status.json'].body = operational;
  t += 120000;
  assert.equal((await s.status()).state, 'outage', '和 VRCX 一样严格超过刷新间隔才获取');
  t += 1;
  assert.equal((await s.status()).state, 'normal');
});

test('vrcstatus: concurrent calls share one inflight request', async () => {
  const f = fakeFetch({ 'status.json': { body: operational, latencyMs: 40 } });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  const [a, b] = await Promise.all([s.status(), s.status()]);
  assert.equal(f.calls.length, 1, '并发调用只发一次请求');
  assert.equal(a.state, 'normal');
  assert.equal(b.state, 'normal');
});

test('vrcstatus: 页面重新聚焦时, 距上次获取超过 60 秒才提前刷新', async () => {
  const handlers = { 'status.json': { body: operational }, 'summary.json': { body: { components: [] } } };
  let time = 1000;
  const s = createVrcStatus({ fetchImpl: fakeFetch(handlers), now: () => time });
  await s.status();
  handlers['status.json'].body = { status: { description: 'Degraded Performance', indicator: 'minor' } };
  time += 60000;
  assert.equal((await s.status({ focus: true })).state, 'normal');
  time += 1;
  assert.equal((await s.status({ focus: true })).state, 'degraded');
});

test('vrcstatus: 后端启动即探测, 按分钟检查并推送新结果, 停止后不再探测', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 });
  const handlers = { 'status.json': { body: operational }, 'summary.json': { body: { components: [] } } };
  const updates = [];
  const s = createVrcStatus({ fetchImpl: fakeFetch(handlers), now: () => Date.now(), onUpdate: value => updates.push(value) });
  t.after(() => s.stop?.());
  await s.start();
  assert.equal(updates.at(-1).state, 'normal');
  handlers['status.json'].body = { status: { description: 'Major System Outage', indicator: 'major' } };
  t.mock.timers.tick(15 * 60 * 1000);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(updates.at(-1).state, 'normal');
  t.mock.timers.tick(60000);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(updates.at(-1).state, 'outage', '没有前端请求也会更新');
  handlers['status.json'].body = operational;
  t.mock.timers.tick(3 * 60 * 1000);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(updates.at(-1).state, 'normal', '异常时缩短探测间隔');
  s.stop();
  const last = updates.at(-1);
  t.mock.timers.tick(16 * 60 * 1000);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.strictEqual(updates.at(-1), last);
});

test('vrcstatus: 停止服务会取消未完成的探测, 不再推送结果', async () => {
  let signal;
  const updates = [];
  const s = createVrcStatus({
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      signal = options.signal;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
    onUpdate: result => updates.push(result)
  });
  const pending = s.start();
  s.stop();
  assert.equal(signal.aborted, true);
  await pending;
  assert.deepEqual(updates, []);
});

test('vrcstatus: minor maps to degraded with summary, major maps to outage', async () => {
  const f = fakeFetch({
    'status.json': { body: { status: { description: 'Degraded Performance', indicator: 'minor' }, page: { updated_at: 'x' } } },
    'summary.json': { body: { components: [{ name: 'API', status: 'operational' }, { name: 'Web', status: 'degraded_performance' }] } }
  });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  await s.status();
  await new Promise(resolve => setTimeout(resolve, 15));
  const st = await s.status();
  assert.equal(st.state, 'degraded');
  assert.equal(st.summary, 'Web');

  const f2 = fakeFetch({
    'status.json': { body: { status: { description: 'Major System Outage', indicator: 'major' }, page: { updated_at: 'x' } } },
    'summary.json': { body: { components: [{ name: 'API', status: 'major_outage' }] } }
  });
  const s2 = createVrcStatus({ fetchImpl: f2, logger: silent });
  await s2.status();
  await new Promise(resolve => setTimeout(resolve, 15));
  const st2 = await s2.status();
  assert.equal(st2.state, 'outage');
  assert.equal(st2.summary, 'API');
});

test('vrcstatus: VRCX 仅 major 为严重故障, critical 保留警告级别', async () => {
  const f = fakeFetch({
    'status.json': { body: { status: { description: 'Critical System Outage', indicator: 'critical' } } },
    'summary.json': { body: { components: [] } }
  });
  const st = await createVrcStatus({ fetchImpl: f }).status();
  assert.equal(st.state, 'degraded');
  assert.equal(st.indicator, 'critical');
});

test('vrcstatus: 故障立即推送, 组件详情稍后补齐', async (t) => {
  let release;
  const summary = new Promise(resolve => { release = resolve; });
  t.after(() => release({ components: [] }));
  const updates = [];
  const s = createVrcStatus({
    fetchImpl: async url => ({ ok: true, status: 200, json: async () => url.endsWith('summary.json')
      ? summary : { status: { description: 'Major System Outage', indicator: 'major' } } }),
    onUpdate: value => updates.push(value)
  });
  const pending = s.status();
  await new Promise(setImmediate);
  assert.equal(updates.at(-1)?.state, 'outage', '详情未返回也应先通知故障');
  const first = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 30))]);
  assert.equal(first?.state, 'outage', '公开状态接口也不能等待组件详情');
  release({ components: [{ name: 'API', status: 'major_outage' }] });
  await new Promise(setImmediate);
  assert.equal(updates.at(-1).summary, 'API');
});

test('vrcstatus: fetch failure maps to unknown with error detail', async () => {
  const f = fakeFetch({ 'status.json': { throw: 'network down' } });
  const s = createVrcStatus({ fetchImpl: f, logger: silent });
  const st = await s.status();
  assert.equal(st.state, 'unknown');
  assert.equal(st.description, '无法获取状态');
  assert.equal(st.summary, 'network down');
});

test('vrcstatus: 获取失败替换旧正常状态, 恢复后重新显示正常', async () => {
  let mode = 'ok';
  const f = (url) => new Promise((resolve, reject) => {
    setTimeout(() => {
      if (mode === 'fail') { reject(new Error('network down')); return; }
      resolve({ ok: true, status: 200, json: async () => operational, headers: { get: () => null } });
    }, 5);
  });
  let t = 1000;
  const s = createVrcStatus({ fetchImpl: f, logger: silent, now: () => t });
  const a = await s.status();
  assert.equal(a.state, 'normal');
  assert.equal(a.stale, undefined, '成功获取无 stale 标记');

  mode = 'fail';
  t += 15 * 60 * 1000 + 1;
  const b = await s.status();
  assert.equal(b.state, 'unknown', '获取失败必须提示, 不能继续显示旧正常状态');
  assert.equal(b.stale, undefined);
  assert.equal(b.description, '无法获取状态');

  const c = await s.status(); // TTL 内复用, 不重新请求
  assert.equal(c.state, 'unknown');

  t += 2 * 60 * 1000 + 1;
  const d = await s.status();
  assert.equal(d.state, 'unknown');

  mode = 'ok';
  t += 2 * 60 * 1000 + 1;
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
