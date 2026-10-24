'use strict';
// WebSocket 消息速率图(VRCX 同款算法): 60 秒窗口、每秒一个采样点,
// 速率 = 窗口内消息数之和(次/分), 折线按窗口最大值缩放。
// 浏览器用 <script src="wschart.js"> 引入(挂 window.VrcWsChart); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcWsChart = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HISTORY_LEN = 60;

  function emptyHistory(len) {
    return new Array(len === undefined ? HISTORY_LEN : len).fill(0);
  }

  // 滑动窗口: 每秒推进一格; 返回新数组, 不改调用方数据
  function pushSample(history, n) {
    const arr = (history || []).slice();
    arr.shift();
    arr.push(Number(n) || 0);
    return arr;
  }

  // 服务端会每秒补推最近 3 秒(同一 sec 重复出现): 按 sec 幂等更新, 跳秒补 0。
  // 返回新数组与 lastSec, 调用方保存 lastSec 供下一轮去重。
  function ingestSample(history, sec, n, lastSec) {
    const arr = (history || []).slice();
    const s = Number(sec);
    const len = HISTORY_LEN;
    if (!Number.isFinite(s)) return { history: arr, lastSec: lastSec == null ? null : lastSec };
    const prev = lastSec == null ? null : Number(lastSec);
    if (prev != null && s <= prev) {
      if (s === prev && arr.length) arr[arr.length - 1] = Number(n) || 0; // 同一秒迟到修正: 覆盖
      return { history: arr, lastSec: prev };
    }
    if (prev == null) {
      arr.push(Number(n) || 0);
    } else {
      const gap = Math.min(s - prev - 1, len - 1);
      for (let i = 0; i < gap; i++) arr.push(0);
      arr.push(Number(n) || 0);
    }
    while (arr.length > len) arr.shift();
    return { history: arr, lastSec: s };
  }

  // 最近一个窗口内的消息总数 = 每分钟平均次数
  function perMinute(history) {
    let sum = 0;
    for (const n of history || []) sum += Number(n) || 0;
    return sum;
  }

  // VRCX 的折线算法: max 至少按 1 算; 高度用 (h - 2) 留 2px 余量
  function sparklinePoints(history, width, height) {
    const data = history || [];
    if (!data.length) return [];
    const max = Math.max(1, ...data);
    const step = data.length > 1 ? width / (data.length - 1) : 0;
    return data.map((v, i) => ({
      x: i * step,
      y: height - ((Number(v) || 0) / max) * (height - 2)
    }));
  }

  return { HISTORY_LEN, emptyHistory, pushSample, perMinute, sparklinePoints, ingestSample };
});
