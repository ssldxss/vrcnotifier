'use strict';
// vrcnotifier 前端日志窗口裁剪策略: 直播与翻页两条路径统一的总行数上限。
// 方向感知裁剪: 总是裁远离当前浏览焦点的一侧, 被裁内容均可按需再生 ——
//   live 模式(新行插到顶部, 焦点在顶): 裁底部最老行; 需要时经 before 翻页拉回;
//   older 模式(旧行追加到底部, 焦点在底): 裁顶部最新行; 需要时经 tail 重载/SSE 拉回。
// 浏览器用 <script src="logview.js"> 引入(挂 window.VrcLogView); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcLogView = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_ROWS = 5000; // 日志面板 DOM 总行数上限

  /**
   * 计算裁剪方案。
   * totalRows: 当前 DOM 数据行总数; maxRows: 上限(默认 5000);
   * mode: 'live'(直播加行) | 'older'(翻页加行), 缺省按 live。
   * 返回 { side: 'bottom'|'top', count }: 从哪一侧裁几行, count=0 表示无需裁剪。
   */
  function plan({ totalRows, maxRows = MAX_ROWS, mode }) {
    const total = Number.isFinite(totalRows) && totalRows > 0 ? totalRows : 0;
    const cap = Number.isFinite(maxRows) && maxRows > 0 ? maxRows : MAX_ROWS;
    const count = Math.max(0, total - cap);
    return { side: mode === 'older' ? 'top' : 'bottom', count };
  }

  return { MAX_ROWS, plan };
});
