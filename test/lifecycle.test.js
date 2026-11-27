'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { startApplication, startQqPlatform, waitFor, sleep, deferred } = require('./helpers/lifecycle');

async function healthStream(t, app) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(app.base + '/api/events?token=lifecycle-token', { signal: controller.signal });
  const events = [];
  const decoder = new TextDecoder();
  let buffer = '';
  (async () => {
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (frame.startsWith('event: health\n')) events.push(JSON.parse(frame.split('data: ')[1]));
        }
      }
    } catch (error) { if (!controller.signal.aborted) throw error; }
  })().catch(() => {});
  return events;
}

test('health reads reuse the connected gateway heartbeat without requesting config', async (t) => {
  let time = 1000;
  const pong = deferred();
  const app = await startApplication(t, { now: () => time, pingIntervalMs: 50,
    onPing(ws, data) { time += 42; ws.pong(data); pong.resolve(); }
  });
  await app.login('A');
  await pong.promise;
  await sleep(10);
  const health = await app.request('GET', '/api/health');
  assert.equal(health.data.latencyMs, 42);
  assert.equal(health.data.ok, true);
  assert.equal(app.healthRequests.length, 0, '已有心跳延迟时不请求 /config');
});

test('SSE viewers receive changing heartbeat latency without HTTP probes', async (t) => {
  let time = 1000;
  let latency = 42;
  const pong = deferred();
  const app = await startApplication(t, { now: () => time, pingIntervalMs: 50,
    onPing(ws, data) { time += latency; ws.pong(data); pong.resolve(); }
  });
  await app.login('A');
  await pong.promise;
  await sleep(10);
  const events = await healthStream(t, app);
  await waitFor(() => events.at(-1), health => health?.latencyMs === 42);
  assert.equal(app.healthRequests.length, 0, '打开 SSE 不触发 /config');
  latency = 17;
  await waitFor(() => events.at(-1), health => health?.latencyMs === 17);
  assert.equal(app.healthRequests.length, 0, '每次心跳更新继续复用现有连接');
});

test('SSE viewers fall back to HTTP latency when the gateway connection is lost', async (t) => {
  let time = 1000;
  let gateway;
  let responding = true;
  const pong = deferred();
  const app = await startApplication(t, { now: () => time, pingIntervalMs: 50,
    onPing(ws, data) {
      if (!responding) return;
      gateway = ws; time += 42; ws.pong(data); pong.resolve();
    }
  });
  await app.login('A');
  await pong.promise;
  await sleep(10);
  const events = await healthStream(t, app);
  await waitFor(() => events.at(-1), health => health?.latencyMs === 42);
  responding = false;
  gateway.terminate();
  await waitFor(() => events.at(-1), health => health?.latencyMs === 0);
  assert.equal(app.healthRequests.length, 1, '断线后通过公开 /config 补测一次');
});

test('a pending HTTP probe cannot overwrite a heartbeat that becomes available first', async (t) => {
  let time = 1000;
  const pong = deferred();
  const app = await startApplication(t, { now: () => time, pingIntervalMs: 50,
    onPing(ws, data) { time += 42; ws.pong(data); pong.resolve(); }
  });
  const held = app.holdNext(req => req.path === '/api/1/config');
  const reading = app.request('GET', '/api/health');
  await held.started;
  await app.login('A');
  await pong.promise;
  await sleep(10);
  const events = await healthStream(t, app);
  await waitFor(() => events.at(-1), health => health?.latencyMs === 42);
  const before = events.length;
  time += 100;
  held.release();
  assert.equal((await reading).data.latencyMs, 42, 'HTTP 响应继续优先返回心跳延迟');
  await waitFor(() => events.length, count => count > before);
  assert.equal(events.at(-1).latencyMs, 42, 'HTTP 采样完成时也不覆盖 SSE 的心跳值');
});

test('an existing SSE subscription resumes periodic HTTP latency after API logout without another read', async (t) => {
  const pong = deferred();
  const app = await startApplication(t, { pingIntervalMs: 50, healthIntervalMs: 50,
    onPing(ws, data) { ws.pong(data); pong.resolve(); }
  });
  await app.login('A');
  await pong.promise;
  await sleep(10);
  const events = await healthStream(t, app);
  await waitFor(() => events.length, count => count > 0);
  const before = events.length;
  assert.equal(app.healthRequests.length, 0);
  await app.request('POST', '/api/logout', {});
  await waitFor(() => app.healthRequests.length, count => count >= 2, 500);
  assert.ok(events.length > before, '原有 SSE 订阅继续收到 HTTP 延迟结果');
});

test('API latency is idle without a frontend and reads use the shared 5 minute cache', async (t) => {
  let time = Date.now();
  const app = await startApplication(t, { now: () => time });
  await app.login('A');
  await sleep(30);
  assert.equal(app.healthRequests.length, 0, '登录和好友监控不触发延迟探测');
  await app.request('POST', '/api/logout', {});
  await sleep(30);
  assert.equal(app.healthRequests.length, 0, '无 SSE 订阅时注销也不启动 HTTP 探测');
  const initial = await app.request('GET', '/api/health');
  assert.equal(initial.data.ok, true);
  assert.equal(app.healthRequests.length, 1);
  time += 4 * 60 * 1000;
  await Promise.all(Array.from({ length: 5 }, () => app.request('GET', '/api/health')));
  assert.equal(app.healthRequests.length, 1, '反复读取不增加上游请求');
  time += 60 * 1000;
  const next = await app.request('GET', '/api/health');
  assert.equal(next.data.ok, true);
  assert.ok(next.data.updatedAt > initial.data.updatedAt);
  assert.equal(app.healthRequests.length, 2, '过期后只刷新一次');
});

test('switching accounts keeps the new friends when an old snapshot finally returns', async (t) => {
  const app = await startApplication(t);
  await app.login('A');
  const held = app.holdNext((req) => req.path === '/api/1/auth/user' && req.name === 'A' && !req.basic);
  const snapshot = app.request('POST', '/api/monitor/snapshot', {});
  await held.started;
  await app.request('POST', '/api/logout', {});
  await app.login('B');
  assert.deepEqual((await app.request('GET', '/api/friends')).data.friends.map((f) => f.friend_vrchat_id), ['usr_friend_B']);
  held.release(); await snapshot;
  assert.deepEqual((await app.request('GET', '/api/friends')).data.friends.map((f) => f.friend_vrchat_id), ['usr_friend_B']);
});

test('logging back into the same account starts a fresh snapshot while the old one is pending', async (t) => {
  const app = await startApplication(t);
  await app.login('A');
  const held = app.holdNext((req) => req.path === '/api/1/auth/user' && req.name === 'A' && !req.basic);
  const snapshot = app.request('POST', '/api/monitor/snapshot', {});
  await held.started;
  await app.request('POST', '/api/logout', {});
  await app.login('A');
  const fresh = (await app.request('GET', '/api/friends')).data.friends.map((f) => f.friend_vrchat_id);
  held.release(); await snapshot;
  assert.deepEqual(fresh, ['usr_friend_A']);
});


test('clearing QQ settings on logout closes the old robot gateway', async (t) => {
  const qqPlatform = await startQqPlatform(t);
  const app = await startApplication(t, { qqPlatform });
  await app.login('A');
  await app.request('PUT', '/api/settings', { qq_enabled: 1, qq_app_id: 'mock-app', qq_app_secret: 'mock-secret' });
  await waitFor(() => app.request('GET', '/api/status'), (r) => r.data.qq.connected);
  const closed = once(qqPlatform.connections[0], 'close').then(() => true);
  await app.request('POST', '/api/logout', { clearSettings: true });
  assert.equal(await Promise.race([closed, sleep(150).then(() => false)]), true);
});

test('logging in again restores the saved QQ configuration and reconnects its gateway', async (t) => {
  const qqPlatform = await startQqPlatform(t);
  const app = await startApplication(t, { qqPlatform });
  await app.login('A');
  await app.request('PUT', '/api/settings', { qq_enabled: 1, qq_app_id: 'mock-app', qq_app_secret: 'mock-secret' });
  await waitFor(() => app.request('GET', '/api/status'), (r) => r.data.qq.connected);
  qqPlatform.connections[0].send(JSON.stringify({ op: 0, s: 2, t: 'C2C_MSG_RECEIVE', d: { author: { user_openid: 'bound-user' } } }));
  await waitFor(() => app.request('GET', '/api/status'), (r) => r.data.qq.bound?.openid === 'bound-user');
  await app.request('POST', '/api/logout', {});
  await app.login('A');
  const saved = (await app.request('GET', '/api/settings')).data.settings;
  const status = (await app.request('GET', '/api/status')).data;
  assert.deepEqual({ enabled: saved.qq_enabled, configured: status.qq.configured }, { enabled: 1, configured: true });
  await waitFor(() => app.request('GET', '/api/status'), (r) => r.data.qq.connected);
  const sent = await app.request('POST', '/api/test/qq', {});
  assert.equal(sent.status, 200);
  assert.ok(qqPlatform.messages.some((m) => m.markdown?.content.includes('测试好友')), 'restored bot delivers a notification to the QQ peer');
});

test('switching accounts directly retires the old QQ gateway before restoring the saved configuration', async (t) => {
  const qqPlatform = await startQqPlatform(t);
  const app = await startApplication(t, { qqPlatform });
  await app.login('A');
  await app.request('PUT', '/api/settings', { qq_enabled: 1, qq_app_id: 'mock-app', qq_app_secret: 'mock-secret' });
  await waitFor(() => app.request('GET', '/api/status'), (r) => r.data.qq.connected);
  const closed = once(qqPlatform.connections[0], 'close').then(() => true);
  await app.login('B');
  await waitFor(() => app.request('GET', '/api/status'), (r) => r.data.qq.connected);
  assert.equal(await Promise.race([closed, sleep(150).then(() => false)]), true);
});

test('logout stays effective when an in-flight automatic password login succeeds', async (t) => {
  const app = await startApplication(t);
  await app.login('A');
  const held = app.holdNext((req) => req.path === '/api/1/auth/user' && req.name === 'A' && req.basic);
  app.expireCookie('A');
  const snapshot = app.request('POST', '/api/monitor/snapshot', {});
  await held.started; await snapshot;
  await app.request('POST', '/api/logout', {});
  held.release();
  const deadline = Date.now() + 150;
  do {
    assert.equal((await app.request('GET', '/api/session')).data.loggedIn, false);
    await sleep(10);
  } while (Date.now() < deadline);
});

test('a pending automatic login cannot replace a newer explicit account login', async (t) => {
  const app = await startApplication(t);
  await app.login('A');
  const held = app.holdNext((req) => req.path === '/api/1/auth/user' && req.name === 'A' && req.basic);
  app.expireCookie('A');
  const snapshot = app.request('POST', '/api/monitor/snapshot', {});
  await held.started; await snapshot;
  await app.login('B');
  held.release();
  const deadline = Date.now() + 150;
  do {
    assert.equal((await app.request('GET', '/api/session')).data.user.vrchat_user_id, 'usr_B');
    await sleep(10);
  } while (Date.now() < deadline);
});

test('logout cancels a pending password login even before a session has been created', async (t) => {
  const app = await startApplication(t);
  const held = app.holdNext((req) => req.path === '/api/1/auth/user' && req.name === 'A' && req.basic);
  const login = app.login('A');
  await held.started;
  await app.request('POST', '/api/logout', {});
  held.release();
  const result = await login;
  const session = (await app.request('GET', '/api/session')).data;
  assert.deepEqual({ status: result.status, loggedIn: session.loggedIn }, { status: 409, loggedIn: false });
});

test('logout during saved-cookie recovery cancels recovery and prevents the next session poll from logging in', async (t) => {
  const app = await startApplication(t);
  await app.login('A');
  app.invalidateSession('A');
  await app.request('POST', '/api/monitor/snapshot', {});
  const held = app.holdNext((req) => req.path === '/api/1/auth/user' && req.name === 'A' && !req.basic);
  const recovery = app.request('GET', '/api/session');
  await held.started;
  await app.request('POST', '/api/logout', {});
  held.release(); await recovery;
  assert.equal((await app.request('GET', '/api/session')).data.loggedIn, false);
});

test('a two-factor verification already in flight cannot create a session after logout', async (t) => {
  const app = await startApplication(t);
  app.requireTwoFactor('A');
  const login = await app.login('A');
  const held = app.holdNext((req) => req.path.endsWith('/verify'));
  const verification = app.request('POST', '/api/login/2fa', { tempSessionId: login.data.tempSessionId, code: '123456', kind: 'emailOtp' });
  await held.started;
  await app.request('POST', '/api/logout', {});
  held.release();
  const result = await verification;
  assert.deepEqual({ status: result.status, loggedIn: (await app.request('GET', '/api/session')).data.loggedIn }, { status: 409, loggedIn: false });
});

test('logout cancels verification of an automatic login waiting for two-factor authentication', async (t) => {
  const app = await startApplication(t);
  await app.login('A');
  app.requireTwoFactor('A'); app.expireCookie('A');
  await app.request('POST', '/api/monitor/snapshot', {});
  const held = app.holdNext((req) => req.path.endsWith('/verify'));
  const verification = waitFor(() => app.request('POST', '/api/relogin/2fa', { code: '123456' }), (r) => r.data.error !== '没有待验证的登录会话');
  await held.started;
  await app.request('POST', '/api/logout', {});
  held.release();
  const result = await verification;
  assert.deepEqual({ accepted: result.data.ok === true, loggedIn: (await app.request('GET', '/api/session')).data.loggedIn }, { accepted: false, loggedIn: false });
});
