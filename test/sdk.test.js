'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Client: VrcNotifierClient, ApiError, DEFAULT_BASE } = require('../public/sdk');

function makeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m)
  };
}

function makeFetch(responder) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    calls.push(call);
    const r = responder(call);
    return new Response(JSON.stringify(r.data || {}), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}

function makeEventSourceClass() {
  const instances = [];
  class MockEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.closed = false;
      instances.push(this);
    }
    addEventListener(name, fn) {
      (this.listeners[name] = this.listeners[name] || []).push(fn);
    }
    emit(name, data) {
      const e = { data: typeof data === 'string' ? data : JSON.stringify(data) };
      for (const fn of this.listeners[name] || []) fn(e);
    }
    emitMessage(data) {
      const e = { data: typeof data === 'string' ? data : JSON.stringify(data) };
      if (this.onmessage) this.onmessage(e);
    }
    close() { this.closed = true; }
  }
  MockEventSource.instances = instances;
  return MockEventSource;
}

test('constructor: baseUrl/token from storage by default, explicit opts win', () => {
  const storage = makeStorage({ vrcn_base: 'http://x:9000/', vrcn_token: 'tok-a' });
  const c = new VrcNotifierClient({ storage, fetchImpl: async () => new Response('{}') });
  assert.equal(c.baseUrl, 'http://x:9000');
  assert.equal(c.token, 'tok-a');
  const c2 = new VrcNotifierClient({ baseUrl: 'http://y:3000', token: 'tok-b', storage, fetchImpl: async () => new Response('{}') });
  assert.equal(c2.baseUrl, 'http://y:3000');
  assert.equal(c2.token, 'tok-b');
  const c3 = new VrcNotifierClient({ storage: makeStorage(), fetchImpl: async () => new Response('{}') });
  assert.equal(c3.baseUrl, DEFAULT_BASE);
});

test('request: sends bearer token, json body and query', async () => {
  const fetch = makeFetch(() => ({ data: { ok: true } }));
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 'tok', fetchImpl: fetch });
  await c.request('PUT', '/api/settings', { body: { email: 'a@b.c' } });
  const call = fetch.calls[0];
  assert.equal(call.url, 'http://127.0.0.1:3000/api/settings');
  assert.equal(call.method, 'PUT');
  assert.equal(call.headers.Authorization, 'Bearer tok');
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.equal(call.body, JSON.stringify({ email: 'a@b.c' }));
  await c.request('GET', '/api/friends', { query: { n: '10' } });
  assert.ok(fetch.calls[1].url.endsWith('/api/friends?n=10'));
});

test('request: noAuth skips bearer header', async () => {
  const fetch = makeFetch(() => ({ data: {} }));
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 'tok', fetchImpl: fetch });
  await c.getConfig();
  assert.equal(fetch.calls[0].headers.Authorization, undefined);
});

test('request: non-2xx throws ApiError with status and message', async () => {
  const fetch = makeFetch(() => ({ status: 401, data: { error: '访问被拒绝' } }));
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 'bad', fetchImpl: fetch });
  await assert.rejects(() => c.getSession(), (e) => e instanceof ApiError && e.status === 401 && e.message === '访问被拒绝');
});

test('request: network error throws ApiError status 0', async () => {
  const fetch = async () => { throw new Error('ECONNREFUSED'); };
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', fetchImpl: fetch });
  await assert.rejects(() => c.getFriends(), (e) => e instanceof ApiError && e.status === 0);
});

test('setToken/setBaseUrl persist and affect later calls', async () => {
  const storage = makeStorage();
  const fetch = makeFetch(() => ({ data: {} }));
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', storage, fetchImpl: fetch });
  c.setToken('new-tok');
  c.setBaseUrl('http://new:5000');
  assert.equal(storage.getItem('vrcn_token'), 'new-tok');
  assert.equal(storage.getItem('vrcn_base'), 'http://new:5000');
  await c.getMe();
  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer new-tok');
  assert.ok(fetch.calls[0].url.startsWith('http://new:5000'));
  c.clearToken();
  assert.equal(storage.getItem('vrcn_token'), null);
});

test('avatarUrl builds tokenized url', () => {
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 't k', fetchImpl: async () => new Response('{}') });
  assert.equal(c.avatarUrl('file_a_1_256'), 'http://127.0.0.1:3000/api/avatar/file_a_1_256?token=t%20k');
});

test('business methods hit correct endpoints', async () => {
  const fetch = makeFetch(() => ({ data: { ok: true } }));
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 't', fetchImpl: fetch });
  await c.verifyAccess('k');
  await c.login('u', 'p', true);
  await c.login2fa('sid', '123456', 'emailOtp');
  await c.logout();
  await c.getSession();
  await c.getMe();
  await c.getFriends();
  await c.updateFriendConfig('usr_x', { monitorEnabled: true });
  await c.getSettings();
  await c.updateSettings({ qq_app_id: 'app1' });
  await c.testNotification('qq');
  await c.getStatus();
  await c.manualSnapshot();
  const paths = fetch.calls.map((x) => x.url.replace('http://127.0.0.1:3000', ''));
  assert.deepEqual(paths, [
    '/api/access/verify', '/api/login', '/api/login/2fa', '/api/logout',
    '/api/session', '/api/me', '/api/friends',
    '/api/friends/usr_x/config', '/api/settings', '/api/settings',
    '/api/test/qq', '/api/status', '/api/monitor/snapshot'
  ]);
});

test('subscribeEvents: opens EventSource with token, dispatches named + message events, close works', () => {
  const ES = makeEventSourceClass();
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 'tok', fetchImpl: async () => new Response('{}'), EventSourceImpl: ES });
  const got = [];
  const sub = c.subscribeEvents({ onEvent: (type, data) => got.push([type, data]) });
  assert.equal(ES.instances.length, 1);
  assert.equal(ES.instances[0].url, 'http://127.0.0.1:3000/api/events?token=tok');
  ES.instances[0].emit('notification', { userId: 'u', changeType: '上线' });
  ES.instances[0].emitMessage({ hello: 1 });
  assert.deepEqual(got, [
    ['notification', { userId: 'u', changeType: '上线' }],
    ['message', { hello: 1 }]
  ]);
  sub.close();
  assert.equal(ES.instances[0].closed, true);
});

test('subscribeEvents throws when EventSource unavailable', () => {
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', fetchImpl: async () => new Response('{}'), EventSourceImpl: null });
  assert.throws(() => c.subscribeEvents(), (e) => e instanceof ApiError);
});

test('getLogs requests tail or after seq', async () => {
  const fetch = makeFetch((call) => ({ data: { ok: true, logs: [], seq: 0 } }));
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 'tok', fetchImpl: fetch });
  await c.getLogs({ tail: 50 });
  assert.equal(fetch.calls[0].url, 'http://127.0.0.1:3000/api/logs?tail=50');
  await c.getLogs({ after: 7 });
  assert.equal(fetch.calls[1].url, 'http://127.0.0.1:3000/api/logs?after=7');
  await c.getLogs();
  assert.equal(fetch.calls[2].url, 'http://127.0.0.1:3000/api/logs');
});

test('subscribeEvents registers log event for backend log lines', () => {
  const ES = makeEventSourceClass();
  const c = new VrcNotifierClient({ baseUrl: 'http://127.0.0.1:3000', token: 'tok', fetchImpl: async () => new Response('{}'), EventSourceImpl: ES });
  const seen = [];
  c.subscribeEvents({ onEvent: (type, data) => seen.push({ type, data }) });
  const es = ES.instances[0];
  assert.ok(es.listeners.log, 'log listener registered');
  es.emit('log', { seq: 1, line: '[info] 后端日志' });
  assert.deepEqual(seen, [{ type: 'log', data: { seq: 1, line: '[info] 后端日志' } }]);
});