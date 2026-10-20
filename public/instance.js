'use strict';
// 位置/实例解析纯逻辑: 从 VRChat 的 location / instanceId 里解析房间类型、地区等。
// 房间类型标签来自 instance 字符串里的访问标签(公开/好友/好友+/私密/邀请+/群组),
// 地区来自 ~region(xx)。浏览器用 <script src="instance.js"> 引入(挂 window.VrcInstance);
// Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcInstance = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parseInstance(instanceId) {
    const tags = String(instanceId == null ? '' : instanceId).split('~').slice(1);
    let access = 'public';
    let groupId = null;
    let groupAccess = null;
    let region = null;
    let ageGate = false;
    for (const tag of tags) {
      if (tag.startsWith('friends(')) access = 'friends';
      else if (tag.startsWith('hidden(')) access = 'friends+';
      else if (tag.startsWith('private(')) access = 'private';
      else if (tag.startsWith('canRequestInvite')) access = 'invite+';
      else if (tag.startsWith('group(')) groupId = tag.slice(6, -1);
      else if (tag.startsWith('groupAccessType(')) groupAccess = tag.slice(16, -1);
      else if (tag.startsWith('region(')) region = tag.slice(7, -1);
      else if (tag === 'ageGate') ageGate = true;
    }
    if (groupId) access = 'group';
    return { access, groupId, groupAccess, region, ageGate };
  }

  function parseLocation(location) {
    const raw = location == null ? '' : String(location);
    if (!raw) return { worldId: null, instanceId: null };
    const i = raw.indexOf(':');
    if (i < 0) return { worldId: raw, instanceId: null };
    return { worldId: raw.slice(0, i), instanceId: raw.slice(i + 1) || null };
  }

  const ACCESS_LABELS = {
    public: '公开',
    friends: '好友',
    'friends+': '好友+',
    private: '私密',
    'invite+': '邀请+'
  };
  const GROUP_ACCESS_LABELS = { public: '公开', plus: '+', members: '成员' };

  // VRChat 地区代码 -> 国旗 class: us=美国, use=美国东部, usw=美国西部, 三者共用星条旗
  const REGION_FLAGS = { jp: 'jp', us: 'us', use: 'us', usw: 'us', eu: 'eu' };

  function formatLocation(location) {
    const worldId = location && location.worldId;
    if (!worldId) return { flagClass: null, worldName: null, accessLabel: null };
    if (worldId === 'private') return { flagClass: null, worldName: '私密世界', accessLabel: null };
    if (worldId === 'traveling') return { flagClass: null, worldName: '正在传送', accessLabel: null };
    const instanceId = location.instanceId;
    const info = instanceId ? parseInstance(instanceId) : null;
    return {
      flagClass: info ? regionFlagClass(info.region) : null,
      worldName: location.worldName || null,
      accessLabel: info ? accessLabel(info) : null
    };
  }

  function regionFlagClass(region) {
    const r = region == null ? '' : String(region).toLowerCase();
    if (!r) return null;
    return REGION_FLAGS[r] || 'unknown';
  }

  function accessLabel(info) {
    const access = info && info.access;
    if (access === 'group') {
      const level = info.groupAccess && GROUP_ACCESS_LABELS[info.groupAccess];
      return level ? '群组 ' + level : '群组';
    }
    return ACCESS_LABELS[access] || '公开';
  }

  return { parseInstance, parseLocation, accessLabel, regionFlagClass, formatLocation };
});
