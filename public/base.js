'use strict';
// 公共底座: DOM 快捷方式 + 本地存储键 + HTML 转义。
//
// ⚠️ 本文件必须最先加载(index.html 里排第一个)。
// 原因: 拆出去的模块在"加载期"就会用到 $ / $$(注册事件监听、取节点),
// 而 const 声明不像 function 声明那样提升, 更早执行的脚本引用它会直接 ReferenceError ——
// 那种错误只在交互时才暴露(监听器没绑上), 所以顺序必须固定在这里。

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const LS_BASE = 'vrcn_base';   // 后端地址
const LS_TOKEN = 'vrcn_token'; // 访问令牌

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 拼进 HTML 属性值(如 data-id="..."): 在 escapeHtml 基础上再挡引号
function escapeAttr(v) {
  return escapeHtml(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
