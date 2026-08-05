const test = require('node:test');
const assert = require('node:assert');
const { parseLocation, isRealLocation } = require('../src/location');

test('parses real instance with region and nonce', () => {
  const L = parseLocation('wrld_abc:12345~region(us)~nonce(xyz)');
  assert.equal(L.worldId, 'wrld_abc');
  assert.equal(L.instanceId, '12345~region(us)~nonce(xyz)');
  assert.equal(L.flags.region, 'us');
  assert.equal(L.flags.nonce, 'xyz');
  assert.equal(L.isReal, true);
});

test('parses hidden/friends/private/canRequestInvite/group/ageGate flags', () => {
  const L = parseLocation('wrld_abc:7~hidden(usr_x)~canRequestInvite~ageGate');
  assert.equal(L.flags.hidden, 'usr_x');
  assert.equal(L.flags.canRequestInvite, true);
  assert.equal(L.flags.ageGate, true);
  const G = parseLocation('wrld_g:1~group(grp_z)~groupAccessType(plus)');
  assert.equal(G.flags.group, 'grp_z');
  assert.equal(G.flags.groupAccessType, 'plus');
});

test('sentinels are not real', () => {
  assert.equal(isRealLocation('offline'), false);
  assert.equal(isRealLocation('private'), false);
  assert.equal(isRealLocation('traveling'), false);
  assert.equal(isRealLocation(''), false);
  for (const s of ['offline', 'private', 'traveling', '']) {
    const L = parseLocation(s);
    assert.equal(L.isReal, false);
  }
  assert.equal(parseLocation('private').kind, 'private');
  assert.equal(parseLocation('offline').kind, 'offline');
});

test('handles empty instanceId and garbled input without throwing', () => {
  assert.equal(parseLocation('wrld_abc:').worldId, 'wrld_abc');
  assert.equal(parseLocation(undefined).isReal, false);
  assert.equal(parseLocation(null).isReal, false);
  assert.equal(parseLocation(123).isReal, false);
});
