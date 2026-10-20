'use strict';
// 好友行视图模型: 名字/自定义状态/位置(国旗+世界名+房间类型)/状态点/关心/推送铃铛。
// 浏览器用 <script src="friendrow.js">(挂 window.VrcFriendRow); Node 用 require(单测)。

const test = require('node:test');
const assert = require('node:assert');
const friendrow = require('../public/friendrow');

test('rowModel: 游戏在线好友(群组公开实例)的整行模型', () => {
  const f = {
    display_name: 'Moussy6614',
    trust_level: 'Trusted User',
    state: 'online',
    status: 'join me',
    status_description: '敬那凌后一字冉',
    world_id: 'wrld_a',
    world_name: '咖啡厅v1.31',
    instance_id: '123~group(grp_1)~groupAccessType(public)~region(jp)',
    config: { favorite: 1, notify_online: 1 }
  };
  assert.deepStrictEqual(friendrow.rowModel(f), {
    name: 'Moussy6614',
    nameClass: 'tl-trusted',
    statusText: '敬那凌后一字冉',
    dotClasses: 'st-online status-joinme',
    place: { kind: 'world', flagClass: 'jp', worldName: '咖啡厅v1.31', accessLabel: '群组 公开' },
    favorite: true,
    bell: 'warn'
  });
});

test('rowModel: 网页在线/离线/私密世界/无信任等级', () => {
  assert.deepStrictEqual(friendrow.rowModel({ display_name: 'Moxiner', state: 'active', status: 'active', config: {} }), {
    name: 'Moxiner',
    nameClass: '',
    statusText: '',
    dotClasses: 'st-active status-active',
    place: { kind: 'text', text: '网页在线' },
    favorite: false,
    bell: 'off'
  });
  assert.deepStrictEqual(friendrow.rowModel({ display_name: 'X', state: 'offline' }), {
    name: 'X',
    nameClass: '',
    statusText: '',
    dotClasses: 'st-offline status-active',
    place: { kind: 'text', text: '离线' },
    favorite: false,
    bell: 'off'
  });
  assert.deepStrictEqual(
    friendrow.rowModel({ display_name: 'Y', state: 'online', world_id: 'private' }).place,
    { kind: 'world', flagClass: null, worldName: '私密世界', accessLabel: null }
  );
});

test('selfStateText: 自己的状态文案 = 自定义状态 + 在线状态 + 非常规社交状态', () => {
  assert.equal(friendrow.selfStateText({ state: 'online', status: 'active', status_description: '' }), '游戏中');
  assert.equal(friendrow.selfStateText({ state: 'active', status: 'ask me', status_description: '睡觉喵' }), '睡觉喵 · 网页在线 · 询问我');
  assert.equal(friendrow.selfStateText({ state: 'online', status: 'join me' }), '游戏中 · 加入我');
  assert.equal(friendrow.selfStateText({ state: 'online', status: 'busy', status_description: '工作中' }), '工作中 · 游戏中 · 请勿打扰');
  assert.equal(friendrow.selfStateText({ state: 'offline', status: 'active' }), '离线');
  assert.equal(friendrow.selfStateText({}), '离线');
});

test('selfDotClasses: 自己的圆点 class 反映在线状态与社交状态', () => {
  assert.equal(friendrow.selfDotClasses({ state: 'online', status: 'active' }), 'st-online status-active');
  assert.equal(friendrow.selfDotClasses({ state: 'active', status: 'ask me' }), 'st-active status-askme');
  assert.equal(friendrow.selfDotClasses({ state: 'online', status: 'join me' }), 'st-online status-joinme');
  assert.equal(friendrow.selfDotClasses({ state: 'offline', status: 'busy' }), 'st-offline status-busy');
  assert.equal(friendrow.selfDotClasses({}), 'st-offline status-active');
});
