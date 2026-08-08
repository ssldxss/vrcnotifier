const test = require('node:test');
const assert = require('node:assert');
const {
  renderTemplate, statusLabel, encodeRfc2047,
  buildEmail, buildGotify, buildNtfy, buildQq, buildWebhook, buildChangeVars
} = require('../src/templates');

const change = {
  friendName: '阿猫', oldStatus: 'offline', newStatus: 'active',
  oldWorld: '-', newWorld: '咖啡厅', changeType: '上线',
  oldStatusDescription: '', newStatusDescription: '摸鱼中',
  oldPlatform: 'unknown', newPlatform: 'standalonewindows',
  timestamp: '2026-08-01 20:00:00', avatarUrl: 'https://x/a.png'
};

test('renderTemplate replaces {vars} and leaves unknown', () => {
  assert.equal(renderTemplate('hi {friendName} {nope}', { friendName: 'x' }), 'hi x {nope}');
});

test('statusLabel maps codes', () => {
  assert.equal(statusLabel('offline'), '离线');
  assert.equal(statusLabel('join me'), '加入我');
  assert.equal(statusLabel('busy'), '忙碌');
  assert.equal(statusLabel('web'), '网页端');
  assert.equal(statusLabel('unknown-x'), 'unknown-x');
});

test('encodeRfc2047 encodes non-ascii, keeps ascii', () => {
  const enc = encodeRfc2047('阿猫 上线');
  assert.match(enc, /^=\?UTF-8\?B\?/);
  assert.equal(encodeRfc2047('plain title'), 'plain title');
});

test('buildChangeVars contains all documented keys', () => {
  const vars = buildChangeVars(change);
  for (const k of ['friendName','oldStatus','newStatus','oldWorld','newWorld','changeType','timestamp','oldStatusDescription','newStatusDescription','oldPlatform','newPlatform']) {
    assert.ok(k in vars, k);
  }
  assert.equal(vars.newStatus, '在线');
  assert.equal(vars.oldStatusDescription, '无');
});

test('buildEmail uses custom templates when provided', () => {
  const mail = buildEmail(change, {
    subjectTemplate: '通知: {changeType} {friendName}',
    bodyTemplate: '<p>{friendName} {newWorld}</p>'
  });
  assert.equal(mail.subject, '通知: 上线 阿猫');
  assert.ok(mail.html.includes('阿猫 咖啡厅'));
});

test('buildEmail defaults produce subject and html', () => {
  const mail = buildEmail(change, {});
  assert.ok(mail.subject.includes('上线'));
  assert.ok(mail.html.includes('阿猫'));
});

test('buildGotify payload structure', () => {
  const g = buildGotify(change, { titleTemplate: null, messageTemplate: null, priority: 7 });
  assert.equal(g.priority, 7);
  assert.ok(g.title.includes('阿猫'));
  assert.ok(g.message.includes('咖啡厅'));
  assert.ok(g.extras['client::display']);
});

test('buildNtfy uses date-safe timestamp and headers', () => {
  const n = buildNtfy(change, { priority: 4 });
  assert.equal(n.priority, 4);
  assert.ok(n.title.includes('阿猫'));
  assert.ok(!n.message.includes('2026/'));
});

test('buildWebhook default JSON body', () => {
  const w = buildWebhook(change, { url: 'https://h/x', method: 'POST', headers: null, bodyTemplate: null, contentType: 'application/json' });
  assert.equal(w.url, 'https://h/x');
  assert.equal(w.body.event, 'status_change');
  assert.equal(w.body.friend.name, '阿猫');
  assert.equal(w.body.change.type, '上线');
});

test('buildWebhook custom template replaces placeholders', () => {
  const w = buildWebhook(change, { url: 'https://h/x', method: 'POST', headers: '{"X-K":"v"}', bodyTemplate: '{"name":"{friendName}","type":"{changeType}"}', contentType: 'application/json' });
  assert.equal(w.headers['X-K'], 'v');
  assert.deepEqual(w.body, { name: '阿猫', type: '上线' });
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
  assert.ok(q.title.includes('Booped You!'));
  assert.ok(q.message.includes('hi'));
  assert.ok(q.message.includes('发送者: vrcntest'));
  assert.ok(!q.message.includes('分类:'), 'no category line');
  assert.ok(!q.message.includes('\n\n'), 'no blank line when category removed');
  assert.ok(!q.message.includes('未知 →'), 'no status-change style');
});

test('buildGotify renders notification style', () => {
  const g = buildGotify(v2, { titleTemplate: null, messageTemplate: null, priority: 5 });
  assert.equal(g.title, 'vrcntest Booped You!');
  assert.ok(!g.message.includes('分类:'));
});

test('buildNtfy renders notification style', () => {
  const n = buildNtfy(v2, { priority: 4 });
  assert.equal(n.title, 'vrcntest Booped You!');
  assert.ok(n.message.includes('hi'));
});

test('buildEmail renders notification subject/body, custom template wins', () => {
  const mail = buildEmail(v2, {});
  assert.ok(mail.subject.includes('Booped You!'));
  assert.ok(mail.html.includes('vrcntest'));
  const custom = buildEmail(v2, { subjectTemplate: '{notificationTitle} {notificationCategory}' });
  assert.equal(custom.subject, 'vrcntest Booped You! social');
});

test('buildWebhook default body includes notification payload', () => {
  const w = buildWebhook(v2, { url: 'https://h/x', method: 'POST', headers: null, bodyTemplate: null, contentType: 'application/json' });
  assert.equal(w.body.event, 'vrc_notification');
  assert.equal(w.body.notification.category, 'social');
  assert.equal(w.body.notification.title, 'vrcntest Booped You!');
  assert.equal(w.body.friend.name, 'vrcntest');
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
    oldStatus: 'join me', newStatus: 'join me',
    oldWorld: '私密世界', newWorld: '1KB mirror world',
    oldStatusDescription: '', newStatusDescription: '',
    oldPlatform: 'android', newPlatform: 'android',
    timestamp: '2026-08-08 14:36:36'
  }, {});
  assert.equal(q.title, '切换世界: vrcntest');
  assert.ok(q.message.startsWith('世界: 私密世界 → 1KB mirror world'));
  assert.ok(q.message.includes('状态: 加入我'));
  assert.ok(q.message.includes('自定义状态: 无'));
  assert.ok(q.message.includes('平台: android'));
  assert.ok(!q.message.includes('状态: 加入我 → 加入我'));
  assert.ok(!q.message.includes('自定义状态: 无 → 无'));
  assert.ok(!q.message.includes('平台: android → android'));
  assert.ok(q.message.indexOf('世界:') < q.message.indexOf('状态:'));
});

test('buildGotify status change follows QQ format: changed first, unchanged show value only', () => {
  const g = buildGotify({
    friendName: 'vrcntest', changeType: '切换世界',
    oldStatus: 'join me', newStatus: 'join me',
    oldWorld: '私密世界', newWorld: '1KB mirror world',
    oldStatusDescription: '', newStatusDescription: '',
    oldPlatform: 'android', newPlatform: 'android',
    timestamp: '2026-08-08 14:36:36'
  }, { titleTemplate: null, messageTemplate: null });
  assert.equal(g.title, '切换世界: vrcntest');
  assert.ok(g.message.startsWith('世界: 私密世界 → 1KB mirror world'));
  assert.ok(g.message.includes('状态: 加入我'));
  assert.ok(!g.message.includes('状态: 加入我 → 加入我'));
  assert.ok(g.message.indexOf('世界:') < g.message.indexOf('状态:'));
  assert.ok(g.message.endsWith('时间: 2026-08-08 14:36:36'));
});

test('buildNtfy status change follows QQ format', () => {
  const n = buildNtfy({
    friendName: 'vrcntest', changeType: '切换世界',
    oldStatus: 'join me', newStatus: 'join me',
    oldWorld: '私密世界', newWorld: '1KB mirror world',
    oldStatusDescription: '', newStatusDescription: '',
    oldPlatform: 'android', newPlatform: 'android',
    timestamp: '2026-08-08 14:36:36'
  }, {});
  assert.equal(n.title, '切换世界: vrcntest');
  assert.ok(n.message.startsWith('世界: 私密世界 → 1KB mirror world'));
  assert.ok(!n.message.includes('状态: 加入我 → 加入我'));
});

test('buildEmail status change body uses QQ-style status lines', () => {
  const mail = buildEmail({
    friendName: 'vrcntest', changeType: '切换世界',
    oldStatus: 'join me', newStatus: 'join me',
    oldWorld: '私密世界', newWorld: '1KB mirror world',
    oldStatusDescription: '', newStatusDescription: '',
    oldPlatform: 'android', newPlatform: 'android',
    timestamp: '2026-08-08 14:36:36'
  }, {});
  assert.ok(mail.subject.includes('切换世界'));
  assert.ok(mail.html.includes('世界: 私密世界 → 1KB mirror world'));
  assert.ok(mail.html.includes('状态: 加入我'));
  assert.ok(!mail.html.includes('状态: 加入我 → 加入我'));
  assert.ok(!mail.html.includes('<table'));
});

test('buildQq renders world line for invite', () => {
  const inv = { ...v2, notificationCategory: 'invite', notificationCategoryLabel: '世界邀请', categoryOrWorld: '世界: 美丽世界' };
  const q = buildQq(inv, {});
  assert.ok(q.message.includes('世界: 美丽世界'));
  assert.ok(!q.message.includes('分类: 世界邀请'));
});
