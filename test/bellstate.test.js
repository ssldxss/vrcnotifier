'use strict';
// 好友行右侧「推送铃铛」状态: 全关灰空心 / 任意开启黄空心 /
// 状态变化或下线黄实心 / 切换世界或网页上线红实心（后者覆盖前者）。
// 浏览器用 <script src="bellstate.js">(挂 window.VrcBellState); Node 用 require(单测)。

const test = require('node:test');
const assert = require('node:assert');
const bell = require('../public/bellstate');

const cfg = (over) => Object.assign(
  {
    favorite: 0,
    notify_online: 0,
    notify_web_online: 0,
    notify_offline: 0,
    notify_status_change: 0,
    notify_world_change: 0
  },
  over || {}
);

test('bellState: 全关是灰空心', () => {
  assert.equal(bell.bellState(cfg()), 'off');
  assert.equal(bell.bellState(null), 'off');
});

test('bellState: 任意开启黄空心，状态变化/下线黄实心，切换世界/网页上线红实心（后面覆盖前面）', () => {
  assert.equal(bell.bellState(cfg({ notify_online: 1 })), 'warn');
  assert.equal(bell.bellState(cfg({ notify_status_change: 1 })), 'warn-solid');
  assert.equal(bell.bellState(cfg({ notify_offline: 1 })), 'warn-solid');
  assert.equal(bell.bellState(cfg({ notify_online: 1, notify_status_change: 1 })), 'warn-solid');
  assert.equal(bell.bellState(cfg({ notify_world_change: 1 })), 'bad');
  assert.equal(bell.bellState(cfg({ notify_web_online: 1 })), 'bad');
  assert.equal(bell.bellState(cfg({ notify_online: 1, notify_world_change: 1 })), 'bad');
  assert.equal(bell.bellState(cfg({ notify_status_change: 1, notify_web_online: 1 })), 'bad');
  // 关心/特别关注不影响铃铛状态
  assert.equal(bell.bellState(cfg({ favorite: 1 })), 'off');
});
