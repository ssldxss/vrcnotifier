'use strict';
// 读层展示语义: pending 未决时优先呈现目标态并加"可能"前缀。
const test = require('node:test');
const assert = require('node:assert');
const { displayState, isPending, stateLabelOf, pendingLabel } = require('../src/presence');

test('displayState: pending 时取目标态, 否则取已确认的 state', () => {
  assert.equal(displayState({ state: 'online', pending_state: 'offline' }), 'offline');
  assert.equal(displayState({ state: 'offline', pending_state: 'online' }), 'online');
  assert.equal(displayState({ state: 'offline', pending_state: 'active' }), 'active');
  assert.equal(displayState({ state: 'offline', pending_state: null }), 'offline');
  assert.equal(displayState({ state: 'online' }), 'online');
  assert.equal(displayState(null), null);
  assert.equal(displayState({}), null);
});

test('isPending', () => {
  assert.equal(isPending({ state: 'online', pending_state: 'offline' }), true);
  assert.equal(isPending({ state: 'online', pending_state: null }), false);
  assert.equal(isPending(null), false);
});

test('pendingLabel: "可能" + 目标态标签; 非 pending 为 null', () => {
  assert.equal(pendingLabel({ state: 'online', pending_state: 'offline' }), '可能离线');
  assert.equal(pendingLabel({ state: 'offline', pending_state: 'online' }), '可能在线');
  assert.equal(pendingLabel({ state: 'offline', pending_state: 'active' }), '可能网页在线');
  assert.equal(pendingLabel({ state: 'online', pending_state: null }), null);
  assert.equal(stateLabelOf('web'), '网页在线');
  assert.equal(stateLabelOf('weird'), 'weird', '未知状态原样返回');
});
