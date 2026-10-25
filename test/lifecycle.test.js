'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { startApplication, startQqPlatform, waitFor, sleep } = require('./helpers/lifecycle');

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
