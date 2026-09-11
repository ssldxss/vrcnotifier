'use strict';
// 世界名查询: 全项目唯一的世界名入口, 谁要世界名都拿 world_id 来换。
//
// 一个领域一件事, 两层实现都在这:
//   传输层 —— 按 ID 查公开世界信息, 独立于 VRChat 登录会话, 请求不携带 Cookie / Authorization
//   策略层 —— 缓存 1 小时 / 在途与完成后窗口合并 / 失败冷却(指数退避) /
//              网络抖动就地重试一次 / 失败沿用旧名字 / 并发与速率上限 / 日志
//
// 不负责等待: get() 最多做一次尝试(网络抖动时多试一次)就返回, 不会长时间挂起;
//              需要更短时限的需求方自己 race(超时后用 peek() 取旧名字兜底)。
// 失败不挂着重试: 世界名是"即时请求", 晚报到的结果没有消费者 —— 等到 5 秒、10 秒后
//              再重试时调用方早走了。所以改为把"多久之后才允许再问"做指数退避:
//              同一个世界连续失败 → 冷却 5min→10min→20min→…→1h 封顶, 成功一次即归零;
//              冷却期内重复调用【立即】返回(不等待、不发请求)。
// 只接受真实世界编号: private/offline/traveling 等哨兵值由调用方自行处理, 不进本模块。

const DEFAULT_API_BASE = 'https://api.vrchat.cloud/api/1';
const FETCH_TIMEOUT_MS = 8000;
const MINUTE_MS = 60 * 1000;

const DEFAULTS = {
  cacheTtlMs: 60 * MINUTE_MS,     // 成功名字有效期 1 小时
  dedupeWindowMs: 10 * 1000,      // 完成后 10 秒内复用同一结果
  cooldownBaseMs: 5 * MINUTE_MS,  // 失败后的冷却起步 5 分钟(同一个世界连续失败逐次翻倍)
  cooldownMaxMs: 60 * MINUTE_MS,  // 冷却封顶 1 小时
  retryDelayMs: 500,              // 就地重试间隔(仅网络/超时/5xx)
  maxRetries: 1,                  // 就地重试次数上限(网络/超时/5xx)
  maxConcurrency: 10,             // 同时最多 10 个在途请求
  ratePerMinute: 600,             // 每分钟最多 600 次(<=0 关闭, 测试用)
  maxTracked: 2000                // 合并记录 / 失败计数表上限, 超出清理过期项
};

// ---------- 传输层: 无 Cookie 的世界信息查询 ----------
// 不带 Cookie / Authorization, 与登录会话完全解耦; 失败统一挂 status 供策略层分类。
async function fetchWorldInfo(worldId, { baseUrl, userAgent, fetchImpl, timeoutMs }) {
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
      signal: ac.signal
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

function createWorldName(opts = {}) {
  const {
    db, logger = null, now = Date.now, sleep = null, bus = null, config = {},
    baseUrl = DEFAULT_API_BASE, userAgent = 'vrcnotifier/1.0',
    fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS,
    fetchWorld = null // 仅供测试替换整层传输; 生产走上面的无 Cookie 实现
  } = opts;
  if (!db) throw new Error('world: 缺少 db');
  const doFetch = typeof fetchWorld === 'function'
    ? fetchWorld
    : (id) => fetchWorldInfo(id, { baseUrl, userAgent, fetchImpl, timeoutMs });
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
  const negative = new Map(); // worldId -> { fails, until }: 连续失败次数与冷却到期时刻(成功即清)
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

  /** 该世界是否正处在失败冷却期内(到期即放行一次, 失败计数继续累积)。 */
  function cooling(worldId, t) {
    const rec = negative.get(worldId);
    return !!rec && t < rec.until;
  }

  /** 记一次失败, 返回本次冷却时长: min(起步 × 2^(连续失败-1), 封顶)。 */
  function coolDown(worldId) {
    const rec = negative.get(worldId);
    const fails = (rec ? rec.fails : 0) + 1;
    const ttl = Math.min(cfg.cooldownBaseMs * 2 ** (fails - 1), cfg.cooldownMaxMs);
    negative.set(worldId, { fails, until: now() + ttl });
    return ttl;
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

  // 失败计数表同样有上限; 只清"早已过冷却"的条目 —— 冷却中的必须留着, 否则退避会被重置
  function sweepNegative(t) {
    if (negative.size <= cfg.maxTracked) return;
    for (const [id, rec] of negative) {
      if (t - rec.until >= cfg.cooldownMaxMs) negative.delete(id);
      if (negative.size <= cfg.maxTracked) break;
    }
  }

  // 失败原因分类: 日志里一眼看出是"世界没了"还是"网络抖了"/"被限流"
  function reasonOf(err) {
    const status = err && err.status;
    if (status === 404) return '世界不存在, HTTP 404';
    if (status === 403) return '无权限访问, HTTP 403';
    if (status === 429) return '被限流, HTTP 429';
    if (status === -1) return '网络错误';
    if (status === -2) return '响应缺少名称字段';
    if (typeof status === 'number' && status >= 500 && status < 600) return `服务端错误, HTTP ${status}`;
    return '查询失败';
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

  // 真正去查: 404/403 与 429 直接冷却(重试没意义); 网络/超时/5xx 就地重试一次, 仍失败才冷却。
  // 任何情况下都返回一个值(不抛), 避免调用方出现未处理拒绝。
  async function resolveWorld(worldId) {
    const startedAt = now(); // 含就地重试的总耗时, 便于排查"名字为什么出来得慢"
    const oldName = peek(worldId);
    let lastErr = null;
    let retries = 0;
    for (;;) {
      try {
        const w = await schedule(() => doFetch(worldId));
        const name = w && w.name ? String(w.name) : null;
        if (!name) throw Object.assign(new Error('世界信息缺少名称字段'), { status: -2 });
        db.upsertWorldCache(worldId, name, now());
        negative.delete(worldId);
        log.debug(`[world] 世界名获取成功 worldId=${worldId} name=${name} 耗时=${now() - startedAt}ms`);
        if (bus) {
          // 订阅者异常不影响查询结果
          try { bus.emit('world-name', { worldId, worldName: name }); } catch (e) { /* ignore */ }
        }
        return name;
      } catch (e) {
        lastErr = e;
        const status = e && e.status;
        if (status === 404 || status === 403) {
          logFallback(worldId, oldName, reasonOf(e), e, coolDown(worldId));
          return oldName;
        }
        // 429 不做就地重试: 它在说"别打了", 等 500ms 再打一次不会变好; 退避到 5 秒、10 秒
        // 时调用方早走了, 没人消费这个结果 —— 直接冷却, 让"下一次有人要"再来问
        if (status !== 429 && retries < cfg.maxRetries) {
          retries++;
          log.warn(`[world] 世界 ${worldId} 查询失败(${e.message}), ${cfg.retryDelayMs}ms 后重试(第 ${retries} 次)`);
          await sleepFn(cfg.retryDelayMs);
          continue;
        }
        break;
      }
    }
    logFallback(worldId, oldName, reasonOf(lastErr), lastErr, coolDown(worldId));
    return oldName;
  }

  /** 取世界名。只做一次尝试(网络抖动多试一次)即返回; 冷却期内立即返回, 不会长时间挂起。 */
  function get(worldId) {
    if (!worldId) return Promise.resolve(null);
    const t = now();

    // 1) 冷却期内: 不发请求、不等待, 直接给现有(可能是旧的)名字
    if (cooling(worldId, t)) return Promise.resolve(peek(worldId));

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
    sweepNegative(t);
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

  return { get, peek };
}

module.exports = { createWorldName, DEFAULTS };
