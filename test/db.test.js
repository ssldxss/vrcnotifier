const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createDb } = require('../src/db');
const { createCrypto } = require('../src/crypto');

function newDb(opts) { return createDb(':memory:', opts); }
function testCrypt() { return createCrypto({ masterKey: crypto.randomBytes(32) }); }

test('users: upsert, get by vrc id, settings update', () => {
  const db = newDb();
  const id = db.upsertUser('usr_1', { username: 'u1', displayName: '昵称1', avatarUrl: 'https://a' });
  assert.ok(id > 0);
  const u = db.getUserByVrcId('usr_1');
  assert.equal(u.display_name, '昵称1');
  db.updateGlobalSettings({ qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1', email: 'a@b.c' }); // email 已移出白名单, 忽略
  const g = db.getGlobalSettings();
  assert.equal(g.qq_enabled, 1);
  assert.equal(g.qq_app_id, 'app1');
  assert.equal(g.qq_app_secret, 'sec1');
  assert.equal(g.email, undefined, '非白名单字段不入库');
  // upsert 同一用户更新资料不重复
  db.upsertUser('usr_1', { username: 'u1', displayName: '新名', avatarUrl: null });
  assert.equal(db.listUsers().length, 1);
});

test('users: self profile and presence fields are stored and updated', () => {
  const db = newDb();
  const thumb = 'https://api.vrchat.cloud/api/1/image/file_me/1/256';
  const id = db.upsertUser('usr_1', {
    username: 'u1', displayName: '我', avatarUrl: 'https://a.png',
    avatarThumbUrl: thumb, statusDescription: '摸鱼中', platform: 'standalonewindows'
  });
  let u = db.getUserByDbId(id);
  assert.equal(u.avatar_thumb_url, thumb);
  assert.equal(u.status_description, '摸鱼中');
  assert.equal(u.platform, 'standalonewindows');
  assert.equal(u.state, 'active', '新用户基线: 网页会话在线');

  // 资料更新: 缺失字段保留旧值
  db.updateSelfProfile(id, { displayName: '新名', avatarUrl: null, avatarThumbUrl: null });
  u = db.getUserByDbId(id);
  assert.equal(u.display_name, '新名');
  assert.equal(u.avatar_url, 'https://a.png');
  assert.equal(u.avatar_thumb_url, thumb);

  // presence 全量写入
  db.updateSelfPresence(id, {
    state: 'online', status: 'join me', worldId: 'wrld_x', worldName: 'X世界',
    statusDescription: '开黑', platform: 'android', lastSeen: 123
  });
  u = db.getUserByDbId(id);
  assert.equal(u.state, 'online');
  assert.equal(u.status, 'join me');
  assert.equal(u.world_id, 'wrld_x');
  assert.equal(u.world_name, undefined, '世界名不再入库(改由 world_cache 按需提供), 传进来也被忽略');
  assert.equal(u.status_description, '开黑');
  assert.equal(u.platform, 'android');
  assert.equal(u.last_seen, 123);

  // 再次 upsert 资料不改 presence
  db.upsertUser('usr_1', { username: 'u1', displayName: '新名', avatarUrl: null });
  u = db.getUserByDbId(id);
  assert.equal(u.state, 'online');
  assert.equal(u.world_id, 'wrld_x');
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
  assert.equal(f.world_name, undefined, 'friends 表已无 world_name 列');
  assert.equal(f.world_id, null);
  db.deleteFriend(uid, 'usr_f1');
  assert.equal(db.listFriends(uid).length, 0);
});

test('friends: instance_id 落库, 状态更新可清空/保留', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  // upsert 写入实例
  db.upsertFriend(uid, 'usr_f1', { displayName: '朋友', state: 'online', worldId: 'wrld_a', worldName: 'A', instanceId: '1234~region(us)' });
  let f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.instance_id, '1234~region(us)', 'upsert 写入 instance_id');
  // 状态更新清空实例(下线)
  db.updateFriendState(f.id, { state: 'offline', world_id: null, world_name: null, instance_id: null });
  f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.state, 'offline');
  assert.equal(f.instance_id, null, '下线清空 instance_id');
  // 状态更新显式传实例 → 覆盖; 显式传 null → 清空(保留旧值由 monitor 层显式传入旧值实现)
  db.upsertFriend(uid, 'usr_f2', { displayName: 'F2', state: 'online', worldId: 'wrld_b', worldName: 'B', instanceId: '99~region(jp)' });
  const f2 = db.getFriend(uid, 'usr_f2');
  db.updateFriendState(f2.id, { state: 'online', world_id: 'wrld_b', world_name: 'B', instance_id: '88~region(us)' });
  assert.equal(db.getFriend(uid, 'usr_f2').instance_id, '88~region(us)', '显式传入即覆盖');
});

test('world_cache 旧库迁移: 删掉失败退避列并保留名字', () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-mig-'));
  const dbPath = path.join(dir, 'old.db');
  const raw = new DatabaseSync(dbPath);
  raw.exec(`CREATE TABLE world_cache (world_id TEXT PRIMARY KEY, world_name TEXT NOT NULL, updated_at INTEGER NOT NULL,
    fail_count INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0)`);
  raw.exec("INSERT INTO world_cache VALUES ('wrld_ok','真名字',111,0,0)");
  raw.exec("INSERT INTO world_cache VALUES ('wrld_bad','未知世界',222,7,999)");
  raw.close();

  const db = createDb(dbPath);
  const check = new DatabaseSync(dbPath, { readOnly: true });
  const cols = check.prepare('PRAGMA table_info(world_cache)').all().map((c) => c.name);
  assert.deepEqual(cols, ['world_id', 'world_name', 'updated_at'], '失败退避列已删除');
  assert.equal(check.prepare('SELECT COUNT(*) c FROM world_cache').get().c, 1, '历史「未知世界」占位行被清掉');
  check.close();
  assert.equal(db.getWorldCache('wrld_ok').world_name, '真名字');
  assert.equal(db.getWorldCache('wrld_bad'), null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('好友/自己的 world_name 旧库迁移: 删列只留 world_id, 数据不丢', () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-mig2-'));
  const dbPath = path.join(dir, 'old.db');
  const raw = new DatabaseSync(dbPath);
  // 旧 schema: friends/users 都还带着 world_name 列
  raw.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, vrchat_user_id TEXT UNIQUE, username TEXT,
    saved_username TEXT, display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT, status TEXT,
    status_description TEXT, platform TEXT, state TEXT DEFAULT 'offline', world_id TEXT, world_name TEXT,
    last_seen INTEGER, remember_me INTEGER DEFAULT 0, cookie_data TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  raw.exec(`CREATE TABLE friends (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    friend_vrchat_id TEXT NOT NULL, display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT,
    state TEXT DEFAULT 'offline', status TEXT, world_id TEXT, world_name TEXT, instance_id TEXT,
    status_description TEXT, platform TEXT, trust_level TEXT, pending_state TEXT, pending_at INTEGER,
    last_seen INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, friend_vrchat_id))`);
  raw.exec("INSERT INTO users (vrchat_user_id, username, world_id, world_name) VALUES ('usr_me','me','wrld_self','自己的旧世界名')");
  raw.exec("INSERT INTO friends (user_id, friend_vrchat_id, world_id, world_name, state) VALUES (1,'usr_f1','wrld_a','好友的旧世界名','online')");
  raw.exec("INSERT INTO friends (user_id, friend_vrchat_id, world_id, world_name, state) VALUES (1,'usr_f2','private','私密世界','online')");
  raw.close();

  const db = createDb(dbPath);
  const check = new DatabaseSync(dbPath, { readOnly: true });
  assert.ok(!check.prepare('PRAGMA table_info(friends)').all().some((c) => c.name === 'world_name'),
    'friends.world_name 旧列已删除');
  assert.ok(!check.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'world_name'),
    'users.world_name 旧列已删除');
  check.close();

  // 数据不能丢: 好友数、world_id 都要在
  assert.equal(db.listFriends(1).length, 2, '好友记录保留');
  assert.equal(db.getFriend(1, 'usr_f1').world_id, 'wrld_a', '好友的 world_id 保留');
  assert.equal(db.getFriend(1, 'usr_f1').world_name, undefined, '列没了, 名字改由世界名缓存提供');
  assert.equal(db.getFriend(1, 'usr_f2').world_id, 'private', 'private 哨兵值原样保留');
  assert.equal(db.getUserByVrcId('usr_me').world_id, 'wrld_self', '自己的 world_id 保留');

  db.close();
  // 二次打开幂等(列已不存在, DROP 会抛错但被吞掉)
  const db2 = createDb(dbPath);
  assert.equal(db2.getFriend(1, 'usr_f1').world_id, 'wrld_a');
  db2.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('friends: instance_id 旧库迁移补列不报错', () => {
  // 模拟旧 schema: 先在文件库里建一张没有 instance_id 的 friends 表, 再让 createDb 迁移
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-')), 'old.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vrchat_user_id TEXT UNIQUE, username TEXT, saved_username TEXT,
      display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT, status TEXT, status_description TEXT,
      platform TEXT, state TEXT DEFAULT 'offline', world_id TEXT, world_name TEXT, last_seen INTEGER,
      remember_me INTEGER DEFAULT 0, cookie_data TEXT, password TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, friend_vrchat_id TEXT NOT NULL,
      display_name TEXT,
      state TEXT, status TEXT, world_id TEXT, world_name TEXT,
      status_description TEXT, platform TEXT, avatar_url TEXT, avatar_thumb_url TEXT,
      trust_level TEXT, pending_state TEXT, pending_at INTEGER,
      last_seen INTEGER, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, friend_vrchat_id)
    );
  `);
  legacy.exec(`INSERT INTO users (vrchat_user_id, username, display_name) VALUES ('usr_1', 'u1', 'n');
               INSERT INTO friends (user_id, friend_vrchat_id, state, status) VALUES (1, 'usr_f1', 'offline', 'active');`);
  legacy.close();
  const db = createDb(file);
  const uid = db.getUserByVrcId('usr_1').id;
  // 迁移后旧行可读, instance_id 为 null
  let f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.instance_id, null, '旧行 instance_id 为 null');
  // 迁移后可正常写入/更新
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F', state: 'online', instanceId: '1~region(us)' });
  f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.instance_id, '1~region(us)', '迁移后 instance_id 可写');
  db.close?.();
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

test('好友配置存在 friends 表里: 新好友默认全关, setFriendConfig 覆盖写入', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F1', state: 'online' });
  const fresh = db.getFriend(uid, 'usr_f1');
  // 语义与旧版一致: 没有配置就等于不通知(旧版是没有 monitor_config 行), 所以默认全是 0
  assert.equal(fresh.favorite, 0, '新好友默认不特别关注');
  assert.equal(fresh.notify_online, 0, '新好友默认不推上线');
  assert.equal(fresh.notify_offline, 0);
  assert.equal(fresh.notify_status_change, 0);
  assert.equal(fresh.notify_world_change, 0);
  db.setFriendConfig(uid, 'usr_f1', { favorite: true, notifyOnline: true, notifyOffline: false, notifyStatusChange: true, notifyWorldChange: false });
  const c = db.getFriend(uid, 'usr_f1');
  assert.equal(c.favorite, 1);
  assert.equal(c.notify_online, 1);
  assert.equal(c.notify_offline, 0);
  assert.equal(c.notify_status_change, 1);
  assert.equal(c.notify_world_change, 0);
});

test('setFriendConfig 只改配置列, 不碰好友资料', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F1', state: 'online', avatarUrl: 'https://a/1.png', trustLevel: 'Trusted' });
  db.setFriendConfig(uid, 'usr_f1', { favorite: true });
  const f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.display_name, 'F1');
  assert.equal(f.avatar_url, 'https://a/1.png');
  assert.equal(f.trust_level, 'Trusted');
  assert.equal(f.state, 'online');
});

test('快照 upsert 好友资料不会冲掉已设的通知配置', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F1', state: 'offline' });
  db.setFriendConfig(uid, 'usr_f1', { favorite: true, notifyOnline: true });
  // 模拟后续快照反复更新好友资料
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F1改名', state: 'online' });
  db.upsertFriend(uid, 'usr_f1', { displayName: 'F1再改名', state: 'offline' });
  const f = db.getFriend(uid, 'usr_f1');
  assert.equal(f.favorite, 1, '特别关注不能被快照冲掉');
  assert.equal(f.notify_online, 1, '通知开关不能被快照冲掉');
  assert.equal(f.display_name, 'F1再改名', '资料照常更新');
});

test('monitor_config 旧库迁移: 配置并进 friends, 旧表删除', () => {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, vrchat_user_id TEXT UNIQUE, username TEXT, saved_username TEXT, display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT, status TEXT, remember_me INTEGER DEFAULT 0, cookie_data TEXT, password TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));`);
  old.exec(`CREATE TABLE friends (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, friend_vrchat_id TEXT NOT NULL, display_name TEXT, state TEXT DEFAULT 'offline', status TEXT, world_id TEXT, instance_id TEXT, status_description TEXT, platform TEXT, avatar_url TEXT, avatar_thumb_url TEXT, trust_level TEXT, pending_state TEXT, pending_at INTEGER, last_seen INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, friend_vrchat_id));`);
  old.exec(`CREATE TABLE monitor_config (user_id INTEGER NOT NULL, friend_vrchat_id TEXT NOT NULL, favorite INTEGER DEFAULT 0, notify_online INTEGER DEFAULT 1, notify_offline INTEGER DEFAULT 1, notify_status_change INTEGER DEFAULT 1, notify_world_change INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (user_id, friend_vrchat_id));`);
  old.exec(`INSERT INTO users (vrchat_user_id, username, display_name) VALUES ('usr_me','me','我');`);
  old.exec(`INSERT INTO friends (user_id, friend_vrchat_id, display_name, state) VALUES (1,'usr_f1','F1','online'), (1,'usr_f2','F2','offline');`);
  // f1 有配置, f2 没有(旧语义: 不通知)
  old.exec(`INSERT INTO monitor_config (user_id, friend_vrchat_id, favorite, notify_online, notify_offline, notify_status_change, notify_world_change) VALUES (1,'usr_f1',1,1,0,1,0);`);
  old.close();

  const db = createDb(file);
  const f1 = db.getFriend(1, 'usr_f1');
  assert.equal(f1.favorite, 1, '旧配置的特别关注搬过来了');
  assert.equal(f1.notify_online, 1);
  assert.equal(f1.notify_offline, 0);
  assert.equal(f1.notify_status_change, 1);
  assert.equal(f1.notify_world_change, 0);
  const f2 = db.getFriend(1, 'usr_f2');
  assert.equal(f2.favorite, 0, '本来就没有配置的好友保持全关');
  assert.equal(f2.notify_online, 0, '旧语义是"无配置=不通知", 迁移后不能变成 1');

  const chk = new DatabaseSync(file);
  const tables = chk.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  chk.close();
  assert.ok(!tables.includes('monitor_config'), 'monitor_config 表已删除');
  db.close?.();
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
  // 失败不入库: 世界缓存只存成功解析到的名字, 表里已无失败退避列
  const c2 = db.getWorldCache('wrld_a');
  assert.equal(c2.fail_count, undefined, 'world_cache 已无 fail_count 列');
  assert.equal(c2.retry_at, undefined, 'world_cache 已无 retry_at 列');
  // 群组名保持原实现, 自己的失败退避列不受影响
  db.upsertGroupCache('grp_a', '群A', 3000, 2, 7000);
  const g = db.getGroupCache('grp_a');
  assert.equal(g.fail_count, 2);
  assert.equal(g.retry_at, 7000);
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
  // 仅 QQ 字段迁移到 settings; 已移除渠道的旧列直接删除不迁移
  assert.equal(g.qq_enabled, 1);
  assert.equal(g.qq_app_id, 'app1');
  assert.equal(g.qq_app_secret, 'sec1');
  assert.equal(g.email, undefined);
  assert.equal(g.smtp_enabled, undefined);
  // 旧通知列已从 users 表删除
  const chk = new DatabaseSync(file);
  const cols = chk.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  chk.close();
  assert.ok(!cols.includes('email'));
  assert.ok(!cols.includes('qq_enabled'));
  db.upsertQqBinding({ appId: 'app1', openid: 'openid_old', nickname: 'x', at: 1 });
  assert.equal(db.getQqBinding('app1').openid, 'openid_old');
});

// ---------- 数据加密 ----------
test('加密: 密码/cookie/AppSecret 落库为 v1: 密文, 读取还原明文', () => {
  const crypt = testCrypt();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-enc-'));
  try {
    const file = path.join(dir, 'enc.db');
    const db = createDb(file, { crypto: crypt });
    const id = db.upsertUser('usr_e', { username: 'u', displayName: 'E' });
    db.savePassword(id, 'my-vrc-password');
    db.saveCookies(id, 'cookie-serialized', 'u');
    db.updateGlobalSettings({ qq_app_secret: 'qq-secret-123' });
    // 同一实例(正确密钥)读取 → 明文
    const u = db.getUserByDbId(id);
    assert.equal(u.username, 'u');
    assert.equal(u.saved_username, 'u');
    assert.equal(u.password, 'my-vrc-password');
    assert.equal(u.cookie_data, 'cookie-serialized');
    assert.equal(db.getGlobalSettings().qq_app_secret, 'qq-secret-123');
    // 无 crypto 的实例直读同一库 → 落库形态必须是密文
    const plain = createDb(file);
    const raw = plain.getUserByDbId(id);
    assert.ok(String(raw.username).startsWith('v1:'), '用户名落库必须是 v1: 密文');
    assert.ok(String(raw.saved_username).startsWith('v1:'), '保存的用户名落库必须是 v1: 密文');
    assert.ok(String(raw.password).startsWith('v1:'), '密码落库必须是 v1: 密文');
    assert.ok(String(raw.cookie_data).startsWith('v1:'), 'cookie 落库必须是 v1: 密文');
    assert.ok(String(plain.getGlobalSettings().qq_app_secret).startsWith('v1:'), 'AppSecret 落库必须是 v1: 密文');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});

test('加密: 密钥不符时读取按未保存处理, 探测标记可解不可解', () => {
  const keyA = testCrypt();
  const keyB = testCrypt();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-enc2-'));
  try {
    const file = path.join(dir, 'enc.db');
    const dbA = createDb(file, { crypto: keyA });
    const id = dbA.upsertUser('usr_e3', { username: 'u3', displayName: 'E3' });
    dbA.savePassword(id, 'pw-a');
    dbA.updateGlobalSettings({ qq_app_secret: 'sec-a' });
    assert.equal(dbA.hasUndecryptableSensitive(), false, '正确密钥: 无可疑密文');
    // 换密钥: 读取为空, 探测为真(启动流程据此清库重启)
    const dbB = createDb(file, { crypto: keyB });
    assert.equal(dbB.hasUndecryptableSensitive(), true, '错误密钥: 探测到解不开的密文');
    assert.equal(dbB.getUserByDbId(id).password, null);
    assert.equal(dbB.getGlobalSettings().qq_app_secret, null);
    // 明文(无前缀)不影响探测
    dbB.upsertUser('usr_e4', { username: 'u4', displayName: 'E4' });
    assert.equal(dbB.hasUndecryptableSensitive(), true, '仍存在旧密文');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});

test('清库: wipeAllExceptToken 清空全部数据但保留 access_token', () => {
  // 这条同时守着 wipeAllExceptToken 里的表清单 —— 表被删掉后忘改清单会在这里炸
  const db = newDb({ crypto: testCrypt() });
  const id = db.upsertUser('usr_w', { username: 'w', displayName: 'W' });
  db.upsertFriend(id, 'usr_f', { displayName: 'F', state: 'online', trustLevel: 'User' });
  db.setFriendConfig(id, 'usr_f', { favorite: true });
  db.upsertQqBinding({ appId: 'a', openid: 'o', nickname: 'n', at: 1 });
  db.setSetting('access_token', 'tok-keep');
  db.setSetting('qq_enabled', '1');
  db.wipeAllExceptToken();
  assert.equal(db.listUsers().length, 0);
  assert.equal(db.listFriends(id).length, 0, '好友连配置一起清掉');
  assert.equal(db.getQqBinding('a'), null);
  assert.equal(db.getSetting('access_token'), 'tok-keep', '访问令牌保留');
  assert.equal(db.getSetting('qq_enabled'), null, '其余设置清空');
});

test('clearSettings: 清空全部设置与 QQ 绑定, 只保留访问令牌', () => {
  const db = newDb();
  db.setSetting('access_token', 'tok-keep');
  db.setSetting('qq_enabled', '1');
  db.updateGlobalSettings({ qq_app_id: 'app1', qq_app_secret: 'sec', notify_boop: 1 });
  db.upsertQqBinding({ appId: 'app1', openid: 'o1', nickname: 'n', at: 1 });
  db.clearSettings();
  assert.equal(db.getSetting('access_token'), 'tok-keep', '访问令牌保留');
  assert.equal(db.getSetting('qq_enabled'), null, 'QQ 开关清空');
  assert.equal(db.getSetting('qq_app_id'), null, 'QQ AppID 清空');
  assert.equal(db.getSetting('qq_app_secret'), null, 'QQ AppSecret 清空');
  assert.equal(db.getSetting('notify_boop'), null, '全局通知设置清空');
  assert.equal(db.getQqBinding('app1'), null, 'QQ 绑定清空');
});

test('qq_bindings: 按 appId 全局唯一, 同 app 覆盖更新', () => {
  const db = newDb();
  db.upsertQqBinding({ appId: 'app1', openid: 'o1', nickname: 'n1', at: 1 });
  db.upsertQqBinding({ appId: 'app2', openid: 'o2', nickname: 'n2', at: 2 });
  assert.equal(db.getQqBinding('app1').openid, 'o1');
  assert.equal(db.getQqBinding('app2').openid, 'o2', '不同 app 各一条');
  db.upsertQqBinding({ appId: 'app1', openid: 'o1b', nickname: 'n1b', at: 3 });
  assert.equal(db.getQqBinding('app1').openid, 'o1b', '同一 app 覆盖而不新增');
  assert.equal(db.getQqBinding('app1').nickname, 'n1b');
  assert.equal(db.getQqBinding('nope'), null);
});

test('qq_bindings 旧库迁移: 去掉 user_id, 绑定保留', () => {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE qq_bindings (
    user_id INTEGER NOT NULL, app_id TEXT NOT NULL, openid TEXT NOT NULL,
    nickname TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, app_id));`);
  old.exec("INSERT INTO qq_bindings (user_id, app_id, openid, nickname, updated_at) VALUES (7, 'app1', 'openid_old', '老王', 111)");
  // 同一个 app 在旧表里可能有多行(换过 VRC 账号各绑过一次), 新主键只有 app_id, 应保留最新的那条
  old.exec("INSERT INTO qq_bindings (user_id, app_id, openid, nickname, updated_at) VALUES (9, 'app1', 'openid_newer', '老王新', 222)");
  old.exec("INSERT INTO qq_bindings (user_id, app_id, openid, nickname, updated_at) VALUES (9, 'app2', 'openid_b', '另一个app', 5)");
  old.close();
  const db = createDb(file);
  assert.equal(db.getQqBinding('app1').openid, 'openid_newer', '同 app 多行时保留最新绑定');
  assert.equal(db.getQqBinding('app1').nickname, '老王新');
  assert.equal(db.getQqBinding('app2').openid, 'openid_b', '不同 app 各自保留');
  const chk = new DatabaseSync(file);
  const cols = chk.prepare('PRAGMA table_info(qq_bindings)').all().map((c) => c.name);
  chk.close();
  assert.ok(!cols.includes('user_id'), 'user_id 列已删除');
  db.close?.();
});
