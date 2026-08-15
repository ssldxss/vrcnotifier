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
  bus.on('relogin-needed', (e) => events.push({ kind: 'relogin-needed', ...e }));
  bus.on('unauthorized-2fa', (e) => events.push({ kind: 'unauthorized-2fa', ...e }));
  bus.on('snapshot', (e) => events.push({ kind: 'snapshot', ...e }));
  bus.on('self-state', (e) => events.push({ kind: 'self-state', ...e }));
  const notifications = [];
  const qqTexts = [];
  const notifier = {
    sendAll: async (user, change) => { notifications.push({ user, change }); return { qq: { ok: true } }; },
    sendQqText: async (dbId, text) => { qqTexts.push({ dbId, text }); return { ok: true }; }
  };
  const vrcapi = {
    me: async () => opts.currentUser || { id: 'usr_me', onlineFriends: [], activeFriends: [], offlineFriends: [] },
    friends: async ({ offline }) => (offline ? (opts.offlineFriends || []) : (opts.onlineFriends || [])),
    world: async (id) => ({ id, name: `世界_${id}` }),
    user: async (id) => {
      vrcapi.userCalls.push(id);
      if (opts.userError) throw opts.userError;
      return opts.selfInfo !== undefined ? opts.selfInfo : null;
    }
  };
  vrcapi.userCalls = [];
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
    config: { confirmDelayMs: opts.confirmDelayMs ?? 30000, dedupeWindowMs: 30000, snapshotIntervalMs: 600000, watchdogMs: 600000, statusCoalesceMs: opts.statusCoalesceMs ?? 3000, disconnectNotifyDelayMs: opts.disconnectNotifyDelayMs ?? 30000 }
  });
  return { db, bus, events, notifications, qqTexts, notifier, vrcapi, pipeline, monitor };
}

function addUser(db, { vrcId = 'usr_me', displayName = '我' } = {}) {
  const id = db.upsertUser(vrcId, { username: 'me', displayName, avatarUrl: null });
  return db.getUserByVrcId(vrcId);
}

function addConfig(db, userId, friendId, over = {}) {
  db.upsertConfig(userId, friendId, { monitorEnabled: true, notifyOnline: true, notifyOffline: true, notifyStatusChange: true, notifyWorldChange: true, ...over });
}

const onlineFriend = (id, over = {}) => ({ id, displayName: `朋友${id}`, location: 'wrld_a:1~region(us)', status: 'active', statusDescription: null, platform: 'standalonewindows', currentAvatarImageUrl: 'https://x/a.png', ...over });
const offlineFriend = (id) => ({ id, displayName: `朋友${id}`, location: 'offline', status: 'active', statusDescription: null, platform: 'web' });

test('activateUser: 首次对账只建基线不补通知, 无变化对账不重复', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')], offlineFriends: [offlineFriend('usr_f2')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  addConfig(t.db, user.id, 'usr_f2');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(t.pipeline.connects.length, 1);
  assert.equal(t.notifications.length, 0, '启动首次对账不补通知');
  const f1 = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f1.state, 'online');
  const f2 = t.db.getFriend(user.id, 'usr_f2');
  assert.equal(f2.state, 'offline');
  // 后续对账: 无新变化, 不通知
  await t.monitor.runSnapshot(user.vrchat_user_id);
  assert.equal(t.notifications.length, 0);
});

test('WS friend-online first sight stores silently, later changes notify', async () => {
  const t = setup();
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  // 首见: 直接按当前情况入库, 不通知
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-online', content: { userId: 'usr_f1', platform: 'standalonewindows', location: 'wrld_b:2~region(jp)', user: { id: 'usr_f1', displayName: '朋友usr_f1', status: 'join me', statusDescription: 'hi' } } });
  assert.equal(t.notifications.length, 0, '首见不通知');
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.state, 'online');
  assert.equal(f.status, 'join me');
  assert.equal(f.world_id, 'wrld_b');
  // 后续变化正常通知
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'y', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_c:3', user: { id: 'usr_f1', displayName: '朋友usr_f1', status: 'join me' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '切换世界');
});

test('WS friend-online with private location fills 私密世界 instead of null', async () => {
  const t = setup();
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-online', content: { userId: 'usr_f1', platform: 'standalonewindows', location: 'private', user: { id: 'usr_f1', displayName: '朋友usr_f1', status: 'active' } } });
  assert.equal(t.notifications.length, 0, '首见静默');
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.state, 'online');
  assert.equal(f.world_id, 'private');
  assert.equal(f.world_name, '私密世界');
});

test('WS friend-update with private location writes private world', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'active', location: 'private' } } });
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.world_id, 'private');
  assert.equal(f.world_name, '私密世界');
});

test('WS friend-add with private location writes private world', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-add', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'active', location: 'private' } } });
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.state, 'online');
  assert.equal(f.world_id, 'private');
  assert.equal(f.world_name, '私密世界');
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

test('WS friend-offline keeps social status and custom status', async () => {
  const t = setup();
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  // 上线: 社交状态 join me + 自定义状态 摸鱼中
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-online', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'join me', statusDescription: '摸鱼中' } } });
  // 下线: 保留社交状态与自定义状态
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-offline', content: { userId: 'usr_f1', platform: '' } });
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.state, 'offline');
  assert.equal(f.status, 'join me');
  assert.equal(f.status_description, '摸鱼中');
});

test('pending 到期自动调 API 验证并确认下线', async () => {
  const t = setup({ confirmDelayMs: 20, now: () => Date.now(), onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  // 先上线建基线
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-online', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  t.notifications.length = 0;
  // 下线 → pending, 不通知
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-offline', content: { userId: 'usr_f1', platform: '' } });
  assert.equal(t.notifications.length, 0);
  // API 验证返回 offline → 到期确认下线
  t.vrcapi.me = async () => ({ id: 'usr_me', onlineFriends: [], activeFriends: [], offlineFriends: ['usr_f1'] });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(t.notifications.length, 1, 'pending 到期 API 验证后确认下线');
  assert.equal(t.notifications[0].change.changeType, '下线');
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.pending_state, null);
});

test('standard mode monitors all enabled friends without limit', async () => {
  const online = Array.from({ length: 6 }, (_, i) => onlineFriend(`usr_f${i}`));
  const t = setup({ onlineFriends: online });
  const user = addUser(t.db);
  for (let i = 0; i < 6; i++) addConfig(t.db, user.id, `usr_f${i}`);
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(t.notifications.length, 0, '启动首次对账不补通知');
  // 每个好友切世界 → 全部触发通知(无监控数量上限)
  for (let i = 0; i < 6; i++) {
    await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'evt' + i, { type: 'friend-location', content: { userId: `usr_f${i}`, location: 'wrld_b:1', user: { id: `usr_f${i}`, displayName: `朋友usr_f${i}`, status: 'active' } } });
  }
  const notified = t.notifications.filter((n) => n.change.changeType === '切换世界');
  assert.equal(notified.length, 6, '6 个好友都监控且无上限');
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

test('snapshot leaves thumb null when only full image url present', async () => {
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
  assert.equal(f.avatar_thumb_url, null);
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

test('world change notifies by default and is controlled per-friend', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_c:3', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '切换世界');
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.world_id, 'wrld_c');
  // 取消该好友的世界变化通知开关后不通知
  t.notifications.length = 0;
  addConfig(t.db, user.id, 'usr_f1', { notifyWorldChange: false });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'y', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_d:4', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 0);
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

test('world -> private -> traveling -> public notifies each world change', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  // wrld_a -> private: notifies (any change)
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-location', content: { userId: 'usr_f1', location: 'private', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '切换世界');
  assert.equal(t.notifications[0].change.oldWorld, '世界_wrld_a');
  assert.equal(t.notifications[0].change.newWorld, '私密世界');
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'private');
  // private -> traveling: preserves private, no change
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-location', content: { userId: 'usr_f1', location: 'traveling', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.db.getFriend(user.id, 'usr_f1').world_id, 'private', 'traveling 时保留 private');
  // traveling(private) -> public world: notifies with private as old
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '3', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_5c240791:97628~hidden(usr_f1)~region(jp)', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(t.notifications.length, 2);
  assert.equal(t.notifications[1].change.changeType, '切换世界');
  assert.equal(t.notifications[1].change.oldWorld, '私密世界');
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
  const t = setup({ statusCoalesceMs: 0, onlineFriends: [onlineFriend('usr_f1', { status: 'active' })] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'busy', statusDescription: null } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '状态变化');
});

test('friend-update missing status keeps existing social/custom status', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1', { status: 'join me' })] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  // 先设置自定义状态
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'join me', statusDescription: '摸鱼中' } } });
  // friend-update 不带 status/statusDescription -> 继承旧值
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1' } } });
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.status, 'join me');
  assert.equal(f.status_description, '摸鱼中');
});

test('friend status->ask me + location->private merges into one 切换世界 showing both changes', async () => {
  const t = setup({ statusCoalesceMs: 5000, onlineFriends: [onlineFriend('usr_f1', { status: 'active' })] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  // friend-update: active -> ask me, 等待合并窗口
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'ask me' } } });
  assert.equal(t.notifications.length, 0, '状态变化应等待合并窗口');
  // friend-location: world -> private, 同一状态
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'b', { type: 'friend-location', content: { userId: 'usr_f1', location: 'private', user: { id: 'usr_f1', displayName: 'F1', status: 'ask me' } } });
  assert.equal(t.notifications.length, 1, '合并为一条通知');
  assert.equal(t.notifications[0].change.changeType, '切换世界');
  assert.equal(t.notifications[0].change.oldStatus, 'active');
  assert.equal(t.notifications[0].change.newStatus, 'ask me');
  assert.equal(t.notifications[0].change.newWorld, '私密世界');
});

test('friend-update status change alone flushes 状态变化 after coalesce window', async () => {
  const t = setup({ statusCoalesceMs: 20, onlineFriends: [onlineFriend('usr_f1', { status: 'active' })] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'busy' } } });
  assert.equal(t.notifications.length, 0, '窗口内未推送');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, '状态变化');
  assert.equal(t.notifications[0].change.oldStatus, 'active');
  assert.equal(t.notifications[0].change.newStatus, 'busy');
});

test('two distinct status changes within dedupe window both notify', async () => {
  const t = setup({ statusCoalesceMs: 0, onlineFriends: [onlineFriend('usr_f1', { status: 'active' })] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'join me' } } });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'b', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'busy' } } });
  assert.equal(t.notifications.length, 2, '不同状态变化不应被去重');
  assert.equal(t.notifications[0].change.newStatus, 'join me');
  assert.equal(t.notifications[1].change.newStatus, 'busy');
});

test('自定义状态变化受状态开关(notify_status_change)控制', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1', { notifyStatusChange: false });
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-update', content: { userId: 'usr_f1', user: { id: 'usr_f1', displayName: 'F1', status: 'active', statusDescription: '摸鱼中' } } });
  assert.equal(t.notifications.length, 0, '状态开关关闭时自定义状态变化不通知');
});

test('snapshot 401 Missing Credentials requests auto-relogin and keeps session', async () => {
  const t = setup();
  t.vrcapi.me = async () => { const e = new Error('"Missing Credentials"'); e.status = 401; throw e; };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(t.events.some((e) => e.kind === 'relogin-needed'), true, '触发自动重登请求');
  assert.equal(t.events.some((e) => e.kind === 'session-expired'), false, '不直接停用会话');
  assert.equal(t.pipeline.disconnects.length, 0, '会话保留, 不断开');
});

test('snapshot 401 Unauthorized requests 2FA and keeps session', async () => {
  const t = setup();
  t.vrcapi.me = async () => { const e = new Error('"Unauthorized"'); e.status = 401; throw e; };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(t.events.some((e) => e.kind === 'unauthorized-2fa'), true, '触发 2FA 请求');
  assert.equal(t.events.some((e) => e.kind === 'session-expired'), false);
  assert.equal(t.pipeline.disconnects.length, 0);
});

test('snapshot 401 other error emits session-expired and deactivates', async () => {
  const t = setup();
  t.vrcapi.me = async () => { const e = new Error('HTTP 401'); e.status = 401; throw e; };
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

test('snapshot keeps social/custom status when friend offline via API list', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  // 设置社交状态与自定义状态
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-online', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'join me', statusDescription: '摸鱼中' } } });
  // 快照: API 把好友放入 offline 列表(status 返回 null)
  t.vrcapi.friends = async ({ offline }) => (offline ? [{ id: 'usr_f1', displayName: 'F1', location: 'offline', status: null, statusDescription: null }] : []);
  await t.monitor.runSnapshot(user.vrchat_user_id);
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.state, 'offline');
  assert.equal(f.status, 'join me');
  assert.equal(f.status_description, '摸鱼中');
});

test('snapshot resolves world name for unmonitored friends too', async () => {
  let worldCalls = 0;
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  t.vrcapi.world = async (id) => { worldCalls++; return { id, name: '世界_' + id }; };
  const user = addUser(t.db);
  // 不 addConfig: usr_f1 未监控, 世界名也应默认解析
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(worldCalls, 1, '未监控好友也解析世界名');
  const f = t.db.getFriend(user.id, 'usr_f1');
  assert.equal(f.world_name, '世界_wrld_a');
  const c = t.db.getWorldCache('wrld_a');
  assert.equal(c.world_name, '世界_wrld_a');
});

test('failed world lookup retries with backoff until success', async () => {
  let cur = 1000000;
  let fail = true;
  let worldCalls = 0;
  const t = setup({ now: () => cur, onlineFriends: [onlineFriend('usr_f1')] });
  t.vrcapi.world = async (id) => { worldCalls++; if (fail) throw new Error('boom'); return { id, name: '世界_' + id }; };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  assert.equal(worldCalls, 1);
  let c = t.db.getWorldCache('wrld_a');
  assert.equal(c.world_name, '未知世界');
  assert.equal(c.fail_count, 1);
  // 退避期内(base=5s)不重查
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '1', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 1);
  // 退避到期后重试, 再失败 -> 退避翻倍(10s)
  cur += 5001;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '2', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 2);
  c = t.db.getWorldCache('wrld_a');
  assert.equal(c.fail_count, 2);
  // 翻倍后的退避期(10s)内不重查
  cur += 9999;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '3', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 2);
  // 到期后成功, 清零退避
  fail = false;
  cur += 2;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '4', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 3);
  c = t.db.getWorldCache('wrld_a');
  assert.equal(c.world_name, '世界_wrld_a');
  assert.equal(c.fail_count, 0);
  assert.equal(c.retry_at, 0);
  // 成功后 1 年内不重查
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, '5', { type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  assert.equal(worldCalls, 3);
});

test('world name backoff caps at 1h and stays there until success', async () => {
  let cur = 1000000;
  let worldCalls = 0;
  const t = setup({ now: () => cur, onlineFriends: [onlineFriend('usr_f1')] });
  t.vrcapi.world = async () => { worldCalls++; throw new Error('boom'); };
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi); // 第 1 次失败: 退避 5s
  const evt = (i) => ({ type: 'friend-location', content: { userId: 'usr_f1', location: 'wrld_a:1', user: { id: 'usr_f1', displayName: 'F1', status: 'active' } } });
  // 连续失败直到退避封顶 1h
  for (let i = 2; i <= 14; i++) {
    cur += 3600 * 1000 + 1; // 每次推进超过 1h, 必然到期
    await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'evt' + i, evt(i));
  }
  const c = t.db.getWorldCache('wrld_a');
  assert.equal(c.fail_count, 14);
  assert.equal(c.retry_at - cur, 3600 * 1000, '达到 1h 后保持 1h 不回退');
  // 再次失败仍是 1h
  cur += 3600 * 1000 + 1;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'evt15', evt(15));
  const c2 = t.db.getWorldCache('wrld_a');
  assert.equal(c2.fail_count, 15);
  assert.equal(c2.retry_at - cur, 3600 * 1000, '封顶后每次仍为 1h');
});

test('WS notification-v2 pushes to channels; update/delete only log; same id dedupes', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  const n1 = { type: 'notification-v2', content: { id: 'notif_1', version: 2, type: 'notification', category: 'friendRequest', senderUserId: 'usr_f1', title: '好友请求', message: 'hi' } };
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', n1);
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, 'VRChat通知');
  assert.equal(t.notifications[0].change.friendName, 'usr_f1');
  assert.ok(t.notifications[0].change.newStatusDescription.includes('hi'));
  // same id within window -> dedupe
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'y', n1);
  assert.equal(t.notifications.length, 1);
  // new id with sender -> pushes
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'z', { type: 'notification-v2', content: { id: 'notif_2', category: 'invite', senderUserId: 'usr_f2', title: 'inv', message: 'come' } });
  assert.equal(t.notifications.length, 2);
  assert.equal(t.notifications[1].change.friendName, 'usr_f2');
  // no sender (订阅频道公告) -> 不推送
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a1', { type: 'notification-v2', content: { id: 'notif_announce', category: 'system', title: 'Succubus Club: 大酒店开门啦', message: '今日大营业' } });
  assert.equal(t.notifications.length, 2, '无发送者的公告不推送');
  // friend display name preferred when known
  t.db.upsertFriend(user.id, 'usr_f9', { displayName: '好友九', state: 'offline' });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 't', { type: 'notification-v2', content: { id: 'notif_3', category: 'message', senderUserId: 'usr_f9', title: 'msg', message: 'yo' } });
  assert.equal(t.notifications[2].change.friendName, '好友九');
  // update/delete do not push
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'w', { type: 'notification-v2-update', content: { id: 'notif_3', status: 'seen' } });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'v', { type: 'notification-v2-delete', content: { id: 'notif_3' } });
  assert.equal(t.notifications.length, 3);
});

test('WS notification from self (senderUserId == own user) is not pushed', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  // 自我邀请: sender 是自己 -> 不推送
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 's1', {
    type: 'notification-v2',
    content: { id: 'notif_self', category: 'invite', senderUserId: user.vrchat_user_id, title: '世界邀请', message: '邀请你' }
  });
  assert.equal(t.notifications.length, 0, '自我邀请不推送');
  // 他人通知仍正常推送
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 's2', {
    type: 'notification-v2',
    content: { id: 'notif_other', category: 'invite', senderUserId: 'usr_f1', title: '世界邀请', message: '来玩' }
  });
  assert.equal(t.notifications.length, 1, '他人邀请正常推送');
});

test('WS legacy notification pushes with category label; lifecycle events only log', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'notification', content: { id: 'notif_l1', type: 'friendRequest', senderUserId: 'usr_f1', message: 'add me' } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.changeType, 'VRChat通知');
  assert.equal(t.notifications[0].change.friendName, 'usr_f1');
  assert.equal(t.notifications[0].change.notificationTitle, '好友请求');
  assert.equal(t.notifications[0].change.notificationBody, 'add me');
  assert.equal(t.notifications[0].change.notificationCategory, 'friendRequest');
  // response / see / hide / clear do not push
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'b', { type: 'response-notification', content: { notificationId: 'n1', receiverId: 'usr_f1', responseId: 'r1' } });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'c', { type: 'see-notification', content: 'notif_l1' });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'd', { type: 'hide-notification', content: 'notif_l1' });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'e', { type: 'clear-notification', content: null });
  assert.equal(t.notifications.length, 1);
});

test('notification-v2 with title == message does not duplicate body', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'notification-v2', content: { id: 'n1', category: 'invite', senderUserId: 'usr_f1', title: '世界邀请', message: '世界邀请' } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.notificationTitle, '世界邀请');
  assert.equal(t.notifications[0].change.notificationBody, '');
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'b', { type: 'notification-v2', content: { id: 'n2', category: 'invite', senderUserId: 'usr_f1', title: '世界邀请', message: '' } });
  assert.equal(t.notifications[1].change.notificationBody, '');
});

test('notification-v2 world invite shows world name instead of category', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  let worldCalls = 0;
  t.vrcapi.world = async (id) => { worldCalls++; return { id, name: '世界_' + id }; };
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'notification-v2', content: { id: 'n1', category: 'invite', title: '世界邀请', senderUserId: 'usr_f1', link: 'vrchat://launch?id=wrld_abc:1~region(us)' } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.notificationWorld, '世界_wrld_abc');
  assert.ok(t.notifications[0].change.categoryOrWorld.startsWith('世界:'));
  assert.ok(!t.notifications[0].change.categoryOrWorld.includes('分类:'));
  assert.ok(worldCalls >= 1);
  // non-invite keeps category line
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'b', { type: 'notification-v2', content: { id: 'n2', category: 'friendRequest', senderUserId: 'usr_f1', title: '好友请求', message: 'hi' } });
  assert.equal(t.notifications[1].change.categoryOrWorld, '');
});

test('notification-v2 invite prefers details.worldName without API call', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  let worldCalls = 0;
  t.vrcapi.world = async (id) => { worldCalls++; return { id, name: '世界_' + id }; };
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'notification-v2', content: { id: 'n1', category: 'invite', title: '世界邀请', senderUserId: 'usr_f1', details: { worldId: 'wrld_det', worldName: '细节世界' } } });
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.notificationWorld, '细节世界');
  assert.ok(t.notifications[0].change.categoryOrWorld.startsWith('世界:'));
  assert.equal(worldCalls, 0);
});

test('notification-v2 invite parses JSON string details for worldName', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  t.vrcapi.world = async (id) => ({ id, name: '世界_' + id });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'notification-v2', content: { id: 'n1', category: 'invite', senderUserId: 'usr_f1', title: '世界邀请', details: JSON.stringify({ worldId: 'wrld_str', worldName: '字符串世界' }) } });
  assert.equal(t.notifications[0].change.notificationWorld, '字符串世界');
});

test('notification-v2 invite resolves nested details.invite worldName', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.notifications.length = 0;
  t.vrcapi.world = async (id) => ({ id, name: '世界_' + id });
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'a', { type: 'notification-v2', content: { id: 'n1', category: 'invite', senderUserId: 'usr_f1', title: '世界邀请', details: { invite: { worldId: 'wrld_nest', worldName: '嵌套世界' } } } });
  assert.equal(t.notifications[0].change.notificationWorld, '嵌套世界');
  // 只有 worldId 时回退调世界 API
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'b', { type: 'notification-v2', content: { id: 'n2', category: 'invite', senderUserId: 'usr_f1', title: '世界邀请', details: { worldId: 'wrld_onlyid' } } });
  assert.equal(t.notifications[1].change.notificationWorld, '世界_wrld_onlyid');
});

test('system: startup pushed after ws-open + first snapshot done', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi); // snapshotDone = true, ws 未连接
  t.qqTexts.length = 0;
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: false });
  assert.equal(t.qqTexts.length, 1, '首次 ws 连接 + 首次对账完成 -> 推送启动说明');
  assert.ok(t.qqTexts[0].text.includes('服务已启动'));
  assert.ok(t.qqTexts[0].text.includes('输入任意'));
  assert.ok(t.qqTexts[0].text.includes('时间:'), '启动说明带时间');
  // 重复 open 不再推启动
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: false });
  assert.equal(t.qqTexts.length, 1, '启动说明只推一次');
});

test('system: ws disconnect / reconnect / 401 push system notifications', async () => {
  const t = setup({ disconnectNotifyDelayMs: 5 });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  const evt = t.monitor.events;
  evt.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: false }); // 完成启动
  // 断开后阈值内: 不推送断开通知
  t.notifications.length = 0;
  evt.emit('ws-close', { userId: user.vrchat_user_id });
  assert.equal(t.notifications.length, 0, '阈值内不推送断开通知');
  await new Promise((r) => setTimeout(r, 30)); // 超过阈值
  assert.equal(t.notifications.length, 1);
  assert.equal(t.notifications[0].change.eventType, 'vrc_system');
  assert.ok(t.notifications[0].change.notificationTitle.includes('断开'));
  // 断开已通知后重连成功 -> 恢复说明(QQ)
  t.qqTexts.length = 0;
  evt.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: true });
  assert.equal(t.qqTexts.length, 1, '断开超过阈值后重连推送恢复说明');
  assert.ok(t.qqTexts[0].text.includes('服务已恢复'));
  // 非故障重复 open(未断开) -> 已连接
  t.notifications.length = 0;
  evt.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: false });
  assert.equal(t.notifications.length, 1);
  assert.ok(t.notifications[0].change.notificationTitle.includes('已连接'));
  // 401 会话失效
  t.notifications.length = 0;
  evt.emit('session-expired', { userId: user.vrchat_user_id, reason: 'Missing Credentials' });
  assert.equal(t.notifications.length, 1);
  assert.ok(t.notifications[0].change.notificationTitle.includes('会话失效'));
});

test('system: recovery pushed after reconnect + snapshot done', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')], disconnectNotifyDelayMs: 5 });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: false }); // 启动
  t.qqTexts.length = 0;
  // 断开超过阈值(断开通知已发)后重连成功 -> 恢复说明
  t.monitor.events.emit('ws-close', { userId: user.vrchat_user_id });
  await new Promise((r) => setTimeout(r, 30));
  t.qqTexts.length = 0;
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: true });
  assert.equal(t.qqTexts.length, 1, '故障恢复后推送恢复说明');
  assert.ok(t.qqTexts[0].text.includes('服务已恢复'));
});

test('system: quick reconnect within threshold is silent (no disconnect/recovery notifications)', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')], disconnectNotifyDelayMs: 10 });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: false }); // 启动
  t.notifications.length = 0;
  t.qqTexts.length = 0;
  // 阈值内断开并重连成功: 全程静默
  t.monitor.events.emit('ws-close', { userId: user.vrchat_user_id });
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: true });
  assert.equal(t.notifications.length, 0, '快速重连不发断开/已连接通知');
  assert.equal(t.qqTexts.length, 0, '快速重连不发恢复说明');
  // 超过阈值后已重连: 断开通知不应补发
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(t.notifications.length, 0, '重连成功后不再补发断开通知');
});

test('system: watchdog reconnect does not push recovery/connected notifications', async () => {
  const t = setup({ onlineFriends: [onlineFriend('usr_f1')] });
  const user = addUser(t.db);
  addConfig(t.db, user.id, 'usr_f1');
  await t.monitor.activateUser(user, t.vrcapi);
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: false }); // 启动
  t.qqTexts.length = 0;
  t.notifications.length = 0;
  t.monitor.events.emit('ws-close', { userId: user.vrchat_user_id });
  t.notifications.length = 0; // 清掉断开通知, 只看 watchdog 重连本身
  t.monitor.events.emit('ws-open', { userId: user.vrchat_user_id, wasFailing: true, isWatchdog: true });
  assert.equal(t.qqTexts.length, 0, 'watchdog 重连不推恢复说明');
  assert.equal(t.notifications.length, 0, 'watchdog 重连不推已连接');
});

test('system: sendShutdownNotice pushes 服务已停止 to active users', async () => {
  const t = setup();
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.qqTexts.length = 0;
  await t.monitor.sendShutdownNotice();
  assert.equal(t.qqTexts.length, 1);
  assert.ok(t.qqTexts[0].text.includes('服务已停止'));
  assert.ok(t.qqTexts[0].text.includes('时间:'));
});

// ---------- 自己的信息 ----------
const selfInfoOnline = () => ({
  id: 'usr_me', state: 'online', status: 'join me', statusDescription: '摸鱼中',
  location: 'wrld_self:1~region(jp)', last_platform: 'standalonewindows',
  currentAvatarImageUrl: 'https://x/me.png',
  currentAvatarThumbnailImageUrl: 'https://api.vrchat.cloud/api/1/image/file_me/1/256'
});

test('self: snapshot stores own info from GET /users/{id} without notification', async () => {
  const t = setup({ selfInfo: selfInfoOnline() });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  assert.deepEqual(t.vrcapi.userCalls, ['usr_me']);
  const me = t.db.getUserByVrcId('usr_me');
  assert.equal(me.state, 'online');
  assert.equal(me.status, 'join me');
  assert.equal(me.status_description, '摸鱼中');
  assert.equal(me.world_id, 'wrld_self');
  assert.equal(me.world_name, '世界_wrld_self');
  assert.equal(me.platform, 'standalonewindows');
  assert.equal(me.avatar_url, 'https://x/me.png');
  assert.equal(me.avatar_thumb_url, 'https://api.vrchat.cloud/api/1/image/file_me/1/256');
  assert.equal(t.notifications.length, 0, '自己变化不通知');
  assert.ok(t.events.some((e) => e.kind === 'self-state'));
});

test('self: snapshot offline/empty location derives active (web session alive)', async () => {
  const t = setup({ selfInfo: { id: 'usr_me', state: 'offline', status: 'offline', location: '' } });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  const me = t.db.getUserByVrcId('usr_me');
  assert.equal(me.state, 'active');
  assert.equal(me.status, 'active');
  assert.equal(me.world_id, null);
  assert.equal(t.notifications.length, 0);
});

test('self: snapshot keeps existing row when GET /users/{id} fails', async () => {
  const t = setup({ selfInfo: selfInfoOnline() });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  const before = t.db.getUserByVrcId('usr_me');
  t.vrcapi.user = async () => { throw new Error('network down'); };
  const result = await t.monitor.runSnapshot(user.vrchat_user_id);
  assert.equal(result.ok, true, '/users/{id} 失败不影响好友对账');
  const after = t.db.getUserByVrcId('usr_me');
  assert.equal(after.state, before.state);
  assert.equal(after.world_id, before.world_id);
  assert.equal(t.notifications.length, 0);
});

test('self: WS user-update updates profile/status, keeps state and world', async () => {
  const t = setup({ selfInfo: selfInfoOnline() });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.events.length = 0;
  t.notifications.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', {
    type: 'user-update',
    content: {
      userId: 'usr_me',
      user: {
        id: 'usr_me', displayName: '新我', status: 'busy', statusDescription: '忙',
        currentAvatarImageUrl: 'https://x/new.png',
        currentAvatarThumbnailImageUrl: 'https://api.vrchat.cloud/api/1/image/file_new/1/256'
      }
    }
  });
  const me = t.db.getUserByVrcId('usr_me');
  assert.equal(me.display_name, '新我');
  assert.equal(me.avatar_url, 'https://x/new.png');
  assert.equal(me.avatar_thumb_url, 'https://api.vrchat.cloud/api/1/image/file_new/1/256');
  assert.equal(me.status, 'busy');
  assert.equal(me.status_description, '忙');
  assert.equal(me.state, 'online');
  assert.equal(me.world_id, 'wrld_self');
  assert.equal(t.notifications.length, 0, '自己不触发通知');
  assert.ok(t.events.some((e) => e.kind === 'self-state'));
});

test('self: WS user-location real location updates own world', async () => {
  const t = setup({ selfInfo: selfInfoOnline() });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.events.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', {
    type: 'user-location',
    content: {
      userId: 'usr_me', location: 'wrld_b:2',
      user: { id: 'usr_me', displayName: '我', status: 'active', statusDescription: null, last_platform: 'android' }
    }
  });
  const me = t.db.getUserByVrcId('usr_me');
  assert.equal(me.state, 'online');
  assert.equal(me.world_id, 'wrld_b');
  assert.equal(me.world_name, '世界_wrld_b');
  assert.equal(me.platform, 'android');
  assert.ok(t.events.some((e) => e.kind === 'self-state'));
});

test('self: WS user-location offline fills active and clears world', async () => {
  const t = setup({ selfInfo: selfInfoOnline() });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  t.events.length = 0;
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', {
    type: 'user-location',
    content: { userId: 'usr_me', location: 'offline', user: { id: 'usr_me', status: 'offline' } }
  });
  const me = t.db.getUserByVrcId('usr_me');
  assert.equal(me.state, 'active');
  assert.equal(me.status, 'active');
  assert.equal(me.world_id, null);
  assert.equal(me.world_name, null);
});

test('self: WS user-location private fills online + 私密世界', async () => {
  const t = setup({ selfInfo: selfInfoOnline() });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', {
    type: 'user-location',
    content: { userId: 'usr_me', location: 'private', user: { id: 'usr_me', displayName: '我', status: 'active' } }
  });
  const me = t.db.getUserByVrcId('usr_me');
  assert.equal(me.state, 'online');
  assert.equal(me.world_id, 'private');
  assert.equal(me.world_name, '私密世界');
});

test('self: WS user-location traveling keeps existing world', async () => {
  const t = setup({ selfInfo: selfInfoOnline() });
  const user = addUser(t.db);
  await t.monitor.activateUser(user, t.vrcapi);
  await t.monitor.handlePipelineEvent(user.vrchat_user_id, 'x', {
    type: 'user-location',
    content: { userId: 'usr_me', location: 'traveling', user: { id: 'usr_me', displayName: '我', status: 'active' } }
  });
  const me = t.db.getUserByVrcId('usr_me');
  assert.equal(me.state, 'online');
  assert.equal(me.world_id, 'wrld_self');
  assert.equal(me.world_name, '世界_wrld_self');
});
