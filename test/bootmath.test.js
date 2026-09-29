'use strict';
// 登录等待页的两个纯计算: 真实进度的目标值、百分比里程表该走到哪。
// 原先内联在 app.js 的 bootPercent / bootPctStep 里, 抽出来后可在 Node 下单测。

const test = require('node:test');
const assert = require('node:assert');
const bm = require('../public/bootmath');

test('percentTarget: 向下取整, 不虚报(150 好友分 3 页 = 33/66/100)', () => {
  assert.equal(bm.percentTarget(50, 150), 33);
  assert.equal(bm.percentTarget(100, 150), 66);
  assert.equal(bm.percentTarget(150, 150), 100);
  assert.equal(bm.percentTarget(0, 150), 0);
});

test('percentTarget: 总数非法 → null(一条真实进度都没收到就不显示, 绝不自己编终值)', () => {
  assert.equal(bm.percentTarget(1, 0), null);
  assert.equal(bm.percentTarget(1, -1), null);
  assert.equal(bm.percentTarget(1, NaN), null);
  assert.equal(bm.percentTarget(1, undefined), null);
});

test('percentTarget: 拉回的条数超过总数也不会超过 100', () => {
  assert.equal(bm.percentTarget(200, 150), 100);
});

test('shouldAdvance: 只增不减', () => {
  assert.equal(bm.shouldAdvance(null, 0), true);   // 还没设过: 0 也要设
  assert.equal(bm.shouldAdvance(null, 33), true);
  assert.equal(bm.shouldAdvance(33, 50), true);
  assert.equal(bm.shouldAdvance(50, 50), false);   // 一样: 不重设(避免打断里程表)
  assert.equal(bm.shouldAdvance(50, 33), false);   // 倒退: 不理会
});

test('odometerWant: 按经过时间推进, 到目标即封顶', () => {
  assert.equal(bm.odometerWant(0, 12, 4, 100), 3);
  assert.equal(bm.odometerWant(0, 400, 4, 100), 100);
  assert.equal(bm.odometerWant(50, 0, 4, 100), 50);      // 没到时间: 原地
  assert.equal(bm.odometerWant(95, 1000, 4, 100), 100);
});

test('odometerWant: 每数耗时非正数时不推进(不除零、不倒退)', () => {
  assert.equal(bm.odometerWant(10, 100, 0, 100), 10);
  assert.equal(bm.odometerWant(10, 100, -4, 100), 10);
});
