'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createWorldName } = require('../src/world');

// ---------- 传输层: 无 Cookie ----------

test('world: 请求不带 Cookie / Authorization, 且只发一个世界查询', async () => {
  const captured = [];
  const db = createDb(':memory:');
  const wn = createWorldName({
    db,
    baseUrl: 'https://api.vrchat.cloud/api/1',
    fetchImpl: async (url, opts) => {
      captured.push({ url, headers: opts.headers });
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'wrld_x', name: '测试世界' }) };
    },
    config: { ratePerMinute: 0 }
  });
  assert.equal(await wn.get('wrld_x'), '测试世界');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, 'https://api.vrchat.cloud/api/1/worlds/wrld_x');
  assert.equal(captured[0].headers.Cookie, undefined, '不得携带登录 Cookie');
  assert.equal(captured[0].headers.Authorization, undefined, '不得携带 Authorization');
  assert.equal(captured[0].headers['User-Agent'], 'vrcnotifier/1.0');
});

test('world: 非 2xx 把 HTTP 状态码挂到错误上供策略层分类', async () => {
  const seen = [];
  const db = createDb(':memory:');
  const wn = createWorldName({
    db,
    logger: { debug() {}, info() {}, warn: (m) => seen.push(m), error() {} },
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => JSON.stringify({ error: { message: 'world not found' } }) }),
    config: { ratePerMinute: 0, retryDelayMs: 0 }
  });
  assert.equal(await wn.get('wrld_missing'), null);
  assert.equal(seen.length, 1, '404 不重试, 只记一条日志');
  assert.match(seen[0], /world not found/);
  assert.match(seen[0], /HTTP 404/);
});

// ---------- 策略层 ----------

const { createDb } = require('../src/db');

const HOUR = 60 * 60 * 1000;

function harness(opts = {}) {
  const db = createDb(':memory:');
  const state = { t: 1_000_000_000 };
  const calls = [];
  const sleeps = [];
  const logs = [];
  const events = [];
  const live = { active: 0, peak: 0 };
  let impl = async (id) => ({ id, name: '世界_' + id });

  const wn = createWorldName({
    db,
    fetchWorld: (id) => {
      calls.push(id);
      live.active++;
      live.peak = Math.max(live.peak, live.active);
      return Promise.resolve()
        .then(() => impl(id))
        .finally(() => { live.active--; });
    },
    logger: opts.logger || {
      debug: (m) => logs.push(['debug', m]),
      info: (m) => logs.push(['info', m]),
      warn: (m) => logs.push(['warn', m]),
      error: (m) => logs.push(['error', m])
    },
    now: () => state.t,
    sleep: opts.sleep || (async (ms) => { sleeps.push(ms); }),
    bus: { emit: (name, payload) => events.push({ name, payload }) },
    config: { ratePerMinute: 0, ...(opts.config || {}) }
  });

  return {
    db, wn, calls, sleeps, logs, events, state, live,
    setImpl(fn) { impl = fn; },
    warns: () => logs.filter(([l]) => l === 'warn').map(([, m]) => m),
    errors: () => logs.filter(([l]) => l === 'error').map(([, m]) => m),
    advance(ms) { state.t += ms; }
  };
}

function failWith(status) {
  return async () => { throw Object.assign(new Error('HTTP ' + status), { status }); };
}

// ---------- peek ----------

test('world: peek 不发请求, 过期也照样返回', async () => {
  const t = harness();
  t.db.upsertWorldCache('wrld_a', '旧名字', t.state.t - 10 * HOUR);
  assert.equal(t.wn.peek('wrld_a'), '旧名字');
  assert.equal(t.calls.length, 0, 'peek 不发请求');
  assert.equal(t.wn.peek('wrld_none'), null);
  assert.equal(t.wn.peek(null), null);
  assert.equal(t.calls.length, 0);
});

// ---------- get: 缓存 ----------

test('world: 缓存新鲜时 0 次请求', async () => {
  const t = harness();
  t.db.upsertWorldCache('wrld_a', '新名字', t.state.t - 1000);
  assert.equal(await t.wn.get('wrld_a'), '新名字');
  assert.equal(t.calls.length, 0);
});

test('world: 缓存过期时重查并更新', async () => {
  const t = harness();
  t.db.upsertWorldCache('wrld_a', '旧名字', t.state.t - 2 * HOUR);
  assert.equal(await t.wn.get('wrld_a'), '世界_wrld_a');
  assert.deepEqual(t.calls, ['wrld_a']);
  assert.equal(t.db.getWorldCache('wrld_a').world_name, '世界_wrld_a');
  assert.equal(t.db.getWorldCache('wrld_a').updated_at, t.state.t, 'updated_at 被刷新');
});

test('world: 无缓存时查一次并写入, 同时推 SSE 事件', async () => {
  const t = harness();
  assert.equal(await t.wn.get('wrld_new'), '世界_wrld_new');
  assert.deepEqual(t.calls, ['wrld_new']);
  assert.equal(t.db.getWorldCache('wrld_new').world_name, '世界_wrld_new');
  assert.deepEqual(t.events, [{ name: 'world-name', payload: { worldId: 'wrld_new', worldName: '世界_wrld_new' } }]);
});

test('world: 空 id 直接返回 null 且不发请求', async () => {
  const t = harness();
  assert.equal(await t.wn.get(null), null);
  assert.equal(await t.wn.get(''), null);
  assert.equal(t.calls.length, 0);
});

// ---------- 合并 ----------

test('world: 同一个 id 并发 5 次只发 1 次请求', async () => {
  const t = harness();
  let release;
  t.setImpl((id) => new Promise((r) => { release = () => r({ id, name: '慢世界' }); }));
  const all = Promise.all([1, 2, 3, 4, 5].map(() => t.wn.get('wrld_slow')));
  await new Promise((r) => setImmediate(r));
  assert.equal(t.calls.length, 1, '在途只发一次');
  release();
  assert.deepEqual(await all, ['慢世界', '慢世界', '慢世界', '慢世界', '慢世界']);
  assert.equal(t.events.length, 1, '成功只推一次 SSE');
});

test('world: 请求耗时超过 10 秒窗口, 期间后来者仍搭车不重发', async () => {
  const t = harness();
  let release;
  t.setImpl((id) => new Promise((r) => { release = () => r({ id, name: '很慢的世界' }); }));
  const first = t.wn.get('wrld_slow');
  await new Promise((r) => setImmediate(r));
  t.advance(30 * 1000); // 远超 10 秒窗口, 但请求还在途
  const second = t.wn.get('wrld_slow');
  await new Promise((r) => setImmediate(r));
  assert.equal(t.calls.length, 1, '在途请求不会被窗口过期判定成"可以重发"');
  release();
  assert.equal(await first, '很慢的世界');
  assert.equal(await second, '很慢的世界');
  assert.equal(t.calls.length, 1);
});

test('world: 成功后缓存新鲜, 再要不会重复请求', async () => {
  const t = harness();
  await t.wn.get('wrld_a');
  await t.wn.get('wrld_a');
  await t.wn.get('wrld_a');
  assert.equal(t.calls.length, 1);
});

// ---------- 404 / 403 ----------

test('world: 失败后进冷却, 冷却期内重复调用立即返回且 0 请求', async () => {
  const t = harness();
  t.db.upsertWorldCache('wrld_gone', '旧名字', t.state.t - 10 * HOUR);
  t.setImpl(failWith(404));
  assert.equal(await t.wn.get('wrld_gone'), '旧名字');
  assert.equal(t.calls.length, 1, '404 不重试');

  const t0 = Date.now();
  const again = await t.wn.get('wrld_gone');
  assert.equal(again, '旧名字');
  assert.ok(Date.now() - t0 < 50, '冷却期内【立即】返回, 不让调用方等');
  assert.equal(t.calls.length, 1, '冷却期内 0 请求');
});

test('world: 冷却时长按 5 分钟起步指数退避, 1 小时封顶', async () => {
  const t = harness();
  t.setImpl(failWith(404));
  const failOnce = async () => { await t.wn.get('wrld_gone'); };

  // 第 n 次连续失败 → 冷却 = min(5min × 2^(n-1), 1h)
  const expect = [5, 10, 20, 40, 60, 60];
  for (let i = 0; i < expect.length; i++) {
    const before = t.calls.length;
    await failOnce();                       // 冷却已到期, 触发第 i+1 次失败
    assert.equal(t.calls.length, before + 1, `第 ${i + 1} 次失败只发一个请求`);

    await t.wn.get('wrld_gone');            // 冷却期内
    assert.equal(t.calls.length, before + 1, `第 ${i + 1} 轮冷却期内 0 请求`);

    t.advance(expect[i] * 60 * 1000 - 1);   // 差 1ms 不到期
    await t.wn.get('wrld_gone');
    assert.equal(t.calls.length, before + 1, `第 ${i + 1} 轮冷却未到期(差 1ms)仍不发请求`);

    t.advance(2);                           // 到期, 下一轮开头放行
  }
});

test('world: 成功一次后冷却计数归零, 下次失败重新从 5 分钟起', async () => {
  const t = harness();
  t.setImpl(failWith(404));
  await t.wn.get('wrld_a');                      // 第 1 次失败 → 5 分钟
  t.advance(5 * 60 * 1000 + 1);
  await t.wn.get('wrld_a');                      // 第 2 次失败 → 10 分钟
  t.advance(10 * 60 * 1000 + 1);

  // 这次成功
  t.setImpl(async (id) => ({ id, name: '好了' }));
  assert.equal(await t.wn.get('wrld_a'), '好了');

  // 之后再失败, 重新从 5 分钟起(不是接着 20 分钟)
  t.advance(60 * 60 * 1000 + 1);                 // 让成功缓存过期
  t.setImpl(failWith(404));
  await t.wn.get('wrld_a');
  const before = t.calls.length;
  t.advance(5 * 60 * 1000 - 1);
  await t.wn.get('wrld_a');
  assert.equal(t.calls.length, before, '还差 1ms 不到 5 分钟, 不应放行');
  t.advance(2);
  await t.wn.get('wrld_a');
  assert.equal(t.calls.length, before + 1, '整 5 分钟即放行, 说明计数已归零');
});

test('world: 403 与 404 同样处理', async () => {
  const t = harness();
  t.setImpl(failWith(403));
  assert.equal(await t.wn.get('wrld_denied'), null);
  t.advance(5 * 60 * 1000 - 1);
  await t.wn.get('wrld_denied');
  assert.equal(t.calls.length, 1, '403 也进冷却');
});

test('world: 404 且本地有旧名字时沿用旧名字并记日志', async () => {
  const t = harness();
  t.db.upsertWorldCache('wrld_a', '很久以前的名字', t.state.t - 10 * HOUR);
  t.setImpl(failWith(404));
  assert.equal(await t.wn.get('wrld_a'), '很久以前的名字', '沿用旧名字');
  const w = t.warns().join('\n');
  assert.match(w, /重查失败/);
  assert.match(w, /沿用旧名字「很久以前的名字」/);
});

test('world: 404 且无旧名字时返回 null, 日志用另一条文案', async () => {
  const t = harness();
  t.setImpl(failWith(404));
  assert.equal(await t.wn.get('wrld_a'), null);
  const w = t.warns().join('\n');
  assert.match(w, /查询失败/);
  assert.match(w, /暂无名字可用/);
  assert.ok(!/沿用旧名字/.test(w), '没有旧名字就不该出现"沿用"字样');
});

// ---------- 网络错误 / 5xx ----------

test('world: 网络错误就地重试 1 次后成功', async () => {
  const t = harness();
  let n = 0;
  t.setImpl(async (id) => { n++; if (n === 1) throw Object.assign(new Error('网络断了'), { status: -1 }); return { id, name: '第二次成功' }; });
  assert.equal(await t.wn.get('wrld_a'), '第二次成功');
  assert.equal(t.calls.length, 2, '总共 2 次尝试');
  assert.deepEqual(t.sleeps, [500], '重试前等 500ms');
  assert.equal(t.db.getWorldCache('wrld_a').world_name, '第二次成功');
});

test('world: 5xx 也走就地重试', async () => {
  const t = harness();
  let n = 0;
  t.setImpl(async (id) => { n++; if (n === 1) throw Object.assign(new Error('HTTP 503'), { status: 503 }); return { id, name: '恢复了' }; });
  assert.equal(await t.wn.get('wrld_a'), '恢复了');
  assert.equal(t.calls.length, 2);
});

test('world: 网络错误就地重试 1 次后仍失败 → 进冷却并沿用旧名字', async () => {
  const t = harness();
  t.db.upsertWorldCache('wrld_a', '旧名字', t.state.t - 10 * HOUR);
  t.setImpl(failWith(-1));
  assert.equal(await t.wn.get('wrld_a'), '旧名字');
  assert.equal(t.calls.length, 2, '网络错误就地重试 1 次, 共 2 个请求');
  assert.deepEqual(t.sleeps, [500], '重试间隔 500ms');

  t.advance(5 * 60 * 1000 - 1);
  assert.equal(await t.wn.get('wrld_a'), '旧名字');
  assert.equal(t.calls.length, 2, '5 分钟冷却期内 0 请求');

  t.advance(2);
  assert.equal(await t.wn.get('wrld_a'), '旧名字');
  assert.equal(t.calls.length, 4, '到期后放行(同为抖动, 又是 2 次尝试)');
});

test('world: 网络错误且无旧名字 → 返回 null', async () => {
  const t = harness();
  t.setImpl(failWith(-1));
  assert.equal(await t.wn.get('wrld_a'), null);
  assert.match(t.warns().join('\n'), /暂无名字可用/);
});

// ---------- 429 ----------

test('world: 429 只发一个请求就返回, 不重试也不等待', async () => {
  const waits = [];
  const t = harness({
    // 防跑飞: 若实现退化成"无限退避重试", 这里会抛出而不是把整个测试文件挂死
    sleep: (ms) => {
      waits.push(ms);
      if (waits.length > 5) throw new Error('429 不该反复重试');
      return Promise.resolve();
    }
  });
  t.setImpl(failWith(429));
  const t0 = Date.now();
  assert.equal(await t.wn.get('wrld_rate'), null);
  assert.equal(t.calls.length, 1, '429 不做就地重试(它在说"别打了", 再打也不会好)');
  assert.deepEqual(waits, [], '完全不等待 —— 世界名是即时请求, 等一段时间再补没有意义');
  assert.ok(Date.now() - t0 < 50, '立即返回, 不拖住调用方');
  assert.match(t.warns()[0], /\[world\] 世界 wrld_rate 查询失败\(被限流, HTTP 429\), 暂无名字可用, 5 分钟后可重试/);
});

test('world: 429 也走同一套冷却退避(5 分钟起步, 1 小时封顶)', async () => {
  const waits = [];
  const t = harness({
    sleep: (ms) => {
      waits.push(ms);
      if (waits.length > 5) throw new Error('429 不该反复重试');
      return Promise.resolve();
    }
  });
  t.setImpl(failWith(429));
  await t.wn.get('wrld_rate');
  assert.equal(t.calls.length, 1);

  t.advance(5 * 60 * 1000 - 1);
  await t.wn.get('wrld_rate');
  assert.equal(t.calls.length, 1, '5 分钟内不再打');

  t.advance(2);
  await t.wn.get('wrld_rate');
  assert.equal(t.calls.length, 2, '5 分钟后放行一次');

  t.advance(10 * 60 * 1000 + 1);
  await t.wn.get('wrld_rate');
  assert.equal(t.calls.length, 3, '第二次失败后冷却翻倍到 10 分钟');
  t.advance(10 * 60 * 1000 - 1);
  await t.wn.get('wrld_rate');
  assert.equal(t.calls.length, 3, '没到 10 分钟不放行');
});

// ---------- 永不拒绝 ----------

test('world: fetchWorld 抛任意异常都不会让 get 拒绝', async () => {
  const t = harness();
  t.setImpl(async () => { throw new TypeError('boom'); });
  const r = await t.wn.get('wrld_x');
  assert.equal(r, null);
  assert.ok(t.errors().length + t.warns().length > 0, '至少有日志');
});

test('world: 返回体没有 name 字段按失败处理', async () => {
  const t = harness();
  t.db.upsertWorldCache('wrld_a', '旧名字', t.state.t - 10 * HOUR);
  t.setImpl(async (id) => ({ id }));
  assert.equal(await t.wn.get('wrld_a'), '旧名字');
  assert.equal(t.calls.length, 2, '缺 name 也走一次重试');
});

test('world: bus 订阅者抛异常不影响查询结果', async () => {
  const db = createDb(':memory:');
  const wn = createWorldName({
    db,
    fetchWorld: async (id) => ({ id, name: 'X' }),
    bus: { emit() { throw new Error('订阅者炸了'); } },
    config: { ratePerMinute: 0 }
  });
  assert.equal(await wn.get('wrld_a'), 'X');
});

test('world: 成功日志带耗时(含重试与退避的总时间)', async () => {
  const debugs = [];
  const t = harness({
    config: { retryDelayMs: 0 },
    logger: { debug: (m) => debugs.push(m), info() {}, warn() {}, error() {} }
  });
  let n = 0;
  t.setImpl(async (id) => {
    t.advance(300);
    n++;
    if (n === 1) throw Object.assign(new Error('fetch failed'), { status: -1 });
    return { id, name: '慢世界' };
  });
  await t.wn.get('wrld_slow');
  assert.equal(debugs.length, 1);
  assert.match(debugs[0], /世界名获取成功 worldId=wrld_slow name=慢世界 耗时=600ms/, '两次尝试各推进 300ms');
});

// ---------- 失败原因的日志分类 ----------

test('world: 日志按真实错误分类, 不把 429 说成网络错误', async () => {
  // 注意: 429 不再有"最终失败"这条路(不限次数重试), 所以不在此列
  const cases = [
    ['5xx', 503, /服务端错误, HTTP 503/],
    ['403', 403, /无权限访问, HTTP 403/],
    ['404', 404, /世界不存在, HTTP 404/],
    ['网络', -1, /网络错误/]
  ];
  for (const [label, status, want] of cases) {
    const warns = [];
    const db = createDb(':memory:');
    const wn = createWorldName({
      db,
      logger: { debug() {}, info() {}, warn: (m) => warns.push(m), error() {} },
      fetchWorld: async () => { throw Object.assign(new Error('boom'), { status }); },
      sleep: async () => {},
      config: { ratePerMinute: 0 }
    });
    await wn.get('wrld_x');
    const fallback = warns[warns.length - 1];
    assert.match(fallback, want, `${label}: 兜底日志应写明真实原因, 实际: ${fallback}`);
    assert.ok(!/网络或服务端错误/.test(warns.join('\n')), `${label}: 不应出现笼统的旧文案`);
  }
});

test('world: 返回体缺少 name 字段时日志写明是响应问题', async () => {
  const warns = [];
  const db = createDb(':memory:');
  const wn = createWorldName({
    db,
    logger: { debug() {}, info() {}, warn: (m) => warns.push(m), error() {} },
    fetchWorld: async () => ({ id: 'wrld_x' }),
    sleep: async () => {},
    config: { ratePerMinute: 0 }
  });
  await wn.get('wrld_x');
  assert.match(warns[warns.length - 1], /响应缺少名称字段/);
});

test('world: 重试日志的措辞与项目既有写法一致', async () => {
  const warns = [];
  const db = createDb(':memory:');
  const wn = createWorldName({
    db,
    logger: { debug() {}, info() {}, warn: (m) => warns.push(m), error() {} },
    fetchWorld: async () => { throw Object.assign(new Error('fetch failed'), { status: -1 }); },
    sleep: async () => {},
    config: { ratePerMinute: 0, retryDelayMs: 500 }
  });
  await wn.get('wrld_x');
  assert.equal(warns[0], '[world] 世界 wrld_x 查询失败(fetch failed), 500ms 后重试(第 1 次)');
});

// ---------- 调度 ----------

test('world: 并发上限生效', async () => {
  const t = harness({ config: { maxConcurrency: 3 } });
  const gates = []; // 每个在途请求配一个放行开关
  t.setImpl((id) => new Promise((r) => gates.push(() => r({ id, name: 'N_' + id }))));
  const jobs = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => t.wn.get('wrld_' + k));
  await new Promise((r) => setImmediate(r));
  assert.equal(gates.length, 3, '同时只在途 3 个');
  assert.equal(t.live.peak, 3);
  gates.splice(0).forEach((g) => g());
  await new Promise((r) => setImmediate(r));
  assert.equal(gates.length, 3, '放行后补上 3 个');
  gates.splice(0).forEach((g) => g());
  await Promise.all(jobs);
  assert.equal(t.calls.length, 6);
});

test('world: 每分钟速率上限生效', async () => {
  const t = harness({ config: { ratePerMinute: 2 } });
  const gates = [];
  t.setImpl((id) => new Promise((r) => gates.push(() => r({ id, name: 'N_' + id }))));
  const jobs = ['a', 'b', 'c'].map((k) => t.wn.get('wrld_' + k));
  await new Promise((r) => setImmediate(r));
  assert.equal(gates.length, 2, '速率上限 2/分钟, 第 3 个被挡住');
  gates.splice(0).forEach((g) => g());
  await new Promise((r) => setImmediate(r));
  assert.equal(gates.length, 0, '未到下一分钟, 第 3 个仍在排队');
  // 不等待真实计时器: 直接断言它确实还没发
  assert.equal(t.calls.length, 2);
  void jobs;
});
