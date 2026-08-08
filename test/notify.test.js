const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createNotifier } = require('../src/notify');

const change = {
  friendName: '阿猫', oldStatus: 'offline', newStatus: 'active',
  oldWorld: '-', newWorld: '咖啡厅', changeType: '上线',
  oldStatusDescription: '', newStatusDescription: '摸鱼中',
  oldPlatform: 'unknown', newPlatform: 'standalonewindows',
  timestamp: '2026-08-01 20:00:00', avatarUrl: 'https://x/a.png',
  eventType: 'friend_online'
};

function startSink() {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, received })));
}

const baseUser = {
  display_name: '我',
  email: 'me@example.com',
  smtp_enabled: true, smtp_host: 'smtp.test', smtp_port: 587, smtp_secure: false, smtp_user: 'u', smtp_pass: 'decrypted-pass',
  gotify_enabled: true, gotify_server_url: 'http://127.0.0.1:0', gotify_app_token: 'gtok', gotify_priority: 7,
  ntfy_enabled: true, ntfy_server_url: 'http://127.0.0.1:0', ntfy_topic: 'mytopic', ntfy_priority: 4,
  webhook_enabled: true, webhook_url: 'http://127.0.0.1:0/hook', webhook_method: 'POST',
  webhook_headers: null, webhook_body_template: null, webhook_content_type: 'application/json'
};

test('sendEmail uses injected transport and builds subject/html', async () => {
  const sent = [];
  const notifier = createNotifier({
    createTransport: (opts) => ({ sendMail: async (mail) => { sent.push({ opts, mail }); return { accepted: [mail.to] }; } })
  });
  const result = await notifier.sendEmail({ ...baseUser }, change);
  assert.equal(result.ok, true);
  assert.equal(sent[0].opts.auth.pass, 'decrypted-pass');
  assert.equal(sent[0].mail.to, 'me@example.com');
  assert.ok(sent[0].mail.subject.includes('上线'));
  assert.ok(sent[0].mail.html.includes('阿猫'));
});

test('sendEmail skipped when smtp not configured', async () => {
  const notifier = createNotifier({ createTransport: null });
  const r = await notifier.sendEmail({ display_name: 'x', email: null, smtp_host: null, smtp_user: null, smtp_pass: null }, change);
  assert.equal(r.ok, false);
  assert.match(r.reason, /未配置/);
});

test('sendGotify posts correct payload with token param', async () => {
  const { server, received } = await startSink();
  try {
    const notifier = createNotifier();
    const r = await notifier.sendGotify({ ...baseUser, gotify_server_url: `http://127.0.0.1:${server.address().port}` }, change);
    assert.equal(r.ok, true);
    const req = received[0];
    assert.equal(req.method, 'POST');
    assert.ok(req.url.includes('token=gtok'));
    const body = JSON.parse(req.body);
    assert.equal(body.title, '上线: 阿猫');
    assert.equal(body.priority, 7);
    assert.ok(body.message.includes('咖啡厅'));
  } finally { server.close(); }
});

test('sendNtfy posts to topic with RFC2047 title header', async () => {
  const { server, received } = await startSink();
  try {
    const notifier = createNotifier();
    const r = await notifier.sendNtfy({ ...baseUser, ntfy_server_url: `http://127.0.0.1:${server.address().port}` }, change);
    assert.equal(r.ok, true);
    const req = received[0];
    assert.ok(req.url.includes('/mytopic'));
    assert.equal(req.headers['content-type'], 'text/plain');
    assert.match(req.headers['title'], /^=\?UTF-8\?B\?/);
    assert.equal(req.headers['priority'], '4');
    assert.ok(req.body.includes('咖啡厅'));
  } finally { server.close(); }
});

test('sendWebhook posts default JSON body', async () => {
  const { server, received } = await startSink();
  try {
    const notifier = createNotifier();
    const r = await notifier.sendWebhook({ ...baseUser, webhook_url: `http://127.0.0.1:${server.address().port}/hook` }, change);
    assert.equal(r.ok, true);
    const req = received[0];
    assert.equal(req.headers['content-type'], 'application/json');
    const body = JSON.parse(req.body);
    assert.equal(body.event, 'friend_online');
    assert.equal(body.friend.name, '阿猫');
    assert.equal(body.change.type, '上线');
  } finally { server.close(); }
});

test('sendAll dispatches to all enabled channels and reports per-channel results', async () => {
  const { server, received } = await startSink();
  try {
    const user = {
      ...baseUser,
      gotify_server_url: `http://127.0.0.1:${server.address().port}`,
      ntfy_server_url: `http://127.0.0.1:${server.address().port}`,
      webhook_url: `http://127.0.0.1:${server.address().port}/hook`
    };
    const notifier = createNotifier({ createTransport: () => ({ sendMail: async () => ({ accepted: ['x'] }) }), getSettings: () => user });
    const results = await notifier.sendAll(user, change);
    assert.equal(results.gotify.ok, true);
    assert.equal(results.ntfy.ok, true);
    assert.equal(results.webhook.ok, true);
    assert.equal(results.email.ok, true);
    assert.ok(received.length >= 3);
  } finally { server.close(); }
});

test('sendTest produces test change for every channel', async () => {
  const { server, received } = await startSink();
  try {
    const user = {
      ...baseUser,
      gotify_server_url: `http://127.0.0.1:${server.address().port}`,
      ntfy_server_url: `http://127.0.0.1:${server.address().port}`,
      webhook_url: `http://127.0.0.1:${server.address().port}/hook`
    };
    const notifier = createNotifier({ createTransport: () => ({ sendMail: async () => ({}) }), getSettings: () => user });
    const r = await notifier.sendTest(user, 'gotify');
    assert.equal(r.ok, true);
    assert.ok(received.length >= 1);
  } finally { server.close(); }
});

test('sendQq delegates to qq manager with built text; sendAll includes qq result', async () => {
  const sent = [];
  const qq = { sendText: async (dbId, text) => { sent.push({ dbId, text }); return { ok: true }; } };
  const notifier = createNotifier({ qq, getSettings: () => ({ qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' }) });
  const user = { id: 7, qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' };
  const r = await notifier.sendQq(user, change);
  assert.equal(r.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].dbId, 7);
  assert.ok(sent[0].text.includes('上线: 阿猫'));
  const all = await notifier.sendAll(user, change);
  assert.ok(all.qq && all.qq.ok === true);
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

test('sendTest qq uses test change', async () => {
  const sent = [];
  const qq = { sendText: async (dbId, text) => { sent.push(text); return { ok: true }; } };
  const notifier = createNotifier({ qq, getSettings: () => ({ qq_enabled: 1, qq_app_id: 'a', qq_app_secret: 's' }) });
  const r = await notifier.sendTest({ id: 3, qq_enabled: 1, qq_app_id: 'a', qq_app_secret: 's' }, 'qq');
  assert.equal(r.ok, true);
  assert.ok(sent[0].includes('测试通知'));
});

test('sendEmail disabled by smtp_enabled switch', async () => {
  const notifier = createNotifier({ createTransport: () => ({ sendMail: async () => ({ accepted: ['x'] }) }) });
  const r = await notifier.sendEmail({ display_name: 'x', smtp_enabled: 0, email: 'a@b.c', smtp_host: 'h', smtp_user: 'u', smtp_pass: 'p' }, change);
  assert.equal(r.ok, false);
  assert.match(r.reason, /\u672a\u914d\u7f6e/);
  const r2 = await notifier.sendEmail({ ...baseUser, smtp_enabled: 1 }, change);
  assert.equal(r2.ok, true);
});
