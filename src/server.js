'use strict';
// Express HTTP 服务: 登录/2FA/会话/好友/监控配置/设置/测试/状态/SSE + 静态 UI。

const express = require('express');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { CookieJar } = require('./cookiejar');
const { parseLocation } = require('./location');
const { deriveStateFromSnapshot } = require('./state');
const { toThumbUrl, detectImageType } = require('./avatar');

const MASK = '••••••••';
const SECRET_FIELDS = new Set(['smtp_pass', 'gotify_app_token', 'qq_app_secret']);
const SETTING_MAP = {
  email: 'email',
  smtpEnabled: 'smtp_enabled',
  smtpHost: 'smtp_host', smtpPort: 'smtp_port', smtpSecure: 'smtp_secure',
  smtpUser: 'smtp_user', smtpPass: 'smtp_pass',
  emailSubjectTemplate: 'email_subject_template', emailBodyTemplate: 'email_body_template',
  gotifyEnabled: 'gotify_enabled', gotifyServerUrl: 'gotify_server_url',
  gotifyAppToken: 'gotify_app_token', gotifyPriority: 'gotify_priority',
  ntfyEnabled: 'ntfy_enabled', ntfyServerUrl: 'ntfy_server_url', ntfyTopic: 'ntfy_topic',
  ntfyPriority: 'ntfy_priority',
  webhookEnabled: 'webhook_enabled', webhookUrl: 'webhook_url', webhookMethod: 'webhook_method',
  webhookHeaders: 'webhook_headers', webhookBodyTemplate: 'webhook_body_template',
  webhookContentType: 'webhook_content_type',
  qqEnabled: 'qq_enabled', qqAppId: 'qq_app_id', qqAppSecret: 'qq_app_secret'
};

function createApp({
  db, notifier, pipeline, monitor,
  sessionStore = new Map(), vrcapiFactory, config = {}, logger = null,
  now = Date.now, publicDir = null, avatarCache = null, qq = null
}) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  const app = express();
  const bus = monitor.events;
  const pending2faTtlMs = config.pending2faTtlMs ?? 5 * 60 * 1000;

  let current = null;        // { userId, dbId, vrcapi }
  const pending2fa = new Map();
  let lastSnapshotAt = null;
  const sseClients = new Set();

  // 好友行附带头像 key(前端零解析)
  function friendRow(f) {
    const out = { ...f };
    out.avatarKey = f.avatar_thumb_url && avatarCache ? avatarCache.thumbKeyFromUrl(f.avatar_thumb_url) : null;
    return out;
  }

  function maskUser(row) {
    if (!row) return null;
    const out = { ...row };
    out.cookie_data = undefined;
    delete out.cookie_data;
    return out;
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

  function handleSessionExpired(userId) {
    if (current && current.userId === userId) {
      current = null;
      sessionStore.delete(userId);
    }
  }

  async function finalizeLogin(vrcapi, currentUser, { rememberMe, username }) {
    if (current) {
      try { monitor.deactivateUser(current.userId); } catch (e) { log.warn(`[server] 旧会话停用失败: ${e.message}`); }
      current = null;
    }
    const userId = currentUser.id;
    const dbId = db.upsertUser(userId, {
      username,
      displayName: currentUser.displayName || null,
      avatarUrl: currentUser.currentAvatarImageUrl || null
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
    if (current) return;
    const saved = db.getSavedLogin();
    if (!saved || !saved.cookie_data) return;
      const jar = CookieJar.deserialize(saved.cookie_data);
      const vrcapi = vrcapiFactory(jar);
      try {
        const user = await vrcapi.me({ noRetry: true }); // 自动登录快速失败, 避免 cookie 失效时无限退避
      if (!user || !user.id) return;
      await finalizeLogin(vrcapi, user, { rememberMe: true, username: saved.saved_username || null });
      log.info(`[server] 自动登录成功: ${user.displayName || user.id}`);
    } catch (e) {
      log.warn(`[server] 自动登录失败(会话可能已过期): ${e.message}`);
    }
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
    if ((bearer || queryToken) && (bearer || queryToken) === config.accessToken) return next();
    log.warn('[server] 访问被拒绝: 缺少或错误的访问令牌');
    return res.status(401).json({ error: '访问被拒绝: 缺少或错误的访问令牌' });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      ok: true,
      tokenRequired: !!config.accessToken,
      confirmDelayMs: config.confirmDelayMs ?? 30000,
      snapshotIntervalMs: config.snapshotIntervalMs ?? 600000,
      watchdogMs: config.watchdogMs ?? 600000,
      dedupeWindowMs: config.dedupeWindowMs ?? 30000,
      version: '0.1.0'
    });
  });

  app.post('/api/access/verify', (req, res) => {
    const { key } = req.body || {};
    if (!config.accessToken) return res.json({ ok: true });
    const ok = key === config.accessToken;
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

  app.post('/api/friends/refresh', async (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const { vrcapi } = current;
      const t0 = Date.now();
      try {
        const currentUser = await vrcapi.me({ noRetry: true });
        const [online, offline] = await Promise.all([
          vrcapi.friends({ offline: false, noRetry: true }),
          vrcapi.friends({ offline: true, noRetry: true })
        ]);
      const merged = new Map();
      for (const f of online || []) if (f && f.id) merged.set(f.id, f);
      for (const f of offline || []) if (f && f.id && !merged.has(f.id)) merged.set(f.id, f);
      let added = 0;
      let updated = 0;
      for (const [id, f] of merged) {
        const loc = parseLocation(f.location);
        const worldId = loc.isReal ? loc.worldId : (f.location === 'private' ? 'private' : null);
          const r = db.upsertFriend(current.dbId, id, {
            displayName: f.displayName,
            avatarUrl: f.currentAvatarImageUrl || null,
            avatarThumbUrl: f.profilePicOverrideThumbnail || toThumbUrl(f.currentAvatarThumbnailImageUrl) || toThumbUrl(f.currentAvatarImageUrl),
            state: deriveStateFromSnapshot(f, currentUser),
          status: f.status || 'active',
          worldId, worldName: null,
          statusDescription: f.statusDescription || null,
          platform: f.platform || null,
          lastSeen: now()
        });
        if (r.isNew) added++; else updated++;
      }
        const configs = db.listConfigs(current.dbId);
        const friends = db.listFriends(current.dbId).map((f) => ({
          ...friendRow(f),
          config: configs.find((c) => c.friend_vrchat_id === f.friend_vrchat_id) || null
        }));
      log.info(`[server] 刷新好友成功: 新增 ${added}, 更新 ${updated}, 共 ${friends.length} 人, 耗时 ${Date.now() - t0}ms`);
      return res.json({ ok: true, friends, added, updated });
    } catch (e) {
      if (e.status === 401) {
        handleSessionExpired(current.userId);
        return res.status(401).json({ error: '会话失效, 请重新登录' });
      }
      log.error(`[server] 刷新好友失败: ${e.message}`);
      return res.status(500).json({ error: '刷新好友失败' });
    }
  });

  app.put('/api/friends/:friendId/config', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const body = req.body || {};
    db.upsertConfig(current.dbId, req.params.friendId, {
      monitorEnabled: !!body.monitorEnabled,
      notifyOnline: body.notifyOnline !== undefined ? !!body.notifyOnline : true,
      notifyOffline: body.notifyOffline !== undefined ? !!body.notifyOffline : true,
      notifyStatusChange: body.notifyStatusChange !== undefined ? !!body.notifyStatusChange : true,
      notifyWorldChange: body.notifyWorldChange !== undefined ? !!body.notifyWorldChange : true
    });
    const cfg = db.getConfig(current.dbId, req.params.friendId);
    const friend = db.getFriend(current.dbId, req.params.friendId);
    log.info(`[server] 更新监控配置: 好友=${(friend && friend.display_name) || req.params.friendId}, 监控=${cfg ? (cfg.monitor_enabled ? '开' : '关') : '?'}, 上线=${cfg ? cfg.notify_online : '?'}, 下线=${cfg ? cfg.notify_offline : '?'}, 状态=${cfg ? cfg.notify_status_change : '?'}, 世界=${cfg ? cfg.notify_world_change : '?'}`);
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
    return res.json({
      ok: true,
      loggedIn: !!current,
      user: current ? maskUser(db.getUserByDbId(current.dbId)) : null,
      activeUsers: active.map((a) => a.user.vrchat_user_id),
      wsConnected: !!(ws && ws.connected),
      wsLastMessageAt: ws ? ws.lastMessageAt : null,
      qq: qq && current ? qq.status(current.dbId) : null,
      lastSnapshotAt,
      pending2faCount: pending2fa.size,
      config: {
        confirmDelayMs: config.confirmDelayMs ?? 30000,
        snapshotIntervalMs: config.snapshotIntervalMs ?? 600000,
        watchdogMs: config.watchdogMs ?? 600000,
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

  return { app, autoLogin: tryAutoLogin };
}

module.exports = { createApp };
