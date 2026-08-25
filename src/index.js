'use strict';
// 应用装配与启动: 数据库/WS 管线/监控编排/HTTP 服务。

const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { createDb } = require('./db');
const { createLogger, setLogStream, setFileLog, maskKey, formatLocalTime } = require('./util');
const { createFileLog } = require('./filelog');
const { createCrypto, resolveMasterKey } = require('./crypto');
const { createVrcApi, isMissingCredentials, isUnauthorized } = require('./vrcapi');
const { createWorldFetcher } = require('./world');
const { createNotifier } = require('./notify');
const { createPipelineManager } = require('./pipeline');
const { createMonitor } = require('./monitor');
const { createQqManager } = require('./qq');
const { createQqCommands } = require('./qq-commands');
const { createAvatarCache } = require('./avatar');
const { createLogStream } = require('./logstream');
const { createHealthMonitor } = require('./health');
const { createVrcStatus } = require('./vrcstatus');
const { createApp } = require('./server');

const DEFAULT_API_BASE = 'https://api.vrchat.cloud/api/1';
const DEFAULT_WS_BASE = 'wss://pipeline.vrchat.cloud';

function env(name, fallback = null) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

const TOKEN_SECRET_FILE = '/run/secrets/vrcnotifier_access_token';

// 读取 Docker Secret(推荐的密钥存放方式): 文件不存在/为空/不可读 → null
function readSecretFile(file) {
  try {
    const s = String(fs.readFileSync(file, 'utf8')).trim();
    return s || null;
  } catch (e) {
    return null;
  }
}

// 访问令牌来源优先级: Docker Secret(优先, compose 挂载) → 环境变量 ACCESS_TOKEN → 数据库/遗留文件 → 自动生成
function resolveAccessToken(db, dbPath, logger, opts = {}) {
  const secretToken = readSecretFile(opts.secretFile || TOKEN_SECRET_FILE);
  if (secretToken) {
    logger.info(`[启动] 访问令牌来源: Docker Secret (${opts.secretFile || TOKEN_SECRET_FILE})`);
    return secretToken;
  }
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
  const db = opts.db || createDb(dbPath, { crypto: opts.crypto || null });
  // 后端日志流: 所有 logger 输出汇集于此, 供前端实时展示日志
  const logStream = opts.logStream || createLogStream();
  setLogStream(logStream);
  const fileLog = opts.fileLog || null; // 本地文件日志(可选, main() 传入)
  if (fileLog) setFileLog(fileLog);
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
  const encryptionEnabled = !!opts.crypto;
  const encryptionMode = opts.encryptionMode || (encryptionEnabled ? 'encrypted' : 'none');

  const config = {
    apiBaseUrl: opts.apiBaseUrl || DEFAULT_API_BASE,
    wsBaseUrl: opts.wsBaseUrl || DEFAULT_WS_BASE,
    userAgent: opts.userAgent || 'vrcnotifier/1.0',
    accessKey: opts.accessToken || null,
    corsOrigin: opts.corsOrigin || null,
    pending2faTtlMs: opts.pending2faTtlMs ?? 5 * 60 * 1000,
    encryptionEnabled,
    encryptionMode,
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
  const authCommandHooks = { fn: null };
  const qqCommands = createQqCommands({
    db, logger,
    getStatus: (dbId) => (connectionStatus.fn ? connectionStatus.fn(dbId) : null),
    onCode: (dbId, content) => (authCommandHooks.fn ? authCommandHooks.fn(dbId, content) : null)
  });
  const qq = opts.qq || createQqManager({
    db, logger,
    onCommand: qqCommands,
    onStatusChange: (info) => bus.emit('qq-status', info),
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
  const worldFetcher = opts.worldFetcher || createWorldFetcher({
    baseUrl: config.apiBaseUrl,
    userAgent: config.userAgent,
    fetchImpl: opts.fetchImpl || fetch,
    logger
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
        // 401 分流: cookie 作废(换 IP) → 自动重登; 会话挂起 → 只重过 2FA
        if (isMissingCredentials(e)) bus.emit('relogin-needed', { userId, reason: 'cookie 失效(可能 IP 变化)' });
        else if (isUnauthorized(e)) bus.emit('unauthorized-2fa', { userId });
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
    worldFetcher,
    config: config.monitor
  });
  const healthMonitor = opts.healthMonitor || createHealthMonitor({
    apiBaseUrl: config.apiBaseUrl,
    userAgent: config.userAgent,
    fetchImpl: opts.fetchImpl || fetch,
    logger,
    intervalMs: opts.healthIntervalMs ?? 60 * 1000,
    sampleCount: opts.healthSampleCount ?? 3,
    sampleTimeoutMs: opts.healthSampleTimeoutMs ?? 3000,
    onSample: (h) => bus.emit('health', h) // 每轮采样完成 → SSE 推给前端(替代 5s 轮询)
  });
  healthMonitor.start();
  const vrcStatus = opts.vrcStatus || createVrcStatus({
    apiUrl: opts.vrcStatusUrl || undefined,
    userAgent: config.userAgent,
    fetchImpl: opts.fetchImpl || fetch,
    logger,
    timeoutMs: opts.vrcStatusTimeoutMs ?? 8000
  });
  // 启动周期对账 + watchdog 定时器(单用户, 无会话时为空转)
  monitor.startTimers();

  // 前端日志流令牌打码状态: 首次连接成功后由 main() 置 active; 置位后服务端出站行一律替换令牌
  const maskState = { active: false, token: config.accessKey || null, masked: maskKey(config.accessKey) };

  const { app, autoLogin, getConnectionStatus, handleAuthCommand } = createApp({
    db, notifier, pipeline, monitor, sessionStore, vrcapiFactory, qq,
    avatarCache,
    config: {
      accessToken: config.accessKey,
      corsOrigin: config.corsOrigin,
      pending2faTtlMs: config.pending2faTtlMs,
      confirmDelayMs: config.monitor.confirmDelayMs,
      dedupeWindowMs: config.monitor.dedupeWindowMs,
      snapshotIntervalMs: config.monitor.snapshotIntervalMs,
      watchdogMs: config.monitor.watchdogMs,
      encryptionEnabled: config.encryptionEnabled,
      encryptionMode: config.encryptionMode
    },
    logger,
    now,
    publicDir: opts.publicDir || null,
    logStream: logStream,
    fileLog: opts.fileLog || null,
    maskState,
    healthMonitor,
    vrcStatus
  });
  connectionStatus.fn = getConnectionStatus;
  authCommandHooks.fn = handleAuthCommand;

  return {
    app, autoLogin, monitor, pipeline, sessionStore, db, bus,
    config, avatarCache, qq, logStream, healthMonitor, vrcStatus, fileLog, maskState, worldFetcher
  };
}

async function main() {
  const dbPath = env('DB_PATH', path.join(__dirname, '..', 'data', 'vrcnotifier.db'));
  // 日志: 内存流(前端实时展示) + 本地单文件 data/logs/vrcnotifier.log(每次启动清空重建, 10MB 覆盖)
  const logStream = createLogStream();
  setLogStream(logStream); // 提前接管: 启动期日志(含令牌行)也进前端流
  const logger = createLogger('app');
  const fileLog = dbPath === ':memory:'
    ? null
    : createFileLog({ file: path.join(path.dirname(dbPath), 'logs', 'vrcnotifier.log') });
  if (fileLog) { fileLog.open(); setFileLog(fileLog); }
  // 运行标识: 每次启动以分隔行隔开(文件清空后的首行, 前端同样可见)
  logger.info(`[启动] ======== vrcnotifier 运行开始 ${formatLocalTime()} pid=${process.pid} node=${process.version} ========`);
  // 代码版本: 容器引导(每次启动从 GitHub 拉取最新源码)注入 commit 信息; 本地开发不设置
  if (process.env.VRCN_COMMIT) {
    logger.info(`[启动] 代码版本: ${process.env.VRCN_BRANCH || 'main'} @ ${process.env.VRCN_COMMIT_SHORT || String(process.env.VRCN_COMMIT).slice(0, 12)} — ${process.env.VRCN_COMMIT_SUBJECT || '(无主题)'} (${process.env.VRCN_COMMIT_DATE || ''})`);
  }

  // 数据加密: 密钥来源优先级 Docker Secret → 环境变量 MASTER_KEY → 数据目录密钥文件(首次启动自动生成) → 兜底不加密
  let crypt = null;
  let encryptionMode = 'none';
  if (dbPath !== ':memory:') {
    const resolved = resolveMasterKey({
      envKey: env('MASTER_KEY'),
      keyFile: path.join(path.dirname(dbPath), 'master_key'),
      devNoEncrypt: process.argv.includes('--no-encrypt')
    });
    encryptionMode = resolved.mode === 'missing' ? 'none' : resolved.mode;
    if (resolved.mode === 'docker-secret') logger.info('[启动] 数据加密方式: Docker Secret');
    else if (resolved.mode === 'env') logger.info('[启动] 数据加密方式: 环境变量 MASTER_KEY');
    else if (resolved.mode === 'generated') logger.info('[启动] 数据加密方式: 主密钥已自动生成并保存到数据目录(随数据卷备份, 下次启动自动复用)');
    else if (resolved.mode === 'data-dir') logger.info('[启动] 数据加密方式: 数据目录主密钥(复用首次启动生成的密钥)');
    else logger.warn(resolved.mode === 'missing'
      ? '[启动] 未配置加密密钥，敏感数据可能明文保存'
      : '[启动] 数据加密方式: 无(--no-encrypt 开发模式, 所有数据明文存储)');
    crypt = resolved.key ? createCrypto({ masterKey: resolved.key }) : null;
  }

  const db = createDb(dbPath, { crypto: crypt });

  // 密钥不符/密文损坏: 静默清空数据(仅保留访问令牌), 记一条日志后退出, 由容器策略自动重启
  if (crypt && db.hasUndecryptableSensitive()) {
    db.wipeAllExceptToken();
    try {
      fs.rmSync(path.join(path.dirname(dbPath), 'avatars'), { recursive: true, force: true });
    } catch (e) { /* 头像缓存清理失败忽略 */ }
    logger.warn('[启动] 主密钥解密失败, 已清空数据(保留访问令牌)并重启');
    process.exit(0); // compose restart: unless-stopped 自动重启
  }

  const accessToken = resolveAccessToken(db, dbPath, logger);
  // 启动时确实输出过令牌的那一行(环境变量 ACCESS_TOKEN / 数据库已有令牌时不存在)
  const tokenLineEntry = logStream.findLast((e) => e.line.includes(accessToken));
  const runtime = buildApplication({
    logger,
    dbPath,
    db,
    accessToken,
    logStream,
    fileLog,
    crypto: crypt,
    encryptionMode,
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
    vrcStatusUrl: env('VRC_STATUS_URL'),
    publicDir: env('SERVE_STATIC') ? path.join(__dirname, '..', 'public') : null
  });
  const port = envInt('PORT', 3000);
  // 首次连接成功后: 前端日志流中的令牌行替换为打码版, 并输出一条说明; 终端与本地日志文件保留明文。
  // 只有启动时确实显示过令牌才会触发; 之后服务端出站(SSE/API)一律对令牌打码。
  runtime.bus.once('ws-open', () => {
    const { maskState } = runtime;
    if (!tokenLineEntry || maskState.active) return;
    const masked = tokenLineEntry.line.split(accessToken).join(maskState.masked);
    if (masked === tokenLineEntry.line) return;
    runtime.logStream.update(tokenLineEntry.seq, masked);
    maskState.active = true;
    logger.info(`[启动] 访问令牌已打码: 前端日志流中的令牌行已替换为 ${maskState.masked}, 终端与本地日志文件保留明文`);
  });
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
    try { runtime.healthMonitor.stop(); } catch (e) { logger.warn(`[退出] healthMonitor.stop: ${e.message}`); }
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
