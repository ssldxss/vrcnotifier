const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createVrcApi } = require('../src/vrcapi');

/** 启动 mock VRChat API 服务器 */
function startMockApi(handlers) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const handler = handlers[path];
    if (!handler) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: '"Not Found"', status_code: 404 } })); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handler({ req, url, body, json: () => (body ? JSON.parse(body) : {}) }, res));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const records = []; // 记录请求: {path, authHeader, cookieHeader, body}

function api(server) {
  return createVrcApi({
    baseUrl: `http://127.0.0.1:${server.address().port}/api/1`,
    userAgent: 'vrcnotifier-test/1.0',
    cookieJar: null // vrcapi 内部创建
  });
}

test('login sends Basic auth with separately url-encoded credentials and saves cookies', async () => {
  records.length = 0;
  const server = await startMockApi({
    '/api/1/auth/user': ({ req }, res) => {
      records.push({ path: 'login', authHeader: req.headers.authorization || '', cookieHeader: req.headers.cookie || '' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'auth=abc123; Path=/; HttpOnly' });
      res.end(JSON.stringify({ id: 'usr_1', displayName: 'Test', username: 'tester' }));
    }
  });
  try {
    const v = api(server);
    const user = await v.login('my name', 'p@ss word');
    assert.equal(user.id, 'usr_1');
    assert.equal(records[0].authHeader, 'Basic ' + Buffer.from(encodeURIComponent('my name') + ':' + encodeURIComponent('p@ss word')).toString('base64'));
    // cookie 已被吸收: 下一次请求带 cookie
    records.length = 0;
    const me = await v.me();
    assert.equal(me.id, 'usr_1');
    assert.ok(records[0].cookieHeader.includes('auth=abc123'));
  } finally { server.close(); }
});

test('login returning requiresTwoFactorAuth exposes it; verify2fa sends no Authorization', async () => {
  records.length = 0;
  const server = await startMockApi({
    '/api/1/auth/user': ({ req }, res) => {
      if (req.headers.cookie) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'usr_1', displayName: 'Test' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'auth=tmp; Path=/' });
      res.end(JSON.stringify({ id: 'usr_1', displayName: 'Test', requiresTwoFactorAuth: ['emailOtp'] }));
    },
    '/api/1/auth/twofactorauth/emailotp/verify': ({ req, body }, res) => {
      records.push({ path: '2fa', authHeader: req.headers.authorization || '', body: body ? JSON.parse(body) : null });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'twoFactorAuth=ttt; Path=/' });
      res.end(JSON.stringify({ verified: true }));
    }
  });
  try {
    const v = api(server);
    const first = await v.login('u', 'p');
    assert.ok(first.requiresTwoFactorAuth.includes('emailOtp'));
    const verified = await v.verify2fa('emailotp', '123456');
    assert.equal(verified.verified, true);
    assert.equal(records[0].authHeader, ''); // 2FA 不带 Basic
    assert.equal(records[0].body.code, '123456');
  } finally { server.close(); }
});

test('login preserves real requiresTwoFactorAuth kinds from 401 error body', async () => {
  records.length = 0;
  const server = await startMockApi({
    '/api/1/auth/user': (h, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '2FA is required.', status_code: 401 }, requiresTwoFactorAuth: ['totp', 'otp'] }));
    }
  });
  try {
    const v = api(server);
    const r = await v.login('u', 'p');
    assert.ok(Array.isArray(r.requiresTwoFactorAuth));
    assert.deepEqual(r.requiresTwoFactorAuth, ['totp', 'otp']);
  } finally { server.close(); }
});

test('friends paginates until short page; world returns name; authToken returns token', async () => {
  records.length = 0;
  const server = await startMockApi({
    '/api/1/auth/user/friends': ({ url }, res) => {
      const offset = Number(url.searchParams.get('offset') || 0);
      const n = Number(url.searchParams.get('n') || 100);
      const all = Array.from({ length: 5 }, (_, i) => ({ id: `usr_${i}`, displayName: `F${i}`, location: 'offline', status: 'active' }));
      const page = all.slice(offset, offset + n);
      records.push({ path: 'friends', offset });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(page));
    },
    '/api/1/worlds/wrld_a': (h, res) => { records.push({ path: 'world' }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'wrld_a', name: '咖啡厅' })); },
    '/api/1/auth': (h, res) => { records.push({ path: 'auth' }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, token: 'authcookie_x' })); }
  });
  try {
    const v = api(server);
    const friends = await v.friends({ offline: false });
    assert.equal(friends.length, 5);
    assert.deepEqual(records.map((r) => r.offset), [0]); // 5 < 100, 单页
    const w = await v.world('wrld_a');
    assert.equal(w.name, '咖啡厅');
    const t = await v.authToken();
    assert.equal(t.token, 'authcookie_x');
  } finally { server.close(); }
});

test('user(id) calls GET /users/{id} and returns profile', async () => {
  records.length = 0;
  const server = await startMockApi({
    '/api/1/users/usr_a': ({ req }, res) => {
      records.push({ path: 'user', cookieHeader: req.headers.cookie || '' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'auth=me; Path=/' });
      res.end(JSON.stringify({ id: 'usr_a', displayName: 'A', state: 'online', location: 'wrld_x:1' }));
    }
  });
  try {
    const v = api(server);
    const u = await v.user('usr_a');
    assert.equal(u.id, 'usr_a');
    assert.equal(u.state, 'online');
    assert.equal(records[0].path, 'user');
  } finally { server.close(); }
});

test('user(id) inherits transient retry/backoff like other endpoints', async () => {
  const { impl, calls } = fakeFetch({ throwTimes: 1, body: JSON.stringify({ id: 'usr_a' }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  const u = await v.user('usr_a');
  assert.equal(u.id, 'usr_a');
  assert.equal(calls.n, 2, '网络错误应退避重试一次');
});

test('user(id) noRetry throws immediately', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [401], body: JSON.stringify({ error: { message: 'Missing Credentials', status_code: 401 } }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  await assert.rejects(() => v.user('usr_a', { noRetry: true }), (err) => err.status === 401);
  assert.equal(calls.n, 1);
});

test('4xx responses throw ApiError with status', async () => {
  records.length = 0;
  const server = await startMockApi({
    '/api/1/auth/user': (h, res) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: '"Missing Credentials"', status_code: 401 } })); }
  });
  try {
    const v = api(server);
    await assert.rejects(() => v.me({ noRetry: true }), (err) => err.status === 401 && err.message.includes('Missing Credentials'));
  } finally { server.close(); }
});

// programmable fetch: throwTimes times throw network errors, badStatuses return bad status codes in order, otherwise okStatus
function fakeFetch({ throwTimes = 0, badStatuses = [], okStatus = 200, body = '{}' } = {}) {
  const calls = { n: 0 };
  const impl = async () => {
    calls.n++;
    if (calls.n <= throwTimes) throw new Error('network down');
    const status = badStatuses[calls.n - 1 - throwTimes] ?? okStatus;
    return { status, headers: { getSetCookie: () => [] }, text: async () => body };
  };
  return { impl, calls };
}

test('network error is retried once then succeeds', async () => {
  const { impl, calls } = fakeFetch({ throwTimes: 1, body: JSON.stringify({ id: 'usr_1' }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  const me = await v.me();
  assert.equal(me.id, 'usr_1');
  assert.equal(calls.n, 2);
});

test('5xx is retried once then succeeds', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [503], body: JSON.stringify({ id: 'usr_1' }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  const me = await v.me();
  assert.equal(me.id, 'usr_1');
  assert.equal(calls.n, 2);
});

test('429 is retried with backoff then succeeds', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [429], body: JSON.stringify({ id: 'usr_1' }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  const me = await v.me();
  assert.equal(me.id, 'usr_1');
  assert.equal(calls.n, 2, '429 应退避重试');
});

test('401 is NOT transient: fails fast so the relogin/2FA branch is reachable', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [401], body: JSON.stringify({ id: 'usr_1' }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  await assert.rejects(() => v.me(), (err) => err.status === 401, '401 是会话状态问题, 不当临时错误重试');
  assert.equal(calls.n, 1, '401 不重试, 立即失败交给上层处理');
});

test('401 with noRetry throws immediately (login/auth flows)', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [401], body: JSON.stringify({ error: { message: 'Missing Credentials', status_code: 401 } }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  await assert.rejects(() => v.me({ noRetry: true }), (err) => err.status === 401);
  assert.equal(calls.n, 1);
});

test('retries respect maxRetries then throw', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [429, 503, 503], body: JSON.stringify({ error: { message: 'x', status_code: 503 } }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  await assert.rejects(() => v.me({ maxRetries: 2 }), (err) => err.status === 503);
  assert.equal(calls.n, 3);
});

test('default retry count is bounded (maxRetries=5 default)', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [503, 503, 503, 503, 503, 503, 503], body: JSON.stringify({ error: { message: 'down', status_code: 503 } }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  await assert.rejects(() => v.me(), (err) => err.status === 503);
  assert.equal(calls.n, 6, '默认 5 次重试 + 1 次初始 = 6 次请求后放弃');
});

test('rate limiter: sliding window of ratePerMinute per minute', async () => {
  let fakeT = 1000000;
  const slept = [];
  const { impl, calls } = fakeFetch({ body: JSON.stringify({ id: 'usr_1' }) });
  const v = createVrcApi({
    baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl,
    retryBaseMs: 1, jitterMs: 0, ratePerMinute: 2,
    now: () => fakeT,
    sleep: (ms) => { slept.push(ms); fakeT += ms; return Promise.resolve(); }
  });
  await v.me(); // 窗口内第 1 个
  await v.me(); // 窗口内第 2 个
  await v.me(); // 窗口满 → 必须等到窗口滑动才放行
  assert.equal(calls.n, 3);
  assert.ok(slept.length >= 1 && slept[0] >= 59000, `第 3 个请求应节流到窗口滑动(实际 slept=${JSON.stringify(slept)})`);
});

test('rate limiter: window slides after 60s and allows more requests', async () => {
  let fakeT = 1000000;
  const { impl, calls } = fakeFetch({ body: JSON.stringify({ id: 'usr_1' }) });
  const v = createVrcApi({
    baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl,
    retryBaseMs: 1, jitterMs: 0, ratePerMinute: 1,
    now: () => fakeT,
    sleep: (ms) => { fakeT += ms; return Promise.resolve(); }
  });
  await v.me(); // t=1e6
  fakeT += 61000; // 61 秒后, 窗口已滑动
  await v.me(); // 放行
  assert.equal(calls.n, 2);
});

test('onCookiesChanged fires when response sets cookies', async () => {
  records.length = 0;
  const changed = [];
  const server = await startMockApi({
    '/api/1/auth': ({ req }, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'auth=rotated; Path=/; HttpOnly' });
      res.end(JSON.stringify({ token: 'tok_123' }));
    }
  });
  try {
    const v = api(server);
    v.setCookiesChanged((jar) => changed.push(jar.serialize()));
    await v.authToken();
    assert.equal(changed.length, 1, 'callback fired once');
    assert.ok(changed[0].includes('rotated'));
  } finally { server.close(); }
});

test('every api call logs the endpoint', async () => {
  records.length = 0;
  const logs = [];
  const logger = { info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) };
  const server = await startMockApi({
    '/api/1/auth/user': ({ req }, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'usr_1', displayName: 'T' }));
    },
    '/api/1/auth/user/friends': ({ req }, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
  });
  try {
    const v = createVrcApi({ baseUrl: 'http://127.0.0.1:' + server.address().port + '/api/1', userAgent: 't/1', logger });
    await v.me();
    await v.friends({ offline: false });
    const joined = logs.map((l) => l.slice(1).join(' ')).join('\n');
    assert.ok(joined.includes('GET /auth/user'), 'logs me endpoint');
    assert.ok(joined.includes('GET /auth/user/friends'), 'logs friends endpoint');
  } finally { server.close(); }
});
