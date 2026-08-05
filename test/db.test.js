const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');

function newDb() { return createDb(':memory:'); }

test('users: upsert, get by vrc id, settings update', () => {
  const db = newDb();
  const id = db.upsertUser('usr_1', { username: 'u1', displayName: '昵称1', avatarUrl: 'https://a' });
  assert.ok(id > 0);
  const u = db.getUserByVrcId('usr_1');
  assert.equal(u.display_name, '昵称1');
  db.updateUserSettings(id, { email: 'a@b.c', smtp_host: 'smtp.x', smtp_port: 587, smtp_secure: true, smtp_user: 'uu', smtp_pass: 'enc:xx', gotify_enabled: true, gotify_app_token: 'tok', status_only_mode: true });
  const u2 = db.getUserByDbId(id);
  assert.equal(u2.email, 'a@b.c');
  assert.equal(u2.smtp_port, 587);
  assert.equal(u2.gotify_enabled, 1);
  assert.equal(u2.status_only_mode, 1);
  // upsert 同一用户更新资料不重复
  db.upsertUser('usr_1', { username: 'u1', displayName: '新名', avatarUrl: null });
  assert.equal(db.listUsers().length, 1);
});

test('cookies: save/clear/remember_me and saved_username', () => {
  const db = newDb();
  const id = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.saveCookies(id, 'enc:data', 'u1');
  const u = db.getUserByDbId(id);
  assert.equal(u.cookie_data, 'enc:data');
  assert.equal(u.remember_me, 1);
  assert.equal(u.saved_username, 'u1');
  assert.equal(db.getSavedLogin().vrchat_user_id, 'usr_1');
  db.clearCookies(id);
  const u2 = db.getUserByDbId(id);
  assert.equal(u2.cookie_data, null);
  assert.equal(u2.remember_me, 0);
});

test('cookies: saving a new user clears the previous saved cookie (only one stored)', () => {
  const db = newDb();
  const idA = db.upsertUser('usr_A', { username: 'a', displayName: 'A', avatarUrl: null });
  const idB = db.upsertUser('usr_B', { username: 'b', displayName: 'B', avatarUrl: null });
  db.saveCookies(idA, 'cookieA', 'a');
  assert.equal(db.getSavedLogin().vrchat_user_id, 'usr_A');
  db.saveCookies(idB, 'cookieB', 'b');
  const a = db.getUserByDbId(idA);
  assert.equal(a.cookie_data, null);
  assert.equal(a.remember_me, 0);
  const b = db.getUserByDbId(idB);
  assert.equal(b.cookie_data, 'cookieB');
  assert.equal(b.remember_me, 1);
  assert.equal(db.getSavedLogin().vrchat_user_id, 'usr_B');
});

test('friends: upsert new/update, list, delete', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  const r1 = db.upsertFriend(uid, 'usr_f1', { displayName: '朋友', state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A', platform: 'standalonewindows' });
  assert.equal(r1.isNew, true);
  const r2 = db.upsertFriend(uid, 'usr_f1', { displayName: '朋友', state: 'offline', status: null, worldId: null, worldName: null });
  assert.equal(r2.isNew, false);
  assert.equal(r2.row.state, 'offline');
  assert.equal(db.listFriends(uid).length, 1);
  const f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.world_name, null);
  db.deleteFriend(uid, 'usr_f1');
  assert.equal(db.listFriends(uid).length, 0);
});

test('friends: avatar_thumb_url stored and updated via profile', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F', avatarUrl: 'orig.png', avatarThumbUrl: 'thumb256.png' });
  let f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.avatar_url, 'orig.png');
  assert.equal(f.avatar_thumb_url, 'thumb256.png');
  db.updateFriendProfile(f.id, { avatarThumbUrl: 'thumb256-new.png' });
  f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.avatar_thumb_url, 'thumb256-new.png');
  assert.equal(f.avatar_url, 'orig.png', '更新缩略图不应覆盖原图');
  // 旧库迁移: 已存在表补列不报错
  const db2 = createDb(':memory:');
  db2.upsertUser('usr_2', { username: 'u2', displayName: 'n', avatarUrl: null });
  const uid2 = db2.getUserByVrcId('usr_2').id;
  db2.upsertFriend(uid2, 'usr_f1', { displayName: 'F', avatarUrl: 'a', avatarThumbUrl: 'b' });
  assert.equal(db2.getFriend(uid2, 'usr_f1').avatar_thumb_url, 'b');
});

test('monitor_config: upsert, list, disable all', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertConfig(uid, 'usr_f1', { monitorEnabled: true, notifyOnline: false, notifyOffline: true });
  db.upsertConfig(uid, 'usr_f2', { monitorEnabled: true });
  let configs = db.listConfigs(uid);
  assert.equal(configs.length, 2);
  const c = db.getConfig(uid, 'usr_f1');
  assert.equal(c.monitor_enabled, 1);
  assert.equal(c.notify_online, 0);
  db.disableAllConfigs(uid);
  configs = db.listConfigs(uid);
  assert.equal(configs.filter((x) => x.monitor_enabled === 1).length, 0);
});

test('settings get/set and notif dedupe window', () => {
  const db = newDb();
  db.setSetting('access_key', 'ABC');
  assert.equal(db.getSetting('access_key'), 'ABC');
  assert.equal(db.getSetting('nope'), null);
  const t = 100000;
  assert.equal(db.isDuplicate('k1', 30000, t), false);
  db.markNotified('k1', t);
  assert.equal(db.isDuplicate('k1', 30000, t + 10000), true);
  assert.equal(db.isDuplicate('k1', 30000, t + 40000), false); // 窗口外
});

test('world_cache: upsert, get, overwrite', () => {
  const db = newDb();
  assert.equal(db.getWorldCache('wrld_a'), null);
  db.upsertWorldCache('wrld_a', 'A', 1000);
  const c = db.getWorldCache('wrld_a');
  assert.equal(c.world_name, 'A');
  assert.equal(c.updated_at, 1000);
  db.upsertWorldCache('wrld_a', 'A2', 2000);
  assert.equal(db.getWorldCache('wrld_a').world_name, 'A2');
  assert.equal(db.getWorldCache('wrld_a').updated_at, 2000);
  db.upsertWorldCache('wrld_b', '未知世界', 3000);
  assert.equal(db.getWorldCache('wrld_b').world_name, '未知世界');
});
