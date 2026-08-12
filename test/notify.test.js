const test = require('node:test');
const assert = require('node:assert');
const { createNotifier } = require('../src/notify');

const change = {
  friendName: '阿猫', oldStatus: 'offline', newStatus: 'active',
  oldWorld: '-', newWorld: '咖啡厅', changeType: '上线',
  oldStatusDescription: '', newStatusDescription: '摸鱼中',
  oldPlatform: 'unknown', newPlatform: 'standalonewindows',
  timestamp: '2026-08-01 20:00:00', avatarUrl: 'https://x/a.png',
  eventType: 'friend_online'
};

test('sendQq delegates to qq manager with built text; sendAll includes qq result', async () => {
  const sent = [];
  const qq = { sendText: async (dbId, text) => { sent.push({ dbId, text }); return { ok: true }; } };
  const notifier = createNotifier({ qq, getSettings: () => ({ qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' }) });
  const user = { id: 7, qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' };
  const r = await notifier.sendQq(user, change);
  assert.equal(r.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].dbId, 7);
  assert.ok(sent[0].text.includes('# 阿猫上线'));
  const all = await notifier.sendAll(user, change);
  assert.ok(all.qq && all.qq.ok === true);
  assert.deepEqual(Object.keys(all), ['qq'], '仅 QQ 渠道');
});

test('sendQq without config or manager returns not-configured', async () => {
  const notifier = createNotifier({});
  const user = { id: 7, qq_enabled: 0, qq_app_id: 'app1', qq_app_secret: 'sec1' };
  const r = await notifier.sendQq(user, change);
  assert.equal(r.ok, false);
  assert.ok(r.reason.includes('未配置'));
  const r2 = await notifier.sendQq({ ...user, qq_enabled: 1 }, change);
  assert.equal(r2.ok, false);
});

test('sendQqText delegates to qq manager with raw text', async () => {
  const sent = [];
  const qq = { sendText: async (dbId, text) => { sent.push({ dbId, text }); return { ok: true }; } };
  const notifier = createNotifier({ qq, getSettings: () => ({}) });
  const r = await notifier.sendQqText(3, '✅ 服务已启动\n输入任意消息');
  assert.equal(r.ok, true);
  assert.deepEqual(sent, [{ dbId: 3, text: '✅ 服务已启动\n输入任意消息' }]);
});

test('sendQqText without qq manager returns not-configured', async () => {
  const notifier = createNotifier({ qq: null, getSettings: () => ({}) });
  const r = await notifier.sendQqText(3, 'hi');
  assert.equal(r.ok, false);
  assert.match(r.reason, /未配置/);
});

test('sendTest qq uses test change; other kinds rejected', async () => {
  const sent = [];
  const qq = { sendText: async (dbId, text) => { sent.push(text); return { ok: true }; } };
  const notifier = createNotifier({ qq, getSettings: () => ({ qq_enabled: 1, qq_app_id: 'a', qq_app_secret: 's' }) });
  const r = await notifier.sendTest({ id: 3, qq_enabled: 1, qq_app_id: 'a', qq_app_secret: 's' }, 'qq');
  assert.equal(r.ok, true);
  assert.ok(sent[0].includes('测试通知'));
  const bad = await notifier.sendTest({ id: 3 }, 'email');
  assert.equal(bad.ok, false);
  assert.ok(bad.reason.includes('未知渠道'));
});
