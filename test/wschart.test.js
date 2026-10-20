'use strict';
// WebSocket 消息速率图(VRCX 同款算法): 60 秒窗口、每秒一个采样点,
// 速率 = 窗口内消息数之和(次/分), 折线按窗口最大值缩放。
// 浏览器用 <script src="wschart.js">(挂 window.VrcWsChart); Node 用 require(单测)。

const test = require('node:test');
const assert = require('node:assert');
const ws = require('../public/wschart');

test('pushSample: 滑动窗口, 挤掉最旧的一条, 不修改原数组', () => {
  const before = [1, 2, 3];
  const after = ws.pushSample(before, 9);
  assert.deepStrictEqual(after, [2, 3, 9]);
  assert.deepStrictEqual(before, [1, 2, 3]);
});

test('perMinute: 窗口内消息数求和 = 每分钟平均次数', () => {
  assert.equal(ws.perMinute([0, 2, 1, 4]), 7);
  assert.equal(ws.perMinute([]), 0);
});

test('sparklinePoints: 按窗口最大值缩放, 纵向留 2px 余量', () => {
  assert.deepStrictEqual(ws.sparklinePoints([0, 2, 1], 40, 12), [
    { x: 0, y: 12 },
    { x: 20, y: 2 },
    { x: 40, y: 7 }
  ]);
});

test('sparklinePoints: 全 0 时最大值按 1 处理, 画成底部直线', () => {
  assert.deepStrictEqual(ws.sparklinePoints([0, 0, 0], 10, 12), [
    { x: 0, y: 12 },
    { x: 5, y: 12 },
    { x: 10, y: 12 }
  ]);
  assert.deepStrictEqual(ws.sparklinePoints([], 10, 12), []);
});
