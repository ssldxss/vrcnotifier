'use strict';
// 应用装配与启动: 数据库/WS 管线/监控编排/HTTP 服务。

const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { createDb } = require('./db');
const { createLogger } = require('./util');
const { createVrcApi } = require('./vrcapi');
const { createNotifier } = require('./notify');
const { createPipelineManager } = require('./pipeline');
const { createMonitor } = require('./monitor');
const { createApp } = require('./server');

const DEFAULT_API_BASE = 'https://api.vrchat.cloud/api/1';
const DEFAULT_WS_BASE = 'wss://pipeline.vrchat.cloud';

function env(name, fallback = null) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
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
  const bus = opts.bus || new EventEmitter();
  const sessionStore = new Map();
  const now = opts.now || Date.now;

  const config = {
    apiBaseUrl: opts.apiBaseUrl || DEFAULT_API_BASE,
    wsBaseUrl: opts.wsBaseUrl || DEFAULT_WS_BASE,
    userAgent: opts.userAgent || 'vrcnotifier/1.0',
    accessKey: opts.accessKey || null,
    pending2faTtlMs: opts.pending2faTtlMs ?? 5 * 60 * 1000,
    monitor: {
      confirmDelayMs: opts.confirmDelayMs ?? 30000,
      dedupeWindowMs: opts.dedupeWindowMs ?? 30000,
      snapshotIntervalMs: opts.snapshotIntervalMs ?? 10 * 60 * 1000,
      watchdogMs: opts.watchdogMs ?? 10 * 60 * 1000,
      watchdogCheckMs: opts.watchdogCheckMs ?? 60 * 1000,
      ...(opts.monitor || {})
    },
    ws: {
      pingIntervalMs: opts.pingIntervalMs ?? 10000,
      pongTimeoutMs: opts.pongTimeoutMs ?? 30000,
      reconnectBaseMs: opts.reconnectBaseMs ?? 5000,
      reconnectMaxMs: opts.reconnectMaxMs ?? 60000,
      jitterMs: opts.jitterMs ?? 1000,
      failNotifyMs: opts.failNotifyMs ?? 5 * 60 * 1000,
      ...(opts.ws || {})
    }
  };

  const vrcapiFactory = opts.vrcapiFactory || ((jar) => createVrcApi({
    baseUrl: config.apiBaseUrl,
    userAgent: config.userAgent,
    cookieJar: jar,
    logger
  }));
  const notifier = opts.notifier || createNotifier({ logger });

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

  const { app, autoLogin } = createApp({
    db, notifier, pipeline, monitor, sessionStore, vrcapiFactory,
    config: {
      accessKey: config.accessKey,
      pending2faTtlMs: config.pending2faTtlMs,
      confirmDelayMs: config.monitor.confirmDelayMs,
      dedupeWindowMs: config.monitor.dedupeWindowMs,
      snapshotIntervalMs: config.monitor.snapshotIntervalMs,
      watchdogMs: config.monitor.watchdogMs
    },
    logger,
    now,
    publicDir: opts.publicDir === undefined ? path.join(__dirname, '..', 'public') : opts.publicDir
  });

  return {
    app, autoLogin, monitor, pipeline, sessionStore, db, bus,
    config
  };
}

async function main() {
  const logger = createLogger('vrcnotifier');
  const runtime = buildApplication({
    logger,
    dbPath: env('DB_PATH', path.join(__dirname, '..', 'data', 'vrcnotifier.db')),
    accessKey: env('ACCESS_KEY'),
    apiBaseUrl: env('VRC_API_URL', DEFAULT_API_BASE),
    wsBaseUrl: env('VRC_WS_URL', DEFAULT_WS_BASE),
    userAgent: env('USER_AGENT', 'vrcnotifier/1.0'),
    confirmDelayMs: envInt('CONFIRM_DELAY_MS', 30000),
    dedupeWindowMs: envInt('DEDUPE_WINDOW_MS', 30000),
    snapshotIntervalMs: envInt('SNAPSHOT_INTERVAL_MS', 10 * 60 * 1000),
    watchdogMs: envInt('WATCHDOG_MS', 10 * 60 * 1000),
    watchdogCheckMs: envInt('WATCHDOG_CHECK_MS', 60 * 1000),
    pingIntervalMs: envInt('WS_PING_INTERVAL_MS', 10000),
    pongTimeoutMs: envInt('WS_PONG_TIMEOUT_MS', 30000)
  });
  const port = envInt('PORT', 3000);
  const server = runtime.app.listen(port, () => {
    logger.info(`[启动] vrcnotifier 运行中: http://localhost:${port}`);
  });
  runtime.autoLogin().catch((e) => logger.warn(`[启动] 自动登录恢复失败: ${e.message}`));

  const shutdown = () => {
    logger.info('[退出] 正在停止监控与连接...');
    try { runtime.monitor.stopTimers(); } catch (e) { logger.warn(`[退出] stopTimers: ${e.message}`); }
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

module.exports = { buildApplication };
