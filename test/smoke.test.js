const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { WebSocketServer } = require('ws');
const { buildApplication } = require('../src/index');
const { createDb } = require('../src/db');

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function startMockApi() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const send = (code, obj, headers = {}) => {
        res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(obj));
      };
      if (url.pathname === '/api/1/auth/user' && req.method === 'GET') {
        const me = { id: 'usr_me', displayName: 'SmokeUser', state: 'online', friends: ['usr_f1'], onlineFriends: [], offlineFriends: ['usr_f1'], activeFriends: [], presence: { world: 'wrld_b', instance: '2~region(us)', platform: 'web' } };
        if (req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
          return send(200, me, { 'Set-Cookie': 'auth=smoke_auth; Path=/; HttpOnly' });
        }
        if ((req.headers.cookie || '').includes('auth=smoke_auth')) {
          return send(200, me);
        }
        return send(401, { error: { message: 'Missing Credentials' } });
      }
      if (url.pathname === '/api/1/auth' && req.method === 'GET') {
        return send(200, { ok: true, token: 'authcookie_smoke' });
      }
      if (url.pathname === '/api/1/auth/user/friends' && req.method === 'GET') {
        const offline = url.searchParams.get('offline') === 'true';
        return send(200, offline ? [] : [
          { id: 'usr_f1', displayName: '朋友1', location: 'offline', status: 'active', platform: 'standalonewindows', currentAvatarImageUrl: null }
        ]);
      }
      if (url.pathname === '/api/1/users/usr_me' && req.method === 'GET') {
        return send(200, {
          id: 'usr_me', displayName: 'SmokeUser', state: 'online', status: 'active',
          statusDescription: null, location: 'wrld_b:2', last_platform: 'web',
          currentAvatarImageUrl: null
        });
      }
      if (url.pathname === '/api/1/config' && req.method === 'GET') {
        return send(200, { clientApiKey: 'mock' }, { 'x-vrc-api-server': 'mock-vrc' });
      }
      if (url.pathname === '/api/2/status.json' && req.method === 'GET') {
        return send(200, { status: { description: 'All Systems Operational', indicator: 'none' }, page: { updated_at: '2026-08-13T00:00:00Z' } });
      }
      if (url.pathname === '/api/2/summary.json' && req.method === 'GET') {
        return send(200, { components: [] });
      }
      if (url.pathname.startsWith('/api/1/worlds/')) {
        return send(200, { id: url.pathname.slice('/api/1/worlds/'.length), name: '世界B' });
      }
      return send(404, { error: { message: 'not found' } });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port }));
  });
}

function startMockWs() {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    wss.on('connection', (ws) => {
      // 模拟 VRChat pipeline: 连接后推送一个 friend-online 事件(双重编码 content)
      setTimeout(() => {
        if (ws.readyState !== 1) return;
        ws.send(JSON.stringify({
          type: 'friend-online',
          content: JSON.stringify({
            userId: 'usr_f1',
            location: 'wrld_b:2~region(us)',
            platform: 'standalonewindows',
            user: { id: 'usr_f1', displayName: '朋友1', status: 'join me', statusDescription: 'hello' }
          })
        }));
      }, 50);
    });
    wss.on('listening', () => resolve({ wss, url: 'ws://127.0.0.1:' + wss.address().port }));
  });
}


async function waitFor(check, timeoutMs = 8000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = check();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

test('end-to-end: login → configure → ws event → QQ notification', async (t) => {
  const api = await startMockApi();
  const ws = await startMockWs();
  // QQ 机器人管理器用 mock: 不连真实网关, 只验证 sendText 被调用
  const qq = {
    sent: [],
    sync: () => {},
    startAll: () => {},
    stopAll: () => {},
    stop: () => {},
    status: () => ({ configured: true }),
    sendText: async (dbId, text, opts) => { qq.sent.push({ dbId, text, opts }); return { ok: true }; }
  };

  const runtime = buildApplication({
    logger: silent,
    dbPath: ':memory:',
    apiBaseUrl: api.base + '/api/1',
    wsBaseUrl: ws.url,
    accessToken: 'smoke-token',
    vrcStatusUrl: api.base + '/api/2',
    qq
  });
  const server = runtime.app.listen(0);
  // 快照不再解析世界名: 预置缓存, 读接口从缓存补名字
  runtime.db.upsertWorldCache('wrld_b', '世界B', Date.now());

  t.after(async () => {
    try { runtime.monitor.stopTimers(); } catch (e) { /* ignore */ }
    try { runtime.healthMonitor.stop(); } catch (e) { /* ignore */ }
    for (const { user } of runtime.monitor.activeUsers()) {
      try { runtime.monitor.deactivateUser(user.vrchat_user_id); } catch (e) { /* ignore */ }
    }
    await new Promise((r) => server.close(r));
    await new Promise((r) => api.server.close(r));
    await new Promise((r) => ws.wss.close(r));
  });

  const base = 'http://127.0.0.1:' + server.address().port;
  const json = (method, p, body) => fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer smoke-token' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

  // 1. 登录
  const login = await json('POST', '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(login.status, 200);
  assert.equal(login.data.ok, true);
  assert.equal(login.data.user.vrchat_user_id, 'usr_me');
  assert.equal(login.data.user.state, 'online', 'me() presence 解析自己的信息并入首屏');
  assert.equal(login.data.user.world_name, '世界B');
  let health = null;
  for (let i = 0; i < 50 && !health; i++) {
    const r = await json('GET', '/api/health');
    if (r.data && r.data.status === 'ok') health = r.data;
    else await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(health, '/health 持续探测应返回 ok');
  assert.equal(typeof health.latencyMs, 'number');
  const vrcStatus = await json('GET', '/api/vrc-status');
  assert.equal(vrcStatus.status, 200);
  assert.equal(vrcStatus.data.state, 'normal');

  // 3. 配置监控 + 开启 QQ 渠道
  const cfg = await json('PUT', '/api/friends/usr_f1/config', { favorite: true });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.config.favorite, 1);
  const settings = await json('PUT', '/api/settings', { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
  assert.equal(settings.status, 200);

  // 4. WS 事件 → 通知 → QQ 送达
  const got = await waitFor(() => (qq.sent.find((m) => m.text.includes('朋友1')) || null), 8000);
  assert.ok(got, 'QQ 未在超时内收到好友通知');
  assert.ok(got.text.includes('# 朋友1上线'), '标题为 # 昵称事件, 实际: ' + JSON.stringify(got.text));
  assert.ok(got.text.includes('🔵 hello'), '社交行带状态 emoji + 自定义状态');
  assert.ok(got.text.includes('世界B') || got.text.includes('wrld_b'));
  assert.deepEqual(got.opts, { markdown: true });

  // 5. 后端不再托管静态页面(前端由独立进程 serve.js 提供)
  const ui = await fetch(base + '/');
  assert.equal(ui.status, 404);
});

test('buildApplication starts periodic snapshot timer', async (t) => {
  const api = await startMockApi();
  const ws = await startMockWs();
  const runtime = buildApplication({
    logger: silent,
    dbPath: ':memory:',
    apiBaseUrl: api.base + '/api/1',
    wsBaseUrl: ws.url,
    accessToken: 'smoke-token',
    snapshotIntervalMs: 100,
    watchdogCheckMs: 60000
  });
  const server = runtime.app.listen(0);

  t.after(async () => {
    try { runtime.monitor.stopTimers(); } catch (e) { /* ignore */ }
    try { runtime.healthMonitor.stop(); } catch (e) { /* ignore */ }
    for (const { user } of runtime.monitor.activeUsers()) {
      try { runtime.monitor.deactivateUser(user.vrchat_user_id); } catch (e) { /* ignore */ }
    }
    await new Promise((r) => server.close(r));
    await new Promise((r) => api.server.close(r));
    await new Promise((r) => ws.wss.close(r));
  });

  let snapshots = 0;
  runtime.bus.on('snapshot', () => { snapshots++; });
  const base = 'http://127.0.0.1:' + server.address().port;
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer smoke-token' },
    body: JSON.stringify({ username: 'me', password: 'pw', rememberMe: false })
  });
  assert.equal((await res.json()).ok, true);
  // activateUser 触发 1 次快照; 周期定时器(100ms)应再触发至少 1 次
  const got = await waitFor(() => (snapshots >= 2 ? snapshots : null), 3000, 50);
  assert.ok(got, '周期快照定时器未启动');
});

test('buildApplication default ws reconnectMaxMs is 1 hour', () => {
  const runtime = buildApplication({
    logger: silent,
    dbPath: ':memory:',
    apiBaseUrl: 'http://127.0.0.1:1/api/1',
    wsBaseUrl: 'ws://127.0.0.1:1'
  });
  try {
    assert.equal(runtime.config.ws.reconnectMaxMs, 3600000);
  } finally {
    try { runtime.monitor.stopTimers(); } catch (e) { /* ignore */ }
  }
});

test('frontend server serves public dir as standalone process', async (t) => {
  const path = require('node:path');
  const { createFrontendServer } = require('../serve');
  const server = createFrontendServer({
    root: path.join(__dirname, '..', 'public'),
    logger: silent
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;

  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(html.includes('vrcnotifier'));
  assert.ok(html.includes(id='connectBtn'));
  assert.ok(html.includes("id='wsChart'"), '概览包含 WS 消息图表');
  assert.ok(html.includes("id='stHealth'"), '概览包含 VRChat 延迟');

  const missing = await fetch(base + '/nope.js');
  assert.equal(missing.status, 404);

  const escape = await fetch(base + '/..%2F..%2Fpackage.json');
  assert.notEqual(escape.status, 200);
});

test('access token auth: 401 without token, whitelist open, SSE via query token, CORS preflight', async (t) => {
  const api = await startMockApi();
  const ws = await startMockWs();
  const runtime = buildApplication({
    logger: silent,
    dbPath: ':memory:',
    apiBaseUrl: api.base + '/api/1',
    wsBaseUrl: ws.url,
    accessToken: 'smoke-token'
  });
  const server = runtime.app.listen(0);

  t.after(async () => {
    try { runtime.monitor.stopTimers(); } catch (e) { /* ignore */ }
    await new Promise((r) => server.close(r));
    await new Promise((r) => api.server.close(r));
    await new Promise((r) => ws.wss.close(r));
  });

  const base = 'http://127.0.0.1:' + server.address().port;

  // 未带 token -> 401
  const noAuth = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'me', password: 'pw' })
  });
  assert.equal(noAuth.status, 401);

  // 白名单: /api/config 与 /api/access/verify 无需 token
  const cfg = await fetch(base + '/api/config');
  assert.equal(cfg.status, 200);
  const cfgData = await cfg.json();
  assert.equal(cfgData.tokenRequired, true);
  const badVerify = await fetch(base + '/api/access/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'wrong' })
  });
  assert.equal((await badVerify.json()).ok, false);
  const goodVerify = await fetch(base + '/api/access/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'smoke-token' })
  });
  assert.equal((await goodVerify.json()).ok, true);

  // query token 可连 SSE, 错误 token 被拒
  const badSse = await fetch(base + '/api/events?token=wrong');
  assert.equal(badSse.status, 401);
  const sse = await fetch(base + '/api/events?token=smoke-token');
  assert.equal(sse.status, 200);

  // CORS 预检
  const preflight = await fetch(base + '/api/friends', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://127.0.0.1:9999',
      'Access-Control-Request-Method': 'GET'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');

  await sse.body.getReader().cancel();
});

// ---------- 数据被清空 / 表被删掉之后重启(只用临时库, 不碰 data/vrcnotifier.db) ----------

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-restart-'));
  return { dir, dbPath: path.join(dir, 'vrcnotifier.db') };
}

// 造一个"什么都有"的库
function seedDb(dbPath) {
  const db = createDb(dbPath);
  const uid = db.upsertUser('usr_me', { username: 'me', displayName: '我' });
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F1', state: 'online' });
  db.setFriendConfig(uid, 'usr_f1', { favorite: true, notifyOnline: true });
  db.upsertQqBinding({ appId: 'app1', openid: 'openid_keep', nickname: '小明', at: 7 });
  db.updateGlobalSettings({ qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec', notify_boop: 1 });
  db.setSetting('access_token', 'tok-keep');
  db.upsertWorldCache('wrld_a', '世界A');
  db.close();
}

// 起一次完整应用, 用完关掉(返回 runtime 供断言)
function restartOn(dbPath, t) {
  const runtime = buildApplication({ logger: silent, dbPath, accessToken: 'tok-keep' });
  t.after(() => {
    try { runtime.monitor.stopTimers(); } catch (e) { /* ignore */ }
    try { runtime.avatarCache.stopTimers(); } catch (e) { /* ignore */ }
    try { runtime.healthMonitor.stop(); } catch (e) { /* ignore */ }
  });
  return runtime;
}

test('数据被清到只剩设置(QQ 配置 + 登录凭据)后, 重启仍能正常工作', async (t) => {
  const { dir, dbPath } = tmpDb();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } });
  seedDb(dbPath);

  // 只清数据表, settings 原样保留
  const raw = new DatabaseSync(dbPath);
  for (const tbl of ['users', 'friends', 'qq_bindings', 'notif_dedupe', 'world_cache', 'group_cache']) {
    raw.exec('DELETE FROM ' + tbl);
  }
  raw.close();

  const runtime = restartOn(dbPath, t);
  const server = runtime.app.listen(0);
  t.after(() => new Promise((r) => server.close(r)));

  assert.equal(runtime.db.getSetting('access_token'), 'tok-keep', '登录凭据还在');
  assert.equal(runtime.db.getGlobalSettings().qq_app_id, 'app1', 'QQ 设置还在');
  assert.equal(runtime.db.getGlobalSettings().notify_boop, 1, '全局通知设置还在');
  assert.equal(runtime.db.getQqBinding('app1'), null, 'QQ 绑定属于数据, 已随表清掉');
  assert.equal(runtime.db.listUsers().length, 0, '用户已清空');
  assert.equal(runtime.db.listFriends(1).length, 0, '好友已清空');

  // schema 是新形状: 配置列在 friends 上, monitor_config 已经不存在
  const chk = new DatabaseSync(dbPath, { readOnly: true });
  const friendCols = chk.prepare('PRAGMA table_info(friends)').all().map((c) => c.name);
  const tables = chk.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  chk.close();
  assert.ok(friendCols.includes('favorite'), 'friends 带配置列');
  assert.ok(friendCols.includes('notify_world_change'), 'friends 带通知开关列');
  assert.ok(!tables.includes('monitor_config'), 'monitor_config 表已不存在');

  const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/config');
  assert.equal(r.status, 200, '重启后 HTTP 服务可用');
});

test('数据表被整个删掉后, 重启会重建 schema 并继续可用', async (t) => {
  const { dir, dbPath } = tmpDb();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } });
  seedDb(dbPath);

  const raw = new DatabaseSync(dbPath);
  for (const tbl of ['users', 'friends', 'qq_bindings', 'notif_dedupe', 'world_cache', 'group_cache']) {
    raw.exec('DROP TABLE ' + tbl);
  }
  raw.close();

  const runtime = restartOn(dbPath, t);

  assert.equal(runtime.db.getSetting('access_token'), 'tok-keep', '登录凭据还在');
  assert.equal(runtime.db.getGlobalSettings().qq_app_id, 'app1', 'QQ 设置还在');
  assert.equal(runtime.db.listUsers().length, 0);

  // 重建出来的表可正常读写
  const uid = runtime.db.upsertUser('usr_new', { username: 'n', displayName: 'N' });
  runtime.db.upsertFriend(uid, 'usr_n1', { displayName: 'N1', state: 'online' });
  runtime.db.setFriendConfig(uid, 'usr_n1', { notifyOnline: true });
  assert.equal(runtime.db.getFriend(uid, 'usr_n1').notify_online, 1, '重建后好友配置可写可读');
  runtime.db.upsertQqBinding({ appId: 'app2', openid: 'o2', nickname: 'n2', at: 9 });
  assert.equal(runtime.db.getQqBinding('app2').openid, 'o2', '重建后 QQ 绑定可写可读');
});
