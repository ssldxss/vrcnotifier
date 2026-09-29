'use strict';
// 概览卡片上的两个纯映射: 后端延迟分级、VRChat 服务器状态徽章文案/配色。
// 浏览器用 <script src="statusmodel.js"> 引入(挂 window.VrcStatus); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcStatus = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** 延迟着色: 1-200 绿, 201-800 黄, 其余(0/负值/超 800/非数字)红 */
  function latencyClass(ms) {
    if (ms >= 1 && ms <= 200) return 'lat-ok';
    if (ms >= 201 && ms <= 800) return 'lat-warn';
    return 'lat-bad';
  }

  /**
   * VRChat 服务器状态 → 徽章文案与配色。
   * 注意: "后端没返回数据"不是这里的 unknown —— 那种情况调用方显示 '-' 并保留灰底。
   */
  function vrcBadge(state) {
    if (state === 'unknown') return { text: '无法获取', cls: 'badge' };
    if (state === 'normal') return { text: '正常', cls: 'badge ok' };
    if (state === 'outage') return { text: '故障', cls: 'badge bad' };
    return { text: '降级', cls: 'badge warn' };
  }

  return { latencyClass, vrcBadge };
});
