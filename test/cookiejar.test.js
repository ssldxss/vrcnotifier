const test = require('node:test');
const assert = require('node:assert');
const { CookieJar } = require('../src/cookiejar');

test('parses Set-Cookie and returns header for matching host', () => {
  const jar = new CookieJar();
  jar.setCookies(['auth=abc123; Path=/; Domain=.vrchat.cloud; HttpOnly', 'twoFactorAuth=xyz; Path=/; Domain=.vrchat.cloud'], 'https://api.vrchat.cloud/auth/user');
  const h = jar.cookieHeader('https://api.vrchat.cloud/auth/user');
  assert.ok(h.includes('auth=abc123'));
  assert.ok(h.includes('twoFactorAuth=xyz'));
  assert.ok(!h.includes('HttpOnly'));
});

test('respects domain matching (subdomain vs other host)', () => {
  const jar = new CookieJar();
  jar.setCookies(['a=1; Domain=.vrchat.cloud'], 'https://api.vrchat.cloud/x');
  assert.ok(jar.cookieHeader('https://api.vrchat.cloud/x').includes('a=1'));
  assert.equal(jar.cookieHeader('https://evil.example.com/x'), '');
});

test('does not send expired cookies', () => {
  const jar = new CookieJar();
  jar.setCookies(['gone=1; Expires=Thu, 01 Jan 2000 00:00:00 GMT'], 'https://api.vrchat.cloud/x');
  assert.equal(jar.cookieHeader('https://api.vrchat.cloud/x'), '');
});

test('respects path prefix', () => {
  const jar = new CookieJar();
  jar.setCookies(['p=1; Path=/auth'], 'https://api.vrchat.cloud/auth/user');
  assert.ok(jar.cookieHeader('https://api.vrchat.cloud/auth/user').includes('p=1'));
  assert.equal(jar.cookieHeader('https://api.vrchat.cloud/other'), '');
});

test('serialize/deserialize roundtrip', () => {
  const jar = new CookieJar();
  jar.setCookies(['auth=abc; Domain=.vrchat.cloud; HttpOnly; Path=/'], 'https://api.vrchat.cloud/a');
  const json = jar.serialize();
  const jar2 = CookieJar.deserialize(json);
  assert.ok(jar2.cookieHeader('https://api.vrchat.cloud/a').includes('auth=abc'));
});

test('setCookies accepts string or array, skips malformed', () => {
  const jar = new CookieJar();
  jar.setCookies('a=1; Path=/', 'https://x.com/');
  jar.setCookies(['b=2; Path=/', 'garbage-no-equals'], 'https://x.com/');
  const h = jar.cookieHeader('https://x.com/');
  assert.ok(h.includes('a=1'));
  assert.ok(h.includes('b=2'));
});
