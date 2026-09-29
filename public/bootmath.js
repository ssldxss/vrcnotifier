'use strict';
// 登录等待页的纯计算: 真实进度目标值 + 百分比里程表推进。
// 浏览器用 <script src="bootmath.js"> 引入(挂 window.VrcBootMath); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcBootMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * 后端报的 已拉条数/总数 → 目标百分比; 向下取整不虚报。
   * 总数非法(0/负/非数字)时返回 null —— 一条真实进度都没收到就不显示数字。
   */
  function percentTarget(fetched, total) {
    if (!(total > 0)) return null;
    return Math.min(100, Math.floor((fetched / total) * 100));
  }

  /** 里程表只增不减: 目标比当前小或相等都不重设(重设会打断正在滚的数字) */
  function shouldAdvance(current, next) {
    return current === null || current === undefined || next > current;
  }

  /**
   * 里程表这一轮该显示到哪: 起点 + 按经过时间每 perNumMs 走一个数, 到目标即封顶。
   * perNumMs 非正数时原地不动(不除零、不倒退)。
   */
  function odometerWant(from, elapsedMs, perNumMs, target) {
    if (!(perNumMs > 0)) return from;
    return Math.min(target, from + Math.floor(elapsedMs / perNumMs));
  }

  return { percentTarget, shouldAdvance, odometerWant };
});
