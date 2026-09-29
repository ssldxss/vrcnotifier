'use strict';
// 概览卡片上的两个纯映射: 后端延迟分级、VRChat 服务器状态徽章。
// 原先内联在 app.js 的 applyLatency / applyVrcStatus 里, 抽出来后可在 Node 下单测。

const test = require('node:test');
const assert = require('node:assert');
const sm = require('../public/statusmodel');

test('latencyClass: 1-200ms 绿', () => {
  assert.equal(sm.latencyClass(1), 'lat-ok');
  assert.equal(sm.latencyClass(42), 'lat-ok');
  assert.equal(sm.latencyClass(200), 'lat-ok');
});

test('latencyClass: 201-800ms 黄', () => {
  assert.equal(sm.latencyClass(201), 'lat-warn');
  assert.equal(sm.latencyClass(800), 'lat-warn');
});

test('latencyClass: 0/负值/超 800ms 红', () => {
  assert.equal(sm.latencyClass(0), 'lat-bad');
  assert.equal(sm.latencyClass(-5), 'lat-bad');
  assert.equal(sm.latencyClass(801), 'lat-bad');
  assert.equal(sm.latencyClass(10000), 'lat-bad');
});

test('latencyClass: 非数字也是红(不抛)', () => {
  assert.equal(sm.latencyClass(NaN), 'lat-bad');
  assert.equal(sm.latencyClass(undefined), 'lat-bad');
  assert.equal(sm.latencyClass(Infinity), 'lat-bad');
});

test('vrcBadge: unknown → 灰色「无法获取」', () => {
  assert.deepEqual(sm.vrcBadge('unknown'), { text: '无法获取', cls: 'badge' });
});

test('vrcBadge: normal → 绿「正常」', () => {
  assert.deepEqual(sm.vrcBadge('normal'), { text: '正常', cls: 'badge ok' });
});

test('vrcBadge: outage → 红「故障」', () => {
  assert.deepEqual(sm.vrcBadge('outage'), { text: '故障', cls: 'badge bad' });
});

test('vrcBadge: 其余(含 degraded 与未知值) → 黄「降级」', () => {
  assert.deepEqual(sm.vrcBadge('degraded'), { text: '降级', cls: 'badge warn' });
  assert.deepEqual(sm.vrcBadge('future-state'), { text: '降级', cls: 'badge warn' });
  assert.deepEqual(sm.vrcBadge(undefined), { text: '降级', cls: 'badge warn' });
});
