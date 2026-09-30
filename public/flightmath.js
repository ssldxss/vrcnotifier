'use strict';
// 「飞跃」位移的时间-距离曲线(纯数学, 不碰 DOM)。
// 浏览器用 <script src='flightmath.js'> 引入(挂 window.VrcFlight); Node 用 require 引入(单测)。
//
// 剖面(与 00a09dd 那版 FLIP 飞行逐字一致, 见 .verify/frontend-baseline/app.js:1206-1241):
//   起步瞬间加速度为 0、随后 t³ 增大, 0.2s(ACCEL) 内达到峰值速度 PEAK, 之后匀速巡航,
//   末尾 0.2s 对称减速; 距离越远飞得越久, 但封顶 MAX_DUR。
//   短距离(< 2*ACC_DIST)退化成"纯对称加速-减速", 没有匀速段, 且不短于 MIN_DUR。
// 抽出成模块的理由: 这段是最容易出现"到点不停/过冲错位/首尾不落在 0 和 1"的地方,
// 而它完全不依赖浏览器 —— 放在这里就能用 node:test 把边界钉死。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcFlight = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PEAK = 7;                     // px/ms 峰值速度
  const ACCEL = 200;                  // 加速段(也是减速段)时长 ms
  const ACC_DIST = PEAK * ACCEL / 3;  // 加速段覆盖距离(≈466.7px)
  const MIN_DUR = 160;                // 最短时长 ms(再近也要看得见)
  const MAX_DUR = 2400;               // 最长时长 ms(再远也不让人等)
  const CRUISE_MIN = 2 * ACC_DIST;    // 超过这个距离才有匀速段

  /** 距离 d(px) → { d, T(总时长 ms), A(加/减速段时长 ms), cruise(是否有匀速段) } */
  function plan(d) {
    const dist = Number.isFinite(d) ? Math.abs(d) : 0;
    if (dist >= CRUISE_MIN) {
      return { d: dist, T: Math.min(MAX_DUR, 2 * ACCEL + (dist - CRUISE_MIN) / PEAK), A: ACCEL, cruise: true };
    }
    const T = Math.max(MIN_DUR, 2 * ACCEL * (dist / CRUISE_MIN));
    return { d: dist, T, A: T / 2, cruise: false };
  }

  /**
   * 进度(0→1): t 毫秒时已飞过的比例。
   * t 会被截断到 T —— 到点即停, 继续积分会过冲错位(旧版踩过这个坑)。
   */
  function progress(t, p) {
    if (!p || !(p.d > 0) || !(p.T > 0)) return 1;
    const tc = Math.min(t, p.T);
    if (tc <= 0) return 0;
    if (p.cruise) {
      if (tc <= p.A) return (PEAK * tc * tc * tc / (3 * p.A * p.A)) / p.d;
      if (tc <= p.T - p.A) return (ACC_DIST + PEAK * (tc - p.A)) / p.d;
      const tau = p.T - tc;
      return 1 - (PEAK * tau * tau * tau / (3 * p.A * p.A)) / p.d;
    }
    if (tc <= p.A) return 0.5 * Math.pow(tc / p.A, 3);
    return 1 - 0.5 * Math.pow((p.T - tc) / p.A, 3);
  }

  /** 剩余位移系数(1→0): 直接乘旧位置-新位置的差, 就是当前该写的 transform */
  function remain(t, p) { return 1 - progress(t, p); }

  return { PEAK, ACCEL, ACC_DIST, MIN_DUR, MAX_DUR, CRUISE_MIN, plan, progress, remain };
});
