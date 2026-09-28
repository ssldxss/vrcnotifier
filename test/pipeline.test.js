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
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
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
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
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
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
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

// 回归: forceReconnect 必须让 onClose 走通(monitor 据此把 st.open 置 false 并开启故障窗口),
// 否则重连持续失败时故障窗口永不开启 → 不告警。同时不能双重调度重连。
test('forceReconnect notifies onClose exactly once and still reconnects', async () => {
  const { state, url, close } = await startMockPipeline();
  let pm = null;
  try {
    let onCloseCalls = 0;
    pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      onClose: () => { onCloseCalls++; },
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(80);
    assert.equal(state.connections.length, 1);

    pm.forceReconnect('u1');
    // close 事件是异步派发的: 等一拍再断言(旧实现在此处永久为 0 → 会失败)
    await sleep(20);
    assert.equal(onCloseCalls, 1, 'forceReconnect 应通知一次 onClose');

    await sleep(230);
    assert.ok(state.connections.length >= 2, 'watchdog 强制重连成功');
    assert.equal(onCloseCalls, 1, '重连不应产生第二次 onClose(无双重调度)');
  } finally {
    // 无条件清理: 断言失败时也要断开并停掉服务, 否则残留连接会让测试进程不退出
    try { if (pm) pm.disconnect('u1'); } catch (e) { /* ignore */ }
    await close();
  }
});

test('frame receipt logs at debug level; reconnect logs at warn level', async () => {
  const { state, url, close } = await startMockPipeline();
  let pm = null;
  try {
    const logs = [];
    const logger = {
      debug: (...a) => logs.push(['debug', a.join(' ')]),
      info: (...a) => logs.push(['info', a.join(' ')]),
      warn: (...a) => logs.push(['warn', a.join(' ')]),
      error: (...a) => logs.push(['error', a.join(' ')])
    };
    pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger
    });
    pm.connect('u1', '我');
    await sleep(80);
    state.connections[0].ws.send(JSON.stringify({ type: 'friend-online', content: JSON.stringify({ userId: 'usr_f' }) }));
    await sleep(50);
    const frameLog = logs.find((l) => l[1].includes('收到消息'));
    assert.ok(frameLog, '收到消息应输出日志');
    assert.equal(frameLog[0], 'debug', '每帧收到消息应为 debug 级');
    logs.length = 0;
    pm.forceReconnect('u1');
    await sleep(250);
    assert.ok(state.connections.length >= 2, '强制重连成功');
    const rcLog = logs.find((l) => l[1].includes('后重连'));
    assert.ok(rcLog, '重连应输出日志');
    assert.equal(rcLog[0], 'warn', '重连统一按 warn 记录(不再区分来源)');
  } finally {
    // 无条件清理: 断言失败时也要断开, 否则残留连接会让测试进程不退出
    try { if (pm) pm.disconnect('u1'); } catch (e) { /* ignore */ }
    await close();
  }
});

test('abnormal disconnect reconnect stays warn level', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    const logs = [];
    const logger = {
      debug: () => {},
      info: (...a) => logs.push(['info', a.join(' ')]),
      warn: (...a) => logs.push(['warn', a.join(' ')]),
      error: (...a) => logs.push(['error', a.join(' ')])
    };
    const pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger
    });
    pm.connect('u1', '我');
    await sleep(80);
    state.connections[0].ws.terminate(); // 模拟异常断开
    await sleep(300);
    assert.ok(state.connections.length >= 2, '异常断开后应重连');
    const rcLog = logs.find((l) => l[1].includes('后重连'));
    assert.ok(rcLog, '重连应输出日志');
    assert.equal(rcLog[0], 'warn', '异常断开触发的重连应保持 warn 级');
    pm.disconnect('u1');
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
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
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

test('counts received messages per second and exposes last-60s series', async () => {
  const { state, url, close } = await startMockPipeline();
  try {
    let t = 1700000000000;
    const pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      now: () => t,
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: { ...cfg, pingIntervalMs: 100000, pongTimeoutMs: 100000 },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(80);
    const frame = (i) => JSON.stringify({ type: 'friend-online', content: JSON.stringify({ userId: `usr_${i}` }) });
    state.connections[0].ws.send(frame(1));
    state.connections[0].ws.send(frame(2));
    await sleep(50);
    t += 1000; // 进入下一秒
    state.connections[0].ws.send(frame(3));
    await sleep(50);
    const stats = pm.messageSeries(t);
    assert.equal(stats.series.length, 60);
    assert.equal(stats.total, 3);
    assert.equal(stats.series[59], 1, '当前秒 1 条');
    assert.equal(stats.series[58], 2, '上一秒 2 条');
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
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
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
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
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
    logger: { debug: (...a) => logs.push(['debug', ...a]), info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) }
  });
  pm.connect('u1', '我');
  t.after(() => pm.disconnect('u1'));
  await sleep(80);
  state.connections[0].ws.send(JSON.stringify({ type: 'friend-online', content: JSON.stringify({ userId: 'usr_f', location: 'wrld_123:456', platform: 'standalonewindows' }) }));
  await sleep(50);
  const dbg = logs.filter((l) => l[0] === 'debug').map((l) => l.slice(1).join(' '));
  assert.ok(dbg.some((s) => s.includes('[ws]') && s.includes('friend-online') && s.includes('usr_f')), 'received message logged with type and userId');
  assert.ok(dbg.every((s) => !s.includes('\n')), 'each log line occupies a single line');
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
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
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


test('reconnect does not dedupe first frame against pre-disconnect frame', async () => {
  const { state, url, close } = await startMockPipeline();
  let pm = null;
  try {
    const events = [];
    pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: (userId, raw, parsed) => { events.push({ type: parsed.type }); },
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(80);
    const frame = JSON.stringify({ type: 'friend-online', content: JSON.stringify({ userId: 'usr_f' }) });
    state.connections[0].ws.send(frame);
    await sleep(50);
    assert.equal(events.length, 1);
    state.connections[0].ws.terminate(); // 模拟断开
    await sleep(300);
    assert.ok(state.connections.length >= 2, 'reconnected');
    state.connections[1].ws.send(frame); // 与断开前相同的帧
    await sleep(50);
    assert.equal(events.length, 2, '重连后首帧不应被上次连接的帧去重吞掉');
      } finally {
    if (pm) pm.disconnect('u1'); // 失败时也清理重连定时器, 避免进程悬挂
    await close();
  }
});

// 回归(生产事故): 重登路径是「主动断开 → 立刻重连」—— finalizeLogin 里 deactivateUser() 之后
// 紧接 activateUser(), 两者落在同一 tick。旧实现在旧连接的 close 回调里无条件 conns.delete(userId),
// 会把刚登记进来的新 conn 一起删掉; 新连接随后因 `conns.get(userId) !== conn` 静默放弃建立,
// 而旧连接已 stopped 不会再排重连 → 该用户此后再也不会连上, 且全程无日志。
test('relogin: 主动断开后立刻重连, 旧连接的 close 不得误删新连接', async () => {
  const { state, url, close } = await startMockPipeline();
  let pm = null;
  try {
    pm = createPipelineManager({
      // 真实环境这里是 HTTP GET /auth, 必然让出事件循环; 用 30ms 延迟模拟,
      // 让旧连接的 close 事件正好落在这一段 await 窗口里。
      getToken: async () => { await sleep(30); return { status: 'ok', token: 't' }; },
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `${url}/?authToken=${token}`,
      config: cfg,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(120);
    assert.equal(state.connections.length, 1);

    // 复刻 finalizeLogin: 同一 tick 内 deactivateUser() + activateUser()
    pm.disconnect('u1');
    pm.connect('u1', '我');

    await sleep(400);
    assert.ok(state.connections.length >= 2, `重登后应重新建立连接, 实际 ${state.connections.length}`);
    assert.equal(pm.isConnected('u1'), true, '重登后应处于已连接状态');
    assert.ok(pm.status('u1'), '连接对象应仍在册(不被旧连接的 close 误删)');
  } finally {
    try { if (pm) pm.disconnect('u1'); } catch (e) { /* ignore */ }
    await close();
  }
});

// 回归: ws 库默认没有握手超时(handshakeTimeout=0)。服务端接受了 TCP 却不完成 WebSocket 握手时,
// 连接会永久停在 CONNECTING —— 此时既没有 close 事件、ping/pong 还没启动、也没有重连定时器,
// 三层兜底(close 重连 / watchdog 静默检测 / watchdog 在册性)会全部漏过。
// 加上握手超时后: 到点由 ws 主动 abort → error+close → 退回正常的退避重连。
test('握手挂死: handshakeTimeout 到点后放弃并重连, 不再无限停留', async () => {
  const net = require('node:net');
  const sockets = [];
  const attempts = [];
  // 裸 TCP 服务端: 接受连接但永不回复 101 握手响应
  const server = net.createServer((sock) => {
    sockets.push(sock);
    attempts.push(Date.now());
    sock.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  let pm = null;
  try {
    pm = createPipelineManager({
      getToken: async () => ({ status: 'ok', token: 't' }),
      onMessage: () => {},
      userAgent: 't/1',
      wsUrl: (token) => `ws://127.0.0.1:${port}/?authToken=${token}`,
      config: { ...cfg, handshakeTimeoutMs: 60, reconnectBaseMs: 20, reconnectMaxMs: 40, jitterMs: 1 },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    });
    pm.connect('u1', '我');
    await sleep(20);
    assert.equal(pm.status('u1').connecting, true, '应处于握手状态(服务端不回 101)');

    await sleep(400);
    // 关键: 握手超时 → abort → close → 退避重连, 因此会看到多次连接尝试, 而不是一次就永久挂住
    assert.ok(attempts.length >= 2, `握手超时后应放弃并重试, 实际尝试 ${attempts.length} 次`);
    assert.equal(pm.isConnected('u1'), false);
  } finally {
    try { if (pm) pm.disconnect('u1'); } catch (e) { /* ignore */ }
    for (const s of sockets) { try { s.destroy(); } catch (e) { /* ignore */ } }
    await new Promise((r) => server.close(r));
  }
});
