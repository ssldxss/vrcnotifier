'use strict';
// 好友动态(日志)纯逻辑: 类型 code/展示文案/分类/筛选、单行摘要与「旧→新」变化行。
// 浏览器用 <script src="eventmodel.js">(挂 window.VrcEventModel); Node 用 require(单测)。

const test = require('node:test');
const assert = require('node:assert');
const em = require('../public/eventmodel');

test('typeCode: 优先使用后端 type_code，旧数据从中文标签映射', () => {
  assert.equal(em.typeCode({ type_code: 'location_change', type: '切换世界' }), 'location_change');
  assert.equal(em.typeCode({ type: '上线' }), 'friend_online');
  assert.equal(em.typeCode({ type: '切换世界' }), 'location_change');
  assert.equal(em.typeCode({ type: '请求邀请' }), 'request_invite');
  assert.equal(em.typeCode({}), '');
});

test('typeLabel: 展示文案按界面用词（位置变动，而不是后端的切换世界）', () => {
  assert.equal(em.typeLabel('location_change'), '位置变动');
  assert.equal(em.typeLabel('friend_online'), '上线');
  assert.equal(em.typeLabel('friend_web_online'), '网页上线');
  assert.equal(em.typeLabel('friend_web_offline'), '网页下线');
  assert.equal(em.typeLabel('status_description_change'), '自定义状态');
  assert.equal(em.typeLabel('request_invite'), '请求邀请');
  assert.equal(em.typeLabel('unknown_thing'), 'unknown_thing');
});

test('eventKind: 事件归类为 presence/status/location/notification/other', () => {
  for (const code of ['friend_online', 'friend_offline', 'friend_web_online', 'friend_web_offline']) {
    assert.equal(em.eventKind(code), 'presence', code);
  }
  assert.equal(em.eventKind('status_change'), 'status');
  assert.equal(em.eventKind('status_description_change'), 'status');
  assert.equal(em.eventKind('location_change'), 'location');
  for (const code of ['group_announcement', 'boop', 'invite', 'request_invite']) {
    assert.equal(em.eventKind(code), 'notification', code);
  }
  assert.equal(em.eventKind('name_change'), 'other');
  assert.equal(em.eventKind(''), 'other');
});

test('filterCodes: 顶部筛选 chips 对应的后端 types 参数', () => {
  assert.equal(em.filterCodes('all'), null);
  assert.deepStrictEqual(em.filterCodes('location'), ['location_change']);
  assert.deepStrictEqual(em.filterCodes('presence'), [
    'friend_online',
    'friend_offline',
    'friend_web_online',
    'friend_web_offline'
  ]);
  assert.deepStrictEqual(em.filterCodes('status'), ['status_change', 'status_description_change']);
  assert.deepStrictEqual(em.filterCodes('notification'), [
    'group_announcement',
    'boop',
    'invite',
    'request_invite'
  ]);
});

test('statusDotClass: 社交状态映射圆点 class，未知按离线', () => {
  assert.equal(em.statusDotClass('active'), 'online');
  assert.equal(em.statusDotClass('join me'), 'joinme');
  assert.equal(em.statusDotClass('ask me'), 'askme');
  assert.equal(em.statusDotClass('busy'), 'busy');
  assert.equal(em.statusDotClass(''), 'offline');
  assert.equal(em.statusDotClass(null), 'offline');
});

test('presenceDotClass: 在线/网页在线/离线映射圆点 class', () => {
  assert.equal(em.presenceDotClass('online'), 'online');
  assert.equal(em.presenceDotClass('active'), 'web');
  assert.equal(em.presenceDotClass('offline'), 'offline');
  assert.equal(em.presenceDotClass('weird'), 'offline');
});

test('changeOf: 位置变化输出旧/新位置（国旗 + 世界名 + 房间类型）', () => {
  const row = {
    type_code: 'location_change',
    world_id: 'wrld_b',
    world_name: 'Blackoutǃ',
    instance_id: '1~hidden(usr_u)~region(jp)',
    old_world_id: 'private',
    old_world_name: '私密世界',
    old_instance_id: null
  };
  assert.deepStrictEqual(em.changeOf(row), {
    kind: 'location',
    old: { flagClass: null, worldName: '私密世界', accessLabel: null },
    new: { flagClass: 'jp', worldName: 'Blackoutǃ', accessLabel: '好友+' }
  });
});

test('changeOf: 状态变化只给圆点/自定义状态给文字/上下线给状态文案/通知给标题正文', () => {
  assert.deepStrictEqual(em.changeOf({ type_code: 'status_change', old_status: 'ask me', new_status: 'active' }), {
    kind: 'status',
    dots: { old: 'askme', new: 'online' }
  });
  assert.deepStrictEqual(
    em.changeOf({ type_code: 'status_description_change', old_desc: '旧签名', new_desc: '新签名' }),
    { kind: 'description', old: '旧签名', new: '新签名' }
  );
  assert.deepStrictEqual(
    em.changeOf({ type_code: 'friend_online', old_state: 'offline', new_state: 'online' }),
    { kind: 'presence', old: { dot: 'offline', label: '离线' }, new: { dot: 'online', label: '在线' } }
  );
  assert.deepStrictEqual(
    em.changeOf({ type_code: 'friend_web_online', old_state: 'offline', new_state: 'active' }),
    { kind: 'presence', old: { dot: 'offline', label: '离线' }, new: { dot: 'web', label: '网页在线' } }
  );
  assert.deepStrictEqual(em.changeOf({ type_code: 'group_announcement', title: '公告标题', body: '公告正文' }), {
    kind: 'notification',
    title: '公告标题',
    body: '公告正文'
  });
});

test('summaryOf: 行内单列摘要（位置/上下线位置/网页在线/圆点/自定义状态/通知正文）', () => {
  assert.deepStrictEqual(
    em.summaryOf({
      type_code: 'location_change',
      world_id: 'wrld_b',
      world_name: 'Blackoutǃ',
      instance_id: '1~hidden(usr_u)~region(jp)'
    }),
    { kind: 'location', location: { flagClass: 'jp', worldName: 'Blackoutǃ', accessLabel: '好友+' } }
  );
  assert.deepStrictEqual(em.summaryOf({ type_code: 'friend_online', world_id: 'private' }), {
    kind: 'presence',
    location: { flagClass: null, worldName: '私密世界', accessLabel: null }
  });
  assert.deepStrictEqual(
    em.summaryOf({
      type_code: 'friend_offline',
      old_world_id: 'wrld_a',
      old_world_name: 'World A',
      old_instance_id: '1~friends(usr_u)~region(us)'
    }),
    { kind: 'presence', location: { flagClass: 'us', worldName: 'World A', accessLabel: '好友' } }
  );
  assert.deepStrictEqual(em.summaryOf({ type_code: 'friend_web_online' }), {
    kind: 'presence',
    text: '仅网页在线'
  });
  assert.deepStrictEqual(em.summaryOf({ type_code: 'friend_web_offline' }), {
    kind: 'presence',
    text: '退出网页'
  });
  assert.deepStrictEqual(em.summaryOf({ type_code: 'status_change', old_status: 'ask me', new_status: 'active' }), {
    kind: 'status',
    dots: { old: 'askme', new: 'online' }
  });
  assert.deepStrictEqual(
    em.summaryOf({ type_code: 'status_description_change', new_desc: '想被大家摸摸~' }),
    { kind: 'description', text: '想被大家摸摸~' }
  );
  assert.deepStrictEqual(em.summaryOf({ type_code: 'group_announcement', title: 't', body: '公告正文' }), {
    kind: 'notification',
    text: '公告正文'
  });
});

test('filterCodes: 多选数组取并集，上下线细分为 4 种互不包含的类型', () => {
  assert.deepStrictEqual(em.filterCodes(['online']), ['friend_online']);
  assert.deepStrictEqual(em.filterCodes(['web_online']), ['friend_web_online']);
  assert.deepStrictEqual(em.filterCodes(['offline']), ['friend_offline']);
  assert.deepStrictEqual(em.filterCodes(['web_offline']), ['friend_web_offline']);
  assert.deepStrictEqual(em.filterCodes(['online', 'web_online', 'offline', 'web_offline']), [
    'friend_online',
    'friend_web_online',
    'friend_offline',
    'friend_web_offline'
  ]);
  assert.deepStrictEqual(em.filterCodes(['location', 'status']), [
    'location_change',
    'status_change',
    'status_description_change'
  ]);
  assert.equal(em.filterCodes([]), null);
});

test('summaryOf: 上下线事件缺位置时回退成「在线 / 离线」', () => {
  assert.deepStrictEqual(em.summaryOf({ type_code: 'friend_online' }), { kind: 'presence', text: '在线' });
  assert.deepStrictEqual(em.summaryOf({ type_code: 'friend_offline' }), { kind: 'presence', text: '离线' });
});

test('normalizeFilters: 手动选满所有类型时自动归一化为空(=全部)', () => {
  assert.deepStrictEqual(
    em.normalizeFilters(['location', 'online', 'web_online', 'offline', 'web_offline', 'status', 'notification']),
    []
  );
  // 少一个都保持不动
  assert.deepStrictEqual(em.normalizeFilters(['location', 'online']), ['location', 'online']);
  assert.deepStrictEqual(em.normalizeFilters([]), []);
  // 特别关注不是类型筛选, 不参与归一化
  assert.deepStrictEqual(em.normalizeFilters(['favorite', 'location']), ['favorite', 'location']);
});

test('eventMatchesFilters: 与服务端筛选同口径(类型/特别关注/好友/搜索)', () => {
  const ev = { type_code: 'friend_offline', friend_vrchat_id: 'usr_p1', friend_name: 'Alice', world_name: 'World' };
  assert.equal(em.eventMatchesFilters(ev, {}), true);
  assert.equal(em.eventMatchesFilters(ev, { codes: ['friend_online'] }), false);
  assert.equal(em.eventMatchesFilters(ev, { codes: ['friend_offline'] }), true);
  assert.equal(em.eventMatchesFilters(ev, { favoriteIds: new Set(['usr_p2']) }), false);
  assert.equal(em.eventMatchesFilters(ev, { favoriteIds: new Set(['usr_p1']) }), true);
  assert.equal(em.eventMatchesFilters(ev, { friendId: 'usr_p2' }), false);
  assert.equal(em.eventMatchesFilters(ev, { friendId: 'usr_p1' }), true);
  assert.equal(em.eventMatchesFilters(ev, { search: 'ALICE' }), true);
  assert.equal(em.eventMatchesFilters(ev, { search: 'world' }), true);
  assert.equal(em.eventMatchesFilters(ev, { search: 'nope' }), false);
  // 通知类按标题/正文搜索
  const notice = { type_code: 'group_announcement', friend_vrchat_id: 'grp_1', title: '晚安', body: '活动开始' };
  assert.equal(em.eventMatchesFilters(notice, { search: '活动' }), true);
  assert.equal(em.eventMatchesFilters(notice, { search: '晚安' }), true);
  // 搜索字段与服务端 /api/friend-events 对齐:
  // 服务端搜 locationExpr(世界 ID:实例), 但不搜旧位置; 群组名可搜
  const loc = {
    type_code: 'location_change', friend_vrchat_id: 'usr_p1', friend_name: 'Alice',
    world_id: 'wrld_abc', instance_id: '12345', world_name: '新世界',
    old_world_id: 'wrld_old', old_world_name: '旧世界', location: 'wrld_abc:12345'
  };
  assert.equal(em.eventMatchesFilters(loc, { search: 'wrld_abc' }), true);
  assert.equal(em.eventMatchesFilters(loc, { search: 'wrld_abc:12345' }), true);
  assert.equal(em.eventMatchesFilters(loc, { search: '12345' }), true);
  assert.equal(em.eventMatchesFilters(loc, { search: '旧世界' }), false);
  const noticeWithGroup = Object.assign({}, notice, { group_name: '活动群' });
  assert.equal(em.eventMatchesFilters(noticeWithGroup, { search: '活动群' }), true);
});
