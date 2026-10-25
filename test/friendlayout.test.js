'use strict';
// 好友列表虚拟滚动用的扁平项模型: 分组标题 + 行, 折叠组只保留标题。

const test = require('node:test');
const assert = require('node:assert');
const fl = require('../public/friendlayout');

const F = (id) => ({ friend_vrchat_id: id, display_name: id });

test('layout: 分组顺序固定为 特别关注/在线/网页在线/离线, 空组跳过', () => {
  const groups = { fav: [F('a')], online: [F('b'), F('c')], active: [], offline: [F('d')] };
  const items = fl.layout(groups, { offline: false });
  assert.deepStrictEqual(items.map((i) => (i.type === 'group' ? 'G:' + i.key : 'F:' + i.friend.friend_vrchat_id)), [
    'G:fav', 'F:a', 'G:online', 'F:b', 'F:c', 'G:offline', 'F:d'
  ]);
  assert.equal(items[0].title, '⭐ 特别关注');
  assert.equal(items[0].count, 1);
  assert.equal(items[1].groupKey, 'fav');
});

test('layout: 折叠组只生成标题, 默认值来自分组定义, 显式状态优先', () => {
  const groups = { fav: [F('a')], online: [F('b')], active: [F('c')], offline: [F('d')] };
  const items = fl.layout(groups, { online: true, offline: false });
  assert.deepStrictEqual(items.map((i) => (i.type === 'group' ? 'G:' + i.key : 'F:' + i.friend.friend_vrchat_id)), [
    'G:fav', 'F:a', 'G:online', 'G:active', 'F:c', 'G:offline', 'F:d'
  ]);
  assert.equal(items[2].collapsed, true);
  assert.equal(items[5].collapsed, false);
});

test('layout: 全部为空 → 空数组', () => {
  assert.deepStrictEqual(fl.layout({}, {}), []);
});
