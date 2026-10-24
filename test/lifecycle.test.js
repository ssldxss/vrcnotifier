'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApplication } = require('./helpers/lifecycle');

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
