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
  await app.request('POST', '/api/logout', {});
  await app.login('A');
  const saved = (await app.request('GET', '/api/settings')).data.settings;
  const status = (await app.request('GET', '/api/status')).data;
  assert.deepEqual({ enabled: saved.qq_enabled, configured: status.qq.configured }, { enabled: 1, configured: true });
  await waitFor(() => app.request('GET', '/api/status'), (r) => r.data.qq.connected);
});
