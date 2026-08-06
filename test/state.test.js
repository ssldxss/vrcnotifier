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
  assert.deepEqual(classifyTransition(F({ state: 'offline' }), F({ state: 'online', status: 'active' }), {}), { changeType: '上线', notifyField: 'notify_online', needsConfirm: false });
  assert.deepEqual(classifyTransition(F({ state: 'online' }), F({ state: 'offline' }), {}), { changeType: '下线', notifyField: 'notify_offline', needsConfirm: true });
  assert.equal(classifyTransition(F({ state: 'offline' }), F({ state: 'active' }), {}), null); // web 上线不通知
  assert.equal(classifyTransition(F({ state: 'active' }), F({ state: 'offline' }), {}), null); // web 下线不通知
  assert.deepEqual(classifyTransition(F({ state: 'active' }), F({ state: 'online', status: 'active' }), {}), { changeType: 'web端上线', notifyField: 'notify_online', needsConfirm: false });
  assert.deepEqual(classifyTransition(F({ state: 'online' }), F({ state: 'active' }), {}), { changeType: '下线至web端', notifyField: 'notify_offline', needsConfirm: true });
});

test('classifyTransition: status change among game statuses', () => {
  const r = classifyTransition(F({ state: 'online', status: 'active' }), F({ state: 'online', status: 'busy' }), {});
  assert.deepEqual(r, { changeType: '状态变化', notifyField: 'notify_status_change', needsConfirm: false });
});

test('classifyTransition: world change only for visible statuses and known old world', () => {
  const r = classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }),
    F({ state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B' }),
    {}
  );
  assert.deepEqual(r, { changeType: '切换世界', notifyField: 'notify_world_change', needsConfirm: false });
  // 旧世界未知(首次获取) → 静默
  assert.equal(classifyTransition(
    F({ state: 'online', status: 'active', worldId: null }),
    F({ state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B' }), {}), null);
  // busy 状态看不到世界 → 不通知世界变化
  assert.equal(classifyTransition(
    F({ state: 'online', status: 'busy', worldId: 'wrld_a' }),
    F({ state: 'online', status: 'busy', worldId: 'wrld_b' }), {}), null);
  // 新世界为 private → 不通知(看不到)
  assert.equal(classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }),
    F({ state: 'online', status: 'active', worldId: 'private', worldName: null }), {}), null);
});

test('classifyTransition: custom status change when nothing else changed', () => {
  const r = classifyTransition(
    F({ state: 'online', status: 'active', statusDescription: 'a' }),
    F({ state: 'online', status: 'active', statusDescription: 'b' }),
    {}
  );
  assert.equal(r.changeType, '自定义状态');
});

test('classifyTransition: world change always parsed (status_only_mode removed)', () => {
  // 旧参数 statusOnlyMode 已废弃: 传与也不受制
  const r = classifyTransition(
    F({ state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A' }),
    F({ state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B' }),
    { statusOnlyMode: true });
  assert.deepEqual(r, { changeType: '切换世界', notifyField: 'notify_world_change', needsConfirm: false });
});

test('applyChange: immediate upgrade notifies and clears pending', () => {
  const result = applyChange(F({ state: 'offline' }), F({ state: 'online', status: 'active' }), { now: () => 1000, confirmDelayMs: 30000 });
  assert.equal(result.notify, true);
  assert.equal(result.change.changeType, '上线');
  assert.equal(result.dbUpdate.pending_state, null);
});

test('applyChange: downgrade starts pending, second call after delay confirms', () => {
  let t = 0;
  const first = applyChange(F({ state: 'online', status: 'active' }), F({ state: 'offline' }), { now: () => t, confirmDelayMs: 30000 });
  assert.equal(first.notify, false);
  assert.equal(first.dbUpdate.pending_state, 'offline');
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

test('applyChange: snapshot upgrade within dedupe still notifies (dedupe handled upstream)', () => {
  const result = applyChange(F({ state: 'offline' }), F({ state: 'online', status: 'active' }), { now: () => 0, confirmDelayMs: 30000, fromSnapshot: true });
  assert.equal(result.notify, true);
});

test('applyChange reads snake_case db row fields (world change detected)', () => {
  const prevRow = { state: 'online', status: 'active', world_id: 'wrld_a', world_name: 'A', status_description: null, platform: 'standalonewindows', pending_state: null, pending_at: null };
  const r = applyChange(prevRow, { state: 'online', status: 'active', worldId: 'wrld_b', worldName: 'B', statusDescription: null, platform: null }, { now: () => 1000, confirmDelayMs: 30000 });
  assert.equal(r.notify, true);
  assert.equal(r.change.changeType, '切换世界');
  assert.equal(r.change.oldWorld, 'A');
  assert.equal(r.change.newWorld, 'B');
});

test('applyChange reads status_description from snake_case row', () => {
  const prevRow = { state: 'online', status: 'active', world_id: 'wrld_a', world_name: 'A', status_description: '旧', platform: 'standalonewindows', pending_state: null, pending_at: null };
  const r = applyChange(prevRow, { state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A', statusDescription: '新', platform: null }, { now: () => 1000, confirmDelayMs: 30000 });
  assert.equal(r.notify, true);
  assert.equal(r.change.changeType, '自定义状态');
  assert.equal(r.change.oldStatusDescription, '旧');
  assert.equal(r.change.newStatusDescription, '新');
});
