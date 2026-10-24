'use strict';
// 好友列表纯逻辑: 分组 / 搜索过滤 / 排序 / 渲染指纹。
// 这些规则原先散在 app.js 的 renderFriends 里, 抽成模块后既给浏览器用, 也能在这里单测。
// 注意: 断言写的是"线上现有行为"(特征化), 重构不允许改变它们。

const test = require('node:test');
const assert = require('node:assert');
const fm = require('../public/friendmodel');

const F = (id, state, extra) => Object.assign({ friend_vrchat_id: id, display_name: id, state }, extra || {});
const fav = (id, state) => F(id, state, { config: { favorite: 1 } });
const ids = (list) => list.map((f) => f.friend_vrchat_id);

test('normalizeQuery: 去空白 + 转小写, null/undefined 当空串', () => {
  assert.equal(fm.normalizeQuery('  星野  '), '星野');
  assert.equal(fm.normalizeQuery('ABC'), 'abc');
  assert.equal(fm.normalizeQuery(null), '');
  assert.equal(fm.normalizeQuery(undefined), '');
});

test('filterPool: 空关键词返回原数组(不复制)', () => {
  const all = [F('a', 'online')];
  assert.equal(fm.filterPool(all, ''), all);
  assert.equal(fm.filterPool(all, '   '), all);
});

test('filterPool: 大小写不敏感, 命中昵称/世界/自定义状态任一即可', () => {
  const all = [
    F('a', 'online', { display_name: '星野桑' }),
    F('b', 'online', { display_name: '别人', world_name: 'The Black Cat' }),
    F('c', 'online', { display_name: '别人', status_description: '在摸鱼' })
  ];
  assert.deepEqual(ids(fm.filterPool(all, '星野')), ['a']);
  assert.deepEqual(ids(fm.filterPool(all, 'black cat')), ['b']);
  assert.deepEqual(ids(fm.filterPool(all, '摸鱼')), ['c']);
  assert.deepEqual(ids(fm.filterPool(all, '不存在')), []);
  // 字段缺失不能抛
  assert.deepEqual(ids(fm.filterPool([F('d', 'online')], 'x')), []);
});

test('splitGroups: 待确认(pending)按 display_state 归组与排序, state 只是已确认的起始态', () => {
  // Alice: state online(起始态) + display_state offline(待确认目标) → 归离线组, 而不是在线组
  const alice = F('alice', 'online', { display_state: 'offline', pending: true, pending_label: '可能离线' });
  // Bob: state offline + display_state online → 归在线组
  const bob = F('bob', 'offline', { display_state: 'online', pending: true, pending_label: '可能在线' });
  const g = fm.splitGroups([alice, bob, F('carol', 'active')], '');
  assert.deepEqual(ids(g.online), ['bob']);
  assert.deepEqual(ids(g.offline), ['alice']);
  assert.deepEqual(ids(g.active), ['carol']);
  // 特别关注组内排序同样看展示态: alice(离线) 排在 bob(在线) 后面
  const gf = fm.splitGroups([
    Object.assign(fav('alice', 'online'), { display_state: 'offline' }),
    Object.assign(fav('bob', 'offline'), { display_state: 'online' })
  ], '');
  assert.deepEqual(ids(gf.fav), ['bob', 'alice']);
  // groupOf(特别关注切换后的目标组)也一致
  assert.equal(fm.groupOf(alice), 'offline');
  assert.equal(fm.groupOf(bob), 'online');
  // stateOf 兼容没有 display_state 的老数据
  assert.equal(fm.stateOf(F('x', 'offline')), 'offline');
});

test('splitGroups: 特别关注优先于状态, 其余按 在线/网页在线/离线 分组', () => {
  const g = fm.splitGroups([
    F('a', 'online'), fav('b', 'online'), F('c', 'active'), F('d', 'offline'), fav('e', 'offline')
  ], '');
  assert.deepEqual(ids(g.fav), ['b', 'e']);
  assert.deepEqual(ids(g.online), ['a']);
  assert.deepEqual(ids(g.active), ['c']);
  assert.deepEqual(ids(g.offline), ['d']);
});

test('splitGroups: 特别关注组内按 在线 > 网页在线 > 离线 排序', () => {
  const g = fm.splitGroups([fav('x', 'offline'), fav('y', 'active'), fav('z', 'online')], '');
  assert.deepEqual(ids(g.fav), ['z', 'y', 'x']);
});

test('splitGroups: 非特别关注组保持入参顺序(不排序)', () => {
  const g = fm.splitGroups([F('b', 'online'), F('a', 'online'), F('c', 'online')], '');
  assert.deepEqual(ids(g.online), ['b', 'a', 'c']);
});

test('splitGroups: 未知状态既不进任何组(与现有渲染行为一致)', () => {
  const g = fm.splitGroups([F('a', 'online'), F('weird', 'weird')], '');
  assert.deepEqual(ids(g.online), ['a']);
  assert.deepEqual([...ids(g.fav), ...ids(g.active), ...ids(g.offline)], []);
});

test('splitGroups: 先按关键词过滤再分组', () => {
  const g = fm.splitGroups([F('a', 'online', { display_name: '甲' }), F('b', 'offline', { display_name: '乙' })], '乙');
  assert.deepEqual(ids(g.online), []);
  assert.deepEqual(ids(g.offline), ['b']);
});

test('groupOf: 特别关注优先; 未知状态归离线(与 expandGroupFor 的目标组规则一致)', () => {
  assert.equal(fm.groupOf(fav('a', 'offline')), 'fav');
  assert.equal(fm.groupOf(F('b', 'online')), 'online');
  assert.equal(fm.groupOf(F('c', 'active')), 'active');
  assert.equal(fm.groupOf(F('d', 'offline')), 'offline');
  assert.equal(fm.groupOf(F('e', 'weird')), 'offline');
  assert.equal(fm.groupOf({}), 'offline');
});

test('renderSignature: 输入相同 → 签名相同', () => {
  const friends = [F('a', 'online')];
  assert.equal(fm.renderSignature(friends, ' x ', { offline: true }), fm.renderSignature(friends, 'x', { offline: true }));
});

test('renderSignature: 搜索词/折叠状态/好友数据 任一变化 → 签名变化', () => {
  const friends = [F('a', 'online')];
  const base = fm.renderSignature(friends, '', {});
  assert.notEqual(fm.renderSignature(friends, 'a', {}), base);
  assert.notEqual(fm.renderSignature(friends, '', { offline: true }), base);
  assert.notEqual(fm.renderSignature([F('a', 'offline')], '', {}), base);
});

test('renderSignature: 好友数据里与渲染无关的字段变化也算变化(宁可多渲染一次)', () => {
  const base = fm.renderSignature([F('a', 'online', { world_name: 'x' })], '', {});
  const other = fm.renderSignature([F('a', 'online', { world_name: 'y' })], '', {});
  assert.notEqual(base, other);
});

// ---- 逐好友通知配置: 乐观更新 + 失败回滚用到的纯逻辑 ----

test('state DTO replaces all state/profile fields, inserts new friends and removes deleted ones', () => {
  const model = require('../public/friendmodel');
  const old = { friend_vrchat_id: 'usr_a', status: 'active', status_description: 'old' };
  const current = { friend_vrchat_id: 'usr_a', state: 'offline', display_state: 'online',
    pending_state: 'online', pending: true, pending_label: '可能在线', status: 'busy',
    status_description: 'new', world_id: 'private', instance_id: null, avatarKey: 'new-avatar' };
  const updated = model.applyFriendState([old], { friend_vrchat_id: 'usr_a', friend: current });
  assert.deepStrictEqual(updated, [current]);
  assert.equal(old.status, 'active', 'old data is not mutated');
  const added = model.applyFriendState(updated, { friend_vrchat_id: 'usr_b', friend: { friend_vrchat_id: 'usr_b' } });
  assert.equal(added.length, 2);
  assert.deepStrictEqual(model.applyFriendState(added, { friend_vrchat_id: 'usr_a', friend: null }), [{ friend_vrchat_id: 'usr_b' }]);
});
