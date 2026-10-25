'use strict';
// 好友行右侧「推送铃铛」状态: 全关灰空心 / 任意开启黄空心 /
// 状态变化或下线黄实心 / 切换世界或网页上线红实心（后者覆盖前者）。
// 浏览器用 <script src="bellstate.js"> 引入(挂 window.VrcBellState); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./contracts'));
  } else {
    root.VrcBellState = factory(root.VrcContracts);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contracts) {
  const ALL_FIELDS = Contracts.FRIEND_CONFIG.filter(([key]) => key !== 'favorite').map(([key]) => key);
  // 优先级: 红实心 > 黄实心 > 黄空心 > 灰空心
  const RED_FIELDS = ['notify_world_change', 'notify_web_online'];
  const AMBER_SOLID_FIELDS = ['notify_offline', 'notify_status_change'];

  function bellState(config) {
    const c = config || {};
    const on = (key) => c[key] === 1 || c[key] === true;
    if (!ALL_FIELDS.some(on)) return 'off';
    if (RED_FIELDS.some(on)) return 'bad';
    if (AMBER_SOLID_FIELDS.some(on)) return 'warn-solid';
    return 'warn';
  }

  return { bellState, ALL_FIELDS, RED_FIELDS, AMBER_SOLID_FIELDS };
});
