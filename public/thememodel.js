'use strict';
// 主题三态(自动/浅色/深色)的纯逻辑。
// 浏览器用 <script src="thememodel.js"> 引入(挂 window.VrcTheme); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcTheme = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** 首屏用的主题: 没存过就是深色(与 index.html 里那段内联脚本的默认一致) */
  function initialTheme(stored) {
    return stored || 'dark';
  }

  /** 点按钮时的循环: 深色 → 自动 → 浅色 → 深色; 空值按默认深色处理 */
  function nextTheme(cur) {
    const c = cur || 'dark';
    return c === 'dark' ? 'auto' : (c === 'auto' ? 'light' : 'dark');
  }

  /** 该往 <html> 上写的 data-theme 值; 自动模式返回 null 表示"不写, 交给系统" */
  function themeAttr(mode) {
    return mode === 'auto' ? null : mode;
  }

  return { initialTheme, nextTheme, themeAttr };
});
