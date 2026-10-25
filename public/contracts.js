'use strict';
// Shared wire contracts. Browser and server consume the same field and event names.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VrcContracts = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FRIEND_CONFIG = [
    ['favorite', 'favorite', '特别关注'],
    ['notify_online', 'notifyOnline', '上线'],
    ['notify_web_online', 'notifyWebOnline', '网页上线'],
    ['notify_offline', 'notifyOffline', '下线'],
    ['notify_status_change', 'notifyStatusChange', '状态变化'],
    ['notify_world_change', 'notifyWorldChange', '世界变化']
  ];
  const SETTINGS = [
    ['qq_enabled', 'qqEnabled', 'boolean'],
    ['qq_app_id', 'qqAppId', 'string'],
    ['qq_app_secret', 'qqAppSecret', 'string'],
    ['notify_group_announcement', 'notifyGroupAnnouncement', 'boolean'],
    ['notify_boop', 'notifyBoop', 'boolean'],
    ['notify_invite', 'notifyInvite', 'boolean'],
    ['friend_event_limit', 'friendEventLimit', 'limit']
  ];
  const SSE_EVENTS = [
    'status', 'self-state', 'friend-state', 'friend-event', 'snapshot', 'world-name',
    'ws-stats', 'ws-failure', 'ws-recovered', 'health', 'log', 'log-update',
    'qq-status', 'notification', 'relogin-ok', '2fa-needed', 'login-progress', 'session-expired'
  ];
  const STATE_LABELS = { offline: '离线', active: '网页在线', online: '在线', web: '网页在线', unknown: '未知' };
  const EVENT_TYPES = [
    ['friend_online', '上线', 'presence'], ['friend_offline', '下线', 'presence'],
    ['friend_web_online', '网页上线', 'presence'], ['friend_web_offline', '网页下线', 'presence'],
    ['status_change', '状态变化', 'status'], ['status_description_change', '自定义状态', 'status'],
    ['location_change', '切换世界', 'location'], ['group_announcement', '群组公告', 'notification'],
    ['boop', '戳一戳', 'notification'], ['invite', '世界邀请', 'notification'], ['request_invite', '请求邀请', 'notification'],
    ['name_change', '改名', 'other'], ['trust_level_change', '信任等级变化', 'other'],
    ['friend_added', '新增好友', 'other'], ['friend_removed', '好友移除', 'other']
  ];
  const EVENT_LABELS = Object.fromEntries(EVENT_TYPES.map(([code, label]) => [code, label]));
  const EVENT_CODES = Object.fromEntries(EVENT_TYPES.map(([code, label]) => [label, code]));
  Object.assign(EVENT_CODES, { '位置变动': 'location_change', 'web端上线': 'friend_web_online', 'web端下线': 'friend_web_offline' });
  const eventCodesOf = (kind) => EVENT_TYPES.filter(([, , k]) => kind === k).map(([code]) => code);
  return { FRIEND_CONFIG, SETTINGS, SSE_EVENTS, STATE_LABELS, EVENT_TYPES, EVENT_LABELS, EVENT_CODES, eventCodesOf };
});
