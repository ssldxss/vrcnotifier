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

function createVrcApi({ baseUrl = 'https://api.vrchat.cloud/api/1', userAgent = 'vrcnotifier/1.0', cookieJar = null, fetchImpl = fetch, logger = null, retryBaseMs = 5000, retryMaxMs = 3600000, jitterMs = 1000 } = {}) {
  const jar = cookieJar || new CookieJar();
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  let cookiesChanged = null;

  // 401/429/网络错误/5xx 都按指数退避 + jitter 重试(与 WS 重连一致, 默认 5s 起、1h 封顶)。
  // 登录/2FA/authToken 以及前端手动操作传 noRetry: true, 立即失败交给上层处理。
  function backoffMs(attempt) {
    const base = Math.min(retryBaseMs * Math.pow(2, attempt), retryMaxMs);
    return base + Math.floor(Math.random() * jitterMs);
  }

  function isTransient(e) {
    if (!(e instanceof ApiError)) return false;
    if (e.status === -1) return true;             // 网络错误
    if (e.status === 401 || e.status === 429) return true; // 会话/限流: 与 WS 一样退避重试
    return e.status >= 500 && e.status < 600;     // 5xx 服务端临时故障
  }

  async function request(path, opts = {}) {
    const endpoint = '/' + String(path).replace(/^\/+/, '');
    let attempt = 0;
    for (;;) {
      try {
        return await attemptRequest(path, opts);
      } catch (e) {
        if (opts.noRetry || !isTransient(e) || attempt >= (opts.maxRetries ?? Infinity)) throw e;
        const delay = backoffMs(attempt);
        attempt++;
        log.warn(`[vrcapi] ${opts.method || 'GET'} ${endpoint} 失败(${e.message}), ${delay}ms 后重试(第 ${attempt} 次)`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async function attemptRequest(path, { method = 'GET', auth, body, params } = {}) {
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
      log.warn(`[vrcapi] 错误响应: ${method} ${endpoint} (${res.status}): ${msg}`);
      throw new ApiError(res.status, String(msg), data);
    }
    return data;
  }

  /** 登录: 返回 CurrentUser 或 {requiresTwoFactorAuth:[...]} */
  async function login(username, password) {
    const auth = Buffer.from(`${encodeURIComponent(username)}:${encodeURIComponent(password)}`).toString('base64');
    try {
      return await request('/auth/user', { auth, noRetry: true });
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

  /** 2FA 验证(不带 Authorization); emailOtp 8 位码按 VRCX 同款格式化成 xxxx-xxxx, 6 位码原样 */
  function verify2fa(kind, code) {
    let c = String(code || '').trim();
    if (String(kind).toLowerCase() === 'emailotp' && /^\d{8}$/.test(c)) {
      c = `${c.slice(0, 4)}-${c.slice(4)}`;
    }
    return request(`/auth/twofactorauth/${String(kind).toLowerCase()}/verify`, { method: 'POST', body: { code: c }, noRetry: true });
  }

  /** 当前用户 */
  function me(opts = {}) {
    return request('/auth/user', { ...opts });
  }

  /** 指定用户(公开资料, 含 location/state/status/平台/头像) */
  function user(userId, opts = {}) {
    return request(`/users/${encodeURIComponent(userId)}`, { ...opts });
  }

  /** WS token */
  function authToken() {
    return request('/auth', { noRetry: true });
  }

  /** 好友列表(分页拉全量); offline=true 仅离线 */
  async function friends({ offline = false, pageSize = 100, noRetry = false } = {}) {
    const all = [];
    let offset = 0;
    for (;;) {
      const page = await request('/auth/user/friends', {
        noRetry,
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
  function world(worldId, opts = {}) {
    return request(`/worlds/${encodeURIComponent(worldId)}`, { ...opts });
  }

  return { request, login, verify2fa, me, user, authToken, friends, world, jar, setCookiesChanged: (fn) => { cookiesChanged = fn; } };
}

// VRChat 的 401 细分:
// - "Missing Credentials": cookie 作废(换 IP/异地), 需要带密码重新登录
// - "Unauthorized": 会话被临时挂起, 需要重新过一遍两步验证(现有 cookies)
function isMissingCredentials(e) {
  return !!(e && e.status === 401 && String(e.message || '').includes('Missing Credentials'));
}
function isUnauthorized(e) {
  return !!(e && e.status === 401 && String(e.message || '').includes('Unauthorized'));
}

module.exports = { createVrcApi, ApiError, isMissingCredentials, isUnauthorized };
