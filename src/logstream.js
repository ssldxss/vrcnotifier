'use strict';
// 内存日志流: 环形缓冲 + 订阅。后端所有 logger 输出汇集于此,
// 供前端 /api/logs 拉取尾部、SSE 实时推送日志原文。

function createLogStream({ capacity = 500 } = {}) {
  const entries = []; // { seq, line }
  const listeners = new Set();
  let seq = 0;

  function push(line) {
    const entry = { seq: ++seq, line: String(line) };
    entries.push(entry);
    if (entries.length > capacity) entries.splice(0, entries.length - capacity);
    for (const fn of [...listeners]) {
      try { fn(entry); } catch (e) { /* 订阅者异常不影响日志 */ }
    }
    return entry;
  }

  /** 最近 n 条(从旧到新); n<=0 返回空 */
  function tail(n = 100) {
    const k = Math.max(0, Math.min(Math.trunc(n) || 0, entries.length));
    return k === 0 ? [] : entries.slice(-k);
  }

  /** seq 之后的行(用于 SSE 重连补拉), 上限 limit */
  function after(afterSeq, limit = 1000) {
    const out = [];
    for (const e of entries) {
      if (e.seq > afterSeq) {
        out.push(e);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function clear() { entries.length = 0; }

  function size() { return entries.length; }

  function lastSeq() { return seq; }

  return { push, tail, after, subscribe, clear, size, lastSeq, capacity };
}

module.exports = { createLogStream };
