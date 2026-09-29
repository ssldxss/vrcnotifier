'use strict';
// 虚拟列表的纯计算: 行高模型、前缀和定位、可见区间、占位高度、换组集合。
// 抽成模块的原因: 这几处是虚拟化最容易错的地方(区间算错会露白/错位), 而且完全不碰 DOM, 可以单测。

const test = require('node:test');
const assert = require('node:assert');
const v = require('../public/vlist');

const H = 61;

test('estimateHeight: 没测到过就用兜底值, 测到过就用实测均值', () => {
  assert.equal(v.estimateHeight({ sum: 0, count: 0, fallback: 61 }), 61);
  assert.equal(v.estimateHeight({ sum: 122, count: 2, fallback: 61 }), 61);
  assert.equal(v.estimateHeight({ sum: 127, count: 2, fallback: 61 }), 63.5);
});

test('buildOffsets: 前缀和, 长度 = 行数 + 1', () => {
  assert.deepEqual(Array.from(v.buildOffsets([61, 61, 61])), [0, 61, 122, 183]);
  assert.deepEqual(Array.from(v.buildOffsets([])), [0]);
  assert.deepEqual(Array.from(v.buildOffsets([60])), [0, 60]);
});

test('indexAt: 落在哪一行(边界归下一行)', () => {
  const off = v.buildOffsets([H, H, H]); // [0,61,122,183]
  assert.equal(v.indexAt(off, -5), 0);
  assert.equal(v.indexAt(off, 0), 0);
  assert.equal(v.indexAt(off, 60.9), 0);
  assert.equal(v.indexAt(off, H), 1);
  assert.equal(v.indexAt(off, 182), 2);
  assert.equal(v.indexAt(off, 183), 2, '超出末尾 → 最后一行');
  assert.equal(v.indexAt(off, 9999), 2);
});

test('indexAt: 空列表 → -1', () => {
  assert.equal(v.indexAt(v.buildOffsets([]), 0), -1);
});

test('visibleRange: 组在视口内 → 覆盖视口上下各一个 overscan', () => {
  const off = v.buildOffsets(new Array(100).fill(H)); // 100 行, 总高 6100
  // groupTop=1000, scrollTop=1000, 视口 720, overscan 600
  // 需要覆盖的相对区间: [-600, 1320] → 行 0 .. 21
  assert.deepEqual(v.visibleRange({ offsets: off, groupTop: 1000, scrollTop: 1000, viewportH: 720, overscan: 600 }), { from: 0, to: 21 });
});

test('visibleRange: overscan=0 时严格按视口取', () => {
  const off = v.buildOffsets(new Array(100).fill(H));
  assert.deepEqual(v.visibleRange({ offsets: off, groupTop: 0, scrollTop: 61, viewportH: 61, overscan: 0 }), { from: 1, to: 2 });
});

test('visibleRange: 组完全在视口外(上/下) → null(但组高仍要靠空白撑住)', () => {
  const off = v.buildOffsets(new Array(100).fill(H)); // 总高 6100
  // 组在视口下方很远
  assert.equal(v.visibleRange({ offsets: off, groupTop: 10000, scrollTop: 0, viewportH: 720, overscan: 600 }), null);
  // 组在视口上方很远
  assert.equal(v.visibleRange({ offsets: off, groupTop: 0, scrollTop: 7100, viewportH: 720, overscan: 600 }), null);
});

test('visibleRange: 空组 → null', () => {
  assert.equal(v.visibleRange({ offsets: v.buildOffsets([]), groupTop: 0, scrollTop: 0, viewportH: 720, overscan: 600 }), null);
});

test('spacersFor: 未渲染的行用组内空白补足高度', () => {
  const off = v.buildOffsets([H, H, H, H]); // 总高 244
  assert.deepEqual(v.spacersFor({ offsets: off, from: 1, to: 2 }), { before: 61, after: 61 });
  assert.deepEqual(v.spacersFor({ offsets: off, from: 0, to: 3 }), { before: 0, after: 0 });
});

test('spacersFor: 一行都不渲染时, 整组高度挂在顶部空白上(否则页面会塌)', () => {
  const off = v.buildOffsets([H, H, H]);
  assert.deepEqual(v.spacersFor({ offsets: off, from: 0, to: -1 }), { before: 183, after: 0 });
});

test('buildOffsets: 接受"生效行高"(调用方可在传入前应用末行少 1px 之类的修正)', () => {
  // 真实列表里每组的末行没有下边框, 比其它行少 1px —— 这个修正由调用方在传入前应用
  const eff = [61, 61, 60];
  const off = v.buildOffsets(eff);
  assert.deepEqual(Array.from(off), [0, 61, 122, 182]);
  assert.deepEqual(v.spacersFor({ offsets: off, from: 2, to: 2 }), { before: 122, after: 0 });
});

test('groupChanges: 区分"换组 / 新进来 / 消失"', () => {
  const before = { a: 'online', b: 'offline' };
  const after = { a: 'offline', b: 'offline', c: 'online' };
  assert.deepEqual(v.groupChanges(before, after), { moved: ['a'], entered: ['c'], left: [] });
});

test('groupChanges: 好友消失 / 首次出现', () => {
  assert.deepEqual(v.groupChanges({ a: 'online' }, {}), { moved: [], entered: [], left: ['a'] });
  assert.deepEqual(v.groupChanges({}, { a: 'online' }), { moved: [], entered: ['a'], left: [] });
});

test('groupChanges: 组没变就不算变化(交给文案翻动)', () => {
  assert.deepEqual(v.groupChanges({ a: 'online' }, { a: 'online' }), { moved: [], entered: [], left: [] });
});

// ---- 双层范围(virt-list 式): 可见范围严格, 渲染范围在它外面多留 buffer ----
// 只有"可见范围"变了才需要改 DOM —— 滚动过程中大部分帧 DOM 完全不动, 正在播的动画才不会被重建打断。

test('renderRange: 可见范围上下各留 buffer', () => {
  assert.deepEqual(v.renderRange({ from: 10, to: 20, count: 100, buffer: 5 }), { from: 5, to: 25 });
});

test('renderRange: 两端夹紧到 [0, count-1]', () => {
  assert.deepEqual(v.renderRange({ from: 0, to: 3, count: 100, buffer: 5 }), { from: 0, to: 8 });
  assert.deepEqual(v.renderRange({ from: 95, to: 99, count: 100, buffer: 5 }), { from: 90, to: 99 });
  assert.deepEqual(v.renderRange({ from: 0, to: 0, count: 1, buffer: 8 }), { from: 0, to: 0 });
});

test('renderRange: buffer=0 就是可见范围本身', () => {
  assert.deepEqual(v.renderRange({ from: 3, to: 7, count: 50, buffer: 0 }), { from: 3, to: 7 });
});

test('renderRange: 可见范围为空 → 渲染范围也为空', () => {
  assert.equal(v.renderRange({ inView: null, count: 50, buffer: 5 }), null);
  assert.equal(v.renderRange({ from: 0, to: -1, count: 50, buffer: 5 }), null);
});

test('sameRange: 判断"可见范围有没有真的变"(没变就别动 DOM)', () => {
  assert.equal(v.sameRange({ from: 1, to: 2 }, { from: 1, to: 2 }), true);
  assert.equal(v.sameRange(null, null), true);
  assert.equal(v.sameRange({ from: 1, to: 2 }, { from: 1, to: 3 }), false);
  assert.equal(v.sameRange({ from: 1, to: 2 }, null), false);
  assert.equal(v.sameRange(null, { from: 1, to: 2 }), false);
});

test('reconcileIds: 窗口平移一格 → 只在尾部新建一个、头部删掉一个(其余复用)', () => {
  assert.deepEqual(v.reconcileIds(['a', 'b', 'c'], ['b', 'c', 'd']), { create: ['d'], remove: ['a'], keep: ['b', 'c'] });
});

test('reconcileIds: 没变 → 什么都不用动', () => {
  assert.deepEqual(v.reconcileIds(['a', 'b'], ['a', 'b']), { create: [], remove: [], keep: ['a', 'b'] });
});

test('reconcileIds: 整窗换掉 / 清空', () => {
  assert.deepEqual(v.reconcileIds(['a', 'b'], ['c', 'd']), { create: ['c', 'd'], remove: ['a', 'b'], keep: [] });
  assert.deepEqual(v.reconcileIds(['a', 'b'], []), { create: [], remove: ['a', 'b'], keep: [] });
  assert.deepEqual(v.reconcileIds([], ['a']), { create: ['a'], remove: [], keep: [] });
});
