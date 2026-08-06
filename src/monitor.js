'use strict';
// 监控编排层: WS 事件分发 + REST 快照对账 + 状态机落地 + 通知去重 + watchdog。

const { EventEmitter } = require('node:events');
const { deriveStateFromSnapshot, applyChange } = require('./state');
const { parseLocation } = require('./location');
const { formatLocalTime, createLogger } = require('./util');

function createMonitor({ db, notifier, pipeline, bus = null, config = {}, logger = null, now = Date.now }) {
  const log = logger || createLogger('monitor');
  const events = bus || new EventEmitter();
  const sessions = new Map();      // vrchat_user_id -> { vrcapi, user }

  const confirmDelayMs = config.confirmDelayMs ?? 30000;
  const dedupeWindowMs = config.dedupeWindowMs ?? 30000;
  const WORLD_CACHE_OK_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 成功名称缓存 1 年
  const WORLD_CACHE_UNKNOWN_TTL_MS = 24 * 60 * 60 * 1000; // 未知世界缓存 1 天
  const UNKNOWN_WORLD_NAME = '未知世界';
  const snapshotIntervalMs = config.snapshotIntervalMs ?? 3600 * 1000;
  const watchdogMs = config.watchdogMs ?? 10 * 60 * 1000;
  const watchdogCheckMs = config.watchdogCheckMs ?? 60 * 1000;
  const maxWorldResolvesPerSnapshot = config.maxWorldResolvesPerSnapshot ?? 6;

  let autoTimer = null;
  let autoAt = 0; // 下一次自动对账的计划时间(用于日志/测试)
  let watchdogTimer = null;
  const running = new Set();          // userId: 快照进行中(并发触发直接忽略)
  const awaitingSnapshot = new Set(); // userId: ws 重连成功后等待全量对账, 期间忽略 WS 消息

  // ---------- 会话 ----------
  function activeUsers() {
    return [...sessions.values()];
  }

  async function activateUser(user, vrcapi) {
    sessions.set(user.vrchat_user_id, { vrcapi, user });
    log.info(`[monitor] 激活用户 ${user.display_name}(${user.vrchat_user_id})`);
    pipeline.connect(user.vrchat_user_id, user.display_name);
    await runSnapshot(user.vrchat_user_id);
  }

  function deactivateUser(vrcId) {
    sessions.delete(vrcId);
    pipeline.disconnect(vrcId);
    log.info(`[monitor] 停用用户 ${vrcId}`);
  }

  // ---------- 监控范围 ----------
  async function monitoredConfigs(user) {
    return db.listConfigs(user.id).filter((c) => c.monitor_enabled === 1);
  }

  // ---------- 世界名 ----------
  function worldCacheFresh(worldId) {
    const c = db.getWorldCache(worldId);
    if (!c) return null;
    const ttl = c.world_name === UNKNOWN_WORLD_NAME ? WORLD_CACHE_UNKNOWN_TTL_MS : WORLD_CACHE_OK_TTL_MS;
    return now() - c.updated_at < ttl ? c : null;
  }

  async function resolveWorldName(vrcapi, worldId) {
    if (!worldId || worldId === 'private' || worldId === 'offline' || worldId === 'traveling') return null;
    const cached = worldCacheFresh(worldId);
    if (cached) return cached.world_name;
    let name = UNKNOWN_WORLD_NAME;
    try {
      const w = await vrcapi.world(worldId, { noRetry: true }); // 世界名查询失败不阻塞快照, 缓存未知世界
      if (w && w.name) name = w.name;
    } catch (e) {
      log.warn(`[monitor] 世界 ${worldId} 名称获取失败: ${e.message}`);
    }
    db.upsertWorldCache(worldId, name, now());
    return name;
  }

  // ---------- 通知 ----------
  async function dispatchNotification(user, friendVrcId, change) {
    if (!change) return;
    const config = db.getConfig(user.id, friendVrcId);
    if (!config || config.monitor_enabled !== 1) return;
    if (change.notifyField && config[change.notifyField] !== 1) return;
    const monitored = new Set((await monitoredConfigs(user)).map((c) => c.friend_vrchat_id));
    if (!monitored.has(friendVrcId)) return;

    const key = `${user.id}|${friendVrcId}|${change.changeType}|${change.newWorldId || ''}`;
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

  function eventTypeFor(changeType) {
    const map = { 上线: 'friend_online', 下线: 'friend_offline', 状态变化: 'status_change', 切换世界: 'world_change', 自定义状态: 'status_description_change', 测试通知: 'test' };
    return map[changeType] || 'status_change';
  }

  // ---------- 状态落地 ----------
  async function applyFriendInput(user, friendVrcId, input) {
    // 头像统一走 /api/1/image/ 缩略图: 优先显式缩略图 URL, 缺失时由原图 URL 转换
    const thumbUrl = input.avatarThumbUrl || null;
    const existed = db.getFriend(user.id, friendVrcId);
    if (!existed) {
      db.upsertFriend(user.id, friendVrcId, {
        state: input.state || 'offline', status: input.status || null,
        worldId: input.worldId || null, worldName: input.worldName || null,
        statusDescription: input.statusDescription || null, platform: input.platform || null,
        displayName: input.displayName || null, avatarUrl: input.avatarUrl || null, avatarThumbUrl: thumbUrl,
        lastSeen: now()
      });
      // 首见: 以离线为基线判定转移, 上线即通知(与快照对账语义一致)
      const baseline = { state: 'offline', status: 'active', worldId: null, worldName: null, statusDescription: null, platform: 'unknown' };
      const result = applyChange(baseline, {
        state: input.state, status: input.status, worldId: input.worldId,
        worldName: input.worldName, statusDescription: input.statusDescription, platform: input.platform
      }, { now, confirmDelayMs,  });
      if (result.notify) {
        await dispatchNotification(user, friendVrcId, { ...result.change, friendId: friendVrcId });
      }
      return;
    }
    // 仅更新资料字段, 状态由状态机接管
    if (input.displayName !== undefined || input.avatarUrl !== undefined || input.avatarThumbUrl !== undefined) {
      db.updateFriendProfile(existed.id, { displayName: input.displayName, avatarUrl: input.avatarUrl, avatarThumbUrl: thumbUrl });
    }
    const cur = db.getFriend(user.id, friendVrcId);
    const result = applyChange(cur, {
      state: input.state, status: input.status, worldId: input.worldId,
      worldName: input.worldName, statusDescription: input.statusDescription, platform: input.platform
    }, { now, confirmDelayMs,  });
    db.updateFriendState(cur.id, { ...result.dbUpdate, last_seen: now() });
    if (result.notify) {
      await dispatchNotification(user, friendVrcId, { ...result.change, friendId: friendVrcId, newWorldId: result.dbUpdate.world_id });
    }
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
          const worldId = loc.isReal ? loc.worldId : null;
          const worldName = worldId ? await resolveWorldName(vrcapi, worldId) : null;
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
          await applyFriendInput(user, id, { state: 'offline', status: null, worldId: null, worldName: null, statusDescription: null, platform: content.platform || null });
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
          });
          break;
        }
        case 'friend-update': {
          const u = content.user;
          if (!u || !u.id) break;
          const existing = db.getFriend(user.id, u.id);
          await applyFriendInput(user, u.id, {
            state: existing ? existing.state : undefined,
            status: u.status || null,
            statusDescription: u.statusDescription !== undefined ? u.statusDescription : null,
            platform: u.last_platform || null,
            displayName: u.displayName, avatarUrl: u.currentAvatarImageUrl, avatarThumbUrl: u.profilePicOverrideThumbnail || u.currentAvatarThumbnailImageUrl
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
            worldId: loc.isReal ? loc.worldId : null, worldName: null,
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
          log.warn(`[monitor] 会话失效(${e.message}), 通知并停用 ${userId}`);
          events.emit('session-expired', { userId, reason: e.message });
          deactivateUser(userId);
        } else {
          log.error(`[monitor] 快照失败 userId=${userId}: ${e.message}`);
        }
        return { ok: false, error: e.message };
      }

      const merged = new Map();
      for (const f of online) if (f && f.id) merged.set(f.id, f);
      for (const f of offline) if (f && f.id && !merged.has(f.id)) merged.set(f.id, f);

      const monitored = await monitoredConfigs(user);
      const monitoredIds = new Set(monitored.map((c) => c.friend_vrchat_id));
      let worldResolves = 0;

      for (const [id, f] of merged) {
        const state = deriveStateFromSnapshot(f, currentUser);
        const loc = parseLocation(f.location);
        const existingForTravel = db.getFriend(user.id, id);
        const worldId = loc.isReal ? loc.worldId : (f.location === 'private' ? 'private' : (f.location === 'traveling' && existingForTravel ? existingForTravel.world_id : null));
        let worldName = null;
        const cachedW = worldId && worldId !== 'private' ? worldCacheFresh(worldId) : null;
        if (cachedW) {
          worldName = cachedW.world_name;
        } else if (worldId && worldId !== 'private' && monitoredIds.has(id) && worldResolves < maxWorldResolvesPerSnapshot) {
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
          state, status: f.status || 'active', statusDescription: f.statusDescription || null,
          worldId, worldName, platform: f.platform || null,
          displayName: f.displayName, avatarUrl: f.currentAvatarImageUrl || null,
          avatarThumbUrl: f.profilePicOverrideThumbnail || f.currentAvatarThumbnailImageUrl || null
        });
      }

      // 被监控但快照缺失的好友 → 视为离线
      for (const c of monitored) {
        if (!merged.has(c.friend_vrchat_id)) {
          await applyFriendInput(user, c.friend_vrchat_id, { state: 'offline', status: null, worldId: null, worldName: null, statusDescription: null, platform: null });
        }
      }

      events.emit('snapshot', { userId, count: merged.size, at: now() });
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
          log.warn(`[monitor] watchdog: userId=${uid} ${Math.round(watchdogMs / 60000)} 分钟无 WS 消息, 强制重连(重连成功后先对账)`);
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
    activateUser, deactivateUser, activeUsers,
    handlePipelineEvent, handleWsReconnect, runSnapshot, runWatchdog,
    startTimers, stopTimers, events,
    _debug: { nextAutoReconcileAt: () => (autoTimer ? autoAt : null) }
  };
}

module.exports = { createMonitor };
