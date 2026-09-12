'use strict';
// SQLite 仓储层 (node:sqlite DatabaseSync)。

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vrchat_user_id TEXT UNIQUE,
  username TEXT,
  saved_username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  avatar_thumb_url TEXT,
  status TEXT,
  status_description TEXT,
  platform TEXT,
  state TEXT DEFAULT 'offline',
  world_id TEXT,
  last_seen INTEGER,
  remember_me INTEGER DEFAULT 0,
  cookie_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_vrchat_id TEXT NOT NULL,
  display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT,
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
  notify_offline INTEGER DEFAULT 0,
  notify_status_change INTEGER DEFAULT 0,
  notify_world_change INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, friend_vrchat_id)
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

/** 设置字段白名单: 列名 -> 类型(int|str); 当前仅 QQ 通知渠道 */
const SETTING_COLUMNS = {
  qq_enabled: 'int', qq_app_id: 'str', qq_app_secret: 'str',
  // 站内通知类型开关(0=关, 缺省/1=开): 群组公告 / 戳一戳(boop) / 世界邀请
  notify_group_announcement: 'int', notify_boop: 'int', notify_invite: 'int'
};

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

const MAX_DEDUPE_ROWS = 100000;

// 逐好友的通知配置列(原 monitor_config 表的内容, 现在直接挂在 friends 行上)
const FRIEND_CONFIG_COLS = ['favorite', 'notify_online', 'notify_offline', 'notify_status_change', 'notify_world_change'];

function createDb(location = ':memory:', opts = {}) {
  // 数据库文件路径的父目录不存在时先创建(如删除 data/ 后重启)
  if (location !== ':memory:') {
    try { fs.mkdirSync(path.dirname(location), { recursive: true }); } catch (e) { /* 创建失败交给打开阶段报错 */ }
  }
  const db = new DatabaseSync(location);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  const maxDedupeRows = opts.maxDedupeRows ?? MAX_DEDUPE_ROWS;
  const crypt = opts.crypto || null; // 敏感字段加解密(未注入时明文直通, 供测试/开发模式)
  // 敏感字段行级解密(AAD = 字段:行ID / 字段:vrchat_user_id, 防密文跨行置换); 密钥不符/损坏 → 该字段按未保存处理
  function decryptUserRow(row) {
    if (!row || !crypt) return row;
    for (const f of ['saved_username', 'password', 'cookie_data']) {
      if (row[f] !== null && row[f] !== undefined) row[f] = crypt.decrypt(row[f], f + ':' + row.id);
    }
    if (row.username !== null && row.username !== undefined) {
      row.username = crypt.decrypt(row.username, 'username:' + row.vrchat_user_id);
    }
    return row;
  }
  // 旧库补充: friends 表补 avatar_thumb_url 列(已存在则忽略)
  try { db.exec('ALTER TABLE friends ADD COLUMN avatar_thumb_url TEXT'); } catch (e) { /* 已存在 */ }
  // 旧库清理: 世界名查询失败不再入库, 失败退避列已无意义(群组名有自己的 group_cache 列, 不受影响)
  try { db.exec('ALTER TABLE world_cache DROP COLUMN fail_count'); } catch (e) { /* 新库无此列 */ }
  try { db.exec('ALTER TABLE world_cache DROP COLUMN retry_at'); } catch (e) { /* 新库无此列 */ }
  // 逐好友通知配置并入 friends(原先在独立的 monitor_config 表): 先给 friends 补列, 再把旧表数据搬过来, 最后删表。
  // 旧语义是「没有配置行 = 不通知」, 所以补列默认 0, 只有真正有配置行的好友才会被搬成 1。
  for (const col of FRIEND_CONFIG_COLS) {
    try { db.exec(`ALTER TABLE friends ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch (e) { /* 已存在 */ }
  }
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_config'").all().length) {
    db.exec('BEGIN');
    try {
      // 很旧的库 monitor_config 可能还没有 favorite 列, 先补上再搬
      try { db.exec('ALTER TABLE monitor_config ADD COLUMN favorite INTEGER DEFAULT 0'); } catch (e) { /* 已有 */ }
      for (const col of FRIEND_CONFIG_COLS) {
        db.exec(`UPDATE friends SET ${col} = COALESCE((
          SELECT mc.${col} FROM monitor_config mc
          WHERE mc.user_id = friends.user_id AND mc.friend_vrchat_id = friends.friend_vrchat_id), ${col})`);
      }
      db.exec('DROP TABLE monitor_config');
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
      throw e;
    }
  }
  // 旧库补充: users 补 status 列(已存在则忽略)
  try { db.exec('ALTER TABLE users ADD COLUMN status TEXT'); } catch (e) { /* 已存在 */ }
  // 旧库补充: users 补自己在线状态列(已存在则忽略)
  try { db.exec('ALTER TABLE users ADD COLUMN avatar_thumb_url TEXT'); } catch (e) { /* 已存在 */ }
  try { db.exec('ALTER TABLE users ADD COLUMN status_description TEXT'); } catch (e) { /* 已存在 */ }
  try { db.exec('ALTER TABLE users ADD COLUMN platform TEXT'); } catch (e) { /* 已存在 */ }
  try { db.exec("ALTER TABLE users ADD COLUMN state TEXT DEFAULT 'offline'"); } catch (e) { /* 已存在 */ }
  try { db.exec('ALTER TABLE users ADD COLUMN world_id TEXT'); } catch (e) { /* 已存在 */ }
  try { db.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER'); } catch (e) { /* 已存在 */ }
  // 自动重登用密码(记住我时保存, 与 VRCX 保存凭据同款)
  try { db.exec('ALTER TABLE users ADD COLUMN password TEXT'); } catch (e) { /* 已存在 */ }
  // 旧库补充: friends 补 trust_level 列(信任等级, 已存在则忽略)
  try { db.exec('ALTER TABLE friends ADD COLUMN trust_level TEXT'); } catch (e) { /* 已存在 */ }
  // 旧库补充: friends 补 instance_id 列(所在实例号, 来自 location 的 worldId:instanceId 解析)
  try { db.exec('ALTER TABLE friends ADD COLUMN instance_id TEXT'); } catch (e) { /* 已存在 */ }
  // 世界名不再随好友/自己入库(改由 world_cache 按需提供): 删除历史列, 只留 world_id
  try { db.exec('ALTER TABLE friends DROP COLUMN world_name'); } catch (e) { /* 新库无此列 */ }
  try { db.exec('ALTER TABLE users DROP COLUMN world_name'); } catch (e) { /* 新库无此列 */ }
  // world_cache 只保留真实名字: 历史"未知世界"占位行会被新逻辑当成真名字
  try { db.exec("DELETE FROM world_cache WHERE world_name = '未知世界'"); } catch (e) { /* 忽略 */ }
  // QQ 绑定改为全局(一个 QQ 应用一份绑定, 与哪个 VRC 账号无关): 旧库删掉 user_id, 保留最近一次绑定
  // SQLite 不能直接删掉参与主键的列, 只能重建表; 同一 app 有多行时按 updated_at 取最新那条。
  if (db.prepare('PRAGMA table_info(qq_bindings)').all().some((c) => c.name === 'user_id')) {
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE qq_bindings_new (
        app_id TEXT PRIMARY KEY, openid TEXT NOT NULL, nickname TEXT, updated_at INTEGER NOT NULL)`);
      db.exec(`INSERT INTO qq_bindings_new (app_id, openid, nickname, updated_at)
        SELECT app_id, openid, nickname, MAX(updated_at) FROM qq_bindings GROUP BY app_id`);
      db.exec('DROP TABLE qq_bindings');
      db.exec('ALTER TABLE qq_bindings_new RENAME TO qq_bindings');
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
      throw e;
    }
  }
  const stmt = {
    upsertUser: db.prepare(`INSERT INTO users (vrchat_user_id, username, display_name, avatar_url, avatar_thumb_url, status, status_description, platform, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      ON CONFLICT(vrchat_user_id) DO UPDATE SET
        username = excluded.username, display_name = excluded.display_name,
        avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
        avatar_thumb_url = COALESCE(excluded.avatar_thumb_url, users.avatar_thumb_url),
        status = COALESCE(excluded.status, users.status),
        status_description = COALESCE(excluded.status_description, users.status_description),
        platform = COALESCE(excluded.platform, users.platform),
        updated_at = datetime('now')`),
    updateSelfProfile: db.prepare(`UPDATE users SET
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        avatar_thumb_url = COALESCE(?, avatar_thumb_url),
        updated_at = datetime('now')
        WHERE id = ?`),
    updateSelfPresence: db.prepare(`UPDATE users SET
        state = ?, status = ?, world_id = ?, status_description = ?, platform = ?,
        last_seen = ?, updated_at = datetime('now')
        WHERE id = ?`),
    getUserByVrcId: db.prepare('SELECT * FROM users WHERE vrchat_user_id = ?'),
    getUserByDbId: db.prepare('SELECT * FROM users WHERE id = ?'),
    listUsers: db.prepare('SELECT * FROM users ORDER BY id'),
    getSavedLogin: db.prepare("SELECT * FROM users WHERE saved_username IS NOT NULL AND remember_me = 1 ORDER BY updated_at DESC LIMIT 1"),
    saveCookies: db.prepare("UPDATE users SET cookie_data = ?, remember_me = 1, saved_username = ?, updated_at = datetime('now') WHERE id = ?"),
    clearOtherCookies: db.prepare("UPDATE users SET cookie_data = NULL, remember_me = 0, saved_username = NULL, updated_at = datetime('now') WHERE remember_me = 1 AND id != ?"),
    clearCookies: db.prepare("UPDATE users SET cookie_data = NULL, remember_me = 0, saved_username = NULL, password = NULL, updated_at = datetime('now') WHERE id = ?"),
    savePassword: db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?"),
    clearAllFriends: db.prepare('DELETE FROM friends'),
    clearAllDedupe: db.prepare('DELETE FROM notif_dedupe'),
    clearAllBindings: db.prepare('DELETE FROM qq_bindings'),
    clearAllUsers: db.prepare('DELETE FROM users'),
    clearWorldCache: db.prepare('DELETE FROM world_cache'),
    clearGroupCache: db.prepare('DELETE FROM group_cache'),
    upsertFriend: db.prepare(`INSERT INTO friends (user_id, friend_vrchat_id, display_name, avatar_url, avatar_thumb_url, state, status, world_id, instance_id, status_description, platform, trust_level, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, friend_vrchat_id) DO UPDATE SET
        display_name = COALESCE(excluded.display_name, friends.display_name),
        avatar_url = COALESCE(excluded.avatar_url, friends.avatar_url),
        avatar_thumb_url = COALESCE(excluded.avatar_thumb_url, friends.avatar_thumb_url),
        state = excluded.state,
        status = excluded.status,
        world_id = excluded.world_id,
        instance_id = excluded.instance_id,
        status_description = excluded.status_description,
        platform = excluded.platform,
        trust_level = COALESCE(excluded.trust_level, friends.trust_level),
        last_seen = excluded.last_seen,
        updated_at = datetime('now')`),
    getFriend: db.prepare('SELECT * FROM friends WHERE user_id = ? AND friend_vrchat_id = ?'),
    listFriends: db.prepare('SELECT * FROM friends WHERE user_id = ? ORDER BY display_name'),
    deleteFriend: db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_vrchat_id = ?'),
    updateFriendProfile: db.prepare(`UPDATE friends SET
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        avatar_thumb_url = COALESCE(?, avatar_thumb_url),
        trust_level = COALESCE(?, trust_level),
        updated_at = datetime('now')
        WHERE id = ?`),
    updateFriendState: db.prepare(`UPDATE friends SET
        state = ?, status = ?, world_id = ?, instance_id = ?, status_description = ?, platform = ?,
        pending_state = ?, pending_at = ?, last_seen = ?, updated_at = datetime('now')
      WHERE id = ?`),
    setFriendConfig: db.prepare(`UPDATE friends SET
        favorite = ?, notify_online = ?, notify_offline = ?, notify_status_change = ?, notify_world_change = ?,
        updated_at = datetime('now')
      WHERE user_id = ? AND friend_vrchat_id = ?`),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`),
    listSettings: db.prepare('SELECT key, value FROM settings'),
    markNotified: db.prepare(`INSERT INTO notif_dedupe (key, created_at) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET created_at = excluded.created_at`),
    countNotified: db.prepare('SELECT COUNT(*) AS c FROM notif_dedupe'),
    trimNotified: db.prepare('DELETE FROM notif_dedupe WHERE key IN (SELECT key FROM notif_dedupe ORDER BY created_at ASC, key ASC LIMIT ?)'),
    getWorldCache: db.prepare('SELECT world_id, world_name, updated_at FROM world_cache WHERE world_id = ?'),
    upsertWorldCache: db.prepare(`INSERT INTO world_cache (world_id, world_name, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(world_id) DO UPDATE SET
        world_name = excluded.world_name, updated_at = excluded.updated_at`),
    getGroupCache: db.prepare('SELECT group_id, group_name, updated_at, fail_count, retry_at FROM group_cache WHERE group_id = ?'),
    upsertGroupCache: db.prepare(`INSERT INTO group_cache (group_id, group_name, updated_at, fail_count, retry_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET
        group_name = excluded.group_name, updated_at = excluded.updated_at,
        fail_count = excluded.fail_count, retry_at = excluded.retry_at`),
    isDuplicate: db.prepare('SELECT created_at FROM notif_dedupe WHERE key = ?'),
    upsertQqBinding: db.prepare('INSERT INTO qq_bindings (app_id, openid, nickname, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(app_id) DO UPDATE SET openid = excluded.openid, nickname = excluded.nickname, updated_at = excluded.updated_at'),
    getQqBinding: db.prepare('SELECT * FROM qq_bindings WHERE app_id = ?')
  };

  // 通知设置全局化: 统一写入 settings 表(key-value); qq_app_secret 加密存储
  function updateGlobalSettings(fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (!(key in SETTING_COLUMNS)) continue;
      const type = SETTING_COLUMNS[key];
      const v = value === undefined || value === null ? null : (type === 'int' ? String(Math.trunc(Number(value) || 0)) : String(value));
      const stored = (crypt && key === 'qq_app_secret' && v !== null) ? crypt.encrypt(v, 'settings:qq_app_secret') : v;
      stmt.setSetting.run(key, stored);
    }
  }

  function getGlobalSettings() {
    const out = {};
    for (const r of stmt.listSettings.all()) {
      if (!(r.key in SETTING_COLUMNS)) continue;
      const type = SETTING_COLUMNS[r.key];
      out[r.key] = r.value === null || r.value === undefined ? null : (type === 'int' ? Number(r.value) || 0 : String(r.value));
    }
    if (crypt && out.qq_app_secret !== null && out.qq_app_secret !== undefined) {
      out.qq_app_secret = crypt.decrypt(out.qq_app_secret, 'settings:qq_app_secret');
    }
    return out;
  }

  // 旧库迁移: users 表的历史通知列 -> settings 表(取最近更新用户的值), 随后删除旧列
  (function migrateNotifyColumns() {
    try {
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
        try { db.exec(`ALTER TABLE users DROP COLUMN ${col}`); } catch (e) { /* 删除失败忽略 */ }
      }
    } catch (e) { /* 迁移失败不影响启动 */ }
  })();

  // 规范化历史 int 值(旧版本可能存成 REAL 文本如 587.0)
  (function normalizeIntSettings() {
    try {
      for (const r of stmt.listSettings.all()) {
        if (!(r.key in SETTING_COLUMNS) || SETTING_COLUMNS[r.key] !== 'int' || r.value === null) continue;
        const norm = String(Math.trunc(Number(r.value) || 0));
        if (norm !== String(r.value)) stmt.setSetting.run(r.key, norm);
      }
    } catch (e) { /* 规范化失败不影响启动 */ }
  })();

  return {
    // users
    upsertUser(vrcId, { username, displayName, avatarUrl, avatarThumbUrl, status, statusDescription, platform }) {
      stmt.upsertUser.run(
        vrcId,
        crypt ? crypt.encrypt(username, 'username:' + vrcId) : (username ?? null),
        displayName ?? null, avatarUrl ?? null, avatarThumbUrl ?? null,
        status ?? null, statusDescription ?? null, platform ?? null
      );
      return stmt.getUserByVrcId.get(vrcId).id;
    },
    updateSelfProfile(rowId, { displayName, avatarUrl, avatarThumbUrl }) {
      stmt.updateSelfProfile.run(displayName ?? null, avatarUrl ?? null, avatarThumbUrl ?? null, rowId);
    },
    updateSelfPresence(rowId, fields) {
      stmt.updateSelfPresence.run(
        fields.state, fields.status ?? null, fields.worldId ?? null,
        fields.statusDescription ?? null, fields.platform ?? null, fields.lastSeen ?? Date.now(), rowId
      );
    },
    getUserByVrcId: (vrcId) => decryptUserRow(stmt.getUserByVrcId.get(vrcId)) || null,
    getUserByDbId: (id) => decryptUserRow(stmt.getUserByDbId.get(id)) || null,
    listUsers: () => stmt.listUsers.all().map(decryptUserRow),
    getSavedLogin: () => decryptUserRow(stmt.getSavedLogin.get()) || null,
    // 全局最多保留一份 cookie: 保存前先清掉其他用户的已存 cookie
    saveCookies(dbId, cookieData, username) {
      stmt.clearOtherCookies.run(dbId);
      stmt.saveCookies.run(
        crypt ? crypt.encrypt(cookieData, 'cookie_data:' + dbId) : cookieData,
        crypt ? crypt.encrypt(username, 'saved_username:' + dbId) : (username ?? null),
        dbId
      );
    },
    clearCookies(dbId) { stmt.clearCookies.run(dbId); },
    // 自动重登用: 记住我时保存密码, 与 cookie 一起在登出时清除
    savePassword(dbId, password) {
      stmt.savePassword.run(crypt ? crypt.encrypt(password, 'password:' + dbId) : (password ?? null), dbId);
    },
    // QQ \u673a\u5668\u4eba\u7ed1\u5b9a (\u6bcf\u7528\u6237\u6bcf app \u4e00\u4efd)
    upsertQqBinding({ appId, openid, nickname, at }) {
      stmt.upsertQqBinding.run(appId, openid, nickname ?? null, at ?? Date.now());
      return stmt.getQqBinding.get(appId);
    },
    getQqBinding: (appId) => stmt.getQqBinding.get(appId) || null,
    updateGlobalSettings,
    getGlobalSettings,
    // 探测: 存在 v1: 密文但当前密钥解不开(密钥不符/密文损坏) → true(启动流程据此静默清库重启)
    hasUndecryptableSensitive() {
      if (!crypt) return false;
      for (const r of stmt.listUsers.all()) {
        for (const f of ['saved_username', 'password', 'cookie_data']) {
          if (crypt.isEncrypted(r[f]) && crypt.decrypt(r[f], f + ':' + r.id) === null) return true;
        }
        if (crypt.isEncrypted(r.username) && crypt.decrypt(r.username, 'username:' + r.vrchat_user_id) === null) return true;
      }
      const s = stmt.getSetting.get('qq_app_secret');
      if (s && crypt.isEncrypted(s.value) && crypt.decrypt(s.value, 'settings:qq_app_secret') === null) return true;
      return false;
    },
    // 静默清库: 除 access_token 外全部数据删除(用户/好友/配置/绑定/去重/世界缓存/设置)
    wipeAllExceptToken() {
      db.exec('BEGIN');
      try {
        for (const t of ['users', 'friends', 'qq_bindings', 'notif_dedupe', 'world_cache', 'group_cache']) {
          db.prepare('DELETE FROM ' + t).run();
        }
        const token = stmt.getSetting.get('access_token');
        db.prepare('DELETE FROM settings').run();
        if (token && token.value !== null && token.value !== undefined) stmt.setSetting.run('access_token', token.value);
        db.exec('COMMIT');
        return true;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
        throw e;
      }
    },
    // friends
    upsertFriend(dbId, friendVrcId, fields) {
      const existing = stmt.getFriend.get(dbId, friendVrcId);
      stmt.upsertFriend.run(
        dbId, friendVrcId,
        fields.displayName ?? null, fields.avatarUrl ?? null, fields.avatarThumbUrl ?? null,
        fields.state ?? (existing ? existing.state : 'offline'),
        fields.status ?? null, fields.worldId ?? null,
        fields.instanceId ?? null,
        fields.statusDescription ?? null, fields.platform ?? null,
        fields.trustLevel ?? null,
        fields.lastSeen ?? Date.now()
      );
      return { isNew: !existing, row: stmt.getFriend.get(dbId, friendVrcId) };
    },
    getFriend: (dbId, friendVrcId) => stmt.getFriend.get(dbId, friendVrcId) || null,
    listFriends: (dbId) => stmt.listFriends.all(dbId),
    deleteFriend(dbId, friendVrcId) { stmt.deleteFriend.run(dbId, friendVrcId); },
    updateFriendProfile(rowId, { displayName, avatarUrl, avatarThumbUrl, trustLevel }) {
      stmt.updateFriendProfile.run(displayName ?? null, avatarUrl ?? null, avatarThumbUrl ?? null, trustLevel ?? null, rowId);
    },
    updateFriendState(id, fields) {
      stmt.updateFriendState.run(
        fields.state, fields.status ?? null, fields.world_id ?? null,
        fields.instance_id ?? null,
        fields.status_description ?? null, fields.platform ?? null,
        fields.pending_state ?? null, fields.pending_at ?? null, fields.last_seen ?? Date.now(), id
      );
    },
    // 逐好友通知配置(存在 friends 行上)。不传的字段按 false 处理 —— 整组覆盖写。
    setFriendConfig(dbId, friendVrcId, { favorite = false, notifyOnline = false, notifyOffline = false, notifyStatusChange = false, notifyWorldChange = false } = {}) {
      stmt.setFriendConfig.run(favorite ? 1 : 0, notifyOnline ? 1 : 0, notifyOffline ? 1 : 0, notifyStatusChange ? 1 : 0, notifyWorldChange ? 1 : 0, dbId, friendVrcId);
    },
    // 登出全清: 除 settings 与世界名缓存外的全部数据(好友(含配置)/通知去重/QQ绑定/用户)
    clearFriends() {
      const friends = stmt.clearAllFriends.run();
      const dedupe = stmt.clearAllDedupe.run();
      const bindings = stmt.clearAllBindings.run();
      const users = stmt.clearAllUsers.run();
      return {
        friends: friends.changes,
        dedupe: dedupe.changes, bindings: bindings.changes, users: users.changes
      };
    },
    clearWorldCache() { return stmt.clearWorldCache.run().changes; },
    clearGroupCache() { return stmt.clearGroupCache.run().changes; },
    getGroupCache(groupId) { const r = stmt.getGroupCache.get(groupId); return r || null; },
    upsertGroupCache(groupId, groupName, atMs = Date.now(), failCount = 0, retryAt = 0) { stmt.upsertGroupCache.run(groupId, groupName, atMs, failCount, retryAt); },
    // settings
    getSetting(key) { const r = stmt.getSetting.get(key); return r ? r.value : null; },
    setSetting(key, value) { stmt.setSetting.run(key, value); },
    // world cache
    getWorldCache(worldId) { const r = stmt.getWorldCache.get(worldId); return r || null; },
    upsertWorldCache(worldId, worldName, atMs = Date.now()) { stmt.upsertWorldCache.run(worldId, worldName, atMs); },
    // dedupe
    markNotified(key, atMs = Date.now()) {
      stmt.markNotified.run(key, atMs);
      const { c } = stmt.countNotified.get();
      if (c > maxDedupeRows) stmt.trimNotified.run(c - maxDedupeRows);
    },
    isDuplicate(key, windowMs, atMs = Date.now()) {
      const r = stmt.isDuplicate.get(key);
      return !!r && r.created_at > atMs - windowMs;
    },
    // 优雅退出用: 先尝试 TRUNCATE checkpoint 把 WAL 归零(有并发读者时会失败, 忽略),
    // 让主库文件自包含(拷贝单文件即完整备份); close 本身也会对最后一条连接执行 checkpoint。
    close() {
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) { /* 忽略 */ }
      db.close();
    }
  };
}

module.exports = { createDb };
