'use strict';
// 极简 Cookie Jar: 解析 Set-Cookie、按域/路径/过期时间匹配、序列化持久化。
// 供 fetch 客户端使用(模拟浏览器 cookie 行为, 足够 VRChat API 使用)。

class Cookie {
  constructor(name, value, attrs = {}) {
    this.name = name;
    this.value = value;
    this.domain = (attrs.domain || '').replace(/^\./, '').toLowerCase(); // 去前导点
    this.path = attrs.path || '/';
    this.expires = attrs.expires ? new Date(attrs.expires).getTime() : null;
    this.secure = !!attrs.secure;
    this.httpOnly = !!attrs.httpOnly;
  }
  expired(now = Date.now()) {
    return this.expires !== null && this.expires <= now;
  }
}

class CookieJar {
  constructor() {
    this.cookies = [];
  }

  /** 解析一个或多个 Set-Cookie 头并入库; url 用于默认域(无 Domain 属性时) */
  setCookies(setCookieHeaders, url) {
    const host = safeHost(url);
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const raw of list) {
      if (!raw) continue;
      const parts = String(raw).split(';').map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      const pair = parts.shift();
      const eq = pair.indexOf('=');
      if (eq <= 0) continue; // 无 name=value 或 name 为空
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const attrs = {};
      for (const attr of parts) {
        const a = attr.indexOf('=');
        const key = (a === -1 ? attr : attr.slice(0, a)).toLowerCase();
        const val = a === -1 ? '' : attr.slice(a + 1);
        attrs[key] = val;
      }
      if (!attrs.domain) attrs.domain = host;
      const cookie = new Cookie(name, value, attrs);
      // 浏览器语义: 同名 + 同域 + 同路径的 cookie 应替换旧值, 而不是堆叠
      this.cookies = this.cookies.filter((c) =>
        !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
      );
      this.cookies.push(cookie);
    }
  }

  /** 返回匹配 url 的 Cookie 请求头值 */
  cookieHeader(url) {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || '/';
    const now = Date.now();
    const parts = [];
    for (const c of this.cookies) {
      if (c.expired(now)) continue;
      if (c.secure && u.protocol !== 'https:') continue;
      const d = c.domain;
      const match = host === d || host.endsWith('.' + d);
      if (!match) continue;
      if (!path.startsWith(c.path)) continue;
      parts.push(`${c.name}=${c.value}`);
    }
    return parts.join('; ');
  }

  serialize() {
    return JSON.stringify(this.cookies.map((c) => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      expires: c.expires, secure: c.secure, httpOnly: c.httpOnly
    })));
  }

  static deserialize(json) {
    const jar = new CookieJar();
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) {
        jar.cookies = arr.map((c) => new Cookie(c.name, c.value, c));
      }
    } catch (e) { /* 损坏数据返回空 jar */ }
    return jar;
  }
}

function safeHost(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^\./, ''); } catch (e) { return ''; }
}

module.exports = { CookieJar };
