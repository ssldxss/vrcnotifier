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
  return { FRIEND_CONFIG, SETTINGS, SSE_EVENTS };
});
