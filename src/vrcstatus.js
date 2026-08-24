'use strict';
// VRChat 服务器状态(仿 VRCX): 仅当前端调用 status() 时才请求
// https://status.vrchat.com/api/v2/status.json, 结果内存缓存 60s(最多 1 分钟一次)。
// All Systems Operational → normal; minor → degraded; major/critical → outage。
// 有异常时补拉 summary.json 汇总故障组件, 供前端悬停详情。
// 获取失败: 沿用最近一次成功状态(标记 stale:true); 无历史成功时返回 unknown(无法获取)。

const DEFAULT_API_URL = 'https://status.vrchat.com/api/v2';
const DEFAULT_CACHE_TTL_MS = 60 * 1000;

function createVrcStatus({
  apiUrl = DEFAULT_API_URL,
  fetchImpl = fetch,
  userAgent = 'vrcnotifier/1.0',
  logger = null,
  now = Date.now,
  timeoutMs = 8000,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS
} = {}) {
  const log = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  let cache = null; // { state, description, summary, updatedAt, fetchedAt, stale? }
  let lastOk = null; // 最近一次成功获取结果(获取失败时沿用展示)
  let inflight = null;

  async function fetchJson(path) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    if (timer.unref) timer.unref();
    try {
      const base = String(apiUrl || '').replace(/\/+$/, '');
      const res = await fetchImpl(`${base}/${path}`, {
        headers: { Referer: 'https://vrcx.app', 'User-Agent': userAgent, Accept: 'application/json' },
        signal: ac.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchStatus() {
    const data = await fetchJson('status.json');
    const st = (data && data.status) || {};
    const description = st.description || null;
    const indicator = st.indicator || '';
    const updatedAt = (data && data.page && data.page.updated_at) || null;
    if (description === 'All Systems Operational') {
      return { state: 'normal', description, summary: null, updatedAt, fetchedAt: now() };
    }
    let summary = null;
    try {
      const s = await fetchJson('summary.json');
      if (s && Array.isArray(s.components)) {
        const parts = s.components
          .filter((c) => c && c.status !== 'operational')
          .map((c) => c.name)
          .filter(Boolean);
        if (parts.length) summary = parts.join(', ');
      }
    } catch (e) {
      log.warn(`[vrcstatus] summary 获取失败: ${e.message}`);
    }
    const state = indicator === 'major' || indicator === 'critical' ? 'outage' : 'degraded';
    return { state, description: description || 'VRChat 服务异常', summary, updatedAt, fetchedAt: now() };
  }

  // 惰性请求: 60s 内复用内存缓存; 最近一次获取失败时沿用上次成功状态(标记 stale), 下个 TTL 再重试; 并发调用共享同一次请求
  function status() {
    const at = now();
    if (cache && at - cache.fetchedAt < cacheTtlMs) return Promise.resolve(cache);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        cache = await fetchStatus();
        lastOk = cache; // 记录成功结果, 供获取失败时沿用
        log.debug(`[vrcstatus] 状态获取成功: ${cache.state}${cache.description ? ` (${cache.description})` : ''}`);
      } catch (e) {
        if (lastOk) {
          // 获取失败: 沿用上一次成功状态展示(标记 stale), 不直接报「无法获取」
          log.warn(`[vrcstatus] 状态获取失败: ${e.message}, 沿用上次成功状态`);
          cache = { ...lastOk, stale: true, fetchedAt: now() };
        } else {
          log.warn(`[vrcstatus] 状态获取失败: ${e.message}`);
          cache = {
            state: 'unknown',
            description: '无法获取',
            summary: e && e.message ? e.message : String(e),
            updatedAt: null,
            fetchedAt: now()
          };
        }
      } finally {
        inflight = null;
      }
      return cache;
    })();
    return inflight;
  }

  return { status };
}

module.exports = { createVrcStatus };
