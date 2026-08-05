const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { createDb } = require('../src/db');
const { createMonitor } = require('../src/monitor');
const { CookieJar } = require('../src/cookiejar');
const { createApp } = require('../src/server');

const silent = { info: () => {}, warn: () => {}, error: () => {} };

function setup(opts = {}) {
  const db = createDb(':memory:');
  const bus = new EventEmitter();
  const notifications = [];
  const vrcapi = {
    jar: opts.jar || new CookieJar(),
    login: async (username, password) => (opts.loginResult !== undefined ? opts.loginResult : { id: 'usr_me', displayName: '我', currentAvatarImageUrl: null }),
    verify2fa: async (kind, code) => { vrcapi.verifyCalls = vrcapi.verifyCalls || []; vrcapi.verifyCalls.push({ kind, code }); return { verified: true }; },
    me: async () => (opts.currentUser !== undefined ? opts.currentUser : { id: 'usr_me', displayName: '我', onlineFriends: [], activeFriends: [], offlineFriends: [] }),
    authToken: async () => ({ token: 'authcookie_test' }),
    friends: async ({ offline }) => (offline ? (opts.offlineFriends || []) : (opts.onlineFriends || [])),
    world: async (id) => ({ id, name: '世界_' + id })
  };
  const pipeline = {
    connects: [], disconnects: [], reconnects: 0,
    connect: (uid, name) => pipeline.connects.push({ uid, name }),
    disconnect: (uid) => pipeline.disconnects.push(uid),
    forceReconnect: () => { pipeline.reconnects++; },
    isConnected: () => opts.connected ?? false,
    lastMessageAt: () => opts.lastMessageAt ?? 0,
    status: () => ({ connected: opts.connected ?? false, lastMessageAt: opts.lastMessageAt ?? 0 })
  };
  const notifier = {
    sendAll: async (user, change) => { notifications.push({ user, change }); return { email: { ok: true } }; },
    sendTest: async (user, kind) => ({ ok: true, kind, user: user.smtp_pass })
  };
  const monitor = createMonitor({
    db, notifier, pipeline, bus,
    logger: opts.logger || silent,
    now: opts.now || (() => 1000000),
    config: { confirmDelayMs: 30000, dedupeWindowMs: 30000, snapshotIntervalMs: 600000, watchdogMs: 600000 }
  });
  const sessionStore = new Map();
  const { app, autoLogin } = createApp({
    db, notifier, pipeline, monitor, sessionStore,
    vrcapiFactory: (jar) => (jar ? { ...vrcapi, jar } : vrcapi),
    config: { accessKey: opts.accessKey || null, confirmDelayMs: 30000, dedupeWindowMs: 30000, snapshotIntervalMs: 600000, watchdogMs: 600000 },
    logger: opts.logger || silent,
    now: opts.now || (() => 1000000),
    publicDir: null
  });
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  return { db, bus, vrcapi, pipeline, notifier, monitor, sessionStore, app, autoLogin, server, base, notifications };
}

async function close(t) { await new Promise((r) => t.server.close(r)); }

async function post(t, path, body) {
  const res = await fetch(t.base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return { status: res.status, data: await res.json() };
}

async function get(t, path) {
  const res = await fetch(t.base + path);
  return { status: res.status, data: await res.json() };
}

async function put(t, path, body) {
  const res = await fetch(t.base + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return { status: res.status, data: await res.json() };
}

test('config endpoint exposes app config and access key requirement', async (t) => {
  const ctx = setup({ accessKey: 'secret123' });
  t.after(() => close(ctx));
  const { status, data } = await get(ctx, '/api/config');
  assert.equal(status, 200);
  assert.equal(data.accessKeyRequired, true);
  assert.ok(data.watchdogMs > 0);
  // 访问密钥校验
  const bad = await post(ctx, '/api/access/verify', { key: 'wrong' });
  assert.equal(bad.data.ok, false);
  const good = await post(ctx, '/api/access/verify', { key: 'secret123' });
  assert.equal(good.data.ok, true);
});

test('login without 2FA activates monitor and returns masked user', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  const r = await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.user.vrchat_user_id, 'usr_me');
  assert.equal(ctx.pipeline.connects.length, 1);
  assert.equal(ctx.sessionStore.has('usr_me'), true);
  // 记住我: cookie 明文落库
  const row = ctx.db.getUserByVrcId('usr_me');
  assert.equal(row.cookie_data, ctx.vrcapi.jar.serialize());
  assert.ok(row.remember_me === 1);
  const s = await get(ctx, '/api/session');
  assert.equal(s.data.loggedIn, true);
  assert.equal(s.data.user.display_name, '我');
});

test('login with 2FA: temp session then verify code completes login', async (t) => {
  const ctx = setup({ loginResult: { requiresTwoFactorAuth: ['totp', 'emailOtp'] } });
  t.after(() => close(ctx));
  const r = await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.ok(r.data.requiresTwoFactorAuth.includes('totp'));
  const tempId = r.data.tempSessionId;
  assert.ok(tempId);
  const v = await post(ctx, '/api/login/2fa', { tempSessionId: tempId, code: '123456', kind: 'emailOtp' });
  assert.equal(v.status, 200);
  assert.equal(v.data.ok, true);
  assert.equal(v.data.user.vrchat_user_id, 'usr_me');
  assert.deepEqual(ctx.vrcapi.verifyCalls, [{ kind: 'emailotp', code: '123456' }]);
  assert.equal(ctx.pipeline.connects.length, 1);
  // 重复使用 tempSessionId 失效
  const again = await post(ctx, '/api/login/2fa', { tempSessionId: tempId, code: '000000', kind: 'emailOtp' });
  assert.equal(again.status, 400);
});

test('logout deactivates session and clears saved cookies', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  const r = await post(ctx, '/api/logout', {});
  assert.equal(r.data.ok, true);
  assert.equal(ctx.pipeline.disconnects.length, 1);
  assert.equal(ctx.sessionStore.size, 0);
  const row = ctx.db.getUserByVrcId('usr_me');
  assert.equal(row.cookie_data, null);
  assert.equal(row.remember_me, 0);
  const s = await get(ctx, '/api/session');
  assert.equal(s.data.loggedIn, false);
});

test('saved session auto-restores on fresh app instance (GET /api/session)', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  // 模拟进程重启: 同一 db, 新 app/新 server
  const bus = new EventEmitter();
  const vrcapi2 = {
    jar: new CookieJar(),
    me: async () => ctx.vrcapi.me(),
    authToken: async () => ({ token: 'authcookie_test' }),
    friends: async () => [],
    world: async () => ({}),
    login: async () => ({}),
    verify2fa: async () => ({})
  };
  const notifier2 = { sendAll: async () => ({}), sendTest: async () => ({}) };
  const pipeline2 = { connect: () => {}, disconnect: () => {}, forceReconnect: () => {}, isConnected: () => true, lastMessageAt: () => Date.now(), status: () => ({ connected: true }) };
  const monitor2 = createMonitor({ db: ctx.db, notifier: notifier2, pipeline: pipeline2, bus, logger: silent, now: ctx.monitor.now || (() => 1000000), config: {} });
  const store2 = new Map();
  const { app: app2 } = createApp({
    db: ctx.db, notifier: notifier2, pipeline: pipeline2, monitor: monitor2, sessionStore: store2,
    vrcapiFactory: () => vrcapi2, config: {}, logger: silent, now: () => 1000000, publicDir: null
  });
  const server2 = app2.listen(0);
  t.after(() => new Promise((r) => server2.close(r)));
  const base2 = 'http://127.0.0.1:' + server2.address().port;
  const res = await fetch(base2 + '/api/session');
  const data = await res.json();
  assert.equal(data.loggedIn, true);
  assert.equal(data.user.vrchat_user_id, 'usr_me');
});

test('friends list merges friend rows with monitor config', async (t) => {
  const ctx = setup({ onlineFriends: [{ id: 'usr_f1', displayName: '朋友1', location: 'wrld_a:1', status: 'active' }] });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await get(ctx, '/api/friends');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.friends));
  assert.ok(r.data.friends.length >= 1);
  const f1 = r.data.friends.find((f) => f.friend_vrchat_id === 'usr_f1');
  assert.ok(f1);
  // 配置默认未启用
  assert.equal(f1.config, null);
});

test('PUT friend config persists and reflects in list', async (t) => {
  const ctx = setup({ onlineFriends: [{ id: 'usr_f1', displayName: '朋友1', location: 'wrld_a:1', status: 'active' }] });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await put(ctx, '/api/friends/usr_f1/config', { monitorEnabled: true, notifyOnline: true, notifyOffline: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.config.monitor_enabled, 1);
  const list = await get(ctx, '/api/friends');
  const f1 = list.data.friends.find((f) => f.friend_vrchat_id === 'usr_f1');
  assert.equal(f1.config.monitor_enabled, 1);
  assert.equal(f1.config.notify_offline, 0);
});

test('friends refresh refetches and caches friend rows', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  let calls = 0;
  const orig = ctx.vrcapi.friends;
  ctx.vrcapi.friends = async () => { calls++; return [{ id: 'usr_new', displayName: '新朋友', location: 'offline', status: 'active' }]; };
  const r = await post(ctx, '/api/friends/refresh', {});
  assert.equal(r.status, 200);
  assert.equal(calls >= 2, true); // 在线+离线
  const row = ctx.db.getFriend(ctx.db.getUserByVrcId('usr_me').id, 'usr_new');
  assert.ok(row);
  assert.equal(row.state, 'offline');
});

test('settings get masks secrets, put stores plaintext', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await put(ctx, '/api/settings', { email: 'a@b.c', smtp_host: 'smtp.x', smtp_user: 'uu', smtp_pass: 'secret123', gotify_enabled: true, gotify_app_token: 'tok', status_only_mode: true });
  assert.equal(r.status, 200);
  const row = ctx.db.getUserByVrcId('usr_me');
  assert.equal(row.smtp_pass, 'secret123');
  assert.equal(row.gotify_app_token, 'tok');
  assert.equal(row.status_only_mode, 1);
  const g = await get(ctx, '/api/settings');
  assert.equal(g.data.settings.email, 'a@b.c');
  assert.notEqual(g.data.settings.smtp_pass, 'secret123');
  assert.ok(g.data.settings.smtp_pass); // 已配置(掩码)
  // 掩码占位符再次提交不清空
  await put(ctx, '/api/settings', { smtp_pass: g.data.settings.smtp_pass });
  assert.equal(ctx.db.getUserByVrcId('usr_me').smtp_pass, 'secret123');
});

test('test notification endpoint calls notifier with stored secrets', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  await put(ctx, '/api/settings', { smtp_pass: 'secret123', email: 'a@b.c' });
  const r = await post(ctx, '/api/test/email', {});
  assert.equal(r.status, 200);
  assert.equal(r.data.result.ok, true);
  assert.equal(r.data.result.user, 'secret123');
});

test('status endpoint reports connection and snapshot info', async (t) => {
  const ctx = setup({ connected: true, lastMessageAt: 5000 });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await get(ctx, '/api/status');
  assert.equal(r.status, 200);
  assert.equal(r.data.loggedIn, true);
  assert.equal(r.data.wsConnected, true);
  assert.equal(r.data.lastSnapshotAt, 1000000); // activateUser 触发快照
  assert.ok(r.data.config.watchdogMs > 0);
});

test('POST monitor snapshot triggers reconciliation and updates lastSnapshotAt', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await post(ctx, '/api/monitor/snapshot', {});
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.lastSnapshotAt, 1000000);
});

test('POST monitor snapshot reports failure when API call fails', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  ctx.vrcapi.me = async () => { throw Object.assign(new Error('network down'), { status: -1 }); };
  const r = await post(ctx, '/api/monitor/snapshot', {});
  assert.equal(r.status, 502);
  assert.ok(r.data.error && r.data.error.includes('network down'));
});

test('refresh and manual snapshot emit success logs', async (t) => {
  const logs = [];
  const logger = { info: (...a) => logs.push(['info', ...a]), warn: () => {}, error: (...a) => logs.push(['error', ...a]) };
  const ctx = setup({ onlineFriends: [{ id: 'usr_f1', displayName: 'F1', location: 'offline', status: 'active' }], logger });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  logs.length = 0;
  const r = await post(ctx, '/api/friends/refresh', {});
  assert.equal(r.status, 200);
  const info = logs.filter((l) => l[0] === 'info').map((l) => l.slice(1).join(' ')).join('\n');
  assert.ok(info.includes('刷新好友成功'));
  assert.ok(info.includes('共 1 人'));
  logs.length = 0;
  const s = await post(ctx, '/api/monitor/snapshot', {});
  assert.equal(s.status, 200);
  const info2 = logs.filter((l) => l[0] === 'info').map((l) => l.slice(1).join(' ')).join('\n');
  assert.ok(info2.includes('手动对账完成'));
});

test('frontend operations emit logs: config switch, settings, test', async (t) => {
  const logs = [];
  const logger = { info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) };
  const ctx = setup({ onlineFriends: [{ id: 'usr_f1', displayName: 'F1', location: 'offline', status: 'active' }], logger });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  logs.length = 0;
  const c = await put(ctx, '/api/friends/usr_f1/config', { monitorEnabled: true });
  assert.equal(c.status, 200);
  const st = await put(ctx, '/api/settings', { email: 'a@b.c', smtp_pass: 'secret123' });
  assert.equal(st.status, 200);
  const tt = await post(ctx, '/api/test/email', {});
  assert.equal(tt.status, 200);
  const info = logs.filter((l) => l[0] === 'info').map((l) => l.slice(1).join(' ')).join('\n');
  assert.ok(info.includes('更新监控配置'));
  assert.ok(info.includes('好友=F1'));
  assert.ok(info.includes('监控=开'));
  assert.ok(info.includes('更新通知设置'));
  assert.ok(info.includes('发送测试通知'));
  assert.ok(info.includes('测试通知发送成功'));
  assert.ok(!info.includes('secret123'), 'smtp_pass 不应以明文出现在日志');
});

test('test notification failure returns 502 and logs error', async (t) => {
  const logs = [];
  const logger = { info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) };
  const ctx = setup({ logger });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  ctx.notifier.sendTest = async (user, kind) => ({ ok: false, reason: 'smtp connection failed' });
  logs.length = 0;
  const tt = await post(ctx, '/api/test/email', {});
  assert.equal(tt.status, 502);
  assert.equal(tt.data.ok, false);
  assert.ok(tt.data.error.includes('smtp'));
  const err = logs.filter((l) => l[0] === 'error').map((l) => l.slice(1).join(' ')).join('\n');
  assert.ok(err.includes('测试通知发送失败(email)'));
  const info = logs.filter((l) => l[0] === 'info').map((l) => l.slice(1).join(' ')).join('\n');
  assert.ok(!info.includes('测试通知发送成功'));
});

test('SSE stream receives notification events', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const ac = new AbortController();
  t.after(() => ac.abort());
  const res = await fetch(ctx.base + '/api/events', { signal: ac.signal });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const readUntil = async (needle, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    let buf = '';
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes(needle)) return buf;
    }
    return buf;
  };
  ctx.bus.emit('notification', { userId: 'usr_me', friendName: 'F1', changeType: '上线', results: {} });
  const buf = await readUntil('notification');
  assert.ok(buf.includes('上线'));
  ac.abort();
});
