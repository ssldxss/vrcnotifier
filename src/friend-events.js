'use strict';
// Runtime history repository. Schema upgrades live in migrations.js.
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
