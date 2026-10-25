'use strict';
// 好友状态机: 转移分类、上/下线的 pending 防闪烁确认(确认期间只钉住 state 一列)。

const GAME_STATUSES = ['active', 'join me', 'ask me', 'busy'];

/**
 * 分类状态转移。prev/next: {state, status, worldId, worldName, statusDescription}
 * 返回 { changeType, notifyField, needsConfirm } 或 null(不通知)。
 * notifyField 是发通知前要去好友行上查的逐好友开关列名(monitor.dispatchNotification 里判 !== 1 就丢)。
 * 每个变化都有归属的开关: 上线/下线/世界/状态, 没有"不受开关控制"的变化。
 *
 * needsConfirm = 上网/下网这类"存在性"变化: 先落 pending, 到期用 me() 复核后才发通知。
 * 上/下线、网页上线都走这条路(开关关着时不会排队, 见 applyChange 分支 3)。
 */
function classifyTransition(prev, next, opts = {}) {
  const a = prev.state;
  const b = next.state;
  if (a === 'offline' && b === 'online') return { changeType: '上线', notifyField: 'notify_online', needsConfirm: true };
  if (a === 'online' && b === 'offline') return { changeType: '下线', notifyField: 'notify_offline', needsConfirm: true };
  if (a === 'offline' && b === 'active') return { changeType: 'web端上线', notifyField: 'notify_web_online', needsConfirm: true }; // 只挂网页: 独立开关(与"进游戏"分开)
  if (a === 'active' && b === 'offline') return null; // 网页下线, 不通知
  if (a === 'active' && b === 'online') return { changeType: '上线', notifyField: 'notify_online', needsConfirm: true }; // 网页在线进入游戏 = 上线
  if (a === 'online' && b === 'active') return { changeType: '下线', notifyField: 'notify_offline', needsConfirm: true }; // 退出游戏但网页在线 = 下线
  // 网页在线(active)与游戏在线(online)同属"在线", 期间的世界/社交态/自定义状态变化一样要判:
  // 只挂着网页的人改了签名、社交状态或(数据里带世界时)换了世界, 同样按对应开关通知。
  if ((a === 'online' && b === 'online') || (a === 'active' && b === 'active')) {
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
 * opts.notifyEnabled(notifyField): 逐好友开关判定; 关着的变化不排队验证(也不通知)。
 * 返回 { notify, change|null, dbUpdate }。
 */
function applyChange(prevDb, incoming, opts = {}) {
  const now = opts.now || Date.now;
  const confirmDelayMs = opts.confirmDelayMs == null ? 30000 : opts.confirmDelayMs;
  const notifyEnabled = typeof opts.notifyEnabled === 'function' ? opts.notifyEnabled : () => true;

  const prev = {
    state: prevDb.state || 'offline',
    status: prevDb.status || 'active',
    worldId: prevDb.worldId ?? prevDb.world_id ?? null,
    worldName: prevDb.worldName ?? null, // 世界名不再入库, 由 monitor 从世界名缓存同步取好传进来
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
    // 世界名不入库(由 world_cache 按需提供); next.worldName 仅供通知文案使用
    status_description: next.statusDescription,
    platform: next.platform,
    pending_state: null,
    pending_at: null
  };
  // 待确认期间只钉住 state 一列: 它代表"已确认的起始态", 确认时才提交目标态;
  // 其余字段(社交状态/世界/平台)照常按事件提交, 所以面板能立刻看到"可能在线 · 世界X"。
  // 读层用 pending_state 呈现目标态(见 src/presence.js), 展示上仍是即时的。
  const holdState = () => { dbUpdate.state = prev.state; };

  const transition = classifyTransition(prev, next, opts);

  // 1) 待确认期间回到起始态 → 抖动回退: 取消 pending, 采纳本次事件, 不通知
  if (prevDb.pending_state && next.state === prev.state) {
    return { notify: false, change: null, dbUpdate }; // dbUpdate 已清空 pending
  }
  // 1.5) 待确认期间变成第三种状态(out <-> active 等) → 改指目标并重新计时, state 仍保持起始态
  if (prevDb.pending_state && next.state !== prevDb.pending_state) {
    holdState();
    dbUpdate.pending_state = next.state;
    dbUpdate.pending_at = now();
    return { notify: false, change: null, dbUpdate };
  }

  // 2) 待确认期间又到达目标状态 → 按确认窗口判定是否真正确认
  if (prevDb.pending_state && next.state === prevDb.pending_state) {
    const pendingAt = prevDb.pending_at || 0;
    if (now() - pendingAt >= confirmDelayMs) {
      // transition 就是 classify(起始态, 确认态): 上线/网页上线/下线各自带自己的开关;
      // 起始态与确认态之间没有可通知的差异(如 active -> offline 的网页下线)时就不通知。
      return { notify: !!transition, change: transition ? buildChange(transition, prev, next) : null, dbUpdate };
    }
    holdState();
    dbUpdate.pending_state = prevDb.pending_state;
    dbUpdate.pending_at = pendingAt;
    return { notify: false, change: null, dbUpdate };
  }

  // 3) 需要确认的新转移 → 启动 pending。只有"真会发通知"的才排队验证:
  //    开关关着就直接提交状态, 不排 pending, 也就不花那次 me()。
  if (transition && transition.needsConfirm) {
    if (!notifyEnabled(transition.notifyField)) {
      return { notify: false, change: null, dbUpdate };
    }
    holdState();
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

module.exports = { classifyTransition, applyChange };
