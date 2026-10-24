'use strict';

// 全局流水 ID 保持原有游标/API；位置用 VRChat 完整 location，不能只留 worldId。
// 昵称/头像/世界名/群名均读现有资料和缓存，不在历史表重复保存。
const SCHEMA = `
CREATE TABLE IF NOT EXISTS friend_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  type TEXT NOT NULL,
  friend_vrchat_id TEXT,
  source TEXT NOT NULL DEFAULT 'ws'
);
CREATE INDEX IF NOT EXISTS idx_friend_logs_at ON friend_logs(at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_logs_friend ON friend_logs(friend_vrchat_id, id DESC);
CREATE TABLE IF NOT EXISTS friend_log_presence (
  event_id INTEGER PRIMARY KEY REFERENCES friend_logs(id) ON DELETE CASCADE,
  old_state TEXT, new_state TEXT, location TEXT
);
CREATE TABLE IF NOT EXISTS friend_log_status (
  event_id INTEGER PRIMARY KEY REFERENCES friend_logs(id) ON DELETE CASCADE,
  old_status TEXT, new_status TEXT, old_desc TEXT, new_desc TEXT
);
CREATE TABLE IF NOT EXISTS friend_log_notifications (
  event_id INTEGER PRIMARY KEY REFERENCES friend_logs(id) ON DELETE CASCADE,
  notification_id TEXT UNIQUE,
  group_id TEXT,
  title TEXT, body TEXT, location TEXT
);
CREATE TABLE IF NOT EXISTS friend_log_location (
  event_id INTEGER PRIMARY KEY REFERENCES friend_logs(id) ON DELETE CASCADE,
  old_location TEXT, location TEXT
);`;

const { splitLocation, locationOf } = require('../public/locationmodel');
const { EVENT_LABELS: TYPE_LABELS, EVENT_CODES, eventCodesOf } = require('../public/contracts');
const TYPE_CODES = new Map(Object.entries(EVENT_CODES));
function typeCode(value) {
  const type = String(value ?? '');
  return TYPE_CODES.get(type) || type;
}
const PRESENCE = new Set(eventCodesOf('presence'));
const STATUS = new Set(eventCodesOf('status'));
const NOTIFICATIONS = new Set(eventCodesOf('notification'));

function createFriendEventStore(db) {
  db.exec('PRAGMA foreign_keys = ON');
  // 表名统一为日志；旧宽表和此前的分类结构都可无损升级。
  // 改名及重建在同一事务内，SQLite 会同步更新子表外键与自增序列。
  db.exec('BEGIN IMMEDIATE');
  try {
    const hasTable = (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    for (const [oldName, newName] of [
      ['friend_events', 'friend_logs'],
      ['friend_event_presence', 'friend_log_presence'],
      ['friend_event_status', 'friend_log_status'],
      ['friend_event_notifications', 'friend_log_notifications']
    ]) {
      if (!hasTable(oldName)) continue;
      if (hasTable(newName)) throw new Error(`日志表改名冲突: ${oldName} 与 ${newName} 同时存在`);
      db.exec(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
    }
    db.exec('DROP INDEX IF EXISTS idx_friend_events_at; DROP INDEX IF EXISTS idx_friend_events_friend;');
    const oldCols = db.prepare('PRAGMA table_info(friend_logs)').all().map((c) => c.name);
    // 旧数据未保存的实例号不可还原，保留已知世界，绝不编造。
    if (oldCols.includes('friend_name')) {
      const high = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='friend_logs'").get()?.seq || 0;
      db.exec(`ALTER TABLE friend_logs RENAME TO friend_logs_legacy;
        DROP INDEX IF EXISTS idx_friend_logs_at;
        DROP INDEX IF EXISTS idx_friend_logs_friend;`);
      db.exec(SCHEMA);
      db.exec(`INSERT INTO friend_logs(id, at, type, friend_vrchat_id, source)
        SELECT id, at, CASE type WHEN 'web端上线' THEN '网页上线' ELSE type END,
          friend_vrchat_id, 'legacy' FROM friend_logs_legacy;
        INSERT INTO friend_log_presence SELECT id,old_state,new_state,COALESCE(world_id,old_world_id) FROM friend_logs_legacy
          WHERE type IN ('上线','下线','网页上线','网页下线','web端上线','friend_online','friend_offline','friend_web_online','friend_web_offline');
        INSERT INTO friend_log_status SELECT id,old_status,new_status,old_desc,new_desc FROM friend_logs_legacy
          WHERE type IN ('状态变化','自定义状态','status_change','status_description_change');
        INSERT INTO friend_log_notifications(event_id,title,body,location) SELECT id,title,body,world_id FROM friend_logs_legacy
          WHERE type IN ('群组公告','戳一戳','世界邀请','请求邀请','group_announcement','boop','invite','request_invite');
        INSERT INTO friend_log_location SELECT id,old_world_id,world_id FROM friend_logs_legacy WHERE type IN ('切换世界','location_change');
        INSERT OR IGNORE INTO world_cache(world_id,world_name,updated_at)
          SELECT world_id,world_name,at FROM friend_logs_legacy WHERE world_id IS NOT NULL AND world_name IS NOT NULL;
        INSERT OR IGNORE INTO world_cache(world_id,world_name,updated_at)
          SELECT old_world_id,old_world_name,at FROM friend_logs_legacy WHERE old_world_id IS NOT NULL AND old_world_name IS NOT NULL;
        DROP TABLE friend_logs_legacy;`);
      db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'friend_logs'").run(high);
    } else {
      db.exec(SCHEMA);
      // 已有的 7 列公共流水：按类别搬走位置，再删除公共表中的位置列。
      if (oldCols.includes('location')) {
        for (const table of ['friend_log_presence','friend_log_notifications']) {
          const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
          if (!cols.includes('location')) db.exec(`ALTER TABLE ${table} ADD COLUMN location TEXT`);
          const value = table === 'friend_log_presence' ? 'COALESCE(location,old_location)' : 'location';
          db.exec(`UPDATE ${table} SET location=(SELECT ${value} FROM friend_logs WHERE id=${table}.event_id)`);
        }
        db.exec(`INSERT INTO friend_log_location(event_id,old_location,location)
          SELECT id,old_location,location FROM friend_logs WHERE type IN ('切换世界','location_change');
          ALTER TABLE friend_logs DROP COLUMN old_location;
          ALTER TABLE friend_logs DROP COLUMN location;`);
      }
    }
    // 只有位置变化保留新旧位置；上下线只留一个上下文位置，状态不存位置。
    for (const table of ['friend_log_presence','friend_log_status','friend_log_notifications']) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      if (table === 'friend_log_presence' && cols.includes('old_location')) {
        db.exec('UPDATE friend_log_presence SET location=COALESCE(location,old_location)');
      }
      for (const col of ['old_location','location']) {
        if (cols.includes(col) && (col === 'old_location' || table === 'friend_log_status')) {
          db.exec(`ALTER TABLE ${table} DROP COLUMN ${col}`);
        }
      }
    }
    const updateType = db.prepare('UPDATE friend_logs SET type=? WHERE type=?');
    for (const [label, code] of TYPE_CODES) updateType.run(code, label);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const worldExpr = (col) => `CASE WHEN instr(${col}, ':') > 0 THEN substr(${col}, 1, instr(${col}, ':') - 1) ELSE ${col} END`;
  const leaving = "e.type IN ('friend_offline','friend_web_offline')";
  const locationExpr = `COALESCE(l.location,CASE WHEN ${leaving} THEN NULL ELSE p.location END,n.location)`;
  const oldLocationExpr = `COALESCE(l.old_location,CASE WHEN ${leaving} THEN p.location ELSE NULL END)`;
  const from = ` FROM friend_logs e
    LEFT JOIN friend_log_location l ON l.event_id=e.id
    LEFT JOIN friend_log_presence p ON p.event_id=e.id
    LEFT JOIN friend_log_status s ON s.event_id=e.id
    LEFT JOIN friend_log_notifications n ON n.event_id=e.id
    LEFT JOIN friends f ON f.friend_vrchat_id=e.friend_vrchat_id
    LEFT JOIN world_cache w ON w.world_id=${worldExpr(locationExpr)}
    LEFT JOIN world_cache ow ON ow.world_id=${worldExpr(oldLocationExpr)}
    LEFT JOIN group_cache g ON g.group_id=n.group_id`;
  const select = `SELECT e.*, ${locationExpr} AS location, ${oldLocationExpr} AS old_location, p.old_state,p.new_state,s.old_status,s.new_status,s.old_desc,s.new_desc,
    n.notification_id,n.group_id,n.title,n.body,
    COALESCE(g.group_name,f.display_name,e.friend_vrchat_id,n.group_id,'VRChat') AS friend_name,
    f.avatar_url AS friend_avatar,w.world_name,ow.world_name AS old_world_name`;
  const cache = new Map();
  function prepare(sql) {
    if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
    return cache.get(sql);
  }
  function project(row) {
    const old = splitLocation(row.old_location), next = splitLocation(row.location);
    // type 是展示用中文标签, type_code 保留入库的英文代码(筛选/前端按 code 判断用)。
    return { ...row, type_code: row.type, type: Object.hasOwn(TYPE_LABELS, row.type) ? TYPE_LABELS[row.type] : row.type, old_world_id: old.worldId, old_instance_id: old.instanceId,
      world_id: next.worldId, instance_id: next.instanceId,
      old_world_name: old.worldId === 'private' ? '私密世界' : row.old_world_name,
      world_name: next.worldId === 'private' ? '私密世界' : row.world_name };
  }
  const insert = db.prepare('INSERT INTO friend_logs(at,type,friend_vrchat_id,source) VALUES(?,?,?,?)');
  const position = db.prepare('INSERT INTO friend_log_location VALUES(?,?,?)');
  const presence = db.prepare('INSERT INTO friend_log_presence(event_id,old_state,new_state,location) VALUES(?,?,?,?)');
  const status = db.prepare('INSERT INTO friend_log_status(event_id,old_status,new_status,old_desc,new_desc) VALUES(?,?,?,?,?)');
  const notification = db.prepare('INSERT INTO friend_log_notifications(event_id,notification_id,group_id,title,body,location) VALUES(?,?,?,?,?,?)');
  const findNotification = db.prepare('SELECT event_id FROM friend_log_notifications WHERE notification_id=?');
  // 用第 N 个 ID 作边界，清空/迁移造成的 ID 空洞不影响保留条数。
  const trim = db.prepare('DELETE FROM friend_logs WHERE id < (SELECT id FROM friend_logs ORDER BY id DESC LIMIT 1 OFFSET ?)');
  function trimFriendEvents(limit) {
    const n = Math.trunc(Number(limit) || 0);
    return n > 0 ? trim.run(n - 1).changes : 0;
  }
  return {
    addFriendEvent(ev = {}, { limit } = {}) {
      const type = typeCode(ev.type);
      if (!type) throw new Error('addFriendEvent: 缺少 type');
      if (!/^[a-z][a-z0-9_]*$/.test(type)) throw new Error('addFriendEvent: type 必须是英文代码');
      const at = ev.at == null ? Date.now() : Number(ev.at);
      if (!Number.isSafeInteger(at)) throw new Error('addFriendEvent: at 必须是毫秒时间戳');
      if (NOTIFICATIONS.has(type) && ev.notification_id && findNotification.get(ev.notification_id)) return null;
      const oldLocation = ev.old_location !== undefined ? ev.old_location : locationOf(ev.old_world_id, ev.old_instance_id);
      const location = ev.location !== undefined ? ev.location : locationOf(ev.world_id, ev.instance_id);
      db.exec('BEGIN IMMEDIATE');
      try {
        const id = insert.run(at,type,ev.friend_vrchat_id ?? null,ev.source || 'ws').lastInsertRowid;
        if (type === 'location_change') position.run(id,oldLocation,location);
        if (PRESENCE.has(type)) presence.run(id,ev.old_state ?? null,ev.new_state ?? null,location ?? oldLocation);
        if (STATUS.has(type)) status.run(id,ev.old_status ?? null,ev.new_status ?? null,ev.old_desc ?? null,ev.new_desc ?? null);
        if (NOTIFICATIONS.has(type)) notification.run(id,ev.notification_id ?? null,ev.group_id ?? null,ev.title ?? null,ev.body ?? null,location);
        // 兼容调用方已掌握的世界名；只进现有共享缓存，不创建历史快照。
        for (const [wid, name] of [[ev.world_id,ev.world_name],[ev.old_world_id,ev.old_world_name]]) {
          if (wid && name && wid !== 'private') prepare('INSERT OR IGNORE INTO world_cache(world_id,world_name,updated_at) VALUES(?,?,?)').run(wid,name,at);
        }
        trimFriendEvents(limit);
        const row = project(prepare(select + from + ' WHERE e.id=?').get(id));
        db.exec('COMMIT');
        return row;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    trimFriendEvents,
    clearFriendEvents() { return db.prepare('DELETE FROM friend_logs').run().changes; },
    listFriendEvents({ limit = 50, before, offset, page, types, friendId, q, order, favorite } = {}) {
      const lim = Math.max(1, Math.min(500, Math.trunc(Number(limit) || 50)));
      const where = [], params = [];
      if (Array.isArray(types)) {
        if (!types.length) return { events: [], hasMore: false, total: 0 };
        where.push(`e.type IN (${types.map(() => '?').join(',')})`); params.push(...types.map(typeCode));
      }
      if (friendId) { where.push('e.friend_vrchat_id=?'); params.push(String(friendId)); }
      // 特别关注: 已删除好友 join 出来是 NULL, 自然被排除。
      if (favorite) where.push('f.favorite = 1');
      if (q) {
        const like = '%' + String(q).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
        const cols = ['f.display_name','e.friend_vrchat_id','w.world_name','n.title','n.body','g.group_name','n.group_id',locationExpr];
        where.push('(' + cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
        params.push(...cols.map(() => like));
      }
      const filter = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const total = prepare('SELECT COUNT(*) AS c' + from + filter).get(...params).c;
      const sort = String(order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      if (before != null && before !== '' && Number.isFinite(Number(before))) {
        where.push(`e.id ${sort === 'ASC' ? '>' : '<'} ?`);
        params.push(Math.trunc(Number(before)));
      }
      const rowFilter = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const skip = page != null && page !== '' ? Math.max(0,(Math.trunc(Number(page)) || 1)-1)*lim : Math.max(0,Math.trunc(Number(offset)) || 0);
      const rows = prepare(select + from + rowFilter + ` ORDER BY e.id ${sort} LIMIT ? OFFSET ?`).all(...params,lim+1,skip);
      return { events: rows.slice(0,lim).map(project), hasMore: rows.length>lim, total };
    }
  };
}
module.exports = { createFriendEventStore, locationOf };
