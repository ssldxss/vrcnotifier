const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { createDb } = require('../src/db');
const { createMonitor } = require('../src/monitor');

function setup(opts = {}) {
  const db = createDb(':memory:');
  const bus = new EventEmitter();
  const events = [];
  bus.on('notification', (e) => events.push({ kind: 'notification', ...e }));
  bus.on('session-expired', (e) => events.push({ kind: 'session-expired', ...e }));
  bus.on('snapshot', (e) => events.push({ kind: 'snapshot', ...e }));
  const notifications = [];
  const notifier = {
    sendAll: async (user, change) => { notifications.push({ user, change }); return { email: { ok: true }, gotify: { ok: true }, ntfy: { ok: true }, webhook: { ok: true } }; }
  };
  const vrcapi = {
    me: async () => opts.currentUser || { id: 'usr_me', onlineFriends: [], activeFriends: [], offlineFriends: [] },
    friends: async ({ offline }) => (offline ? (opts.offlineFriends || []) : (opts.onlineFriends || [])),
    world: async (id) => ({ id, name: `世界_${id}` })
  };
  const pipeline = {
    connects: [], disconnects: [], reconnects: 0,
    connect: (uid, name) => pipeline.connects.push({ uid, name }),
    disconnect: (uid) => pipeline.disconnects.push(uid),
    forceReconnect: (uid) => { pipeline.reconnects++; },
    isConnected: () => opts.connected ?? true,
    lastMessageAt: () => (typeof opts.lastMessageAt === 'function' ? opts.lastMessageAt() : (opts.lastMessageAt ?? Date.now())),
    status: () => ({ connected: true, notified: false })
  };
  const monitor = createMonitor({
    db, notifier, pipeline, bus,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    now: opts.now || (() => 1000000),
    config: { confirmDelayMs: 30000, dedupeWindowMs: 30000, snapshotIntervalMs: 600000, watchdogMs: 600000 }
  });
  return { db, bus, events, notifications, notifier, vrcapi, pipeline, monitor };
}

function addUser(db, { vrcId = 'usr_me', displayName = '我', statusOnly = 0 } = {}) {
  const id = db.upsertUser(vrcId, { username: 'me', displayName, avatarUrl: null });
  db.updateUserSettings(id, { status_only_mode: statusOnly });
  return db.getUserByVrcId(vrcId);
}

function addConfig(db, userId, friendId, over = {}) {
  db.upsertConfig(userId, friendId, { monitorEnabled: true, notifyOnline: true, notifyOffline: true, notifyStatusChange: true, notifyWorldChange: true, ...over });
}

const onlineFriend = (id, over = {}) => ({ id, displayName: `朋友${id}`, location: 'wrld_a:1~region(us)', status: 'active', statusDescription: null, platform: 'standalonewindows', currentAvatarImageUrl: 'https://x/a.png', ...over });
const offlineFriend = (id) => ({ id, displayName: `朋友${id}`, location: 'offline', status: 'active', statusDescription: null, platform: 'web' });

test('activateUser: snapshot builds baseline, notifies online friend once, dedupe on re-run', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')], offlineFriends: [offlineFriend('usr_f2')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  addConfig(t.db, user.id, 'usr_f2');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(t.pipeline.connects.length, 1);
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '上线');
  assert.equal(t.notifications[0].change.friendName, '朋友usr_f1');
  assert.equal(t.notifications[0].change.newWorld, '世界_wrld_a');
  const f1 = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f1.state, 'online');
  const f2 = t.db.getFriend(user.id, 'usr_f2');
  assert.equal(f2.state, 'offline');
  // 再次快照: 无新变化, 不重复通知
  await t.monitor.runSnapshot(user.vrchat_user_id);
  assert.equal(t.notifications.length, 1);
});

test('WS friend-online event notifies and updates DB', async () => {
  const t = setup();
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-online', content: { userId: 'usr_f1', platform: 'standalonewindows', location: 'wrld_b:2~region(jp)', user: { id: 'usr_f1', displayName: '朋友usr_f1', status: 'join me', statusDescription: 'hi' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '上线');
  assert.equal(t.notifications[0].change.newStatus, 'join me');
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.state, 'online');
  assert.equal(f.status, 'join me');
  assert.equal(f.world_id, 'wrld_b');
});

test('WS friend-offline: pending confirm after delay; cancel on revert', async () => {
  let t = 0;
  const tset = setup({ now: () => t });
  const user = addUser(tset.db);
  addConfig(tset.db, user.id, 'usr_f1');
  await tset.monitor.activateUser(user, tset.vrcapi);
  // 先上线(建基线)
  await tset.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-online', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  tset.notifications.length = 0;
  // 下线事件 → 进入 pending, 不通知
  t = 5000;
  await tset.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-offline', content: { userId: 'usr_f1', platform: '' } });
  assert.equal(tset.notifications.length, 0);
  let f = tset.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.pending_state, 'offline');
  // 30s 内恢复上线 → 取消
  t = 10000;
  await tset.monitor.handlePipelineEvent(user.vrchat_user_id, '3', { type: 'friend-online', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(tset.notifications.length, 0);
  f = tset.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.pending_state, null);
  // 再次下线并超过确认窗口 → 通知
  t = 60000;
  await tset.monitor.handlePipelineEvent(user.vrchat_user_id, '4', { type: 'friend-offline', content: { userId: 'usr_f1', platform: '' } });
  assert.equal(tset.notifications.length, 0); // 重新开始 pending
  t = 100000;
  await tset.monitor.handlePipelineEvent(user.vrchat_user_id, '5', { type: 'friend-offline', content: { userId: 'usr_f1', platform: '' } });
  assert.equal(tset.notifications.length, 1);
  assert.equal(tset.notifications[0].change.changeType, '下线');
});

test('standard mode monitors all enabled friends without limit', async () => {
  const online = Array.from({ length: 6 }, (_, i) => onlineFriend(`usr_f${i}`));
  const t = setup({ onlineFriends: online });
  const user = addUser(t.db);
  for (let i = 0; i < 6; i++) addConfig(t.db, user.id, `usr_f${i}`);
  await t.monitor.activateUser(user, t.vrcapi);
  const notified = t.notifications.filter((n) => n.change.changeType === '上线');
  assert.equal(notified.length, 6);
});

test('runSnapshot returns ok:false when API call fails, ok:true on success', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  const ok = await t.monitor.runSnapshot(user.vrchat_user_id);
  assert.equal(ok.ok, true);
  assert.equal(ok.count, 1);
  t.vrcapi.me = async () => { throw Object.assign(new Error('network down'), { status: -1 }); };
  const failed = await t.monitor.runSnapshot(user.vrchat_user_id);
  assert.equal(failed.ok, false);
  assert.ok(failed.error.includes('network down'));
});

test('status_only_mode disables world change notification', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db, { statusOnly: 1 });
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_c:3', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 0);
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.world_id, 'wrld_c'); // 状态仍更新
});

test('traveling preserves world so A->traveling->B still notifies world change', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'wrld_a');
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-location', content: { userId: 'usr_f1', location: 'traveling', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 0);
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'wrld_a', 'traveling 时保留旧世界');
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_b:2~region(jp)', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '切换世界');
  assert.equal(t.notifications[0].change.oldWorld, '世界_wrld_a');
  assert.equal(t.notifications[0].change.newWorld, '世界_wrld_b');
});

test('private -> traveling -> public world notifies world change with private as old', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-location', content: { userId: 'usr_f1', location: 'private', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 0);
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'private');
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-location', content: { userId: 'usr_f1', location: 'traveling', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 0);
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'private', 'traveling 时保留 private');
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '3', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_5c240791:97628~hidden(usr_f1)~region(jp)', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '切换世界');
  assert.equal(t.notifications[0].change.oldWorld, '私密世界');
});

test('snapshot with private location: online state, no world API call', async () => {
  let worldCalls = 0;
  const t = setup({ onlineFriends: [onlineFriend('usr_f1', { location: 'private' })] });
  t.vrcapi.world = async (id) => { worldCalls++; return { id, name: 'X' }; };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(worldCalls, 0);
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.state, 'online');
});

test('friend-update status change active->busy notifies 状态变化', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1', { status: 'active' })] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'busy', statusDescription: null } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '状态变化');
});

test('session 401 during snapshot emits session-expired and deactivates', async () => {
  const t = setup();
  t.vrcapi.me = async () => { const e = new Error('"Missing Credentials"'); e.status = 401; throw e; };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(t.events.some((e) => e.kind === 'session-expired'), true);
  assert.equal(t.pipeline.disconnects.length, 1);
});

test('watchdog forces reconnect + snapshot when no messages', async () => {
  const t = setup({ lastMessageAt: () => 0, now: () => 2000000 });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  await t.monitor.runWatchdog();
  assert.equal(t.pipeline.reconnects, 1);
  assert.ok(t.events.some((e) => e.kind === 'snapshot'));
});
