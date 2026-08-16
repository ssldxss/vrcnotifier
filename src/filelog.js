'use strict';
// 本地文件日志: 固定单文件 data/logs/vrcnotifier.log。
// 每次启动清空重建(首行为运行标识); 单文件上限 maxBytes(默认 10MB), 写满后清空从头覆盖;
// 维护每行 seq -> 字节偏移 索引, 供 /api/logs?before=seq 向前翻页。
// 文件内保留明文(本地操作员可见), 打码只发生在服务端出站(SSE/API)时。

const fs = require('node:fs');
const path = require('node:path');

function createFileLog({ file, maxBytes = 10 * 1024 * 1024 } = {}) {
  if (!file) return null;
  let fd = null;
  let size = 0;
  const index = new Map(); // seq -> { start, len }(仅当前文件内容; 轮转后清空)
  let firstSeq = null;
  let lastSeq = 0;

  function open() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');  // 每次启动清空重建(同时确保文件存在)
    fd = fs.openSync(file, 'r+'); // 可读可写; Windows 下 'a+' 无法 ftruncate, 'w' 只写不能读
    size = 0;
    index.clear();
    firstSeq = null;
    lastSeq = 0;
  }

  function writeText(text) {
    const buf = Buffer.from(text + '\n', 'utf8');
    fs.writeSync(fd, buf, 0, buf.length, size);
    const start = size;
    size += buf.length;
    return { start, len: buf.length };
  }

  /** 追加一行是否将超过上限 */
  function willOverflow(text) {
    return fd !== null && size + Buffer.byteLength(text, 'utf8') + 1 > maxBytes;
  }

  /** 写满: 清空文件从头覆盖; 文件内先留一行无 seq 的轮转标记(不参与分页索引) */
  function rotate() {
    fs.ftruncateSync(fd, 0);
    size = 0;
    index.clear();
    firstSeq = null;
    writeText('[轮转] 日志文件已达 ' + Math.round(maxBytes / 1024 / 1024) + 'MB 上限, 清空后从头覆盖旧日志');
  }

  /** 追加一行; seq 与内存日志流一致(为 null 时是文件内部行, 不索引) */
  function append(text, seq) {
    if (fd === null) open();
    const { start, len } = writeText(text);
    if (seq !== undefined && seq !== null) {
      index.set(seq, { start, len });
      if (firstSeq === null || seq < firstSeq) firstSeq = seq;
      if (seq > lastSeq) lastSeq = seq;
    }
    return { seq, start, len };
  }

  /** 读取 seq 严格小于 beforeSeq 的最近 limit 行(返回从旧到新); 已被轮转覆盖的返回空 */
  function readBefore(beforeSeq, limit = 100) {
    return readBackFiltered(beforeSeq, limit, null);
  }

  /**
   * 向后扫描直到凑满 limit 条满足 match 的行(跳过不匹配行, 供前端筛选使用);
   * match 为 null 时不筛选; 已被轮转覆盖/到文件开头的返回空。
   */
  function readBackFiltered(beforeSeq, limit = 100, match = null) {
    if (fd === null) return [];
    const out = [];
    let s = beforeSeq - 1;
    while (out.length < limit && firstSeq !== null && s >= firstSeq) {
      const meta = index.get(s);
      if (meta) {
        const b = Buffer.alloc(meta.len);
        fs.readSync(fd, b, 0, meta.len, meta.start);
        const line = b.toString('utf8').replace(/\n$/, '');
        if (!match || match(line)) out.push({ seq: s, line });
      }
      s--;
    }
    out.reverse();
    return out;
  }

  function close() {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* ignore */ } fd = null; }
  }

  return { open, append, willOverflow, rotate, readBefore, readBackFiltered, close, maxBytes, size: () => size, lastSeq: () => lastSeq };
}

module.exports = { createFileLog };
