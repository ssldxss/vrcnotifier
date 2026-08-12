const test = require('node:test');
const assert = require('node:assert');
const {
  renderTemplate, statusLabel, stateLabel, buildQq, buildChangeVars
} = require('../src/templates');

const change = {
  friendName: '阿猫',
  oldState: 'offline', newState: 'online',
  oldStatus: 'active', newStatus: 'join me',
  oldWorld: '-', newWorld: '咖啡厅', changeType: '上线',
  oldStatusDescription: '', newStatusDescription: '摸鱼中',
  oldPlatform: 'unknown', newPlatform: 'standalonewindows',
  timestamp: '2026-08-01 20:00:00', avatarUrl: 'https://x/a.png'
};

test('renderTemplate replaces {vars} and leaves unknown', () => {
  assert.equal(renderTemplate('hi {friendName} {nope}', { friendName: 'x' }), 'hi x {nope}');
});

test('statusLabel maps social statuses', () => {
  assert.equal(statusLabel('active'), '在线');
  assert.equal(statusLabel('join me'), '加入我');
  assert.equal(statusLabel('ask me'), '询问我');
  assert.equal(statusLabel('busy'), '忙碌');
  assert.equal(statusLabel('unknown-x'), 'unknown-x');
});

test('stateLabel maps online states', () => {
  assert.equal(stateLabel('offline'), '离线');
  assert.equal(stateLabel('active'), '网页在线');
  assert.equal(stateLabel('online'), '在线');
  assert.equal(stateLabel('web'), '网页在线');
});

test('buildChangeVars contains all documented keys', () => {
  const vars = buildChangeVars(change);
  for (const k of ['friendName','oldState','newState','oldStatus','newStatus','oldStatusEmoji','newStatusEmoji','oldWorld','newWorld','changeType','timestamp','oldStatusDescription','newStatusDescription','oldPlatform','newPlatform']) {
    assert.ok(k in vars, k);
  }
  assert.equal(vars.newState, '在线');
  assert.equal(vars.newStatus, '加入我');
  assert.equal(vars.newStatusEmoji, '🔵');
  assert.equal(vars.oldStatusDescription, '无');
});


// ---- VRChat 站内通知(notification-v2): 通知风格, 非状态变化模板 ----
const v2 = {
  changeType: 'VRChat通知', friendName: 'vrcntest',
  oldStatus: '未知', newStatus: '未知',
  oldWorld: '-', newWorld: '-',
  oldStatusDescription: '无', newStatusDescription: 'vrcntest Booped You!\nhi',
  notificationTitle: 'vrcntest Booped You!', notificationBody: 'hi', notificationCategory: 'social', notificationCategoryLabel: '社交互动', categoryOrWorld: '',
  eventType: 'vrc_notification',
  timestamp: '2026-08-08 14:01:57'
};

test('buildChangeVars includes notification fields', () => {
  const vars = buildChangeVars(v2);
  assert.equal(vars.notificationTitle, 'vrcntest Booped You!');
  assert.equal(vars.notificationBody, 'hi');
  assert.equal(vars.notificationCategory, 'social');
});

test('buildQq renders notification style without status-change fields', () => {
  const q = buildQq(v2, {});
  assert.ok(q.title.startsWith('# '), 'v2 标题为 # 大字');
  assert.ok(q.title.includes('Booped You!'));
  assert.ok(q.message.includes('hi'));
  assert.ok(q.message.includes('发送者: vrcntest'));
  assert.ok(!q.message.includes('分类:'), 'no category line');
  assert.ok(!q.message.includes('\n\n'), 'no blank line when category removed');
  assert.ok(!q.message.includes('未知 →'), 'no status-change style');
});

test('buildQq with empty body does not start with blank line', () => {
  const dup = { ...v2, notificationBody: '', notificationTitle: '世界邀请' };
  const q = buildQq(dup, {});
  assert.ok(q.message.startsWith('发送者:'));
  assert.ok(!q.message.startsWith('\n'));
});

test('buildQq status change: changed fields first, unchanged show value only', () => {
  const q = buildQq({
    friendName: 'vrcntest', changeType: '切换世界',
    oldState: 'online', newState: 'online',
    oldStatus: 'join me', newStatus: 'join me',
    oldWorld: '私密世界', newWorld: '1KB mirror world',
    oldStatusDescription: '', newStatusDescription: '',
    oldPlatform: 'android', newPlatform: 'android',
    timestamp: '2026-08-08 14:36:36'
  }, {});
  assert.equal(q.title, '# vrcntest切换世界');
  assert.ok(q.message.startsWith('🔵 加入我'), '社交行固定第一(无自定义状态显示社交状态名)');
  assert.ok(q.message.includes('**世界: 私密世界 → 1KB mirror world**'), '变化字段加粗');
  assert.ok(q.message.includes('状态: 在线'));
  assert.ok(q.message.includes('平台: android'));
  assert.ok(!q.message.includes('状态: 在线 → 在线'));
  assert.ok(!q.message.includes('社交:'));
  assert.ok(!q.message.includes('自定义状态:'));
  assert.ok(!q.message.includes('平台: android → android'));
  assert.ok(q.message.indexOf('世界:') < q.message.indexOf('状态:'));
});

test('buildQq social status change uses arrow with emoji', () => {
  const q = buildQq({
    friendName: '阿猫', changeType: '状态变化',
    oldState: 'online', newState: 'online',
    oldStatus: 'ask me', newStatus: 'join me',
    oldWorld: '咖啡厅', newWorld: '咖啡厅',
    oldStatusDescription: '无', newStatusDescription: '无',
    oldPlatform: 'android', newPlatform: 'android',
    timestamp: '2026-08-09 12:00:00'
  }, {});
  assert.equal(q.title, '# 阿猫状态变化');
  assert.ok(q.message.startsWith('**🟠 询问我 → 🔵 加入我**'), '社交状态变化用箭头并加粗');
  assert.ok(q.message.includes('状态: 在线'));
});

test('buildQq escapes markdown special chars in dynamic content', () => {
  const q = buildQq({
    friendName: '*Zoloft*', changeType: '切换世界',
    oldState: 'online', newState: 'online',
    oldStatus: 'join me', newStatus: 'join me',
    oldWorld: 'A|B', newWorld: 'C*D',
    oldStatusDescription: '无', newStatusDescription: '无',
    oldPlatform: 'android', newPlatform: 'android',
    timestamp: '2026-08-09 21:28:05'
  }, {});
  assert.equal(q.title, '# \\*Zoloft\\*切换世界');
  assert.ok(q.message.includes('**世界: A\\|B → C\\*D**'));
});

test('buildQq renders world line for invite', () => {
  const inv = { ...v2, notificationCategory: 'invite', notificationCategoryLabel: '世界邀请', categoryOrWorld: '世界: 美丽世界' };
  const q = buildQq(inv, {});
  assert.ok(q.message.includes('世界: 美丽世界'));
  assert.ok(!q.message.includes('分类: 世界邀请'));
});
