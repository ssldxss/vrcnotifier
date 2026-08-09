'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { WebSocketServer } = require('ws');
const { createDb } = require('../src/db');
const { createQqManager } = require('../src/qq');

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 模拟 QQ 开放平台: token 端点 + 发消息端点(HTTP), WebSocket 网关(WS)
function startQqPlatform(opts = {}) {
  const state = { connections: [], frames: [], httpCalls: [] };
  // --- HTTP ---
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      state.httpCalls.push({ method: req.method, url: req.url, headers: req.headers, body });
      const parsed = body ? JSON.parse(body) : {};
      if (req.url.includes('/app/getAppAccessToken')) {
        if (parsed.appId !== opts.appId || parsed.clientSecret !== opts.clientSecret) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 100016, message: 'invalid appid or secret' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ access_token: opts.token || 'tok', expires_in: 7200 }));
      }
      if (req.url.includes('/v2/users/')) {
        if (opts.failMessage) {
          res.writeHead(opts.failMessage.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: opts.failMessage.code, message: opts.failMessage.message }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id: 'msg_ok', timestamp: '2026-08-06T10:00:00+08:00' }));
      }
      res.writeHead(404).end('{}');
    });
  });
  // --- WS 网关 ---
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const ready = new Promise((resolve) => {
    wss.on('connection', (ws, req) => {
      state.connections.push({ ws, req });
      ws.on('message', (d) => state.frames.push(JSON.parse(d.toString())));
      ws.on('error', () => {});
      // 连接后先发 hello
      ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: opts.heartbeatIntervalMs || 500 } }));
      // 收到 identify 后发 READY
      const onMsg = (d) => {
        const f = JSON.parse(d.toString());
        if (f.op === 2) {
          state.identify = f.d;
          ws.send(JSON.stringify({ op: 0, s: 1, t: 'READY', d: { version: 1, session_id: 'sess', user: { id: 'bot1', username: 'bot' } } }));
        }
      };
      ws.on('message', onMsg);
    });
    wss.on('listening', () => resolve());
  });
  return ready.then(() => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    state, httpServer: server, wss,
    base: 'http://127.0.0.1:' + server.address().port,
    wsUrl: 'ws://127.0.0.1:' + wss.address().port,
    close: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => server.close(r)); })
  }))));
}

function makeManager(opts, platform, extra = {}) {
  return createQqManager({
    db: opts.db,
    logger: silent,
    fetchImpl: async (url, init) => {
      const res = await fetch(url, init);
      return res;
    },
    now: opts.now,
    config: {
      tokenUrl: platform.base + '/app/getAppAccessToken',
      apiBase: platform.base,
      wsUrl: platform.wsUrl,
      reconnectBaseMs: 20, reconnectMaxMs: 100, jitterMs: 5,
      ...extra
    }
  });
}

test('sendText: 获取token并缓存, 调用发消息端点, 日志含端点', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  db.upsertQqBinding(1, { appId: 'app1', openid: 'openid_x', nickname: '小明', at: 1 });
  const logs = [];
  const logger = { info: (m) => logs.push(m), warn: () => {}, error: () => {} };
  const qq = createQqManager({
    db, logger,
    fetchImpl: async (url, init) => fetch(url, init),
    config: { tokenUrl: platform.base + '/app/getAppAccessToken', apiBase: platform.base, wsUrl: platform.wsUrl }
  });
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    const r1 = await qq.sendText(1, '上线: 阿猫\n状态: 离线 → 在线');
    assert.equal(r1.ok, true);
    const r2 = await qq.sendText(1, '下线: 阿猫');
    assert.equal(r2.ok, true);
    // token 只取一次(缓存)
    const tokenCalls = platform.state.httpCalls.filter((c) => c.url.includes('/app/getAppAccessToken'));
    assert.equal(tokenCalls.length, 1);
    // 两条消息都发到绑定 openid
    const msgCalls = platform.state.httpCalls.filter((c) => c.url.includes('/v2/users/openid_x/messages'));
    assert.equal(msgCalls.length, 2);
    assert.equal(msgCalls[0].headers.authorization, 'QQBot tok1');
    const body = JSON.parse(msgCalls[0].body);
    assert.equal(body.msg_type, 0);
    assert.ok(body.content.includes('阿猫'));
    // 日志包含端点
    assert.ok(logs.some((m) => m.includes('端点') && m.includes('getAppAccessToken')));
    assert.ok(logs.some((m) => m.includes('端点') && m.includes('/v2/users/{openid}/messages')));
    qq.stopAll();
  } finally { await platform.close(); }
});

test('sendText: 未绑定返回失败, 不调发消息端点', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1' });
  const db = createDb(':memory:');
  const qq = createQqManager({ db, logger: silent, fetchImpl: async (u, i) => fetch(u, i), config: { tokenUrl: platform.base + '/app/getAppAccessToken', apiBase: platform.base, wsUrl: platform.wsUrl } });
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    const r = await qq.sendText(1, 'hello');
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('绑定'));
    assert.equal(platform.state.httpCalls.filter((c) => c.url.includes('/v2/users/')).length, 0);
    qq.stopAll();
  } finally { await platform.close(); }
});

test('token 接近过期时自动刷新', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tokA' });
  const db = createDb(':memory:');
  db.upsertQqBinding(1, { appId: 'app1', openid: 'openid_x', nickname: '', at: 1 });
  let t = 1000000;
  const qq = createQqManager({ db, logger: silent, now: () => t, fetchImpl: async (u, i) => fetch(u, i), config: { tokenUrl: platform.base + '/app/getAppAccessToken', apiBase: platform.base, wsUrl: platform.wsUrl } });
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await qq.sendText(1, 'a');
    // 过 2 小时(> 过期时间-安全余量)后再次发送 → 重新取 token
    t += 7200 * 1000 + 1000;
    await qq.sendText(1, 'b');
    const tokenCalls = platform.state.httpCalls.filter((c) => c.url.includes('/app/getAppAccessToken'));
    assert.equal(tokenCalls.length, 2);
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: hello → identify(intents=1<<25) → READY → 状态已连接', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  const qq = makeManager({ db, now: () => Date.now() }, platform);
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(150);
    assert.equal(platform.state.connections.length, 1);
    assert.ok(platform.state.identify, 'identify 已发送');
    assert.equal(platform.state.identify.intents, 1 << 25);
    assert.equal(platform.state.identify.token, 'QQBot tok1');
    assert.deepEqual(platform.state.identify.shard, [0, 1]);
    const st = qq.status(1);
    assert.equal(st.configured, true);
    assert.equal(st.connected, true);
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: 收到 C2C_MESSAGE_CREATE 自动绑定并被动回复', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  const qq = makeManager({ db, now: () => Date.now() }, platform);
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(120);
    platform.state.connections[0].ws.send(JSON.stringify({
      op: 0, s: 2, t: 'C2C_MESSAGE_CREATE',
      d: { id: 'ROBOT.msg1', content: 'hi', author: { id: 'openid_me', user_openid: 'openid_me', username: '我的昵称' } }
    }));
    await sleep(250);
    const binding = db.getQqBinding(1, 'app1');
    assert.ok(binding, '绑定已写入');
    assert.equal(binding.openid, 'openid_me');
    assert.equal(binding.nickname, '我的昵称');
    const reply = platform.state.httpCalls.find((c) => c.url.includes('/v2/users/openid_me/messages'));
    assert.ok(reply, '被动回复已发送');
    const body = JSON.parse(reply.body);
    assert.equal(body.msg_id, 'ROBOT.msg1');
    assert.ok(body.content.includes('绑定成功'));
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: 已绑定用户发命令 -> onCommand 被动回复, 重复 msg_id 不重复回复', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  db.upsertQqBinding(1, { appId: 'app1', openid: 'openid_me', nickname: '我的昵称', at: 1 });
  const onCommand = async ({ content }) => (content.includes('在线') ? '【在线列表】1 人在线\n🟢 Alice  WorldX' : null);
  const qq = createQqManager({
    db, logger: silent, onCommand,
    fetchImpl: async (u, i) => fetch(u, i),
    now: () => Date.now(),
    config: { tokenUrl: platform.base + '/app/getAppAccessToken', apiBase: platform.base, wsUrl: platform.wsUrl }
  });
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(250);
    platform.state.httpCalls.length = 0; // 清掉 READY 后的启动推送, 只留命令回复
    const frame = (id, content) => JSON.stringify({
      op: 0, s: 2, t: 'C2C_MESSAGE_CREATE',
      d: { id, content, author: { id: 'openid_me', user_openid: 'openid_me', username: '我的昵称' } }
    });
    platform.state.connections[0].ws.send(frame('ROBOT.msg2', '/在线列表'));
    await sleep(250);
    const replies = platform.state.httpCalls.filter((c) => c.url.includes('/v2/users/openid_me/messages'));
    assert.ok(replies.length >= 1, '被动回复已发送');
    const body = JSON.parse(replies[0].body);
    assert.equal(body.msg_id, 'ROBOT.msg2');
    assert.ok(body.content.includes('【在线列表】'));
    assert.equal(body.keyboard, undefined, '不再携带按钮键盘');
    // 相同 msg_id 重复推送 -> 不重复回复
    platform.state.httpCalls.length = 0;
    platform.state.connections[0].ws.send(frame('ROBOT.msg2', '/在线列表'));
    await sleep(200);
    const after = platform.state.httpCalls.filter((c) => c.url.includes('/v2/users/openid_me/messages'));
    assert.equal(after.length, 0, '重复 msg_id 不重复回复');
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: onCommand 返回 markdown 对象 -> 一次发送 msg_type=2', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  db.upsertQqBinding(1, { appId: 'app1', openid: 'openid_me', nickname: '我的昵称', at: 1 });
  const md = '# 在线列表 (1)\n\n| 昵称 | 世界 |\n| :--- | :--- |\n| 🟢 Alice | WorldX |';
  const onCommand = async ({ content }) => (content.includes('在线')
    ? { text: '【在线列表】1 人在线\n🟢 Alice  WorldX', markdown: md }
    : null);
  const qq = createQqManager({
    db, logger: silent, onCommand,
    fetchImpl: async (u, i) => fetch(u, i),
    now: () => Date.now(),
    config: { tokenUrl: platform.base + '/app/getAppAccessToken', apiBase: platform.base, wsUrl: platform.wsUrl }
  });
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(250);
    platform.state.httpCalls.length = 0; // 清掉 READY 后的启动推送, 只留命令回复
    platform.state.connections[0].ws.send(JSON.stringify({
      op: 0, s: 2, t: 'C2C_MESSAGE_CREATE',
      d: { id: 'ROBOT.msg3', content: '/在线列表', author: { id: 'openid_me', user_openid: 'openid_me', username: '我的昵称' } }
    }));
    await sleep(250);
    const replies = platform.state.httpCalls.filter((c) => c.url.includes('/v2/users/openid_me/messages'));
    assert.ok(replies.length >= 1, 'markdown 回复已发送');
    const body = JSON.parse(replies[0].body);
    assert.equal(body.msg_type, 2);
    assert.equal(body.markdown.content, md);
    assert.equal(body.msg_id, 'ROBOT.msg3');
    assert.equal(body.keyboard, undefined, '不再携带按钮键盘');
    assert.equal(platform.state.httpCalls.filter((c) => c.url.includes('/stream_messages')).length, 0, '不再使用流式');
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: markdown 被动回复失败回退文本消息', async () => {
  const platform = await startQqPlatform({
    appId: 'app1', clientSecret: 'sec1', token: 'tok1',
    failMessage: { status: 400, code: 1, message: 'bad request' }
  });
  const db = createDb(':memory:');
  db.upsertQqBinding(1, { appId: 'app1', openid: 'openid_me', nickname: '我的昵称', at: 1 });
  const onCommand = async () => ({
    text: '【在线列表】1 人在线\n🟢 Alice  WorldX',
    markdown: '# 在线列表 (1)\n\n| 昵称 | 世界 |\n| :--- | :--- |\n| 🟢 Alice | WorldX |'
  });
  const qq = createQqManager({
    db, logger: silent, onCommand,
    fetchImpl: async (u, i) => fetch(u, i),
    now: () => Date.now(),
    config: { tokenUrl: platform.base + '/app/getAppAccessToken', apiBase: platform.base, wsUrl: platform.wsUrl }
  });
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(250);
    platform.state.httpCalls.length = 0; // 清掉 READY 后的启动推送, 只留命令回复
    platform.state.connections[0].ws.send(JSON.stringify({
      op: 0, s: 2, t: 'C2C_MESSAGE_CREATE',
      d: { id: 'ROBOT.msg4', content: '/在线列表', author: { id: 'openid_me', user_openid: 'openid_me', username: '我的昵称' } }
    }));
    await sleep(300);
    const calls = platform.state.httpCalls.filter((c) => c.url.includes('/v2/users/openid_me/messages'));
    assert.ok(calls.length >= 2, '先 markdown 后回退文本');
    assert.equal(JSON.parse(calls[0].body).msg_type, 2);
    assert.equal(JSON.parse(calls[1].body).msg_type, 0);
    assert.ok(JSON.parse(calls[1].body).content.includes('【在线列表】'));
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: 心跳按 heartbeat_interval 发送且携带 seq', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1', heartbeatIntervalMs: 40 });
  const db = createDb(':memory:');
  const qq = makeManager({ db, now: () => Date.now() }, platform);
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(200);
    const beats = platform.state.frames.filter((f) => f.op === 1);
    assert.ok(beats.length >= 2, `至少 2 次心跳, 实际 ${beats.length}`);
    assert.ok(beats.some((f) => f.d === 1), 'READY 后心跳携带 seq');
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: 断开后按退避重连', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  const qq = makeManager({ db, now: () => Date.now() }, platform);
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(120);
    assert.equal(platform.state.connections.length, 1);
    platform.state.connections[0].ws.terminate();
    await sleep(400);
    assert.ok(platform.state.connections.length >= 2, `已重连: ${platform.state.connections.length}`);
    qq.stopAll();
  } finally { await platform.close(); }
});

test('WS: op9 失效会话 → 清 token 重连并重新获取凭证', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  const qq = makeManager({ db, now: () => Date.now() }, platform);
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(120);
    const tokenCallsBefore = platform.state.httpCalls.filter((c) => c.url.includes('/app/getAppAccessToken')).length;
    platform.state.connections[0].ws.send(JSON.stringify({ op: 9, d: false }));
    await sleep(400);
    const tokenCallsAfter = platform.state.httpCalls.filter((c) => c.url.includes('/app/getAppAccessToken')).length;
    assert.ok(tokenCallsAfter > tokenCallsBefore, '重新获取了 access_token');
    assert.ok(platform.state.connections.length >= 2, '已重连');
    qq.stopAll();
  } finally { await platform.close(); }
});

test('sync/stop: 禁用即断开, 配置变更即重连, stop 后不再重连', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  const qq = makeManager({ db, now: () => Date.now() }, platform);
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(120);
    assert.equal(platform.state.connections.length, 1);
    // 禁用 → 断开且不重连
    qq.sync(1, { qq_enabled: 0, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(300);
    const before = platform.state.connections.length;
    await sleep(200);
    assert.equal(platform.state.connections.length, before);
    assert.equal(qq.status(1).configured, false);
    // 重新启用 → 新连接
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(150);
    assert.ok(platform.state.connections.length > before);
    // stop → 断开后不再重连
    qq.stopAll();
    await sleep(200);
    const after = platform.state.connections.length;
    await sleep(200);
    assert.equal(platform.state.connections.length, after);
  } finally { await platform.close(); }
});

test('status: 未配置返回 configured=false; 已配置带绑定信息', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  const qq = makeManager({ db, now: () => Date.now() }, platform);
  try {
    assert.equal(qq.status(1).configured, false);
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'sec1' });
    await sleep(120);
    db.upsertQqBinding(1, { appId: 'app1', openid: 'openid_9', nickname: '老王', at: 5 });
    const st = qq.status(1);
    assert.equal(st.configured, true);
    assert.equal(st.connected, true);
    assert.equal(st.bound.nickname, '老王');
    qq.stopAll();
  } finally { await platform.close(); }
});

test('凭证错误: appid/secret 无效时发送失败并给出原因', async () => {
  const platform = await startQqPlatform({ appId: 'app1', clientSecret: 'sec1', token: 'tok1' });
  const db = createDb(':memory:');
  db.upsertQqBinding(1, { appId: 'app1', openid: 'openid_x', nickname: '', at: 1 });
  const qq = createQqManager({ db, logger: silent, fetchImpl: async (u, i) => fetch(u, i), config: { tokenUrl: platform.base + '/app/getAppAccessToken', apiBase: platform.base, wsUrl: platform.wsUrl } });
  try {
    qq.sync(1, { qq_enabled: 1, qq_app_id: 'app1', qq_app_secret: 'bad' });
    const r = await qq.sendText(1, 'hi');
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('100016'));
    qq.stopAll();
  } finally { await platform.close(); }
});
