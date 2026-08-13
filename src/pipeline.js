'use strict';
// VRChat pipeline WebSocket 客户端管理: 连接/断线重连(指数退避+jitter)/帧去重/
// per-user 串行队列/protocol ping-pong 保活(尽力而为)/失败告警。
// 注意: VRChat 协议无应用层心跳, 存活兜底由 monitor 的 watchdog + 周期快照负责。

const WebSocket = require('ws');

function createPipelineManager(opts) {
  const {
    getToken, onMessage, wsUrl, userAgent,
    now = Date.now, logger = null,
    onConnectFailure = null, onConnectRecovered = null, onReconnect = null,
    onOpen = null, onClose = null,
    WsClient = WebSocket,
    config = {}
  } = opts;

  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  const pingIntervalMs = config.pingIntervalMs ?? 10000;
  const pongTimeoutMs = config.pongTimeoutMs ?? 30000;
  const reconnectBaseMs = config.reconnectBaseMs ?? 5000;
  const reconnectMaxMs = config.reconnectMaxMs ?? 3600000;
  const jitterMs = config.jitterMs ?? 1000;
  const failNotifyMs = config.failNotifyMs ?? 5 * 60 * 1000;

  const conns = new Map();   // userId -> conn
  const chains = new Map();  // userId -> promise chain
  const msgCounts = new Map(); // 秒 -> 收到消息数(供最近一分钟图表)

  function noteMessage(atMs) {
    const sec = Math.floor(atMs / 1000);
    msgCounts.set(sec, (msgCounts.get(sec) || 0) + 1);
  }

  function pruneMessageCounts(nowMs) {
    const cutoffSec = Math.floor(nowMs / 1000) - 60;
    for (const sec of [...msgCounts.keys()]) {
      if (sec < cutoffSec) msgCounts.delete(sec);
    }
  }

  // 最近 60 个秒桶(下标 0 = 最早, 59 = 当前秒)+ 总量
  function messageSeries(nowMs = Date.now()) {
    pruneMessageCounts(nowMs);
    const endSec = Math.floor(nowMs / 1000);
    const series = [];
    let total = 0;
    for (let s = endSec - 59; s <= endSec; s++) {
      const n = msgCounts.get(s) || 0;
      series.push(n);
      total += n;
    }
    return { series, total };
  }

  function ensureConn(userId, displayName) {
    let conn = conns.get(userId);
    if (!conn) {
      conn = {
        ws: null,
        lastRaw: '',
        lastMessageAt: 0,
        pingTimer: null,
        pongTimer: null,
        reconnectTimer: null,
        displayName: displayName || '',
        stopped: false,
        attempt: 0,
        watchdogForced: false,
        failedSince: null,
        notified: false
      };
      conns.set(userId, conn);
    } else if (displayName) {
      conn.displayName = displayName;
    }
    return conn;
  }

  function clearTimers(conn) {
    if (conn.pingTimer) { clearInterval(conn.pingTimer); conn.pingTimer = null; }
    if (conn.pongTimer) { clearTimeout(conn.pongTimer); conn.pongTimer = null; }
    if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer); conn.reconnectTimer = null; }
  }

  function backoffMs(attempt) {
    const base = Math.min(reconnectBaseMs * Math.pow(2, attempt), reconnectMaxMs);
    return base + Math.floor(Math.random() * jitterMs);
  }

  function summarizeFrame(parsed) {
    const type = parsed && typeof parsed.type === 'string' ? parsed.type : '?';
    const c = parsed && parsed.content;
    const parts = [`type=${type}`];
    if (c && typeof c === 'object') {
      const id = c.user && c.user.id || c.userId || c.userid || c.senderUserId || '';
      if (id) parts.push(`userId=${id}`);
      if (typeof c.location === 'string') parts.push(`location=${c.location}`);
      if (c.user && c.user.displayName) parts.push(`displayName=${c.user.displayName}`);
      if (typeof c.title === 'string' && c.title) parts.push(`title=${c.title.slice(0, 40)}`);
    } else if (typeof c === 'string' && c) {
      parts.push(`content=${c.slice(0, 40)}`);
    }
    let line = parts.join(' ').replace(/[\r\n]+/g, ' ').trim();
    return line.length <= 300 ? line : line.slice(0, 300) + '...';
  }

  function maybeNotifyFailure(userId, conn) {
    if (conn.notified || !conn.failedSince) return;
    if (now() - conn.failedSince >= failNotifyMs) {
      conn.notified = true;
      log.warn(`[ws] userId=${userId} 连续断线超过 ${Math.round(failNotifyMs / 1000)}s, 通知用户`);
      onConnectFailure?.(userId, conn.displayName);
    }
  }

  function scheduleReconnect(userId, conn) {
    if (conn.stopped) return;
    if (!conn.failedSince) conn.failedSince = now();
    const delay = backoffMs(conn.attempt);
    conn.attempt += 1;
    log.info(`[ws] userId=${userId} ${delay}ms 后重连(第 ${conn.attempt} 次)`);
    maybeNotifyFailure(userId, conn);
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      if (conn.stopped) return;
      connectPipeline(userId, conn.displayName).catch((e) => {
        log.error(`[ws] 重连异常 userId=${userId}: ${e.message}`);
        scheduleReconnect(userId, conn);
      });
    }, delay);
  }

  function startPing(conn) {
    if (conn.pingTimer) return;
    const ws = conn.ws;
    conn.pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try { ws.ping(); } catch (e) { return; }
      if (conn.pongTimer) clearTimeout(conn.pongTimer);
      conn.pongTimer = setTimeout(() => {
        // 多次 ping 无 pong: 判定为僵尸连接, 强制断开走重连
        log.warn(`[ws] pong 超时, 强制断开`);
        try { ws.terminate(); } catch (e) { /* ignore */ }
      }, pongTimeoutMs);
    }, pingIntervalMs);
  }

  async function connectPipeline(userId, displayName) {
    const conn = ensureConn(userId, displayName);
    if (conn.ws && (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING)) return;

    const result = await getToken(userId);
    // 取 token 期间可能已被 disconnect / forceReconnect: 放弃本次连接
    if (conn.stopped || conns.get(userId) !== conn) return;
    if (result.status !== 'ok') {
      if (conn.stopped) return;
      scheduleReconnect(userId, conn);
      return;
    }

    if (conn.ws) {
      try { conn.ws.removeAllListeners(); conn.ws.close(); } catch (e) { /* ignore */ }
    }

    const ws = new WsClient(wsUrl(result.token), { headers: { 'User-Agent': userAgent } });
    conn.ws = ws;

    ws.on('open', () => {
      log.info(`[ws] 已连接 userId=${userId}`);
      const wasFailing = conn.notified || !!conn.failedSince;
      const isWatchdog = !!conn.watchdogForced;
      conn.watchdogForced = false;
      conn.attempt = 0;
      conn.failedSince = null;
      conn.notified = false;
      conn.lastMessageAt = now();
      conn.lastRaw = ''; // 新连接: 清空上次连接的帧去重基线, 避免重连后首帧被吞
      startPing(conn);
      if (onOpen) {
        try { onOpen(userId, conn.displayName, wasFailing, isWatchdog); } catch (e) { log.error(`[ws] onOpen 错误 userId=${userId}: ${e.message}`); }
      }
      if (wasFailing && onReconnect) {
        try { onReconnect(userId, conn.displayName); } catch (e) { log.error(`[ws] onReconnect 错误 userId=${userId}: ${e.message}`); }
      }
      if (wasFailing && onConnectRecovered) onConnectRecovered(userId, conn.displayName);
    });

    ws.on('message', (data) => {
      const raw = data.toString();
      if (raw === conn.lastRaw) return; // 帧去重
      conn.lastRaw = raw;
      conn.lastMessageAt = now();
      noteMessage(now());
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
        if (parsed && typeof parsed.content === 'string') {
          try { parsed.content = JSON.parse(parsed.content); } catch (e) { /* see/hide 通知 content 为 ID 字符串 */ }
        }
      } catch (e) {
        log.warn(`[ws] 帧解析失败: ${e.message}`);
        return;
      }
      if (parsed && parsed.err) {
        log.warn(`[ws] 服务端错误帧: ${parsed.err}`);
        try { ws.close(); } catch (e) { /* ignore */ }
        return;
      }
      log.info(`[ws] 收到消息 userId=${userId}: ${summarizeFrame(parsed)}`);
      if (!onMessage) return;
      const prev = chains.get(userId) || Promise.resolve();
      chains.set(userId, prev
        .then(() => onMessage(userId, raw, parsed))
        .catch((e) => log.error(`[ws] onMessage 错误 userId=${userId}: ${e.message}`)));
    });

    ws.on('pong', () => {
      if (conn.pongTimer) { clearTimeout(conn.pongTimer); conn.pongTimer = null; }
    });

    ws.on('close', () => {
      clearTimers(conn);
      if (conn.stopped) {
        conns.delete(userId);
        return;
      }
      if (onClose) {
        try { onClose(userId); } catch (e) { log.error(`[ws] onClose 错误 userId=${userId}: ${e.message}`); }
      }
      log.info(`[ws] 断开 userId=${userId}`);
      scheduleReconnect(userId, conn);
    });

    ws.on('error', (e) => {
      log.warn(`[ws] 错误 userId=${userId}: ${e.message}`);
      // close 事件会负责重连
    });
  }

  function connect(userId, displayName) {
    connectPipeline(userId, displayName).catch((e) => log.error(`[ws] connect 异常 userId=${userId}: ${e.message}`));
  }

  function disconnect(userId) {
    const conn = conns.get(userId);
    if (!conn) return;
    conn.stopped = true;
    clearTimers(conn);
    if (conn.ws) { try { conn.ws.terminate(); } catch (e) { /* ignore */ } }
    conns.delete(userId);
    chains.delete(userId);
    log.info(`[ws] 主动断开 userId=${userId}`);
  }

  function forceReconnect(userId) {
    const conn = conns.get(userId);
    if (!conn || conn.stopped) return;
    conn.watchdogForced = true; // watchdog 强制重连: 成功后不推送恢复/已连接通知
    if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer); conn.reconnectTimer = null; }
    conn.attempt = 0;
    if (conn.ws) {
      try { conn.ws.removeAllListeners('close'); conn.ws.close(); } catch (e) { /* ignore */ }
      conn.ws = null;
    }
    clearTimers(conn);
    scheduleReconnect(userId, conn);
  }

  function isConnected(userId) {
    const conn = conns.get(userId);
    return !!(conn && conn.ws && conn.ws.readyState === WebSocket.OPEN);
  }

  function lastMessageAt(userId) {
    const conn = conns.get(userId);
    return conn ? conn.lastMessageAt : 0;
  }

  function status(userId) {
    const conn = conns.get(userId);
    if (!conn) return null;
    return {
      connected: isConnected(userId),
      attempt: conn.attempt,
      failedSince: conn.failedSince,
      notified: conn.notified,
      lastMessageAt: conn.lastMessageAt
    };
  }

  return { connect, disconnect, forceReconnect, isConnected, lastMessageAt, status, messageSeries };
}

module.exports = { createPipelineManager };
