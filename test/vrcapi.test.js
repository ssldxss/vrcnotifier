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

test('401 is retried with backoff then succeeds', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [401], body: JSON.stringify({ id: 'usr_1' }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  const me = await v.me();
  assert.equal(me.id, 'usr_1');
  assert.equal(calls.n, 2, '401 应退避重试');
});

test('401 with noRetry throws immediately (login/auth flows)', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [401], body: JSON.stringify({ error: { message: 'Missing Credentials', status_code: 401 } }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  await assert.rejects(() => v.me({ noRetry: true }), (err) => err.status === 401);
  assert.equal(calls.n, 1);
});

test('retries respect maxRetries then throw', async () => {
  const { impl, calls } = fakeFetch({ badStatuses: [401, 429, 503], body: JSON.stringify({ error: { message: 'x', status_code: 401 } }) });
  const v = createVrcApi({ baseUrl: 'https://api.vrchat.cloud/api/1', userAgent: 't/1', cookieJar: null, fetchImpl: impl, retryBaseMs: 1, jitterMs: 0 });
  await assert.rejects(() => v.me({ maxRetries: 2 }), (err) => err.status === 503);
  assert.equal(calls.n, 3);
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
    },
    '/api/1/users/usr_1': ({ req }, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'usr_1', state: 'active' }));
    }
  });
  try {
    const v = createVrcApi({ baseUrl: 'http://127.0.0.1:' + server.address().port + '/api/1', userAgent: 't/1', logger });
    await v.me();
    await v.friends({ offline: false });
    await v.self('usr_1');
    const joined = logs.map((l) => l.slice(1).join(' ')).join('\n');
    assert.ok(joined.includes('GET /auth/user'), 'logs me endpoint');
    assert.ok(joined.includes('GET /auth/user/friends'), 'logs friends endpoint');
    assert.ok(joined.includes('GET /users/usr_1'), 'logs self endpoint');
  } finally { server.close(); }
});

test('self fetches /users/{id} with real state field', async () => {
  records.length = 0;
  const server = await startMockApi({
    '/api/1/users/usr_abc': ({ req }, res) => {
      records.push({ path: '/api/1/users/usr_abc' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'usr_abc', state: 'active', status: 'join me', statusDescription: 'test desc' }));
    }
  });
  try {
    const v = api(server);
    const me = await v.self('usr_abc');
    assert.equal(me.id, 'usr_abc');
    assert.equal(me.state, 'active');
    assert.equal(me.statusDescription, 'test desc');
    assert.ok(records.some((r) => r.path === '/api/1/users/usr_abc'), 'hits /users/{id}');
  } finally { server.close(); }
});
