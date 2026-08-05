const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { WebSocketServer } = require('ws');
const { buildApplication } = require('../src/index');

const silent = { info: () => {}, warn: () => {}, error: () => {} };

function startMockApi() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const send = (code, obj, headers = {}) => {
        res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(obj));
      };
      if (url.pathname === '/api/1/auth/user' && req.method === 'GET') {
        if (req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
          return send(200, { id: 'usr_me', displayName: 'SmokeUser', onlineFriends: [], offlineFriends: [], activeFriends: [] }, {
            'Set-Cookie': 'auth=smoke_auth; Path=/; HttpOnly'
          });
        }
        if ((req.headers.cookie || '').includes('auth=smoke_auth')) {
          return send(200, { id: 'usr_me', displayName: 'SmokeUser', onlineFriends: [], offlineFriends: [], activeFriends: [] });
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

function startWebhookReceiver() {
  return new Promise((resolve) => {
    const bodies = [];
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => {
        bodies.push({ method: req.method, url: req.url, body: data });
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, bodies, url: 'http://127.0.0.1:' + server.address().port }));
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

test('end-to-end: login → refresh → configure → ws event → webhook notification', async (t) => {
  const api = await startMockApi();
  const ws = await startMockWs();
  const hook = await startWebhookReceiver();

  const runtime = buildApplication({
    logger: silent,
    dbPath: ':memory:',
    apiBaseUrl: api.base + '/api/1',
    wsBaseUrl: ws.url
  });
  const server = runtime.app.listen(0);

  t.after(async () => {
    try { runtime.monitor.stopTimers(); } catch (e) { /* ignore */ }
    for (const { user } of runtime.monitor.activeUsers()) {
      try { runtime.monitor.deactivateUser(user.vrchat_user_id); } catch (e) { /* ignore */ }
    }
    await new Promise((r) => server.close(r));
    await new Promise((r) => api.server.close(r));
    await new Promise((r) => ws.wss.close(r));
    await new Promise((r) => hook.server.close(r));
  });

  const base = 'http://127.0.0.1:' + server.address().port;
  const json = (method, p, body) => fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

  // 1. 登录
  const login = await json('POST', '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(login.status, 200);
  assert.equal(login.data.ok, true);
  assert.equal(login.data.user.vrchat_user_id, 'usr_me');

  // 2. 刷新好友(缓存列表)
  const refresh = await json('POST', '/api/friends/refresh', {});
  assert.equal(refresh.status, 200);
  assert.ok(refresh.data.friends.some((f) => f.friend_vrchat_id === 'usr_f1'));

  // 3. 配置监控 + 开启 webhook 渠道
  const cfg = await json('PUT', '/api/friends/usr_f1/config', { monitorEnabled: true });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.config.monitor_enabled, 1);
  const settings = await json('PUT', '/api/settings', { webhook_enabled: true, webhook_url: hook.url });
  assert.equal(settings.status, 200);

  // 4. WS 事件 → 通知 → webhook 送达
  const got = await waitFor(() => (hook.bodies.length > 0 ? hook.bodies[0] : null), 8000);
  assert.ok(got, 'webhook 未在超时内收到通知');
  const payload = JSON.parse(got.body);
  assert.equal(payload.event, 'friend_online');
  assert.equal(payload.friend.name, '朋友1');
  assert.equal(payload.change.newStatus, '加入我');
  assert.ok(payload.change.newWorld.includes('世界B') || payload.change.newWorld.includes('wrld_b'));

  // 5. 静态 UI 可访问
  const ui = await fetch(base + '/');
  assert.equal(ui.status, 200);
  const html = await ui.text();
  assert.ok(html.includes('vrcnotifier'));
});

test('buildApplication starts periodic snapshot timer', async (t) => {
  const api = await startMockApi();
  const ws = await startMockWs();
  const runtime = buildApplication({
    logger: silent,
    dbPath: ':memory:',
    apiBaseUrl: api.base + '/api/1',
    wsBaseUrl: ws.url,
    snapshotIntervalMs: 100,
    watchdogCheckMs: 60000
  });
  const server = runtime.app.listen(0);

  t.after(async () => {
    try { runtime.monitor.stopTimers(); } catch (e) { /* ignore */ }
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
    headers: { 'Content-Type': 'application/json' },
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
