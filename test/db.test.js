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
    username: 'u1', displayName: '我', avatarUrl: thumb,
    statusDescription: '摸鱼中', platform: 'standalonewindows'
  });
  let u = db.getUserByDbId(id);
  assert.equal(u.avatar_url, thumb);
  assert.ok(!('avatar_thumb_url' in u), '头像只有一个列');
  assert.equal(u.status_description, '摸鱼中');
  assert.equal(u.platform, 'standalonewindows');
  assert.equal(u.state, 'active', '新用户基线: 网页会话在线');

  // 资料更新: 缺失字段保留旧值
  db.updateSelfProfile(id, { displayName: '新名', avatarUrl: null });
  u = db.getUserByDbId(id);
  assert.equal(u.display_name, '新名');
  assert.equal(u.avatar_url, thumb, '空值不回退');

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
  const r1 = db.upsertFriend('usr_f1', { displayName: '朋友', state: 'online', status: 'active', worldId: 'wrld_a', worldName: 'A', platform: 'standalonewindows' });
  assert.equal(r1.isNew, true);
  const r2 = db.upsertFriend('usr_f1', { displayName: '朋友', state: 'offline', status: null, worldId: null, worldName: null });
  assert.equal(r2.isNew, false);
  assert.equal(r2.row.state, 'offline');
  assert.equal(db.listFriends().length, 1);
  const f = db.getFriend('usr_f1');
  assert.equal(f.world_name, undefined, 'friends 表已无 world_name 列');
  assert.equal(f.world_id, null);
  db.deleteFriend('usr_f1');
  assert.equal(db.listFriends().length, 0);
});

test('friends: instance_id 落库, 状态更新可清空/保留', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  // upsert 写入实例
  db.upsertFriend('usr_f1', { displayName: '朋友', state: 'online', worldId: 'wrld_a', worldName: 'A', instanceId: '1234~region(us)' });
  let f = db.getFriend('usr_f1');
  assert.equal(f.instance_id, '1234~region(us)', 'upsert 写入 instance_id');
  // 状态更新清空实例(下线)
  db.updateFriendState(f.id, { state: 'offline', world_id: null, world_name: null, instance_id: null });
  f = db.getFriend('usr_f1');
  assert.equal(f.state, 'offline');
  assert.equal(f.instance_id, null, '下线清空 instance_id');
  // 状态更新显式传实例 → 覆盖; 显式传 null → 清空(保留旧值由 monitor 层显式传入旧值实现)
  db.upsertFriend('usr_f2', { displayName: 'F2', state: 'online', worldId: 'wrld_b', worldName: 'B', instanceId: '99~region(jp)' });
  const f2 = db.getFriend('usr_f2');
  db.updateFriendState(f2.id, { state: 'online', world_id: 'wrld_b', world_name: 'B', instance_id: '88~region(us)' });
  assert.equal(db.getFriend('usr_f2').instance_id, '88~region(us)', '显式传入即覆盖');
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
  assert.equal(db.listFriends().length, 2, '好友记录保留');
  assert.equal(db.getFriend('usr_f1').world_id, 'wrld_a', '好友的 world_id 保留');
  assert.equal(db.getFriend('usr_f1').world_name, undefined, '列没了, 名字改由世界名缓存提供');
  assert.equal(db.getFriend('usr_f2').world_id, 'private', 'private 哨兵值原样保留');
  assert.equal(db.getUserByVrcId('usr_me').world_id, 'wrld_self', '自己的 world_id 保留');

  db.close();
  // 二次打开幂等(列已不存在, DROP 会抛错但被吞掉)
  const db2 = createDb(dbPath);
  assert.equal(db2.getFriend('usr_f1').world_id, 'wrld_a');
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
  let f = db.getFriend('usr_f1');
  assert.equal(f.instance_id, null, '旧行 instance_id 为 null');
  // 迁移后可正常写入/更新
  db.upsertFriend('usr_f1', { displayName: 'F', state: 'online', instanceId: '1~region(us)' });
  f = db.getFriend('usr_f1');
  assert.equal(f.instance_id, '1~region(us)', '迁移后 instance_id 可写');
  db.close?.();
});

test('friends 全局化: 好友方法不再带账号, 新库没有 user_id 列', () => {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-')), 'new.db');
  const db = createDb(file);
  db.upsertFriend('usr_f1', { displayName: 'F1', state: 'online' });
  assert.equal(db.getFriend('usr_f1').display_name, 'F1');
  assert.equal(db.listFriends().length, 1);
  db.setFriendConfig('usr_f1', { favorite: true, notifyOnline: true });
  assert.equal(db.getFriend('usr_f1').favorite, 1);
  db.deleteFriend('usr_f1');
  assert.equal(db.getFriend('usr_f1'), null);
  db.close?.();
  const chk = new DatabaseSync(file);
  const cols = chk.prepare('PRAGMA table_info(friends)').all().map((c) => c.name);
  chk.close();
  assert.ok(!cols.includes('user_id'), 'friends 表不再有 user_id');
});

test('friends 旧库迁移: 去掉 user_id, 好友与逐好友配置一起保留', () => {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, friend_vrchat_id TEXT NOT NULL,
    display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT, state TEXT DEFAULT 'offline', status TEXT,
    world_id TEXT, instance_id TEXT, status_description TEXT, platform TEXT, trust_level TEXT,
    pending_state TEXT, pending_at INTEGER, last_seen INTEGER,
    favorite INTEGER DEFAULT 0, notify_online INTEGER DEFAULT 0, notify_offline INTEGER DEFAULT 0,
    notify_status_change INTEGER DEFAULT 0, notify_world_change INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, friend_vrchat_id));`);
  old.exec("INSERT INTO friends (user_id, friend_vrchat_id, display_name, state, world_id, favorite, notify_online) VALUES (1,'usr_f1','F1','online','wrld_a',1,1)");
  old.exec("INSERT INTO friends (user_id, friend_vrchat_id, display_name, state) VALUES (1,'usr_f2','F2','offline')");
  // 旧表里同一个好友可能被两个账号各存一行: 迁移后只能留一条, 取最近更新的
  old.exec("INSERT INTO friends (user_id, friend_vrchat_id, display_name, state, updated_at) VALUES (2,'usr_f1','F1旧账号','offline','2000-01-01 00:00:00')");
  old.close();

  const db = createDb(file);
  assert.equal(db.listFriends().length, 2, '重复好友只保留一条');
  const f1 = db.getFriend('usr_f1');
  assert.equal(f1.display_name, 'F1', '保留最近更新的那条');
  assert.equal(f1.favorite, 1, '逐好友配置一起保留');
  assert.equal(f1.notify_online, 1);
  assert.equal(f1.world_id, 'wrld_a');
  assert.equal(db.getFriend('usr_f2').display_name, 'F2');
  const chk = new DatabaseSync(file);
  const cols = chk.prepare('PRAGMA table_info(friends)').all().map((c) => c.name);
  chk.close();
  assert.ok(!cols.includes('user_id'), 'user_id 已删除');
  db.close?.();
});

test('friends: 头像只有一个地址, 缩略图列已删除且传入被忽略', () => {
  const db = newDb();
  db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend('usr_f1', { displayName: 'F', avatarUrl: 'orig.png', avatarThumbUrl: 'thumb256.png' });
  let f = db.getFriend('usr_f1');
  assert.equal(f.avatar_url, 'orig.png');
  assert.ok(!('avatar_thumb_url' in f), '列已删除, 传 avatarThumbUrl 也不落库');
  db.updateFriendProfile(f.id, { avatarUrl: 'new.png' });
  f = db.getFriend('usr_f1');
  assert.equal(f.avatar_url, 'new.png');
  db.updateFriendProfile(f.id, { avatarUrl: null });
  f = db.getFriend('usr_f1');
  assert.equal(f.avatar_url, 'new.png', '空值不回退旧值');
});

test('好友配置存在 friends 表里: 新好友默认全关, setFriendConfig 覆盖写入', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend('usr_f1', { displayName: 'F1', state: 'online' });
  const fresh = db.getFriend('usr_f1');
  // 语义与旧版一致: 没有配置就等于不通知(旧版是没有 monitor_config 行), 所以默认全是 0
  assert.equal(fresh.favorite, 0, '新好友默认不特别关注');
  assert.equal(fresh.notify_online, 0, '新好友默认不推上线');
  assert.equal(fresh.notify_offline, 0);
  assert.equal(fresh.notify_status_change, 0);
  assert.equal(fresh.notify_world_change, 0);
  assert.equal(fresh.notify_web_online, 0, '新好友默认不推网页上线');
  db.setFriendConfig('usr_f1', { favorite: true, notifyOnline: true, notifyOffline: false, notifyStatusChange: true, notifyWorldChange: false, notifyWebOnline: true });
  const c = db.getFriend('usr_f1');
  assert.equal(c.favorite, 1);
  assert.equal(c.notify_online, 1);
  assert.equal(c.notify_offline, 0);
  assert.equal(c.notify_status_change, 1);
  assert.equal(c.notify_world_change, 0);
  assert.equal(c.notify_web_online, 1, '网页上线是独立开关, 能单独写入');
});

test('setFriendConfig 只改配置列, 不碰好友资料', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend('usr_f1', { displayName: 'F1', state: 'online', avatarUrl: 'https://a/1.png', trustLevel: 'Trusted' });
  db.setFriendConfig('usr_f1', { favorite: true });
  const f = db.getFriend('usr_f1');
  assert.equal(f.display_name, 'F1');
  assert.equal(f.avatar_url, 'https://a/1.png');
  assert.equal(f.trust_level, 'Trusted');
  assert.equal(f.state, 'online');
});

test('快照 upsert 好友资料不会冲掉已设的通知配置', () => {
  const db = newDb();
  const uid = db.upsertUser('usr_1', { username: 'u1', displayName: 'n', avatarUrl: null });
  db.upsertFriend('usr_f1', { displayName: 'F1', state: 'offline' });
  db.setFriendConfig('usr_f1', { favorite: true, notifyOnline: true });
  // 模拟后续快照反复更新好友资料
  db.upsertFriend('usr_f1', { displayName: 'F1改名', state: 'online' });
  db.upsertFriend('usr_f1', { displayName: 'F1再改名', state: 'offline' });
  const f = db.getFriend('usr_f1');
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
  const f1 = db.getFriend('usr_f1');
  assert.equal(f1.favorite, 1, '旧配置的特别关注搬过来了');
  assert.equal(f1.notify_online, 1);
  assert.equal(f1.notify_offline, 0);
  assert.equal(f1.notify_status_change, 1);
  assert.equal(f1.notify_world_change, 0);
  const f2 = db.getFriend('usr_f2');
  assert.equal(f2.favorite, 0, '本来就没有配置的好友保持全关');
  assert.equal(f2.notify_online, 0, '旧语义是"无配置=不通知", 迁移后不能变成 1');
  // 迁移前不存在的开关(网页上线): 老库升上来必须是关的, 而且不能因为 monitor_config 里
  // 没这一列就把搬迁整段搞崩(旧表补列后按默认 0 搬)
  assert.equal(f1.notify_web_online, 0, '旧库升级后"网页上线"保持关');
  assert.equal(f2.notify_web_online, 0);

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
  db.upsertFriend('usr_f', { displayName: 'F', state: 'online', trustLevel: 'User' });
  db.setFriendConfig('usr_f', { favorite: true });
  db.upsertQqBinding({ appId: 'a', openid: 'o', nickname: 'n', at: 1 });
  db.setSetting('access_token', 'tok-keep');
  db.setSetting('qq_enabled', '1');
  db.wipeAllExceptToken();
  assert.equal(db.listUsers().length, 0);
  assert.equal(db.listFriends().length, 0, '好友连配置一起清掉');
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

test('头像改由单一地址承载: 旧库的 avatar_thumb_url 列被删除, 数据不丢', () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-thumb-'));
  const dbPath = path.join(dir, 'old.db');
  const raw = new DatabaseSync(dbPath);
  // 旧 schema: friends/users 都还带着 avatar_thumb_url 列
  raw.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, vrchat_user_id TEXT UNIQUE, username TEXT,
    saved_username TEXT, display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT, status TEXT,
    status_description TEXT, platform TEXT, state TEXT DEFAULT 'offline', world_id TEXT,
    last_seen INTEGER, remember_me INTEGER DEFAULT 0, cookie_data TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  raw.exec(`CREATE TABLE friends (id INTEGER PRIMARY KEY AUTOINCREMENT, friend_vrchat_id TEXT NOT NULL,
    display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT,
    state TEXT DEFAULT 'offline', status TEXT, world_id TEXT, instance_id TEXT,
    status_description TEXT, platform TEXT, trust_level TEXT, pending_state TEXT, pending_at INTEGER,
    last_seen INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(friend_vrchat_id))`);
  raw.exec("INSERT INTO users (vrchat_user_id, username, display_name, avatar_url, avatar_thumb_url) VALUES ('usr_me','me','我','https://x/me-full.png','https://x/me-thumb.png')");
  raw.exec("INSERT INTO friends (friend_vrchat_id, display_name, avatar_url, avatar_thumb_url, state) VALUES ('usr_f1','朋友','https://x/f1-full.png','https://x/f1-thumb.png','online')");
  raw.close();

  const db = createDb(dbPath);
  const check = new DatabaseSync(dbPath, { readOnly: true });
  assert.ok(!check.prepare('PRAGMA table_info(friends)').all().some((c) => c.name === 'avatar_thumb_url'),
    'friends.avatar_thumb_url 旧列已删除');
  assert.ok(!check.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'avatar_thumb_url'),
    'users.avatar_thumb_url 旧列已删除');
  assert.equal(check.prepare('SELECT avatar_url FROM friends WHERE friend_vrchat_id = ?').get('usr_f1').avatar_url,
    'https://x/f1-full.png', '好友头像地址保留');
  assert.equal(check.prepare('SELECT avatar_url FROM users').get().avatar_url,
    'https://x/me-full.png', '自己的头像地址保留');
  check.close();
  assert.ok(db.getFriend('usr_f1'), '迁移后仍能按新 schema 读好友');
  assert.equal(db.getFriend('usr_f1').avatar_url, 'https://x/f1-full.png');
});

// ---------- 好友动态(friend_logs): 只增不改的历史流水 ----------

test('friend_logs: addFriendEvent 写入并返回整行', () => {
  const db = newDb();
  db.upsertFriend('usr_a', { displayName: '甲', avatarUrl: 'https://x/a.png' });
  const row = db.addFriendEvent({
    type: '切换世界', at: 1700000000000,
    friend_vrchat_id: 'usr_a', friend_name: '甲', friend_avatar: 'https://x/a.png',
    old_state: 'online', new_state: 'online',
    old_world_id: 'wrld_1', old_world_name: '世界一',
    world_id: 'wrld_2', world_name: '世界二'
  });
  assert.ok(row.id > 0, '返回带自增 id 的整行');
  assert.equal(row.type, '切换世界');
  assert.equal(row.at, 1700000000000);
  assert.equal(row.friend_vrchat_id, 'usr_a');
  assert.equal(row.friend_name, '甲');
  assert.equal(row.friend_avatar, 'https://x/a.png');
  assert.equal(row.old_world_name, '世界一');
  assert.equal(row.world_name, '世界二');
  assert.equal(row.title, null, '没传的列是 null');
  const again = db.listFriendEvents({ limit: 10 }).events;
  assert.equal(again.length, 1, '真的落库了');
  assert.equal(again[0].id, row.id);
});

test('friend_logs: 旧库打开自动建表(不需要迁移代码)', () => {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-ev-')), 'old.db');
  const raw = new DatabaseSync(file);
  // 旧库(真实老 schema): 只有好友表, 完全没有 friend_events
  raw.exec(`CREATE TABLE friends (id INTEGER PRIMARY KEY AUTOINCREMENT, friend_vrchat_id TEXT NOT NULL,
    display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT,
    state TEXT DEFAULT 'offline', status TEXT, world_id TEXT, instance_id TEXT,
    status_description TEXT, platform TEXT, trust_level TEXT, pending_state TEXT, pending_at INTEGER,
    last_seen INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(friend_vrchat_id))`);
  raw.exec("INSERT INTO friends (friend_vrchat_id, display_name) VALUES ('usr_f1','朋友')");
  raw.close();

  const db = createDb(file);
  const chk = new DatabaseSync(file, { readOnly: true });
  const has = chk.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='friend_logs'").all();
  chk.close();
  assert.equal(has.length, 1, '打开旧库就把表建出来');
  const row = db.addFriendEvent({ type: '上线', at: 5, friend_vrchat_id: 'usr_f1', friend_name: '朋友' });
  assert.ok(row.id > 0, '建完表立刻能写');
  assert.equal(db.listFriends().length, 1, '老数据不受影响');
  db.close();
});

test('friend_logs: 超过条数上限丢最旧(每次写入都裁)', () => {
  const db = newDb();
  for (let i = 1; i <= 5; i++) {
    db.addFriendEvent({ type: '上线', at: i, friend_vrchat_id: 'usr_a', friend_name: '甲' }, { limit: 3 });
  }
  const rows = db.listFriendEvents({ limit: 10 }).events;
  assert.equal(rows.length, 3, '只留最新 3 条');
  assert.deepEqual(rows.map((r) => r.at), [5, 4, 3], '留下的是最新的那些(倒序返回)');
});

test('friend_logs: 不传上限就不裁(交给调用方定策略)', () => {
  const db = newDb();
  for (let i = 1; i <= 5; i++) db.addFriendEvent({ type: '上线', at: i, friend_vrchat_id: 'usr_a' });
  assert.equal(db.listFriendEvents({ limit: 10 }).events.length, 5);
});

test('friend_logs: listFriendEvents 倒序 / before 游标 / types / friendId / q / hasMore', () => {
  const db = newDb();
  db.upsertFriend('usr_a', { displayName: '甲' });
  db.upsertFriend('usr_b', { displayName: '乙' });
  const a1 = db.addFriendEvent({ type: '上线', at: 1, friend_vrchat_id: 'usr_a', friend_name: '甲', world_id: 'wrld_1', world_name: '世界一' });
  const a2 = db.addFriendEvent({ type: '切换世界', at: 2, friend_vrchat_id: 'usr_a', friend_name: '甲', old_world_name: '世界一', world_id: 'wrld_2', world_name: '世界二' });
  const b1 = db.addFriendEvent({ type: '戳一戳', at: 3, friend_vrchat_id: 'usr_b', friend_name: '乙', title: '戳了你一下' });

  const first = db.listFriendEvents({ limit: 2 });
  assert.deepEqual(first.events.map((e) => e.id), [b1.id, a2.id], '按 id 倒序(最新在前)');
  assert.equal(first.hasMore, true, '还有更旧的');
  const second = db.listFriendEvents({ limit: 2, before: b1.id });
  assert.deepEqual(second.events.map((e) => e.id), [a2.id, a1.id]);
  assert.equal(second.hasMore, false, '到尾了');

  assert.deepEqual(db.listFriendEvents({ limit: 10, types: ['上线', '戳一戳'] }).events.map((e) => e.id), [b1.id, a1.id]);
  assert.deepEqual(db.listFriendEvents({ limit: 10, types: [] }).events, [], '空集合 = 什么都不要(不是不过滤)');
  assert.deepEqual(db.listFriendEvents({ limit: 10, friendId: 'usr_a' }).events.map((e) => e.id), [a2.id, a1.id]);
  assert.deepEqual(db.listFriendEvents({ limit: 10, q: '世界一' }).events.map((e) => e.id), [a1.id], 'q 匹配世界名');
  assert.deepEqual(db.listFriendEvents({ limit: 10, q: '乙' }).events.map((e) => e.id), [b1.id], 'q 匹配昵称');
  assert.deepEqual(db.listFriendEvents({ limit: 10, q: '戳了你' }).events.map((e) => e.id), [b1.id], 'q 匹配通知文案');
  assert.deepEqual(db.listFriendEvents({ limit: 10, q: '查无此人' }).events, []);
});

test('friend_logs: q 里的 % 与 _ 当普通字符(不当通配符)', () => {
  const db = newDb();
  db.upsertFriend('usr_a', { displayName: '100%猫' });
  db.upsertFriend('usr_b', { displayName: '100X猫' });
  db.upsertFriend('usr_c', { displayName: 'AB' });
  db.addFriendEvent({ type: '上线', at: 1, friend_vrchat_id: 'usr_a', friend_name: '100%猫' });
  db.addFriendEvent({ type: '上线', at: 2, friend_vrchat_id: 'usr_b', friend_name: '100X猫' });
  db.addFriendEvent({ type: '上线', at: 3, friend_vrchat_id: 'usr_c', friend_name: 'AB' });
  assert.deepEqual(db.listFriendEvents({ limit: 10, q: '100%' }).events.map((e) => e.at), [1], '% 不是通配符');
  assert.deepEqual(db.listFriendEvents({ limit: 10, q: 'A_' }).events, [], '_ 不是通配符');
});

test('friend_logs: 登出与清库都带走(与好友同一生命周期)', () => {
  const db = newDb();
  db.upsertFriend('usr_a', { displayName: '甲' });
  db.addFriendEvent({ type: '上线', at: 1, friend_vrchat_id: 'usr_a', friend_name: '甲' });
  const cleared = db.clearAccountData();
  assert.equal(cleared.events, 1, 'clearAccountData 报告清了 1 条');
  assert.equal(db.listFriendEvents({ limit: 10 }).events.length, 0);

  db.addFriendEvent({ type: '上线', at: 2, friend_vrchat_id: 'usr_a', friend_name: '甲' });
  db.wipeAllExceptToken();
  assert.equal(db.listFriendEvents({ limit: 10 }).events.length, 0, 'wipeAllExceptToken 也清');

  db.addFriendEvent({ type: '上线', at: 3, friend_vrchat_id: 'usr_a', friend_name: '甲' });
  db.clearSettings();
  assert.equal(db.listFriendEvents({ limit: 10 }).events.length, 1, 'clearSettings 只动设置, 不动动态');
  assert.equal(db.clearFriendEvents(), 1, '手动清空返回条数');
  assert.equal(db.listFriendEvents({ limit: 10 }).events.length, 0);
});

test('friend_logs: 早期写入的 "web端上线" 开库时统一改名成界面用的 "网页上线"', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-db-ev2-')), 'old.db');
  const db1 = createDb(file);
  db1.addFriendEvent({ type: 'web端上线', at: 1, friend_vrchat_id: 'usr_a', friend_name: '甲' });
  db1.addFriendEvent({ type: '上线', at: 2, friend_vrchat_id: 'usr_a', friend_name: '甲' });
  db1.close();

  const db2 = createDb(file); // 开库时的迁移
  const rows = db2.listFriendEvents({ limit: 10 }).events;
  assert.deepEqual(rows.map((r) => r.type), ['上线', '网页上线'], '老行改名, 其它类型不动');
  db2.close();
});

test('friend_logs: 按页取(total/offset) —— 分页栏要的"共 N 条"和"跳到第 K 页"', () => {
  const db = newDb();
  db.upsertFriend('usr_a', { displayName: '甲' });
  for (let i = 1; i <= 12; i++) db.addFriendEvent({ type: i % 2 ? '上线' : '下线', at: i, friend_vrchat_id: 'usr_a', friend_name: '甲' });

  const p1 = db.listFriendEvents({ limit: 5, page: 1 });
  assert.equal(p1.total, 12, '总数按筛选后的条数算');
  assert.equal(p1.events.length, 5);
  assert.equal(p1.hasMore, true);
  assert.deepEqual(p1.events.map((e) => e.at), [12, 11, 10, 9, 8]);

  const p2 = db.listFriendEvents({ limit: 5, page: 2 });
  assert.deepEqual(p2.events.map((e) => e.at), [7, 6, 5, 4, 3]);
  assert.equal(p2.hasMore, true);

  const p3 = db.listFriendEvents({ limit: 5, page: 3 });
  assert.deepEqual(p3.events.map((e) => e.at), [2, 1], '最后一页不满也照给');
  assert.equal(p3.hasMore, false);

  assert.deepEqual(db.listFriendEvents({ limit: 5, page: 9 }).events, [], '越界页给空');
  // 筛选与总数一起考虑
  const only = db.listFriendEvents({ limit: 5, page: 1, types: ['上线'] });
  assert.equal(only.total, 6);
  assert.ok(only.events.every((e) => e.type === '上线'));
  // q 也参与总数
  assert.equal(db.listFriendEvents({ limit: 5, q: '甲' }).total, 12);
  assert.equal(db.listFriendEvents({ limit: 5, q: '没人' }).total, 0);
});

test('friend_logs: order 支持最早在前(表头点一下反转)', () => {
  const db = newDb();
  for (let i = 1; i <= 4; i++) db.addFriendEvent({ type: '上线', at: i, friend_vrchat_id: 'usr_a', friend_name: '甲' });
  assert.deepEqual(db.listFriendEvents({ limit: 10 }).events.map((e) => e.at), [4, 3, 2, 1], '默认最新在前');
  assert.deepEqual(db.listFriendEvents({ limit: 10, order: 'asc' }).events.map((e) => e.at), [1, 2, 3, 4], 'asc = 最早在前');
  const p2 = db.listFriendEvents({ limit: 2, page: 2, order: 'asc' });
  assert.deepEqual(p2.events.map((e) => e.at), [3, 4], '排序与分页能一起用');
  assert.equal(p2.total, 4);
});

test('friend_logs: 完整位置持久化，昵称读取当前好友资料而非事件快照', () => {
  const db = newDb();
  db.upsertFriend('usr_a', { displayName: '当前昵称', avatarUrl: 'https://current' });
  const row = db.addFriendEvent({
    at: 1792252800123, type: '切换世界', friend_vrchat_id: 'usr_a',
    old_location: 'wrld_a:12~friends(usr_host)~region(jp)',
    location: 'wrld_a:34~private(usr_host)~canRequestInvite~region(us)',
    friend_name: '不应保存的昵称', friend_avatar: 'https://obsolete'
  });
  assert.equal(row.location, 'wrld_a:34~private(usr_host)~canRequestInvite~region(us)');
  assert.equal(row.old_instance_id, '12~friends(usr_host)~region(jp)');
  assert.equal(row.instance_id, '34~private(usr_host)~canRequestInvite~region(us)');
  assert.equal(row.at, 1792252800123);
  db.updateFriendProfile(db.getFriend('usr_a').id, { displayName: '改名后' });
  const read = db.listFriendEvents().events[0];
  assert.equal(read.friend_name, '改名后');
  assert.equal(read.friend_avatar, 'https://current');
  assert.equal(db.listFriendEvents({ q: '不应保存的昵称' }).total, 0);
  assert.equal(db.listFriendEvents({ q: '改名后' }).total, 1);
  db.deleteFriend('usr_a');
  assert.equal(db.listFriendEvents().events[0].friend_name, 'usr_a');
  db.close();
});

test('friend_logs: 旧宽表迁移保留历史和游标，毫秒时间戳和无昵称结构可重开', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-event-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'old.db');
  const raw = new DatabaseSync(file);
  raw.exec(`CREATE TABLE friend_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, type TEXT NOT NULL,
    friend_vrchat_id TEXT,friend_name TEXT,friend_avatar TEXT,old_name TEXT,old_trust TEXT,new_trust TEXT,
    old_state TEXT,new_state TEXT,old_status TEXT,new_status TEXT,old_desc TEXT,new_desc TEXT,
    old_world_id TEXT,old_world_name TEXT,world_id TEXT,world_name TEXT,title TEXT,body TEXT);
    INSERT INTO friend_events(id,at,type,friend_name) VALUES(99,1792252800123,'上线','旧昵称');
    DELETE FROM friend_events;
    INSERT INTO friend_events(id,at,type,friend_vrchat_id,friend_name,old_state,new_state)
      VALUES(7,1792252800001,'web端上线','usr_a','不保存的旧名','offline','active');
    INSERT INTO friend_events(id,at,type,friend_vrchat_id,old_world_id,old_world_name,world_id,world_name)
      VALUES(8,1792252800002,'切换世界','usr_a','wrld_a','世界 A','wrld_b','世界 B');
    INSERT INTO friend_events(id,at,type,friend_vrchat_id,old_status,new_status,old_desc,new_desc)
      VALUES(9,1792252800003,'状态变化','usr_a','active','busy','旧签名','新签名');
    INSERT INTO friend_events(id,at,type,title,body)
      VALUES(10,1792252800004,'群组公告','旧公告','旧内容');`);
  raw.close();
  let db = createDb(file);
  const migrated = db.listFriendEvents({ order: 'asc' }).events;
  assert.deepEqual(migrated.map((r) => r.id), [7, 8, 9, 10]);
  assert.deepEqual(migrated.map((r) => r.type), ['网页上线', '切换世界', '状态变化', '群组公告']);
  assert.equal(migrated[0].at, 1792252800001);
  assert.equal(migrated[0].new_state, 'active');
  assert.equal(migrated[0].friend_name, 'usr_a', '旧昵称不搬入日志');
  assert.equal(migrated[1].source, 'legacy');
  assert.equal(migrated[1].old_location, 'wrld_a');
  assert.equal(migrated[1].location, 'wrld_b');
  assert.equal(migrated[1].instance_id, null, '历史没有实例号就保留未知');
  assert.equal(migrated[1].world_name, '世界 B', '已有世界名迁入共享缓存');
  assert.equal(migrated[2].old_status, 'active');
  assert.equal(migrated[2].new_status, 'busy');
  assert.equal(migrated[2].new_desc, '新签名');
  assert.equal(migrated[3].title, '旧公告');
  assert.equal(migrated[3].body, '旧内容');
  const row = db.addFriendEvent({ at: 1792252800456, type: '上线', friend_vrchat_id: 'usr_a', new_state: 'online' });
  assert.ok(row.id > 99, '迁移保留已删除行的 ID 高水位，客户端旧游标不会碰撞');
  db.close();
  db = createDb(file);
  assert.equal(db.listFriendEvents().events[0].at, 1792252800456);
  assert.equal(db.listFriendEvents().events[0].new_state, 'online');
  assert.equal(db.listFriendEvents().total, 5);
  db.close();
  const check = new DatabaseSync(file, { readOnly: true });
  try {
    for (const name of ['friend_logs','friend_log_location','friend_log_presence','friend_log_status','friend_log_notifications']) {
      const cols = check.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
      assert.ok(!cols.some((c) => /name|avatar/.test(c)), name + ' 不保存名字或头像');
    }
    assert.equal(check.prepare('SELECT typeof(at) AS t FROM friend_logs').get().t, 'integer');
    assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { check.close(); }
});

test('friend_logs: 通知去重跨重开，清空与裁剪同时释放对应通知记录', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-event-notif-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'events.db');
  let db = createDb(file);
  const first = db.addFriendEvent({ type: '世界邀请', at: 10, notification_id: 'n_one', location: 'wrld_a:1~region(jp)' });
  db.close();
  db = createDb(file);
  assert.equal(db.addFriendEvent({ type: '世界邀请', at: 60010, notification_id: 'n_one' }), null);
  assert.equal(db.listFriendEvents().total, 1);
  db.addFriendEvent({ type: '状态变化', at: 20, old_status: 'active', new_status: 'busy' }, { limit: 1 });
  assert.equal(db.listFriendEvents().total, 1);
  const replay = db.addFriendEvent({ type: '世界邀请', at: 30, notification_id: 'n_one' });
  assert.ok(replay.id > first.id, '旧历史被裁剪后可重新记录通知');
  assert.equal(db.clearFriendEvents(), 2);
  assert.ok(db.addFriendEvent({ type: '世界邀请', at: 40, notification_id: 'n_one' }));
  db.close();
});

for (const alreadyRenamed of [false, true]) {
  test(`friend_logs: ${alreadyRenamed ? '已改名的' : '旧表名的'}分类日志拆分位置后保留内容、外键、去重和游标`, (t) => {
    const { DatabaseSync } = require('node:sqlite');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-log-rename-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'old.db');
    const raw = new DatabaseSync(file);
    raw.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE friend_events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, type TEXT NOT NULL,
        friend_vrchat_id TEXT, source TEXT NOT NULL DEFAULT 'ws', old_location TEXT, location TEXT);
      CREATE INDEX idx_friend_events_at ON friend_events(at DESC);
      CREATE INDEX idx_friend_events_friend ON friend_events(friend_vrchat_id,id DESC);
      CREATE TABLE friend_event_presence(event_id INTEGER PRIMARY KEY REFERENCES friend_events(id) ON DELETE CASCADE,old_state TEXT,new_state TEXT);
      CREATE TABLE friend_event_status(event_id INTEGER PRIMARY KEY REFERENCES friend_events(id) ON DELETE CASCADE,old_status TEXT,new_status TEXT,old_desc TEXT,new_desc TEXT);
      CREATE TABLE friend_event_notifications(event_id INTEGER PRIMARY KEY REFERENCES friend_events(id) ON DELETE CASCADE,notification_id TEXT UNIQUE,group_id TEXT,title TEXT,body TEXT);
      INSERT INTO friend_events VALUES(10,1792252800001,'上线','usr_a','ws',NULL,'wrld_a:1');
      INSERT INTO friend_event_presence VALUES(10,'offline','online');
      INSERT INTO friend_events VALUES(20,1792252800002,'状态变化','usr_a','ws','wrld_a:1','wrld_a:1');
      INSERT INTO friend_event_status VALUES(20,'active','busy','旧签名','新签名');
      INSERT INTO friend_events VALUES(30,1792252800003,'切换世界','usr_a','ws','wrld_a:1','wrld_a:2~region(jp)');
      INSERT INTO friend_events VALUES(40,1792252800004,'世界邀请','usr_a','ws',NULL,'wrld_b:3');
      INSERT INTO friend_event_notifications VALUES(40,'n_saved',NULL,'邀请','一起来');
      INSERT INTO friend_events(id,at,type) VALUES(99,1792252800005,'上线');
      DELETE FROM friend_events WHERE id=99;`);
    if (alreadyRenamed) raw.exec(`
      ALTER TABLE friend_events RENAME TO friend_logs;
      ALTER TABLE friend_event_presence RENAME TO friend_log_presence;
      ALTER TABLE friend_event_status RENAME TO friend_log_status;
      ALTER TABLE friend_event_notifications RENAME TO friend_log_notifications;
      DROP INDEX idx_friend_events_at;
      DROP INDEX idx_friend_events_friend;
      CREATE INDEX idx_friend_logs_at ON friend_logs(at DESC);
      CREATE INDEX idx_friend_logs_friend ON friend_logs(friend_vrchat_id,id DESC);`);
    raw.close();
    let db = createDb(file);
    const rows = db.listFriendEvents({ order: 'asc' }).events;
    assert.deepEqual(rows.map((r) => r.id), [10,20,30,40]);
    assert.equal(rows[0].new_state, 'online');
    assert.equal(rows[0].location, 'wrld_a:1');
    assert.equal(rows[1].new_desc, '新签名');
    assert.equal(rows[1].old_location, null, '状态记录不再保留旧位置');
    assert.equal(rows[1].location, null, '状态记录不再保留位置');
    assert.equal(rows[2].location, 'wrld_a:2~region(jp)');
    assert.equal(rows[3].notification_id, 'n_saved');
    assert.equal(rows[3].location, 'wrld_b:3');
    assert.equal(rows[3].body, '一起来');
    assert.equal(db.addFriendEvent({ type: '世界邀请', notification_id: 'n_saved' }), null);
    assert.ok(db.addFriendEvent({ type: '上线' }).id > 99);
    db.close();
    const check = new DatabaseSync(file, { readOnly: true });
    try {
      const names = check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
      for (const name of ['friend_logs','friend_log_location','friend_log_presence','friend_log_status','friend_log_notifications']) assert.ok(names.includes(name), name + ' 应存在');
      for (const name of ['friend_events','friend_event_presence','friend_event_status','friend_event_notifications']) assert.ok(!names.includes(name), name + ' 应完成改名');
      assert.deepEqual(check.prepare('PRAGMA table_info(friend_logs)').all().map((c) => c.name),
        ['id','at','type','friend_vrchat_id','source']);
      assert.equal(check.prepare('SELECT COUNT(*) AS n FROM friend_log_location').get().n, 1, '只有位置变化进入位置表');
      assert.equal(check.prepare('SELECT event_id FROM friend_log_location').get().event_id, 30);
      assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { check.close(); }
    db = createDb(file);
    assert.equal(db.clearFriendEvents(), 5);
    assert.ok(db.addFriendEvent({ type: '世界邀请', notification_id: 'n_saved' }), '清空时分类表应级联清理');
    db.close();
  });
}

test('friend_logs: 公共流水只存公共字段，位置变化独立保存且清空时级联删除', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-log-location-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'logs.db');
  const db = createDb(file);
  const row = db.addFriendEvent({ type: '切换世界', at: 1792252800123, friend_vrchat_id: 'usr_a',
    old_location: 'wrld_a:1~region(jp)', location: 'wrld_a:2~friends(usr_host)~region(us)' });
  assert.equal(db.listFriendEvents({ types: ['切换世界'] }).events[0].location, 'wrld_a:2~friends(usr_host)~region(us)');
  let check = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual(check.prepare('PRAGMA table_info(friend_logs)').all().map((c) => c.name),
      ['id','at','type','friend_vrchat_id','source']);
    const position = check.prepare('SELECT * FROM friend_log_location').get();
    assert.equal(position.event_id, row.id);
    assert.equal(position.old_location, 'wrld_a:1~region(jp)');
    assert.equal(position.location, 'wrld_a:2~friends(usr_host)~region(us)');
  } finally { check.close(); }
  assert.equal(db.clearFriendEvents(), 1);
  check = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM friend_log_location').get().n, 0);
    assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { check.close(); db.close(); }
});

test('friend_logs: 类型使用英文代码入库，中英文筛选兼容且业务文本保留原文', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-log-types-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'logs.db');
  const db = createDb(file);
  const types = [
    ['上线','friend_online'], ['下线','friend_offline'],
    ['网页上线','friend_web_online'], ['网页下线','friend_web_offline'],
    ['状态变化','status_change'], ['自定义状态','status_description_change'],
    ['切换世界','location_change'], ['群组公告','group_announcement'],
    ['戳一戳','boop'], ['世界邀请','invite'], ['请求邀请','request_invite']
  ];
  for (const [label,code] of types) {
    const row = db.addFriendEvent({ type: label, title: '中文公告标题', body: '中文通知正文',
      old_desc: '旧中文签名', new_desc: '新中文签名', location: 'wrld_a:1' });
    assert.equal(row.type, label, '原接口继续返回原有中文展示值');
    assert.equal(db.listFriendEvents({ types: [code] }).events[0]?.id, row.id, '可用英文代码筛选');
  }
  const check = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual(check.prepare('SELECT type FROM friend_logs ORDER BY id').all().map((r) => r.type), types.map(([,code]) => code));
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM friend_log_presence').get().n, 4);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM friend_log_status').get().n, 2);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM friend_log_location').get().n, 1);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM friend_log_notifications').get().n, 4);
    assert.equal(check.prepare('SELECT new_desc FROM friend_log_status LIMIT 1').get().new_desc, '新中文签名');
    assert.equal(check.prepare('SELECT body FROM friend_log_notifications LIMIT 1').get().body, '中文通知正文');
  } finally { check.close(); db.close(); }
});

test('friend_logs: 旧中文类型迁移成英文，重复启动及既有正文和 ID 不受影响', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-log-type-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'logs.db');
  let db = createDb(file);
  const gps = db.addFriendEvent({ type: '切换世界', at: 1792252800001, old_location: 'wrld_a:1', location: 'wrld_a:2' });
  const notice = db.addFriendEvent({ type: '群组公告', at: 1792252800002, notification_id: 'n_saved', body: '原始中文内容' });
  db.close();
  const raw = new DatabaseSync(file);
  raw.prepare('UPDATE friend_logs SET type=? WHERE id=?').run('切换世界', gps.id);
  raw.prepare('UPDATE friend_logs SET type=? WHERE id=?').run('群组公告', notice.id);
  raw.close();
  for (let i=0;i<2;i++) {
    db = createDb(file);
    assert.equal(db.listFriendEvents({ types: ['切换世界'] }).events[0].id, gps.id);
    const notification = db.listFriendEvents({ types: ['group_announcement'] }).events[0];
    assert.equal(notification.id, notice.id);
    assert.equal(notification.at, 1792252800002);
    assert.equal(notification.body, '原始中文内容');
    assert.equal(db.addFriendEvent({ type: 'group_announcement', notification_id: 'n_saved' }), null);
    db.close();
  }
  const check = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual(check.prepare('SELECT type FROM friend_logs ORDER BY id').all().map((r) => r.type), ['location_change','group_announcement']);
    assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { check.close(); }
});

test('friend_logs: 只保留各类业务必需的位置列，下线仍能读到最后实例', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-log-trim-columns-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'logs.db');
  const db = createDb(file);
  const offline = db.addFriendEvent({ type: 'friend_offline', old_state: 'online', new_state: 'offline', old_location: 'wrld_a:1~region(jp)', location: null });
  assert.equal(offline.old_location, 'wrld_a:1~region(jp)');
  assert.equal(offline.location, null);
  const social = db.addFriendEvent({ type: 'status_change', old_status: 'active', new_status: 'busy', old_location: 'wrld_a:1', location: 'wrld_a:2' });
  const invite = db.addFriendEvent({ type: 'invite', notification_id: 'n_one', old_location: 'wrld_a:1', location: 'wrld_b:3~region(us)' });
  const check = new DatabaseSync(file, { readOnly: true });
  try {
    const expected = {
      friend_logs: ['id','at','type','friend_vrchat_id','source'],
      friend_log_location: ['event_id','old_location','location'],
      friend_log_presence: ['event_id','old_state','new_state','location'],
      friend_log_status: ['event_id','old_status','new_status','old_desc','new_desc'],
      friend_log_notifications: ['event_id','notification_id','group_id','title','body','location']
    };
    for (const [table,cols] of Object.entries(expected)) {
      assert.deepEqual(check.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name), cols, table);
    }
    assert.equal(check.prepare('SELECT location FROM friend_log_presence WHERE event_id=?').get(offline.id).location, 'wrld_a:1~region(jp)');
    assert.equal(check.prepare('SELECT location FROM friend_log_notifications WHERE event_id=?').get(invite.id).location, 'wrld_b:3~region(us)');
    assert.equal(social.location, null);
    assert.equal(social.old_location, null);
    assert.equal(invite.old_location, null);
    assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { check.close(); db.close(); }
});

test('friend_logs: 删掉历史多余位置列时保留下线前实例和邀请目标，重复启动稳定', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcnt-log-context-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'logs.db');
  let db = createDb(file);
  const down = db.addFriendEvent({ type: 'friend_offline', at: 10, old_state: 'online', new_state: 'offline' });
  const status = db.addFriendEvent({ type: 'status_change', at: 20, old_status: 'active', new_status: 'busy', new_desc: '保留签名' });
  const invite = db.addFriendEvent({ type: 'invite', at: 30, notification_id: 'n_saved', location: 'wrld_b:2~region(jp)', body: '保留通知' });
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec(`ALTER TABLE friend_log_presence ADD COLUMN old_location TEXT;
    ALTER TABLE friend_log_status ADD COLUMN old_location TEXT;
    ALTER TABLE friend_log_status ADD COLUMN location TEXT;
    ALTER TABLE friend_log_notifications ADD COLUMN old_location TEXT;`);
  raw.prepare('UPDATE friend_log_presence SET old_location=? WHERE event_id=?').run('wrld_a:1~region(us)', down.id);
  raw.prepare('UPDATE friend_log_status SET old_location=?,location=? WHERE event_id=?').run('wrld_a:1','wrld_a:2',status.id);
  raw.prepare('UPDATE friend_log_notifications SET old_location=? WHERE event_id=?').run('wrld_old:9', invite.id);
  raw.close();
  for (let i=0;i<2;i++) {
    db = createDb(file);
    const rows = db.listFriendEvents({ order: 'asc' }).events;
    assert.deepEqual(rows.map((r) => r.id), [down.id,status.id,invite.id]);
    assert.equal(rows[0].old_location, 'wrld_a:1~region(us)');
    assert.equal(rows[0].location, null);
    assert.equal(rows[1].old_location, null);
    assert.equal(rows[1].location, null);
    assert.equal(rows[1].new_desc, '保留签名');
    assert.equal(rows[2].old_location, null);
    assert.equal(rows[2].location, 'wrld_b:2~region(jp)');
    assert.equal(rows[2].body, '保留通知');
    assert.equal(db.addFriendEvent({ type: 'invite', notification_id: 'n_saved' }), null);
    db.close();
  }
  const check = new DatabaseSync(file, { readOnly: true });
  try {
    for (const table of ['friend_log_presence','friend_log_status','friend_log_notifications']) {
      const columns = check.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      assert.ok(!columns.includes('old_location'));
      if (table === 'friend_log_status') assert.ok(!columns.includes('location'));
    }
    assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { check.close(); }
});
