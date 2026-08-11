const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDb } = require('../src/db');

function newDb(opts) { return createDb(':memory:', opts); }

test('users: upsert, get by vrc id, settings update', () => {
  const db = newDb();
  const id = db.upsertUser('usr_1', { username: 'u1', displayName: '昵称1', avatarUrl: 'https://a' });
  assert.ok(id > 0);
  const u = db.getUserByVrcId('usr_1');
  assert.equal(u.display_name, '昵称1');
  db.updateGlobalSettings({ email: 'a@b.c', smtp_host: 'smtp.x', smtp_port: 587, smtp_secure: true, smtp_user: 'uu', smtp_pass: 'enc:xx', gotify_enabled: true, gotify_app_token: 'tok' });
  const g = db.getGlobalSettings();
  assert.equal(g.email, 'a@b.c');
  assert.equal(g.smtp_port, 587);
  assert.equal(g.gotify_enabled, 1);
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

test('monitor_config: upsert, list, favorite', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertConfig(uid, 'usr_f1', { favorite: true, notifyOnline: false, notifyOffline: true });
  db.upsertConfig(uid, 'usr_f2', {});
  let configs = db.listConfigs(uid);
  assert.equal(configs.length, 2);
  const c = db.getConfig(uid, 'usr_f1');
  assert.equal(c.favorite, 1);
  assert.equal(c.notify_online, 0);
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

test('notif dedupe slides window on re-trigger and caps row count', () => {
  const db = newDb({ maxDedupeRows: 5 });
  const t = 100000;
  db.markNotified('k1', t);
  assert.equal(db.isDuplicate('k1', 30000, t + 10000), true);
  db.markNotified('k1', t + 10000); // slide: re-trigger refreshes window
  assert.equal(db.isDuplicate('k1', 30000, t + 35000), true);
  assert.equal(db.isDuplicate('k1', 30000, t + 45000), false);
  for (let i = 0; i < 6; i++) db.markNotified(`k${i}`, t + i);
  assert.equal(db.isDuplicate('k0', 30000, t + 10), false, 'oldest row trimmed');
  assert.equal(db.isDuplicate('k5', 30000, t + 10), true);
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
  db.upsertWorldCache('wrld_c', '未知世界', 3000, 3, 9000);
  const c3 = db.getWorldCache('wrld_c');
  assert.equal(c3.fail_count, 3);
  assert.equal(c3.retry_at, 9000);
});

test('createDb creates missing parent directory automatically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-'));
  const dbPath = path.join(dir, 'nested', 'sub', 'test.db');
  try {
    const db = createDb(dbPath);
    db.setSetting('k', 'v');
    assert.equal(db.getSetting('k'), 'v');
    assert.ok(fs.existsSync(dbPath), '数据库文件已创建');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 临时文件句柄未释放时忽略清理 */ }
  }
});

test('legacy db migration moves notify columns into settings', () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, vrchat_user_id TEXT UNIQUE, username TEXT, saved_username TEXT, display_name TEXT, avatar_url TEXT, email TEXT, smtp_host TEXT, smtp_port INTEGER, smtp_secure INTEGER, smtp_user TEXT, smtp_pass TEXT, email_subject_template TEXT, email_body_template TEXT, gotify_enabled INTEGER DEFAULT 0, gotify_server_url TEXT, gotify_app_token TEXT, gotify_priority INTEGER DEFAULT 5, ntfy_enabled INTEGER DEFAULT 0, ntfy_server_url TEXT, ntfy_topic TEXT, ntfy_priority INTEGER DEFAULT 3, webhook_enabled INTEGER DEFAULT 0, webhook_url TEXT, webhook_method TEXT DEFAULT 'POST', webhook_headers TEXT, webhook_body_template TEXT, webhook_content_type TEXT DEFAULT 'application/json', smtp_enabled INTEGER DEFAULT 0, qq_enabled INTEGER DEFAULT 0, qq_app_id TEXT, qq_app_secret TEXT, status_only_mode INTEGER DEFAULT 0, remember_me INTEGER DEFAULT 0, cookie_data TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));`);
  old.exec(`INSERT INTO users (vrchat_user_id, username, email, smtp_host, smtp_port, qq_enabled, qq_app_id, qq_app_secret, smtp_enabled) VALUES ('usr_old', 'uold', 'a@b.c', 'smtp.x', 587, 1, 'app1', 'sec1', 1);`);
  old.close();
  const db = createDb(file);
  const g = db.getGlobalSettings();
  assert.equal(g.email, 'a@b.c');
  assert.equal(g.smtp_host, 'smtp.x');
  assert.equal(g.smtp_port, 587);
  assert.equal(g.qq_enabled, 1);
  assert.equal(g.qq_app_id, 'app1');
  assert.equal(g.qq_app_secret, 'sec1');
  assert.equal(g.smtp_enabled, 1);
  // 旧通知列已从 users 表删除
  const chk = new DatabaseSync(file);
  const cols = chk.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  chk.close();
  assert.ok(!cols.includes('email'));
  assert.ok(!cols.includes('qq_enabled'));
  const id = db.getUserByVrcId('usr_old').id;
  db.upsertQqBinding(id, { appId: 'app1', openid: 'openid_old', nickname: 'x', at: 1 });
  assert.equal(db.getQqBinding(id, 'app1').openid, 'openid_old');
});
