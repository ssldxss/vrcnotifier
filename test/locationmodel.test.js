'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitLocation, locationOf } = require('../public/locationmodel');
const { parseLocation: backend } = require('../src/location');
const { parseLocation: frontend } = require('../public/instance');

test('location splitting is consistent across storage, backend validation and frontend display', () => {
  for (const raw of ['wrld_a:1~friends(usr_a)~region(jp)', 'wrld_a:', 'wrld_a']) {
    const parts = splitLocation(raw);
    assert.deepEqual(frontend(raw), parts);
    assert.equal(backend(raw).worldId, parts.worldId);
    assert.equal(backend(raw).instanceId, parts.instanceId);
    assert.deepEqual(splitLocation(locationOf(parts.worldId, parts.instanceId)), parts);
  }
  for (const raw of [null, '', ':', 'garbage', 'private', 'traveling', 'offline']) assert.equal(backend(raw).isReal, false);
});
