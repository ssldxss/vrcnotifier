'use strict';
// vrcnotifier 前端 SDK: 封装后端 REST 接口 + SSE 事件订阅 + 访问令牌管理。
// 浏览器用 <script src="sdk.js"> 引入(挂 window.VrcNotifier); Node 用 require 引入。
// 用法:
//   const client = new VrcNotifier.Client({ baseUrl: 'http://127.0.0.1:3000', token: '...' });
//   const { user } = await client.login('u', 'p');
//   await client.subscribeEvents({ onEvent: (type, data) => console.log(type, data) });

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcNotifier = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE = 'http://127.0.0.1:3000';
  const LS_BASE_KEY = 'vrcn_base';
  const LS_TOKEN_KEY = 'vrcn_token';

  class ApiError extends Error {
    constructor(status, message, data) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  }

  /** 内存兜底 storage(无 localStorage 环境 / 隐私模式) */
  function memoryStorage() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k)
    };
  }

  function resolveStorage(injected) {
    if (injected) return injected;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* 隐私模式等不可用 */ }
    return memoryStorage();
  }

  class VrcNotifierClient {
    /**
     * @param {object} opts
     * @param {string} [opts.baseUrl] 后端地址, 默认读 localStorage 或 http://127.0.0.1:3000
     * @param {string} [opts.token] 访问令牌, 默认读 localStorage
     * @param {object} [opts.storage] 自定义 storage(getItem/setItem/removeItem)
     * @param {Function} [opts.fetchImpl] 自定义 fetch(测试注入), 默认全局 fetch
     * @param {Function} [opts.EventSourceImpl] 自定义 EventSource(测试注入), 默认全局 EventSource
     */
    constructor(opts = {}) {
      this.storage = resolveStorage(opts.storage);
      this.fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
      this.EventSourceImpl = opts.EventSourceImpl || (typeof EventSource !== 'undefined' ? EventSource : null);
      this.baseUrl = (opts.baseUrl || this.storage.getItem(LS_BASE_KEY) || DEFAULT_BASE).replace(/\/+$/, '');
      this.token = opts.token !== undefined ? opts.token : (this.storage.getItem(LS_TOKEN_KEY) || '');
    }

    /** 更新并持久化后端地址 */
    setBaseUrl(url) {
      this.baseUrl = String(url || DEFAULT_BASE).replace(/\/+$/, '');
      try { this.storage.setItem(LS_BASE_KEY, this.baseUrl); } catch (e) { /* 持久化失败忽略 */ }
      return this.baseUrl;
    }

    /** 更新并持久化访问令牌 */
    setToken(token) {
      this.token = token !== undefined && token !== null ? String(token) : '';
      try { this.storage.setItem(LS_TOKEN_KEY, this.token); } catch (e) { /* 持久化失败忽略 */ }
      return this.token;
    }

    clearToken() {
      this.token = '';
      try { this.storage.removeItem(LS_TOKEN_KEY); } catch (e) { /* 忽略 */ }
    }

    /**
     * 核心请求: 自动携带 Bearer token; 非 2xx 抛 ApiError。
     * @returns {Promise<object>} 解析后的 JSON
     */
    async request(method, path, opts = {}) {
      const { body, query, noAuth = false } = opts;
      if (!this.fetchImpl) throw new ApiError(0, '当前环境不支持 fetch');
      const url = this.baseUrl + path + (query ? '?' + new URLSearchParams(query).toString() : '');
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (!noAuth && this.token) headers.Authorization = 'Bearer ' + this.token;
      let res;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch (e) {
        throw new ApiError(0, '网络错误: ' + e.message);
      }
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
        throw new ApiError(res.status, msg, data);
      }
      return data;
    }

    // ---------- 公开(无需 token) ----------
    getConfig() { return this.request('GET', '/api/config', { noAuth: true }); }
    verifyAccess(key) { return this.request('POST', '/api/access/verify', { noAuth: true, body: { key } }); }

    // ---------- 登录 / 会话 ----------
    login(username, password, rememberMe = false) {
      return this.request('POST', '/api/login', { noAuth: true, body: { username, password, rememberMe } });
    }
    login2fa(tempSessionId, code, kind = 'emailOtp') {
      return this.request('POST', '/api/login/2fa', { noAuth: true, body: { tempSessionId, code, kind } });
    }
    logout() { return this.request('POST', '/api/logout', { body: {} }); }
    getSession() { return this.request('GET', '/api/session'); }
    getMe() { return this.request('GET', '/api/me'); }

    // ---------- 好友与监控 ----------
    getFriends() { return this.request('GET', '/api/friends'); }
    refreshFriends() { return this.request('POST', '/api/friends/refresh', { body: {} }); }
    updateFriendConfig(friendId, cfg = {}) {
      return this.request('PUT', '/api/friends/' + encodeURIComponent(friendId) + '/config', { body: cfg });
    }

    // ---------- 设置 / 测试 / 状态 ----------
    getSettings() { return this.request('GET', '/api/settings'); }
    updateSettings(settings) { return this.request('PUT', '/api/settings', { body: settings }); }
    testNotification(kind) { return this.request('POST', '/api/test/' + encodeURIComponent(kind), { body: {} }); }
    getStatus() { return this.request('GET', '/api/status'); }
    getLogs(opts = {}) {
      const query = {};
      if (opts.tail) query.tail = opts.tail;
      if (opts.after) query.after = opts.after;
      return this.request('GET', '/api/logs', { query: Object.keys(query).length ? query : undefined });
    }
    manualSnapshot() { return this.request('POST', '/api/monitor/snapshot', { body: {} }); }

    // ---------- 头像 ----------
    avatarUrl(key) {
      return this.baseUrl + '/api/avatar/' + encodeURIComponent(key) + '?token=' + encodeURIComponent(this.token);
    }

    /**
     * 订阅后端 SSE 事件。
     * @param {object} handlers { onEvent(type,data), onError(err) }
     * @returns {{ close: () => void }}
     */
    subscribeEvents(handlers = {}) {
      const { onEvent, onError } = handlers;
      const ES = this.EventSourceImpl;
      if (!ES) throw new ApiError(0, '当前环境不支持 EventSource');
      const es = new ES(this.baseUrl + '/api/events?token=' + encodeURIComponent(this.token));
      const dispatch = (type, e) => {
        if (!onEvent) return;
        let data = null;
        try { data = JSON.parse(e.data); } catch (err) { data = e.data; }
        onEvent(type, data);
      };
      const KNOWN_EVENTS = ['notification', 'ws-failure', 'ws-recovered', 'snapshot', 'log'];
      for (const name of KNOWN_EVENTS) es.addEventListener(name, (e) => dispatch(name, e));
      es.onmessage = (e) => dispatch('message', e);
      es.onerror = (e) => { if (onError) onError(e); };
      return {
        close() { try { es.close(); } catch (e) { /* 忽略 */ } }
      };
    }
  }

  return { Client: VrcNotifierClient, ApiError, DEFAULT_BASE };
});