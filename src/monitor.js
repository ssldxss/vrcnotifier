'use strict';
// 监控编排层: WS 事件分发 + REST 快照对账 + 状态机落地 + 通知去重 + watchdog。

const { EventEmitter } = require('node:events');
const { deriveStateFromSnapshot, applyChange } = require('./state');
const { parseLocation } = require('./location');
const { formatLocalTime, createLogger, trustLevelFromTags } = require('./util');
const { isMissingCredentials, isUnauthorized } = require('./vrcapi');
const { STARTUP_TEXT } = require('./qq-commands');

function createMonitor({ db, notifier, pipeline, bus = null, config = {}, logger = null, now = Date.now, worldFetcher = null }) {
  const log = logger || createLogger('monitor');
  const events = bus || new EventEmitter();
  const sessions = new Map();      // vrchat_user_id -> { vrcapi, user }

  const confirmDelayMs = config.confirmDelayMs ?? 30000;
  const dedupeWindowMs = config.dedupeWindowMs ?? 30000;
  const WORLD_CACHE_OK_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 成功名称缓存 1 年
  const WORLD_NAME_RETRY_BASE_MS = config.worldNameRetryBaseMs ?? 5000; // 与 WS 重连一致的退避起步
  const WORLD_NAME_RETRY_MAX_MS = config.worldNameRetryMaxMs ?? 3600 * 1000; // 退避封顶 1h, 封顶后保持不回退
  const UNKNOWN_WORLD_NAME = '未知世界';
  const RECOVERY_TEXT = '# ✅ 服务已恢复\n好友监控运行中\n输入任意消息即可查看在线列表';
  const snapshotIntervalMs = config.snapshotIntervalMs ?? 3600 * 1000;
  const watchdogMs = config.watchdogMs ?? 3600 * 1000;
  const watchdogCheckMs = config.watchdogCheckMs ?? 60 * 1000;
  const maxWorldResolvesPerSnapshot = config.maxWorldResolvesPerSnapshot ?? 6;
  const statusCoalesceMs = config.statusCoalesceMs ?? 3000; // 状态变化+切世界合并窗口
  const faultNotifyMs = config.faultNotifyMs ?? 5 * 60 * 1000; // 故障(WS 断开/401)持续超过 5 分钟才通知

  let autoTimer = null;
  let autoAt = 0; // 下一次自动对账的计划时间(用于日志/测试)
  let watchdogTimer = null;
  const running = new Set();          // userId: 快照进行中(并发触发直接忽略)
  const awaitingSnapshot = new Set(); // userId: ws 重连成功后等待全量对账, 期间忽略 WS 消息
  const pendingStatus = new Map();     // friendId: 状态变化合并中(待 friend-location 执行)
  const pendingTimers = new Map();     // friendId: 下线 pending 到期自动验证定时器
  const connState = new Map();         // userId -> { open, snapshotDone, startupSent, recovering, apiOk, faultSince, faultNotified, faultTimer }

  function stateOf(userId) {
    let st = connState.get(userId);
    if (!st) {
      st = { open: false, snapshotDone: false, startupSent: false, recovering: false, apiOk: false, faultSince: 0, faultNotified: false, faultTimer: null };
      connState.set(userId, st);
    }
    return st;
  }

  // 系统事件(WS 断开/连接/会话失效)推送到全部通知渠道
  async function sysNotify(user, title, body) {
    const change = {
      changeType: '系统通知',
      friendName: 'vrcnotifier',
      oldStatus: '未知', newStatus: '未知',
      oldWorld: '-', newWorld: '-',
      oldStatusDescription: '无', newStatusDescription: body || '',
      oldPlatform: 'unknown', newPlatform: 'unknown',
      notificationTitle: title,
      notificationBody: body || '',
      eventType: 'vrc_system',
      timestamp: formatLocalTime(now())
    };
    try {
      await notifier.sendAll({ ...user }, change);
    } catch (e) {
      log.error(`[monitor] 系统通知失败: ${e.message}`);
    }
  }

  // 启动(首次 ws 连接+对账完成)与恢复(重连+对账完成)推送 QQ 说明
  function maybeSendLifecycle(user) {
    const st = stateOf(user.vrchat_user_id);
    if (!st.open || !st.snapshotDone) return;
    const sendQq = (text, what) => {
      const full = `${text}\n时间: ${formatLocalTime(now())}`;
      log.info(`[monitor] ${what} userId=${user.vrchat_user_id}`);
      notifier.sendQqText(user.id, full, { markdown: true })
        .then((r) => { if (r && !r.ok && r.reason) log.warn(`[monitor] ${what}发送失败: ${r.reason}`); })
        .catch((e) => log.error(`[monitor] ${what}发送失败: ${e.message}`));
    };
    if (!st.startupSent) {
      st.startupSent = true;
      sendQq(STARTUP_TEXT, '启动说明');
      return;
    }
    if (st.recovering) {
      st.recovering = false;
      sendQq(RECOVERY_TEXT, '恢复说明');
    }
  }

  // ---------- 统一故障窗口 ----------
  // 除首次连接外, WS 断开与 401 都算故障; 恢复标准 = API 返回 200 且 WS 连接成功;
  // 故障持续超过 faultNotifyMs 通知一次, 恢复时若已超阈值再补发恢复说明一次; 阈值内全程静默。
  function isRecovered(st) {
    return st.open && st.apiOk;
  }

  function clearFaultWindow(st) {
    if (st.faultTimer) { clearTimeout(st.faultTimer); st.faultTimer = null; }
    st.faultSince = 0;
    st.faultNotified = false;
  }

  function startFault(userId, s, reason) {
    const st = stateOf(userId);
    st.apiOk = false; // 恢复需要故障后新的 200
    if (st.faultSince !== 0) return;
    st.faultSince = now();
    log.warn(`[monitor] 故障窗口开始 userId=${userId} (${reason || 'WS 断开或会话异常'})`);
    st.faultTimer = setTimeout(() => {
      st.faultTimer = null;
      if (st.faultSince === 0 || st.faultNotified || isRecovered(st)) return;
      st.faultNotified = true;
      log.error(`[monitor] 连接故障超过 ${Math.round(faultNotifyMs / 60000)} 分钟未恢复, 已推送故障通知 userId=${userId}`);
      sysNotify(s.user, '⚠️ VRChat 连接故障', `连接断开或会话异常, 超过 ${Math.round(faultNotifyMs / 60000)} 分钟未恢复, 正在自动重试`);
    }, faultNotifyMs);
    if (st.faultTimer.unref) st.faultTimer.unref();
  }

  // 恢复判定: 200 + WS 已连接; 超阈值(已发故障通知)的恢复补发恢复说明一次
  function tryRecover(userId, s) {
    const st = stateOf(userId);
    if (st.faultSince === 0 || !isRecovered(st)) return;
    const wasNotified = st.faultNotified;
    clearFaultWindow(st);
    log.info(`[monitor] 故障恢复 userId=${userId} (${wasNotified ? '已推送过故障通知, 补发恢复说明' : '5 分钟内恢复, 静默处理'})`);
    if (wasNotified) st.recovering = true;
  }

  bus.on('ws-open', ({ userId, isWatchdog }) => {
    const st = stateOf(userId);
    st.open = true;
    const s = sessions.get(userId);
    if (!s) return;
    if (isWatchdog) return; // watchdog 强制重连: 不推送恢复/已连接通知
    if (!st.startupSent) {
      // 首次连接成功: 发启动说明(不属于重连)
      maybeSendLifecycle(s.user);
      return;
    }
    tryRecover(userId, s);
    maybeSendLifecycle(s.user);
  });

  bus.on('ws-close', ({ userId }) => {
    const st = stateOf(userId);
    st.open = false;
    const s = sessions.get(userId);
    if (!s) return;
    startFault(userId, s, 'WS 断开');
  });

  // 401(重登/2FA 挂起)同样计入故障窗口
  bus.on('relogin-needed', ({ userId }) => {
    const s = sessions.get(userId);
    if (!s) return;
    startFault(userId, s, 'cookie 失效, 需要自动重登');
  });
  bus.on('unauthorized-2fa', ({ userId }) => {
    const s = sessions.get(userId);
    if (!s) return;
    startFault(userId, s, '会话挂起, 需要 2FA');
  });

  // 对账成功(200): 恢复标准的一半 + 启动/恢复说明
  bus.on('snapshot', ({ userId }) => {
    const st = stateOf(userId);
    st.snapshotDone = true;
    st.apiOk = true;
    const s = sessions.get(userId);
    if (!s) return;
    tryRecover(userId, s);
    maybeSendLifecycle(s.user);
  });

  bus.on('session-expired', ({ userId }) => {
    clearFaultWindow(stateOf(userId));
    const s = sessions.get(userId);
    if (s) {
      log.info(`[monitor] 会话失效, 监控已停用 userId=${userId}`);
      sysNotify(s.user, '⚠️ VRChat 会话失效', '监控已停用, 请重新登录');
    }
  });

  // ---------- 会话 ----------
  function activeUsers() {
    return [...sessions.values()];
  }

  async function activateUser(user, vrcapi) {
    sessions.set(user.vrchat_user_id, { vrcapi, user });
    log.info(`[monitor] 激活用户 ${user.display_name}(${user.vrchat_user_id})`);
    pipeline.connect(user.vrchat_user_id, user.display_name);
    await runSnapshot(user.vrchat_user_id, { initial: true }); // 启动首次对账: 只建基线, 不补通知
  }

  function deactivateUser(vrcId) {
    sessions.delete(vrcId);
    pipeline.disconnect(vrcId);
    const st = connState.get(vrcId);
    if (st && st.closeTimer) { clearTimeout(st.closeTimer); st.closeTimer = null; }
    for (const [fid, timer] of pendingTimers) { clearTimeout(timer); }
    pendingTimers.clear();
    log.info(`[monitor] 停用用户 ${vrcId}`);
  }

  // 服务主动停止(ctrl+c / SIGTERM / docker)时向活跃用户推送 QQ 停止通知
  async function sendShutdownNotice() {
    const text = `# ⚠️ 服务已停止\n好友监控已关闭\n时间: ${formatLocalTime(now())}`;
    const sends = [];
    for (const { user } of sessions.values()) {
      sends.push(notifier.sendQqText(user.id, text, { markdown: true }));
    }
    await Promise.allSettled(sends);
  }

  // ---------- 世界名 ----------
  function worldCacheFresh(worldId) {
    const c = db.getWorldCache(worldId);
    if (!c) return null;
    if (c.world_name === UNKNOWN_WORLD_NAME) {
      // 未知世界: 退避期内视为有效, 到期后可重试
      return now() < (c.retry_at || 0) ? c : null;
    }
    return now() - c.updated_at < WORLD_CACHE_OK_TTL_MS ? c : null;
  }

  async function resolveWorldName(vrcapi, worldId) {
    if (!worldId || worldId === 'private' || worldId === 'offline' || worldId === 'traveling') return null;
    const cached = worldCacheFresh(worldId);
    if (cached) return cached.world_name;
    const rec = db.getWorldCache(worldId);
    const failCount = rec ? (rec.fail_count || 0) : 0;
    let name = UNKNOWN_WORLD_NAME;
    const fetchWorld = worldFetcher
      ? (id) => worldFetcher.world(id)
      : (id) => vrcapi.world(id, { noRetry: true }); // 生产走独立无 Cookie 世界模块; 测试可回退注入的 vrcapi.world
    try {
      const w = await fetchWorld(worldId); // 世界名查询失败不阻塞快照, 缓存未知世界
      if (w && w.name) {
        name = w.name;
        log.info(`[world] 世界名获取成功 worldId=${worldId} name=${name}`);
      }
    } catch (e) {
      log.warn(`[world] 世界 ${worldId} 名称获取失败: ${e.message}`);
    }
    if (name === UNKNOWN_WORLD_NAME) {
      // 失败: 指数退避安排下次重试, 达到上限 1h 后保持不回退, 直到成功清零
      const next = failCount + 1;
      const interval = Math.min(WORLD_NAME_RETRY_BASE_MS * 2 ** (next - 1), WORLD_NAME_RETRY_MAX_MS);
      db.upsertWorldCache(worldId, name, now(), next, now() + interval);
    } else {
      db.upsertWorldCache(worldId, name, now(), 0, 0);
    }
    return name;
  }

  // ---------- 通知 ----------
  async function dispatchNotification(user, friendVrcId, change) {
    if (!change) return;
    // 无总开关: 所有好友可被监控; 无配置行时小开关默认关闭(不通知)
    const config = db.getConfig(user.id, friendVrcId);
    if (!config) return;
    if (change.notifyField && config[change.notifyField] !== 1) return;

    // 去重 key 含新旧状态: 同一朋友短时间内不同的状态变化不应被吞掉
    const key = `${user.id}|${friendVrcId}|${change.changeType}|${change.newWorldId || ''}|${change.oldStatus || ''}>${change.newStatus || ''}`;
    if (db.isDuplicate(key, dedupeWindowMs, now())) return;
    db.markNotified(key, now());

    const friend = db.getFriend(user.id, friendVrcId) || {};
    const changeForNotify = {
      ...change,
      friendName: friend.display_name || friendVrcId,
      avatarUrl: friend.avatar_url || '',
      eventType: eventTypeFor(change.changeType),
      timestamp: formatLocalTime(now())
    };
    const userForNotify = { ...user };
    log.info(`[monitor] 通知: ${changeForNotify.friendName} ${change.changeType}`);
    const results = await notifier.sendAll(userForNotify, changeForNotify);
    events.emit('notification', { userId: user.vrchat_user_id, friendName: changeForNotify.friendName, changeType: change.changeType, results });
  }

  const NOTIFICATION_CATEGORY_LABELS = {
    friendRequest: '好友请求',
    requestInvite: '请求邀请',
    invite: '世界邀请',
    message: '私信',
    social: '社交互动',
    response: '通知响应',
    system: '系统通知'
  };

  function categoryLabel(cat) {
    return (cat && NOTIFICATION_CATEGORY_LABELS[cat]) || '';
  }

  // 从通知的 details/link/message/title 中提取世界信息(id/名)。
  // details 在 REST 响应里是 JSON 字符串, WebSocket 下是对象, 两者都要兼容;
  // 邀请类通知的 details 直接带 worldId/worldName(NotificationDetailInvite)。
  function worldInfoFromNotification(n) {
    let details = n && n.details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch (e) { details = null; }
    }
    if (details && typeof details === 'object') {
      const nested = details.invite || {};
      const worldId = details.worldId || nested.worldId || null;
      const worldName = details.worldName || nested.worldName || null;
      if (worldId || worldName) return { worldId, worldName };
    }
    const hay = [n && n.link, n && n.message, n && n.title].filter(Boolean).join(' ');
    const m = hay.match(/wrld_[A-Za-z0-9-]+/);
    return m ? { worldId: m[0], worldName: null } : null;
  }

  // VRChat 站内通知(notification / notification-v2) -> 复用通知渠道推送
  async function dispatchVrcNotification(user, n, vrcapi) {
    if (!n || !n.id) return;
    // 无发送者(如订阅频道公告)或发送者是自己 -> 不推送, 只推送明确来自其他用户的通知
    if (!n.senderUserId || n.senderUserId === user.vrchat_user_id) return;
    const key = `${user.id}|notif|${n.id}`;
    if (db.isDuplicate(key, dedupeWindowMs, now())) return;
    db.markNotified(key, now());

    const sender = n.senderUserId ? (db.getFriend(user.id, n.senderUserId) || {}).display_name || n.senderUserId : 'VRChat';
    const rawCategory = n.category || n.type || '';
    const title = n.title || categoryLabel(rawCategory) || 'VRChat通知';
    const message = n.message || '';
    // 内容与标题相同或空时不重复展示
    const body = message && message !== title ? message : '';
    // 世界邀请类: 解析邀请到的世界名, 替代分类行
    let notificationWorld = null;
    if (vrcapi && (rawCategory === 'invite' || rawCategory === 'requestInvite')) {
      const worldInfo = worldInfoFromNotification(n);
      if (worldInfo && (worldInfo.worldId || worldInfo.worldName)) {
        notificationWorld = worldInfo.worldName || await resolveWorldName(vrcapi, worldInfo.worldId);
      } else if (rawCategory === 'invite') {
        log.warn(`[monitor] 邀请通知无世界信息 id=${n.id} link=${n.link || '-'} details=${JSON.stringify(n.details || null)}`);
      }
    }
    const changeForNotify = {
      changeType: 'VRChat通知',
      friendName: sender,
      oldStatus: '未知', newStatus: '未知',
      oldWorld: '-', newWorld: '-',
      oldStatusDescription: '无', newStatusDescription: body || title,
      oldPlatform: 'unknown', newPlatform: 'unknown',
      notificationCategory: rawCategory,
      notificationCategoryLabel: categoryLabel(rawCategory) || rawCategory,
      notificationWorld,
      categoryOrWorld: notificationWorld ? `世界: ${notificationWorld}` : '',
      notificationTitle: title,
      notificationBody: body,
      eventType: 'vrc_notification',
      timestamp: formatLocalTime(now())
    };
    log.info(`[monitor] VRChat通知: ${rawCategory || '?'} ${title}${notificationWorld ? ` world=${notificationWorld}` : ''}`);
    const results = await notifier.sendAll({ ...user }, changeForNotify);
    events.emit('notification', { userId: user.vrchat_user_id, friendName: sender, changeType: changeForNotify.changeType, results });
  }

  function eventTypeFor(changeType) {
    const map = { 上线: 'friend_online', 下线: 'friend_offline', 状态变化: 'status_change', 切换世界: 'world_change', 自定义状态: 'status_description_change', 测试通知: 'test' };
    return map[changeType] || 'status_change';
  }

  // 状态变化 + 切世界合并: friend-update 的状态变化延迟 coalesce 窗口,
  // 期间同好友 friend-location 到达则合并成一条(补回旧状态), 否则窗口后单独推送。
  async function dispatchChange(user, friendVrcId, change, eventType) {
    if (eventType === 'friend-update' && change.changeType === '状态变化') {
      const prev = pendingStatus.get(friendVrcId);
      if (prev) clearTimeout(prev.timer);
      if (statusCoalesceMs <= 0) {
        await dispatchNotification(user, friendVrcId, change);
        return;
      }
      const timer = setTimeout(() => {
        pendingStatus.delete(friendVrcId);
        dispatchNotification(user, friendVrcId, change).catch((e) => log.error(`[monitor] 延迟通知失败: ${e.message}`));
      }, statusCoalesceMs);
      if (timer.unref) timer.unref();
      pendingStatus.set(friendVrcId, { oldStatus: change.oldStatus, newStatus: change.newStatus, timer });
      return;
    }
    if (eventType === 'friend-location' && change.changeType === '切换世界') {
      const pending = pendingStatus.get(friendVrcId);
      if (pending && pending.newStatus === change.newStatus) {
        change.oldStatus = pending.oldStatus;
        change.newStatus = pending.newStatus;
        clearTimeout(pending.timer);
        pendingStatus.delete(friendVrcId);
      }
    }
    await dispatchNotification(user, friendVrcId, change);
  }

  // ---------- 状态落地 ----------
  // 下线 pending 到期(confirmDelayMs)后调 /auth/user 验证真实状态, 再走一次状态机
  function schedulePendingCheck(user, friendVrcId) {
    const old = pendingTimers.get(friendVrcId);
    if (old) clearTimeout(old);
    const timer = setTimeout(async () => {
      pendingTimers.delete(friendVrcId);
      const session = sessions.get(user.vrchat_user_id);
      if (!session) return;
      try {
        const cu = await session.vrcapi.me({ noRetry: true });
        let state = null;
        if (cu && Array.isArray(cu.onlineFriends) && cu.onlineFriends.includes(friendVrcId)) state = 'online';
        else if (cu && Array.isArray(cu.activeFriends) && cu.activeFriends.includes(friendVrcId)) state = 'active';
        else if (cu && Array.isArray(cu.offlineFriends) && cu.offlineFriends.includes(friendVrcId)) state = 'offline';
        if (!state) return;
        log.info(`[monitor] pending 到期验证 ${friendVrcId} -> ${state}`);
        await applyFriendInput(user, friendVrcId, { state }, { eventType: 'pending-check' });
      } catch (e) {
        log.warn(`[monitor] pending 验证失败 ${friendVrcId}: ${e.message}`);
      }
    }, confirmDelayMs);
    if (timer.unref) timer.unref();
    pendingTimers.set(friendVrcId, timer);
  }

  function clearPendingCheck(friendVrcId) {
    const timer = pendingTimers.get(friendVrcId);
    if (timer) { clearTimeout(timer); pendingTimers.delete(friendVrcId); }
  }

  async function applyFriendInput(user, friendVrcId, input, opts = {}) {
    // 头像统一走 /api/1/image/ 缩略图: 优先显式缩略图 URL, 缺失时由原图 URL 转换
    const thumbUrl = input.avatarThumbUrl || null;
    const existed = db.getFriend(user.id, friendVrcId);
    if (!existed) {
      // 首见: 直接按当前情况入库, 不比较不通知(变化才有通知)
      db.upsertFriend(user.id, friendVrcId, {
        state: input.state || 'offline', status: input.status || null,
        worldId: input.worldId || null, worldName: input.worldName || null,
        statusDescription: input.statusDescription || null, platform: input.platform || null,
        displayName: input.displayName || null, avatarUrl: input.avatarUrl || null, avatarThumbUrl: thumbUrl,
        trustLevel: input.trustLevel || null,
        lastSeen: now()
      });
      return;
    }
    // 仅更新资料字段, 状态由状态机接管
    if (input.displayName !== undefined || input.avatarUrl !== undefined || input.avatarThumbUrl !== undefined || input.trustLevel !== undefined) {
      db.updateFriendProfile(existed.id, { displayName: input.displayName, avatarUrl: input.avatarUrl, avatarThumbUrl: thumbUrl, trustLevel: input.trustLevel });
    }
    const cur = db.getFriend(user.id, friendVrcId);
    const result = applyChange(cur, {
      state: input.state, status: input.status, worldId: input.worldId,
      worldName: input.worldName, statusDescription: input.statusDescription, platform: input.platform
    }, { now, confirmDelayMs });
    if (opts.silent) {
      result.dbUpdate.pending_state = null;
      result.dbUpdate.pending_at = null;
    }
    db.updateFriendState(cur.id, { ...result.dbUpdate, last_seen: now() });
    if (opts.silent) {
      clearPendingCheck(friendVrcId);
    } else if (result.dbUpdate.pending_state) {
      schedulePendingCheck(user, friendVrcId);
    } else {
      clearPendingCheck(friendVrcId);
    }
    if (!opts.silent && result.notify) {
      await dispatchChange(user, friendVrcId, { ...result.change, friendId: friendVrcId, newWorldId: result.dbUpdate.world_id }, opts.eventType);
    }
  }

  // ---------- 自己的状态 ----------
  // 自己的信息只入库 + 推给前端, 不走通知/去重/pending。
  // WS 返回 offline/空位置时网页会话仍在活动, 统一按 active(网页在线)处理。
  function deriveSelfState(location, apiState) {
    if (apiState === 'online') return 'online';
    if (apiState === 'active') return 'active';
    const s = String(location ?? '');
    if (s === 'private' || s === 'traveling' || s.startsWith('wrld_')) return 'online';
    return 'active';
  }

  async function applySelfInput(user, input) {
    const existed = db.getUserByVrcId(user.vrchat_user_id);
    if (!existed) return;
    if (input.displayName !== undefined || input.avatarUrl !== undefined || input.avatarThumbUrl !== undefined) {
      db.updateSelfProfile(existed.id, {
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        avatarThumbUrl: input.avatarThumbUrl || null
      });
    }
    const hasPresence = [input.state, input.status, input.worldId, input.worldName, input.statusDescription, input.platform].some((v) => v !== undefined);
    if (hasPresence) {
      const cur = db.getUserByVrcId(user.vrchat_user_id);
      const pick = (v, fallback) => (v !== undefined ? v : fallback);
      const next = {
        state: pick(input.state, cur.state),
        status: pick(input.status, cur.status),
        worldId: pick(input.worldId, cur.world_id),
        worldName: pick(input.worldName, cur.world_name),
        statusDescription: pick(input.statusDescription, cur.status_description),
        platform: pick(input.platform, cur.platform)
      };
      db.updateSelfPresence(cur.id, { ...next, lastSeen: now() });
      log.info(`[monitor] 自己状态 userId=${user.vrchat_user_id}: state=${next.state} status=${next.status} world=${next.worldId || '-'}`);
    }
    events.emit('self-state', { userId: user.vrchat_user_id });
  }

  // ws 重连成功: 先全量对账, 对账完成前忽略 WS 消息
  async function handleWsReconnect(userId) {
    if (!sessions.has(userId)) return;
    log.info(`[monitor] ws 重连成功 userId=${userId}, 先全量对账再处理消息`);
    awaitingSnapshot.add(userId);
    await runSnapshot(userId);
  }

  // ---------- WS 事件 ----------
  async function handlePipelineEvent(userId, raw, parsed) {
    const session = sessions.get(userId);
    if (!session) return;
    if (awaitingSnapshot.has(userId)) {
      log.info(`[monitor] 对账完成前忽略消息 userId=${userId}: ${(parsed && parsed.type) || '?'}`);
      return;
    }
    const user = db.getUserByVrcId(userId);
    if (!user) return;
    const { type, content } = parsed || {};
    if (!content) return;
    try {
      const { vrcapi } = session;
      switch (type) {
        case 'friend-online': {
          const id = content.user?.id || content.userId;
          const loc = parseLocation(content.location);
          const worldId = loc.isReal ? loc.worldId : (content.location === 'private' ? 'private' : null);
          const worldName = worldId && worldId !== 'private' ? await resolveWorldName(vrcapi, worldId) : (worldId === 'private' ? '私密世界' : null);
          await applyFriendInput(user, id, {
            state: 'online', status: content.user?.status || 'active',
            statusDescription: content.user?.statusDescription || null,
            worldId, worldName, platform: content.platform || null,
            displayName: content.user?.displayName, avatarUrl: content.user?.currentAvatarImageUrl,
            avatarThumbUrl: content.user?.profilePicOverrideThumbnail || content.user?.currentAvatarThumbnailImageUrl
          });
          break;
        }
        case 'friend-active': {
          const id = content.user?.id || content.userId || content.userid;
          await applyFriendInput(user, id, {
            state: 'active', status: content.user?.status || 'active',
            statusDescription: content.user?.statusDescription || null,
            worldId: null, worldName: null, platform: content.platform || 'web',
            displayName: content.user?.displayName, avatarUrl: content.user?.currentAvatarImageUrl,
            avatarThumbUrl: content.user?.profilePicOverrideThumbnail || content.user?.currentAvatarThumbnailImageUrl
          });
          break;
        }
        case 'friend-offline': {
          const id = content.userId || content.user?.id;
          // 下线保留社交状态与自定义状态, 仅更新在线状态/世界/平台
          await applyFriendInput(user, id, { state: 'offline', worldId: null, worldName: null, platform: content.platform || null });
          break;
        }
        case 'friend-location': {
          const id = content.user?.id || content.userId;
          const loc = parseLocation(content.location);
          const existing = db.getFriend(user.id, id);
          const traveling = content.location === 'traveling';
          const worldId = loc.isReal ? loc.worldId : (content.location === 'private' ? 'private' : (traveling && existing ? existing.world_id : null));
          const worldName = worldId && worldId !== 'private' ? await resolveWorldName(vrcapi, worldId) : (worldId === 'private' ? '私密世界' : (traveling && existing ? existing.world_name : null));
          await applyFriendInput(user, id, {
            state: 'online', status: content.user?.status || 'active',
            statusDescription: content.user?.statusDescription || null,
            worldId, worldName, platform: content.platform || null,
            displayName: content.user?.displayName, avatarUrl: content.user?.currentAvatarImageUrl,
            avatarThumbUrl: content.user?.profilePicOverrideThumbnail || content.user?.currentAvatarThumbnailImageUrl
          }, { eventType: 'friend-location' });
          break;
        }
        case 'friend-update': {
          const u = content.user;
          if (!u || !u.id) break;
          const existing = db.getFriend(user.id, u.id);
          const loc = u.location !== undefined ? parseLocation(u.location) : null;
          const world = loc && !loc.isReal && u.location === 'private' ? { worldId: 'private', worldName: '私密世界' } : {};
          await applyFriendInput(user, u.id, {
            state: existing ? existing.state : undefined,
            status: u.status !== undefined ? u.status : undefined, // 缺失时继承旧值
            statusDescription: u.statusDescription !== undefined ? u.statusDescription : undefined,
            platform: u.last_platform || null,
            displayName: u.displayName, avatarUrl: u.currentAvatarImageUrl, avatarThumbUrl: u.profilePicOverrideThumbnail || u.currentAvatarThumbnailImageUrl,
            ...world
          }, { eventType: 'friend-update' });
          break;
        }
        case 'user-update': {
          // 自己资料变化: 简化 user 对象, 无 location/平台, 只更新资料与社交状态
          const u = content.user;
          if (!u || !u.id) break;
          await applySelfInput(user, {
            displayName: u.displayName,
            avatarUrl: u.currentAvatarImageUrl,
            avatarThumbUrl: u.currentAvatarThumbnailImageUrl,
            status: u.status,
            statusDescription: u.statusDescription
          });
          break;
        }
        case 'user-location': {
          // 自己换房间: 带完整 User 对象; offline/空位置按网页在线(active)处理
          const u = content.user || {};
          const existing = db.getUserByVrcId(user.vrchat_user_id);
          const loc = parseLocation(content.location);
          const traveling = content.location === 'traveling';
          const state = deriveSelfState(content.location, u.state);
          const worldId = loc.isReal ? loc.worldId : (content.location === 'private' ? 'private' : (traveling && existing ? existing.world_id : null));
          const worldName = worldId && worldId !== 'private' ? await resolveWorldName(vrcapi, worldId) : (worldId === 'private' ? '私密世界' : (traveling && existing ? existing.world_name : null));
          await applySelfInput(user, {
            state,
            status: u.status && u.status !== 'offline' ? u.status : 'active',
            statusDescription: u.statusDescription,
            worldId, worldName,
            platform: u.last_platform || u.platform,
            displayName: u.displayName,
            avatarUrl: u.currentAvatarImageUrl,
            avatarThumbUrl: u.profilePicOverrideThumbnail || u.currentAvatarThumbnailImageUrl
          });
          break;
        }
        case 'friend-add': {
          const u = content.user || {};
          const id = content.userId || u.id;
          const loc = parseLocation(u.location);
          const state = loc.isReal || u.location === 'private' ? 'online' : 'offline';
          await applyFriendInput(user, id, {
            state, status: u.status || 'active', statusDescription: u.statusDescription || null,
            worldId: loc.isReal ? loc.worldId : (u.location === 'private' ? 'private' : null),
            worldName: u.location === 'private' ? '私密世界' : null,
            platform: u.platform || null, displayName: u.displayName, avatarUrl: u.currentAvatarImageUrl,
            avatarThumbUrl: u.profilePicOverrideThumbnail || u.currentAvatarThumbnailImageUrl
          });
          break;
        }
        case 'friend-delete': {
          const id = content.userId;
          db.deleteFriend(user.id, id);
          log.info(`[monitor] 好友 ${id} 已删除`);
          break;
        }
        case 'notification-v2':
        case 'notification': {
          await dispatchVrcNotification(user, content, vrcapi);
          break;
        }
        case 'notification-v2-update':
        case 'notification-v2-delete':
        case 'response-notification':
        case 'see-notification':
        case 'hide-notification':
        case 'clear-notification': {
          const cid = (content && content.id) || (typeof content === 'string' ? content : '');
          log.info(`[monitor] ${type}: id=${cid || '?'}`);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      log.error(`[monitor] 事件处理失败 type=${type}: ${e.message}`);
    }
  }

  // ---------- 快照对账 ----------
  async function runSnapshot(userId, opts = {}) {
    // 任何触发都把自动对账顺延到最后一次触发之后
    scheduleAutoReconcile();
    const session = sessions.get(userId);
    if (!session) return { ok: false, error: '无活动会话' };
    if (running.has(userId)) return { ok: false, error: '快照进行中' };
    running.add(userId);
    const user = db.getUserByVrcId(userId);
    try {
      if (!user) return { ok: false, error: '用户不存在' };
      const { vrcapi } = session;
      let currentUser;
      let online;
      let offline;
      try {
        currentUser = await vrcapi.me(opts);
        [online, offline] = await Promise.all([
          vrcapi.friends({ offline: false, noRetry: opts.noRetry }),
          vrcapi.friends({ offline: true, noRetry: opts.noRetry })
        ]);
      } catch (e) {
        if (e.status === 401) {
          if (isMissingCredentials(e)) {
            // cookie 作废(换 IP): 请求自动重登, 保留会话
            log.warn(`[monitor] 对账 401 Missing Credentials, 请求自动重登: ${userId}`);
            events.emit('relogin-needed', { userId, reason: '对账 401' });
          } else if (isUnauthorized(e)) {
            // 会话被挂起: 只重过 2FA
            log.warn(`[monitor] 对账 401 Unauthorized, 请求 2FA: ${userId}`);
            events.emit('unauthorized-2fa', { userId });
          } else {
            log.warn(`[monitor] 会话失效(${e.message}), 通知并停用 ${userId}`);
            events.emit('session-expired', { userId, reason: e.message });
            deactivateUser(userId);
          }
        } else {
          log.error(`[monitor] 快照失败 userId=${userId}: ${e.message}`);
        }
        return { ok: false, error: e.message };
      }

      const merged = new Map();
      for (const f of online) if (f && f.id) merged.set(f.id, f);
      for (const f of offline) if (f && f.id && !merged.has(f.id)) merged.set(f.id, f);

      // 自己的信息走公开资料端点; 失败不兜底也不影响好友对账
      let selfInfo = null;
      try {
        selfInfo = await vrcapi.user(userId, { noRetry: opts.noRetry });
      } catch (e) {
        log.warn(`[monitor] 自己信息获取失败 userId=${userId}: ${e.message}`);
      }
      if (selfInfo && selfInfo.id) {
        const existingSelf = db.getUserByVrcId(userId);
        const selfLoc = parseLocation(selfInfo.location);
        const selfTraveling = selfInfo.location === 'traveling';
        const selfWorldId = selfLoc.isReal ? selfLoc.worldId : (selfInfo.location === 'private' ? 'private' : (selfTraveling && existingSelf ? existingSelf.world_id : null));
        const selfWorldName = selfWorldId && selfWorldId !== 'private' ? await resolveWorldName(vrcapi, selfWorldId) : (selfWorldId === 'private' ? '私密世界' : (selfTraveling && existingSelf ? existingSelf.world_name : null));
        await applySelfInput(user, {
          state: deriveSelfState(selfInfo.location, selfInfo.state),
          status: selfInfo.status && selfInfo.status !== 'offline' ? selfInfo.status : 'active',
          statusDescription: selfInfo.statusDescription,
          worldId: selfWorldId, worldName: selfWorldName,
          platform: selfInfo.last_platform || selfInfo.platform,
          displayName: selfInfo.displayName,
          avatarUrl: selfInfo.currentAvatarImageUrl,
          avatarThumbUrl: selfInfo.profilePicOverrideThumbnail || selfInfo.currentAvatarThumbnailImageUrl
        });
      }

      let worldResolves = 0;
      const applyOpts = opts.initial ? { silent: true } : {};

      for (const [id, f] of merged) {
        const state = deriveStateFromSnapshot(f, currentUser);
        const loc = parseLocation(f.location);
        const existingForTravel = db.getFriend(user.id, id);
        const worldId = loc.isReal ? loc.worldId : (f.location === 'private' ? 'private' : (f.location === 'traveling' && existingForTravel ? existingForTravel.world_id : null));
        let worldName = null;
        const cachedW = worldId && worldId !== 'private' ? worldCacheFresh(worldId) : null;
        if (cachedW) {
          worldName = cachedW.world_name;
        } else if (worldId && worldId !== 'private' && worldResolves < maxWorldResolvesPerSnapshot) {
          const existing = db.getFriend(user.id, id);
          if (!existing || existing.world_id !== worldId || !existing.world_name) {
            worldName = await resolveWorldName(vrcapi, worldId);
            if (worldName && worldName !== worldId) worldResolves++;
          } else {
            worldName = existing.world_name;
          }
        } else if (worldId === 'private') {
          worldName = '私密世界';
        }
        await applyFriendInput(user, id, {
          state,
          status: state === 'offline' ? undefined : (f.status || 'active'),
          statusDescription: state === 'offline' ? undefined : (f.statusDescription || null),
          worldId, worldName, platform: f.platform || null,
          displayName: f.displayName, avatarUrl: f.currentAvatarImageUrl || null,
          avatarThumbUrl: f.profilePicOverrideThumbnail || f.currentAvatarThumbnailImageUrl || null,
          trustLevel: trustLevelFromTags(f.tags)
        }, applyOpts);
      }

      // 快照缺失的已入库好友 → 视为离线
      for (const f of db.listFriends(user.id)) {
        if (!merged.has(f.friend_vrchat_id)) {
          await applyFriendInput(user, f.friend_vrchat_id, { state: 'offline', worldId: null, worldName: null, platform: null }, applyOpts);
        }
      }

      events.emit('snapshot', { userId, count: merged.size, at: now() }); // snapshot 监听器负责 apiOk/恢复判定/说明推送
      log.info(`[monitor] 快照完成 userId=${userId}, 好友 ${merged.size} 人`);
      return { ok: true, count: merged.size };
    } finally {
      running.delete(userId);
      awaitingSnapshot.delete(userId); // 对账完成: 解除重连后的消息拦截
    }
  }

  // ---------- watchdog ----------
  async function runWatchdog() {
    for (const { user } of activeUsers()) {
      const uid = user.vrchat_user_id;
      if (pipeline.isConnected(uid)) {
        const last = pipeline.lastMessageAt(uid);
        if (last === 0 || now() - last >= watchdogMs) {
          log.info(`[monitor] watchdog: userId=${uid} ${Math.round(watchdogMs / 60000)} 分钟无 WS 消息, 强制重连(重连成功后先对账)`);
          pipeline.forceReconnect(uid);
        }
      }
    }
  }

  // ---------- 定时器 ----------
  // 自动对账是滑动窗口: 任何一次对账触发后, 顺延到 snapshotIntervalMs 后再跑
  function scheduleAutoReconcile() {
    if (autoTimer) clearTimeout(autoTimer);
    autoAt = now() + snapshotIntervalMs;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      for (const { user } of activeUsers()) {
        runSnapshot(user.vrchat_user_id).catch((e) => log.error(`[monitor] 自动对账失败: ${e.message}`));
      }
    }, snapshotIntervalMs);
    autoTimer.unref?.();
  }

  function startTimers() {
    if (autoTimer) return;
    scheduleAutoReconcile();
    watchdogTimer = setInterval(() => {
      runWatchdog().catch((e) => log.error(`[monitor] watchdog 失败: ${e.message}`));
    }, watchdogCheckMs);
    watchdogTimer.unref?.();
  }

  function stopTimers() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  }

  return {
    activateUser, deactivateUser, activeUsers, sendShutdownNotice,
    handlePipelineEvent, handleWsReconnect, runSnapshot, runWatchdog,
    startTimers, stopTimers, events,
    _debug: { nextAutoReconcileAt: () => (autoTimer ? autoAt : null) }
  };
}

module.exports = { createMonitor };
