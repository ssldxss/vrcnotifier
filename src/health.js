'use strict';
// VRChat API 健康探测: 持续探测公开 /config 端点(不带 cookie, 避免 429;
// /health 无凭证返回 401, 不适用), 每轮取 3 个计时样本, 超时样本舍去, 剩余样本取平均。
// 每轮取 3 个计时样本, 超时样本舍去, 剩余样本取平均。

function createHealthMonitor({
  apiBaseUrl = 'https://api.vrchat.cloud/api/1',
  fetchImpl = fetch,
  userAgent = 'vrcnotifier/1.0',
  logger = null,
  now = Date.now,
  intervalMs = 60 * 1000,
  sampleCount = 3,
  sampleTimeoutMs = 3000,
  onSample = null
} = {}) {
  const log = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  let latest = { status: 'starting', latencyMs: null, serverName: null, updatedAt: now() };
  let lastOk = null; // 最近一次成功探测; 探测失败时对外沿用该状态(标记 stale)
  let timer = null;
  let inFlight = false;

  async function probe() {
    const ac = new AbortController();
    const timerId = setTimeout(() => ac.abort(), sampleTimeoutMs);
    if (timerId.unref) timerId.unref();
    const started = now();
    try {
      const base = String(apiBaseUrl || '').replace(/\/+$/, '');
      const res = await fetchImpl(`${base}/config`, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: ac.signal
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const headerServer = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-vrc-api-server') : null;
      return { latencyMs: Math.max(0, now() - started), serverName: headerServer || (data && data.serverName) || null };
    } catch (e) {
      return null; // 超时/网络错误/非 200: 样本舍去
    } finally {
      clearTimeout(timerId);
    }
  }

  async function tick() {
    if (inFlight) return;
    inFlight = true;
    try {
      const samples = [];
      let serverName = null;
      for (let i = 0; i < sampleCount; i++) {
        const r = await probe();
        if (!r) continue;
        samples.push(r.latencyMs);
        if (serverName === null && r.serverName) serverName = r.serverName;
      }
      if (samples.length > 0) {
        latest = {
          status: 'ok',
          latencyMs: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
          serverName,
          updatedAt: now()
        };
        lastOk = { ...latest };
      } else if (lastOk) {
        // 本轮全部失败: 沿用最近一次成功状态展示(标记 stale), 不直接报 error
        latest = { ...lastOk, stale: true };
        log.warn(`[health] 本轮探测失败, 沿用 ${Math.max(1, Math.round((now() - lastOk.updatedAt) / 1000))}s 前的成功状态(${lastOk.latencyMs}ms)`);
      } else {
        latest = { status: 'error', latencyMs: null, serverName: null, updatedAt: now() };
        log.warn('[health] 探测失败, 且尚无历史成功状态');
      }
    } catch (e) {
      log.error(`[health] 探测异常: ${e.message}`);
      latest = lastOk
        ? { ...lastOk, stale: true }
        : { status: 'error', latencyMs: null, serverName: null, updatedAt: now() };
    } finally {
      inFlight = false;
    }
    // 每轮采样完成后推送给订阅者(SSE 推送, 前端不再轮询)
    if (onSample) {
      try { onSample({ ...latest }); } catch (e) { /* 订阅者异常不影响探测 */ }
    }
  }

  function start() {
    if (timer) return;
    tick().catch(() => {});
    timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function status() {
    return { ...latest };
  }

  return { start, stop, status, _debug: { probe, tick } };
}

module.exports = { createHealthMonitor };
