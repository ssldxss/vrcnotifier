'use strict';
// VRChat API 延迟: 按需请求公开 /config, 不带 cookie。
// 前端连接期间每 5 分钟采样 1 次; HTTP 读取与 SSE 共用缓存和在途请求。

function createHealthMonitor({
  apiBaseUrl = 'https://api.vrchat.cloud/api/1',
  fetchImpl = fetch,
  userAgent = 'vrcnotifier/1.0',
  logger = null,
  now = Date.now,
  intervalMs = 5 * 60 * 1000,
  sampleCount = 1,
  sampleTimeoutMs = 3000,
  onSample = null
} = {}) {
  const log = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  let latest = { status: 'starting', latencyMs: null, serverName: null, updatedAt: now() };
  let lastOk = null; // 最近一次成功探测; 探测失败时对外沿用该状态(标记 stale)
  let lastAttemptAt = null; // 失败也遵守刷新间隔, 避免重连/切换窗口引起重试风暴
  let timer = null;
  let active = false;
  let inFlight = null;

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

  async function sample() {
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
    }
    // 每轮采样完成后推送给订阅者(SSE 推送, 前端不再轮询)
    if (onSample) {
      try { onSample({ ...latest }); } catch (e) { /* 订阅者异常不影响探测 */ }
    }
    return status();
  }

  function schedule() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!active || inFlight) return;
    const delay = Math.max(1, intervalMs - (now() - lastAttemptAt));
    timer = setTimeout(() => {
      timer = null;
      refresh().catch(() => {});
    }, delay);
    timer.unref?.();
  }

  function tick() {
    if (inFlight) return inFlight;
    lastAttemptAt = now();
    inFlight = sample().finally(() => {
      inFlight = null;
      schedule();
    });
    return inFlight;
  }

  function refresh() {
    if (inFlight) return inFlight;
    if (lastAttemptAt !== null && now() - lastAttemptAt < intervalMs) {
      if (!timer) schedule();
      return Promise.resolve(status());
    }
    return tick();
  }

  function start() {
    if (active) return;
    active = true;
    refresh().catch(() => {});
  }

  function stop() {
    active = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function status() {
    return { ...latest };
  }

  return { start, stop, status, refresh, _debug: { probe, tick } };
}

module.exports = { createHealthMonitor };
