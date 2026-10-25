'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFriendConfig, parseSettings } = require('../src/api-contract');

test('config patches normalize both naming styles and reject ambiguous values', () => {
  assert.deepEqual(parseFriendConfig({ notify_online: false, notifyWebOnline: 1 }), { notify_online: 0, notify_web_online: 1 });
  assert.deepEqual(parseFriendConfig({ notify_online: 1, notifyOnline: true }), { notify_online: 1 });
  for (const body of [{ notifyOnline: 'false' }, { notify_online: null }, { favorite: 2 },
    { notify_online: 0, notifyOnline: 1 }, { typo: 1 }, [], null]) {
    assert.throws(() => parseFriendConfig(body), { status: 400 });
  }
});

test('settings reject non-integer retention and non-boolean toggles', () => {
  assert.deepEqual(parseSettings({ friendEventLimit: 1e5, qqEnabled: false, qqAppSecret: '' }), {
    qq_enabled: 0, qq_app_secret: null, friend_event_limit: 100000
  });
  assert.deepEqual(parseSettings({ friend_event_limit: null }), { friend_event_limit: null });
  for (const body of [{ qq_enabled: 2 }, { qq_enabled: '0' }, { friend_event_limit: 0 },
    { friend_event_limit: -1 }, { friend_event_limit: 1.2 }, { friend_event_limit: '100' },
    { friend_event_limit: Infinity }, { friend_event_limit: '' }, { qq_app_id: {} }]) {
    assert.throws(() => parseSettings(body), { status: 400 });
  }
});
