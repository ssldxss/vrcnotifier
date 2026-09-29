'use strict';
// 虚拟列表的纯计算: 行高模型 / 前缀和定位 / 可见区间 / 占位高度 / 换组集合。
// 这些是虚拟化最容易算错的地方(区间算错就会露白或错位), 且完全不碰 DOM, 所以单独成模块并单测。
// 浏览器用 <script src="vlist.js"> 引入(挂 window.VrcVList); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcVList = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** 未测量行的估计高: 用已测量行的均值, 一行都没测到过就用兜底值 */
  function estimateHeight({ sum, count, fallback }) {
    if (!(count > 0)) return fallback;
    return sum / count;
  }

  /** 前缀和: offsets[i] = 前 i 行的总高; 长度 = 行数 + 1 */
  function buildOffsets(heights) {
    const n = heights.length;
    const out = new Array(n + 1);
    out[0] = 0;
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += heights[i]; out[i + 1] = acc; }
    return out;
  }

  /** dy(相对组内容顶部) 落在第几行; 超出末尾归最后一行, 空列表返回 -1 */
  function indexAt(offsets, dy) {
    const n = offsets.length - 1;
    if (n <= 0) return -1;
    if (!(dy > 0)) return 0;
    if (dy >= offsets[n]) return n - 1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= dy) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /**
   * 需要渲染的行区间(含上下 overscan)。
   * 返回 null 表示这组完全不在视口里 —— 此时调用方仍必须用空白把组高撑住, 否则页面会塌。
   */
  function visibleRange({ offsets, groupTop, scrollTop, viewportH, overscan }) {
    const n = offsets.length - 1;
    const total = offsets[n];
    if (!(n > 0) || !(total > 0)) return null;
    const relTop = scrollTop - overscan - groupTop;
    const relBottom = scrollTop + viewportH + overscan - groupTop;
    if (relBottom <= 0 || relTop >= total) return null;
    return {
      from: indexAt(offsets, Math.max(0, relTop)),
      to: indexAt(offsets, Math.min(total - 0.001, relBottom))
    };
  }

  /** 未渲染部分的占位高度(挂在组内容的首/尾); 一行都不渲染时整组高度挂顶部 */
  function spacersFor({ offsets, from, to }) {
    const n = offsets.length - 1;
    if (!(n > 0)) return { before: 0, after: 0 };
    const total = offsets[n];
    if (to < from) return { before: total, after: 0 };
    return { before: offsets[from], after: total - offsets[to + 1] };
  }

  /** 两次数据之间各好友的分组变化: 换组 / 新进来 / 消失(只有换组的才需要淡入淡出) */
  function groupChanges(before, after) {
    const moved = [];
    const entered = [];
    const left = [];
    for (const id of Object.keys(after)) {
      if (!(id in before)) entered.push(id);
      else if (before[id] !== after[id]) moved.push(id);
    }
    for (const id of Object.keys(before)) if (!(id in after)) left.push(id);
    return { moved, entered, left };
  }

  /**
   * 渲染范围 = 可见范围上下各留 buffer 行, 夹紧到 [0, count-1]。
   * 双层范围的意义: 可见范围每跨一行就算"变了", 但渲染范围只要还覆盖得住就不动 DOM ——
   * 这样滚动过程中绝大多数帧一个节点都不动, 正在播的动画不会被重建打断。
   */
  function renderRange({ inView, from, to, count, buffer }) {
    const r = inView === undefined ? (from === undefined ? null : { from, to }) : inView;
    if (!r || r.to < r.from) return null;
    if (!(count > 0)) return null;
    const b = buffer || 0;
    return { from: Math.max(0, r.from - b), to: Math.min(count - 1, r.to + b) };
  }

  /** 两个范围是否是同一个(用来判断"可见范围到底变没变") */
  function sameRange(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.from === b.from && a.to === b.to;
  }

  /** 新旧渲染窗口的节点增删计划: 交集复用(保住 DOM 节点 = 保住正在播的动画), 只增删差集 */
  function reconcileIds(oldIds, newIds) {
    const oldSet = new Set(oldIds);
    const newSet = new Set(newIds);
    return {
      create: newIds.filter((id) => !oldSet.has(id)),
      remove: oldIds.filter((id) => !newSet.has(id)),
      keep: newIds.filter((id) => oldSet.has(id))
    };
  }

  return { estimateHeight, buildOffsets, indexAt, visibleRange, spacersFor, groupChanges, renderRange, sameRange, reconcileIds };
});
