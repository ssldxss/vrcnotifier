'use strict';
// VRChat REST API 客户端: 登录/2FA/me/friends/worlds/auth, cookie jar + 限流。

const { CookieJar } = require('./cookiejar');

class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function createVrcApi({ baseUrl = 'https://api.vrchat.cloud/api/1', userAgent = 'vrcnotifier/1.0', cookieJar = null, fetchImpl = fetch, logger = null }) {
  const jar = cookieJar || new CookieJar();
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  let cookiesChanged = null;

  // 瞬时错误(网络中断/5xx)自动重试; 4xx(含 429)不重试, 不做限流退避。
  const RETRY_DELAYS_MS = [800, 2000];

  function isTransient(e) {
    if (!(e instanceof ApiError)) return false;
    if (e.status === -1) return true;             // 网络错误
    return e.status >= 500 && e.status < 600;     // 5xx 服务端临时故障
  }

  async function request(path, opts = {}) {
    const attempts = 1 + RETRY_DELAYS_MS.length;
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await attemptRequest(path, opts);
      } catch (e) {
        lastError = e;
        if (!isTransient(e) || attempt === attempts - 1) throw e;
        const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        log.warn(`[vrcapi] 请求失败(${e.message}), ${delay}ms 后重试(${attempt + 1}/${attempts - 1})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  async function attemptRequest(path, { method = 'GET', auth, body, params, type = 'userProfile' } = {}) {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const url = new URL(String(path).replace(/^\//, ''), base);
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const headers = {
      'User-Agent': userAgent,
      Accept: 'application/json'
    };
    const cookieHeader = jar.cookieHeader(url.toString());
    if (cookieHeader) headers.Cookie = cookieHeader;
    const endpoint = '/' + String(path).replace(/^\/+/, '');
    log.info(`[vrcapi] 请求: ${method} ${endpoint}`);
    if (auth) headers.Authorization = `Basic ${auth}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json;charset=utf-8';

    let res;
    try {
      res = await fetchImpl(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new ApiError(-1, `网络错误: ${e.message}`);
    }

    // 吸收 Set-Cookie
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setCookies.length > 0) { jar.setCookies(setCookies, url.toString()); if (cookiesChanged) cookiesChanged(jar); }

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

    log.info(`[vrcapi] 完成: ${method} ${endpoint} (${res.status})`);

    if (res.status >= 400) {
      let msg = `HTTP ${res.status}`;
      if (data && data.error) msg = data.error.message || msg;
      else if (data && data.message) msg = data.message;
      throw new ApiError(res.status, String(msg), data);
    }
    return data;
  }

  /** 登录: 返回 CurrentUser 或 {requiresTwoFactorAuth:[...]} */
  async function login(username, password) {
    const auth = Buffer.from(`${encodeURIComponent(username)}:${encodeURIComponent(password)}`).toString('base64');
    try {
      return await request('/auth/user', { auth, type: 'auth' });
    } catch (e) {
      if (e.status === 401 && /two.?factor|2fa/i.test(e.message)) {
        const kinds = e.data && Array.isArray(e.data.requiresTwoFactorAuth) && e.data.requiresTwoFactorAuth.length > 0
          ? e.data.requiresTwoFactorAuth
          : ['emailOtp']; // 兼容旧行为/无数组响应
        return { requiresTwoFactorAuth: kinds };
      }
      throw e;
    }
  }

  /** 2FA 验证(不带 Authorization) */
  function verify2fa(kind, code) {
    return request(`/auth/twofactorauth/${kind}/verify`, { method: 'POST', body: { code }, type: 'auth' });
  }

  /** 当前用户 */
  function me() {
    return request('/auth/user', { type: 'userProfile' });
  }

  /** WS token */
  function authToken() {
    return request('/auth', { type: 'auth' });
  }

  /** 好友列表(分页拉全量); offline=true 仅离线 */
  async function friends({ offline = false, pageSize = 100 } = {}) {
    const all = [];
    let offset = 0;
    for (;;) {
      const page = await request('/auth/user/friends', {
        type: 'friendStatus',
        params: { n: pageSize, offset, ...(offline ? { offline: 'true' } : {}) }
      });
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < pageSize) break;
      offset += page.length;
    }
    return all;
  }

  /** 世界信息 */
  function world(worldId) {
    return request(`/worlds/${encodeURIComponent(worldId)}`, { type: 'worldInfo' });
  }

  return { request, login, verify2fa, me, authToken, friends, world, jar, setCookiesChanged: (fn) => { cookiesChanged = fn; } };
}

module.exports = { createVrcApi, ApiError };


