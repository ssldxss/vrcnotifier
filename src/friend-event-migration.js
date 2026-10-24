'use strict';
// One-time legacy history upgrade, run inside the migration runner transaction.
const { EVENT_CODES } = require('../public/contracts');
const TYPE_CODES = new Map(Object.entries(EVENT_CODES));

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

function migrateFriendEvents(db) {
  // 表名统一为日志；旧宽表和此前的分类结构都可无损升级。
  // 改名及重建在同一事务内，SQLite 会同步更新子表外键与自增序列。
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
}

module.exports = { migrateFriendEvents };
