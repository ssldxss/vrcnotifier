const test = require('node:test');
const assert = require('node:assert');
const { WebSocketServer } = require('ws');
const { createPipelineManager } = require('../src/pipeline');

const cfg = { pingIntervalMs: 50, reconnectBaseMs: 20, reconnectMaxMs: 200, jitterMs: 5, failNotifyMs: 200 };

function startMockPipeline() {
  const state = { connections: [], tokens: [], messages: [] };
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const ready = new Promise((resolve) => {
    wss.on('connection', (ws, req) => {
      state.connections.push({ ws, req });
      ws.on('message', (d) => state.messages.push(d.toString()));
      ws.on('error', () => {});
    });
    wss.on('listening', () => resolve({ wss, state, url: `ws://127.0.0.1:${wss.address().port}` }));
  });
  return ready.then((v) => ({
    ...v,
    close: () => new Promise((r) => {
      for (const c of wss.clients) c.terminate();
      wss.close(r);
    })
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('connects with authToken and UA; parses double-encoded message; dedupes identical frames', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    let tokenCalls = 0;
    const events = [];
    const pm = createPipelineManager({
      getToken: async () => { tokenCalls++; return { status: 'ok', token: 'authcookie_t1' }; },
      onMessage: (userId, raw, parsed) => { events.push({ userId, type: parsed.type, content: parsed.content }); },
      userAgent: 'vrcnotifier-test/1.0',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(100);
    assert.equal(state.connections.length, 1);
    assert.ok(state.connections[0].req.url.includes('authToken=authcookie_t1'));
    assert.equal(state.connections[0].req.headers['user-agent'], 'vrcnotifier-test/1.0');
    const frame = JSON.stringify({ type: 'friend-online', content: JSON.stringify({ userId: 'usr_f', platform: 'standalonewindows' }) });
    state.connections[0].ws.send(frame);
    await sleep(50);
    state.connections[0].ws.send(frame); // 重复帧
    await sleep(50);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'friend-online');
    assert.equal(events[0].content.userId, 'usr_f');
    pm.disconnect('u1');
  } finally { await close(); }
});

test('reconnects after server close with backoff and re-fetches token', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    let tokenCalls = 0;
    const pm = createPipelineManager({
      getToken: async () => { tokenCalls++; return { status: 'ok', token: `tok${tokenCalls}` }; },
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(80);
    assert.equal(state.connections.length, 1);
    state.connections[0].ws.terminate(); // 模拟异常断开
    await sleep(300);
    assert.ok(state.connections.length >= 2, `reconnected, got ${state.connections.length}`);
    assert.ok(tokenCalls >= 2);
    assert.ok(state.connections[1].req.url.includes('tok2'));
    pm.disconnect('u1');
  } finally { await close(); }
});

test('forceReconnect tears down and reconnects; disconnect stops reconnection', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    const pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(80);
    assert.equal(state.connections.length, 1);
    pm.forceReconnect('u1');
    await sleep(250);
    assert.ok(state.connections.length >= 2);
    const countBeforeStop = state.connections.length;
    pm.disconnect('u1');
    await sleep(200);
    assert.equal(state.connections.length, countBeforeStop);
  } finally { await close(); }
});

test('onReconnect fires after reconnect succeeds, not on first connect', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    let reconnects = 0;
    const pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      onReconnect: () => { reconnects++; },
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(80);
    assert.equal(reconnects, 0, '首次连接不应触发 onReconnect');
    state.connections[0].ws.terminate();
    await sleep(300);
    assert.ok(reconnects >= 1, '重连成功应触发 onReconnect');
    pm.disconnect('u1');
  } finally { await close(); }
});

test('disconnect during in-flight getToken does not open a zombie connection', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    let releaseToken;
    const gate = new Promise((resolve) => { releaseToken = resolve; });
    const pm = createPipelineManager({
      getToken: async () => { await gate; return { status: 'ok', token: 't' }; },
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(20);          // 让 connectPipeline 停在 await getToken
    pm.disconnect('u1');      // 取 token 期间断开
    releaseToken();           // 放行 getToken
    await sleep(150);         // 给足时间, 若旧逻辑会建立僵尸连接
    assert.equal(state.connections.length, 0, '断开后不应再建立连接');
    pm.disconnect('u1');      // 幂等安全
  } finally { await close(); }
});

test('notifies connect failure once after failNotifyMs and recovery on reopen', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    let fail = true;
    let tokenCalls = 0;
    const failures = [];
    const recoveries = [];
    const pm = createPipelineManager({
      getToken: async () => { tokenCalls++; if (fail) return { status: 'error' }; return { status: 'ok', token: 't' }; },
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      onConnectFailure: (userId, name) => failures.push({ userId, name }),
      onConnectRecovered: (userId, name) => recoveries.push({ userId, name })
    });
    pm.connect('u1', '我');
    await sleep(400);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].userId, 'u1');
    fail = false;
    await sleep(400);
    assert.ok(state.connections.length >= 1);
    assert.equal(recoveries.length, 1);
    pm.disconnect('u1');
  } finally { await close(); }
});

test('logs each received ws message as a single line', async (t) => {
  const { state, url, close } = await startMockPipeline();
  t.after(() => close());
  const logs = [];
  const pm = createPipelineManager({
    getToken: async () => ({ status: 'ok', token: 't' }),
    onMessage: () => {},
    userAgent: 't/1',
    wsUrl: (token) => `${url}/?authToken=${token}`,
    config: cfg,
    logger: { info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) }
  });
  pm.connect('u1', '我');
  t.after(() => pm.disconnect('u1'));
  await sleep(80);
  state.connections[0].ws.send(JSON.stringify({ type: 'friend-online', content: JSON.stringify({ userId: 'usr_f', location: 'wrld_123:456', platform: 'standalonewindows' }) }));
  await sleep(50);
  const info = logs.filter((l) => l[0] === 'info').map((l) => l.slice(1).join(' '));
  assert.ok(info.some((s) => s.includes('[ws]') && s.includes('friend-online') && s.includes('usr_f')), 'received message logged with type and userId');
  assert.ok(info.every((s) => !s.includes('\n')), 'each log line occupies a single line');
});

test('status reports connected and lastMessageAt', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    let t = 1000;
    const pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      now: () => t,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(80);
    assert.equal(pm.isConnected('u1'), true);
    const before = pm.lastMessageAt('u1');
    t = 5000;
    state.connections[0].ws.send(JSON.stringify({ type: 'friend-add', content: JSON.stringify({ userId: 'x' }) }));
    await sleep(50);
    assert.ok(pm.lastMessageAt('u1') > before);
    pm.disconnect('u1');
  } finally { await close(); }
});

