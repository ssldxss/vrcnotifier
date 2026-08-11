'use strict';
// 好友状态机: 状态派生、转移分类、pending-offline 防闪烁确认。

const GAME_STATUSES = ['active', 'join me', 'ask me', 'busy'];

/** 由 location 字符串派生 presence 状态 */
function deriveStateFromLocation(location) {
  const s = String(location ?? '');
  if (s === 'offline' || s === '') return 'offline';
  if (s === 'private' || s === 'traveling' || s.startsWith('wrld_')) return 'online';
  return 'offline';
}

/** 由快照派生状态: CurrentUser 数组优先, location 兜底 */
function deriveStateFromSnapshot(friend, currentUser) {
  if (currentUser) {
    if (Array.isArray(currentUser.onlineFriends) && currentUser.onlineFriends.includes(friend.id)) return 'online';
    if (Array.isArray(currentUser.activeFriends) && currentUser.activeFriends.includes(friend.id)) return 'active';
    if (Array.isArray(currentUser.offlineFriends) && currentUser.offlineFriends.includes(friend.id)) return 'offline';
  }
  return deriveStateFromLocation(friend.location);
}

/**
 * 分类状态转移。prev/next: {state, status, worldId, worldName, statusDescription}
 * 返回 { changeType, notifyField, needsConfirm } 或 null(不通知)。
 * notifyField: null 表示"只要在监控名单就通知"(自定义状态)。
 */
function classifyTransition(prev, next, opts = {}) {
  const a = prev.state;
  const b = next.state;
  if (a === 'offline' && b === 'online') return { changeType: '上线', notifyField: 'notify_online', needsConfirm: false };
  if (a === 'online' && b === 'offline') return { changeType: '下线', notifyField: 'notify_offline', needsConfirm: true };
  if (a === 'offline' && b === 'active') return { changeType: 'web端上线', notifyField: 'notify_online', needsConfirm: false }; // 网页端上线
  if (a === 'active' && b === 'offline') return null; // 网页下线, 不通知
  if (a === 'active' && b === 'online') return { changeType: '上线', notifyField: 'notify_online', needsConfirm: false }; // 网页在线进入游戏 = 上线
  if (a === 'online' && b === 'active') return { changeType: '下线', notifyField: 'notify_offline', needsConfirm: true }; // 退出游戏但网页在线 = 下线
  if (a === 'online' && b === 'online') {
    // 世界变化(全量解析; 可见世界状态下新旧世界均已知且不同才通知)
    // world/location changed -> notify (incl. private, unknown origin, any status)
    const oldId = prev.worldId || null;
    const newId = next.worldId || null;
    if (oldId !== newId) {
      return { changeType: '切换世界', notifyField: 'notify_world_change', needsConfirm: false };
    }
    // 游戏在线四态间切换
    if (GAME_STATUSES.includes(prev.status) && GAME_STATUSES.includes(next.status) && prev.status !== next.status) {
      return { changeType: '状态变化', notifyField: 'notify_status_change', needsConfirm: false };
    }
    // 自定义状态变化(同一状态内)
    if ((prev.statusDescription || null) !== (next.statusDescription || null)) {
      return { changeType: '自定义状态', notifyField: 'notify_status_change', needsConfirm: false };
    }
  }
  return null;
}

/**
 * 应用一次状态输入(WS 事件或快照 diff)。
 * prevDb: {state,status,worldId,worldName,statusDescription,platform,pending_state,pending_at}
 * incoming: 字段可选, 缺省继承 prev。
 * 返回 { notify, change|null, dbUpdate }。
 */
function applyChange(prevDb, incoming, opts = {}) {
  const now = opts.now || Date.now;
  const confirmDelayMs = opts.confirmDelayMs == null ? 30000 : opts.confirmDelayMs;

  const prev = {
    state: prevDb.state || 'offline',
    status: prevDb.status || 'active',
    worldId: prevDb.worldId ?? prevDb.world_id ?? null,
    worldName: prevDb.worldName ?? prevDb.world_name ?? null,
    statusDescription: prevDb.statusDescription ?? prevDb.status_description ?? null,
    platform: prevDb.platform || 'unknown'
  };
  const next = {
    state: incoming.state !== undefined ? incoming.state : prev.state,
    status: incoming.status !== undefined ? incoming.status : prev.status,
    worldId: incoming.worldId !== undefined ? incoming.worldId : prev.worldId,
    worldName: incoming.worldName !== undefined ? incoming.worldName : prev.worldName,
    statusDescription: incoming.statusDescription !== undefined ? incoming.statusDescription : prev.statusDescription,
    platform: incoming.platform !== undefined ? incoming.platform : prev.platform
  };

  const dbUpdate = {
    state: next.state,
    status: next.status,
    world_id: next.worldId,
    world_name: next.worldName,
    status_description: next.statusDescription,
    platform: next.platform,
    pending_state: null,
    pending_at: null
  };

  const transition = classifyTransition(prev, next, opts);

  // 1) pending 未决时回到 online → 视为抖动回退, 取消 pending 且不通知
  if (prevDb.pending_state && next.state === 'online') {
    return { notify: false, change: null, dbUpdate }; // dbUpdate 已清空 pending
  }
  // 1.5) pending 未决且变为其他非 online 状态(offline<->active) → 更新 pending 目标并重新计时
  if (prevDb.pending_state && next.state !== prevDb.pending_state) {
    dbUpdate.pending_state = next.state;
    dbUpdate.pending_at = now();
    return { notify: false, change: null, dbUpdate };
  }

  // 2) pending 未决且状态再次到达目标状态 → 按确认窗口判定是否真正确认
  if (prevDb.pending_state && next.state === prevDb.pending_state) {
    const pendingAt = prevDb.pending_at || 0;
    if (now() - pendingAt >= confirmDelayMs) {
      const confirmed = transition || {
        changeType: '下线',
        notifyField: 'notify_offline',
        needsConfirm: false
      };
      return { notify: true, change: buildChange(confirmed, prev, next), dbUpdate };
    }
    dbUpdate.pending_state = prevDb.pending_state;
    dbUpdate.pending_at = pendingAt;
    return { notify: false, change: null, dbUpdate };
  }

  // 3) 需要确认的新转移 → 启动 pending
  if (transition && transition.needsConfirm) {
    dbUpdate.pending_state = next.state;
    dbUpdate.pending_at = now();
    return { notify: false, change: null, dbUpdate };
  }

  // 4) 普通转移
  if (transition) return { notify: true, change: buildChange(transition, prev, next), dbUpdate };

  return { notify: false, change: null, dbUpdate };
}

function buildChange(transition, prev, next) {
  return {
    changeType: transition.changeType,
    notifyField: transition.notifyField,
    oldState: prev.state,
    newState: next.state,
    oldStatus: prev.status,
    newStatus: next.status,
    oldWorld: prev.worldName,
    newWorld: next.worldName,
    oldStatusDescription: prev.statusDescription || '无',
    newStatusDescription: next.statusDescription || '无',
    oldPlatform: prev.platform,
    newPlatform: next.platform,
    oldWorldId: prev.worldId,
    newWorldId: next.worldId
  };
}

module.exports = { deriveStateFromLocation, deriveStateFromSnapshot, classifyTransition, applyChange };
