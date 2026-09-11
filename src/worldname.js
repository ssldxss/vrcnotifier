'use strict';
// 世界名查询: 全项目唯一的世界名入口, 谁要世界名都拿 world_id 来换。
//
// 职责(查询模块的事): 缓存读写 / TTL / 在途合并与完成后窗口 / 负缓存 / 重试 / 失败沿用旧名字 / 日志。
// 不负责(需求方的事): 等多久。get() 返回的 Promise 可能很慢(429 退避最长约 2.5 分钟),
//                     超时由调用者自己 Promise.race, 超时后查询继续在后台跑完。
// 只接受真实世界编号: private/offline/traveling 等哨兵值由调用方自行处理, 不进本模块。

const MINUTE_MS = 60 * 1000;

const DEFAULTS = {
  cacheTtlMs: 60 * MINUTE_MS,     // 成功名字有效期 1 小时
  dedupeWindowMs: 10 * 1000,      // 完成后 10 秒内复用同一结果
  goneTtlMs: 15 * MINUTE_MS,      // 404/403: 世界不存在/无权限, 负缓存 15 分钟
  failureTtlMs: 1 * MINUTE_MS,    // 网络/超时/5xx: 负缓存 1 分钟
  retryDelayMs: 500,              // 就地重试间隔
  maxRetries: 1,                  // 就地重试次数上限(网络/超时/5xx)
  backoffBaseMs: 5000,            // 429 指数退避起步
  backoffMaxMs: 60 * MINUTE_MS,   // 退避封顶
  backoffRetries: 5,              // 429 重试次数上限
  jitterMs: 1000,                 // 退避抖动
  maxConcurrency: 10,             // 同时最多 10 个在途请求
  ratePerMinute: 600,             // 每分钟最多 600 次(<=0 关闭, 测试用)
  maxTracked: 2000                // 合并记录上限, 超出清理已过期项
};

function createWorldName(opts = {}) {
  const {
    db, fetchWorld,
    logger = null, now = Date.now, sleep = null, bus = null, config = {}
  } = opts;
  if (!db) throw new Error('worldname: 缺少 db');
  if (typeof fetchWorld !== 'function') throw new Error('worldname: 缺少 fetchWorld');
  const cfg = { ...DEFAULTS, ...config };
  const log = logger || { debug() {}, info() {}, warn() {}, error() {} };
  const sleepFn = sleep || ((ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); }));

  // ---------- 调度: 并发上限 + 每分钟速率 ----------
  const rateStamps = [];
  const waiting = [];
  let active = 0;
  let pumpTimer = null;

  function trimStamps(t) {
    while (rateStamps.length && t - rateStamps[0] >= MINUTE_MS) rateStamps.shift();
  }

  function rateBlocked(t) {
    if (cfg.ratePerMinute <= 0) return false;
    trimStamps(t);
    return rateStamps.length >= cfg.ratePerMinute;
  }

  function pump() {
    if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = null; }
    for (;;) {
      const t = now();
      if (!waiting.length || active >= cfg.maxConcurrency || rateBlocked(t)) break;
      const job = waiting.shift();
      active++;
      if (cfg.ratePerMinute > 0) rateStamps.push(t);
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => { active--; pump(); });
    }
    // 只被速率挡住时, 排到最早那条记录过期再继续
    if (waiting.length && active < cfg.maxConcurrency && rateBlocked(now())) {
      const wait = Math.max(1, MINUTE_MS - (now() - rateStamps[0]));
      pumpTimer = setTimeout(pump, wait);
      if (pumpTimer.unref) pumpTimer.unref();
    }
  }

  function schedule(task) {
    return new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); pump(); });
  }

  // ---------- 缓存 / 负缓存 / 合并记录 ----------
  const negative = new Map(); // worldId -> 冷却到期时刻
  const inflight = new Map(); // worldId -> { promise, settled, doneAt }

  function cachedRow(worldId) {
    if (!worldId) return null;
    return db.getWorldCache(worldId) || null;
  }

  /** 同步看一眼现在缓存里有什么(不管过没过期); 不发请求。 */
  function peek(worldId) {
    const row = cachedRow(worldId);
    return row && row.world_name ? row.world_name : null;
  }

  /** 缓存里是否有仍在有效期内的名字。 */
  function freshName(worldId) {
    const row = cachedRow(worldId);
    if (!row || !row.world_name) return null;
    return now() - row.updated_at < cfg.cacheTtlMs ? row.world_name : null;
  }

  function sweepInflight(t) {
    if (inflight.size <= cfg.maxTracked) return;
    for (const [id, rec] of inflight) {
      if (rec.settled && t - rec.doneAt >= cfg.dedupeWindowMs) inflight.delete(id);
      if (inflight.size <= cfg.maxTracked) break;
    }
  }

  function backoffDelay(attempt) {
    const base = Math.min(cfg.backoffBaseMs * 2 ** attempt, cfg.backoffMaxMs);
    return base + Math.floor(Math.random() * cfg.jitterMs);
  }

  // 失败但本地还有旧名字 → 沿用; 没有 → 只能返回空。两种情况分开记日志。
  function logFallback(worldId, oldName, reason, err, ttlMs) {
    const mins = Math.max(1, Math.round(ttlMs / MINUTE_MS));
    const detail = err && err.message ? err.message : '-';
    if (oldName) {
      log.warn(`[world] 世界 ${worldId} 重查失败(${reason}), 沿用旧名字「${oldName}」, ${mins} 分钟后可重试: ${detail}`);
    } else {
      log.warn(`[world] 世界 ${worldId} 查询失败(${reason}), 暂无名字可用, ${mins} 分钟后可重试: ${detail}`);
    }
  }

  // 真正去查: 404/403 立即负缓存; 429 指数退避; 其余就地重试一次; 仍失败进负缓存。
  // 任何情况下都返回一个值(不抛), 避免调用方出现未处理拒绝。
  async function resolveWorld(worldId) {
    const oldName = peek(worldId);
    let lastErr = null;
    let retries = 0;
    let backoffs = 0;
    for (;;) {
      try {
        const w = await schedule(() => fetchWorld(worldId));
        const name = w && w.name ? String(w.name) : null;
        if (!name) throw Object.assign(new Error('世界信息缺少名称字段'), { status: -2 });
        db.upsertWorldCache(worldId, name, now());
        negative.delete(worldId);
        log.debug(`[world] 世界名获取成功 worldId=${worldId} name=${name}`);
        if (bus) {
          // 订阅者异常不影响查询结果
          try { bus.emit('world-name', { worldId, worldName: name }); } catch (e) { /* ignore */ }
        }
        return name;
      } catch (e) {
        lastErr = e;
        const status = e && e.status;
        if (status === 404 || status === 403) {
          negative.set(worldId, now() + cfg.goneTtlMs);
          logFallback(worldId, oldName, `世界不存在或无权限, HTTP ${status}`, e, cfg.goneTtlMs);
          return oldName;
        }
        if (status === 429 && backoffs < cfg.backoffRetries) {
          const delay = backoffDelay(backoffs);
          backoffs++;
          log.warn(`[world] 世界 ${worldId} 被限流, ${delay}ms 后重试(第 ${backoffs} 次)`);
          await sleepFn(delay);
          continue;
        }
        if (status !== 429 && retries < cfg.maxRetries) {
          retries++;
          log.warn(`[world] 世界 ${worldId} 查询失败(${e.message}), ${cfg.retryDelayMs}ms 后就地重试(第 ${retries} 次)`);
          await sleepFn(cfg.retryDelayMs);
          continue;
        }
        break;
      }
    }
    negative.set(worldId, now() + cfg.failureTtlMs);
    logFallback(worldId, oldName, '网络或服务端错误', lastErr, cfg.failureTtlMs);
    return oldName;
  }

  /** 取世界名。可能很慢; 超时由调用方自己 race, 超时后查询仍在后台跑完。 */
  function get(worldId) {
    if (!worldId) return Promise.resolve(null);
    const t = now();

    // 1) 负缓存冷却期内: 不发请求, 直接给现有(可能是旧的)名字
    const negUntil = negative.get(worldId);
    if (negUntil !== undefined) {
      if (t < negUntil) return Promise.resolve(peek(worldId));
      negative.delete(worldId);
    }

    // 2) 在途搭车 / 完成后窗口内复用
    const rec = inflight.get(worldId);
    if (rec) {
      if (!rec.settled) return rec.promise;
      if (t - rec.doneAt < cfg.dedupeWindowMs) return rec.promise;
      inflight.delete(worldId);
    }

    // 3) 缓存仍在有效期
    const fresh = freshName(worldId);
    if (fresh !== null) return Promise.resolve(fresh);

    // 4) 真查
    sweepInflight(t);
    const entry = { settled: false, doneAt: 0, promise: null };
    entry.promise = resolveWorld(worldId).then(
      (name) => { entry.settled = true; entry.doneAt = now(); return name; },
      (e) => {
        entry.settled = true; entry.doneAt = now();
        log.error(`[world] 世界 ${worldId} 查询异常: ${e.message}`);
        return peek(worldId);
      }
    );
    inflight.set(worldId, entry);
    return entry.promise;
  }

  return { get, peek, _internals: { inflight, negative } };
}

module.exports = { createWorldName, DEFAULTS };
