'use strict';
// VRChat 官方状态: 请求 status.json, 正常 15 分钟、异常/失败 2 分钟后刷新(与 VRCX 一致)。
// All Systems Operational → normal; 仅 major → outage, 其余异常 → degraded(与 VRCX 一致)。
// 有异常时补拉 summary.json 汇总故障组件, 供前端悬停详情。
// 获取失败: 和 VRCX 一样显示 Failed to fetch VRC status, 不沿用旧正常状态。

const DEFAULT_API_URL = 'https://status.vrchat.com/api/v2';
const NORMAL_INTERVAL_MS = 15 * 60 * 1000;
const ISSUE_INTERVAL_MS = 2 * 60 * 1000;

function createVrcStatus({
  apiUrl = DEFAULT_API_URL,
  fetchImpl = fetch,
  userAgent = 'vrcnotifier/1.0',
  logger = null,
  now = Date.now,
  timeoutMs = 8000,
  onUpdate = null
} = {}) {
  const log = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  let cache = null; // { state, indicator, description, summary, updatedAt, fetchedAt }
  let inflight = null;
  let pollingTimer = null;
  let stopped = false;
  const activeRequests = new Set();

  function notify() {
    if (!stopped && onUpdate) {
      try { onUpdate({ ...cache }); } catch (e) { log.warn(`[vrcstatus] 状态推送失败: ${e.message}`); }
    }
  }

  async function fetchJson(path) {
    const ac = new AbortController();
    activeRequests.add(ac);
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
      activeRequests.delete(ac);
    }
  }

  async function fetchStatus() {
    const data = await fetchJson('status.json');
    const st = (data && data.status) || {};
    const description = st.description || null;
    const indicator = st.indicator || '';
    const updatedAt = (data && data.page && data.page.updated_at) || null;
    if (description === 'All Systems Operational') {
      return { state: 'normal', indicator: '', description, summary: null, updatedAt, fetchedAt: now() };
    }
    const state = indicator === 'major' ? 'outage' : 'degraded';
    return { state, indicator, description: description || 'VRChat 服务异常', summary: null, updatedAt, fetchedAt: now() };
  }

  async function fetchSummary(snapshot) {
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
      if (!stopped) log.warn(`[vrcstatus] summary 获取失败: ${e.message}`);
      return;
    }
    if (!stopped && cache === snapshot) {
      cache = { ...snapshot, summary };
      notify();
    }
  }

  // 多个页面共享状态和进行中的请求, 不重复请求官方状态页。
  function status({ focus = false } = {}) {
    if (stopped) return Promise.resolve(cache);
    const at = now();
    const interval = focus ? 60000 : (cache && cache.state === 'normal' ? NORMAL_INTERVAL_MS : ISSUE_INTERVAL_MS);
    if (cache && at - cache.fetchedAt <= interval) return Promise.resolve(cache);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        cache = await fetchStatus();
        log.debug(`[vrcstatus] 状态获取成功: ${cache.state}${cache.description ? ` (${cache.description})` : ''}`);
      } catch (e) {
        if (stopped) return cache;
        log.warn(`[vrcstatus] 状态获取失败: ${e.message}`);
        cache = {
          state: 'unknown',
          description: 'Failed to fetch VRC status',
          summary: e && e.message ? e.message : String(e),
          updatedAt: null,
          fetchedAt: now()
        };
      } finally {
        inflight = null;
      }
      notify();
      // 与 VRCX 一样, 组件摘要独立请求, 不阻塞公开状态接口或告警。
      if (cache.state === 'degraded' || cache.state === 'outage') fetchSummary(cache);
      return cache;
    })();
    return inflight;
  }

  function start() {
    stopped = false;
    if (!pollingTimer) {
      pollingTimer = setInterval(() => { status(); }, 60000);
      pollingTimer.unref?.();
    }
    return status();
  }

  function stop() {
    stopped = true;
    clearInterval(pollingTimer);
    pollingTimer = null;
    for (const request of activeRequests) request.abort();
  }

  return { status, start, stop };
}

module.exports = { createVrcStatus };
