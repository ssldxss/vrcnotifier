'use strict';
// 前端日志窗口裁剪策略(纯函数, 供 app.js 与 Node 测试共用)。
// 上限 MAX_ROWS: 直播/翻页两条路径统一的总窗口; 方向感知: 从远离浏览焦点的一侧裁剪。

const test = require('node:test');
const assert = require('node:assert');
const logview = require('../public/logview');

test('logview: 默认上限 5000', () => {
  assert.equal(logview.MAX_ROWS, 5000);
});

test('logview: 未超限不裁剪', () => {
  assert.deepEqual(logview.plan({ totalRows: 0, mode: 'live' }), { side: 'bottom', count: 0 });
  assert.deepEqual(logview.plan({ totalRows: 4999, mode: 'live' }), { side: 'bottom', count: 0 });
  assert.deepEqual(logview.plan({ totalRows: 5000, mode: 'live' }), { side: 'bottom', count: 0 });
  assert.deepEqual(logview.plan({ totalRows: 5000, mode: 'older' }), { side: 'top', count: 0 });
});

test('logview: 直播路径超限 → 裁底部(最老)行', () => {
  const p = logview.plan({ totalRows: 5100, mode: 'live' });
  assert.equal(p.side, 'bottom');
  assert.equal(p.count, 100);
});

test('logview: 翻页路径超限 → 裁顶部(最新)行, 底部刚加载的旧行保留', () => {
  const p = logview.plan({ totalRows: 5200, mode: 'older' });
  assert.equal(p.side, 'top');
  assert.equal(p.count, 200);
});

test('logview: 一次批量翻页(如 100 行)后的裁剪量 = 恰好回到上限', () => {
  // 4950 行时翻入 100 行旧日志 → 总 5050 → 顶部裁 50
  const p = logview.plan({ totalRows: 5050, mode: 'older' });
  assert.equal(p.count, 50);
  assert.equal(p.side, 'top');
});

test('logview: 显式 maxRows 覆盖默认值', () => {
  assert.equal(logview.plan({ totalRows: 30, maxRows: 20, mode: 'live' }).count, 10);
});

test('logview: 非法输入防御(负数/NaN/缺 mode 视为 live)', () => {
  assert.equal(logview.plan({ totalRows: -5, mode: 'live' }).count, 0);
  assert.equal(logview.plan({ totalRows: NaN, mode: 'older' }).count, 0);
  assert.equal(logview.plan({ totalRows: 6000 }).side, 'bottom');
});
