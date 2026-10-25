'use strict';
// 好友列表纯逻辑: 分组 / 搜索过滤 / 排序 / 渲染指纹。
// 原先散在 app.js 的 renderFriends / expandGroupFor 里, 抽出来后浏览器与 Node 测试共用。
// 浏览器用 <script src="friendmodel.js"> 引入(挂 window.VrcFriendModel); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcFriendModel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // 特别关注组内排序: 在线 → 网页在线 → 离线(未知状态排最后)
  const STATE_RANK = { online: 0, active: 1, offline: 2 };

  // 展示态: 服务端给的 display_state(pending 时 = 待确认的目标态)优先, 兼容没有该字段的调用方
  function stateOf(f) {
    return (f && (f.display_state || f.state)) || null;
  }

  /** 搜索关键词规范化: 去空白 + 转小写; null/undefined 当空串 */
  function normalizeQuery(q) {
    return String(q == null ? '' : q).trim().toLowerCase();
  }

  /** 按关键词过滤: 命中昵称/世界名/自定义状态任一即可; 空关键词返回原数组 */
  function filterPool(friends, query) {
    const kw = normalizeQuery(query);
    if (!kw) return friends;
    return friends.filter((f) =>
      (f.display_name || '').toLowerCase().includes(kw) ||
      (f.world_name || '').toLowerCase().includes(kw) ||
      (f.status_description || '').toLowerCase().includes(kw));
  }

  /** 渲染分组用的"特别关注"判定: 沿用 === 1(布尔 true 不算) */
  function isFavStrict(f) {
    return !!(f && f.config && f.config.favorite === 1);
  }

  /**
   * 先过滤再分组。注意两处沿用现有渲染行为:
   * 1) 未知状态既不进任何组(直接丢弃);
   * 2) 只有特别关注组内排序, 其余组保持入参顺序。
   */
  function splitGroups(friends, query) {
    const out = { fav: [], online: [], active: [], offline: [] };
    for (const f of filterPool(friends, query)) {
      const s = stateOf(f);
      if (isFavStrict(f)) out.fav.push(f);
      else if (s === 'online') out.online.push(f);
      else if (s === 'active') out.active.push(f);
      else if (s === 'offline') out.offline.push(f);
    }
    out.fav.sort((a, b) => (STATE_RANK[stateOf(a)] ?? 3) - (STATE_RANK[stateOf(b)] ?? 3));
    return out;
  }

  /**
   * "这个好友应该在哪个组" —— 用于特别关注切换时判断目标组。
   * 注意与 splitGroups 的差异(保留现有行为): 这里沿用真值判断, 未知状态归 offline。
   */
  function groupOf(f) {
    if (f && f.config && f.config.favorite) return 'fav';
    const s = stateOf(f);
    return s === 'online' ? 'online' : (s === 'active' ? 'active' : 'offline');
  }

  // A state event replaces a complete friend DTO. Historical events never enter here.
  function applyFriendState(friends, update) {
    if (!update || !update.friend_vrchat_id) return friends;
    const id = update.friend_vrchat_id;
    const index = friends.findIndex((f) => f.friend_vrchat_id === id);
    if (!update.friend) return index < 0 ? friends : friends.filter((f) => f.friend_vrchat_id !== id);
    if (update.friend.friend_vrchat_id !== id) return friends;
    if (index < 0) return [...friends, update.friend];
    const next = friends.slice();
    next[index] = update.friend;
    return next;
  }

  /** 渲染指纹: 搜索词 + 折叠状态 + 好友数据, 三者任一变化都会变 */
  function renderSignature(friends, query, collapsed) {
    return normalizeQuery(query) + '\u0001' + JSON.stringify(collapsed || {}) + '\u0001' + JSON.stringify(friends || []);
  }

  return { applyFriendState, STATE_RANK, stateOf, normalizeQuery, filterPool, splitGroups, groupOf, renderSignature };
});
