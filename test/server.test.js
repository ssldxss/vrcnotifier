const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDb } = require('../src/db');
const { createMonitor } = require('../src/monitor');
const { CookieJar } = require('../src/cookiejar');
const { createAvatarCache } = require('../src/avatar');
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
    setCookiesChanged: (fn) => { vrcapi._cookiesChanged = fn; },
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
  const avatarCalls = { n: 0 };
  const avatarCache = createAvatarCache({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-av-')),
    logger: silent,
    fetchImpl: opts.avatarFetch || (async () => {
      avatarCalls.n++;
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('AVATARPNG')]);
      return { status: 200, headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'image/png' : '') }, arrayBuffer: async () => png };
    })
  });
  const { app, autoLogin } = createApp({
    db, notifier, pipeline, monitor, sessionStore,
    vrcapiFactory: (jar) => (jar ? { ...vrcapi, jar } : vrcapi),
    avatarCache,
    config: { accessToken: opts.accessToken || null, confirmDelayMs: 30000, dedupeWindowMs: 30000, snapshotIntervalMs: 600000, watchdogMs: 600000, autoLoginRetryBaseMs: opts.autoLoginRetryBaseMs ?? 5000, autoLoginRetryMaxMs: opts.autoLoginRetryMaxMs ?? 3600000, autoLoginRetryJitterMs: opts.autoLoginRetryJitterMs ?? 1000 },
    logger: opts.logger || silent,
    now: opts.now || (() => 1000000),
    publicDir: null
  });
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  return { db, bus, vrcapi, pipeline, notifier, monitor, sessionStore, app, autoLogin, server, base, notifications, avatarCache, avatarCalls, accessToken: opts.accessToken || null };
}

async function close(t) { await new Promise((r) => t.server.close(r)); }

function authHeaders(t) {
  return t.accessToken ? { 'Authorization': 'Bearer ' + t.accessToken } : {};
}

async function post(t, path, body) {
  const res = await fetch(t.base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(t) },
    body: JSON.stringify(body || {})
  });
  return { status: res.status, data: await res.json() };
}

async function get(t, path) {
  const res = await fetch(t.base + path, { headers: authHeaders(t) });
  return { status: res.status, data: await res.json() };
}

async function put(t, path, body) {
  const res = await fetch(t.base + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(t) },
    body: JSON.stringify(body || {})
  });
  return { status: res.status, data: await res.json() };
}


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test('config endpoint exposes app config and access key requirement', async (t) => {
  const ctx = setup({ accessToken: 'secret123' });
  t.after(() => close(ctx));
  const { status, data } = await get(ctx, '/api/config');
  assert.equal(status, 200);
  assert.equal(data.tokenRequired, true);
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
test('logout stays effective when a debounced cookie save is pending', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  // 模拟 API 响应轮换 cookie: 触发防抖持久化定时器
  if (ctx.vrcapi._cookiesChanged) ctx.vrcapi._cookiesChanged(ctx.vrcapi.jar);
  await post(ctx, '/api/logout', {});
  await sleep(2500);
  const row = ctx.db.getUserByVrcId('usr_me');
  assert.equal(row.cookie_data, null, '登出后不应被防抖定时器写回');
  assert.equal(row.remember_me, 0);
});

test('login with rememberMe=false clears previously saved cookies', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  const row1 = ctx.db.getUserByVrcId('usr_me');
  assert.ok(row1.cookie_data);
  assert.equal(row1.remember_me, 1);
  // 同一账号再次登录但不勾选记住我
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  const row2 = ctx.db.getUserByVrcId('usr_me');
  assert.equal(row2.cookie_data, null, '不记住我时应清除已存 cookie');
  assert.equal(row2.remember_me, 0);
  assert.equal(ctx.db.getSavedLogin(), null);
});

test('saving cookies for another user replaces the previous saved cookie', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  // 换一个账号登录
  ctx.vrcapi.login = async () => ({ id: 'usr_B', displayName: 'B', currentAvatarImageUrl: null });
  await post(ctx, '/api/login', { username: 'other', password: 'pw', rememberMe: true });
  const a = ctx.db.getUserByVrcId('usr_me');
  assert.equal(a.cookie_data, null);
  assert.equal(a.remember_me, 0);
  const b = ctx.db.getUserByVrcId('usr_B');
  assert.ok(b.cookie_data);
  assert.equal(b.remember_me, 1);
  assert.equal(ctx.db.getSavedLogin().vrchat_user_id, 'usr_B');
});

test('switching login cancels the old session debounced cookie save', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  // simulate an in-flight API response swapping cookies on the old session
  if (ctx.vrcapi._cookiesChanged) ctx.vrcapi._cookiesChanged(ctx.vrcapi.jar);
  ctx.vrcapi.login = async () => ({ id: 'usr_B', displayName: 'B', currentAvatarImageUrl: null });
  await post(ctx, '/api/login', { username: 'other', password: 'pw', rememberMe: true });
  await sleep(2500);
  const saved = ctx.db.getSavedLogin();
  assert.ok(saved, 'a saved login must exist');
  assert.equal(saved.vrchat_user_id, 'usr_B', 'old session debounce must not overwrite the new user');
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

test('friends refresh keeps world name when world unchanged and uses thumb url directly', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const uid = ctx.db.getUserByVrcId('usr_me').id;
  ctx.db.upsertFriend(uid, 'usr_f1', { displayName: 'F1', state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'WorldA', platform: 'standalonewindows' });
  ctx.vrcapi.friends = async () => [{ id: 'usr_f1', displayName: 'F1', location: 'wrld_a:1~region(us)', status: 'active', currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/file/file_a/1/file', currentAvatarThumbnailImageUrl: 'https://api.vrchat.cloud/api/1/image/file_a/1/256' }];
  const r = await post(ctx, '/api/friends/refresh', {});
  assert.equal(r.status, 200);
  const row = ctx.db.getFriend(uid, 'usr_f1');
  assert.equal(row.world_id, 'wrld_a');
  assert.equal(row.world_name, 'WorldA');
  assert.equal(row.avatar_thumb_url, 'https://api.vrchat.cloud/api/1/image/file_a/1/256');
  // world changed -> name cleared, next snapshot will resolve
  ctx.vrcapi.friends = async () => [{ id: 'usr_f1', displayName: 'F1', location: 'wrld_b:1~region(jp)', status: 'active' }];
  await post(ctx, '/api/friends/refresh', {});
  const row2 = ctx.db.getFriend(uid, 'usr_f1');
  assert.equal(row2.world_id, 'wrld_b');
  assert.equal(row2.world_name, null);
});

test('friends refresh writes private world for private location', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const uid = ctx.db.getUserByVrcId('usr_me').id;
  ctx.vrcapi.friends = async () => [{ id: 'usr_f1', displayName: 'F1', location: 'private', status: 'active' }];
  await post(ctx, '/api/friends/refresh', {});
  const row = ctx.db.getFriend(uid, 'usr_f1');
  assert.equal(row.state, 'online');
  assert.equal(row.world_id, 'private');
  assert.equal(row.world_name, '私密世界');
});

test('settings get masks secrets, put stores plaintext', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await put(ctx, '/api/settings', { email: 'a@b.c', smtp_host: 'smtp.x', smtp_user: 'uu', smtp_pass: 'secret123', gotify_enabled: true, gotify_app_token: 'tok' });
  assert.equal(r.status, 200);
  const row = ctx.db.getGlobalSettings();
  assert.equal(row.smtp_pass, 'secret123');
  assert.equal(row.gotify_app_token, 'tok');
  const g = await get(ctx, '/api/settings');
  assert.equal(g.data.settings.email, 'a@b.c');
  assert.notEqual(g.data.settings.smtp_pass, 'secret123');
  assert.ok(g.data.settings.smtp_pass); // 已配置(掩码)
  // 掩码占位符再次提交不清空
  await put(ctx, '/api/settings', { smtp_pass: g.data.settings.smtp_pass });
  assert.equal(ctx.db.getGlobalSettings().smtp_pass, 'secret123');
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

test('avatar endpoint: 401 / whitelist / download / cache hit / immutable', async (t) => {
  const thumb = 'https://api.vrchat.cloud/api/1/image/file_aaa-111/1/256';
  const ctx = setup({
    onlineFriends: [{
      id: 'usr_f1', displayName: 'F1', location: 'wrld_a:1', status: 'active', platform: 'x',
      currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/file/file_aaa-111/1/file',
      currentAvatarThumbnailImageUrl: thumb
    }]
  });
  t.after(() => close(ctx));
  // 未登录 -> 401
  let r = await fetch(ctx.base + '/api/avatar/file_aaa-111_1_256');
  assert.equal(r.status, 401);
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  // key 不在白名单 -> 404
  r = await fetch(ctx.base + '/api/avatar/evil_key');
  assert.equal(r.status, 404);
  // /api/friends 带 avatarKey
  const fl = await get(ctx, '/api/friends');
  const f1 = fl.data.friends.find((f) => f.friend_vrchat_id === 'usr_f1');
  assert.equal(f1.avatarKey, 'file_aaa-111_1_256');
  // 首次: 下载并返回
  r = await fetch(ctx.base + '/api/avatar/file_aaa-111_1_256');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.ok((r.headers.get('cache-control') || '').includes('immutable'));
  assert.ok((await r.text()).includes('AVATARPNG'));
  assert.equal(ctx.avatarCalls.n, 1, '首次应下载一次');
  // 再次: 缓存命中, 不再下载
  r = await fetch(ctx.base + '/api/avatar/file_aaa-111_1_256');
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes('AVATARPNG'));
  assert.equal(r.headers.get('content-type'), 'image/png', 'cache hit must keep image content type');
  assert.equal(ctx.avatarCalls.n, 1, '缓存命中不应再次下载');
});

test('avatar endpoint: download failure returns 502 and is not cached', async (t) => {
  const ctx = setup({
    onlineFriends: [{
      id: 'usr_f1', displayName: 'F1', location: 'wrld_a:1', status: 'active', platform: 'x',
      currentAvatarThumbnailImageUrl: 'https://api.vrchat.cloud/api/1/image/file_bbb-222/1/256'
    }],
    avatarFetch: async () => { throw new Error('net down'); }
  });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  let r = await fetch(ctx.base + '/api/avatar/file_bbb-222_1_256');
  assert.equal(r.status, 502);
  assert.equal(ctx.avatarCache.cached('file_bbb-222_1_256'), null, '失败不缓存');
  // 下次请求重新尝试下载
  r = await fetch(ctx.base + '/api/avatar/file_bbb-222_1_256');
  assert.equal(r.status, 502);
});

test('avatar key requires a thumb url (full image url alone produces no key)', async (t) => {
  const ctx = setup({
    onlineFriends: [{
      id: 'usr_f1', displayName: 'F1', location: 'wrld_a:1', status: 'active', platform: 'x',
      currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/file/file_ccc-333/5/file'
    }]
  });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  const fl = await get(ctx, '/api/friends');
  const f1 = fl.data.friends.find((f) => f.friend_vrchat_id === 'usr_f1');
  assert.equal(f1.avatarKey, null);
  const r = await fetch(ctx.base + '/api/avatar/file_ccc-333_5_256');
  assert.equal(r.status, 404);
  assert.equal(ctx.avatarCalls.n, 0);
});

test('qq settings stored and masked; status includes qq info', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await put(ctx, '/api/settings', { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec123' });
  assert.equal(r.status, 200);
  const row = ctx.db.getGlobalSettings();
  assert.equal(row.qq_enabled, 1);
  assert.equal(row.qq_app_id, 'app1');
  assert.equal(row.qq_app_secret, 'sec123');
  const g = await get(ctx, '/api/settings');
  assert.equal(g.data.settings.qq_app_id, 'app1');
  assert.notEqual(g.data.settings.qq_app_secret, 'sec123');
  assert.ok(g.data.settings.qq_app_secret); // 掩码
  // 提交掩码值不应覆盖已保存的真实值
  await put(ctx, '/api/settings', { qq_app_secret: g.data.settings.qq_app_secret });
  assert.equal(ctx.db.getGlobalSettings().qq_app_secret, 'sec123');
  const st = await get(ctx, '/api/status');
  assert.equal(st.status, 200);
  assert.ok('qq' in st.data);
});

test('qq test endpoint works via notifier', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  await put(ctx, '/api/settings', { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec' });
  const r = await post(ctx, '/api/test/qq', {});
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});

test('auto login with expired cookie notifies session expired once', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  const jar = new CookieJar();
  jar.setCookies(['auth=token123'], 'https://api.vrchat.cloud');
  const uid = ctx.db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  ctx.db.saveCookies(uid, jar.serialize(), 'me');
  ctx.vrcapi.me = async () => { const e = new Error('"Missing Credentials"'); e.status = 401; throw e; };
  ctx.notifications.length = 0;
  await get(ctx, '/api/session'); // 触发 tryAutoLogin -> 401
  const sys = ctx.notifications.filter((n) => n.change.eventType === 'vrc_system');
  assert.equal(sys.length, 1, '自动登录 401 推送一次会话失效');
  assert.ok(sys[0].change.notificationTitle.includes('会话失效'));
  assert.equal(sys[0].user.id, uid);
  // 再次触发不再重复推送
  await get(ctx, '/api/session');
  assert.equal(ctx.notifications.filter((n) => n.change.eventType === 'vrc_system').length, 1, '不重复推送');
});

test('auto login 401 retries with backoff until success', async (t) => {
  const ctx = setup({ autoLoginRetryBaseMs: 5, autoLoginRetryMaxMs: 10, autoLoginRetryJitterMs: 0 });
  t.after(() => close(ctx));
  const jar = new CookieJar();
  jar.setCookies(['auth=token123'], 'https://api.vrchat.cloud');
  const uid = ctx.db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  ctx.db.saveCookies(uid, jar.serialize(), 'me');
  let calls = 0;
  ctx.vrcapi.me = async () => {
    calls++;
    if (calls === 1) { const e = new Error('"Missing Credentials"'); e.status = 401; throw e; }
    return { id: 'usr_me', displayName: '我', onlineFriends: [], activeFriends: [], offlineFriends: [] };
  };
  await get(ctx, '/api/session'); // 首次 401 -> 调度后台重试
  assert.equal(calls, 1);
  await sleep(80); // 等待退避重试成功
  assert.ok(calls >= 2, '401 后按退避重试直到成功');
  const r = await get(ctx, '/api/session');
  assert.equal(r.data.loggedIn, true, '重试成功后自动登录完成');
});
