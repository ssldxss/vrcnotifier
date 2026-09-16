'use strict';
// vrcnotifier 前端外链构造: 好友/自己的头像、昵称、世界名点开对应 VRChat 网页。
// 与页面既有的 GitHub / QQ 开放平台外链同一套做法(见 index.html 与 app.js):
// 输出 <span class='ext-link' data-href=...>, 由 app.js 的委托点击 handler 经 window.open 打开。
// 刻意不用 <a>: 超链接可聚焦, 点完焦点留在上面会命中 .friend:focus-within 把行高亮卡住;
// 且全局 a:hover 会加下划线, 与既有外链观感不一致。
// id 来自服务端数据, 拼进 data-href 前一律白名单校验; 不合法就不生成 ext-link, 只回退成纯文本。
// 浏览器用 <script src="vrclinks.js"> 引入(挂 window.VrcLinks); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcLinks = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BASE = 'https://vrchat.com';
  // VRChat 标识: usr_<uuid> / wrld_<uuid>。只放行这套字符集, 其它一律视为不合法。
  const USER_RE = /^usr_[A-Za-z0-9-]+$/;
  const WORLD_RE = /^wrld_[A-Za-z0-9-]+$/;
  const TITLE = { user: '在 VRChat 网页打开个人资料', world: '在 VRChat 网页打开世界页面' };

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** 用户个人页 URL; id 不合法返回 null */
  function userUrl(id) {
    const s = String(id == null ? '' : id);
    return USER_RE.test(s) ? BASE + '/home/user/' + s : null;
  }

  /** 世界页 URL; id 不合法返回 null(如哨兵 'private'、离线时的 null) */
  function worldUrl(id) {
    const s = String(id == null ? '' : id);
    return WORLD_RE.test(s) ? BASE + '/home/world/' + s : null;
  }

  function urlOf(kind, id) {
    if (kind === 'world') return worldUrl(id);
    if (kind === 'user') return userUrl(id);
    return null;
  }

  function linkTag(href, title, inner) {
    return "<span class='ext-link' data-href='" + href + "' title='" + title + "'>" + inner + '</span>';
  }

  /**
   * 生成可点文本。kind: 'user' | 'world'; text 会被转义。
   * URL 不合法时退化为纯转义文本(不可点), 调用方无需自己判空。
   */
  function linkHtml(kind, id, text) {
    const html = escapeHtml(text);
    const href = urlOf(kind, id);
    return href ? linkTag(href, TITLE[kind] || TITLE.user, html) : html;
  }

  /**
   * 用已构造好的安全 HTML 包一层可点区域(头像这类非文本内容)。
   * innerHtml 必须是调用方自己生成、已转义的内容 —— 本函数原样嵌入, 不做转义。
   */
  function wrapHtml(kind, id, innerHtml) {
    const href = urlOf(kind, id);
    return href ? linkTag(href, TITLE[kind] || TITLE.user, innerHtml) : innerHtml;
  }

  return { BASE, userUrl, worldUrl, linkHtml, wrapHtml };
});
