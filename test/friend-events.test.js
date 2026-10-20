'use strict';
// 好友动态(friend_logs)后端: 特别关注筛选 + type_code 原样输出 + 路由参数透传。
const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');

const newDb = () => createDb(':memory:');

test('friend_logs: favorite=true 只返回特别关注好友的日志', () => {
  const db = newDb();
  db.upsertFriend('usr_fav', { displayName: '关注' });
  db.upsertFriend('usr_plain', { displayName: '普通' });
  db.upsertFriend('usr_orphan', { displayName: '已删除' });
  db.setFriendConfig('usr_fav', { favorite: true });
  db.setFriendConfig('usr_orphan', { favorite: true });

  const fav = db.addFriendEvent({ type: '上线', at: 1, friend_vrchat_id: 'usr_fav' });
  const plain = db.addFriendEvent({ type: '上线', at: 2, friend_vrchat_id: 'usr_plain' });
  const orphan = db.addFriendEvent({ type: '上线', at: 3, friend_vrchat_id: 'usr_orphan' });
  db.deleteFriend('usr_orphan');

  // 不传 favorite = 不过滤(现有行为)
  assert.deepEqual(
    db.listFriendEvents({ limit: 10 }).events.map((e) => e.id),
    [orphan.id, plain.id, fav.id]
  );

  // favorite=true 只留特殊关注好友; 已删除好友(f 为 NULL)自然排除
  const only = db.listFriendEvents({ limit: 10, favorite: true });
  assert.deepEqual(only.events.map((e) => e.id), [fav.id]);
  assert.equal(only.total, 1, 'total 按同一套筛选统计');
  assert.equal(only.hasMore, false);

  // favorite=false / 不传都不筛(保持"缺省不过滤")
  assert.deepEqual(
    db.listFriendEvents({ limit: 10, favorite: false }).events.map((e) => e.id),
    [orphan.id, plain.id, fav.id]
  );
});

test('friend_logs: project 输出 type_code = DB 英文代码, type 仍是中文标签', () => {
  const db = newDb();
  db.upsertFriend('usr_a', { displayName: '甲' });
  const row = db.addFriendEvent({ type: '上线', at: 1, friend_vrchat_id: 'usr_a' });
  assert.equal(row.type, '上线', '对外展示标签不变');
  assert.equal(row.type_code, 'friend_online', 'type_code 保留 DB 里的英文代码');

  const listed = db.listFriendEvents({ limit: 10 }).events[0];
  assert.equal(listed.type, '上线');
  assert.equal(listed.type_code, 'friend_online');

  const boop = db.addFriendEvent({ type: '戳一戳', at: 2, friend_vrchat_id: 'usr_a', title: '戳了你一下' });
  assert.equal(boop.type, '戳一戳');
  assert.equal(boop.type_code, 'boop');
});

// ---------- 路由: GET /api/friend-events?favorite=1 ----------

const { EventEmitter } = require('node:events');
const { CookieJar } = require('../src/cookiejar');
const { createApp } = require('../src/server');

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

// 真的内存库 + 最小 monitor/vrcapi 桩: 只覆盖本接口需要的登录落地, 不发任何网络请求。
function setupServer() {
  const db = newDb();
  const bus = new EventEmitter();
  const vrcapi = {
    jar: new CookieJar(),
    login: async () => ({ id: 'usr_me', displayName: '我' }),
    me: async () => ({ id: 'usr_me', displayName: '我' }),
    setCookiesChanged: () => {}
  };
  const monitor = {
    events: bus,
    worldName: null,
    activateUser: async () => {},
    deactivateUser: () => {},
    activeUsers: () => []
  };
  const { app } = createApp({
    db, monitor,
    pipeline: { status: () => null },
    notifier: { sendAll: async () => ({}) },
    vrcapiFactory: () => vrcapi,
    config: {},
    logger: silent,
    now: () => 1000000,
    publicDir: null
  });
  const server = app.listen(0);
  return { db, server, base: 'http://127.0.0.1:' + server.address().port };
}

async function getJson(base, path) {
  const res = await fetch(base + path);
  return { status: res.status, data: await res.json() };
}
async function postJson(base, path, body) {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  return { status: res.status, data: await res.json() };
}

test('GET /api/friend-events?favorite=1 只返回特别关注好友的日志', async (t) => {
  const ctx = setupServer();
  t.after(async () => { ctx.server.closeAllConnections?.(); await new Promise((r) => ctx.server.close(r)); });
  const login = await postJson(ctx.base, '/api/login', { username: 'me', password: 'pw', rememberMe: false });
  assert.equal(login.status, 200, '桩登录成功');

  ctx.db.upsertFriend('usr_fav', { displayName: '关注' });
  ctx.db.upsertFriend('usr_plain', { displayName: '普通' });
  ctx.db.setFriendConfig('usr_fav', { favorite: true });
  const fav = ctx.db.addFriendEvent({ type: '上线', at: 1, friend_vrchat_id: 'usr_fav' });
  const plain = ctx.db.addFriendEvent({ type: '上线', at: 2, friend_vrchat_id: 'usr_plain' });

  const filtered = await getJson(ctx.base, '/api/friend-events?favorite=1');
  assert.equal(filtered.status, 200);
  assert.deepEqual(filtered.data.events.map((e) => e.id), [fav.id], 'favorite=1 透传给仓储并生效');
  assert.equal(filtered.data.total, 1, 'total 与筛选一致');
  assert.equal(filtered.data.events[0].type_code, 'friend_online', '接口响应也带 type_code');

  const all = await getJson(ctx.base, '/api/friend-events');
  assert.deepEqual(all.data.events.map((e) => e.id), [plain.id, fav.id], '不传 favorite 不过滤');
});
