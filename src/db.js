'use strict';
// SQLite 仓储层 (node:sqlite DatabaseSync)。

const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vrchat_user_id TEXT UNIQUE,
  username TEXT,
  saved_username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  smtp_host TEXT, smtp_port INTEGER, smtp_secure INTEGER, smtp_user TEXT, smtp_pass TEXT,
  email_subject_template TEXT, email_body_template TEXT,
  gotify_enabled INTEGER DEFAULT 0, gotify_server_url TEXT, gotify_app_token TEXT, gotify_priority INTEGER DEFAULT 5,
  ntfy_enabled INTEGER DEFAULT 0, ntfy_server_url TEXT DEFAULT 'https://ntfy.sh', ntfy_topic TEXT, ntfy_priority INTEGER DEFAULT 3,
  webhook_enabled INTEGER DEFAULT 0, webhook_url TEXT, webhook_method TEXT DEFAULT 'POST',
  webhook_headers TEXT, webhook_body_template TEXT, webhook_content_type TEXT DEFAULT 'application/json',
  status_only_mode INTEGER DEFAULT 0,
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
  world_id TEXT, world_name TEXT,
  status_description TEXT,
  platform TEXT,
  pending_state TEXT, pending_at INTEGER,
  last_seen INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, friend_vrchat_id)
);
CREATE TABLE IF NOT EXISTS monitor_config (
  user_id INTEGER NOT NULL,
  friend_vrchat_id TEXT NOT NULL,
  monitor_enabled INTEGER DEFAULT 0,
  notify_online INTEGER DEFAULT 1,
  notify_offline INTEGER DEFAULT 1,
  notify_status_change INTEGER DEFAULT 1,
  notify_world_change INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, friend_vrchat_id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS notif_dedupe (key TEXT PRIMARY KEY, created_at INTEGER);
CREATE TABLE IF NOT EXISTS world_cache (
  world_id TEXT PRIMARY KEY,
  world_name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

/** 设置字段白名单: 列名 -> 类型(int|str) */
const SETTING_COLUMNS = {
  email: 'str', smtp_host: 'str', smtp_port: 'int', smtp_secure: 'int', smtp_user: 'str', smtp_pass: 'str',
  email_subject_template: 'str', email_body_template: 'str',
  gotify_enabled: 'int', gotify_server_url: 'str', gotify_app_token: 'str', gotify_priority: 'int',
  ntfy_enabled: 'int', ntfy_server_url: 'str', ntfy_topic: 'str', ntfy_priority: 'int',
  webhook_enabled: 'int', webhook_url: 'str', webhook_method: 'str', webhook_headers: 'str',
  webhook_body_template: 'str', webhook_content_type: 'str',
  status_only_mode: 'int'
};

function createDb(location = ':memory:') {
  const db = new DatabaseSync(location);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  // 旧库迁移: friends 表补 avatar_thumb_url 列(已存在则忽略)
  try { db.exec('ALTER TABLE friends ADD COLUMN avatar_thumb_url TEXT'); } catch (e) { /* 已存在 */ }

  const stmt = {
    upsertUser: db.prepare(`INSERT INTO users (vrchat_user_id, username, display_name, avatar_url)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(vrchat_user_id) DO UPDATE SET
        username = excluded.username, display_name = excluded.display_name,
        avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
        updated_at = datetime('now')`),
    getUserByVrcId: db.prepare('SELECT * FROM users WHERE vrchat_user_id = ?'),
    getUserByDbId: db.prepare('SELECT * FROM users WHERE id = ?'),
    listUsers: db.prepare('SELECT * FROM users ORDER BY id'),
    getSavedLogin: db.prepare("SELECT * FROM users WHERE saved_username IS NOT NULL AND remember_me = 1 ORDER BY updated_at DESC LIMIT 1"),
    saveCookies: db.prepare("UPDATE users SET cookie_data = ?, remember_me = 1, saved_username = ?, updated_at = datetime('now') WHERE id = ?"),
    clearOtherCookies: db.prepare("UPDATE users SET cookie_data = NULL, remember_me = 0, saved_username = NULL, updated_at = datetime('now') WHERE remember_me = 1 AND id != ?"),
    clearCookies: db.prepare("UPDATE users SET cookie_data = NULL, remember_me = 0, updated_at = datetime('now') WHERE id = ?"),
    upsertFriend: db.prepare(`INSERT INTO friends (user_id, friend_vrchat_id, display_name, avatar_url, avatar_thumb_url, state, status, world_id, world_name, status_description, platform, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, friend_vrchat_id) DO UPDATE SET
        display_name = COALESCE(excluded.display_name, friends.display_name),
        avatar_url = COALESCE(excluded.avatar_url, friends.avatar_url),
        avatar_thumb_url = COALESCE(excluded.avatar_thumb_url, friends.avatar_thumb_url),
        state = excluded.state,
        status = excluded.status,
        world_id = excluded.world_id,
        world_name = excluded.world_name,
        status_description = excluded.status_description,
        platform = excluded.platform,
        last_seen = excluded.last_seen,
        updated_at = datetime('now')`),
    getFriend: db.prepare('SELECT * FROM friends WHERE user_id = ? AND friend_vrchat_id = ?'),
    listFriends: db.prepare('SELECT * FROM friends WHERE user_id = ? ORDER BY display_name'),
    deleteFriend: db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_vrchat_id = ?'),
    updateFriendProfile: db.prepare(`UPDATE friends SET
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        avatar_thumb_url = COALESCE(?, avatar_thumb_url),
        updated_at = datetime('now')
        WHERE id = ?`),
    updateFriendState: db.prepare(`UPDATE friends SET
        state = ?, status = ?, world_id = ?, world_name = ?, status_description = ?, platform = ?,
        pending_state = ?, pending_at = ?, last_seen = ?, updated_at = datetime('now')
      WHERE id = ?`),
    upsertConfig: db.prepare(`INSERT INTO monitor_config (user_id, friend_vrchat_id, monitor_enabled, notify_online, notify_offline, notify_status_change, notify_world_change)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, friend_vrchat_id) DO UPDATE SET
        monitor_enabled = excluded.monitor_enabled,
        notify_online = excluded.notify_online,
        notify_offline = excluded.notify_offline,
        notify_status_change = excluded.notify_status_change,
        notify_world_change = excluded.notify_world_change,
        updated_at = datetime('now')`),
    getConfig: db.prepare('SELECT * FROM monitor_config WHERE user_id = ? AND friend_vrchat_id = ?'),
    listConfigs: db.prepare('SELECT * FROM monitor_config WHERE user_id = ?'),
    disableAllConfigs: db.prepare(`UPDATE monitor_config SET monitor_enabled = 0, updated_at = datetime('now') WHERE user_id = ?`),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`),
    markNotified: db.prepare('INSERT OR IGNORE INTO notif_dedupe (key, created_at) VALUES (?, ?)'),
    getWorldCache: db.prepare('SELECT world_id, world_name, updated_at FROM world_cache WHERE world_id = ?'),
    upsertWorldCache: db.prepare('INSERT INTO world_cache (world_id, world_name, updated_at) VALUES (?, ?, ?) ON CONFLICT(world_id) DO UPDATE SET world_name = excluded.world_name, updated_at = excluded.updated_at'),
    isDuplicate: db.prepare('SELECT created_at FROM notif_dedupe WHERE key = ?')
  };

  function updateUserSettings(dbId, fields) {
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!(key in SETTING_COLUMNS)) continue;
      const type = SETTING_COLUMNS[key];
      const v = value === undefined || value === null ? null : (type === 'int' ? (typeof value === 'number' ? value : (value ? 1 : 0)) : String(value));
      sets.push(`${key} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(dbId);
    db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
  }

  return {
    // users
    upsertUser(vrcId, { username, displayName, avatarUrl }) {
      stmt.upsertUser.run(vrcId, username ?? null, displayName ?? null, avatarUrl ?? null);
      return stmt.getUserByVrcId.get(vrcId).id;
    },
    getUserByVrcId: (vrcId) => stmt.getUserByVrcId.get(vrcId) || null,
    getUserByDbId: (id) => stmt.getUserByDbId.get(id) || null,
    listUsers: () => stmt.listUsers.all(),
    getSavedLogin: () => stmt.getSavedLogin.get() || null,
    // 全局最多保留一份 cookie: 保存前先清掉其他用户的已存 cookie
    saveCookies(dbId, cookieData, username) {
      stmt.clearOtherCookies.run(dbId);
      stmt.saveCookies.run(cookieData, username ?? null, dbId);
    },
    clearCookies(dbId) { stmt.clearCookies.run(dbId); },
    updateUserSettings,
    // friends
    upsertFriend(dbId, friendVrcId, fields) {
      const existing = stmt.getFriend.get(dbId, friendVrcId);
      stmt.upsertFriend.run(
        dbId, friendVrcId,
        fields.displayName ?? null, fields.avatarUrl ?? null, fields.avatarThumbUrl ?? null,
        fields.state ?? (existing ? existing.state : 'offline'),
        fields.status ?? null, fields.worldId ?? null, fields.worldName ?? null,
        fields.statusDescription ?? null, fields.platform ?? null,
        fields.lastSeen ?? Date.now()
      );
      return { isNew: !existing, row: stmt.getFriend.get(dbId, friendVrcId) };
    },
    getFriend: (dbId, friendVrcId) => stmt.getFriend.get(dbId, friendVrcId) || null,
    listFriends: (dbId) => stmt.listFriends.all(dbId),
    deleteFriend(dbId, friendVrcId) { stmt.deleteFriend.run(dbId, friendVrcId); },
    updateFriendProfile(rowId, { displayName, avatarUrl, avatarThumbUrl }) {
      stmt.updateFriendProfile.run(displayName ?? null, avatarUrl ?? null, avatarThumbUrl ?? null, rowId);
    },
    updateFriendState(id, fields) {
      stmt.updateFriendState.run(
        fields.state, fields.status ?? null, fields.world_id ?? null, fields.world_name ?? null,
        fields.status_description ?? null, fields.platform ?? null,
        fields.pending_state ?? null, fields.pending_at ?? null, fields.last_seen ?? Date.now(), id
      );
    },
    // monitor config
    upsertConfig(dbId, friendVrcId, { monitorEnabled, notifyOnline = true, notifyOffline = true, notifyStatusChange = true, notifyWorldChange = true }) {
      stmt.upsertConfig.run(dbId, friendVrcId, monitorEnabled ? 1 : 0, notifyOnline ? 1 : 0, notifyOffline ? 1 : 0, notifyStatusChange ? 1 : 0, notifyWorldChange ? 1 : 0);
    },
    getConfig: (dbId, friendVrcId) => stmt.getConfig.get(dbId, friendVrcId) || null,
    listConfigs: (dbId) => stmt.listConfigs.all(dbId),
    disableAllConfigs: (dbId) => stmt.disableAllConfigs.run(dbId),
    // settings
    getSetting(key) { const r = stmt.getSetting.get(key); return r ? r.value : null; },
    setSetting(key, value) { stmt.setSetting.run(key, value); },
    // world cache
    getWorldCache(worldId) { const r = stmt.getWorldCache.get(worldId); return r || null; },
    upsertWorldCache(worldId, worldName, atMs = Date.now()) { stmt.upsertWorldCache.run(worldId, worldName, atMs); },
    // dedupe
    markNotified(key, atMs = Date.now()) { stmt.markNotified.run(key, atMs); },
    isDuplicate(key, windowMs, atMs = Date.now()) {
      const r = stmt.isDuplicate.get(key);
      return !!r && r.created_at > atMs - windowMs;
    }
  };
}

module.exports = { createDb };




