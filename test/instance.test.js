'use strict';
// 位置/实例解析纯逻辑: 从 VRChat 的 location / instanceId 里解析房间类型、地区等。
// 浏览器用 <script src="instance.js">(挂 window.VrcInstance), Node 用 require(单测)。

const test = require('node:test');
const assert = require('node:assert');
const inst = require('../public/instance');

test('parseInstance: hidden 实例解析为好友+，并带出地区', () => {
  assert.deepStrictEqual(inst.parseInstance('12345~hidden(usr_abc)~region(jp)'), {
    access: 'friends+',
    groupId: null,
    groupAccess: null,
    region: 'jp',
    ageGate: false
  });
});

test('parseInstance: 各访问标签映射到房间类型(公开/好友/好友+/私密/邀请+/群组)', () => {
  const cases = [
    ['12345~region(us)', 'public'],
    ['12345~friends(usr_a)~region(us)', 'friends'],
    ['12345~hidden(usr_a)~region(us)', 'friends+'],
    ['12345~private(usr_a)~region(us)', 'private'],
    ['12345~canRequestInvite~region(us)', 'invite+'],
    ['12345~group(grp_1)~groupAccessType(public)~region(jp)', 'group'],
    ['12345~group(grp_1)~groupAccessType(plus)~region(jp)', 'group'],
    ['12345~group(grp_1)~groupAccessType(members)~region(jp)', 'group']
  ];
  for (const [instanceId, access] of cases) {
    assert.equal(inst.parseInstance(instanceId).access, access, instanceId);
  }
});

test('accessLabel: 房间类型显示文案(群组带访问级别)', () => {
  assert.equal(inst.accessLabel({ access: 'public' }), '公开');
  assert.equal(inst.accessLabel({ access: 'friends' }), '好友');
  assert.equal(inst.accessLabel({ access: 'friends+' }), '好友+');
  assert.equal(inst.accessLabel({ access: 'private' }), '私密');
  assert.equal(inst.accessLabel({ access: 'invite+' }), '邀请+');
  assert.equal(inst.accessLabel({ access: 'group', groupAccess: 'public' }), '群组 公开');
  assert.equal(inst.accessLabel({ access: 'group', groupAccess: 'plus' }), '群组 +');
  assert.equal(inst.accessLabel({ access: 'group', groupAccess: 'members' }), '群组 成员');
  assert.equal(inst.accessLabel({ access: 'group', groupAccess: null }), '群组');
});

test('parseLocation: 拆出 worldId / instanceId，private 与空值无实例', () => {
  assert.deepStrictEqual(inst.parseLocation('wrld_a:12345~hidden(usr_u)~region(us)'), {
    worldId: 'wrld_a',
    instanceId: '12345~hidden(usr_u)~region(us)'
  });
  assert.deepStrictEqual(inst.parseLocation('wrld_a'), { worldId: 'wrld_a', instanceId: null });
  assert.deepStrictEqual(inst.parseLocation('private'), { worldId: 'private', instanceId: null });
  assert.deepStrictEqual(inst.parseLocation('traveling'), { worldId: 'traveling', instanceId: null });
  assert.deepStrictEqual(inst.parseLocation(''), { worldId: null, instanceId: null });
  assert.deepStrictEqual(inst.parseLocation(null), { worldId: null, instanceId: null });
});

test('regionFlagClass: 已知地区映射国旗 class，未知地区用 unknown，空返回 null', () => {
  assert.equal(inst.regionFlagClass('jp'), 'jp');
  assert.equal(inst.regionFlagClass('us'), 'us');
  assert.equal(inst.regionFlagClass('eu'), 'eu');
  assert.equal(inst.regionFlagClass('xx'), 'unknown');
  assert.equal(inst.regionFlagClass(''), null);
  assert.equal(inst.regionFlagClass(null), null);
});

test('formatLocation: 正常位置输出国旗/世界名/房间类型；private、traveling、无位置有专用结果', () => {
  assert.deepStrictEqual(
    inst.formatLocation({ worldId: 'wrld_a', worldName: 'World A', instanceId: '12345~hidden(usr_u)~region(jp)' }),
    { flagClass: 'jp', worldName: 'World A', accessLabel: '好友+' }
  );
  // 有世界但没实例串: 不编造房间类型
  assert.deepStrictEqual(
    inst.formatLocation({ worldId: 'wrld_a', worldName: 'World A' }),
    { flagClass: null, worldName: 'World A', accessLabel: null }
  );
  assert.deepStrictEqual(inst.formatLocation({ worldId: 'private' }), {
    flagClass: null,
    worldName: '私密世界',
    accessLabel: null
  });
  assert.deepStrictEqual(inst.formatLocation({ worldId: 'traveling' }), {
    flagClass: null,
    worldName: '正在传送',
    accessLabel: null
  });
  assert.deepStrictEqual(inst.formatLocation({ worldId: null }), {
    flagClass: null,
    worldName: null,
    accessLabel: null
  });
});

test('regionFlagClass: use/usw 也使用美国国旗', () => {
  assert.equal(inst.regionFlagClass('use'), 'us');
  assert.equal(inst.regionFlagClass('usw'), 'us');
});
