'use strict';
// 监控编排层: WS 事件分发 + REST 快照对账 + 状态机落地 + 通知去重 + watchdog。

const { EventEmitter } = require('node:events');
const { applyChange } = require('./state');
const { parseLocation } = require('./location');
const { formatLocalTime, createLogger, trustLevelFromTags, withDeadline } = require('./util');
const { isMissingCredentials, isUnauthorized } = require('./vrcapi');
const { createWorldName } = require('./worldname');
const { STARTUP_TEXT } = require('./qq-commands');

function createMonitor({ db, notifier, pipeline, bus = null, config = {}, logger = null, now = Date.now, worldFetcher = null, worldName = null }) {
  const log = logger || createLogger('monitor');
  const events = bus || new EventEmitter();
  const sessions = new Map();      // vrchat_user_id -> { vrcapi, user }

  // 世界名查询: 全项目唯一入口(src/worldname.js)。模块管查询/缓存/失败兜底, 等待由各调用点自己设上限。
  const worldNames = worldName || createWorldName({
    db, bus: events, logger: log, now,
    // 生产走独立无 Cookie 的世界模块; 测试未注入时回退到活跃会话的 vrcapi
    fetchWorld: (id) => {
      if (worldFetcher) return worldFetcher.world(id);
      const first = sessions.values().next().value;
      if (!first) return Promise.reject(Object.assign(new Error('无活跃会话'), { status: -1 }));
      return first.vrcapi.world(id, { noRetry: true });
    },
    config: config.worldName || {}
  });

  const confirmDelayMs = config.confirmDelayMs ?? 30000;
  const dedupeWindowMs = config.dedupeWindowMs ?? 30000;
  const GROUP_CACHE_OK_TTL_MS = 3600 * 1000; // 群组名成功缓存 1 小时(与世界名一致)
  const WORLD_NAME_RETRY_BASE_MS = config.worldNameRetryBaseMs ?? 5000; // 与 WS 重连一致的退避起步
  const WORLD_NAME_RETRY_MAX_MS = config.worldNameRetryMaxMs ?? 3600 * 1000; // 退避封顶 1h, 封顶后保持不回退
  const UNKNOWN_GROUP_NAME = '未知群组';
  // 需求方等待世界名的上限: 超时用缓存里的旧名字兜底, 查询继续在后台跑完(不阻塞上游链路)
  const WORLD_NAME_WAIT_MS = config.worldNameWaitMs ?? 3000;
  const RECOVERY_TEXT = '# ✅ 服务已恢复\n好友监控运行中\n输入任意消息即可查看在线列表';
  const snapshotIntervalMs = config.snapshotIntervalMs ?? 3600 * 1000;
  const watchdogMs = config.watchdogMs ?? 3600 * 1000;
  const watchdogCheckMs = config.watchdogCheckMs ?? 60 * 1000;
  const statusCoalesceMs = config.statusCoalesceMs ?? 3000; // 状态变化+切世界合并窗口
  const faultNotifyMs = config.faultNotifyMs ?? 5 * 60 * 1000; // 故障(WS 断开/401)持续超过 5 分钟才通知

  let autoTimer = null;
  let autoAt = 0; // 下一次自动对账的计划时间(用于日志/测试)
  let watchdogTimer = null;
  const running = new Set();          // userId: 快照进行中(并发触发直接忽略)
  const awaitingSnapshot = new Set(); // userId: ws 重连成功后等待全量对账, 期间忽略 WS 消息
  const pendingStatus = new Map();     // friendId: 状态变化合并中(待 friend-location 执行)
  const pendingBuckets = new Map();    // userId: { timer, friends:Set<friendId> } 下线 pending 到期验证(多好友共享一次 me())
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

  bus.on('ws-open', ({ userId }) => {
    const st = stateOf(userId);
    st.open = true;
    const s = sessions.get(userId);
    if (!s) return;
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
    const bucket = pendingBuckets.get(vrcId);
    if (bucket) {
      if (bucket.timer) clearTimeout(bucket.timer);
      pendingBuckets.delete(vrcId);
    }
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
  // 查询/缓存/失败兜底全在 src/worldname.js; 这里只负责"等多久"。
  // 超时用 peek 的旧名字先顶上, 查询继续在后台跑完(查到会写缓存并推 SSE)。
  // 调用点自行处理 private/offline/traveling 等哨兵值, 本函数只吃真实世界编号。
  /** world_id -> 当前缓存里的显示名(同步, 不发请求); private 是哨兵值, 就地写死 */
  function prevWorldName(worldId) {
    if (!worldId) return null;
    return worldId === 'private' ? '私密世界' : worldNames.peek(worldId);
  }

  function lookupWorldName(worldId) {
    return withDeadline(
      worldNames.get(worldId),
      WORLD_NAME_WAIT_MS,
      () => worldNames.peek(worldId)
    );
  }

  // ---------- 群组名 ----------
  // 与世界名同构: 成功缓存 1 小时, 失败指数退避(封顶 1h), 退避期内沿用"未知群组"
  // (世界名已迁到 src/worldname.js 按需查询; 群组名暂时保持原实现, 只改 TTL)
  function groupCacheFresh(groupId) {
    const c = db.getGroupCache(groupId);
    if (!c) return null;
    if (c.group_name === UNKNOWN_GROUP_NAME) {
      return now() < (c.retry_at || 0) ? c : null;
    }
    return now() - c.updated_at < GROUP_CACHE_OK_TTL_MS ? c : null;
  }

  async function resolveGroupName(vrcapi, groupId, selfVrcId = null) {
    if (!groupId) return null;
    const cached = groupCacheFresh(groupId);
    if (cached) return cached.group_name;
    const rec = db.getGroupCache(groupId);
    const failCount = rec ? (rec.fail_count || 0) : 0;
    let name = UNKNOWN_GROUP_NAME;
    // 优先批量拉取自己全部群组(1 次请求覆盖所有已加入群组并灌入缓存), 未命中再单查该群组
    if (selfVrcId) {
      try {
        const list = await vrcapi.userGroups(selfVrcId, { noRetry: true });
        if (Array.isArray(list)) {
          const at = now();
          for (const g of list) {
            // 注意: 列表项的 id 是成员关系 id(gmem_*), 真正的群组 id 在 groupId 字段(grp_*)
            if (g && g.groupId && g.name) db.upsertGroupCache(g.groupId, g.name, at, 0, 0);
          }
          const hit = list.find((g) => g && g.groupId === groupId && g.name);
          if (hit) name = hit.name;
        }
      } catch (e) {
        log.warn(`[group] 批量群组获取失败: ${e.message}`);
      }
    }
    if (name === UNKNOWN_GROUP_NAME) {
      try {
        const g = await vrcapi.group(groupId, { noRetry: true }); // 群名获取失败不阻塞通知, 缓存未知群组
        if (g && g.name) name = g.name;
      } catch (e) {
        log.warn(`[group] 群组 ${groupId} 名称获取失败: ${e.message}`);
      }
    }
    if (name === UNKNOWN_GROUP_NAME) {
      const next = failCount + 1;
      const interval = Math.min(WORLD_NAME_RETRY_BASE_MS * 2 ** (next - 1), WORLD_NAME_RETRY_MAX_MS);
      db.upsertGroupCache(groupId, name, now(), next, now() + interval);
    } else {
      db.upsertGroupCache(groupId, name, now(), 0, 0);
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
    requestInvite: '请求邀请',
    invite: '世界邀请',
    boop: '戳一戳',
    'group.announcement': '群组公告'
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

  // 从通知的 details/link/message/title 中提取群组 id。
  // 群组通知(公告等)payload 不带群名, link 形如 "group:grp_xxxx-yyy"; details 若带 groupId 直接取。
  function groupIdFromNotification(n) {
    let details = n && n.details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch (e) { details = null; }
    }
    if (details && typeof details === 'object') {
      const gid = details.groupId || (details.group && details.group.groupId) || null;
      if (gid) return gid;
    }
    const hay = [n && n.link, n && n.message, n && n.title].filter(Boolean).join(' ');
    const m = hay.match(/grp_[A-Za-z0-9-]+/);
    return m ? m[0] : null;
  }

  // VRChat 站内通知(notification / notification-v2) -> 复用通知渠道推送
  // 仅推送三类: 世界邀请(invite/requestInvite) / 戳一戳(boop) / 群组公告(group.announcement);
  // 其余(好友请求/私信/社交/系统等)不推送。
  async function dispatchVrcNotification(user, n, vrcapi) {
    if (!n || !n.id) return;
    // v2 的 type 是具体类型(group.announcement/boop/invite...), category 是宽泛分类; 两者都参与匹配
    const kinds = [String(n.type || ''), String(n.category || '')];
    const kindOf = (...keys) => keys.some((k) => kinds.includes(k));
    // 类型开关(设置页"通知设置"卡片): 默认开启, 仅显式 0 关闭; 判定须在去重标记之前, 否则关再开会补推积压
    const settings = db.getGlobalSettings();
    const isAnnouncement = kindOf('group.announcement');
    if (isAnnouncement) {
      if (settings.notify_group_announcement === 0) return;
    } else if (kindOf('boop')) {
      if (settings.notify_boop === 0) return;
    } else if (kindOf('invite', 'requestInvite')) {
      if (settings.notify_invite === 0) return;
    } else {
      return; // 不在推送范围的类型
    }
    // 无发送者: 仅群组公告放行(公告由群组/系统生成, senderUserId 为空); 发送者是自己 -> 不推送
    if (!n.senderUserId) {
      if (!isAnnouncement) return;
    } else if (n.senderUserId === user.vrchat_user_id) return;
    const key = `${user.id}|notif|${n.id}`;
    if (db.isDuplicate(key, dedupeWindowMs, now())) return;
    db.markNotified(key, now());

    let sender = n.senderUserId ? (db.getFriend(user.id, n.senderUserId) || {}).display_name || n.senderUserId : 'VRChat';
    const rawCategory = kinds[0] || kinds[1] || '';
    const title = n.title || categoryLabel(rawCategory) || 'VRChat通知';
    const message = n.message || '';
    // 内容与标题相同或空时不重复展示
    const body = message && message !== title ? message : '';
    // 世界邀请类: 解析邀请到的世界名, 替代分类行
    let notificationWorld = null;
    if (vrcapi && kindOf('invite', 'requestInvite')) {
      const worldInfo = worldInfoFromNotification(n);
      if (worldInfo && (worldInfo.worldId || worldInfo.worldName)) {
        notificationWorld = worldInfo.worldName
          || (worldInfo.worldId ? await lookupWorldName(worldInfo.worldId) : null);
      } else if (rawCategory === 'invite') {
        log.warn(`[monitor] 邀请通知无世界信息 id=${n.id} link=${n.link || '-'} details=${JSON.stringify(n.details || null)}`);
      }
    }
    // 群组公告: payload 不带群名, 提取 groupId 后经 REST+缓存解析, 作为发送者展示
    let notificationGroup = null;
    if (isAnnouncement) {
      const groupId = groupIdFromNotification(n);
      if (groupId && vrcapi) notificationGroup = await resolveGroupName(vrcapi, groupId, user.vrchat_user_id);
      else if (!groupId) log.warn(`[monitor] 群组公告无群组 id id=${n.id} link=${n.link || '-'} details=${JSON.stringify(n.details || null)}`);
      if (notificationGroup) sender = notificationGroup;
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
  // 下线 pending 到期(confirmDelayMs)后调一次 /auth/user 批量验证真实状态, 再逐个走状态机。
  // 同一账号的多个 pending 好友共享一个定时器 + 一次 me() 请求(N→1)。
  // 到期点 = min(最后到达 + confirmDelayMs, 最早 pending_at + 2*confirmDelayMs):
  // 新下线顺延定时器以合并突发(窗口内 N→1), 但顺延不超过最早 pending 的两倍窗口 ——
  // 持续下线流(间隔 < 窗口)不再把验证饿死: 任意好友至多 2D 内被验证, me() 间隔 ≥ D。
  // 触发安全余量: libuv 定时器按缓存的循环时间计到期, 实际触发可比 Date.now() 基准早 ~1ms,
  // 压着 confirmDelayMs 边界触发会让状态机判"未满窗口"而白费一次 me(); 晚触发无害(只会更成熟)。
  const PENDING_TIMER_SAFETY_MS = 10;

  function schedulePendingCheck(user, friendVrcId) {
    const userId = user.vrchat_user_id;
    let bucket = pendingBuckets.get(userId);
    if (!bucket) {
      bucket = { timer: null, friends: new Set(), oldestPendingAt: null };
      pendingBuckets.set(userId, bucket);
    }
    bucket.friends.add(friendVrcId);
    // deadline 以库里的 pending_at 为准(重挂时保持原始到期点, 不随每轮 me() 扫描顺延)
    const friend = db.getFriend(user.id, friendVrcId);
    const pendingAt = friend && friend.pending_at ? friend.pending_at : now();
    if (bucket.oldestPendingAt === null || pendingAt < bucket.oldestPendingAt) bucket.oldestPendingAt = pendingAt;
    if (bucket.timer) clearTimeout(bucket.timer);
    const deadline = Math.min(now() + confirmDelayMs, bucket.oldestPendingAt + 2 * confirmDelayMs);
    const timer = setTimeout(() => {
      bucket.timer = null;
      bucket.oldestPendingAt = null;
      const friends = [...bucket.friends];
      bucket.friends.clear();
      // 兜底: 定时器回调内的异常若穿透会成为未处理拒绝并终止进程(watchdog/自动对账同此约定)
      resolvePendingAll(user, friends).catch((e) => log.error(`[monitor] pending 到期验证异常: ${e.message}`));
    }, Math.max(0, deadline - now()) + PENDING_TIMER_SAFETY_MS);
    if (timer.unref) timer.unref();
    bucket.timer = timer;
  }

  async function resolvePendingAll(user, friendIds) {
    const session = sessions.get(user.vrchat_user_id);
    if (!session || friendIds.length === 0) return;
    let cu;
    try {
      cu = await session.vrcapi.me({ noRetry: true });
    } catch (e) {
      log.warn(`[monitor] pending 到期验证失败(${friendIds.length} 人, 下轮快照再定): ${e.message}`);
      return;
    }
    const arraysOk = Array.isArray(cu && cu.onlineFriends)
      && Array.isArray(cu && cu.activeFriends)
      && Array.isArray(cu && cu.offlineFriends);
    const rosterOk = Array.isArray(cu && cu.friends);
    const stateOf = (id) => {
      if (Array.isArray(cu && cu.onlineFriends) && cu.onlineFriends.includes(id)) return 'online';
      if (Array.isArray(cu && cu.activeFriends) && cu.activeFriends.includes(id)) return 'active';
      if (Array.isArray(cu && cu.offlineFriends) && cu.offlineFriends.includes(id)) return 'offline';
      return null;
    };
    // 已删除好友判定: 名册(me().friends)可用时以名册为准; 名册缺失退化为三个状态数组;
    // 数据不全(名册与数组都缺)时不判定, 保持现状等下轮快照。
    const isDeleted = (id) => {
      if (rosterOk) return !cu.friends.includes(id);
      if (arraysOk) return !(cu.onlineFriends.includes(id) || cu.activeFriends.includes(id) || cu.offlineFriends.includes(id));
      return false;
    };
    for (const id of friendIds) {
      if (isDeleted(id)) {
        const f = db.getFriend(user.id, id);
        db.deleteFriend(user.id, id);
        clearPendingCheck(user, id);
        log.info(`[monitor] pending 验证 ${id}${f && f.display_name ? `(${f.display_name})` : ''}: 不在好友名册, 视为已删除好友, 已移除记录`);
        continue;
      }
      const state = stateOf(id);
      if (!state) {
        log.warn(`[monitor] pending 到期验证 ${id}: me() 数组中未出现, 保持现状`);
        continue;
      }
      log.info(`[monitor] pending 到期验证 ${id} -> ${state}`);
      await applyFriendInput(user, id, { state }, { eventType: 'pending-check' });
    }
  }

  function clearPendingCheck(user, friendVrcId) {
    const bucket = pendingBuckets.get(user.vrchat_user_id);
    if (!bucket) return;
    bucket.friends.delete(friendVrcId);
    if (bucket.friends.size === 0 && bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }
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
        instanceId: input.instanceId ?? null,
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
    // 世界名不再入库: 状态机要的"旧世界名"从世界名缓存同步取(peek, 不发请求);
    // private 是哨兵值, 缓存里没有, 就地写死
    const result = applyChange({ ...cur, worldName: prevWorldName(cur.world_id) }, {
      state: input.state, status: input.status, worldId: input.worldId,
      worldName: input.worldName, statusDescription: input.statusDescription, platform: input.platform
    }, { now, confirmDelayMs });
    if (opts.silent) {
      result.dbUpdate.pending_state = null;
      result.dbUpdate.pending_at = null;
    }
    // instance_id 不参与状态机: 显式传入则更新, 未传入(undefined)保留旧值
    db.updateFriendState(cur.id, { ...result.dbUpdate, instance_id: input.instanceId !== undefined ? input.instanceId : (existed.instance_id ?? null), last_seen: now() });
    if (opts.silent) {
      clearPendingCheck(user, friendVrcId);
    } else if (result.dbUpdate.pending_state) {
      schedulePendingCheck(user, friendVrcId);
    } else {
      clearPendingCheck(user, friendVrcId);
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
        worldName: pick(input.worldName, prevWorldName(cur.world_id)),
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
          const worldName = worldId === 'private' ? '私密世界' : (worldId ? await lookupWorldName(worldId) : null);
          await applyFriendInput(user, id, {
            state: 'online', status: content.user?.status || 'active',
            statusDescription: content.user?.statusDescription || null,
            worldId, worldName, instanceId: loc.isReal ? loc.instanceId : null, platform: content.platform || null,
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
            worldId: null, worldName: null, instanceId: null, platform: content.platform || 'web',
            displayName: content.user?.displayName, avatarUrl: content.user?.currentAvatarImageUrl,
            avatarThumbUrl: content.user?.profilePicOverrideThumbnail || content.user?.currentAvatarThumbnailImageUrl
          });
          break;
        }
        case 'friend-offline': {
          const id = content.userId || content.user?.id;
          // 下线保留社交状态与自定义状态, 仅更新在线状态/世界/平台/实例
          await applyFriendInput(user, id, { state: 'offline', worldId: null, worldName: null, instanceId: null, platform: content.platform || null });
          break;
        }
        case 'friend-location': {
          const id = content.user?.id || content.userId;
          const loc = parseLocation(content.location);
          const existing = db.getFriend(user.id, id);
          const traveling = content.location === 'traveling';
          const worldId = loc.isReal ? loc.worldId : (content.location === 'private' ? 'private' : (traveling && existing ? existing.world_id : null));
          const worldName = worldId === 'private' ? '私密世界'
            : worldId ? await lookupWorldName(worldId)
              : (traveling && existing ? worldNames.peek(existing.world_id) : null);
          await applyFriendInput(user, id, {
            state: 'online', status: content.user?.status || 'active',
            statusDescription: content.user?.statusDescription || null,
            worldId, worldName, instanceId: loc.isReal ? loc.instanceId : (traveling && existing ? (existing.instance_id ?? null) : null),
            platform: content.platform || null,
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
          // 实例号: 真实实例更新, private 清空, traveling/缺省保留旧值(undefined)
          const instanceId = loc ? (loc.isReal ? loc.instanceId : (u.location === 'private' ? null : undefined)) : undefined;
          await applyFriendInput(user, u.id, {
            state: existing ? existing.state : undefined,
            status: u.status !== undefined ? u.status : undefined, // 缺失时继承旧值
            statusDescription: u.statusDescription !== undefined ? u.statusDescription : undefined,
            platform: u.last_platform || null,
            displayName: u.displayName, avatarUrl: u.currentAvatarImageUrl, avatarThumbUrl: u.profilePicOverrideThumbnail || u.currentAvatarThumbnailImageUrl,
            instanceId,
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
          const worldName = worldId === 'private' ? '私密世界'
            : worldId ? await lookupWorldName(worldId)
              : (traveling && existing ? worldNames.peek(existing.world_id) : null);
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
            instanceId: loc.isReal ? loc.instanceId : null,
            platform: u.platform || null, displayName: u.displayName, avatarUrl: u.currentAvatarImageUrl,
            avatarThumbUrl: u.profilePicOverrideThumbnail || u.currentAvatarThumbnailImageUrl
          });
          break;
        }
        case 'friend-delete': {
          const id = content.userId;
          const f = db.getFriend(user.id, id);
          db.deleteFriend(user.id, id);
          clearPendingCheck(user, id); // 已删好友不再参与 pending 到期验证
          log.info(`[monitor] 好友 ${f && f.display_name ? `${f.display_name}(${id})` : id} 已删除, 已移除记录`);
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
  // 401 分支: 重登 / 2FA / 会话失效(已确认 401 不再被 vrcapi 当临时错误吞掉, 此分支可达)
  function handleAuth401(e, userId) {
    if (!(e && e.status === 401)) return false;
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
    return true;
  }

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

      // ① me(): 状态数组(online/active/offline) + 好友名册 + 自己的 presence, 一次请求全覆盖
      let currentUser;
      try {
        currentUser = await vrcapi.me({ noRetry: opts.noRetry });
      } catch (e) {
        if (!handleAuth401(e, userId)) log.error(`[monitor] 快照失败 userId=${userId}: ${e.message}`);
        return { ok: false, error: e.message };
      }

      // 自己的信息: 直接从 me() 的 presence 取(不再单独请求 users/{id})
      try {
        const pres = currentUser.presence || {};
        const worldRaw = String(pres.world || '');
        const hasWorld = worldRaw.startsWith('wrld_');
        const isPrivate = worldRaw === 'private';
        const traveling = !hasWorld && !isPrivate && String(pres.travelingToWorld || '') !== '';
        const existingSelf = db.getUserByVrcId(userId);
        const selfWorldId = hasWorld ? worldRaw : (isPrivate ? 'private' : (traveling && existingSelf ? existingSelf.world_id : null));
        // 快照不查世界名(按需查询): 只同步看一眼缓存里现有的名字, 缺失交给前端 SSE / QQ 各自按需触发
        const selfWorldName = selfWorldId === 'private' ? '私密世界'
          : selfWorldId ? worldNames.peek(selfWorldId) : null;
        const pseudoLoc = hasWorld ? worldRaw : (isPrivate ? 'private' : (traveling ? 'traveling' : 'offline'));
        await applySelfInput(user, {
          state: deriveSelfState(pseudoLoc, currentUser.state),
          status: currentUser.status && currentUser.status !== 'offline' ? currentUser.status : 'active',
          statusDescription: currentUser.statusDescription || null,
          worldId: selfWorldId, worldName: selfWorldName,
          platform: pres.platform || null,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.currentAvatarImageUrl || null,
          avatarThumbUrl: currentUser.profilePicOverrideThumbnail || currentUser.currentAvatarThumbnailImageUrl || null
        });
      } catch (e) {
        log.warn(`[monitor] 自己信息落地失败 userId=${userId}: ${e.message}`);
      }

      // ② 状态判定: 以 me() 的三个状态数组为准(比好友列表的 location 字段更准)
      const arraysOk = Array.isArray(currentUser.onlineFriends)
        && Array.isArray(currentUser.activeFriends)
        && Array.isArray(currentUser.offlineFriends);
      if (!arraysOk) {
        log.warn(`[monitor] me() 缺少状态数组, 本轮跳过好友状态判定(不改动任何好友, 下轮重试)`);
      }
      const stateOfFriend = (id) => {
        if (currentUser.onlineFriends.includes(id)) return 'online';
        if (currentUser.activeFriends.includes(id)) return 'active';
        if (currentUser.offlineFriends.includes(id)) return 'offline';
        return null;
      };

      // 好友集合: 优先用 me().friends 名册; 缺失时退化为三个状态数组的并集(缺哪个补空, 不抛错)
      const arr = (x) => (Array.isArray(x) ? x : []);
      const friendIds = Array.isArray(currentUser.friends)
        ? [...new Set(currentUser.friends)]
        : [...new Set([...arr(currentUser.onlineFriends), ...arr(currentUser.activeFriends), ...arr(currentUser.offlineFriends)])];

      // ③ 在线+活动好友的详情: 一次 /friends?offline=false(离线好友 0 请求)
      const needDetails = new Set();
      if (arraysOk) {
        for (const id of friendIds) {
          const s = stateOfFriend(id);
          if (s === 'online' || s === 'active') needDetails.add(id);
        }
      }
      const onlineMap = new Map();
      if (needDetails.size > 0) {
        try {
          const list = await vrcapi.friends({ offline: false, noRetry: opts.noRetry });
          for (const f of list) if (f && f.id) onlineMap.set(f.id, f);
        } catch (e) {
          if (!handleAuth401(e, userId)) log.error(`[monitor] 在线列表获取失败 userId=${userId}: ${e.message}`);
          return { ok: false, error: e.message };
        }
      }

      // 首次快照: 拉一次离线名册, 只为补长期离线好友的资料(名称/头像), 之后不再拉
      let offlineSeed = null;
      if (opts.initial) {
        try {
          offlineSeed = new Map();
          const list = await vrcapi.friends({ offline: true, noRetry: opts.noRetry });
          for (const f of list) if (f && f.id) offlineSeed.set(f.id, f);
        } catch (e) {
          if (handleAuth401(e, userId)) return { ok: false, error: e.message };
          log.warn(`[monitor] 首次快照离线名册获取失败, 跳过离线好友资料补全: ${e.message}`);
        }
      }

      const applyOpts = opts.initial ? { silent: true } : {};
      let processed = 0;

      for (const id of friendIds) {
        if (!arraysOk) break;
        const state = stateOfFriend(id);
        if (state === null) {
          log.warn(`[monitor] ${id} 在 me() 名单中但未出现在状态数组, 本轮保持现状`);
          continue;
        }
        if (state === 'online' || state === 'active') {
          const f = onlineMap.get(id);
          if (!f) {
            log.warn(`[monitor] ${id} 状态为 ${state} 但在线列表中缺失, 本轮跳过(下轮重试)`);
            continue;
          }
          const loc = parseLocation(f.location);
          const existingForTravel = db.getFriend(user.id, id);
          const worldId = loc.isReal ? loc.worldId : (f.location === 'private' ? 'private' : (f.location === 'traveling' && existingForTravel ? existingForTravel.world_id : null));
          // 快照不查世界名(按需查询): 只同步看一眼缓存里现有的名字
          const worldName = worldId === 'private' ? '私密世界'
            : worldId ? worldNames.peek(worldId) : null;
          await applyFriendInput(user, id, {
            state,
            status: f.status || 'active',
            statusDescription: f.statusDescription || null,
            worldId, worldName,
            instanceId: loc.isReal ? loc.instanceId : null,
            platform: f.last_platform || f.platform || null,
            displayName: f.displayName, avatarUrl: f.currentAvatarImageUrl || null,
            avatarThumbUrl: f.profilePicOverrideThumbnail || f.currentAvatarThumbnailImageUrl || null,
            trustLevel: trustLevelFromTags(f.tags)
          }, applyOpts);
        } else {
          // 离线: 0 请求; 首次快照时用种子名册补资料
          const seed = offlineSeed ? offlineSeed.get(id) : null;
          await applyFriendInput(user, id, {
            state: 'offline', worldId: null, worldName: null, instanceId: null, platform: null,
            ...(seed ? {
              displayName: seed.displayName,
              avatarUrl: seed.currentAvatarImageUrl || null,
              avatarThumbUrl: seed.profilePicOverrideThumbnail || seed.currentAvatarThumbnailImageUrl || null,
              trustLevel: trustLevelFromTags(seed.tags)
            } : {})
          }, applyOpts);
        }
        processed++;
      }

      // 已入库但不在本轮名单中的好友:
      // 名册(me().friends)可用 → 确定已不是好友, 直接移除记录(区分"下线"与"已删除", 不再误推下线);
      // 名册缺失(名单为三个状态数组并集) → 沿用旧逻辑置离线(数据不全不判删); 状态判定不可用时不翻转。
      if (arraysOk) {
        const known = new Set(friendIds);
        const rosterOk = Array.isArray(currentUser.friends);
        for (const f of db.listFriends(user.id)) {
          if (known.has(f.friend_vrchat_id)) continue;
          if (rosterOk) {
            db.deleteFriend(user.id, f.friend_vrchat_id);
            clearPendingCheck(user, f.friend_vrchat_id);
            log.info(`[monitor] 快照对账 ${f.friend_vrchat_id}${f.display_name ? `(${f.display_name})` : ''} 不在好友名册, 视为已删除好友, 已移除记录`);
          } else {
            await applyFriendInput(user, f.friend_vrchat_id, { state: 'offline', worldId: null, worldName: null, instanceId: null, platform: null }, applyOpts);
          }
          processed++;
        }
      }

      events.emit('snapshot', { userId, count: processed, at: now() }); // snapshot 监听器负责 apiOk/恢复判定/说明推送
      log.info(`[monitor] 快照完成 userId=${userId}, 好友 ${processed} 人`);
      return { ok: true, count: processed };
    } catch (e) {
      // 兜底: 任何未预期异常(字段缺失/内部错误)都不允许穿透到调用者
      log.error(`[monitor] 快照执行异常 userId=${userId}: ${e.message}`);
      return { ok: false, error: e.message };
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
    worldName: worldNames, // 供 server 读接口同步补名字(peek)与订阅 world-name 事件
    _debug: { nextAutoReconcileAt: () => (autoTimer ? autoAt : null) }
  };
}

module.exports = { createMonitor };
