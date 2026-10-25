'use strict';
const { FRIEND_CONFIG, SETTINGS } = require('../public/contracts');
const { migrateFriendEvents, SCHEMA: FRIEND_EVENT_SCHEMA } = require('./friend-event-migration');
const FRIEND_CONFIG_COLS = FRIEND_CONFIG.map(([key]) => key);
const SETTING_COLUMNS = Object.fromEntries(SETTINGS.map(([key, , type]) => [key, type === 'string' ? 'str' : 'int']));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vrchat_user_id TEXT UNIQUE,
  username TEXT,
  saved_username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT,
  status_description TEXT,
  platform TEXT,
  state TEXT DEFAULT 'offline',
  world_id TEXT,
  last_seen INTEGER,
  remember_me INTEGER DEFAULT 0,
  cookie_data TEXT,
  password TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
-- 好友是全局的(同时只有一个 VRC 账号在跑): 不带账号列, 一人一行
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  friend_vrchat_id TEXT NOT NULL,
  display_name TEXT, avatar_url TEXT,
  state TEXT DEFAULT 'offline',
  status TEXT,
  world_id TEXT, instance_id TEXT,
  status_description TEXT,
  platform TEXT,
  trust_level TEXT,
  pending_state TEXT, pending_at INTEGER,
  last_seen INTEGER,
  -- 逐好友的通知配置(原先在独立的 monitor_config 表, 现在与好友同生共死): 默认全 0 = 不通知
  favorite INTEGER DEFAULT 0,
  notify_online INTEGER DEFAULT 0,
  notify_web_online INTEGER DEFAULT 0,
  notify_offline INTEGER DEFAULT 0,
  notify_status_change INTEGER DEFAULT 0,
  notify_world_change INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(friend_vrchat_id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS notif_dedupe (key TEXT PRIMARY KEY, created_at INTEGER);
CREATE TABLE IF NOT EXISTS qq_bindings (
  app_id TEXT PRIMARY KEY,
  openid TEXT NOT NULL,
  nickname TEXT,
  updated_at INTEGER NOT NULL
);
-- 只存成功解析到的名字(查询失败不入库, 失败冷却记在内存里)
CREATE TABLE IF NOT EXISTS world_cache (
  world_id TEXT PRIMARY KEY,
  world_name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_cache (
  group_id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0
);
`;

// 已移除渠道的历史通知列(仅旧库 users 表迁移/删除用, 与当前白名单分离)
const LEGACY_NOTIFY_COLUMNS = [
  'email', 'smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass',
  'email_subject_template', 'email_body_template',
  'gotify_enabled', 'gotify_server_url', 'gotify_app_token', 'gotify_priority',
  'ntfy_enabled', 'ntfy_server_url', 'ntfy_topic', 'ntfy_priority',
  'webhook_enabled', 'webhook_url', 'webhook_method', 'webhook_headers',
  'webhook_body_template', 'webhook_content_type',
  'qq_enabled', 'qq_app_id', 'qq_app_secret'
];

function migrateLegacyCore(db) {
  db.exec(SCHEMA);
  function execColumn(sql) {
    const [, table, action, column] = /^ALTER TABLE (\w+) (ADD|DROP) COLUMN (\w+)/.exec(sql);
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if ((action === 'ADD' && !exists) || (action === 'DROP' && exists)) db.exec(sql);
  }
  // 头像只保留一个地址(见 util.avatarFields): 删除历史的缩略图列
  execColumn('ALTER TABLE friends DROP COLUMN avatar_thumb_url');
  execColumn('ALTER TABLE users DROP COLUMN avatar_thumb_url');
  // 旧库清理: 世界名查询失败不再入库, 失败退避列已无意义(群组名有自己的 group_cache 列, 不受影响)
  execColumn('ALTER TABLE world_cache DROP COLUMN fail_count');
  execColumn('ALTER TABLE world_cache DROP COLUMN retry_at');
  // 逐好友通知配置并入 friends(原先在独立的 monitor_config 表): 先给 friends 补列, 再把旧表数据搬过来, 最后删表。
  // 旧语义是「没有配置行 = 不通知」, 所以补列默认 0, 只有真正有配置行的好友才会被搬成 1。
  for (const col of FRIEND_CONFIG_COLS) {
    execColumn(`ALTER TABLE friends ADD COLUMN ${col} INTEGER DEFAULT 0`);
  }
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_config'").all().length) {
    db.exec('SAVEPOINT legacy_step');
    try {
      // 很旧的库 monitor_config 可能还没有某些列(如 favorite / 后加的 notify_web_online):
      // 先按默认 0 补上再搬, 否则搬迁时引用不存在的列会整段回滚、库直接打不开
      for (const col of FRIEND_CONFIG_COLS) {
        execColumn(`ALTER TABLE monitor_config ADD COLUMN ${col} INTEGER DEFAULT 0`);
      }
      for (const col of FRIEND_CONFIG_COLS) {
        db.exec(`UPDATE friends SET ${col} = COALESCE((
          SELECT mc.${col} FROM monitor_config mc
          WHERE mc.user_id = friends.user_id AND mc.friend_vrchat_id = friends.friend_vrchat_id), ${col})`);
      }
      db.exec('DROP TABLE monitor_config');
      db.exec('RELEASE legacy_step');
    } catch (e) {
      try { db.exec('ROLLBACK TO legacy_step'); } catch (e2) { /* ignore */ }
      throw e;
    }
  }
  // 旧库补充: users 补 status 列(已存在则忽略)
  execColumn('ALTER TABLE users ADD COLUMN status TEXT');
  // 旧库补充: users 补自己在线状态列(已存在则忽略)
  execColumn('ALTER TABLE users ADD COLUMN status_description TEXT');
  execColumn('ALTER TABLE users ADD COLUMN platform TEXT');
  execColumn("ALTER TABLE users ADD COLUMN state TEXT DEFAULT 'offline'");
  execColumn('ALTER TABLE users ADD COLUMN world_id TEXT');
  execColumn('ALTER TABLE users ADD COLUMN last_seen INTEGER');
  // 自动重登用密码(记住我时保存, 与 VRCX 保存凭据同款)
  execColumn('ALTER TABLE users ADD COLUMN password TEXT');
  // 旧库补充: friends 补 trust_level 列(信任等级, 已存在则忽略)
  execColumn('ALTER TABLE friends ADD COLUMN trust_level TEXT');
  // 旧库补充: friends 补 instance_id 列(所在实例号, 来自 location 的 worldId:instanceId 解析)
  execColumn('ALTER TABLE friends ADD COLUMN instance_id TEXT');
  // 世界名不再随好友/自己入库(改由 world_cache 按需提供): 删除历史列, 只留 world_id
  execColumn('ALTER TABLE friends DROP COLUMN world_name');
  execColumn('ALTER TABLE users DROP COLUMN world_name');
  // world_cache 只保留真实名字: 历史"未知世界"占位行会被新逻辑当成真名字
  db.exec("DELETE FROM world_cache WHERE world_name = '未知世界'");
  // QQ 绑定改为全局(一个 QQ 应用一份绑定, 与哪个 VRC 账号无关): 旧库删掉 user_id, 保留最近一次绑定
  // SQLite 不能直接删掉参与主键的列, 只能重建表; 同一 app 有多行时按 updated_at 取最新那条。
  if (db.prepare('PRAGMA table_info(qq_bindings)').all().some((c) => c.name === 'user_id')) {
    db.exec('SAVEPOINT legacy_step');
    try {
      db.exec(`CREATE TABLE qq_bindings_new (
        app_id TEXT PRIMARY KEY, openid TEXT NOT NULL, nickname TEXT, updated_at INTEGER NOT NULL)`);
      db.exec(`INSERT INTO qq_bindings_new (app_id, openid, nickname, updated_at)
        SELECT app_id, openid, nickname, MAX(updated_at) FROM qq_bindings GROUP BY app_id`);
      db.exec('DROP TABLE qq_bindings');
      db.exec('ALTER TABLE qq_bindings_new RENAME TO qq_bindings');
      db.exec('RELEASE legacy_step');
    } catch (e) {
      try { db.exec('ROLLBACK TO legacy_step'); } catch (e2) { /* ignore */ }
      throw e;
    }
  }
  // 好友改为全局(同时只有一个 VRC 账号在跑): 旧库删掉 user_id, 唯一键换成 friend_vrchat_id。
  // 这里必须排在 monitor_config 迁移之后 —— 那块还要用 friends.user_id 关联旧配置。
  // SQLite 不能删掉参与唯一约束的列, 只能重建表; 同一好友被两个账号各存过一行时取最近更新的那条。
  if (db.prepare('PRAGMA table_info(friends)').all().some((c) => c.name === 'user_id')) {
    // 重建要按列名搬数据, 先把很旧的库里可能缺的列补齐(幂等)
    for (const col of ['status_description TEXT', 'platform TEXT', 'pending_state TEXT', 'pending_at INTEGER', 'last_seen INTEGER']) {
      execColumn(`ALTER TABLE friends ADD COLUMN ${col}`);
    }
    db.exec('SAVEPOINT legacy_step');
    try {
      db.exec(`CREATE TABLE friends_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friend_vrchat_id TEXT NOT NULL,
        display_name TEXT, avatar_url TEXT,
        state TEXT DEFAULT 'offline', status TEXT,
        world_id TEXT, instance_id TEXT, status_description TEXT, platform TEXT, trust_level TEXT,
        pending_state TEXT, pending_at INTEGER, last_seen INTEGER,
        favorite INTEGER DEFAULT 0, notify_online INTEGER DEFAULT 0, notify_web_online INTEGER DEFAULT 0, notify_offline INTEGER DEFAULT 0,
        notify_status_change INTEGER DEFAULT 0, notify_world_change INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(friend_vrchat_id))`);
      db.exec(`INSERT INTO friends_new (friend_vrchat_id, display_name, avatar_url, state, status,
          world_id, instance_id, status_description, platform, trust_level, pending_state, pending_at, last_seen,
          favorite, notify_online, notify_web_online, notify_offline, notify_status_change, notify_world_change, created_at, updated_at)
        SELECT friend_vrchat_id, display_name, avatar_url, state, status,
          world_id, instance_id, status_description, platform, trust_level, pending_state, pending_at, last_seen,
          favorite, notify_online, notify_web_online, notify_offline, notify_status_change, notify_world_change, created_at, MAX(updated_at)
        FROM friends GROUP BY friend_vrchat_id`);
      db.exec('DROP TABLE friends');
      db.exec('ALTER TABLE friends_new RENAME TO friends');
      db.exec('RELEASE legacy_step');
    } catch (e) {
      try { db.exec('ROLLBACK TO legacy_step'); } catch (e2) { /* ignore */ }
      throw e;
    }
  }
  const stmt = {
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    listSettings: db.prepare('SELECT key, value FROM settings'),
    setSetting: db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
  };
  // 旧库迁移: users 表的历史通知列 -> settings 表(取最近更新用户的值), 随后删除旧列
  (function migrateNotifyColumns() {
    const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    // 只迁移当前仍在用的白名单列, 其余历史通知列直接删除
    const legacy = userCols.filter((c) => LEGACY_NOTIFY_COLUMNS.includes(c));
    if (legacy.length === 0) return;
    const latest = db.prepare('SELECT * FROM users ORDER BY updated_at DESC, id DESC LIMIT 1').get();
    for (const col of legacy) {
      if (stmt.getSetting.get(col)) continue;
      const v = latest ? latest[col] : null;
      if (v !== null && v !== undefined) {
        const norm = SETTING_COLUMNS[col] === 'int' ? String(Math.trunc(Number(v) || 0)) : String(v);
        stmt.setSetting.run(col, norm);
      }
    }
    for (const col of legacy) {
      execColumn(`ALTER TABLE users DROP COLUMN ${col}`);
    }
  })();

  // 规范化历史 int 值(旧版本可能存成 REAL 文本如 587.0)
  (function normalizeIntSettings() {
    for (const r of stmt.listSettings.all()) {
      if (!(r.key in SETTING_COLUMNS) || SETTING_COLUMNS[r.key] !== 'int' || r.value === null) continue;
      const norm = String(Math.trunc(Number(r.value) || 0));
      if (norm !== String(r.value)) stmt.setSetting.run(r.key, norm);
    }
  })();
}

const MIGRATIONS = [migrateLegacyCore, migrateFriendEvents];
const SCHEMA_VERSION = MIGRATIONS.length;

function migrateDatabase(db) {
  db.exec('PRAGMA foreign_keys = ON');
  // Re-check under the write lock: two starting processes must not both migrate.
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > SCHEMA_VERSION) throw new Error(`数据库版本 ${version} 高于程序支持的 ${SCHEMA_VERSION}`);
    for (let next = version + 1; next <= SCHEMA_VERSION; next++) {
      MIGRATIONS[next - 1](db);
      db.exec(`PRAGMA user_version = ${next}`);
    }
    // Preserve recovery when empty/missing tables are recreated after manual
    // cleanup. IF NOT EXISTS is cheap and never re-runs the data migrations.
    db.exec(SCHEMA);
    db.exec(FRIEND_EVENT_SCHEMA);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { migrateDatabase, SCHEMA_VERSION };
