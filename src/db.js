'use strict';
// SQLite 仓储层 (node:sqlite DatabaseSync)。

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { createFriendEventStore } = require('./friend-events');
const { FRIEND_CONFIG, SETTINGS } = require('../public/contracts');
const { migrateDatabase } = require('./migrations');

/** 设置字段白名单: 列名 -> 类型(int|str); 当前仅 QQ 通知渠道 */
const SETTING_COLUMNS = Object.fromEntries(SETTINGS.map(([key, , type]) => [key, type === 'string' ? 'str' : 'int']));

const MAX_DEDUPE_ROWS = 100000;

// 逐好友的通知配置列(原 monitor_config 表的内容, 现在直接挂在 friends 行上)。
// notify_web_online 是后加的独立开关: 只挂网页 = 网页上线, 与"进游戏"的上线分开。
const FRIEND_CONFIG_COLS = FRIEND_CONFIG.map(([key]) => key);

function createDb(location = ':memory:', opts = {}) {
  // 数据库文件路径的父目录不存在时先创建(如删除 data/ 后重启)
  if (location !== ':memory:') {
    try { fs.mkdirSync(path.dirname(location), { recursive: true }); } catch (e) { /* 创建失败交给打开阶段报错 */ }
  }
  const db = new DatabaseSync(location);
  db.exec('PRAGMA journal_mode = WAL');
  try { migrateDatabase(db); } catch (e) { db.close(); throw e; }
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
  const stmt = {
    upsertUser: db.prepare(`INSERT INTO users (vrchat_user_id, username, display_name, avatar_url, status, status_description, platform, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      ON CONFLICT(vrchat_user_id) DO UPDATE SET
        username = excluded.username, display_name = excluded.display_name,
        avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
        status = COALESCE(excluded.status, users.status),
        status_description = COALESCE(excluded.status_description, users.status_description),
        platform = COALESCE(excluded.platform, users.platform),
        updated_at = datetime('now')`),
    updateSelfProfile: db.prepare(`UPDATE users SET
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
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
    upsertFriend: db.prepare(`INSERT INTO friends (friend_vrchat_id, display_name, avatar_url, state, status, world_id, instance_id, status_description, platform, trust_level, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(friend_vrchat_id) DO UPDATE SET
        display_name = COALESCE(excluded.display_name, friends.display_name),
        avatar_url = COALESCE(excluded.avatar_url, friends.avatar_url),
        state = excluded.state,
        status = excluded.status,
        world_id = excluded.world_id,
        instance_id = excluded.instance_id,
        status_description = excluded.status_description,
        platform = excluded.platform,
        trust_level = COALESCE(excluded.trust_level, friends.trust_level),
        last_seen = excluded.last_seen,
        updated_at = datetime('now')`),
    getFriend: db.prepare('SELECT * FROM friends WHERE friend_vrchat_id = ?'),
    listFriends: db.prepare('SELECT * FROM friends ORDER BY display_name'),
    deleteFriend: db.prepare('DELETE FROM friends WHERE friend_vrchat_id = ?'),
    updateFriendProfile: db.prepare(`UPDATE friends SET
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        trust_level = COALESCE(?, trust_level),
        updated_at = datetime('now')
        WHERE id = ?`),
    updateFriendState: db.prepare(`UPDATE friends SET
        state = ?, status = ?, world_id = ?, instance_id = ?, status_description = ?, platform = ?,
        pending_state = ?, pending_at = ?, last_seen = ?, updated_at = datetime('now')
      WHERE id = ?`),
    setFriendConfig: db.prepare(`UPDATE friends SET ${FRIEND_CONFIG_COLS.map((key) => key + ' = ?').join(', ')}, updated_at = datetime('now') WHERE friend_vrchat_id = ?`),
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
    getQqBinding: db.prepare('SELECT * FROM qq_bindings WHERE app_id = ?'),
  };
  const friendEvents = createFriendEventStore(db);

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

  return {
    // users
    upsertUser(vrcId, { username, displayName, avatarUrl, status, statusDescription, platform }) {
      stmt.upsertUser.run(
        vrcId,
        crypt ? crypt.encrypt(username, 'username:' + vrcId) : (username ?? null),
        displayName ?? null, avatarUrl ?? null,
        status ?? null, statusDescription ?? null, platform ?? null
      );
      return stmt.getUserByVrcId.get(vrcId).id;
    },
    updateSelfProfile(rowId, { displayName, avatarUrl }) {
      stmt.updateSelfProfile.run(displayName ?? null, avatarUrl ?? null, rowId);
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
        for (const t of ['users', 'friends', 'friend_logs', 'qq_bindings', 'notif_dedupe', 'world_cache', 'group_cache']) {
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
    // 彻底重置(登出勾"清除设置"): 清空全部设置与 QQ 绑定, 只保留访问令牌 ——
    // 令牌一丢, 下次启动会随机生成一个新的只打在控制台, 浏览器里的旧令牌全部 401, 等于把自己锁在外面。
    clearSettings() {
      db.exec('BEGIN');
      try {
        const bindings = stmt.clearAllBindings.run();
        const settings = stmt.listSettings.all().length;
        const token = stmt.getSetting.get('access_token');
        db.prepare('DELETE FROM settings').run();
        if (token && token.value !== null && token.value !== undefined) stmt.setSetting.run('access_token', token.value);
        db.exec('COMMIT');
        return { settings, bindings: bindings.changes };
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
        throw e;
      }
    },
    // friends(全局: 同时只有一个 VRC 账号, 好友不带账号列)
    upsertFriend(friendVrcId, fields) {
      const existing = stmt.getFriend.get(friendVrcId);
      stmt.upsertFriend.run(
        friendVrcId,
        fields.displayName ?? null, fields.avatarUrl ?? null,
        fields.state ?? (existing ? existing.state : 'offline'),
        fields.status ?? null, fields.worldId ?? null,
        fields.instanceId ?? null,
        fields.statusDescription ?? null, fields.platform ?? null,
        fields.trustLevel ?? null,
        fields.lastSeen ?? Date.now()
      );
      return { isNew: !existing, row: stmt.getFriend.get(friendVrcId) };
    },
    getFriend: (friendVrcId) => stmt.getFriend.get(friendVrcId) || null,
    listFriends: () => stmt.listFriends.all(),
    deleteFriend(friendVrcId) { stmt.deleteFriend.run(friendVrcId); },
    updateFriendProfile(rowId, { displayName, avatarUrl, trustLevel }) {
      stmt.updateFriendProfile.run(displayName ?? null, avatarUrl ?? null, trustLevel ?? null, rowId);
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
    setFriendConfig(friendVrcId, fields = {}) {
      stmt.setFriendConfig.run(...FRIEND_CONFIG.map(([key, alias]) => (fields[key] ?? fields[alias]) ? 1 : 0), friendVrcId);
    },
    ...friendEvents,
    // 登出必清: 好友(含逐好友配置)/好友动态/通知去重/用户 —— 都跟着账号走, 换个账号就没有意义了。
    // QQ 绑定与设置是全局的, 不在这里清(绑定归"彻底重置", 见 clearSettings)。
    clearAccountData() {
      const friends = stmt.clearAllFriends.run();
      const events = friendEvents.clearFriendEvents();
      const dedupe = stmt.clearAllDedupe.run();
      const users = stmt.clearAllUsers.run();
      return {
        friends: friends.changes, events,
        dedupe: dedupe.changes, users: users.changes
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
