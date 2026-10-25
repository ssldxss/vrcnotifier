'use strict';
const { toThumbUrl } = require('./avatar');
const { displayState, isPending, pendingLabel } = require('./presence');
const { configOf } = require('./api-contract');

const FRIEND_FIELDS = ['id', 'friend_vrchat_id', 'display_name', 'avatar_url', 'state', 'status',
  'world_id', 'instance_id', 'status_description', 'platform', 'trust_level', 'pending_state',
  'pending_at', 'last_seen', 'created_at', 'updated_at'];
const USER_FIELDS = ['id', 'vrchat_user_id', 'username', 'display_name', 'avatar_url', 'state',
  'status', 'status_description', 'platform', 'world_id', 'last_seen', 'remember_me', 'created_at', 'updated_at'];
const EVENT_FIELDS = ['id', 'at', 'type', 'type_code', 'friend_vrchat_id', 'source',
  'location', 'old_location', 'old_state', 'new_state', 'old_status', 'new_status', 'old_desc', 'new_desc',
  'notification_id', 'group_id', 'title', 'body', 'friend_name', 'friend_avatar',
  'world_id', 'instance_id', 'world_name', 'old_world_id', 'old_instance_id', 'old_world_name'];
const pick = (row, fields) => Object.fromEntries(fields.map((key) => [key, row[key] ?? null]));

// Explicit public DTOs prevent new database columns from silently becoming API fields.
// The same serializer is used for HTTP snapshots and realtime state replacements.
function createClientDtos({ worldName = null, avatarCache = null } = {}) {
  const nameOf = (id) => id && id !== 'private' && worldName ? worldName.peek(id) : null;
  const avatarKey = (url) => {
    const thumb = toThumbUrl(url);
    return thumb && avatarCache ? avatarCache.thumbKeyFromUrl(thumb) : null;
  };
  function friendRow(row) {
    if (!row) return null;
    return { ...pick(row, FRIEND_FIELDS), world_name: nameOf(row.world_id),
      display_state: displayState(row), pending: isPending(row), pending_label: pendingLabel(row),
      avatarKey: avatarKey(row.avatar_url), config: configOf(row) };
  }
  function selfUserForClient(row) {
    if (!row) return null;
    return { ...pick(row, USER_FIELDS), world_name: nameOf(row.world_id), avatarKey: avatarKey(row.avatar_url) };
  }
  function eventRow(row) {
    const out = pick(row, EVENT_FIELDS);
    for (const prefix of ['', 'old_']) {
      const id = out[prefix + 'world_id'];
      if (!out[prefix + 'world_name'] && id) out[prefix + 'world_name'] = id === 'private' ? '私密世界' : nameOf(id);
    }
    out.avatarKey = avatarKey(out.friend_avatar);
    return out;
  }
  return { friendRow, selfUserForClient, eventRow };
}

module.exports = { createClientDtos };
