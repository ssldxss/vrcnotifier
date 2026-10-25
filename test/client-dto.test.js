'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClientDtos } = require('../src/client-dto');

test('public DTOs exclude internal and future database columns', () => {
  const dto = createClientDtos();
  const row = { friend_vrchat_id: 'usr_a', state: 'offline', pending_state: 'online',
    notify_online: 1, password: 'secret', cookie_data: 'cookie', saved_username: 'saved', future_private: 'hidden' };
  const friend = dto.friendRow(row);
  assert.equal(friend.display_state, 'online');
  assert.equal(friend.pending, true);
  assert.equal(friend.pending_label, '可能在线');
  assert.equal(friend.config.notify_online, 1);
  assert.equal(Object.hasOwn(friend, 'notify_online'), false, 'configuration has one public location');
  for (const value of [friend, dto.selfUserForClient(row), dto.eventRow(row)]) {
    for (const key of ['password', 'cookie_data', 'saved_username', 'future_private']) assert.equal(Object.hasOwn(value, key), false);
  }
});
