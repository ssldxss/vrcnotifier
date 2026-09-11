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

// 世界名按需查询: 假模块, 记录调用并按 world_id 给名字
function fakeWorldName(names = {}) {
  const calls = [];
  const store = { ...names };
  return {
    calls,
    get: async (id) => { calls.push(id); return store[id] ?? null; },
    peek: (id) => store[id] ?? null,
    set: (id, name) => { store[id] = name; },
    // 模拟一直查不到(超时/失败)
    hang: () => ({ calls, get: () => new Promise(() => {}), peek: () => null })
  };
}

test('createQqCommands: 任意输入都直接输出在线列表', async () => {
  const db = createDb(':memory:');
  const id = db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldId: 'wrld_x' });
  db.upsertFriend(id, 'usr_b', { displayName: 'Bob', state: 'offline', status: 'busy', worldId: null });
  const svc = fakeWorldName({ wrld_x: 'WorldX' });
  const handler = createQqCommands({ db, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }, worldName: svc });
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
  assert.deepEqual(svc.calls, ['wrld_x', 'wrld_x', 'wrld_x', 'wrld_x', 'wrld_x'], '只查在线好友的世界, 离线不查');
});

test('createQqCommands: 世界名等不到时先用占位符出结果, 不拖住回复', async () => {
  const db = createDb(':memory:');
  const id = db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldId: 'wrld_slow' });
  db.upsertFriend(id, 'usr_b', { displayName: 'Bob', state: 'online', status: 'active', worldId: 'private' });
  const svc = fakeWorldName();
  svc.get = () => new Promise(() => {}); // 永远不返回
  const t0 = Date.now();
  const handler = createQqCommands({
    db, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    worldName: svc, worldNameWaitMs: 50
  });
  const reply = await handler({ dbId: id, content: 'hi', openid: 'o' });
  assert.ok(Date.now() - t0 < 2000, '等待上限生效, 不会一直卡住');
  assert.ok(reply.text.includes('Alice'));
  assert.ok(reply.text.includes('私密世界'), 'private 就地写死, 不进查询');
  assert.ok(reply.markdown.includes('| 🟢 Alice | - |'), '查不到先用 - 占位');
});

test('createQqCommands: 等待超时后用缓存里的旧名字兜底', async () => {
  const db = createDb(':memory:');
  const id = db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldId: 'wrld_slow' });
  const svc = fakeWorldName({ wrld_slow: '很久以前的名字' });
  svc.get = () => new Promise(() => {});
  const handler = createQqCommands({
    db, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    worldName: svc, worldNameWaitMs: 50
  });
  const reply = await handler({ dbId: id, content: 'hi', openid: 'o' });
  assert.ok(reply.markdown.includes('| 🟢 Alice | 很久以前的名字 |'), '超时用 peek 的旧名字兜底');
});

test('createQqCommands: 连接异常时头部提示"当前未连接, 数据截止至断开时间"', async () => {
  const db = createDb(':memory:');
  const id = db.upsertUser('usr_me', { username: 'me', displayName: '我', avatarUrl: null });
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldId: 'wrld_x' });
  const svc = fakeWorldName({ wrld_x: 'WorldX' });
  const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  // 连接正常: 无提示
  const ok = createQqCommands({ db, logger: silent, getStatus: () => ({ connected: true, since: null }), worldName: svc });
  const okReply = await ok({ dbId: id, content: 'hi' });
  assert.ok(!okReply.text.includes('当前未连接'));
  // WS 重连中 / 401 未恢复: 头部提示 + 原有列表
  const down = createQqCommands({ db, logger: silent, getStatus: () => ({ connected: false, since: 1750000000000 }), worldName: svc });
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
  db.upsertFriend(id, 'usr_a', { displayName: 'Alice', state: 'online', status: 'active', worldId: 'wrld_x' });
  const svc = fakeWorldName({ wrld_x: 'WorldX' });
  const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
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
