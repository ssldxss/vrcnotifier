'use strict';
// 轮替压测: 写入 20MB 假日志(1MB 段 × 6 段上限 → 触发 ~20 次滚动与多轮淘汰),
// 过程中按固定种子伪随机选 3 个位置模拟重启(close → 重新 open),
// 验证轮替机制的不变量: 段数封顶、磁盘封顶、seq 严格递增、内容零错乱、
// 翻页契约(非末页凑满)、tail/after 全程可用、重启前后存活行原样可读。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFileLog } = require('../src/filelog');

// mulberry32: 固定种子伪随机(可复现的「随机」重启点)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEG_BYTES = 1024 * 1024;   // 1MB 段: 20MB 写入 → ~20 次滚动, 充分触发淘汰
const MAX_FILES = 6;
const TOTAL_BYTES = 20 * 1024 * 1024;
const RESTARTS = 3;
const SEED = 20260909;

test('轮替压测: 20MB 假日志 + 3 次随机重启, 轮替不变量成立', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-roll-'));
  try {
    const rand = mulberry32(SEED);
    const restartAt = new Set();
    while (restartAt.size < RESTARTS) restartAt.add(1 + Math.floor(rand() * 18)); // 约 18 个观察窗
    let fl = createFileLog({ dir, maxBytes: SEG_BYTES, maxFiles: MAX_FILES });
    fl.open();

    let written = 0;
    let lineNo = 0;
    let restartsDone = 0;
    const snapshots = []; // 每次重启前: 存活尾部快照, 重启后必须原样重现

    while (written < TOTAL_BYTES) {
      lineNo += 1;
      const line = `[2026-09-09 12:00:00] [info] [ws] line ${lineNo} ${'x'.repeat(40 + (lineNo % 60))}`;
      const seq = fl.append(line);
      assert.equal(seq, fl.lastSeq(), 'append 返回值 = 最新水位');
      written += Buffer.byteLength(line, 'utf8') + 1;

      if (restartAt.has(Math.floor(written / (TOTAL_BYTES / 20))) && restartsDone < RESTARTS) {
        restartAt.delete(Math.floor(written / (TOTAL_BYTES / 20)));
        restartsDone += 1;
        // 重启前快照: 最后 30 行
        const tailBefore = fl.readBackFiltered(fl.lastSeq() + 1, 30);
        fl.close();
        fl = createFileLog({ dir, maxBytes: SEG_BYTES, maxFiles: MAX_FILES });
        fl.open();
        // 重启即切段; 旧段行原样可读、seq 原样重现
        const tailAfter = fl.readBackFiltered(tailBefore[tailBefore.length - 1].seq + 1, 30);
        assert.deepEqual(tailAfter, tailBefore, `第 ${restartsDone} 次重启后尾部 30 行必须原样重现`);
        lineNo += 1;
        const s = fl.append(`[2026-09-09 12:00:01] [info] [ws] line ${lineNo} restart#${restartsDone} ${'y'.repeat(20)}`);
        assert.ok(s > tailBefore[tailBefore.length - 1].seq, '重启后 seq 继续递增');
      }

      // 每个观察窗抽查: 段数与磁盘封顶
      if (lineNo % 5000 === 0) {
        assert.ok(fl.segmentNames().length <= MAX_FILES, '段数封顶');
        const bytes = fs.readdirSync(dir).filter((n) => n.endsWith('.log'))
          .reduce((sum, n) => sum + fs.statSync(path.join(dir, n)).size, 0);
        assert.ok(bytes <= SEG_BYTES * MAX_FILES, `磁盘封顶 ${SEG_BYTES * MAX_FILES}, 实际 ${bytes}`);
      }
    }
    assert.equal(restartsDone, RESTARTS, '3 次重启都已发生');

    // ---- 最终不变量 ----
    assert.ok(fl.segmentNames().length <= MAX_FILES);
    const files = fs.readdirSync(dir).filter((n) => n.endsWith('.log'));
    assert.equal(files.length, fl.segmentNames().length);
    assert.deepEqual([...files].sort(), fl.segmentNames(), '目录内容与段清单一致');
    const bytes = files.reduce((sum, n) => sum + fs.statSync(path.join(dir, n)).size, 0);
    // 淘汰证明: 20MB 写入 vs 6MB 磁盘上限 — 超出部分必然被轮替淘汰
    assert.ok(written >= TOTAL_BYTES && bytes <= SEG_BYTES * MAX_FILES);
    assert.equal(fl.segmentNames().length, MAX_FILES, '持续写入下段数保持在封顶值');

    // 全量走读: seq 严格递增, 行号负载严格递增(零重复零乱序), 段名单调
    const all = fl.readBackFiltered(fl.lastSeq() + 1, 1000000);
    assert.ok(all.length > 10000, `存活行数量充足, 实际 ${all.length}`);
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i].seq > all[i - 1].seq, 'seq 严格递增');
    }
    for (const e of all) {
      const m = /line (\d+)/.exec(e.line);
      assert.ok(m, '行格式完整(无截断/错位): ' + e.line.slice(0, 60));
    }
    const nums = all.map((e) => +/line (\d+)/.exec(e.line)[1]);
    for (let i = 1; i < nums.length; i++) {
      assert.ok(nums[i] > nums[i - 1], `负载行号严格递增(${nums[i - 1]} -> ${nums[i]})`);
    }

    // tail 契约: 始终有值且 = 全量走读的尾部
    const tail = fl.readBackFiltered(fl.lastSeq() + 1, 100);
    assert.equal(tail.length, 100);
    assert.deepEqual(tail, all.slice(-100));

    // before 翻页契约: 每页 500 条, 非末页必须凑满; 并集 = 全量
    let cursor = fl.lastSeq() + 1;
    const paged = [];
    let pageCount = 0;
    for (;;) {
      const page = fl.readBackFiltered(cursor, 500);
      if (!page.length) break;
      pageCount += 1;
      if (paged.length) assert.ok(pageCount < 1000, '翻页有界');
      paged.unshift(...page);
      cursor = page[0].seq;
      if (page.length < 500) break; // 全局尽头短页
    }
    assert.deepEqual(paged, all, '逐页翻读 = 一次全量走读');
    assert.ok(pageCount >= Math.ceil(all.length / 500) - 1 && pageCount <= Math.ceil(all.length / 500) + 1);

    // after 契约: 从 0 起 = 全量(被淘汰区间之前的 after 优雅返回存活窗口)
    assert.deepEqual(fl.readAfter(0, 1000000), all);
    // after 中段: 与全量的尾段一致
    const mid = all[Math.floor(all.length / 2)].seq;
    assert.deepEqual(fl.readAfter(mid, 1000000), all.filter((e) => e.seq > mid));

    // 淘汰不可达: 存活窗口之前的 seq 查询返回空且不报错
    assert.deepEqual(fl.readBackFiltered(all[0].seq, 10), []);

    fl.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
