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
