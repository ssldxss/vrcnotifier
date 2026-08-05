const test = require('node:test');
const assert = require('node:assert');
const {
  renderTemplate, statusLabel, encodeRfc2047,
  buildEmail, buildGotify, buildNtfy, buildWebhook, buildChangeVars
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

