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

test('serialize/deserialize keeps exact expires (incl. epoch 0)', () => {
  const jar = new CookieJar();
  jar.setCookies(['auth=abc; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/'], 'https://api.vrchat.cloud/a');
  assert.equal(jar.cookies[0].expires, 0, 'epoch 时间戳应解析为 0 而不是丢失');
  const jar2 = CookieJar.deserialize(jar.serialize());
  assert.equal(jar2.cookies[0].expires, 0, 'expires=0(已过期)反序列化后必须保留');
  assert.equal(jar2.cookieHeader('https://api.vrchat.cloud/a'), '', '过期 cookie 不发送');
});

test('setCookies accepts string or array, skips malformed', () => {
  const jar = new CookieJar();
  jar.setCookies('a=1; Path=/', 'https://x.com/');
  jar.setCookies(['b=2; Path=/', 'garbage-no-equals'], 'https://x.com/');
  const h = jar.cookieHeader('https://x.com/');
  assert.ok(h.includes('a=1'));
  assert.ok(h.includes('b=2'));
});

test('replaces same-name same-domain same-path cookie with new value', () => {
  const jar = new CookieJar();
  jar.setCookies(['auth=cookie_A; Path=/; Domain=api.vrchat.cloud'], 'https://api.vrchat.cloud/x');
  jar.setCookies(['auth=cookie_B; Path=/; Domain=api.vrchat.cloud'], 'https://api.vrchat.cloud/y');
  assert.equal(jar.cookies.length, 1);
  assert.equal(jar.cookieHeader('https://api.vrchat.cloud/z'), 'auth=cookie_B');
  assert.ok(!jar.cookieHeader('https://api.vrchat.cloud/z').includes('cookie_A'));
});

test('keeps distinct cookies when name or path differs', () => {
  const jar = new CookieJar();
  jar.setCookies(['auth=one; Path=/; Domain=api.vrchat.cloud'], 'https://api.vrchat.cloud/x');
  jar.setCookies(['auth=two; Path=/auth; Domain=api.vrchat.cloud'], 'https://api.vrchat.cloud/y');
  jar.setCookies(['other=three; Path=/; Domain=api.vrchat.cloud'], 'https://api.vrchat.cloud/y');
  assert.equal(jar.cookies.length, 3);
});
