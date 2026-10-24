'use strict';
// Express HTTP 服务: 登录/2FA/会话/好友/监控配置/设置/测试/状态/SSE + 静态 UI。

const express = require('express');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { CookieJar } = require('./cookiejar');
const { parseLocation } = require('./location');
const { detectImageType } = require('./avatar');
const { isMissingCredentials, isUnauthorized } = require('./vrcapi');
const { formatLocalTime, getLogStream, avatarFields } = require('./util');
const { currentVersion } = require('./version');
const { createClientDtos } = require('./client-dto');

const { FRIEND_CONFIG } = require('../public/contracts');
const { parseFriendConfig, parseSettings, configOf } = require('./api-contract');

const MASK = '••••••••';
const SECRET_FIELDS = new Set(['qq_app_secret']);
// 日志筛选(服务端): 多选集合语义 — 选中集合=匹配集合(选一个只显示一个);
// null=参数省略, 该维度不过滤; 空数组=不匹配任何行; 无法解析的行恒匹配(前端强制显示, 不受任何筛选)。
function logLineMatches(line, levelSel, catSel) {
  const m = /^\[[^\]]+\] \[(debug|info|warn|error)\] \[([^\]]+)\] /.exec(String(line));
  if (!m) return true;
  return (!levelSel || levelSel.includes(m[1])) && (!catSel || catSel.includes(m[2]));
}
// 解析筛选参数: undefined/null=省略(不过滤); ''=空集(不匹配); 'a,b'=选中集合
function parseLogSel(q) {
  if (q === undefined || q === null) return null;
  return String(q).split(',').map((s) => s.trim()).filter(Boolean);
}

function createApp({
  db, notifier, pipeline, monitor,
  sessionStore = new Map(), vrcapiFactory, config = {}, logger = null,
  now = Date.now, publicDir = null, avatarCache = null, qq = null, logStream = null,
  fileLog = null, maskState = null, healthMonitor = null, vrcStatus = null
}) {
  const log = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const app = express();
  const bus = monitor.events;
  const worldNameSvc = monitor.worldName || null; // 世界名查询模块(读接口同步补名字用)
  const logStreamRef = logStream || getLogStream(); // 后端日志流: 未注入时回退全局
  const fileLogRef = fileLog;      // 本地日志文件(向前翻页数据源)
  const maskRef = maskState;       // 前端流令牌打码状态
  // 服务端出站令牌打码: 只要配置了令牌就一律替换, 不依赖「首次连接成功」标志 ——
  // 日志段跨重启存活后, 上一轮落盘的令牌行在本轮 ws-open 之前就会出站, 必须始终打码。
  const maskOut = (line) => {
    if (!maskRef || !maskRef.token) return line;
    return String(line).split(maskRef.token).join(maskRef.masked);
  };
  const pending2faTtlMs = config.pending2faTtlMs ?? 5 * 60 * 1000;

  let current = null;        // { userId, dbId, vrcapi }
  let authGeneration = 0;    // 登出使此前发出的认证请求失效，即使上游已经接受了凭据
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

  const { friendRow, selfUserForClient, eventRow } = createClientDtos({ worldName: worldNameSvc, avatarCache });

  // "需要显示"的触发点: 让世界名模块去补缺的名字, 不阻塞本次响应。
  // 命中缓存时立即返回; 缺失/过期则后台查, 查到走 world-name SSE 推给前端定点更新。
  // 由路由显式调用, 序列化函数本身保持无副作用。
  function kickWorldNames(rows) {
    if (!worldNameSvc) return;
    const ids = new Set();
    for (const r of rows || []) {
      for (const col of ['world_id', 'old_world_id']) {
        if (r && r[col] && r[col] !== 'private') ids.add(r[col]);
      }
    }
    for (const id of ids) worldNameSvc.get(id).catch(() => {}); // get 保证不抛出, 这里只是兜底
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
    // 好友是全局的(不带账号列), 所以库里那份好友属于谁只能看 users 表:
    // 表里已经坐着别的账号, 说明这批好友不属于现在登录的人, 先清掉再拉新的。
    // 正常换账号会先登出(登出已清), 这道是兜底 —— 尤其是新账号名册拿不到时,
    // 快照「数据不全不判删」不会清理, 只能靠这里。
    if (db.listUsers().length > 0 && !db.getUserByVrcId(userId)) {
      const wiped = db.clearAccountData();
      log.info(`[server] 登录账号与库中数据不符(${userId}), 已清除上一个账号的数据: 好友 ${wiped.friends}, 去重 ${wiped.dedupe}, 用户 ${wiped.users}`);
    }
    const dbId = db.upsertUser(userId, {
      username,
      displayName: currentUser.displayName || null,
      ...avatarFields(currentUser),
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
    if (qq) qq.sync(dbId, db.getGlobalSettings());
    // currentUser 就是刚落地用的那份 GET /auth/user 响应: 交给首轮对账当种子, 不再重复请求一次。
    await monitor.activateUser(user, vrcapi, { currentUser });
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
  async function attemptAutoLogin(saved, generation = authGeneration) {
    const jar = CookieJar.deserialize(saved.cookie_data);
    const vrcapi = vrcapiFactory(jar);
    try {
      const user = await vrcapi.me({ noRetry: true, purpose: '自动登录探测' });
      if (generation !== authGeneration) return;
      if (user && user.id) {
        await finalizeLogin(vrcapi, user, { rememberMe: true, username: saved.saved_username || null });
        if (generation !== authGeneration) return;
        log.info(`[server] 自动登录成功: ${user.displayName || user.id}`);
        return;
      }
    } catch (e) {
      if (generation !== authGeneration) return;
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
          if (generation !== authGeneration) return;
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
      if (retryable) scheduleAutoLoginRetry(saved, generation);
    }
  }

  function scheduleAutoLoginRetry(saved, generation) {
    if (generation !== authGeneration || autoLoginRetryTimer || current) return;
    const delay = Math.min(autoLoginRetryBaseMs * Math.pow(2, autoLoginRetryAttempt), autoLoginRetryMaxMs) + Math.floor(Math.random() * autoLoginRetryJitterMs);
    autoLoginRetryAttempt++;
    log.warn(`[server] 自动登录 ${delay}ms 后重试(第 ${autoLoginRetryAttempt} 次)`);
    autoLoginRetryTimer = setTimeout(() => {
      autoLoginRetryTimer = null;
      if (generation !== authGeneration || current) return;
      attemptAutoLogin(saved, generation).catch((e) => log.warn(`[server] 自动登录重试异常: ${e.message}`));
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

  function invalidateAuthWork() {
    authGeneration++;
    pending2fa.clear();
    if (autoLoginRetryTimer) { clearTimeout(autoLoginRetryTimer); autoLoginRetryTimer = null; }
    for (const st of relogin.values()) clearReloginTimers(st);
    relogin.clear();
    return authGeneration;
  }

  function cancelledLogin(res) {
    return res.status(409).json({ error: '登录请求已失效，请重新登录' });
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

  // 2FA 推送正文(自动重登 / 401 会话挂起共用; 邮箱验证码多一行重发提示)
  function twofaNotifyBody(kind) {
    const label = kind === 'emailOtp' ? '邮箱验证码' : 'TOTP';
    const lines = [`VRChat 需要两步验证(${label})`, '请直接回复验证码'];
    if (kind === 'emailOtp') lines.push('未收到验证码?回复:重新发送验证码');
    return lines.join('\n');
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
    const generation = authGeneration;
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
      if (generation !== authGeneration) return;
      if (result && Array.isArray(result.requiresTwoFactorAuth)) {
        const kind = result.requiresTwoFactorAuth.includes('emailOtp') ? 'emailOtp' : result.requiresTwoFactorAuth[0];
        st.pending = { vrcapi, username, password: user.password, kind, createdAt: now() };
        log.info(`[server] 自动重登需要 2FA(${kind}): ${userId}`);
        notifyRelogin(user, twofaNotifyBody(kind), '⚠️ 需要两步验证').catch(() => {});
        broadcast('2fa-needed', { userId });
        return;
      }
      if (!result || !result.id) throw new Error('relogin response missing user');
      await finalizeLogin(vrcapi, result, { rememberMe: true, username, password: user.password });
      if (generation !== authGeneration) return;
      log.info(`[server] 自动重新登录成功: ${userId} (${reason})`);
      finishReloginSuccess(userId, st);
      broadcast('relogin-ok', { userId });
    } catch (e) {
      if (generation !== authGeneration) return;
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
      const me = await vrcapi.me({ noRetry: true, purpose: '2FA 探测' });
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
    if (user) notifyRelogin(user, twofaNotifyBody(kind), '⚠️ 需要两步验证').catch(() => {});
    broadcast('2fa-needed', { userId });
  }

  // 2FA 验证码裁决: 官方判据是 POST /auth/twofactorauth/*/verify 的返回体 verified:true,
  // 不能拿随后 me() 的成败当"码对不对"的判据。实测负结果形态:
  //   200/400 + {verified:false}          → 码错
  //   400 + error("code value ... 无效")  → 码错/格式非法
  //   401 MissingCredentialsError         → 会话失效(auth cookie 没了), 不是码错
  //   其它(429/5xx/网络)                  → 交给 loginError / 网络错误处理
  async function verify2faCode(vrcapi, kind, code) {
    let body;
    try {
      body = await vrcapi.verify2fa(kind, String(code).trim());
    } catch (e) {
      if (e && e.status === 401) return { ok: false, kind: 'session', error: e };
      if (e && e.status === 400) return { ok: false, kind: 'code', error: e };
      return { ok: false, kind: 'server', error: e };
    }
    return (body && body.verified === true) ? { ok: true } : { ok: false, kind: 'code' };
  }

  // 验证码核心(QQ 与前端共用): 先判码, 再单独取身份落地。
  // 码通过后取身份失败只算会话/网络问题: 待验证会话保留(verified 标记), 重试不必再要一次码。
  async function verifyPendingCode(userId, code) {
    const generation = authGeneration;
    const cancelled = { ok: false, error: '登录请求已失效，请重新登录' };
    const st = relogin.get(userId);
    const pending = st && st.pending;
    if (!pending) return { ok: false, error: '没有待验证的登录会话' };
    if (!pending.verified) {
      const verdict = await verify2faCode(pending.vrcapi, pending.kind, code);
      if (generation !== authGeneration) return cancelled;
      if (!verdict.ok) {
        if (verdict.kind === 'code') return { ok: false, error: '验证码错误或已过期' };
        if (verdict.kind === 'session') {
          st.pending = null; // auth cookie 没了: 重试没有意义, 让用户重新走登录
          return { ok: false, error: '登录会话已过期, 请重新登录' };
        }
        log.warn(`[server] 2FA 验证失败(${userId}): ${verdict.error && verdict.error.message}`);
        return { ok: false, error: '网络错误, 请稍后再试' };
      }
      pending.verified = true;
    }
    let me;
    try {
      me = await pending.vrcapi.me({ purpose: '登录取身份' });
      if (generation !== authGeneration) return cancelled;
      if (!me || !me.id) throw new Error('2fa verify missing user');
    } catch (e) {
      if (generation !== authGeneration) return cancelled;
      log.warn(`[server] 2FA 已验证通过但取账号信息失败(${userId}): ${e.message}`);
      return { ok: false, error: '验证码已通过, 但获取账号信息失败, 请重试' };
    }
    st.pending = null;
    try {
      await finalizeLogin(pending.vrcapi, me, { rememberMe: true, username: pending.username, password: pending.password });
      if (generation !== authGeneration) return cancelled;
    } catch (e) {
      if (generation !== authGeneration) return cancelled;
      log.warn(`[server] 2FA 已验证通过但落地失败(${userId}): ${e.message}`);
      return { ok: false, error: '验证码已通过, 但同步数据失败, 请重试' };
    }
    finishReloginSuccess(userId, st);
    log.info(`[server] 2FA 验证成功: ${userId}`);
    broadcast('relogin-ok', { userId });
    return { ok: true };
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

  // QQ 命令钩子: 验证码 / 重发(重发|重发验证码|重新发送验证码|重更新发送验证码|r, 大小写不敏感); 未消费返回 null(回落在线列表)
  async function handleAuthCommand(dbId, content) {
    const text = String(content || '').trim();
    const user = db.getUserByDbId(dbId);
    if (!user) return null;
    const userId = user.vrchat_user_id;
    if (/^(?:重发(?:验证码)?|重新发送验证码|重更新发送验证码|r)$/i.test(text)) {
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
    const selfRow = current ? db.getUserByDbId(current.dbId) : null;
    kickWorldNames([selfRow]);
    const u = current ? selfUserForClient(selfRow) : null;
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
  bus.on('friend-state', ({ friendId }) => {
    broadcast('friend-state', { friend_vrchat_id: friendId, friend: friendRow(db.getFriend(friendId)) });
  });
  bus.on('friend-event', (e) => broadcast('friend-event', eventRow(e)));
  // 世界名按需查到名字 → 推给前端定点更新那一行(前端从不等待世界名)
  bus.on('world-name', (e) => broadcast('world-name', e));
  bus.on('session-expired', ({ userId }) => {
    handleSessionExpired(userId);
    broadcast('session-expired', { userId });
    broadcast('status', statusPayload());
  });
  bus.on('ws-failure', (e) => broadcast('ws-failure', e));
  // 登录进度: 登录路由与 monitor 都往 bus 上发, 这里统一转 SSE(前端等待页照它逐行点亮)
  bus.on('sync-progress', (e) => broadcast('login-progress', e));
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
    // 路径统一转小写再比对: Express 路由默认大小写不敏感(caseSensitive:false), 本中间件必须与
    // 路由同口径 —— 否则 /API/status、/Api/Status 会跳过 token 检查却仍被路由命中(令牌门失效)。
    const pathname = (req.path || req.url.split('?')[0]).toLowerCase().replace(/\/+$/, '');
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
      encryptionEnabled: !!config.encryptionEnabled,
      encryptionMode: config.encryptionMode || (config.encryptionEnabled ? 'encrypted' : 'none'),
      version: currentVersion()
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
    const generation = invalidateAuthWork();
    for (const [id, p] of pending2fa) {
      if (now() - p.createdAt > pending2faTtlMs) pending2fa.delete(id);
    }
    const vrcapi = vrcapiFactory();
    let result;
    try {
      result = await vrcapi.login(String(username), String(password));
      if (generation !== authGeneration) return cancelledLogin(res);
      if (result && Array.isArray(result.requiresTwoFactorAuth)) {
        const tempSessionId = randomBytes(8).toString('hex');
        pending2fa.set(tempSessionId, { vrcapi, username: String(username), password: String(password), rememberMe: !!rememberMe, createdAt: now(), generation });
        log.info(`[server] 登录需要 2FA: username=${username}, kinds=${result.requiresTwoFactorAuth.join(',')}`);
        return res.json({ ok: true, requiresTwoFactorAuth: result.requiresTwoFactorAuth, tempSessionId });
      }
      if (!result || !result.id) throw new Error('login response missing user');
    } catch (e) {
      if (generation !== authGeneration) return cancelledLogin(res);
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
    // VRChat 已经接受凭据: 日志与进度都打在这一刻, 不等后面的好友同步 ——
    // 前端等待页照它逐行点亮, 打在同步之后会与界面顺序错位。
    log.info(`[server] 登录成功: ${result.displayName || result.id} (rememberMe=${!!rememberMe}), 开始同步好友`);
    bus.emit('sync-progress', { userId: result.id, stage: 'verified', at: now() });
    try {
      const user = await finalizeLogin(vrcapi, result, { rememberMe: !!rememberMe, username: String(username), password: String(password) });
      if (generation !== authGeneration) return cancelledLogin(res);
      kickWorldNames([user]);
      return res.json({ ok: true, user: selfUserForClient(user) });
    } catch (e) {
      if (generation !== authGeneration) return cancelledLogin(res);
      log.error(`[server] 登录已通过但落地失败: ${e.message}`);
      return res.status(500).json({ error: '登录已通过, 但同步数据失败, 请重试' });
    }
  });

  app.post('/api/login/2fa', async (req, res) => {
    const { tempSessionId, code, kind } = req.body || {};
    if (!tempSessionId || !code) return res.status(400).json({ error: '缺少参数' });
    const pending = pending2fa.get(tempSessionId);
    if (!pending) return res.status(400).json({ error: '登录会话已过期, 请重新登录' });
    const { generation } = pending;
    // ① 验证码裁决: 以 POST 返回体的 verified 为准(不再拿 me() 的成败当判据)。
    //    已经通过过(取身份失败后的重试)则跳过 —— TOTP 码会轮换, 不能逼用户重新过一遍。
    if (!pending.verified) {
      const verdict = await verify2faCode(pending.vrcapi, String(kind || 'emailOtp').toLowerCase(), code);
      if (generation !== authGeneration) return cancelledLogin(res);
      if (!verdict.ok) {
        if (verdict.kind === 'code') {
          log.warn('[server] 2FA 验证失败: 验证码错误或已过期');
          return res.status(400).json({ error: '验证码错误或已过期' });
        }
        if (verdict.kind === 'session') {
          // 401 MissingCredentialsError: auth cookie 没了, 重试没有意义
          pending2fa.delete(tempSessionId);
          log.warn('[server] 2FA 验证会话失效(Missing Credentials), 需重新登录');
          return res.status(400).json({ error: '登录会话已过期, 请重新登录' });
        }
        const friendly = loginError(verdict.error);
        if (friendly) {
          if (friendly.error.startsWith('登录过于频繁')) log.warn(`[server] 2FA 被限流: ${verdict.error.message}`);
          return res.status(friendly.status).json({ error: friendly.error });
        }
        log.error(`[server] 2FA 验证失败: ${verdict.error && verdict.error.message}`);
        return res.status(500).json({ error: '验证失败, 请重试' });
      }
      pending.verified = true;
    }
    // ② 取身份: 码已经过了, 这一步失败只算会话/网络问题 —— 保留 pending 供原地重试
    let currentUser;
    try {
      currentUser = await pending.vrcapi.me({ purpose: '登录取身份' });
      if (generation !== authGeneration) return cancelledLogin(res);
      if (!currentUser || !currentUser.id) throw new Error('2fa verify missing user');
    } catch (e) {
      if (generation !== authGeneration) return cancelledLogin(res);
      log.warn(`[server] 2FA 已验证通过但取账号信息失败: ${e.message}`);
      return res.status(503).json({ error: '验证码已通过, 但获取账号信息失败, 请重试' });
    }
    pending2fa.delete(tempSessionId);
    // 验证码已通过(VRChat 2xx)且拿到用户信息: 此刻记日志并让前端淡入等待页,
    // 后面的好友同步要花几秒(好友多时几十秒), 不该压在这两行日志之前。
    log.info(`[server] 2FA 验证通过: ${currentUser.displayName || currentUser.id}, 开始同步好友`);
    bus.emit('sync-progress', { userId: currentUser.id, stage: 'verified', at: now() });
    try {
      const user = await finalizeLogin(pending.vrcapi, currentUser, { rememberMe: pending.rememberMe, username: pending.username, password: pending.password });
      if (generation !== authGeneration) return cancelledLogin(res);
      kickWorldNames([user]);
      return res.json({ ok: true, user: selfUserForClient(user) });
    } catch (e) {
      if (generation !== authGeneration) return cancelledLogin(res);
      log.error(`[server] 2FA 已通过但落地失败: ${e.message}`);
      return res.status(500).json({ error: '验证码正确, 但同步数据失败, 请重试' });
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
    const clearCache = !!body.clearCache;
    const clearSettings = !!body.clearSettings;
    invalidateAuthWork();
    // 机器人按旧 dbId 持有连接和凭据；删除账号/设置前先撤销其收发能力。
    if (qq) qq.stopAll();
    if (autoLoginRetryTimer) { clearTimeout(autoLoginRetryTimer); autoLoginRetryTimer = null; }
    autoLoginRetryAttempt = 0;
    autoLogin401Streak = 0;
    autoLogin401Notified = false;
    autoLoginFailingSince = 0;
    const { userId, dbId } = current || {};
    if (current && current.cookieCtx) {
      current.cookieCtx.cancelled = true;
      if (current.cookieCtx.timer) clearTimeout(current.cookieCtx.timer);
    }
    if (userId) {
      try { monitor.deactivateUser(userId); } catch (e) { log.warn(`[server] 停用失败: ${e.message}`); }
    }
    sessionStore.clear();
    if (dbId) db.clearCookies(dbId);
    // 账号数据一律清掉(不需要勾选): 好友(含逐好友配置)/通知去重/用户 —— 对下一个账号都没有意义。
    // QQ 绑定是全局的(一个 QQ 应用一份), 不在这里清。
    const r = db.clearAccountData();
    log.info(`[server] 登出清除账号数据: 好友 ${r.friends}, 去重 ${r.dedupe}, 用户 ${r.users}`);
    if (clearCache) {
      const worlds = db.clearWorldCache();
      const groups = db.clearGroupCache();
      let avatars = 0;
      try { if (avatarCache) avatars = avatarCache.clear(); } catch (e) { log.warn(`[server] 头像缓存清理失败: ${e.message}`); }
      log.info(`[server] 登出清除缓存: 世界名 ${worlds} 条, 群组名 ${groups} 条, 头像 ${avatars} 个`);
    }
    if (clearSettings) {
      const c = db.clearSettings();
      log.info(`[server] 登出彻底重置: 设置 ${c.settings} 项, QQ 绑定 ${c.bindings} 条(访问令牌保留)`);
    }
    log.info(`[server] 登出: ${userId || '无活动会话'}`);
    current = null;
    return res.json({ ok: true });
  });

  app.get('/api/session', async (req, res) => {
    if (!current) {
      try { await tryAutoLogin(); } catch (e) { log.warn(`[server] 自动登录失败: ${e.message}`); }
    }
    const selfRow = current ? db.getUserByDbId(current.dbId) : null;
    kickWorldNames([selfRow]);
    return res.json({ ok: true, loggedIn: !!current, user: current ? selfUserForClient(selfRow) : null });
  });

  app.get('/api/me', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const selfRow = db.getUserByDbId(current.dbId);
    kickWorldNames([selfRow]);
    return res.json({ ok: true, user: selfUserForClient(selfRow) });
  });

  app.get('/api/friends', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const rows = db.listFriends();
    kickWorldNames(rows);
    const friends = rows.map(friendRow);
    return res.json({ ok: true, friends });
  });

  // 头像: 未登录 401 / key 形状不对或越界 404 / 命中磁盘直接发, 否则按 key 推出地址下载。
  // 路径解析与「只能取缓存目录里的文件」由 express.static 的 root 保证, 这里不自己拼路径。
  if (!avatarCache) {
    app.use('/api/avatar', (req, res) => res.status(404).json({ error: '头像缓存未启用' }));
  } else {
    const serveAvatar = express.static(avatarCache.dir, {
      maxAge: '365d',       // -> Cache-Control: public, max-age=31536000
      immutable: true,
      index: false,
      redirect: false,      // 目录请求直接 404, 不做尾斜杠跳转
      dotfiles: 'ignore',   // 原子写盘用的 .xxx.tmp 永远不会被发出去
      setHeaders: (res, fullPath) => {
        // 只有路径校验通过才会走到这里, fullPath 是已解析好的绝对路径
        const contentType = detectImageType(fullPath);
        if (contentType) res.setHeader('Content-Type', contentType);
        avatarCache.touchPath(fullPath); // 每次访问刷新 TTL
      }
    });
    app.use('/api/avatar', (req, res, next) => {
      if (!current) return res.status(401).json({ error: '未登录' });
      next();
    });
    app.use('/api/avatar', async (req, res, next) => {
      let key;
      try {
        key = decodeURIComponent(req.path.replace(/^\//, ''));
      } catch (e) {
        return res.status(400).json({ error: 'key 非法' });
      }
      try {
        await avatarCache.ensure(key); // 本地已有则跳过; key 形状不对则什么都不做
      } catch (e) {
        log.error(`[avatar] 获取失败 key=${key}: ${e.message}`);
        return res.status(502).json({ error: '头像获取失败' });
      }
      next();
    });
    app.use('/api/avatar', serveAvatar);
    app.use('/api/avatar', (req, res) => res.status(404).json({ error: '头像不存在' }));
  }

  app.put('/api/friends/:friendId/config', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const body = req.body || {};
    const cur = db.getFriend(req.params.friendId);
    if (!cur) {
      log.warn(`[server] 更新监控配置失败: 好友不存在 id=${req.params.friendId}`);
      return res.status(404).json({ error: '好友不存在' });
    }
    let patch;
    try { patch = parseFriendConfig(body); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    db.setFriendConfig(req.params.friendId, Object.fromEntries(
      FRIEND_CONFIG.map(([key, alias]) => [alias, patch[key] === undefined ? cur[key] === 1 : patch[key] === 1])
    ));
    const cfg = db.getFriend(req.params.friendId);
    broadcast('friend-state', { friend_vrchat_id: req.params.friendId, friend: friendRow(cfg) });
    log.debug(`[server] 更新监控配置: 好友=${(cfg && cfg.display_name) || req.params.friendId}, 特别关注=${cfg ? (cfg.favorite ? '开' : '关') : '?'}, 上线=${cfg ? cfg.notify_online : '?'}, 网页上线=${cfg ? cfg.notify_web_online : '?'}, 下线=${cfg ? cfg.notify_offline : '?'}, 状态=${cfg ? cfg.notify_status_change : '?'}, 世界=${cfg ? cfg.notify_world_change : '?'}`);
    return res.json({ ok: true, config: configOf(cfg) });
  });

  // 好友动态(历史流水): 只读 + 清空。limit 给数字就夹到 1..200, 缺省/非法按 50。
  app.get('/api/friend-events', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const query = req.query || {};
    if (query.before !== undefined && query.page !== undefined) {
      return res.status(400).json({ error: 'before 与 page 不能同时使用' });
    }
    for (const key of ['before', 'page']) {
      if (query[key] !== undefined && (!/^\d+$/.test(query[key]) || !Number.isSafeInteger(Number(query[key])) || Number(query[key]) < 1)) {
        return res.status(400).json({ error: `${key} 必须是正整数` });
      }
    }
    let limit = 50;
    if (query.limit !== undefined && query.limit !== '') {
      const n = Number(query.limit);
      if (Number.isFinite(n)) limit = Math.min(200, Math.max(1, Math.trunc(n)));
    }
    const before = Number(query.before);
    // types 只要出现在查询串里就是"显式给了选择": 空串 = 一个类型都没勾 = 什么都不匹配
    // (与日志筛选同约定 —— 空集合不是"不过滤", 不过滤的表现是压根不传这个参数)
    const types = typeof query.types === 'string'
      ? query.types.split(',').filter(Boolean).slice(0, 20)
      : undefined;
    const friendId = typeof query.friendId === 'string' && query.friendId ? query.friendId : undefined;
    const search = typeof query.q === 'string' && query.q ? query.q : undefined;
    // page(从 1 起, 缺省 1)是给日志页那条分页栏用的: 与 before 游标二者取一,
    // 传了 page 就按页跳, 只传 before 就还是游标翻页(旧调用方不用改)。
    let page = 1;
    if (query.page !== undefined && query.page !== '') {
      const n = Number(query.page);
      if (Number.isFinite(n)) page = Math.max(1, Math.trunc(n));
    }
    const useCursor = Number.isFinite(before) && query.page === undefined;
    const order = query.order === 'asc' ? 'asc' : 'desc'; // 表头点时间可反转, 默认最新在前
    // "只看特别关注"开关: favorite=1 生效; 缺省/其他值都不过滤(与现有 query 参数风格一致)。
    const favorite = query.favorite === '1';
    const { events, hasMore, total } = db.listFriendEvents({
      limit, types, friendId, q: search, order, favorite,
      before: useCursor ? before : undefined,
      page: useCursor ? undefined : page
    });
    kickWorldNames(events);
    // total 是同一套筛选下的总条数, 分页栏的"共 N 条 / 第 K 页"都要它
    return res.json({ ok: true, events: events.map(eventRow), hasMore, total,
      pagination: useCursor ? 'cursor' : 'page', page: useCursor ? null : page,
      nextBefore: hasMore && events.length ? events[events.length - 1].id : null, pageSize: limit });
  });

  app.delete('/api/friend-events', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const removed = db.clearFriendEvents();
    log.info(`[server] 清空好友动态: 移除 ${removed} 条`);
    return res.json({ ok: true, removed });
  });

  app.get('/api/settings', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    return res.json({ ok: true, settings: maskSettings(db.getGlobalSettings()) });
  });

  app.put('/api/settings', (req, res) => {
    if (!current) return res.status(401).json({ error: '未登录' });
    const body = req.body || {};
    const prev = db.getGlobalSettings();
    let fields;
    try { fields = parseSettings(body); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    for (const key of SECRET_FIELDS) {
      if (fields[key] === MASK) fields[key] = prev[key] || null;
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
      updatedAt: h.updatedAt,
      stale: h.stale === true // true = 本轮探测失败, 展示的是上次成功状态
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
    const levelSel = parseLogSel(req.query.level);
    const catSel = parseLogSel(req.query.cat);
    const matches = (line) => logLineMatches(line, levelSel, catSel);
    const beforeSeq = parseInt(req.query.before, 10);
    if (Number.isFinite(beforeSeq)) {
      // 更旧的历史从本地日志文件读取(已被轮转覆盖的部分返回空); 跳过不匹配行凑满一页; 出站统一打码
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
      const logs = fileLogRef
        ? fileLogRef.readBackFiltered(beforeSeq, limit, matches).map((e) => ({ seq: e.seq, line: maskOut(e.line) }))
        : [];
      return res.json({ ok: true, logs, seq: (fileLogRef || logStreamRef).lastSeq() });
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
      return res.json({ ok: true, logs, seq: (fileLogRef || logStreamRef).lastSeq() });
    }
    // 尾部: 优先从文件读(完整历史, 不受内存 500 条环形缓冲限制); 无文件日志时回退环形缓冲。
    // 游标取文件层水位: 重启后内存流尚为空(lastSeq=0), 历史在文件里, 以文件为准
    const logs = fileLogRef
      ? fileLogRef.readBackFiltered(fileLogRef.lastSeq() + 1, tailN, matches)
          .map((e) => ({ seq: e.seq, line: maskOut(e.line) }))
      : logStreamRef.tail(tailN)
          .filter((e) => matches(e.line))
          .map((e) => ({ seq: e.seq, line: maskOut(e.line) }));
    return res.json({ ok: true, logs, seq: (fileLogRef || logStreamRef).lastSeq() });
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
    app.use(express.static(publicDir)); // 根路径由 public/index.html(新版概览)提供
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
