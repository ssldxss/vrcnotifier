'use strict';
// 好友动态列表的纯数据逻辑: 实时事件合并/去重/排序。
// 日志按自增 id 排序(与后端游标一致), 同一 id 只保留一条。
// 浏览器用 <script src="feedstore.js"> 引入(挂 window.VrcFeedStore); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcFeedStore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const byIdDesc = (a, b) => b.id - a.id;

  // 合并已有列表与新增事件: 去重(按 id)、倒序, added = 真正新出现的条数
  function mergeEvents(existing, incoming) {
    const map = new Map();
    for (const e of existing || []) map.set(e.id, e);
    let added = 0;
    for (const e of incoming || []) {
      if (!map.has(e.id)) added++;
      map.set(e.id, e);
    }
    return { events: [...map.values()].sort(byIdDesc), added };
  }

  return { mergeEvents };
});
