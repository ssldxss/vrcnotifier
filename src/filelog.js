'use strict';
// 多段本地文件日志: 一段一独立文件, 以创建时间命名 vrcnotifier-<UTC时间戳>.log。
// 启动(open)必开新段; 当前段写满(maxBytes 字节或 maxLines 行)再开新段;
// 总段数超过 maxFiles 时删除名字最小(最老)的段 —— 「覆盖最老」由「淘汰最老段」实现,
// 任意时刻滚动都不丢一个字节(旧段改名都免了, 只有关闭/新建/删除)。
//
// seq 不落盘: seq = f(文件名, 段内行号) 确定性推导
//   seq = (文件名UTC毫秒 - EPOCH) * SEQ_MULT + 段内行号
// 同一行在任何一次运行里都得到同一个 seq → 跨重启天然连续, 对段淘汰免疫(某行的 seq 只取决于
// 它所在文件的名字与行号, 淘汰别的段不影响它)。文件内容保持纯净, 不嵌入任何编号。
//
// 全局序 = 文件名字典序 = 创建序 = 行写入序。文件名单调性(bump 规则: 新段名必须严格大于
// 已有最新段名, 时钟回拨/同毫秒自动前推)是正确性前提。seq 稀疏(段间大间隙),
// 读路径一律「二分定位段 + 段内数组下标」, 禁止按整数逐个步进。
//
// 终端与文件均保留明文; 打码只发生在服务端出站(SSE/API)时。

const fs = require('node:fs');
const path = require('node:path');

// seq 布局: (名字UTC毫秒 - EPOCH) * SEQ_MULT + 行号。行号上限 SEQ_MULT(达到即强制切段)。
// EPOCH=2026-01-01 起, 2^53(9.015e15) 精度内可用到约 2040 年。
const NAME_RE = /^vrcnotifier-(\d{8})-(\d{6})-(\d{3})\.log$/;
const LEGACY_NAME = 'vrcnotifier.log';
const EPOCH = Date.UTC(2026, 0, 1);
const SEQ_MULT = 20000;

function utcName(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `vrcnotifier-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${p(d.getUTCMilliseconds(), 3)}.log`;
}

function parseNameTime(name) {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const t = Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8),
    +m[2].slice(0, 2), +m[2].slice(2, 4), +m[2].slice(4, 6), +m[3]);
  return Math.max(t, EPOCH); // 早于纪元的文件名(历史遗留)收拢到 EPOCH, bump 规则保证不重号
}

function createFileLog({ dir, maxBytes = 2 * 1024 * 1024, maxFiles = 6, maxLines = 20000, now = Date.now } = {}) {
  if (!dir) return null;
  const lineCap = Math.max(1, Math.min(maxLines, SEQ_MULT)); // 行号必须落在 SEQ_MULT 槽位内
  let opened = false;
  const segs = new Map(); // name -> { name, base, fd, size, starts: [], lens: [] }
  let order = [];         // 段名按 base 严格递增(= 字典序 = 创建序)

  const active = () => segs.get(order[order.length - 1]);

  function createSegment(tMs) {
    const newest = order.length ? segs.get(order[order.length - 1]) : null;
    let t = Math.max(tMs, EPOCH);
    if (newest && t <= newest.t) t = newest.t + 1; // bump: 严格晚于最新段(时钟回拨/同毫秒)
    let name = utcName(t);
    while (fs.existsSync(path.join(dir, name))) { t += 1; name = utcName(t); }
    const base = (t - EPOCH) * SEQ_MULT;
    const fd = fs.openSync(path.join(dir, name), 'w+'); // 名字已保证唯一, 不会误伤已有文件
    const seg = { name, t, base, fd, size: 0, starts: [], lens: [] };
    segs.set(name, seg);
    order.push(name);
    return seg;
  }

  /** 扫描并索引一个已有段文件; 返回 null 表示空文件(直接删除) */
  function indexSegment(seg) {
    const p = path.join(dir, seg.name);
    const fd = fs.openSync(p, 'r+');
    const size = fs.fstatSync(fd).size;
    if (size === 0) { fs.closeSync(fd); fs.unlinkSync(p); return null; }
    const buf = Buffer.allocUnsafe(size);
    fs.readSync(fd, buf, 0, size, 0);
    const starts = [], lens = [];
    let start = 0;
    while (start < size) {
      const nl = buf.indexOf(0x0a, start);
      if (nl === -1) break; // 末尾崩溃残留(无换行): 不索引
      starts.push(start);
      lens.push(nl - start + 1);
      start = nl + 1;
    }
    if (start < size) fs.ftruncateSync(fd, start); // 截掉残留, 保持文件按行整洁
    if (starts.length === 0) {
      // 截断后一个完整行都没有(整文件都是残留): 与空文件同等处理, 不进段序
      fs.closeSync(fd);
      fs.unlinkSync(p);
      return null;
    }
    // 行号槽位保护: 异常超长段(如迁移文件)只索引最后 lineCap 行, 更早的行保留在盘上但不参与翻页
    if (starts.length > lineCap) {
      const cut = starts.length - lineCap;
      seg.starts = starts.slice(cut);
      seg.lens = lens.slice(cut);
    } else {
      seg.starts = starts;
      seg.lens = lens;
    }
    seg.fd = fd;
    seg.size = size;
    return seg;
  }

  function evictOldest() {
    const name = order.shift();
    const seg = segs.get(name);
    if (seg.fd !== null) { try { fs.closeSync(seg.fd); } catch (e) { /* ignore */ } }
    try { fs.unlinkSync(path.join(dir, name)); } catch (e) { /* ignore */ }
    segs.delete(name);
  }

  /** 启动: 扫描已有段 → 迁移旧版固定名文件 → 腾位 → 开新段(重启即切段) */
  function open() {
    if (opened) return;
    opened = true;
    fs.mkdirSync(dir, { recursive: true });
    const names = fs.readdirSync(dir).filter((n) => NAME_RE.test(n)).sort();
    for (const name of names) {
      const t = parseNameTime(name);
      const seg = indexSegment({ name, t, base: (t - EPOCH) * SEQ_MULT, fd: null, size: 0, starts: [], lens: [] });
      if (seg) { segs.set(name, seg); order.push(name); }
    }
    const legacyPath = path.join(dir, LEGACY_NAME);
    if (fs.existsSync(legacyPath)) {
      let t;
      try { t = fs.statSync(legacyPath).mtimeMs; } catch (e) { t = now(); }
      const newest = order.length ? segs.get(order[order.length - 1]) : null;
      let mt = Math.max(t, EPOCH);
      if (newest && mt <= newest.t) mt = newest.t + 1;
      let name = utcName(mt);
      while (fs.existsSync(path.join(dir, name))) { mt += 1; name = utcName(mt); }
      fs.renameSync(legacyPath, path.join(dir, name));
      const seg = indexSegment({ name, t: mt, base: (mt - EPOCH) * SEQ_MULT, fd: null, size: 0, starts: [], lens: [] });
      if (seg) { segs.set(name, seg); order.push(name); }
    }
    while (order.length >= maxFiles) evictOldest();
    createSegment(now());
  }

  function roll() {
    // 旧段保留 fd 供后续读取(与启动扫描的归档一致), 仅在淘汰/关闭时释放
    createSegment(now());
    while (order.length > maxFiles) evictOldest();
  }

  /** 追加一行, 返回其推导 seq(日志层用它对齐内存流/SSE) */
  function append(text) {
    if (!opened) open();
    const buf = Buffer.from(text + '\n', 'utf8');
    let seg = active();
    if (seg.size + buf.length > maxBytes || seg.starts.length >= lineCap) {
      roll();
      seg = active();
    }
    const start = seg.size;
    fs.writeSync(seg.fd, buf, 0, buf.length, start);
    seg.starts.push(start);
    seg.lens.push(buf.length);
    seg.size = start + buf.length;
    return seg.base + seg.starts.length - 1;
  }

  function readLine(seg, idx) {
    const start = seg.starts[idx], len = seg.lens[idx];
    const b = Buffer.allocUnsafe(len);
    const n = fs.readSync(seg.fd, b, 0, len, start);
    return b.toString('utf8', 0, n).replace(/\n$/, '');
  }

  function lastSeq() {
    for (let i = order.length - 1; i >= 0; i--) {
      const seg = segs.get(order[i]);
      if (seg.starts.length) return seg.base + seg.starts.length - 1;
    }
    return 0;
  }

  // ---- 位置游标: { si: 段下标, li: 行下标 } ----
  function prevPos(p) {
    let { si, li } = p;
    li -= 1;
    while (si >= 0 && (li < 0 || segs.get(order[si]).starts.length === 0)) {
      si -= 1;
      if (si >= 0) li = segs.get(order[si]).starts.length - 1;
    }
    return si < 0 || li < 0 ? null : { si, li };
  }

  function nextPos(p) {
    let { si, li } = p;
    li += 1;
    while (si < order.length && (li >= segs.get(order[si]).starts.length)) {
      si += 1;
      li = 0;
    }
    return si >= order.length ? null : { si, li };
  }

  /** seq 之前(不含)的最新一行位置; 无则 null */
  function beforeCursor(seq) {
    let lo = 0, hi = order.length - 1, si = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs.get(order[mid]).base <= seq) { si = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (si === -1) return null; // seq 早于最早段
    const seg = segs.get(order[si]);
    const idx = seq - seg.base;
    if (idx === 0) return prevPos({ si, li: 0 });
    if (idx < seg.starts.length) return { si, li: idx - 1 }; // 精确命中: 前一行
    return seg.starts.length ? { si, li: seg.starts.length - 1 } : prevPos({ si, li: 0 });
  }

  /** 从段 si 起第一个非空段的首行位置; 全空/越界返回 null */
  function firstNonEmptyFrom(si) {
    for (let i = si; i < order.length; i++) {
      if (segs.get(order[i]).starts.length) return { si: i, li: 0 };
    }
    return null;
  }

  /** seq 之后(不含)的最旧一行位置; 无则 null */
  function afterCursor(seq) {
    let lo = 0, hi = order.length - 1, si = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs.get(order[mid]).base <= seq) { si = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (si === -1) return firstNonEmptyFrom(0); // seq 早于最早段
    const seg = segs.get(order[si]);
    const idx = seq - seg.base;
    if (idx + 1 < seg.starts.length) return { si, li: idx + 1 };
    // 越过本段: 跳过空段(如刚开新段尚未写行), 否则会读到越界行
    return firstNonEmptyFrom(si + 1);
  }

  /** seq 严格小于 beforeSeq 的最近 limit 行(从旧到新); 已被淘汰的历史自然为空 */
  function readBackFiltered(beforeSeq, limit = 100, match = null) {
    if (!opened || !order.length) return [];
    const out = [];
    let cur = beforeCursor(beforeSeq);
    while (cur && out.length < limit) {
      const seg = segs.get(order[cur.si]);
      const line = readLine(seg, cur.li);
      if (!match || match(line)) out.push({ seq: seg.base + cur.li, line });
      cur = prevPos(cur);
    }
    out.reverse();
    return out;
  }

  /** seq 严格大于 afterSeq 的最近 limit 行(从旧到新, 供 SSE 断线补缺口) */
  function readAfter(afterSeq, limit = 1000, match = null) {
    if (!opened || !order.length) return [];
    const out = [];
    let cur = afterCursor(afterSeq);
    while (cur && out.length < limit) {
      const seg = segs.get(order[cur.si]);
      const line = readLine(seg, cur.li);
      if (!match || match(line)) out.push({ seq: seg.base + cur.li, line });
      cur = nextPos(cur);
    }
    return out;
  }

  function close() {
    for (const seg of segs.values()) {
      if (seg.fd !== null) { try { fs.closeSync(seg.fd); } catch (e) { /* ignore */ } seg.fd = null; }
    }
    opened = false;
  }

  return {
    open, append, close, readBackFiltered, readAfter, lastSeq,
    segmentNames: () => [...order],
    maxBytes, maxFiles, maxLines: lineCap
  };
}

module.exports = { createFileLog };
