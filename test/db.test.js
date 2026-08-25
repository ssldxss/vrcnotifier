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
  assert.equal(u.world_name, 'X世界');
  assert.equal(u.status_description, '开黑');
  assert.equal(u.platform, 'android');
  assert.equal(u.last_seen, 123);

  // 再次 upsert 资料不改 presence
  db.upsertUser('usr_1', { username: 'u1', displayName: '新名', avatarUrl: null });
  u = db.getUserByDbId(id);
  assert.equal(u.state, 'online');
  assert.equal(u.world_id, 'wrld_x');
  assert.equal(u.world_name, 'X世界');
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
  const id = db.getUserByVrcId('usr_old').id;
  db.upsertQqBinding(id, { appId: 'app1', openid: 'openid_old', nickname: 'x', at: 1 });
  assert.equal(db.getQqBinding(id, 'app1').openid, 'openid_old');
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
  const db = newDb({ crypto: testCrypt() });
  const id = db.upsertUser('usr_w', { username: 'w', displayName: 'W' });
  db.upsertFriend(id, 'usr_f', { displayName: 'F', state: 'online', trustLevel: 'User' });
  db.upsertConfig(id, 'usr_f', {});
  db.upsertQqBinding(id, { appId: 'a', openid: 'o', nickname: 'n', at: 1 });
  db.setSetting('access_token', 'tok-keep');
  db.setSetting('qq_enabled', '1');
  db.wipeAllExceptToken();
  assert.equal(db.listUsers().length, 0);
  assert.equal(db.listFriends(id).length, 0);
  assert.equal(db.listConfigs(id).length, 0);
  assert.equal(db.getQqBinding(id, 'a'), null);
  assert.equal(db.getSetting('access_token'), 'tok-keep', '访问令牌保留');
  assert.equal(db.getSetting('qq_enabled'), null, '其余设置清空');
});
