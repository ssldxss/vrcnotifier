'use strict';
// 世界信息查询: 独立于 VRChat 登录会话。
// 仅用于按 ID 查询世界名等公开基础信息, 请求不携带 Cookie / Authorization。

const DEFAULT_API_BASE = 'https://api.vrchat.cloud/api/1';
const FETCH_TIMEOUT_MS = 8000;

function createWorldFetcher({ baseUrl = DEFAULT_API_BASE, userAgent = 'vrcnotifier/1.0', fetchImpl = fetch, logger = null, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  async function world(worldId, opts = {}) {
    const base = String(baseUrl || DEFAULT_API_BASE).replace(/\/+$/, '') + '/';
    const url = new URL(`worlds/${encodeURIComponent(worldId)}`, base);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url.toString(), {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json'
        },
        signal: opts.signal || ac.signal
      });
    } catch (e) {
      throw Object.assign(new Error(`世界信息获取失败: ${e.message}`), { status: -1 });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const msg = data && data.error
        ? (data.error.message || data.error)
        : `HTTP ${res.status}`;
      throw Object.assign(new Error(String(msg)), { status: res.status });
    }
    return data;
  }

  return { world };
}

module.exports = { createWorldFetcher, DEFAULT_API_BASE, FETCH_TIMEOUT_MS };
