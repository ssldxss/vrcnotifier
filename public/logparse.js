'use strict';
// 日志行解析(纯逻辑): 把后端日志行 [时间] [级别] [分类] 正文 拆开。
// 浏览器用 <script src="logparse.js"> 引入(挂 window.VrcLogParse); Node 用 require 引入(单测)。
// 渲染(DOM)在 logpanel.js, 这里只管拆解与分类归一。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcLogParse = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // 分类筛选项的取值集合(顺序即面板里的展示顺序); 未在此列的日志归到 other
  const LOG_CATS = ['startup', 'server', 'auth', 'monitor', 'ws', 'vrcapi', 'world', 'group', 'qq', 'notify', 'avatar', 'status'];

  // 形如 [2026-09-28 21:00:00] [info] [server] 正文
  const LINE_RE = /^\[([^\]]+)\] \[(debug|info|warn|error)\] \[([^\]]+)\] (.*)$/;

  /** 解析一行; 解析不了返回 null(调用方按原文显示, 且不受筛选影响) */
  function parseLogLine(line) {
    const m = LINE_RE.exec(String(line == null ? '' : line));
    if (!m) return null;
    return { time: m[1], level: m[2], cat: m[3], body: m[4] };
  }

  /** 分类 → CSS 类后缀: 未知分类统一 other */
  function catClass(cat) {
    return LOG_CATS.includes(cat) ? cat : 'other';
  }

  /** 时间戳 → HH:mm:ss(用于日志行左侧的短时间) */
  function shortTime(time) {
    return String(time == null ? '' : time).slice(11);
  }

  return { LOG_CATS, parseLogLine, catClass, shortTime };
});
