const test = require('node:test');
const assert = require('node:assert');
const {
  deriveStateFromLocation, deriveStateFromSnapshot,
  classifyTransition, applyChange
} = require('../src/state');

const F = (over) => ({ state: 'offline', status: 'active', worldId: null, worldName: null, statusDescription: null, platform: 'unknown', ...over });

test('deriveStateFromLocation maps sentinels and instances', () => {
  assert.equal(deriveStateFromLocation('offline'), 'offline');
  assert.equal(deriveStateFromLocation(''), 'offline');
  assert.equal(deriveStateFromLocation('private'), 'online');
  assert.equal(deriveStateFromLocation('traveling'), 'online');
  assert.equal(deriveStateFromLocation('wrld_a:1~region(us)'), 'online');
  assert.equal(deriveStateFromLocation(undefined), 'offline');
});

test('deriveStateFromSnapshot prefers currentUser arrays then location', () => {
  const cu = { onlineFriends: ['u1'], activeFriends: ['u2'], offlineFriends: ['u3'] };
  assert.equal(deriveStateFromSnapshot({ id: 'u1', location: 'offline' }, cu), 'online');
  assert.equal(deriveStateFromSnapshot({ id: 'u2', location: 'offline' }, cu), 'active');
  assert.equal(deriveStateFromSnapshot({ id: 'u3', location: 'offline' }, cu), 'offline');
  assert.equal(deriveStateFromSnapshot({ id: 'u9', location: 'wrld_a:1' }, cu), 'online');
  assert.equal(deriveStateFromSnapshot({ id: 'u9', location: 'offline' }, cu), 'offline');
});

test('classifyTransition: online/offline upgrades and downgrades', () => {
  // 上下线(含网页上线)都是"存在性"变化: 先 pending, 到期 me() 复核后才通知
  assert.deepEqual(classifyTransition(F({ state: 'offline' }), F({ state: 'online', status: 'active' }), {}), { changeType: '上线', notifyField: 'notify_online', needsConfirm: true });
  assert.deepEqual(classifyTransition(F({ state: 'online' }), F({ state: 'offline' }), {}), { changeType: '下线', notifyField: 'notify_offline', needsConfirm: true });
  assert.deepEqual(classifyTransition(F({ state: 'offline' }), F({ state: 'active' }), {}), { changeType: 'web端上线', notifyField: 'notify_web_online', needsConfirm: true }); // 网页端上线: 独立开关, 与"进游戏"分开
  assert.equal(classifyTransition(F({ state: 'active' }), F({ state: 'offline' }), {}), null); // web 下线不通知
  assert.deepEqual(classifyTransition(F({ state: 'active' }), F({ state: 'online', status: 'active' }), {}), { changeType: '上线', notifyField: 'notify_online', needsConfirm: true }); // 网页在线进入游戏 = 上线
  assert.deepEqual(classifyTransition(F({ state: 'online' }), F({ state: 'active' }), {}), { changeType: '下线', notifyField: 'notify_offline', needsConfirm: true }); // 退出游戏但网页在线 = 下线
});

test('classifyTransition: status change among game statuses', () => {
  const r = classifyTransition(F({ state: 'online', status: 'active' }), F({ state: 'online', status: 'busy' }), {});
  assert.deepEqual(r, { changeType: '状态变化', notifyField: 'notify_status_change', needsConfirm: false });
});

test('classifyTransition: 网页在线(active)期间的变化与游戏在线同样比较(世界/社交态/自定义状态)', () => {
  // 只挂着网页的人换世界(理论上世界为空, 但数据里带世界时同样要按世界变化处理)
  assert.deepEqual(classifyTransition(
    F({ state: 'active', worldId: 'wrld_a' }), F({ state: 'active', worldId: 'wrld_b' }), {}),
    { changeType: '切换世界', notifyField: 'notify_world_change', needsConfirm: false });
  // 社交状态互切
  assert.deepEqual(classifyTransition(
    F({ state: 'active', status: 'join me' }), F({ state: 'active', status: 'busy' }), {}),
    { changeType: '状态变化', notifyField: 'notify_status_change', needsConfirm: false });
  // 自定义状态变化
  assert.deepEqual(classifyTransition(
    F({ state: 'active', status: 'active', statusDescription: '摸鱼' }), F({ state: 'active', status: 'active', statusDescription: '写码' }), {}),
    { changeType: '自定义状态', notifyField: 'notify_status_change', needsConfirm: false });
  // 什么都没变 → 不通知
  assert.equal(classifyTransition(
    F({ state: 'active', worldId: 'wrld_a' }), F({ state: 'active', worldId: 'wrld_a' }), {}), null);
});

test('classifyTransition: any world/location change notifies (incl private, unknown origin, any status)', () => {
  const W = { changeType: '切换世界', notifyField: 'notify_world_change', needsConfirm: false };
  // known world -> new world
  assert.deepEqual(classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }),
    F({ state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B' }), {}), W);
  // unknown old world (first sight) -> notifies too
  assert.deepEqual(classifyTransition(
    F({ state: 'online', status: 'active', worldId: null }),
    F({ state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B' }), {}), W);
  // busy status world change -> notifies too
  assert.deepEqual(classifyTransition(
    F({ state: 'online', status: 'busy', worldId: 'wrld_a' }),
    F({ state: 'online', status: 'busy', worldId: 'wrld_b' }), {}), W);
  // world -> private -> notifies too
  assert.deepEqual(classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }),
    F({ state: 'online', status: 'active', worldId: 'private', worldName: null }), {}), W);
  // private -> public world -> notifies
  assert.deepEqual(classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'private' }),
    F({ state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B' }), {}), W);
  // world unchanged -> silent
  assert.equal(classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }),
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }), {}), null);
});

test('classifyTransition: custom status change when nothing else changed', () => {
  const r = classifyTransition(
    F({ state: 'online', status: 'active', statusDescription: 'a' }),
    F({ state: 'online', status: 'active', statusDescription: 'b' }),
    {}
  );
  assert.equal(r.changeType, '自定义状态');
  assert.equal(r.notifyField, 'notify_status_change', '自定义状态归入状态开关');
});

test('classifyTransition: world change always parsed (status_only_mode removed)', () => {
  // 旧参数 statusOnlyMode 已废弃: 传与也不受制
  const r = classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }),
    F({ state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B' }),
    { statusOnlyMode: true });
  assert.deepEqual(r, { changeType: '切换世界', notifyField: 'notify_world_change', needsConfirm: false });
});

test('applyChange: 上线先排 pending(钉住起始态), 到期用 me() 复核后才通知', () => {
  let t = 0;
  const first = applyChange(F({ state: 'offline' }), F({ state: 'online', status: 'active', worldId: 'wrld_b' }), { now: () => t, confirmDelayMs: 30000 });
  assert.equal(first.notify, false, '不立即通知');
  assert.equal(first.dbUpdate.pending_state, 'online');
  assert.equal(first.dbUpdate.state, 'offline', 'state 保持起始态(等确认)');
  assert.equal(first.dbUpdate.world_id, 'wrld_b', '其余字段照常提交, 面板能显示"可能在线 · 世界B"');
  // 窗口内再次到达目标态: 继续等, state 仍保持起始态
  t = 10000;
  const early = applyChange({ ...F({ state: 'offline' }), pending_state: 'online', pending_at: 0 }, F({ state: 'online', status: 'active' }), { now: () => t, confirmDelayMs: 30000 });
  assert.equal(early.notify, false);
  assert.equal(early.dbUpdate.state, 'offline');
  assert.equal(early.dbUpdate.pending_state, 'online');
  // 窗口满 → 确认上线(起始态 offline → 确认态 online 由 classify 得出)
  t = 100000;
  const done = applyChange({ ...F({ state: 'offline' }), pending_state: 'online', pending_at: 60000 }, F({ state: 'online', status: 'active' }), { now: () => t, confirmDelayMs: 30000 });
  assert.equal(done.notify, true);
  assert.equal(done.change.changeType, '上线');
  assert.equal(done.change.notifyField, 'notify_online');
  assert.equal(done.dbUpdate.state, 'online', '确认后提交目标态');
  assert.equal(done.dbUpdate.pending_state, null);
});

test('applyChange: 网页上线同样走 pending, 确认按"起始态→确认态"判出 web端上线', () => {
  // 起始态 offline, 目标 active: 同是"确认到 active", 与 online->active(下线) 结果不同
  const first = applyChange(F({ state: 'offline' }), F({ state: 'active' }), { now: () => 0, confirmDelayMs: 30000 });
  assert.equal(first.dbUpdate.pending_state, 'active');
  assert.equal(first.dbUpdate.state, 'offline');
  const done = applyChange({ ...F({ state: 'offline' }), pending_state: 'active', pending_at: 0 }, F({ state: 'active' }), { now: () => 40000, confirmDelayMs: 30000 });
  assert.equal(done.notify, true);
  assert.equal(done.change.changeType, 'web端上线');
  assert.equal(done.change.notifyField, 'notify_web_online');
  // 起始态 online, 目标 active: 退出游戏 = 下线
  const down = applyChange({ ...F({ state: 'online' }), pending_state: 'active', pending_at: 0 }, F({ state: 'active' }), { now: () => 40000, confirmDelayMs: 30000 });
  assert.equal(down.change.changeType, '下线');
  assert.equal(down.change.notifyField, 'notify_offline');
  assert.equal(down.change.oldState, 'online');
  assert.equal(down.change.newState, 'active');
});

test('applyChange: 开关关着的上下线不排队也不通知(状态照常提交)', () => {
  const up = applyChange(F({ state: 'offline' }), F({ state: 'online' }), { now: () => 0, confirmDelayMs: 30000, notifyEnabled: (f) => f !== 'notify_online' });
  assert.equal(up.notify, false);
  assert.equal(up.dbUpdate.pending_state, null, '不排队 → 不花那次 me()');
  assert.equal(up.dbUpdate.state, 'online', '状态直接提交');
  // 开关开着时才会排队
  const queued = applyChange(F({ state: 'offline' }), F({ state: 'online' }), { now: () => 0, confirmDelayMs: 30000, notifyEnabled: (f) => f === 'notify_online' });
  assert.equal(queued.dbUpdate.pending_state, 'online');
  assert.equal(queued.dbUpdate.state, 'offline');
});

test('applyChange: 待确认期间回到起始态 → 取消 pending 并采纳本次事件(两个方向对称)', () => {
  // 上线 pending(起始 offline) → 又离线
  const up = applyChange({ ...F({ state: 'offline' }), pending_state: 'online', pending_at: 0 }, F({ state: 'offline' }), { now: () => 5000, confirmDelayMs: 30000 });
  assert.equal(up.notify, false);
  assert.equal(up.dbUpdate.pending_state, null);
  assert.equal(up.dbUpdate.state, 'offline');
  // 下线 pending(起始 online) → 又上线
  const down = applyChange({ ...F({ state: 'online' }), pending_state: 'offline', pending_at: 0 }, F({ state: 'online' }), { now: () => 5000, confirmDelayMs: 30000 });
  assert.equal(down.notify, false);
  assert.equal(down.dbUpdate.pending_state, null);
  assert.equal(down.dbUpdate.state, 'online');
  // 网页上线 pending(起始 offline) → 又离线
  const web = applyChange({ ...F({ state: 'offline' }), pending_state: 'active', pending_at: 0 }, F({ state: 'offline' }), { now: () => 5000, confirmDelayMs: 30000 });
  assert.equal(web.dbUpdate.pending_state, null);
  assert.equal(web.dbUpdate.state, 'offline');
});

test('applyChange: downgrade starts pending, second call after delay confirms', () => {
  let t = 0;
  const first = applyChange(F({ state: 'online', status: 'active' }), F({ state: 'offline' }), { now: () => t, confirmDelayMs: 30000 });
  assert.equal(first.notify, false);
  assert.equal(first.dbUpdate.pending_state, 'offline');
  assert.equal(first.dbUpdate.state, 'online', 'state 保持起始态');
  // 30s 内状态恢复 → 取消
  t = 10000;
  const revert = applyChange({ ...F({ state: 'online' }), pending_state: 'offline', pending_at: 0 }, F({ state: 'online', status: 'active' }), { now: () => t, confirmDelayMs: 30000 });
  assert.equal(revert.notify, false);
  assert.equal(revert.dbUpdate.pending_state, null);
  // 再次下线并超过确认窗口 → 确认通知
  t = 100000;
  const second = applyChange({ ...F({ state: 'online', status: 'active' }), pending_state: 'offline', pending_at: 60000 }, F({ state: 'offline' }), { now: () => t, confirmDelayMs: 30000 });
  assert.equal(second.notify, true);
  assert.equal(second.change.changeType, '下线');
});

test('applyChange: pending retargets to new non-online state and restarts timer', () => {
  // online->active 挂 pending 后, active->offline: 不取消, 更新 pending 目标并重新计时
  const r = applyChange({ ...F({ state: 'active' }), pending_state: 'active', pending_at: 0 }, F({ state: 'offline' }), { now: () => 5000, confirmDelayMs: 30000 });
  assert.equal(r.notify, false);
  assert.equal(r.dbUpdate.pending_state, 'offline');
  assert.equal(r.dbUpdate.pending_at, 5000);
  assert.equal(r.dbUpdate.state, 'active', '改指期间 state 仍保持起始态(这里是 active)');
});

test('applyChange: 改指后确认没有可通知的差异(active -> offline) → 不通知只提交', () => {
  // 起始态 active 的 pending(网页上线) 被改指到 offline: classify(active, offline) = null
  const r = applyChange({ ...F({ state: 'active' }), pending_state: 'offline', pending_at: 0 }, F({ state: 'offline' }), { now: () => 40000, confirmDelayMs: 30000 });
  assert.equal(r.notify, false, '网页下线本来就不通知');
  assert.equal(r.change, null);
  assert.equal(r.dbUpdate.state, 'offline', '状态照常提交');
  assert.equal(r.dbUpdate.pending_state, null);
});

test('applyChange 直接吃数据库行(蛇形字段) + monitor 预取好的 worldName', () => {
  const prevRow = { state: 'online', status: 'active', world_id: 'wrld_a', worldName: 'A', status_description: null, platform: 'standalonewindows', pending_state: null, pending_at: null };
  const r = applyChange(prevRow, { state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B', statusDescription: null, platform: null }, { now: () => 1000, confirmDelayMs: 30000 });
  assert.equal(r.notify, true);
  assert.equal(r.change.changeType, '切换世界');
  assert.equal(r.change.oldWorld, 'A');
  assert.equal(r.change.newWorld, 'B');
});

test('applyChange reads status_description from snake_case row', () => {
  const prevRow = { state: 'online', status: 'active', world_id: 'wrld_a', worldName: 'A', status_description: '旧', platform: 'standalonewindows', pending_state: null, pending_at: null };
  const r = applyChange(prevRow, { state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A', statusDescription: '新', platform: null }, { now: () => 1000, confirmDelayMs: 30000 });
  assert.equal(r.notify, true);
  assert.equal(r.change.changeType, '自定义状态');
  assert.equal(r.change.oldStatusDescription, '旧');
  assert.equal(r.change.newStatusDescription, '新');
});
