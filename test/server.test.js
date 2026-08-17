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
const { createLogStream } = require('../src/logstream');

const silent = { info: () => {}, warn: () => {}, error: () => {} };

function setup(opts = {}) {
  const db = createDb(':memory:');
  const bus = new EventEmitter();
  const notifications = [];
  const vrcapi = {
    jar: opts.jar || new CookieJar(),
    login: async (username, password) => {
      if (opts.loginError) throw opts.loginError;
      return opts.loginResult !== undefined ? opts.loginResult : { id: 'usr_me', displayName: '我', currentAvatarImageUrl: null };
    },
    verify2fa: async (kind, code) => { vrcapi.verifyCalls = vrcapi.verifyCalls || []; vrcapi.verifyCalls.push({ kind, code }); return { verified: true }; },
    me: async () => (opts.currentUser !== undefined ? opts.currentUser : { id: 'usr_me', displayName: '我', onlineFriends: [], activeFriends: [], offlineFriends: [] }),
    authToken: async () => ({ token: 'authcookie_test' }),
    setCookiesChanged: (fn) => { vrcapi._cookiesChanged = fn; },
    friends: async ({ offline }) => (offline ? (opts.offlineFriends || []) : (opts.onlineFriends || [])),
    world: async (id) => ({ id, name: '世界_' + id }),
    user: async (id) => {
      vrcapi.userCalls.push(id);
      return opts.selfInfo !== undefined ? opts.selfInfo : null;
    }
  };
  vrcapi.userCalls = [];
  const pipeline = {
    connects: [], disconnects: [], reconnects: 0,
    connect: (uid, name) => pipeline.connects.push({ uid, name }),
    disconnect: (uid) => pipeline.disconnects.push(uid),
    forceReconnect: () => { pipeline.reconnects++; },
    isConnected: () => opts.connected ?? false,
    lastMessageAt: () => opts.lastMessageAt ?? 0,
    status: () => ({ connected: opts.connected ?? false, lastMessageAt: opts.lastMessageAt ?? 0 }),
    messageSeries: () => opts.wsStats || { series: new Array(60).fill(0), total: 0 }
  };
  const healthMonitor = opts.healthMonitor || {
    status: () => opts.health || { status: 'ok', latencyMs: 123, serverName: 'mock-vrc', updatedAt: 1 }
  };
  const vrcStatus = opts.vrcStatusObj || {
    status: async () => opts.vrcStatus || { state: 'normal', description: 'All Systems Operational', summary: null, fetchedAt: null }
  };
  const notifier = {
    sendAll: async (user, change) => { notifications.push({ user, change }); return { qq: { ok: true } }; },
    sendTest: async (user, kind) => ({ ok: true, kind, user: user.qq_app_secret })
  };
  const monitor = createMonitor({
    db, notifier, pipeline, bus,
    logger: opts.logger || silent,
    now: opts.now || (() => 1000000),
    config: { confirmDelayMs: 30000, dedupeWindowMs: 30000, snapshotIntervalMs: 3600000, watchdogMs: 600000 }
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
  const logStream = opts.logStream || createLogStream();
  const { app, autoLogin, getConnectionStatus, handleAuthCommand } = createApp({
    db, notifier, pipeline, monitor, sessionStore,
    vrcapiFactory: (jar) => (jar ? { ...vrcapi, jar } : vrcapi),
    avatarCache,
    healthMonitor,
    vrcStatus,
    config: { accessToken: opts.accessToken || null, confirmDelayMs: 30000, dedupeWindowMs: 30000, snapshotIntervalMs: 3600000, watchdogMs: 600000, autoLoginRetryBaseMs: opts.autoLoginRetryBaseMs ?? 5000, autoLoginRetryMaxMs: opts.autoLoginRetryMaxMs ?? 3600000, autoLoginRetryJitterMs: opts.autoLoginRetryJitterMs ?? 1000, reloginMaxPerHour: opts.reloginMaxPerHour ?? 5, reloginRetryBaseMs: opts.reloginRetryBaseMs ?? 5000, reloginRetryMaxMs: opts.reloginRetryMaxMs ?? 3600000, reloginRetryJitterMs: opts.reloginRetryJitterMs ?? 0 },
    logger: opts.logger || silent,
    now: opts.now || (() => 1000000),
    publicDir: null,
    logStream: logStream,
  });
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  return { db, bus, vrcapi, pipeline, notifier, monitor, sessionStore, app, autoLogin, getConnectionStatus, handleAuthCommand, server, base, notifications, avatarCache, avatarCalls, accessToken: opts.accessToken || null, logStream };
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
  assert.equal(data.encryptionEnabled, false);
  assert.equal(data.encryptionMode, 'none');
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

test('login/session expose own presence fields and avatarKey', async (t) => {
  const meThumb = 'https://api.vrchat.cloud/api/1/image/file_me-111/1/256';
  const ctx = setup({
    loginResult: {
      id: 'usr_me', displayName: '我', status: 'active', statusDescription: '摸鱼',
      last_platform: 'web',
      currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/file/file_me-111/1/file',
      profilePicOverrideThumbnail: meThumb,
      onlineFriends: [], activeFriends: [], offlineFriends: []
    },
    selfInfo: {
      id: 'usr_me', state: 'online', status: 'join me', statusDescription: '摸鱼',
      location: 'wrld_me:1', last_platform: 'standalonewindows',
      currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/file/file_me-111/1/file',
      currentAvatarThumbnailImageUrl: meThumb
    }
  });
  t.after(() => close(ctx));
  const r = await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.avatarKey, 'file_me-111_1_256');
  assert.deepEqual(ctx.vrcapi.userCalls, ['usr_me']);
  const row = ctx.db.getUserByVrcId('usr_me');
  assert.equal(row.avatar_thumb_url, meThumb);
  assert.equal(row.status_description, '摸鱼');
  assert.equal(row.state, 'online');
  assert.equal(row.world_id, 'wrld_me');
  assert.equal(row.world_name, '世界_wrld_me');
  assert.equal(row.platform, 'standalonewindows');
  const s = await get(ctx, '/api/session');
  assert.equal(s.data.user.state, 'online');
  assert.equal(s.data.user.world_name, '世界_wrld_me');
  assert.equal(s.data.user.platform, 'standalonewindows');
  assert.equal(s.data.user.status_description, '摸鱼');
  assert.equal(s.data.user.avatarKey, 'file_me-111_1_256');
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

test('login with 429 always returns rate-limit guidance (even with email text)', async (t) => {
  const err = Object.assign(new Error('Logging in from too many places? Check your email for verification link'), { status: 429 });
  const ctx = setup({ loginError: err });
  t.after(() => close(ctx));
  const r = await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(r.status, 429);
  assert.equal(r.data.error, '登录过于频繁/失败过多, 请稍后再试');
});

test('login with non-429 email-verification error returns email guidance', async (t) => {
  const err = Object.assign(new Error('Logging in from too many places? Check your email for verification link'), { status: 403 });
  const ctx = setup({ loginError: err });
  t.after(() => close(ctx));
  const r = await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(r.status, 429);
  assert.equal(r.data.error, '登录地点过多, 请检查邮箱, 点击验证链接后重试');
});

test('login with plain 429 returns rate-limit guidance', async (t) => {
  const err = Object.assign(new Error('HTTP 429'), { status: 429 });
  const ctx = setup({ loginError: err });
  t.after(() => close(ctx));
  const r = await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(r.status, 429);
  assert.equal(r.data.error, '登录过于频繁/失败过多, 请稍后再试');
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

test('logout with clearFriends/clearCache clears all data except settings and world cache', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  const dbId = ctx.db.getUserByVrcId('usr_me').id;
  ctx.db.upsertFriend(dbId, 'usr_f1', { displayName: 'F1', state: 'online' });
  ctx.db.upsertConfig(dbId, 'usr_f1', { favorite: true });
  ctx.db.upsertQqBinding(dbId, { appId: 'app1', openid: 'open1' });
  ctx.db.markNotified('k1', 999999);
  ctx.db.setSetting('qq_enabled', '1');
  ctx.db.upsertWorldCache('wrld_1', '世界一');
  const avatarFile = path.join(ctx.avatarCache.dir, 'file_test_1_256');
  fs.writeFileSync(avatarFile, 'fake-image');
  const r = await post(ctx, '/api/logout', { clearFriends: true, clearCache: true });
  assert.equal(r.data.ok, true);
  assert.equal(ctx.db.listFriends(dbId).length, 0, '好友数据已清除');
  assert.equal(ctx.db.listConfigs(dbId).length, 0, '监控配置已清除');
  assert.equal(ctx.db.listUsers().length, 0, '用户表已清除');
  assert.equal(ctx.db.getQqBinding(dbId, 'app1'), null, 'QQ 绑定已清除');
  assert.equal(ctx.db.isDuplicate('k1', 60000, 1000000), false, '通知去重已清除');
  assert.equal(ctx.db.getSetting('qq_enabled'), '1', '设置表保留');
  assert.equal(ctx.db.getWorldCache('wrld_1'), null, '世界名缓存已清除');
  assert.equal(fs.existsSync(avatarFile), false, '头像缓存文件已清除');
});

test('logout without clear options keeps all data', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  const dbId = ctx.db.getUserByVrcId('usr_me').id;
  ctx.db.upsertFriend(dbId, 'usr_f1', { displayName: 'F1', state: 'online' });
  ctx.db.setSetting('qq_enabled', '1');
  ctx.db.upsertWorldCache('wrld_1', '世界一');
  await post(ctx, '/api/logout', {});
  assert.equal(ctx.db.listFriends(dbId).length, 1, '默认不清好友');
  assert.equal(ctx.db.listUsers().length, 1, '默认不清用户');
  assert.equal(ctx.db.getSetting('qq_enabled'), '1', '默认不清设置');
  assert.ok(ctx.db.getWorldCache('wrld_1'), '默认不清缓存');
});

// ---------- 自动重登 / 2FA ----------

test('rememberMe login saves password, logout clears it', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  assert.equal(ctx.db.getUserByVrcId('usr_me').password, 'pw', '记住我时保存密码');
  await post(ctx, '/api/logout', {});
  assert.equal(ctx.db.getUserByVrcId('usr_me').password, null, '登出清除密码');
});

test('auto-relogin retries after network failure and succeeds (notifications handled by monitor)', async (t) => {
  const ctx = setup({ reloginRetryBaseMs: 50, reloginRetryJitterMs: 0 });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  let calls = 0;
  ctx.vrcapi.login = async () => {
    calls++;
    if (calls === 1) { const e = new Error('网络错误'); e.status = -1; throw e; }
    return { id: 'usr_me', displayName: '我', currentAvatarImageUrl: null };
  };
  const connectsBefore = ctx.pipeline.connects.length;
  ctx.bus.emit('relogin-needed', { userId: 'usr_me', reason: 'IP 变化' });
  await sleep(200);
  assert.ok(calls >= 2, '退避后重试成功');
  assert.ok(ctx.pipeline.connects.length > connectsBefore, '重登成功后重新激活会话');
});

test('auto-relogin network failure keeps retrying without deactivating (no server-side notify)', async (t) => {
  const ctx = setup({ reloginRetryBaseMs: 40, reloginRetryJitterMs: 0 });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  ctx.vrcapi.login = async () => { const e = new Error('网络错误'); e.status = -1; throw e; };
  ctx.bus.emit('relogin-needed', { userId: 'usr_me', reason: 'IP 变化' });
  await sleep(150);
  assert.equal(ctx.pipeline.disconnects.length, 0, '网络失败不退避停用, 持续重试');
  assert.equal(ctx.notifications.filter((n) => String(n.change.notificationBody).includes('自动重新登录失败')).length, 0, '失败通知由 monitor 故障窗口统一负责');
});

test('auto-relogin with wrong password gives up and deactivates', async (t) => {
  const ctx = setup({ reloginRetryBaseMs: 40, reloginRetryJitterMs: 0 });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: true });
  ctx.vrcapi.login = async () => { const e = new Error('Invalid Username/Email or Password'); e.status = 401; throw e; };
  ctx.bus.emit('relogin-needed', { userId: 'usr_me', reason: 'IP 变化' });
  await sleep(60);
  assert.ok(ctx.pipeline.disconnects.length >= 1, '密码错误: 停用会话');
  assert.equal(ctx.notifications.filter((n) => String(n.change.notificationBody).includes('已自动重新登录')).length, 0);
});

test('auto-relogin with 2FA waits for QQ code, resend command re-logins', async (t) => {
  const ctx = setup({ loginResult: { requiresTwoFactorAuth: ['emailOtp'] } });
  t.after(() => close(ctx));
  const dbId = ctx.db.upsertUser('usr_me', { username: 'me' });
  ctx.db.savePassword(dbId, 'pw');
  ctx.vrcapi.verifyCalls = ctx.vrcapi.verifyCalls || [];
  // 无等待会话时验证码消息回落(null, 走在线列表)
  assert.equal(await ctx.handleAuthCommand(dbId, '654321'), null);
  ctx.bus.emit('relogin-needed', { userId: 'usr_me', reason: 'IP 变化' });
  await sleep(50);
  assert.ok(ctx.notifications.some((n) => String(n.change.notificationBody).includes('两步验证')), '2FA 提示已推送');
  // 重发验证码: 重新走登录(不消耗频控)
  const resend = await ctx.handleAuthCommand(dbId, '重发验证码');
  assert.ok(resend.text.includes('已重新发送验证邮件'));
  await sleep(50);
  assert.equal(ctx.vrcapi.verifyCalls.length, 0, '重发走登录, 不直接验证');
  // 重发后的登录仍返回 2FA, 继续等码
  assert.ok(ctx.notifications.filter((n) => String(n.change.notificationBody).includes('两步验证')).length >= 2, '重发后再次提示');
  const reply = await ctx.handleAuthCommand(dbId, '验证码 123456');
  assert.equal(reply.text, '✅ 验证成功, 已重新登录');
  assert.deepEqual(ctx.vrcapi.verifyCalls, [{ kind: 'emailOtp', code: '123456' }]);
});

test('Unauthorized 401 asks 2FA with existing session, QQ code resumes', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  const dbId = ctx.db.upsertUser('usr_me', { username: 'me' });
  ctx.sessionStore.set('usr_me', ctx.vrcapi);
  ctx.vrcapi.me = async () => {
    const e = new Error('"Unauthorized"');
    e.status = 401;
    e.data = { requiresTwoFactorAuth: ['totp'] };
    throw e;
  };
  ctx.bus.emit('unauthorized-2fa', { userId: 'usr_me' });
  await sleep(50);
  assert.ok(ctx.notifications.some((n) => String(n.change.notificationBody).includes('两步验证')), 'Unauthorized 触发 2FA 提示');
  ctx.vrcapi.me = async () => ({ id: 'usr_me', displayName: '我', currentAvatarImageUrl: null });
  const reply = await ctx.handleAuthCommand(dbId, '2fa 654321');
  assert.equal(reply.text, '✅ 验证成功, 已重新登录');
  assert.deepEqual(ctx.vrcapi.verifyCalls, [{ kind: 'totp', code: '654321' }]);
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
  const r = await put(ctx, '/api/friends/usr_f1/config', { favorite: true, notifyOnline: true, notifyOffline: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.config.favorite, 1);
  const list = await get(ctx, '/api/friends');
  const f1 = list.data.friends.find((f) => f.friend_vrchat_id === 'usr_f1');
  assert.equal(f1.config.favorite, 1);
  assert.equal(f1.config.notify_offline, 0);
});

test('settings get masks secrets, put stores plaintext', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const r = await put(ctx, '/api/settings', { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'secret123' });
  assert.equal(r.status, 200);
  const row = ctx.db.getGlobalSettings();
  assert.equal(row.qq_app_secret, 'secret123');
  const g = await get(ctx, '/api/settings');
  assert.equal(g.data.settings.qq_app_id, 'app1');
  assert.notEqual(g.data.settings.qq_app_secret, 'secret123');
  assert.ok(g.data.settings.qq_app_secret); // 已配置(掩码)
  // 掩码占位符再次提交不清空
  await put(ctx, '/api/settings', { qq_app_secret: g.data.settings.qq_app_secret });
  assert.equal(ctx.db.getGlobalSettings().qq_app_secret, 'secret123');
});

test('test notification endpoint calls notifier with stored secrets', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  await put(ctx, '/api/settings', { qq_app_secret: 'secret123' });
  const r = await post(ctx, '/api/test/qq', {});
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

test('GET /api/vrc-status returns backend-judged server status', async (t) => {
  const ctx = setup({ vrcStatus: { state: 'outage', description: 'Major System Outage', summary: 'API', updatedAt: '2026-08-13', fetchedAt: 9 } });
  t.after(() => close(ctx));
  const r = await get(ctx, '/api/vrc-status');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.state, 'outage');
  assert.equal(r.data.description, 'Major System Outage');
  assert.equal(r.data.summary, 'API');
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

test('manual snapshot emits success log', async (t) => {
  const logs = [];
  const logger = { info: (...a) => logs.push(['info', ...a]), warn: () => {}, error: (...a) => logs.push(['error', ...a]) };
  const ctx = setup({ onlineFriends: [{ id: 'usr_f1', displayName: 'F1', location: 'offline', status: 'active' }], logger });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
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
  const c = await put(ctx, '/api/friends/usr_f1/config', { favorite: true });
  assert.equal(c.status, 200);
  const st = await put(ctx, '/api/settings', { qq_app_secret: 'secret123' });
  assert.equal(st.status, 200);
  const tt = await post(ctx, '/api/test/qq', {});
  assert.equal(tt.status, 200);
  const info = logs.filter((l) => l[0] === 'info').map((l) => l.slice(1).join(' ')).join('\n');
  assert.ok(info.includes('更新监控配置'));
  assert.ok(info.includes('好友=F1'));
  assert.ok(info.includes('特别关注=开'));
  assert.ok(info.includes('更新通知设置'));
  assert.ok(info.includes('发送测试通知'));
  assert.ok(info.includes('测试通知发送成功'));
  assert.ok(!info.includes('secret123'), 'qq_app_secret 不应以明文出现在日志');
});

test('test notification failure returns 502 and logs error', async (t) => {
  const logs = [];
  const logger = { info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) };
  const ctx = setup({ logger });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  ctx.notifier.sendTest = async (user, kind) => ({ ok: false, reason: 'qq push failed' });
  logs.length = 0;
  const tt = await post(ctx, '/api/test/qq', {});
  assert.equal(tt.status, 502);
  assert.equal(tt.data.ok, false);
  assert.ok(tt.data.error.includes('qq'));
  const err = logs.filter((l) => l[0] === 'error').map((l) => l.slice(1).join(' ')).join('\n');
  assert.ok(err.includes('测试通知发送失败(qq)'));
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

test('GET /api/health returns continuous probe status', async (t) => {
  const ctx = setup({ health: { status: 'ok', latencyMs: 87, serverName: 'mock-vrc', updatedAt: 42 } });
  t.after(() => close(ctx));
  const r = await get(ctx, '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.status, 'ok');
  assert.equal(r.data.latencyMs, 87);
  assert.equal(r.data.serverName, 'mock-vrc');
  assert.equal(r.data.updatedAt, 42);
});

test('GET /api/ws-stats returns last-60s series and total', async (t) => {
  const series = Array.from({ length: 60 }, (_, i) => (i === 59 ? 3 : 0));
  const ctx = setup({ wsStats: { series, total: 3 } });
  t.after(() => close(ctx));
  const r = await get(ctx, '/api/ws-stats');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.series, series);
  assert.equal(r.data.total, 3);
});

test('SSE stream receives qq-status events', async (t) => {
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
  ctx.bus.emit('qq-status', { dbId: 1, appId: 'app1', connected: true });
  const buf = await readUntil('qq-status');
  assert.ok(buf.includes('"connected":true'));
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

test('avatar whitelist accepts own avatar thumb url', async (t) => {
  const meThumb = 'https://api.vrchat.cloud/api/1/image/file_me-222/1/256';
  const ctx = setup({
    loginResult: {
      id: 'usr_me', displayName: '我', status: 'active',
      currentAvatarImageUrl: null,
      profilePicOverrideThumbnail: meThumb,
      onlineFriends: [], activeFriends: [], offlineFriends: []
    }
  });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  const r = await fetch(ctx.base + '/api/avatar/file_me-222_1_256');
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes('AVATARPNG'));
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

// 401 且 cookie 已过期: 第一次 401 即检查过期 -> 推送"登录过期, 请重新登录", 清除登录信息并停止重试
test('auto login 401 with expired cookie: notify login expired, clear saved login, stop retrying', async (t) => {
  const ctx = setup({ autoLoginRetryBaseMs: 5, autoLoginRetryMaxMs: 10, autoLoginRetryJitterMs: 0, now: () => Date.now() });
  t.after(() => close(ctx));
  const jar = new CookieJar();
  jar.setCookies(['auth=token123; Expires=Thu, 01 Jan 1970 00:00:00 GMT'], 'https://api.vrchat.cloud');
  const uid = ctx.db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  ctx.db.saveCookies(uid, jar.serialize(), 'me');
  let calls = 0;
  ctx.vrcapi.me = async () => { calls++; const e = new Error('"Missing Credentials"'); e.status = 401; throw e; };
  await get(ctx, '/api/session'); // 触发 tryAutoLogin -> 第一次 401
  const sys = ctx.notifications.filter((n) => n.change.eventType === 'vrc_system');
  assert.equal(sys.length, 1, 'cookie 过期: 第一次 401 即推送登录过期');
  assert.ok(sys[0].change.notificationTitle.includes('登录过期'), '标题为登录过期');
  assert.ok(sys[0].change.notificationBody.includes('请重新登录'), '正文提示重新登录');
  assert.equal(sys[0].user.id, uid);
  // 登录信息已清除
  assert.equal(ctx.db.getSavedLogin(), null, '清除登录信息后不再自动登录');
  const u = ctx.db.getUserByDbId(uid);
  assert.equal(u.cookie_data, null);
  assert.equal(u.remember_me, 0);
  assert.equal(u.saved_username, null);
  // 不再退避重试
  await sleep(80);
  assert.equal(calls, 1, 'cookie 过期后停止重试');
});

// 连续 3 次 401 且 cookie 未过期: 第一次只检查过期不推送, 第 3 次推送"可能 IP 变化", 继续退避重试
test('auto login 401 fresh cookie: no notify on 1st, ip-change notify on 3rd, keeps retrying', async (t) => {
  const ctx = setup({ autoLoginRetryBaseMs: 5, autoLoginRetryMaxMs: 10, autoLoginRetryJitterMs: 0, now: () => Date.now() });
  t.after(() => close(ctx));
  const jar = new CookieJar();
  jar.setCookies(['auth=token123; Expires=Thu, 01 Jan 2099 00:00:00 GMT'], 'https://api.vrchat.cloud');
  const uid = ctx.db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  ctx.db.saveCookies(uid, jar.serialize(), 'me');
  let calls = 0;
  ctx.vrcapi.me = async () => { calls++; const e = new Error('"Missing Credentials"'); e.status = 401; throw e; };
  await get(ctx, '/api/session'); // 第一次 401: 检查过期(未过期), 不推送, 调度退避重试
  assert.equal(calls, 1);
  assert.equal(ctx.notifications.filter((n) => n.change.eventType === 'vrc_system').length, 0, '第一次 401 不推送');
  await sleep(120); // 等待 2 次退避重试, 累计 3 次 401
  assert.ok(calls >= 3, '未过期 401 继续退避重试');
  const sys = ctx.notifications.filter((n) => n.change.eventType === 'vrc_system');
  assert.equal(sys.length, 1, '第 3 次 401 推送一次 IP 提示');
  assert.ok(sys[0].change.notificationTitle.includes('登录失败'), '标题为登录失败');
  assert.ok(sys[0].change.notificationBody.includes('可能ip地址发生变化'), '正文提示可能 IP 变化');
  // 登录信息保留
  assert.ok(ctx.db.getSavedLogin(), '未过期分支不清除登录信息');
  // 后续 401 不再重复推送
  await sleep(120);
  assert.equal(ctx.notifications.filter((n) => n.change.eventType === 'vrc_system').length, 1, 'IP 提示只推一次');
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

test('getConnectionStatus: ws 重连中 / 401 未恢复时返回未连接与断开时间', async (t) => {
  const ctx = setup({ autoLoginRetryBaseMs: 5, autoLoginRetryMaxMs: 10, autoLoginRetryJitterMs: 0, now: () => Date.now() });
  t.after(() => close(ctx));
  const jar = new CookieJar();
  jar.setCookies(['auth=token123; Expires=Thu, 01 Jan 2099 00:00:00 GMT'], 'https://api.vrchat.cloud');
  const uid = ctx.db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  ctx.db.saveCookies(uid, jar.serialize(), 'me');
  // 未触发自动登录/无断线: 视为已连接
  assert.equal(ctx.getConnectionStatus(uid).connected, true);
  // 自动登录 401 未恢复(退避重试中): 未连接, 返回失败开始时间
  ctx.vrcapi.me = async () => { const e = new Error('"Missing Credentials"'); e.status = 401; throw e; };
  await get(ctx, '/api/session');
  const st = ctx.getConnectionStatus(uid);
  assert.equal(st.connected, false, '401 未恢复时未连接');
  assert.ok(st.since > 0, '返回失败开始时间');
  // 自动登录成功后恢复为已连接
  ctx.vrcapi.me = async () => ({ id: 'usr_me', displayName: '我', onlineFriends: [], activeFriends: [], offlineFriends: [] });
  await sleep(80);
  assert.equal(ctx.getConnectionStatus(uid).connected, true, '登录成功后恢复');
  // 登录后 WS 断开重连中: 未连接, since 为断开时间
  ctx.pipeline.status = () => ({ failedSince: 1234567890 });
  const ws = ctx.getConnectionStatus(uid);
  assert.equal(ws.connected, false, 'WS 重连中未连接');
  assert.equal(ws.since, 1234567890, '返回 WS 断开时间');
});


// ---------- 日志流 ----------
test('GET /api/logs requires login', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  const { status } = await get(ctx, '/api/logs');
  assert.equal(status, 401);
});

test('GET /api/logs returns tail and after-seq entries', async (t) => {
  const ctx = setup({ accessToken: 'secret123' });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  ctx.logStream.push('第一行');
  ctx.logStream.push('第二行');
  ctx.logStream.push('第三行');
  const tail = await get(ctx, '/api/logs?tail=2');
  assert.equal(tail.status, 200);
  assert.deepEqual(tail.data.logs.map((l) => l.line), ['第二行', '第三行']);
  assert.equal(tail.data.seq, 3);
  const after = await get(ctx, '/api/logs?after=1');
  assert.deepEqual(after.data.logs.map((l) => l.line), ['第二行', '第三行']);
  const all = await get(ctx, '/api/logs');
  assert.deepEqual(all.data.logs.map((l) => l.line), ['第一行', '第二行', '第三行']);
});

test('GET /api/logs filters by level and category server-side', async (t) => {
  const ctx = setup({ accessToken: 'secret123' });
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  ctx.logStream.push('[2026-01-01 00:00:01] [info] [ws] 已连接');
  ctx.logStream.push('[2026-01-01 00:00:02] [warn] [qq] 断开 appId=1');
  ctx.logStream.push('[2026-01-01 00:00:03] [error] [monitor] 连接故障超过 5 分钟');
  // 阈值语义: warn 含 error; info 含全部
  const warn = await get(ctx, '/api/logs?tail=10&level=warn');
  assert.deepEqual(warn.data.logs.map((l) => l.seq), [2, 3]);
  const onlyErr = await get(ctx, '/api/logs?tail=10&level=error');
  assert.deepEqual(onlyErr.data.logs.map((l) => l.seq), [3]);
  const qqWarn = await get(ctx, '/api/logs?tail=10&level=warn&cat=qq');
  assert.deepEqual(qqWarn.data.logs.map((l) => l.seq), [2]);
  const all2 = await get(ctx, '/api/logs?tail=10');
  assert.deepEqual(all2.data.logs.map((l) => l.seq), [1, 2, 3]);
  const afterF = await get(ctx, '/api/logs?after=1&level=error');
  assert.deepEqual(afterF.data.logs.map((l) => l.seq), [3]);
});

test('SSE stream emits backend log lines live', async (t) => {
  const ctx = setup();
  t.after(() => close(ctx));
  await post(ctx, '/api/login', { username: 'me', password: 'pw' });
  const ac = new AbortController();
  t.after(() => ac.abort());
  const res = await fetch(ctx.base + '/api/events', { signal: ac.signal });
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
  ctx.logStream.push('后端日志 abc');
  const buf = await readUntil('后端日志 abc');
  assert.ok(buf.includes('event: log'));
  assert.ok(buf.includes('后端日志 abc'));
  ac.abort();
});
