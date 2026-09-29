'use strict';
// 丝滑滚动(惯性滚动)的纯数学: 滚轮增量归一化 / 目标夹取 / 指数趋近 / 收敛判定。
// 浏览器用 <script src="scrollmath.js"> 引入(挂 window.VrcScroll); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcScroll = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * 把 wheel 事件的增量统一成像素。
   * deltaMode: 0=像素, 1=行(×16), 2=页(×0.9 屏, 方向跟原增量)。
   * 注意: 页模式下增量为 0 时按"向下"处理 —— 沿用现有行为, 不改。
   */
  function normalizeWheelDelta(deltaY, deltaMode, innerHeight) {
    const d = deltaY || 0;
    if (deltaMode === 1) return d * 16;
    if (deltaMode === 2) return innerHeight * (d > 0 ? 0.9 : -0.9);
    return d;
  }

  /** 滚动位置夹在 [0, max] 内 */
  function clampScroll(y, max) {
    return Math.max(0, Math.min(max, y));
  }

  /** 指数趋近: 每帧吃掉剩余距离的 10%(尾段自然减速) */
  function approach(current, target) {
    return current + (target - current) * 0.1;
  }

  /** 剩余距离小于 0.3px 就算停住(直接对齐到目标并结束 rAF) */
  function isSettled(current, target) {
    return Math.abs(target - current) < 0.3;
  }

  return { normalizeWheelDelta, clampScroll, approach, isSettled };
});
