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
      if (isFavStrict(f)) out.fav.push(f);
      else if (f.state === 'online') out.online.push(f);
      else if (f.state === 'active') out.active.push(f);
      else if (f.state === 'offline') out.offline.push(f);
    }
    out.fav.sort((a, b) => (STATE_RANK[a.state] ?? 3) - (STATE_RANK[b.state] ?? 3));
    return out;
  }

  /**
   * "这个好友应该在哪个组" —— 用于特别关注切换时判断目标组。
   * 注意与 splitGroups 的差异(保留现有行为): 这里沿用真值判断, 未知状态归 offline。
   */
  function groupOf(f) {
    if (f && f.config && f.config.favorite) return 'fav';
    const s = f && f.state;
    return s === 'online' ? 'online' : (s === 'active' ? 'active' : 'offline');
  }

  // ---- 逐好友通知配置 ----
  // 存库形态固定是 0/1(渲染与分组都按 === 1 判), 前端拿到布尔或旧数据都要先归一化。
  const CONFIG_FIELDS = {
    favorite: 'favorite',
    notifyOnline: 'notify_online',
    notifyWebOnline: 'notify_web_online',
    notifyOffline: 'notify_offline',
    notifyStatusChange: 'notify_status_change',
    notifyWorldChange: 'notify_world_change'
  };

  /** 配置归一化成 0/1 的五个字段; 缺字段按 0。用于回滚基线 */
  function normalizeConfig(c) {
    const src = c || {};
    const out = {};
    for (const [camel, snake] of Object.entries(CONFIG_FIELDS)) out[snake] = src[snake] ? 1 : 0;
    return out;
  }

  /**
   * 乐观更新: 按请求体覆盖配置, 只覆盖显式传了的字段(与后端 PUT 的"不传不动"一致)。
   * 返回新对象, 不改入参 —— 调用方要留一份 prev 用于失败回滚。
   */
  function patchConfig(cur, patch) {
    const out = normalizeConfig(cur);
    const p = patch || {};
    for (const [camel, snake] of Object.entries(CONFIG_FIELDS)) {
      if (p[camel] !== undefined) out[snake] = p[camel] ? 1 : 0;
    }
    return out;
  }

  /** 渲染指纹: 搜索词 + 折叠状态 + 好友数据, 三者任一变化都会变 */
  function renderSignature(friends, query, collapsed) {
    return normalizeQuery(query) + '\u0001' + JSON.stringify(collapsed || {}) + '\u0001' + JSON.stringify(friends || []);
  }

  return { STATE_RANK, CONFIG_FIELDS, normalizeQuery, filterPool, splitGroups, groupOf, renderSignature, normalizeConfig, patchConfig };
});
