'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createQqCommands, buildOnlineList, statusEmoji } = require('../src/qq-commands');
const { createDb } = require('../src/db');

test('statusEmoji maps VRC statuses to VRCX-consistent circles', () => {
  assert.equal(statusEmoji('active'), '🟢');
  assert.equal(statusEmoji('join me'), '🔵');
  assert.equal(statusEmoji('ask me'), '🟠');
  assert.equal(statusEmoji('busy'), '🔴');
  assert.equal(statusEmoji('unknown'), '⚪');
});

test('buildOnlineList only includes game-online friends with name/world/emoji', () => {
  const friends = [
    { friend_vrchat_id: 'usr_a', display_name: 'Alice', state: 'online', status: 'active', world_name: 'The Black Cat' },
    { friend_vrchat_id: 'usr_b', display_name: 'Bob', state: 'online', status: 'join me', world_name: '私密世界' },
    { friend_vrchat_id: 'usr_c', display_name: 'Carol', state: 'active', status: 'active', world_name: 'Web' },
    { friend_vrchat_id: 'usr_d', display_name: 'Dave', state: 'offline', status: 'busy', world_name: null }
  ];
  const r = buildOnlineList(friends);
  const { text, markdown } = r;
  assert.ok(text.startsWith('【在线列表】2 人在线'));
  assert.ok(text.includes('🟢 Alice'));
  assert.ok(text.includes('🔵 Bob'));
  assert.ok(text.includes('私密世界'));
  assert.ok(!text.includes('Carol'));
  assert.ok(!text.includes('Dave'));
  assert.ok(!text.includes('🟢在线'));
  assert.ok(markdown.includes('| 昵称 | 世界 |'));
  assert.ok(markdown.includes('| :--- | :--- |'));
  assert.ok(markdown.includes('| 🟢 Alice | The Black Cat |'));
  assert.ok(markdown.includes('| 🔵 Bob | 私密世界 |'));
  assert.ok(!markdown.includes('🟢在线'));
});

test('buildOnlineList empty returns no-online message', () => {
  const r = buildOnlineList([{ state: 'offline' }]);
  assert.ok(r.text.includes('没有游戏在线'));
  assert.equal(r.markdown, undefined);
});

test('buildOnlineList without favorites omits 其他在线 header, table follows title directly', () => {
  const friends = [
    { friend_vrchat_id: 'usr_a', display_name: 'Alice', state: 'online', status: 'active', world_name: 'WorldX' },
    { friend_vrchat_id: 'usr_b', display_name: 'Bob', state: 'offline', status: 'busy', world_name: null }
  ];
  const r = buildOnlineList(friends);
  assert.ok(r.text.startsWith('【在线列表】1 人在线'));
  assert.ok(!r.text.includes('【其他在线】'), '无特别关注时不显示【其他在线】');
  assert.ok(r.text.includes('🟢 Alice'), '在线好友直接跟在主标题下');
  assert.ok(!r.markdown.includes('## 其他在线'), 'markdown 无特别关注时不显示 其他在线');
  assert.ok(r.markdown.includes('| 🟢 Alice | WorldX |'));
});

test('buildOnlineList puts favorites first and includes offline favorites', () => {
  const friends = [
    { friend_vrchat_id: 'usr_a', display_name: 'Alice', state: 'online', status: 'active', world_name: 'WorldX' },
    { friend_vrchat_id: 'usr_b', display_name: 'Bob', state: 'offline', status: 'busy', world_name: null, favorite: 1 },
    { friend_vrchat_id: 'usr_c', display_name: 'Carol', state: 'online', status: 'join me', world_name: 'WorldY', favorite: 1 },
    { friend_vrchat_id: 'usr_d', display_name: 'Dave', state: 'offline', status: 'busy', world_name: null }
  ];
  const r = buildOnlineList(friends);
  assert.ok(r.text.startsWith('【在线列表】2 人在线'));
  assert.ok(r.text.includes('【特别关注】'));
  assert.ok(r.text.includes('【其他在线】'));
  assert.ok(r.text.indexOf('Bob') < r.text.indexOf('【其他在线】'), '特别关注与普通好友分块');
  assert.ok(r.text.indexOf('Alice') > r.text.indexOf('【其他在线】'), '普通在线在其他块');
  assert.ok(r.text.includes('⚪ Bob'), '离线特别关注显示 ⚪');
  assert.ok(r.text.includes('离线'), '离线行世界显示 离线');
  assert.ok(!r.text.includes('Dave'), '非特别关注离线不显示');
  assert.ok(r.markdown.includes('## ⭐ 特别关注'));
  assert.ok(r.markdown.includes('## 其他在线'));
  assert.ok(r.markdown.includes('| ⚪ Bob | 离线 |'));
});

test('createQqCommands: 任意输入都直接输出在线列表', async () => {
  const db = createDb(':memory:');
  const id = db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldName: 'WorldX' });
  db.upsertFriend(id, 'usr_b', { displayName: 'Bob', state: 'offline', status: 'busy', worldName: null });
  const handler = createQqCommands({ db, logger: { info: () => {}, warn: () => {}, error: () => {} } });
  // 任意输入都直接输出在线列表(首次提示由绑定消息承担)
  for (const text of ['你好', '/在线列表', '好友', '随便聊聊']) {
    const reply = await handler({ dbId: id, content: text, openid: 'openid_x' });
    assert.ok(reply.text.includes('Alice'));
    assert.ok(reply.markdown.includes('| 🟢 Alice | WorldX |'));
    assert.ok(!reply.text.includes('Bob'));
  }
  // 其他 openid 同样直接输出表格
  const another = await handler({ dbId: id, content: '随便聊聊', openid: 'openid_y' });
  assert.ok(another.text.includes('Alice'));
});

test('createQqCommands: 连接异常时头部提示"当前未连接, 数据截止至断开时间"', async () => {
  const db = createDb(':memory:');
  const id = db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldName: 'WorldX' });
  const silent = { info: () => {}, warn: () => {}, error: () => {} };
  // 连接正常: 无提示
  const ok = createQqCommands({ db, logger: silent, getStatus: () => ({ connected: true, since: null }) });
  const okReply = await ok({ dbId: id, content: 'hi' });
  assert.ok(!okReply.text.includes('当前未连接'));
  // WS 重连中 / 401 未恢复: 头部提示 + 原有列表
  const down = createQqCommands({ db, logger: silent, getStatus: () => ({ connected: false, since: 1750000000000 }) });
  const reply = await down({ dbId: id, content: 'hi' });
  assert.ok(reply.text.startsWith('当前未连接, 数据截止至 '), '文本头部提示数据截止时间');
  assert.ok(reply.markdown.startsWith('当前未连接, 数据截止至 '), 'markdown 头部提示数据截止时间');
  assert.ok(reply.text.includes('Alice'));
  assert.ok(reply.markdown.includes('| 🟢 Alice | WorldX |'));
  // 空列表(无 markdown)时同样只加文本提示, 不报错
  const db2 = createDb(':memory:');
  const id2 = db2.upsertUser('usr_me2', { username: 'me2', displayName: '我2', avatarUrl: null });
  const down2 = createQqCommands({ db: db2, logger: silent, getStatus: () => ({ connected: false, since: 1750000000000 }) });
  const reply2 = await down2({ dbId: id2, content: 'hi' });
  assert.ok(reply2.text.startsWith('当前未连接, 数据截止至 '));
  assert.equal(reply2.markdown, undefined);
});

test('createQqCommands: onCode 优先处理验证码, 返回 null 时回落到在线列表', async () => {
  const db = createDb(':memory:');
  const id = db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldName: 'WorldX' });
  const silent = { info: () => {}, warn: () => {}, error: () => {} };
  const calls = [];
  const handler = createQqCommands({
    db, logger: silent,
    onCode: async (dbId, content) => {
      calls.push({ dbId, content });
      return /^\d{6}$/.test(String(content).trim()) ? { text: '✅ 验证成功' } : null;
    }
  });
  const codeReply = await handler({ dbId: id, content: '123456' });
  assert.equal(codeReply.text, '✅ 验证成功', '验证码消息由 onCode 消费');
  assert.ok(!codeReply.text.includes('Alice'));
  const listReply = await handler({ dbId: id, content: '好友列表' });
  assert.ok(listReply.text.includes('Alice'), '非验证码消息回落到在线列表');
  assert.deepEqual(calls, [{ dbId: id, content: '123456' }, { dbId: id, content: '好友列表' }]);
});
