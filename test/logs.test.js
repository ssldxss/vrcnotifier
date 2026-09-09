'use strict';
// 日志重构测试: 输出格式 / 流内行替换 / 多段文件日志。
// 段模型: 一段一文件(vrcnotifier-<UTC时间戳>.log), 启动即切段, 段满(maxBytes/maxLines)再切,
// 总段数超过 maxFiles 时删除名字最小(最老)的段。
// seq 不落盘: seq = f(文件名, 段内行号) 确定性推导 —— 同一行在任何一次运行里都得到同一个 seq,
// 跨重启天然连续, 对段淘汰免疫; 文件内容保持纯净(不嵌入任何编号)。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, setLogStream, setFileLog, maskKey } = require('../src/util');
const { createLogStream } = require('../src/logstream');
const { createFileLog } = require('../src/filelog');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-log-')); }
const T0 = Date.UTC(2026, 8, 9, 12, 0, 0, 0); // 2026-09-09T12:00:00.000Z

// ---------- 行格式与内存流(兼容原行为) ----------
test('日志格式: [时间] [级别] [分类] 正文, 内嵌标签被提取为统一分类', () => {
  const out = [];
  setLogStream(null);
  setFileLog(null);
  const log = createLogger('app', (l) => out.push(l));
  log.info('[ws] 已连接 userId=u1');
  log.warn('[通知] QQ 推送失败: x');
  log.error('[monitor] 连接故障超过 5 分钟未恢复, 已推送故障通知 userId=u1');
  log.info('[启动] ======== 运行开始 ========');
  log.warn('[health] 探测异常: boom');
  assert.match(out[0], /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[info\] \[ws\] 已连接 userId=u1$/);
  assert.match(out[1], /^\[[^\]]*\] \[warn\] \[notify\] QQ 推送失败: x$/);
  assert.match(out[2], /^\[[^\]]*\] \[error\] \[monitor\] 连接故障超过 5 分钟未恢复, 已推送故障通知 userId=u1$/);
  assert.match(out[3], /^\[[^\]]*\] \[info\] \[startup\] ======== 运行开始 ========$/);
  assert.match(out[4], /^\[[^\]]*\] \[warn\] \[status\] 探测异常: boom$/);
});

test('日志流 update 替换行并通知订阅者(令牌打码用)', () => {
  const stream = createLogStream();
  const entry = stream.push('[t] [info] [startup] 已生成访问令牌: secret123');
  const seen = [];
  stream.subscribe((e, kind) => seen.push([e.seq, kind, e.line]));
  const updated = stream.update(entry.seq, '[t] [info] [startup] 已生成访问令牌: ****');
  assert.equal(updated.line, '[t] [info] [startup] 已生成访问令牌: ****');
  assert.deepEqual(seen[0], [entry.seq, 'update', '[t] [info] [startup] 已生成访问令牌: ****']);
  assert.equal(stream.findLast((e) => e.line.includes('已生成访问令牌')).seq, entry.seq);
});

// ---------- 段命名与 seq 推导 ----------
test('文件日志: 启动开新段, 创建时间命名, seq 随行自增且大于 0', () => {
  const dir = tmpDir();
  try {
    const fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    const names = fl.segmentNames();
    assert.equal(names.length, 1);
    assert.match(names[0], /^vrcnotifier-\d{8}-\d{6}-\d{3}\.log$/);
    const s1 = fl.append('[t] [info] [ws] line1');
    const s2 = fl.append('[t] [info] [ws] line2');
    assert.ok(s1 > 0);
    assert.equal(s2, s1 + 1, '同段内行号连续, seq 连续');
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('文件日志: 重启后开新段且旧段保留, 旧行 seq 原样重现(不落盘也稳定)', () => {
  const dir = tmpDir();
  try {
    let fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    const seqA = [fl.append('[t] [info] [ws] a1'), fl.append('[t] [info] [ws] a2')];
    const namesA = fl.segmentNames();
    fl.close();
    // 模拟重启(时钟冻结, bump 兜底推 +1ms): 旧段行的 seq 必须一字不差地重现
    fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    assert.deepEqual(fl.readBackFiltered(seqA[1] + 1, 10).map((e) => e.seq), seqA);
    assert.equal(fl.readBackFiltered(seqA[1] + 1, 10)[0].line.includes('a1'), true);
    const s3 = fl.append('[t] [info] [ws] b1');
    assert.ok(s3 > seqA[1], 'seq 跨重启继续增大');
    assert.equal(fl.segmentNames().length, 2);
    assert.ok(fl.segmentNames()[1] > namesA[0], '新段名严格大于旧段名');
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 滚动与淘汰 ----------
test('文件日志: 段满(maxBytes)开新段, 总段数超过 maxFiles 删除名字最小(最老)的段', () => {
  const dir = tmpDir();
  try {
    const fl = createFileLog({ dir, maxBytes: 200, maxFiles: 3, now: () => T0 });
    fl.open();
    const seqs = [];
    for (let i = 0; i < 40; i++) seqs.push(fl.append(`[t] [info] [ws] line ${i}`));
    assert.equal(fl.segmentNames().length, 3);
    // 被淘汰段: 最早写入的 seq 不再可读且不报错
    assert.deepEqual(fl.readBackFiltered(seqs[0] + 1, 5), []);
    // 存活行: seq 严格递增, 段内连续(+1), 段间有推导间隙(大跳)
    const all = fl.readBackFiltered(seqs[seqs.length - 1] + 1, 1000);
    assert.ok(all.length > 0 && all.length < seqs.length, '部分行被淘汰');
    for (let i = 1; i < all.length; i++) {
      const d = all[i].seq - all[i - 1].seq;
      assert.ok(d === 1 || d > 1000, `相邻 seq 差应为段内 1 或段间大跳, 实际 ${d}`);
    }
    // 磁盘上确实只剩 3 个段文件
    const files = fs.readdirSync(dir).filter((n) => n.endsWith('.log'));
    assert.equal(files.length, 3);
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('文件日志: 达到 maxLines 行数也切段(极小行场景)', () => {
  const dir = tmpDir();
  try {
    const fl = createFileLog({ dir, maxBytes: 1024 * 1024, maxLines: 5, maxFiles: 3, now: () => T0 });
    fl.open();
    for (let i = 0; i < 12; i++) fl.append('x');
    assert.equal(fl.segmentNames().length, 3);
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 跨段读取契约 ----------
test('文件日志: before 翻页跨段凑满 limit, 全局尽头才出现短页; after 跨段向前补齐', () => {
  const dir = tmpDir();
  try {
    const fl = createFileLog({ dir, maxBytes: 120, maxFiles: 6, now: () => T0 });
    fl.open();
    const seqs = [];
    for (let i = 0; i < 30; i++) seqs.push(fl.append(`[t] [info] [ws] line ${i}`));
    // 逐页向前翻, 每页 2 条: 除最后一页外每页都应凑满(前端 hasOlder 契约)
    let cursor = seqs[seqs.length - 1] + 1;
    const pages = [];
    for (let guard = 0; guard < 200; guard++) {
      const page = fl.readBackFiltered(cursor, 2);
      if (!page.length) break;
      pages.push(page.map((e) => e.seq));
      cursor = page[0].seq;
    }
    const full = pages.slice(0, -1);
    assert.ok(full.length > 3, '确实发生了跨段翻页');
    assert.ok(full.every((p) => p.length === 2), '非末页必须凑满 limit');
    // 末页凑满或短页均可(取决于存活总数奇偶); 循环以空页收尾 = 其后已无更早行
    assert.ok(pages[pages.length - 1].length <= 2);
    // 每页内部从旧到新(服务端契约); 页与页之间向更早推进
    for (const p of pages) {
      assert.ok(p.every((s, i) => i === 0 || s > p[i - 1]), '页内从旧到新');
    }
    // 并集 == 全量存活行, 无重无漏
    const flat = pages.flat();
    const all = fl.readBackFiltered(seqs[seqs.length - 1] + 1, 1000); // 全量, 从旧到新
    assert.deepEqual([...flat].sort((a, b) => a - b), all.map((e) => e.seq));
    // after: 从中间行向后, 恰好是其后的所有行(跨段)
    const mid = all[Math.floor(all.length / 2)].seq;
    assert.deepEqual(
      fl.readAfter(mid, 1000).map((e) => e.seq),
      all.filter((e) => e.seq > mid).map((e) => e.seq)
    );
    // after 从被淘汰区间之前起算: 优雅返回存活窗口全部
    assert.deepEqual(fl.readAfter(0, 1000).map((e) => e.seq), all.map((e) => e.seq));
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('文件日志: readBackFiltered 跳过不匹配行跨段凑满 limit, 到全局头为止', () => {
  const dir = tmpDir();
  try {
    const fl = createFileLog({ dir, maxBytes: 120, maxFiles: 6, now: () => T0 });
    fl.open();
    const seqs = [];
    for (let i = 0; i < 30; i++) {
      seqs.push(fl.append(i % 3 === 0 ? `[t] [warn] [qq] warn ${i}` : `[t] [info] [ws] line ${i}`));
    }
    const matchWarn = (l) => l.includes('[warn]');
    const rows = fl.readBackFiltered(seqs[seqs.length - 1] + 1, 1000, matchWarn);
    assert.ok(rows.length >= 3, 'warn 行跨段分布');
    assert.ok(rows.every((e) => matchWarn(e.line)), '全部命中筛选');
    const page = fl.readBackFiltered(seqs[seqs.length - 1] + 1, 2, matchWarn);
    assert.equal(page.length, 2, '带筛选也要跨段凑满 limit');
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 文件名单调性(bump 规则) ----------
test('文件日志: 同毫秒重启/时钟回拨时新段名自动前推, 绝不覆盖已有段', () => {
  const dir = tmpDir();
  try {
    let fl = createFileLog({ dir, now: () => T0 });
    fl.open(); fl.append('a');
    const n1 = fl.segmentNames()[0];
    fl.close();
    // 同一时钟重启
    fl = createFileLog({ dir, now: () => T0 });
    fl.open(); fl.append('b');
    assert.ok(fl.segmentNames()[1] > n1, '同毫秒新段名被推前');
    assert.equal(fs.existsSync(path.join(dir, n1)), true, '旧段未被覆盖');
    fl.close();
    // 时钟回拨一天
    fl = createFileLog({ dir, now: () => T0 - 86400000 });
    fl.open(); fl.append('c');
    const names = fl.segmentNames();
    assert.ok(names[names.length - 1] > names[names.length - 2], '回拨后新段名仍严格大于已有');
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 迁移与崩溃残留 ----------
test('文件日志: 旧版固定名 vrcnotifier.log 按 mtime 迁移为段并参与翻页', () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'vrcnotifier.log'), '[t] [info] [ws] old1\n[t] [info] [ws] old2\n');
    const fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    assert.equal(fs.existsSync(path.join(dir, 'vrcnotifier.log')), false, '旧名已迁移');
    const all = fl.readBackFiltered(Number.MAX_SAFE_INTEGER, 10);
    assert.deepEqual(all.map((e) => e.line), ['[t] [info] [ws] old1', '[t] [info] [ws] old2']);
    const s = fl.append('[t] [info] [ws] new1');
    assert.ok(s > all[all.length - 1].seq, '新行 seq 大于迁移行');
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('文件日志: 崩溃残留行(末尾无换行)被丢弃并截断, 不影响翻页', () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'vrcnotifier-20260909-000000-000.log'), 'a\nb\nc-part');
    const fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    const all = fl.readBackFiltered(Number.MAX_SAFE_INTEGER, 10);
    assert.deepEqual(all.map((e) => e.line), ['a', 'b']);
    assert.equal(fs.readFileSync(path.join(dir, 'vrcnotifier-20260909-000000-000.log'), 'utf8'), 'a\nb\n');
    const s = fl.append('x');
    assert.ok(s > all[all.length - 1].seq);
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- logger 集成(seq 由文件层提供) ----------
test('logger 同写内存流与文件: seq 由文件层分配, 文件保持原行格式(无附加后缀)', () => {
  const dir = tmpDir();
  try {
    const stream = createLogStream();
    setLogStream(stream);
    const fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    setFileLog(fl);
    const log = createLogger('app', () => {});
    const e1 = log.info('[startup] 已生成访问令牌: SECRET-TOKEN-12345678');
    log.warn('[qq] 断开 appId=1');
    assert.ok(e1 && e1.seq > 0);
    // 流与文件 seq 一致
    const fileRows = fl.readBackFiltered(fl.lastSeq() + 1, 10);
    assert.deepEqual(stream.tail(10).map((x) => x.seq), fileRows.map((e) => e.seq));
    // 文件保持原始行文本, 无内嵌编号
    assert.equal(fileRows[0].line.includes('SECRET-TOKEN-12345678'), true);
    assert.equal(fileRows[0].line.includes('#'), false);
    // 流内 update 不影响文件(文件保留明文)
    stream.update(e1.seq, 'masked');
    assert.equal(fl.readBackFiltered(fl.lastSeq() + 1, 10)[0].line.includes('SECRET-TOKEN-12345678'), true);
    fl.close();
    setLogStream(null);
    setFileLog(null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 空段防御(生产事故: after=最新行 在空段存在时 500) ----------
test('文件日志: 崩溃残留只含半行的段被截断为 0 行后, 不得进入段序(视为空文件删除)', () => {
  const dir = tmpDir();
  try {
    // 半行残留(无换行) + 完整段
    fs.writeFileSync(path.join(dir, 'vrcnotifier-20260909-000000-000.log'), '只有半行没有换行');
    const fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    assert.equal(fs.existsSync(path.join(dir, 'vrcnotifier-20260909-000000-000.log')), false, '0 行段被删除');
    const s = fl.append('line1');
    // after=最新行: 不抛错, 返回空
    assert.deepEqual(fl.readAfter(s, 10), []);
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('文件日志: 活跃新段尚空时(刚 open 未写行), after=已有最新行 seq 不抛错', () => {
  const dir = tmpDir();
  try {
    let fl = createFileLog({ dir, now: () => T0 });
    fl.open();
    const last = fl.append('[t] [info] [ws] a');
    fl.close();
    // 模拟重启: open 建了新活跃段(空), 请求先于第一条新日志到达
    fl = createFileLog({ dir, now: () => T0 + 5000 });
    fl.open();
    assert.equal(fl.segmentNames().length, 2);
    assert.deepEqual(fl.readAfter(last, 10), [], 'after=旧最新行 → 空(新段尚无行), 不抛错');
    assert.deepEqual(fl.readAfter(last + 1, 10), []);
    assert.deepEqual(fl.readAfter(0, 10).map((e) => e.line), ['[t] [info] [ws] a'], 'after=0 仍读到旧行');
    fl.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('maskKey 保留前 4 后 4, 过短全掩', () => {
  assert.equal(maskKey('abcdefgh12345678'), 'abcd****5678');
  assert.equal(maskKey('short'), '****');
});
