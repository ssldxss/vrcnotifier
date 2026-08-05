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

test('snapshot stores avatar image and thumb urls separately', async () => {
  const t = setup({
    onlineFriends: [onlineFriend('usr_f1', {
      currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/file/file_a/1/file',
      currentAvatarThumbnailImageUrl: 'https://api.vrchat.cloud/api/1/image/file_a/1/256'
    })]
  });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.avatar_url, 'https://api.vrchat.cloud/api/1/file/file_a/1/file');
  assert.equal(f.avatar_thumb_url, 'https://api.vrchat.cloud/api/1/image/file_a/1/256');
});

test('snapshot converts full image url to /image/ thumb when thumb missing', async () => {
  const t = setup({
    onlineFriends: [onlineFriend('usr_f1', {
      currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/file/file_b/3/file',
      currentAvatarThumbnailImageUrl: undefined
    })]
  });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.avatar_url, 'https://api.vrchat.cloud/api/1/file/file_b/3/file');
  assert.equal(f.avatar_thumb_url, 'https://api.vrchat.cloud/api/1/image/file_b/3/256');
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

test('watchdog only forces reconnect (snapshot runs after reconnect succeeds)', async () => {
  const t = setup({ lastMessageAt: () => 0, now: () => 2000000, onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  const snapshotsBefore = t.events.filter((e) => e.kind === 'snapshot').length;
  t.notifications.length = 0;
  await t.monitor.runWatchdog();
  assert.equal(t.pipeline.reconnects, 1);
  assert.equal(t.events.filter((e) => e.kind === 'snapshot').length, snapshotsBefore, 'watchdog 本身不跑快照');
  assert.equal(t.notifications.length, 0);
});

test('ws reconnect: snapshot first, WS messages ignored until snapshot done', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi); // 基线快照
  t.notifications.length = 0;
  t.events.length = 0;
  // 挂起下一次快照, 模拟对账进行中
  let release;
  const gate = new Promise((r) => { release = r; });
  const origFriends = t.vrcapi.friends;
  t.vrcapi.friends = async (opts) => { await gate; return origFriends(opts); };
  const p = t.monitor.handleWsReconnect(user.vrchat_user_id);
  // 对账完成前: WS 消息被忽略
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-online', content: { userId: 'usr_f1', location: 'wrld_z:9', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 0, '对账完成前消息不应触发通知');
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'wrld_a', '对账完成前消息不应写库');
  // 释放对账
  release();
  await p;
  assert.ok(t.events.some((e) => e.kind === 'snapshot'), '重连成功应先跑快照');
  // 对账完成后: WS 消息正常处理
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_b:2', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'wrld_b');
});

test('concurrent snapshot triggers are ignored; auto reconcile slides after any trigger', async () => {
  let cur = 1000000;
  const t = setup({ now: () => cur, onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  try {
    t.monitor.startTimers();
    assert.equal(t.monitor._debug.nextAutoReconcileAt(), cur + 600000);
    await t.monitor.activateUser(user, t.vrcapi);
    assert.equal(t.monitor._debug.nextAutoReconcileAt(), cur + 600000);
    // 手动对账 → 自动对账顺延
    await t.monitor.runSnapshot(user.vrchat_user_id);
    assert.equal(t.monitor._debug.nextAutoReconcileAt(), cur + 600000);
    cur += 100000;
    await t.monitor.runSnapshot(user.vrchat_user_id);
    assert.equal(t.monitor._debug.nextAutoReconcileAt(), cur + 600000);
    // 快照进行中: 并发触发被忽略
    let release;
    const gate = new Promise((r) => { release = r; });
    const origFriends = t.vrcapi.friends;
    let friendCalls = 0;
    t.vrcapi.friends = async (opts) => { friendCalls++; await gate; return origFriends(opts); };
    const p1 = t.monitor.runSnapshot(user.vrchat_user_id);
    const p2 = t.monitor.runSnapshot(user.vrchat_user_id);
    const r2 = await p2;
    assert.equal(r2.ok, false);
    assert.ok(r2.error.includes('快照进行中'));
    release();
    await p1;
    assert.equal(friendCalls, 2, '并发触发不应重复调 API(一次快照 = 在线+离线 两次 friends 调用)');
  } finally {
    t.monitor.stopTimers();
  }
});

test('world name cached in db: repeat lookup skips api', async () => {
  let worldCalls = 0;
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  t.vrcapi.world = async (id) => { worldCalls++; return { id, name: '世界_' + id }; };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(worldCalls, 1);
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1~region(us)', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 1, '缓存命中不应再调 API');
  const c = t.db.getWorldCache('wrld_a');
  assert.ok(c && c.world_name === '世界_wrld_a');
});

test('failed world lookup caches unknown for 1 day, success cached 1 year', async () => {
  let cur = 1000000;
  let fail = true;
  let worldCalls = 0;
  const t = setup({ now: () => cur, onlineFriends: [onlineFriend('usr_f1')] });
  t.vrcapi.world = async (id) => { worldCalls++; if (fail) throw new Error('boom'); return { id, name: '世界_' + id }; };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(worldCalls, 1);
  assert.equal(t.db.getWorldCache('wrld_a').world_name, '未知世界');
  // 1 天内不重查
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 1);
  // 超过1天: 重新查询(成功)
  fail = false;
  cur += 24 * 3600 * 1000 + 1;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 2);
  assert.equal(t.db.getWorldCache('wrld_a').world_name, '世界_wrld_a');
  // 1 年内不重查
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '3', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 2);
  // 超过1年: 重新查询
  cur += 365 * 24 * 3600 * 1000 + 1;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '4', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 3);
});
