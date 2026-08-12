'use strict';
// 应用装配与启动: 数据库/WS 管线/监控编排/HTTP 服务。

const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { createDb } = require('./db');
const { createLogger, setLogStream } = require('./util');
const { createVrcApi } = require('./vrcapi');
const { createNotifier } = require('./notify');
const { createPipelineManager } = require('./pipeline');
const { createMonitor } = require('./monitor');
const { createQqManager } = require('./qq');
const { createQqCommands } = require('./qq-commands');
const { createAvatarCache } = require('./avatar');
const { createLogStream } = require('./logstream');
const { createApp } = require('./server');

const DEFAULT_API_BASE = 'https://api.vrchat.cloud/api/1';
const DEFAULT_WS_BASE = 'wss://pipeline.vrchat.cloud';

function env(name, fallback = null) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function resolveAccessToken(db, dbPath, logger) {
  const envToken = env('ACCESS_TOKEN');
  if (envToken) return envToken;
  const saved = db.getSetting('access_token');
  if (saved) return saved;
  // 迁移旧方案: data/token.txt 文件 -> 数据库
  if (dbPath && dbPath !== ':memory:') {
    const file = path.join(path.dirname(dbPath), 'token.txt');
    try {
      if (fs.existsSync(file)) {
        const legacy = fs.readFileSync(file, 'utf8').trim();
        if (legacy) {
          db.setSetting('access_token', legacy);
          try { fs.unlinkSync(file); } catch (e) { /* 删除失败忽略 */ }
          logger.info(`[启动] 已迁移访问令牌至数据库 (${file})`);
          return legacy;
        }
      }
    } catch (e) { /* 读取失败则忽略 */ }
  }
  const token = require('node:crypto').randomBytes(24).toString('base64url');
  try {
    db.setSetting('access_token', token);
    logger.info(`[启动] 已生成访问令牌: ${token} (已保存至数据库)`);
  } catch (e) {
    logger.info(`[启动] 访问令牌: ${token} (无法写入数据库: ${e.message})`);
  }
  return token;
}

function envInt(name, fallback) {
  const v = parseInt(env(name, ''), 10);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * 装配完整应用(可注入依赖, 便于测试)。
 * opts: dbPath, apiBaseUrl, wsBaseUrl, userAgent, accessKey,
 *       monitor 相关(confirmDelayMs/dedupeWindowMs/snapshotIntervalMs/...),
 *       ws 相关(pingIntervalMs/pongTimeoutMs/...),
 *       publicDir, logger, now, db/notifier/pipeline/monitor/vrcapiFactory 覆盖。
 */
function buildApplication(opts = {}) {
  const logger = opts.logger || createLogger('vrcnotifier');
  const dbPath = opts.dbPath || path.join(__dirname, '..', 'data', 'vrcnotifier.db');
  if (dbPath !== ':memory:') {
    try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch (e) { /* ignore */ }
  }
  const db = opts.db || createDb(dbPath);
  // 后端日志流: 所有 logger 输出汇集于此, 供前端实时展示日志
  const logStream = opts.logStream || createLogStream();
  setLogStream(logStream);
  const avatarDir = opts.avatarDir || (dbPath === ':memory:'
    ? path.join(require('node:os').tmpdir(), `vrcnotifier-avatars-${process.pid}`)
    : path.join(path.dirname(dbPath), 'avatars'));
  const avatarCache = opts.avatarCache || createAvatarCache({
    dir: avatarDir,
    logger,
    userAgent: opts.userAgent || 'vrcnotifier/1.0',
    ttlMs: opts.avatarTtlMs ?? 30 * 24 * 3600 * 1000
  });
  avatarCache.sweep();
  const bus = opts.bus || new EventEmitter();
  const sessionStore = new Map();
  const now = opts.now || Date.now;

  const config = {
    apiBaseUrl: opts.apiBaseUrl || DEFAULT_API_BASE,
    wsBaseUrl: opts.wsBaseUrl || DEFAULT_WS_BASE,
    userAgent: opts.userAgent || 'vrcnotifier/1.0',
    accessKey: opts.accessToken || null,
    corsOrigin: opts.corsOrigin || null,
    pending2faTtlMs: opts.pending2faTtlMs ?? 5 * 60 * 1000,
    monitor: {
      confirmDelayMs: opts.confirmDelayMs ?? 30000,
      dedupeWindowMs: opts.dedupeWindowMs ?? 30000,
      snapshotIntervalMs: opts.snapshotIntervalMs ?? 3600 * 1000,
      watchdogMs: opts.watchdogMs ?? 3600 * 1000,
      watchdogCheckMs: opts.watchdogCheckMs ?? 60 * 1000,
      ...(opts.monitor || {})
    },
    ws: {
      pingIntervalMs: opts.pingIntervalMs ?? 10000,
      pongTimeoutMs: opts.pongTimeoutMs ?? 30000,
      reconnectBaseMs: opts.reconnectBaseMs ?? 5000,
      reconnectMaxMs: opts.reconnectMaxMs ?? 3600000,
      jitterMs: opts.jitterMs ?? 1000,
      failNotifyMs: opts.failNotifyMs ?? 5 * 60 * 1000,
      ...(opts.ws || {})
    }
  };

  const vrcapiFactory = opts.vrcapiFactory || ((jar) => createVrcApi({
    baseUrl: config.apiBaseUrl,
    userAgent: config.userAgent,
    cookieJar: jar,
    logger,
    retryBaseMs: config.ws.reconnectBaseMs,
    retryMaxMs: config.ws.reconnectMaxMs,
    jitterMs: config.ws.jitterMs
  }));
  // 连接状态由 createApp 提供(依赖 pipeline + 自动登录状态), 先占位后注入
  const connectionStatus = { fn: null };
  const qqCommands = createQqCommands({
    db, logger,
    getStatus: (dbId) => (connectionStatus.fn ? connectionStatus.fn(dbId) : null)
  });
  const qq = opts.qq || createQqManager({
    db, logger,
    onCommand: qqCommands,
    getSettings: () => db.getGlobalSettings(),
    config: {
      tokenUrl: opts.qqTokenUrl || null,
      apiBase: opts.qqApiBase || null,
      wsUrl: opts.qqWsUrl || null,
      reconnectBaseMs: config.ws.reconnectBaseMs,
      reconnectMaxMs: config.ws.reconnectMaxMs,
      jitterMs: config.ws.jitterMs
    }
  });
  const notifier = opts.notifier || createNotifier({
    logger, qq,
    getSettings: () => db.getGlobalSettings()
  });
  let monitor = null;
  const pipeline = opts.pipeline || createPipelineManager({
    getToken: async (userId) => {
      const vrcapi = sessionStore.get(userId);
      if (!vrcapi) return { status: 'error', reason: 'no active session' };
      try {
        const r = await vrcapi.authToken();
        return r && r.token ? { status: 'ok', token: r.token } : { status: 'error', reason: 'no token' };
      } catch (e) {
        return { status: 'error', reason: e.message };
      }
    },
    onMessage: (userId, raw, parsed) => monitor.handlePipelineEvent(userId, raw, parsed),
    onReconnect: (userId) => {
      monitor.handleWsReconnect(userId).catch((e) => logger.error(`[monitor] 重连对账失败 userId=${userId}: ${e.message}`));
    },
    onOpen: (userId, displayName, wasFailing, isWatchdog) => bus.emit('ws-open', { userId, displayName, wasFailing, isWatchdog }),
    onClose: (userId) => bus.emit('ws-close', { userId }),
    wsUrl: (token) => `${config.wsBaseUrl.replace(/\/+$/, '')}?authToken=${encodeURIComponent(token)}`,
    userAgent: config.userAgent,
    logger,
    onConnectFailure: (userId, displayName) => bus.emit('ws-failure', { userId, displayName }),
    onConnectRecovered: (userId) => bus.emit('ws-recovered', { userId }),
    config: config.ws
  });
  monitor = opts.monitor || createMonitor({
    db, notifier, pipeline, bus, logger, now,
    config: config.monitor
  });
  // 启动周期对账 + watchdog 定时器(单用户, 无会话时为空转)
  monitor.startTimers();

  const { app, autoLogin, getConnectionStatus } = createApp({
    db, notifier, pipeline, monitor, sessionStore, vrcapiFactory, qq,
    avatarCache,
    config: {
      accessToken: config.accessKey,
      corsOrigin: config.corsOrigin,
      pending2faTtlMs: config.pending2faTtlMs,
      confirmDelayMs: config.monitor.confirmDelayMs,
      dedupeWindowMs: config.monitor.dedupeWindowMs,
      snapshotIntervalMs: config.monitor.snapshotIntervalMs,
      watchdogMs: config.monitor.watchdogMs
    },
    logger,
    now,
    publicDir: opts.publicDir || null,
    logStream: logStream
  });
  connectionStatus.fn = getConnectionStatus;

  return {
    app, autoLogin, monitor, pipeline, sessionStore, db, bus,
    config, avatarCache, qq, logStream
  };
}

async function main() {
  const logger = createLogger('vrcnotifier');
  const dbPath = env('DB_PATH', path.join(__dirname, '..', 'data', 'vrcnotifier.db'));
  const db = createDb(dbPath);
  const accessToken = resolveAccessToken(db, dbPath, logger);
  const runtime = buildApplication({
    logger,
    dbPath,
    db,
    accessToken,
    apiBaseUrl: env('VRC_API_URL', DEFAULT_API_BASE),
    wsBaseUrl: env('VRC_WS_URL', DEFAULT_WS_BASE),
    userAgent: env('USER_AGENT', 'vrcnotifier/1.0'),
    confirmDelayMs: envInt('CONFIRM_DELAY_MS', 30000),
    dedupeWindowMs: envInt('DEDUPE_WINDOW_MS', 30000),
    snapshotIntervalMs: envInt('SNAPSHOT_INTERVAL_MS', 3600 * 1000),
    watchdogMs: envInt('WATCHDOG_MS', 3600 * 1000),
    watchdogCheckMs: envInt('WATCHDOG_CHECK_MS', 60 * 1000),
    pingIntervalMs: envInt('WS_PING_INTERVAL_MS', 10000),
    reconnectMaxMs: envInt('RECONNECT_MAX_MS', 3600000),
    pongTimeoutMs: envInt('WS_PONG_TIMEOUT_MS', 30000),
    qqWsUrl: env('QQ_WS_URL'),
    qqApiBase: env('QQ_API_BASE'),
    publicDir: env('SERVE_STATIC') ? path.join(__dirname, '..', 'public') : null
  });
  const port = envInt('PORT', 3000);
  const server = runtime.app.listen(port, () => {
    logger.info(`[启动] vrcnotifier 运行中: http://localhost:${port}`);
  });
  try { runtime.qq.startAll(runtime.db.listUsers()); } catch (e) { logger.warn(`[startup] qq startAll failed: ${e.message}`); }

  runtime.autoLogin().catch((e) => logger.warn(`[启动] 自动登录恢复失败: ${e.message}`));

  let shuttingDown = false; // 防重复触发(双击 Ctrl+C): 第一次优雅关闭, 第二次强制退出
  const shutdown = async () => {
    if (shuttingDown) { process.exit(0); return; }
    shuttingDown = true;
    logger.info('[退出] 正在停止监控与连接...');
    try { await runtime.monitor.sendShutdownNotice(); } catch (e) { logger.warn(`[退出] 停止通知发送失败: ${e.message}`); }
    try { runtime.monitor.stopTimers(); } catch (e) { logger.warn(`[退出] stopTimers: ${e.message}`); }
    try { runtime.qq.stopAll(); } catch (e) { logger.warn(`[退出] qq.stopAll: ${e.message}`); }
    for (const { user } of runtime.monitor.activeUsers()) {
      try { runtime.monitor.deactivateUser(user.vrchat_user_id); } catch (e) { /* ignore */ }
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[启动] 致命错误:', e);
    process.exit(1);
  });
}

module.exports = { buildApplication, resolveAccessToken };
