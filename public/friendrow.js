'use strict';
// 好友行视图模型: 名字/自定义状态/位置(国旗+世界名+房间类型)/状态点/关心/推送铃铛。
// 纯逻辑, 不碰 DOM; 浏览器用 <script src="friendrow.js"> 引入(挂 window.VrcFriendRow),
// Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./instance'), require('./bellstate'));
  } else {
    root.VrcFriendRow = factory(root.VrcInstance, root.VrcBellState);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (VrcInstance, VrcBellState) {
  const TRUST_CLASS = {
    'Trusted User': 'tl-trusted',
    'Known User': 'tl-known',
    User: 'tl-user',
    'New User': 'tl-new',
    Visitor: 'tl-visitor'
  };

  function placeOf(f, state) {
    if (state === 'online') {
      const loc = VrcInstance.formatLocation({
        worldId: f.world_id,
        worldName: f.world_name,
        instanceId: f.instance_id
      });
      return { kind: 'world', flagClass: loc.flagClass, worldName: loc.worldName, accessLabel: loc.accessLabel };
    }
    return { kind: 'text', text: state === 'active' ? '网页在线' : '离线' };
  }

  function rowModel(f) {
    const friend = f || {};
    const state = friend.display_state || friend.state || 'offline';
    const statusCls = 'status-' + String(friend.status || 'active').replace(/\s+/g, '');
    return {
      name: friend.display_name || friend.friend_vrchat_id || '',
      nameClass: TRUST_CLASS[friend.trust_level] || '',
      statusText: friend.status_description || '',
      dotClasses: 'st-' + state + ' ' + statusCls,
      place: placeOf(friend, state),
      favorite: !!(friend.config && friend.config.favorite === 1),
      bell: VrcBellState.bellState(friend.config)
    };
  }

  // 自己的状态文案: 自定义状态 + 在线状态(游戏中/网页在线/离线)。
  // 社交状态(活跃/加入我/询问我/请勿打扰)不再用文字展示, 只靠头像圆点的颜色表达。
  const SELF_PRESENCE = { online: '游戏中', active: '网页在线', offline: '离线' };

  function selfStateText(user) {
    const u = user || {};
    const state = u.state || 'offline';
    const parts = [];
    if (u.status_description) parts.push(u.status_description);
    parts.push(SELF_PRESENCE[state] || '离线');
    return parts.join(' · ');
  }

  function selfDotClasses(user) {
    const u = user || {};
    const state = u.state || 'offline';
    const status = 'status-' + String(u.status || 'active').replace(/\s+/g, '');
    return 'st-' + state + ' ' + status;
  }

  return { rowModel, selfStateText, selfDotClasses };
});
