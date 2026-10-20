'use strict';
// 好友列表虚拟滚动用的扁平项模型: 分组标题 + 好友行(折叠组只保留标题)。
// 纯逻辑, 不碰 DOM; 浏览器用 <script src="friendlayout.js">(挂 window.VrcFriendLayout),
// Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcFriendLayout = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GROUPS = [
    ['fav', '⭐ 特别关注', false],
    ['online', '在线', false],
    ['active', '网页在线', false],
    ['offline', '离线', true]
  ];

  // groups: friendmodel.splitGroups 的结果 { fav:[], online:[], active:[], offline:[] }
  // collapsed: { [key]: bool } 显式折叠状态; 未指定用分组默认值
  function layout(groups, collapsed) {
    const state = collapsed || {};
    const out = [];
    for (const [key, title, defaultCollapsed] of GROUPS) {
      const list = (groups && groups[key]) || [];
      if (!list.length) continue;
      const isCollapsed = state[key] !== undefined ? state[key] : defaultCollapsed;
      out.push({ type: 'group', key, title, count: list.length, collapsed: isCollapsed });
      if (isCollapsed) continue;
      for (const friend of list) out.push({ type: 'friend', groupKey: key, friend });
    }
    return out;
  }

  return { GROUPS, layout };
});
