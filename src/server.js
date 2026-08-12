'use strict';
// Express HTTP 服务: 登录/2FA/会话/好友/监控配置/设置/测试/状态/SSE + 静态 UI。

const express = require('express');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { CookieJar } = require('./cookiejar');
const { parseLocation } = require('./location');
const { deriveStateFromSnapshot, normalizeOwnState } = require('./state');
const { detectImageType, toThumbUrl } = require('./avatar');
const { formatLocalTime, getLogStream } = require('./util');

const MASK = '••••••••';
const SECRET_FIELDS = new Set(['qq_app_secret']);
const SETTING_MAP = {
  qqEnabled: 'qq_enabled', qqAppId: 'qq_app_id', qqAppSecret: 'qq_app_secret'
};

function createApp({
  db, notifier, pipeline, monitor,
  sessionStore = new Map(), vrcapiFactory, config = {}, logger = null,
  now = Date.now, publicDir = null, avatarCache = null, qq = null, logStream = null
}) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  const app = express();
  const bus = monitor.events;
  const logStreamRef = logStream || getLogStream(); // 后端日志流: 未注入时回退全局
  const pending2faTtlMs = config.pending2faTtlMs ?? 5 * 60 * 1000;

  let current = null;        // { userId, dbId, vrcapi }
  const pending2fa = new Map();
  let lastSnapshotAt = null;
  let sessionExpiredNotified = false; // 自动登录 401 通知只推一次, 登录成功后重置
  let autoLogin401Streak = 0;         // 自动登录连续 401 次数(成功/清除登录信息后重置)
  let autoLogin401Notified = false;   // 第 3 次 401 的 IP 提示是否已推送(只推一次)
  let autoLoginFailingSince = 0;      // 自动登录开始连续失败的时间(401/网络等, 成功或清除后重置)
  let autoLoginRetryTimer = null;
  let autoLoginRetryAttempt = 0;
  let autoLoginInFlight = false;
  const sseClients = new Set();
  const autoLoginRetryBaseMs = config.autoLoginRetryBaseMs ?? 5000;
  const autoLoginRetryMaxMs = config.autoLoginRetryMaxMs ?? 3600000;
  const autoLoginRetryJitterMs = config.autoLoginRetryJitterMs ?? 1000;

  // 好友行附带头像 key(前端零解析)
  function friendRow(f) {
    const out = { ...f };
    out.avatarKey = f.avatar_thumb_url && avatarCache ? avatarCache.thumbKeyFromUrl(f.avatar_thumb_url) : null;
    return out;
  }

  function maskUser(row) {
    if (!row) return null;
    const out = { ...row };
    delete out.cookie_data;
    return out;
  }

  // 恒时比较访问令牌, 避免时序侧信道(本地单用户场景也统一使用)
  function tokenEquals(a, b) {
    const ba = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  function maskSettings(row) {
    const out = { ...row };
    for (const k of SECRET_FIELDS) {
      out[k] = out[k] ? MASK : null;
    }
    return out;
  }

  function sseSend(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  function broadcast(event, data) {
    for (const res of sseClients) {
      try { sseSend(res, event, data); } catch (e) { sseClients.delete(res); }
    }
  }

  // 后端日志实时转发: 日志流每推一行, 广播给所有 SSE 客户端(前端直接展示后端日志原文)
  if (logStreamRef) {
    logStreamRef.subscribe((entry) => {
      for (const res of sseClients) {
        try { sseSend(res, 'log', entry); } catch (e) { sseClients.delete(res); }
      }
    });
  }

  function handleSessionExpired(userId) {
    if (current && current.userId === userId) {
      current = null;
      sessionStore.delete(userId);
    }
  }

  async function finalizeLogin(vrcapi, currentUser, { rememberMe, username }) {
    sessionExpiredNotified = false;
    autoLogin401Streak = 0;
    autoLogin401Notified = false;
    autoLoginFailingSince = 0;
    if (autoLoginRetryTimer) { clearTimeout(autoLoginRetryTimer); autoLoginRetryTimer = null; }
    autoLoginRetryAttempt = 0;
    if (current) {
      try { monitor.deactivateUser(current.userId); } catch (e) { log.warn(`[server] 旧会话停用失败: ${e.message}`); }
      if (current.cookieCtx) {
        current.cookieCtx.cancelled = true;
        if (current.cookieCtx.timer) clearTimeout(current.cookieCtx.timer);
      }
      current = null;
    }
    const userId = currentUser.id;
    const dbId = db.upsertUser(userId, {
      username,
      displayName: currentUser.displayName || null,
      avatarUrl: currentUser.currentAvatarImageUrl || null,
      // /auth/user 的 state 恒为 offline(官方注释), 真实在线状态在 presence.status; 自己 offline 视为活动
      state: normalizeOwnState(
        (currentUser.presence && currentUser.presence.status)
        || ((currentUser.state === 'online' || currentUser.state === 'active') ? currentUser.state : undefined)),
      status: currentUser.status || null,
      statusDescription: currentUser.statusDescription ?? null
    });
    const cookieCtx = { cancelled: false, timer: null };
    if (rememberMe) {
      db.saveCookies(dbId, vrcapi.jar.serialize(), username);
      if (typeof vrcapi.setCookiesChanged === 'function') {
        vrcapi.setCookiesChanged(() => {
          if (cookieCtx.cancelled) return;
          if (cookieCtx.timer) clearTimeout(cookieCtx.timer);
          cookieCtx.timer = setTimeout(() => {
            cookieCtx.timer = null;
            if (cookieCtx.cancelled) return;
            try { db.saveCookies(dbId, vrcapi.jar.serialize(), username || null); } catch (e) { log.warn(`[server] cookie 保存失败: ${e.message}`); }
          }, 2000);
        });
      }
    } else {
      // 不记住我: 清除该账号已存的 cookie, 避免下次启动仍用旧 cookie 自动登录
      db.clearCookies(dbId);
    }
    const user = db.getUserByDbId(dbId);
    current = { userId, dbId, vrcapi, cookieCtx };
    sessionStore.set(userId, vrcapi);
    await monitor.activateUser(user, vrcapi);
    return user;
  }

  async function tryAutoLogin() {
    if (current || autoLoginInFlight) return;
    const saved = db.getSavedLogin();
    if (!saved || !saved.cookie_data) return;
    autoLoginInFlight = true;
    try {
      await attemptAutoLogin(saved);
    } finally {
      autoLoginInFlight = false;
    }
  }

  // 单次自动登录尝试; 401/网络/5xx/429 失败后调度后台退避重试, 直到成功
  async function attemptAutoLogin(saved) {
    const jar = CookieJar.deserialize(saved.cookie_data);
    const vrcapi = vrcapiFactory(jar);
    try {
      const user = await vrcapi.me({ noRetry: true });
      if (user && user.id) {
        await finalizeLogin(vrcapi, user, { rememberMe: true, username: saved.saved_username || null });
        log.info(`[server] 自动登录成功: ${user.displayName || user.id}`);
        return;
      }
    } catch (e) {
      const retryable = e && (e.status === 401 || e.status === 429 || e.status === 0 || e.status === -1 || (e.status >= 500 && e.status < 600));
      log.warn(`[server] 自动登录失败(${e.message})${retryable ? ', 按退避重试' : ''}`);
      if (retryable && !autoLoginFailingSince) autoLoginFailingSince = now();
      if (e && e.status === 401) {
        // 第一次 401 即检查 cookie 是否过期: 已过期 -> 推送"登录过期"并清除登录信息, 停止重试
        if (autoLogin401Streak === 0 && cookieJarExpired(jar, now())) {
          await notifySessionExpired(saved, 'expired');
          db.clearCookies(saved.id);
          autoLoginFailingSince = 0;
          log.info(`[server] cookie 已过期, 清除登录信息并停止重试`);
          return;
        }
        autoLogin401Streak++;
        // 连续 3 次 401 且 cookie 未过期: 推送"可能 IP 变化", 继续退避重试
        if (autoLogin401Streak >= 3 && !autoLogin401Notified) {
          autoLogin401Notified = true;
          await notifySessionExpired(saved, 'ip_changed');
        }
      }
      if (retryable) scheduleAutoLoginRetry(saved);
    }
  }

  function scheduleAutoLoginRetry(saved) {
    if (autoLoginRetryTimer || current) return;
    const delay = Math.min(autoLoginRetryBaseMs * Math.pow(2, autoLoginRetryAttempt), autoLoginRetryMaxMs) + Math.floor(Math.random() * autoLoginRetryJitterMs);
    autoLoginRetryAttempt++;
    log.warn(`[server] 自动登录 ${delay}ms 后重试(第 ${autoLoginRetryAttempt} 次)`);
    autoLoginRetryTimer = setTimeout(() => {
      autoLoginRetryTimer = null;
      if (current) return;
      attemptAutoLogin(saved).catch((e) => log.warn(`[server] 自动登录重试异常: ${e.message}`));
    }, delay);
    if (autoLoginRetryTimer.unref) autoLoginRetryTimer.unref();
  }

  // cookie 是否已过期: 所有带 expires 的 cookie 都超过当前时间才算过期(无 expires 视为未过期)
  function cookieJarExpired(jar, atMs) {
    const cookies = (jar && jar.cookies) || [];
    if (cookies.length === 0) return false;
    return cookies.every((c) => c.expires != null && c.expires <= atMs);
  }

  // 自动登录 401 通知(只推一次): expired=cookie 已过期, ip_changed=cookie 未过期但连续 3 次 401
  async function notifySessionExpired(savedRow, reason = 'expired') {
    if (sessionExpiredNotified) return;
    sessionExpiredNotified = true;
    const expired = reason !== 'ip_changed';
    const title = expired ? '⚠️ 登录过期' : '⚠️ 登录失败';
    const body = expired
      ? '登录过期, 请重新登录'
      : '登录失败,cookies未过期,可能ip地址发生变化,继续按退避重试';
    const change = {
      changeType: '系统通知',
      friendName: 'vrcnotifier',
      oldStatus: '未知', newStatus: '未知',
      oldWorld: '-', newWorld: '-',
      oldStatusDescription: '无', newStatusDescription: body,
      oldPlatform: 'unknown', newPlatform: 'unknown',
      notificationTitle: title,
      notificationBody: body,
      eventType: 'vrc_system',
      timestamp: formatLocalTime(now())
    };
    try {
      const forSend = { id: savedRow.id, ...db.getGlobalSettings() };
      log.info(`[server] 自动登录 401 通知已推送: ${title}`);
      await notifier.sendAll(forSend, change);
    } catch (err) {
      log.warn(`[server] 会话失效通知失败: ${err.message}`);
    }
  }

  // QQ 在线列表等场景的连接状态: 401 未恢复(自动登录退避重试中)优先, 其次 WS 断开重连中
  function getConnectionStatus(dbId) {
    if (autoLoginRetryTimer && autoLoginFailingSince) {
      return { connected: false, since: autoLoginFailingSince };
    }
    const user = db.getUserByDbId(dbId);
    const st = user && user.vrchat_user_id ? pipeline.status(user.vrchat_user_id) : null;
    if (st && st.failedSince) {
      return { connected: false, since: st.failedSince };
    }
    return { connected: true, since: null };
  }

  // 事件 → SSE
  bus.on('snapshot', ({ userId, count, at }) => {
    lastSnapshotAt = at || now();
    broadcast('snapshot', { userId, count, at: lastSnapshotAt });
  });
  bus.on('notification', (e) => broadcast('notification', e));
  bus.on('session-expired', ({ userId }) => {
    handleSessionExpired(userId);
    broadcast('session-expired', { userId });
  });
  bus.on('ws-failure', (e) => broadcast('ws-failure', e));

  app.use(express.json({ limit: '1mb' }));

  // CORS(跨域支持): 默认全部放行, 可用 config.corsOrigin 收紧
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Bearer token 鉴权: 除 config/verify 外所有 /api 接口都需要 token
  const authWhitelist = new Set(['/api/config', '/api/access/verify']);
  app.use((req, res, next) => {
    if (!config.accessToken) return next(); // 未配置 token 时跳过(测试/内嵌兼容)
    const pathname = (req.path || req.url.split('?')[0]).replace(/\/+$/, '');
    if (!pathname.startsWith('/api/')) return next(); // 静态资源无需 token
    if (authWhitelist.has(pathname)) return next();
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const queryToken = req.query.token ? String(req.query.token) : '';
    if (tokenEquals(bearer || queryToken, config.accessToken)) return next();
    log.warn('[server] 访问被拒绝: 缺少或错误的访问令牌');
    return res.status(401).json({ error: '访问被拒绝: 缺少或错误的访问令牌' });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      ok: true,
      tokenRequired: !!config.accessToken,
      confirmDelayMs: config.confirmDelayMs ?? 30000,
      snapshotIntervalMs: config.snapshotIntervalMs ?? 3600000,
      watchdogMs: config.watchdogMs ?? 3600000,
      dedupeWindowMs: config.dedupeWindowMs ?? 30000,
      version: '0.1.0'
    });
  });

  app.post('/api/access/verify', (req, res) => {
    const { key } = req.body || {};
    if (!config.accessToken) return res.json({ ok: true });
    const ok = tokenEquals(key, config.accessToken);
    if (ok) log.info('[server] 访问令牌验证成功');
    else log.warn('[server] 访问令牌验证失败');
    return res.json({ ok });
  });

  app.post('/api/login', async (req, res) => {
    const { username, password, rememberMe } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });
    for (const [id, p] of pending2fa) {
      if (now() - p.createdAt > pending2faTtlMs) pending2fa.delete(id);
    }
    const vrcapi = vrcapiFactory();
    try {
      const result = await vrcapi.login(String(username), String(password));
      if (result && Array.isArray(result.requiresTwoFactorAuth)) {
        const tempSessionId = randomBytes(8).toString('hex');
        pending2fa.set(tempSessionId, { vrcapi, username: String(username), rememberMe: !!rememberMe, createdAt: now() });
        log.info(`[server] 登录需要 2FA: username=${username}, kinds=${result.requiresTwoFactorAuth.join(',')}`);
        return res.json({ ok: true, requiresTwoFactorAuth: result.requiresTwoFactorAuth, tempSessionId });
      }
      if (!result || !result.id) throw new Error('login response missing user');
      const user = await finalizeLogin(vrcapi, result, { rememberMe: !!rememberMe, username: String(username) });
      log.info(`[server] 登录成功: ${user.display_name || user.vrchat_user_id} (rememberMe=${!!rememberMe})`);
      return res.json({ ok: true, user: maskUser(user) });
    } catch (e) {
      if (e.status === 401) return res.status(401).json({ error: '用户名或密码错误' });
      log.error(`[server] 登录失败: ${e.message}`);
      return res.status(500).json({ error: '登录失败, 请稍后重试' });
    }
  });

  app.post('/api/login/2fa', async (req, res) => {
    const { tempSessionId, code, kind } = req.body || {};
    if (!tempSessionId || !code) return res.status(400).json({ error: '缺少参数' });
    const pending = pending2fa.get(tempSessionId);
    if (!pending) return res.status(400).json({ error: '登录会话已过期, 请重新登录' });
    try {
      await pending.vrcapi.verify2fa(String(kind || 'emailOtp').toLowerCase(), String(code));
      const currentUser = await pending.vrcapi.me();
      if (!currentUser || !currentUser.id) throw new Error('2fa verify missing user');
      pending2fa.delete(tempSessionId);
      const user = await finalizeLogin(pending.vrcapi, currentUser, { rememberMe: pending.rememberMe, username: pending.username });
      log.info(`[server] 2FA 验证成功: ${user.display_name || user.vrchat_user_id}`);
      return res.json({ ok: true, user: maskUser(user) });
    } catch (e) {
      if (e.status === 400 || e.status === 401) {
        return res.status(400).json({ error: '验证码错误或已过期' });
      }
      log.error(`[server] 2FA 验证失败: ${e.message}`);
      return res.status(500).json({ error: '验证失败, 请重试' });
    }
  });

  app.post('/api/logout', async (req, res) => {
    if (!current) return res.json({ ok: true });
    if (autoLoginRetryTimer) { clearTimeout(autoLoginRetryTimer); autoLoginRetryTimer = null; }
    autoLoginRetryAttempt = 0;
    autoLogin401Streak = 0;
    autoLogin401Notified = false;
    autoLoginFailingSince = 0;
    const { userId, dbId } = current;
    if (current.cookieCtx) {
      current.cookieCtx.cancelled = true;
      if (current.cookieCtx.timer) clearTimeout(current.cookieCtx.timer);
    }
    try { monitor.deactivateUser(userId); } catch (e) { log.warn(`[server] 停用失败: ${e.message}`); }
    sessionStore.delete(userId);
    db.clearCookies(dbId);
    log.info(`[server] 登出: ${userId}`);
    current = null;
    return res.json({ ok: true });
  });

  app.get('/api/session', async (req, res) => {
    if (!current) {
      try { await tryAutoLogin(); } catch (e) { log.warn(`[server] 自动登录失败: ${e.message}`); }
    }
    return res.json({ ok: true, loggedIn: !!current, user: current ? maskUser(db.getUserByDbId(current.dbId)) : null });
  });

  app.get('/api/me', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    return res.json({ ok: true, user: maskUser(db.getUserByDbId(current.dbId)) });
  });

  app.get('/api/friends', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const configs = db.listConfigs(current.dbId);
    const friends = db.listFriends(current.dbId).map((f) => ({
      ...friendRow(f),
      config: configs.find((c) => c.friend_vrchat_id === f.friend_vrchat_id) || null
    }));
    return res.json({ ok: true, friends });
  });

  // 头像: 未登录 401 / key 不在当前用户好友缩略图白名单 404 / 命中缓存直接返回 / 否则下载并原子写盘
  app.get('/api/avatar/:key', async (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    if (!avatarCache) return res.status(404).json({ error: '头像缓存未启用' });
    const key = req.params.key;
    let url = null;
    for (const f of db.listFriends(current.dbId)) {
      if (!f.avatar_thumb_url) continue;
      if (avatarCache.thumbKeyFromUrl(f.avatar_thumb_url) === key) { url = f.avatar_thumb_url; break; }
    }
    // 当前用户自己的头像也放行(header 顶部栏展示)
    if (!url) {
      const me = db.getUserByDbId(current.dbId);
      const ownUrl = me && me.avatar_url ? toThumbUrl(me.avatar_url) : null;
      if (ownUrl && avatarCache.thumbKeyFromUrl(ownUrl) === key) url = ownUrl;
    }
    if (!url) return res.status(404).json({ error: 'key 不在白名单' });
    try {
      const local = avatarCache.cached(key);
      let info = null;
      if (local) {
        avatarCache.touch(key); // 每次访问刷新 TTL
        info = { filePath: local };
      } else {
        info = await avatarCache.serve(key, url);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const contentType = info.contentType || detectImageType(info.filePath);
      if (contentType) res.setHeader('Content-Type', contentType);
      return res.sendFile(info.filePath);
    } catch (e) {
      log.error(`[avatar] 获取失败 key=${key}: ${e.message}`);
      return res.status(502).json({ error: '头像获取失败' });
    }
  });

    app.put('/api/friends/:friendId/config', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const body = req.body || {};
    db.upsertConfig(current.dbId, req.params.friendId, {
      favorite: !!body.favorite,
      notifyOnline: body.notifyOnline !== undefined ? !!body.notifyOnline : true,
      notifyOffline: body.notifyOffline !== undefined ? !!body.notifyOffline : true,
      notifyStatusChange: body.notifyStatusChange !== undefined ? !!body.notifyStatusChange : true,
      notifyWorldChange: body.notifyWorldChange !== undefined ? !!body.notifyWorldChange : true
    });
    const cfg = db.getConfig(current.dbId, req.params.friendId);
    const friend = db.getFriend(current.dbId, req.params.friendId);
    log.info(`[server] 更新监控配置: 好友=${(friend && friend.display_name) || req.params.friendId}, 特别关注=${cfg ? (cfg.favorite ? '开' : '关') : '?'}, 上线=${cfg ? cfg.notify_online : '?'}, 下线=${cfg ? cfg.notify_offline : '?'}, 状态=${cfg ? cfg.notify_status_change : '?'}, 世界=${cfg ? cfg.notify_world_change : '?'}`);
    return res.json({ ok: true, config: cfg });
  });

  app.get('/api/settings', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    return res.json({ ok: true, settings: maskSettings(db.getGlobalSettings()) });
  });

  app.put('/api/settings', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const body = req.body || {};
    const prev = db.getGlobalSettings();
    const fields = {};
    for (const [camel, snake] of Object.entries(SETTING_MAP)) {
      const raw = body[camel] !== undefined ? body[camel] : body[snake];
      if (raw === undefined) continue;
      if (SECRET_FIELDS.has(snake)) {
        if (raw === MASK) { fields[snake] = prev[snake] || null; continue; }
        fields[snake] = (raw === '' || raw === null) ? null : String(raw);
      } else {
        fields[snake] = raw;
      }
    }
    db.updateGlobalSettings(fields);
    if (qq) qq.sync(current.dbId, db.getGlobalSettings());
    const changed = Object.entries(fields).map(([k, v]) => (SECRET_FIELDS.has(k) ? `${k}=${v ? '***' : '空'}` : `${k}=${v === null ? '空' : String(v)}`)).join(', ');
    log.info(`[server] 更新通知设置: ${changed || '(无字段变化)'}`);
    return res.json({ ok: true, settings: maskSettings(db.getGlobalSettings()) });
  });

  app.post('/api/test/:kind', async (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const forSend = { id: current.dbId, ...db.getGlobalSettings() };
    try {
      log.info(`[server] 发送测试通知: ${req.params.kind}`);
      const result = await notifier.sendTest(forSend, req.params.kind);
      if (result && result.ok === false) {
        log.error(`[server] 测试通知发送失败(${req.params.kind}): ${result.reason}`);
        return res.status(502).json({ ok: false, error: result.reason, result });
      }
      log.info(`[server] 测试通知发送成功: ${req.params.kind}`);
      return res.json({ ok: true, result });
    } catch (e) {
      log.error(`[server] 测试通知失败: ${e.message}`);
      return res.status(500).json({ error: '发送失败', result: { ok: false, reason: e.message } });
    }
  });

  app.get('/api/status', (req, res) => {
    const active = monitor.activeUsers();
    const ws = current ? pipeline.status(current.userId) : null;
    const u = current ? maskUser(db.getUserByDbId(current.dbId)) : null;
    if (u) {
      if (avatarCache && u.avatar_url) {
        u.avatarKey = avatarCache.thumbKeyFromUrl(toThumbUrl(u.avatar_url)) || null;
      }
    }
    return res.json({
      ok: true,
      loggedIn: !!current,
      user: u,
      activeUsers: active.map((a) => a.user.vrchat_user_id),
      wsConnected: !!(ws && ws.connected),
      wsLastMessageAt: ws ? ws.lastMessageAt : null,
      qq: qq && current ? qq.status(current.dbId) : null,
      lastSnapshotAt,
      pending2faCount: pending2fa.size,
      config: {
        confirmDelayMs: config.confirmDelayMs ?? 30000,
        snapshotIntervalMs: config.snapshotIntervalMs ?? 3600000,
        watchdogMs: config.watchdogMs ?? 3600000,
        dedupeWindowMs: config.dedupeWindowMs ?? 30000
      }
    });
  });

  app.post('/api/monitor/snapshot', async (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
      try {
        const t0 = Date.now();
        const result = await monitor.runSnapshot(current.userId, { noRetry: true });
      if (!result || result.ok === false) {
        log.error(`[server] 手动对账失败: ${(result && result.error) || '未知错误'}`);
        return res.status(502).json({ error: `对账失败: ${(result && result.error) || '未知错误'}` });
      }
      log.info(`[server] 手动对账完成: 好友 ${result.count} 人, 耗时 ${Date.now() - t0}ms`);
      return res.json({ ok: true, lastSnapshotAt });
    } catch (e) {
      log.error(`[server] 手动对账失败: ${e.message}`);
      return res.status(500).json({ error: '对账失败' });
    }
  });

  // 后端日志尾部/增量拉取(SSE 重连补拉用 after=seq); 前端直接展示后端日志
  app.get('/api/logs', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    if (!logStreamRef) return res.json({ ok: true, logs: [], seq: 0 });
    const tailN = Math.min(Math.max(parseInt(req.query.tail, 10) || 100, 1), 1000);
    const afterSeq = parseInt(req.query.after, 10);
    const entries = Number.isFinite(afterSeq) ? logStreamRef.after(afterSeq, 1000) : logStreamRef.tail(tailN);
    return res.json({ ok: true, logs: entries, seq: logStreamRef.lastSeq() });
  });

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (e) { /* closed */ }
    }, 25000);
    keepAlive.unref?.();
    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

  if (publicDir) {
    app.use(express.static(publicDir));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log.error(`[server] 未处理错误: ${err && err.message}`);
    if (res.headersSent) return;
    res.status(500).json({ error: '服务器内部错误' });
  });

  return { app, autoLogin: tryAutoLogin, getConnectionStatus };
}

module.exports = { createApp };
