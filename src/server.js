'use strict';
// Express HTTP 服务: 登录/2FA/会话/好友/监控配置/设置/测试/状态/SSE + 静态 UI。

const express = require('express');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { CookieJar } = require('./cookiejar');
const { parseLocation } = require('./location');
const { deriveStateFromSnapshot } = require('./state');
const { detectImageType, toThumbUrl } = require('./avatar');
const { isMissingCredentials, isUnauthorized } = require('./vrcapi');
const { formatLocalTime, getLogStream } = require('./util');

const MASK = '••••••••';
const SECRET_FIELDS = new Set(['qq_app_secret']);
const SETTING_MAP = {
  qqEnabled: 'qq_enabled', qqAppId: 'qq_app_id', qqAppSecret: 'qq_app_secret'
};

// 日志筛选(服务端): 级别阈值语义与前端一致(信息含全部, 警告含错误, 错误仅错误)
const LOG_LEVEL_RANK = { info: 0, warn: 1, error: 2 };
function logLineMatches(line, levelSel, catSel) {
  const m = /^\[[^\]]+\] \[(info|warn|error)\] \[([^\]]+)\] /.exec(String(line));
  const lv = m ? m[1] : 'info';
  const cat = m ? m[2] : 'other';
  return (LOG_LEVEL_RANK[lv] ?? 0) >= (LOG_LEVEL_RANK[levelSel] ?? 0)
    && (catSel === 'all' || cat === catSel);
}

function createApp({
  db, notifier, pipeline, monitor,
  sessionStore = new Map(), vrcapiFactory, config = {}, logger = null,
  now = Date.now, publicDir = null, avatarCache = null, qq = null, logStream = null,
  fileLog = null, maskState = null, healthMonitor = null, vrcStatus = null
}) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  const app = express();
  const bus = monitor.events;
  const logStreamRef = logStream || getLogStream(); // 后端日志流: 未注入时回退全局
  const fileLogRef = fileLog;      // 本地日志文件(向前翻页数据源)
  const maskRef = maskState;       // 前端流令牌打码状态(首次连接成功后由 index.js 置 active)
  // 前端流令牌打码: 置位后所有出站日志行(SSE/API)替换令牌; 终端与本地文件保留明文
  const maskOut = (line) => {
    if (!maskRef || !maskRef.active || !maskRef.token) return line;
    return String(line).split(maskRef.token).join(maskRef.masked);
  };
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
  // 自动重登参数(换 IP/cookie 失效时用保存的密码重登); 故障/恢复通知由 monitor 故障窗口负责
  const reloginMaxPerHour = config.reloginMaxPerHour ?? 5;
  const reloginRetryBaseMs = config.reloginRetryBaseMs ?? autoLoginRetryBaseMs;
  const reloginRetryMaxMs = config.reloginRetryMaxMs ?? autoLoginRetryMaxMs;
  const reloginRetryJitterMs = config.reloginRetryJitterMs ?? autoLoginRetryJitterMs;

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

  // 当前用户返回体: 附带缩略图缓存 key(优先已存的缩略图, 兜底原图转换)
  function selfUserForClient(row) {
    const out = maskUser(row);
    if (!out) return null;
    const thumbUrl = out.avatar_thumb_url || toThumbUrl(out.avatar_url);
    out.avatarKey = thumbUrl && avatarCache ? avatarCache.thumbKeyFromUrl(thumbUrl) : null;
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

  // 后端日志实时转发: 日志流每推一行, 广播给所有 SSE 客户端(前端直接展示后端日志原文, 出站打码)
  if (logStreamRef) {
    logStreamRef.subscribe((entry, kind) => {
      const payload = { seq: entry.seq, line: maskOut(entry.line) };
      const event = kind === 'update' ? 'log-update' : 'log'; // update: 令牌行被替换, 前端按 seq 同步
      for (const res of sseClients) {
        try { sseSend(res, event, payload); } catch (e) { sseClients.delete(res); }
      }
    });
  }

  function handleSessionExpired(userId) {
    if (current && current.userId === userId) {
      current = null;
      sessionStore.delete(userId);
    }
  }

  async function finalizeLogin(vrcapi, currentUser, { rememberMe, username, password }) {
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
      avatarThumbUrl: currentUser.profilePicOverrideThumbnail || currentUser.currentAvatarThumbnailImageUrl || null,
      status: currentUser.status || null,
      statusDescription: currentUser.statusDescription || null,
      platform: currentUser.last_platform || currentUser.platform || null
    });
    const cookieCtx = { cancelled: false, timer: null };
    if (rememberMe) {
      db.saveCookies(dbId, vrcapi.jar.serialize(), username);
      if (password) db.savePassword(dbId, password); // 自动重登用(VRCX 同款保存凭据)
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
    return db.getUserByDbId(dbId);
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
        // 有保存的密码: 直接走自动重登(VRCX 同款, 携带旧 cookies 免 2FA), 不再退避空转
        if (saved.password) {
          log.info(`[server] 自动登录 401 且已保存密码, 转自动重登: ${saved.vrchat_user_id}`);
          await runRelogin(saved.vrchat_user_id, 'IP 变化', jar, { countAttempt: true });
          return;
        }
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

  // ---------- 自动重新登录 / 2FA(与 VRCX 同款 API 路径) ----------
  // 每用户状态: attempts=1 小时内尝试次数, pending=等待验证码的会话,
  // retryTimer/retryAttempt=指数退避。故障/恢复通知统一由 monitor 的故障窗口负责。
  const relogin = new Map();
  const RELOGIN_PENDING_TTL_MS = 15 * 60 * 1000;

  function reloginState(userId) {
    let st = relogin.get(userId);
    if (!st) {
      st = { inFlight: false, attempts: [], pending: null, retryTimer: null, retryAttempt: 0 };
      relogin.set(userId, st);
    }
    return st;
  }

  function reloginAttempts(userId, atMs) {
    const st = relogin.get(userId);
    if (!st) return 0;
    return st.attempts.filter((t) => atMs - t < 3600000).length;
  }

  function clearReloginTimers(st) {
    if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
  }

  async function notifyRelogin(user, body, title = 'vrcnotifier') {
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
      await notifier.sendAll({ id: user.id, ...db.getGlobalSettings() }, change);
    } catch (err) {
      log.warn(`[server] 自动重登通知失败: ${err.message}`);
    }
  }

  function giveUpRelogin(userId) {
    const st = relogin.get(userId);
    if (st) clearReloginTimers(st);
    relogin.delete(userId);
    try { monitor.deactivateUser(userId); } catch (e) { log.warn(`[server] 停用失败: ${e.message}`); }
    log.warn(`[server] 自动重登放弃: ${userId}, 停用会话并通知`);
    bus.emit('session-expired', { userId });
  }

  // 指数退避重试(与 WS/自动登录一致: base*2^n 封顶 max + jitter)
  function scheduleReloginRetry(userId, st, reason, savedJar) {
    if (st.retryTimer) return;
    const delay = Math.min(reloginRetryBaseMs * Math.pow(2, st.retryAttempt), reloginRetryMaxMs) + Math.floor(Math.random() * reloginRetryJitterMs);
    st.retryAttempt += 1;
    log.info(`[server] 自动重登 ${delay}ms 后重试(第 ${st.retryAttempt} 次): ${userId}`);
    st.retryTimer = setTimeout(() => {
      st.retryTimer = null;
      if (!relogin.has(userId)) return;
      runRelogin(userId, reason, savedJar, { countAttempt: true }).catch((e) => log.error(`[server] 重登重试异常: ${e.message}`));
    }, delay);
    if (st.retryTimer.unref) st.retryTimer.unref();
  }

  // 重登成功: 清理退避状态; 故障/恢复通知由 monitor 统一故障窗口负责
  function finishReloginSuccess(userId, st) {
    clearReloginTimers(st);
    st.retryAttempt = 0;
    st.pending = null;
  }

  // 单次重登: 携带旧 cookies + 密码登录(VRCX 同款, 换 IP 免 2FA)
  async function runRelogin(userId, reason, savedJar, { countAttempt = true } = {}) {
    const user = db.getUserByVrcId(userId);
    if (!user || !user.password) { giveUpRelogin(userId); return; }
    const st = reloginState(userId);
    if (st.inFlight) return;
    if (st.pending && now() - st.pending.createdAt > RELOGIN_PENDING_TTL_MS) st.pending = null; // 过期验证会话清理
    if (countAttempt && reloginAttempts(userId, now()) >= reloginMaxPerHour) {
      log.warn(`[server] 自动重登过于频繁(1 小时 ${reloginMaxPerHour} 次): ${userId}`);
      giveUpRelogin(userId);
      return;
    }
    st.inFlight = true;
    if (countAttempt) st.attempts.push(now());
    let jar = savedJar;
    if (!jar && user.cookie_data) {
      try { jar = CookieJar.deserialize(user.cookie_data); } catch (e) { log.warn(`[server] 旧 cookie 反序列化失败, 使用空 jar: ${e.message}`); }
    }
    const vrcapi = vrcapiFactory(jar);
    const username = user.saved_username || user.username || '';
    try {
      const result = await vrcapi.login(username, user.password);
      if (result && Array.isArray(result.requiresTwoFactorAuth)) {
        const kind = result.requiresTwoFactorAuth.includes('emailOtp') ? 'emailOtp' : result.requiresTwoFactorAuth[0];
        st.pending = { vrcapi, username, password: user.password, kind, createdAt: now() };
        log.info(`[server] 自动重登需要 2FA(${kind}): ${userId}`);
        notifyRelogin(user, `⚠️ VRChat 重新登录需要两步验证(${kind === 'emailOtp' ? '邮箱验证码' : 'TOTP'})\n请回复: 验证码 6位数字(重发: 回复「重发验证码」)`, '⚠️ 需要两步验证').catch(() => {});
        broadcast('2fa-needed', { userId });
        return;
      }
      if (!result || !result.id) throw new Error('relogin response missing user');
      await finalizeLogin(vrcapi, result, { rememberMe: true, username, password: user.password });
      log.info(`[server] 自动重新登录成功: ${userId} (${reason})`);
      finishReloginSuccess(userId, st);
      broadcast('relogin-ok', { userId });
    } catch (e) {
      log.warn(`[server] 自动重新登录失败(${userId}): ${e.message}`);
      if (e && e.status === 401) {
        giveUpRelogin(userId); // 密码错误等凭证问题: 立即放弃, 不退避
        return;
      }
      // 网络/429/5xx: 指数退避重试(通知由 monitor 故障窗口负责)
      scheduleReloginRetry(userId, st, reason, savedJar);
    } finally {
      st.inFlight = false;
    }
  }

  // 运行中 Unauthorized: 会话被临时挂起, 只需重过 2FA(现有 cookies, 不重新登录)
  async function startUnauthorized2fa(userId) {
    const vrcapi = sessionStore.get(userId);
    if (!vrcapi) return;
    const user = db.getUserByVrcId(userId);
    const st = reloginState(userId);
    if (st.pending) return; // 已有待验证会话
    let kinds = null;
    try {
      const me = await vrcapi.me({ noRetry: true });
      if (me && Array.isArray(me.requiresTwoFactorAuth)) kinds = me.requiresTwoFactorAuth;
    } catch (e) {
      // 401 响应体里可能直接带 requiresTwoFactorAuth(VRCX 正是靠它弹 2FA)
      if (e && e.status === 401 && e.data && Array.isArray(e.data.requiresTwoFactorAuth)) kinds = e.data.requiresTwoFactorAuth;
      else { log.warn(`[server] Unauthorized 2FA 探测失败(${userId}): ${e.message}`); return; }
    }
    if (!kinds || !kinds.length) return;
    const kind = kinds.includes('emailOtp') ? 'emailOtp' : kinds[0];
    st.pending = { vrcapi, username: user ? (user.saved_username || user.username || '') : '', password: null, kind, createdAt: now() };
    log.info(`[server] 会话被挂起, 需要 2FA(${kind}): ${userId}`);
    if (user) notifyRelogin(user, `⚠️ VRChat 需要两步验证(${kind === 'emailOtp' ? '邮箱验证码' : 'TOTP'})\n请回复: 验证码 6位数字`, '⚠️ 需要两步验证').catch(() => {});
    broadcast('2fa-needed', { userId });
  }

  // 验证码核心(QQ 与前端共用): 验证成功 → 落库续会话 → 前端刷新
  async function verifyPendingCode(userId, code) {
    const st = relogin.get(userId);
    const pending = st && st.pending;
    if (!pending) return { ok: false, error: '没有待验证的登录会话' };
    try {
      await pending.vrcapi.verify2fa(pending.kind, String(code).trim());
      const me = await pending.vrcapi.me();
      if (!me || !me.id) throw new Error('2fa verify missing user');
      st.pending = null;
      await finalizeLogin(pending.vrcapi, me, { rememberMe: true, username: pending.username, password: pending.password });
      finishReloginSuccess(userId, st);
      log.info(`[server] 2FA 验证成功: ${userId}`);
      broadcast('relogin-ok', { userId });
      return { ok: true };
    } catch (e) {
      log.warn(`[server] 2FA 验证失败(${userId}): ${e.message}`);
      return { ok: false, error: ((e && e.status === 400) || (e && e.status === 401)) ? '验证码错误或已过期' : '网络错误, 请稍后再试' };
    }
  }

  // 重发验证码: 清 cookies(保留密码)重新登录, 触发 VRChat 重发邮件; 不消耗频控次数
  async function resendRelogin2fa(userId) {
    const st = relogin.get(userId);
    if (!st || !st.pending) return { ok: false, error: '当前没有等待验证的登录会话' };
    const user = db.getUserByVrcId(userId);
    if (!user || !user.password) return { ok: false, error: '缺少保存的凭据' };
    st.pending = null;
    db.clearCookies(user.id);
    db.savePassword(user.id, user.password); // 清 cookies 但保留密码
    log.info(`[server] 重发验证码: 重新登录 ${userId}`);
    runRelogin(userId, '重发验证码', null, { countAttempt: false }).catch((e) => log.error(`[server] 重发验证码异常: ${e.message}`));
    return { ok: true };
  }

  // QQ 命令钩子: 验证码 / 重发验证码; 未消费返回 null(回落在线列表)
  async function handleAuthCommand(dbId, content) {
    const text = String(content || '').trim();
    const user = db.getUserByDbId(dbId);
    if (!user) return null;
    const userId = user.vrchat_user_id;
    if (/^重发验证码$/.test(text)) {
      const r = await resendRelogin2fa(userId);
      return { text: r.ok ? '📧 已重新发送验证邮件, 请查收后回复验证码' : ('❌ ' + r.error) };
    }
    const m = text.match(/^(?:验证码|2fa|otp)?\s*(\d{6}|\d{4}[- ]\d{4})$/i);
    if (!m) return null;
    const st = relogin.get(userId);
    if (!st || !st.pending) return null; // 没有待验证会话: 当普通消息
    const r = await verifyPendingCode(userId, m[1]);
    return { text: r.ok ? '✅ 验证成功, 已重新登录' : ('❌ 验证失败: ' + r.error) };
  }

  bus.on('relogin-needed', ({ userId, reason }) => {
    runRelogin(userId, reason || 'cookie 失效', null, { countAttempt: true }).catch((e) => log.error(`[server] 自动重登异常: ${e.message}`));
  });
  bus.on('unauthorized-2fa', ({ userId }) => {
    startUnauthorized2fa(userId).catch((e) => log.error(`[server] Unauthorized 2FA 异常: ${e.message}`));
  });

  // 状态负载: /api/status 与 SSE 'status' 事件共用(状态变更即推, 前端不再轮询)
  function statusPayload() {
    const active = monitor.activeUsers();
    const ws = current ? pipeline.status(current.userId) : null;
    const u = current ? selfUserForClient(db.getUserByDbId(current.dbId)) : null;
    return {
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
    };
  }

  // 事件 → SSE
  bus.on('snapshot', ({ userId, count, at }) => {
    lastSnapshotAt = at || now();
    broadcast('snapshot', { userId, count, at: lastSnapshotAt });
    broadcast('status', statusPayload());
  });
  bus.on('notification', (e) => broadcast('notification', e));
  bus.on('session-expired', ({ userId }) => {
    handleSessionExpired(userId);
    broadcast('session-expired', { userId });
    broadcast('status', statusPayload());
  });
  bus.on('ws-failure', (e) => broadcast('ws-failure', e));
  bus.on('ws-open', () => broadcast('status', statusPayload()));
  bus.on('ws-close', () => broadcast('status', statusPayload()));
  bus.on('self-state', ({ userId }) => {
    broadcast('self-state', { userId });
    broadcast('status', statusPayload());
  });
  bus.on('qq-status', (e) => {
    broadcast('qq-status', e);
    broadcast('status', statusPayload());
  });
  // 健康探测结果(healthMonitor 每轮采样完成) → SSE 推送
  bus.on('health', (h) => broadcast('health', h));

  // WS 图表数据: 每秒推送最近几秒的消息数(前端 rAF 按时间锚定自行匀速左移)
  // 每 tick 补推最近 3 秒: 事件循环繁忙漏掉一个 tick 也不会丢秒, 前端按 sec 幂等去重
  if (typeof pipeline.messageSeries === 'function') {
    const wsStatsPusher = setInterval(() => {
      if (!sseClients.size) return;
      const s = pipeline.messageSeries();
      const endSec = Math.floor(Date.now() / 1000) - 1;
      for (let k = 2; k >= 0; k--) {
        broadcast('ws-stats', { sec: endSec - k, n: (s.series[s.series.length - 1 - k] || 0) });
      }
    }, 1000);
    if (wsStatsPusher.unref) wsStatsPusher.unref();
  }

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
    log.error('[server] 访问被拒绝: 缺少或错误的访问令牌');
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

  // VRChat 登录错误 → 用户可操作提示
  function loginError(e) {
    const m = String((e && e.message) || '');
    log.warn(`[server] 登录错误原始信息: status=${e && e.status} message=${m}`);
    // 登录接口的 429 报文固定带邮箱验证文案(实测), 一律按限流提示;
    // 邮箱提示只留给非 429 状态且报文含 verification link 的情况
    if ((e && e.status) === 429) {
      return { status: 429, error: '登录过于频繁/失败过多, 请稍后再试' };
    }
    if (m.includes('verification link')) {
      return { status: 429, error: '登录地点过多, 请检查邮箱, 点击验证链接后重试' };
    }
    return null;
  }

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
        pending2fa.set(tempSessionId, { vrcapi, username: String(username), password: String(password), rememberMe: !!rememberMe, createdAt: now() });
        log.info(`[server] 登录需要 2FA: username=${username}, kinds=${result.requiresTwoFactorAuth.join(',')}`);
        return res.json({ ok: true, requiresTwoFactorAuth: result.requiresTwoFactorAuth, tempSessionId });
      }
      if (!result || !result.id) throw new Error('login response missing user');
      const user = await finalizeLogin(vrcapi, result, { rememberMe: !!rememberMe, username: String(username), password: String(password) });
      log.info(`[server] 登录成功: ${user.display_name || user.vrchat_user_id} (rememberMe=${!!rememberMe})`);
      return res.json({ ok: true, user: selfUserForClient(user) });
    } catch (e) {
      if (e.status === 401) {
        log.warn('[server] 登录失败: 用户名或密码错误');
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      const friendly = loginError(e);
      if (friendly) {
        if (friendly.error.startsWith('登录过于频繁')) log.warn(`[server] 登录被限流: ${e.message}`);
        return res.status(friendly.status).json({ error: friendly.error });
      }
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
      const user = await finalizeLogin(pending.vrcapi, currentUser, { rememberMe: pending.rememberMe, username: pending.username, password: pending.password });
      log.info(`[server] 2FA 验证成功: ${user.display_name || user.vrchat_user_id}`);
      return res.json({ ok: true, user: selfUserForClient(user) });
    } catch (e) {
      if (e.status === 400 || e.status === 401) {
        log.warn('[server] 2FA 验证失败: 验证码错误或已过期');
        return res.status(400).json({ error: '验证码错误或已过期' });
      }
      const friendly = loginError(e);
      if (friendly) {
        if (friendly.error.startsWith('登录过于频繁')) log.warn(`[server] 2FA 被限流: ${e.message}`);
        return res.status(friendly.status).json({ error: friendly.error });
      }
      log.error(`[server] 2FA 验证失败: ${e.message}`);
      return res.status(500).json({ error: '验证失败, 请重试' });
    }
  });

  // 前端 2FA 弹窗提交(自动重登/Unauthorized 挂起时): 单用户取当前待验证会话
  app.post('/api/relogin/2fa', async (req, res) => {
    const code = String((req.body && req.body.code) || '').trim();
    if (!code) return res.status(400).json({ error: '请输入验证码' });
    let targetId = null;
    for (const [id, st] of relogin) {
      if (st.pending) { targetId = id; break; }
    }
    if (!targetId) return res.status(400).json({ error: '没有待验证的登录会话' });
    const r = await verifyPendingCode(targetId, code);
    if (r.ok) return res.json({ ok: true });
    return res.status(400).json({ error: r.error });
  });

  app.post('/api/logout', async (req, res) => {
    const body = req.body || {};
    const clearFriends = !!body.clearFriends;
    const clearCache = !!body.clearCache;
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
    if (clearFriends) {
      const r = db.clearFriends();
      log.info(`[server] 登出全清数据(保留设置与世界名缓存): 好友 ${r.friends}, 配置 ${r.configs}, 去重 ${r.dedupe}, 绑定 ${r.bindings}, 用户 ${r.users}`);
    }
    if (clearCache) {
      const worlds = db.clearWorldCache();
      let avatars = 0;
      try { if (avatarCache) avatars = avatarCache.clear(); } catch (e) { log.warn(`[server] 头像缓存清理失败: ${e.message}`); }
      log.info(`[server] 登出清除缓存: 世界名 ${worlds} 条, 头像 ${avatars} 个`);
    }
    log.info(`[server] 登出: ${userId}`);
    current = null;
    return res.json({ ok: true });
  });

  app.get('/api/session', async (req, res) => {
    if (!current) {
      try { await tryAutoLogin(); } catch (e) { log.warn(`[server] 自动登录失败: ${e.message}`); }
    }
    return res.json({ ok: true, loggedIn: !!current, user: current ? selfUserForClient(db.getUserByDbId(current.dbId)) : null });
  });

  app.get('/api/me', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    return res.json({ ok: true, user: selfUserForClient(db.getUserByDbId(current.dbId)) });
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
    // 当前用户自己的头像也放行(页面标题栏我的头像)
    if (!url) {
      const me = db.getUserByDbId(current.dbId);
      const ownUrl = me && (me.avatar_thumb_url || (me.avatar_url ? toThumbUrl(me.avatar_url) : null));
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
    return res.json(statusPayload());
  });

  // VRChat API 健康探测(持续进行, 无 cookie): 返回最近一轮的 3 样本平均延迟
  app.get('/api/health', (req, res) => {
    const h = healthMonitor && typeof healthMonitor.status === 'function' ? healthMonitor.status() : null;
    if (!h) return res.status(503).json({ ok: false, error: '健康探测未启用' });
    return res.json({
      ok: h.status === 'ok',
      status: h.status,
      latencyMs: h.latencyMs,
      serverName: h.serverName,
      updatedAt: h.updatedAt
    });
  });

  // 最近 60s 每秒 WS 收到消息数(前端图表, 每秒轮询)
  app.get('/api/ws-stats', (req, res) => {
    const s = typeof pipeline.messageSeries === 'function' ? pipeline.messageSeries() : null;
    if (!s) return res.status(503).json({ ok: false, error: '消息统计未启用' });
    return res.json({ ok: true, series: s.series, total: s.total });
  });

  // VRC 服务器状态: 前端调用时才请求 status.vrchat.com, 后端内存缓存 30s
  app.get('/api/vrc-status', async (req, res) => {
    const s = vrcStatus && typeof vrcStatus.status === 'function' ? await vrcStatus.status() : null;
    if (!s) return res.status(503).json({ ok: false, error: '服务器状态未启用' });
    return res.json({ ok: true, ...s });
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

  // 后端日志尾部/增量/向前翻页(SSE 重连补拉用 after=seq; 滚动加载更旧历史用 before=seq&limit=N);
  // 服务端筛选 level/cat: 直接在文件里向后凑满一页匹配行, 前端缓存里没有的历史也能翻出来。
  app.get('/api/logs', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    if (!logStreamRef) return res.json({ ok: true, logs: [], seq: 0 });
    const levelSel = String(req.query.level || 'info');
    const catSel = String(req.query.cat || 'all');
    const matches = (line) => logLineMatches(line, levelSel, catSel);
    const beforeSeq = parseInt(req.query.before, 10);
    if (Number.isFinite(beforeSeq)) {
      // 更旧的历史从本地日志文件读取(已被轮转覆盖的部分返回空); 跳过不匹配行凑满一页; 出站统一打码
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
      const logs = fileLogRef
        ? fileLogRef.readBackFiltered(beforeSeq, limit, matches).map((e) => ({ seq: e.seq, line: maskOut(e.line) }))
        : [];
      return res.json({ ok: true, logs, seq: logStreamRef.lastSeq() });
    }
    const tailN = Math.min(Math.max(parseInt(req.query.tail, 10) || 100, 1), 1000);
    const afterSeq = parseInt(req.query.after, 10);
    if (Number.isFinite(afterSeq)) {
      // SSE 断线补缺口: 优先从文件读(单一数据源, 不受内存环形缓冲容量限制); 无文件日志时回退环形缓冲
      const logs = fileLogRef
        ? fileLogRef.readAfter(afterSeq, 1000, matches).map((e) => ({ seq: e.seq, line: maskOut(e.line) }))
        : logStreamRef.after(afterSeq, 1000)
            .filter((e) => matches(e.line))
            .map((e) => ({ seq: e.seq, line: maskOut(e.line) }));
      return res.json({ ok: true, logs, seq: logStreamRef.lastSeq() });
    }
    // 尾部: 优先从文件读(完整历史, 不受内存 500 条环形缓冲限制); 无文件日志时回退环形缓冲
    const logs = fileLogRef
      ? fileLogRef.readBackFiltered(logStreamRef.lastSeq() + 1, tailN, matches)
          .map((e) => ({ seq: e.seq, line: maskOut(e.line) }))
      : logStreamRef.tail(tailN)
          .filter((e) => matches(e.line))
          .map((e) => ({ seq: e.seq, line: maskOut(e.line) }));
    return res.json({ ok: true, logs, seq: logStreamRef.lastSeq() });
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

  return { app, autoLogin: tryAutoLogin, getConnectionStatus, handleAuthCommand };
}

module.exports = { createApp };
