'use strict';
// QQ 官方机器人推送: AppID+AppSecret 获取 access_token,
// WebSocket 网关接收 C2C 消息完成 openid 绑定, 主动消息推送好友动态。
// 协议参考 https://bot.q.qq.com/wiki (api-v2: getAppAccessToken / websocket / C2C 消息)

const WebSocket = require('ws');
const { buildQq } = require('./templates');
const { STARTUP_TEXT } = require('./qq-commands');

const DEFAULT_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const DEFAULT_API_BASE = 'https://api.sgroup.qq.com';
const DEFAULT_WS_URL = 'wss://api.sgroup.qq.com/websocket';
// 事件订阅: GROUP_AND_C2C_EVENT (1 << 25) 包含 C2C_MESSAGE_CREATE / C2C_MSG_RECEIVE 等
const INTENTS = 1 << 25;
const MAX_TEXT_LEN = 2000;

function createQqManager(opts = {}) {
  const { db, logger = null, fetchImpl = fetch, WsClient = WebSocket, now = Date.now, config = {}, getSettings = null, onCommand = null } = opts;
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  const tokenUrl = config.tokenUrl || DEFAULT_TOKEN_URL;
  const apiBase = (config.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  const wsUrl = config.wsUrl || DEFAULT_WS_URL;
  const reconnectBaseMs = config.reconnectBaseMs ?? 5000;
  const reconnectMaxMs = config.reconnectMaxMs ?? 3600000;
  const jitterMs = config.jitterMs ?? 1000;
  const tokenSafetyMs = (config.tokenSafetyMs ?? 60) * 1000;

  const bots = new Map(); // dbId -> bot

  function truncate(text) {
    const s = String(text || '');
    return s.length <= MAX_TEXT_LEN ? s : s.slice(0, MAX_TEXT_LEN) + '...';
  }

  // ---------- 凭证 ----------
  async function ensureToken(bot, force = false) {
    if (!force && bot.token && bot.tokenExpiresAt && bot.tokenExpiresAt - tokenSafetyMs > now()) {
      return bot.token;
    }
    if (force) { bot.token = null; bot.tokenExpiresAt = 0; }
    if (bot.tokenPromise) return bot.tokenPromise; // 并发去重
    bot.tokenPromise = (async () => {
      log.info(`[qq] 调用端点: POST /app/getAppAccessToken appId=${bot.appId}`);
      let res;
      try {
        res = await fetchImpl(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: bot.appId, clientSecret: bot.appSecret })
        });
      } catch (e) {
        throw new Error(`获取QQ access_token失败: ${e.message}`);
      }
      let data = null;
      try { data = await res.json(); } catch (e) { /* 非 JSON 响应 */ }
      if (!res.ok || !data || !data.access_token) {
        const code = data && data.code;
        const msg = data && data.message;
        throw new Error(`获取QQ access_token失败: HTTP ${res.status}${code ? ` code=${code}` : ''}${msg ? ` ${msg}` : ''}`);
      }
      const expiresIn = parseInt(data.expires_in, 10) || 7200;
      bot.token = data.access_token;
      bot.tokenExpiresAt = now() + expiresIn * 1000;
      bot.lastError = null;
      return bot.token;
    })();
    try {
      return await bot.tokenPromise;
    } finally {
      bot.tokenPromise = null;
    }
  }

  // ---------- 发送 ----------
  async function postMessage(bot, openid, payload) {
    const token = await ensureToken(bot);
    const url = `${apiBase}/v2/users/${encodeURIComponent(openid)}/messages`;
    log.info(`[qq] 调用端点: POST /v2/users/{openid}/messages appId=${bot.appId}`);
    const doPost = () => fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `QQBot ${token}` },
      body: JSON.stringify(payload)
    });
    let res = await doPost();
    if (res.status === 401 || res.status === 403) {
      // token 失效: 强制刷新后重试一次
      await ensureToken(bot, true);
      log.info(`[qq] 调用端点: POST /v2/users/{openid}/messages(重试) appId=${bot.appId}`);
      res = await doPost();
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (e) { /* 忽略 */ }
      const code = data && data.code;
      const msg = data && data.message;
      throw new Error(`HTTP ${res.status}${code ? ` code=${code}` : ''}${msg ? ` ${msg}` : ''}`);
    }
    return res;
  }

  async function sendText(dbId, text) {
    const bot = bots.get(dbId);
    if (!bot) return { ok: false, reason: '未配置QQ机器人' };
    const binding = db.getQqBinding(dbId, bot.appId);
    if (!binding || !binding.openid) {
      return { ok: false, reason: '未绑定QQ用户: 请先在QQ中给机器人发送一条消息完成绑定' };
    }
    try {
      await postMessage(bot, binding.openid, { msg_type: 0, content: truncate(text) });
      const title = String(text).split('\n')[0] || '通知';
      log.info(`[通知] QQ 已推送: ${title}`);
      return { ok: true };
    } catch (e) {
      bot.lastError = e.message;
      log.error(`[通知] QQ 推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  // 每次服务器启动连接成功后, 向已绑定用户推送启动说明(重连不重复)
  function notifyStartup(bot) {
    if (bot.startupSent) return;
    bot.startupSent = true;
    const binding = db.getQqBinding(bot.dbId, bot.appId);
    if (!binding || !binding.openid) return;
    sendText(bot.dbId, STARTUP_TEXT).then((r) => {
      if (!r.ok && r.reason) log.warn(`[qq] 启动通知发送失败: ${r.reason}`);
    });
  }

  // 被动回复(绑定欢迎语等), 失败只告警不影响主流程
  // reply 支持字符串或 { text, markdown }: 有 markdown 走 msg_type=2, 失败回退文本
  async function sendPassive(bot, openid, msgId, reply) {
    const sendTextReply = async (content) => {
      try {
        await postMessage(bot, openid, { msg_type: 0, content: truncate(content), msg_id: msgId });
      } catch (e) {
        log.warn(`[qq] 被动回复失败: ${e.message}`);
      }
    };
    if (reply && typeof reply === 'object' && reply.markdown) {
      try {
        await postMessage(bot, openid, { msg_type: 2, markdown: { content: truncate(reply.markdown) }, msg_id: msgId });
        return;
      } catch (e) {
        log.warn(`[qq] Markdown 被动回复失败, 回退文本: ${e.message}`);
      }
      await sendTextReply(reply.text || '');
      return;
    }
    await sendTextReply(typeof reply === 'string' ? reply : String(reply || ''));
  }

  // ---------- WebSocket 网关 ----------
  function stopHeartbeat(bot) {
    if (bot.heartbeatTimer) { clearInterval(bot.heartbeatTimer); bot.heartbeatTimer = null; }
    if (bot.ackWatchTimer) { clearInterval(bot.ackWatchTimer); bot.ackWatchTimer = null; }
  }

  function clearReconnectTimer(bot) {
    if (bot.reconnectTimer) { clearTimeout(bot.reconnectTimer); bot.reconnectTimer = null; }
  }

  function sendIdentify(bot) {
    if (!bot.ws || bot.ws.readyState !== 1 || !bot.token) return;
    bot.ws.send(JSON.stringify({
      op: 2,
      d: {
        token: `QQBot ${bot.token}`,
        intents: INTENTS,
        shard: [0, 1],
        properties: { $os: process.platform, $browser: 'vrcnotifier', $device: 'vrcnotifier' }
      }
    }));
  }

  function startHeartbeat(bot) {
    stopHeartbeat(bot);
    const interval = bot.heartbeatIntervalMs;
    if (!interval || interval <= 0) return;
    const beat = () => {
      if (!bot.ws || bot.ws.readyState !== 1) return;
      bot.ws.send(JSON.stringify({ op: 1, d: bot.seq ?? null }));
    };
    beat();
    bot.heartbeatTimer = setInterval(beat, interval);
    // 心跳/消息超时兜底: 超过 3 个周期无任何消息则强制断开重连
    bot.ackWatchTimer = setInterval(() => {
      if (!bot.ws || bot.ws.readyState !== 1) return;
      if (now() - bot.lastRecvAt > interval * 3) {
        log.warn(`[qq] 心跳超时, 强制重连 appId=${bot.appId}`);
        bot.ws.terminate();
      }
    }, interval);
    if (bot.heartbeatTimer.unref) bot.heartbeatTimer.unref();
    if (bot.ackWatchTimer.unref) bot.ackWatchTimer.unref();
  }

  const recentMsgIds = new Map(); // msgId -> ts: 相同 msg_id 可能重复推送, 结合时间窗口去重
  function isDuplicateMsgId(msgId) {
    if (!msgId) return false;
    const ts = recentMsgIds.get(msgId);
    if (ts && now() - ts < 60000) return true;
    recentMsgIds.set(msgId, now());
    if (recentMsgIds.size > 500) {
      for (const [k, v] of [...recentMsgIds]) if (now() - v >= 60000) recentMsgIds.delete(k);
    }
    return false;
  }

  // 已绑定用户的命令处理: 命中返回 true(已回复), 否则 false 走默认提示
  function tryCommand(bot, d) {
    const content = String(d.content || '').trim();
    const author = d.author || {};
    const openid = author.user_openid || author.id;
    if (!content || !openid) return Promise.resolve(false);
    if (isDuplicateMsgId(d.id)) return Promise.resolve(true); // 重复推送, 忽略
    if (!onCommand) return Promise.resolve(false);
    return onCommand({ dbId: bot.dbId, openid, nickname: author.username || '', content, msgId: d.id })
      .then((reply) => {
        if (reply) { sendPassive(bot, openid, d.id, reply); return true; }
        return false;
      })
      .catch((e) => {
        log.error(`[qq] 命令处理失败: ${e.message}`);
        return false;
      });
  }

  function handleC2c(bot, d, eventType) {
    const author = d.author || {};
    const openid = author.user_openid || author.id;
    if (!openid) return;
    const nickname = author.username || '';
    const existing = db.getQqBinding(bot.dbId, bot.appId);
    if (!existing) {
      db.upsertQqBinding(bot.dbId, { appId: bot.appId, openid, nickname, at: now() });
      log.info(`[qq] 已绑定QQ用户 ${nickname || openid} (${eventType}) appId=${bot.appId}`);
      if (eventType === 'C2C_MESSAGE_CREATE' && d.id) {
        sendPassive(bot, openid, d.id, '绑定成功! 输入任意消息查看在线列表');
      }
    } else if (existing.openid === openid) {
      if (eventType === 'C2C_MESSAGE_CREATE' && d.id) {
        tryCommand(bot, d).then((handled) => {
          if (!handled) sendPassive(bot, openid, d.id, '已绑定, 输入任意消息查看在线列表');
        });
      }
    } else if (eventType === 'C2C_MESSAGE_CREATE' && d.id) {
      sendPassive(bot, openid, d.id, '该机器人已绑定其他用户, 无法使用。');
    }
  }

  function handleDispatch(bot, frame) {
    const t = frame.t;
    const d = frame.d || {};
    if (t === 'READY') {
      bot.ready = true;
      bot.lastError = null;
      log.info(`[qq] 鉴权成功 appId=${bot.appId}`);
      notifyStartup(bot);
      return;
    }
    if (t === 'C2C_MESSAGE_CREATE' || t === 'C2C_MSG_RECEIVE') {
      handleC2c(bot, d, t);
    }
  }

  function handleFrame(bot, ws, raw) {
    if (bot.ws !== ws) return; // 旧连接残留消息
    bot.lastRecvAt = now();
    let frame;
    try { frame = JSON.parse(raw); } catch (e) { return; }
    if (frame && typeof frame.s === 'number') bot.seq = frame.s;
    switch (frame.op) {
      case 10: { // hello
        bot.heartbeatIntervalMs = frame.d && frame.d.heartbeat_interval;
        startHeartbeat(bot);
        sendIdentify(bot);
        break;
      }
      case 0: // dispatch
        handleDispatch(bot, frame);
        break;
      case 11: // heartbeat ack
        bot.lastAckAt = now();
        break;
      case 7: // 服务端要求重连
        log.warn(`[qq] 服务端要求重连 appId=${bot.appId}`);
        if (bot.ws === ws) { try { ws.close(4000, 'server reconnect'); } catch (e) { /* 忽略 */ } }
        break;
      case 9: // invalid session: 刷新凭证后重连
        log.warn(`[qq] 鉴权失效(op9), 刷新凭证重连 appId=${bot.appId}`);
        bot.token = null;
        bot.tokenExpiresAt = 0;
        if (bot.ws === ws) { try { ws.close(4000, 'invalid session'); } catch (e) { /* 忽略 */ } }
        break;
      default:
        break;
    }
  }

  function scheduleReconnect(bot) {
    if (bot.stopped || bot.reconnectTimer) return;
    const delay = Math.min(reconnectBaseMs * Math.pow(2, bot.attempt), reconnectMaxMs) + Math.floor(Math.random() * jitterMs);
    bot.attempt++;
    log.info(`[qq] ${delay}ms 后重连 appId=${bot.appId} (第 ${bot.attempt} 次)`);
    bot.reconnectTimer = setTimeout(() => {
      bot.reconnectTimer = null;
      connect(bot);
    }, delay);
    if (bot.reconnectTimer.unref) bot.reconnectTimer.unref();
  }

  function connect(bot) {
    if (bot.stopped) return;
    clearReconnectTimer(bot);
    ensureToken(bot).then((token) => {
      if (bot.stopped) return;
      let ws;
      try {
        ws = new WsClient(wsUrl, { headers: { Authorization: `QQBot ${token}` } });
      } catch (e) {
        log.error(`[qq] 连接失败 appId=${bot.appId}: ${e.message}`);
        scheduleReconnect(bot);
        return;
      }
      bot.ws = ws;
      bot.ready = false;
      bot.lastRecvAt = now();
      ws.on('open', () => {
        bot.attempt = 0;
        log.info(`[qq] WS 已连接 appId=${bot.appId}`);
      });
      ws.on('message', (data) => handleFrame(bot, ws, String(data)));
      ws.on('close', (code, reason) => {
        if (bot.ws !== ws) return; // 已被替换的旧连接
        bot.ws = null;
        bot.ready = false;
        stopHeartbeat(bot);
        if (bot.stopped) return;
        const reasonText = reason && reason.length ? String(reason) : '';
        log.info(`[qq] WS 断开 appId=${bot.appId} code=${code}${reasonText ? ` ${reasonText}` : ''}`);
        if (code === 4914 || code === 4915) {
          bot.lastError = `机器人不可用(code=${code})`;
          log.error(`[qq] 机器人不可用, 停止重连 appId=${bot.appId}`);
          return;
        }
        scheduleReconnect(bot);
      });
      ws.on('error', (err) => {
        if (bot.ws !== ws) return;
        log.warn(`[qq] WS 错误 appId=${bot.appId}: ${err.message}`);
      });
    }).catch((e) => {
      if (bot.stopped) return;
      bot.lastError = e.message;
      log.error(`[qq] 获取凭证失败 appId=${bot.appId}: ${e.message}`);
      scheduleReconnect(bot);
    });
  }

  // ---------- 生命周期 ----------
  function sync(dbId, user) {
    const enabled = !!(user && user.qq_enabled === 1 && user.qq_app_id && user.qq_app_secret);
    const existing = bots.get(dbId);
    if (!enabled) {
      if (existing) stop(dbId);
      return;
    }
    if (existing) {
      const changed = existing.appId !== user.qq_app_id || existing.appSecret !== user.qq_app_secret;
      existing.appId = user.qq_app_id;
      existing.appSecret = user.qq_app_secret;
      if (changed) {
        log.info(`[qq] 配置更新, 重新连接 appId=${user.qq_app_id}`);
        clearReconnectTimer(existing);
        stopHeartbeat(existing);
        existing.token = null;
        existing.tokenExpiresAt = 0;
        const oldWs = existing.ws;
        existing.ws = null;
        if (oldWs) { try { oldWs.terminate(); } catch (e) { /* 忽略 */ } }
        connect(existing);
      }
      return;
    }
    const bot = {
      dbId, appId: user.qq_app_id, appSecret: user.qq_app_secret,
      ws: null, ready: false, token: null, tokenExpiresAt: 0, tokenPromise: null,
      seq: null, heartbeatIntervalMs: 0, heartbeatTimer: null, ackWatchTimer: null,
      reconnectTimer: null, attempt: 0, stopped: false, lastError: null, startupSent: false,
      lastRecvAt: 0, lastAckAt: 0
    };
    bots.set(dbId, bot);
    connect(bot);
  }

  function startAll(users) {
    const settings = getSettings ? (getSettings() || {}) : {};
    for (const u of users || []) sync(u.id, settings);
  }

  function stop(dbId) {
    const bot = bots.get(dbId);
    if (!bot) return;
    bot.stopped = true;
    clearReconnectTimer(bot);
    stopHeartbeat(bot);
    const ws = bot.ws;
    bot.ws = null;
    if (ws) { try { ws.close(); } catch (e) { /* 忽略 */ } }
    bots.delete(dbId);
  }

  function stopAll() {
    for (const dbId of [...bots.keys()]) stop(dbId);
  }

  function status(dbId) {
    const bot = bots.get(dbId);
    if (!bot) return { configured: false };
    const binding = db.getQqBinding(dbId, bot.appId) || null;
    return {
      configured: true,
      appId: bot.appId,
      connected: !!(bot.ws && bot.ready),
      wsOpen: !!bot.ws,
      attempt: bot.attempt,
      tokenOk: !!bot.token,
      bound: binding ? { openid: binding.openid, nickname: binding.nickname, at: binding.updated_at } : null,
      lastError: bot.lastError || null
    };
  }

  return { sync, startAll, stop, stopAll, status, sendText, sendTest: sendText };
}

module.exports = { createQqManager };
