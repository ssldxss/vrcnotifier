'use strict';
// 丝滑滚动(惯性滚动)的纯数学: 滚轮增量归一化、目标夹取、指数趋近、收敛判定。
// 原先内联在 app.js 的 initSmoothScroll 里, 抽出来后可在 Node 下单测。

const test = require('node:test');
const assert = require('node:assert');
const sm = require('../public/scrollmath');

test('normalizeWheelDelta: 像素模式原样', () => {
  assert.equal(sm.normalizeWheelDelta(100, 0, 800), 100);
  assert.equal(sm.normalizeWheelDelta(-100, 0, 800), -100);
});

test('normalizeWheelDelta: 行模式按 16px/行换算', () => {
  assert.equal(sm.normalizeWheelDelta(3, 1, 800), 48);
  assert.equal(sm.normalizeWheelDelta(-3, 1, 800), -48);
});

test('normalizeWheelDelta: 页模式按 0.9 屏换算, 方向跟着原增量', () => {
  assert.equal(sm.normalizeWheelDelta(1, 2, 800), 720);
  assert.equal(sm.normalizeWheelDelta(-1, 2, 800), -720);
  // 现有实现的既有行为: 页模式下 deltaY 为 0 时按"向下"处理(保留, 不改行为)
  assert.equal(sm.normalizeWheelDelta(0, 2, 800), -720);
});

test('clampScroll: 夹在 0..max 之间', () => {
  assert.equal(sm.clampScroll(100, 500), 100);
  assert.equal(sm.clampScroll(-10, 500), 0);
  assert.equal(sm.clampScroll(999, 500), 500);
  assert.equal(sm.clampScroll(100, 0), 0);
});

test('approach: 每步吃掉剩余距离的 10%', () => {
  assert.equal(sm.approach(0, 100), 10);
  assert.equal(sm.approach(10, 100), 19);
  assert.equal(sm.approach(100, 100), 100);
});

test('isSettled: 距离小于 0.3px 视为停住', () => {
  assert.equal(sm.isSettled(100, 100), true);
  assert.equal(sm.isSettled(99.8, 100), true);
  assert.equal(sm.isSettled(99.6, 100), false);
  assert.equal(sm.isSettled(100, 99.6), false);
});
