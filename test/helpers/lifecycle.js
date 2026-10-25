'use strict';
// Real application + local protocol peers. Tests observe HTTP, WebSocket and QQ
// messages; no application collaborator or database behavior is mocked.
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { buildApplication } = require('../../src/index');

const silent = { debug() {}, info() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
async function waitFor(read, predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await sleep(10);
  }
  assert.fail('condition not reached: ' + JSON.stringify(value));
}

async function startApplication(t, { qqPlatform = null } = {}) {
  const holds = [];
  const expired = new Set();
  const invalidSessions = new Set();
  const twoFactor = new Set();
  const sockets = new Set();
  const friendOf = (name) => ({ id: 'usr_friend_' + name, displayName: 'Friend ' + name, location: 'offline', status: 'active' });
  const currentOf = (name) => ({ id: 'usr_' + name, displayName: name, friends: [friendOf(name).id],
    onlineFriends: [], activeFriends: [], offlineFriends: [friendOf(name).id] });
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const basic = req.headers.authorization?.startsWith('Basic ');
    const name = basic ? decodeURIComponent(Buffer.from(req.headers.authorization.slice(6), 'base64').toString().split(':')[0])
      : /(?:^|;\s*)auth=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const info = { path: url.pathname, name, basic, query: url.searchParams };
    const send = async (data, status = 200, headers = {}) => {
      const hold = holds.find((h) => !h.used && h.matches(info));
      if (hold) { hold.used = true; hold.started.resolve(); await hold.resume.promise; }
      if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(data)); }
    };
    if (url.pathname === '/api/1/auth/user') {
      if (!basic && invalidSessions.delete(name)) return send({ error: { message: 'Session invalid' } }, 401);
      if (!name || (!basic && expired.has(name))) return send({ error: { message: 'Missing Credentials' } }, 401);
      if (basic) {
        expired.delete(name);
        if (twoFactor.has(name)) return send({ requiresTwoFactorAuth: ['emailOtp'] }, 200, { 'Set-Cookie': 'auth=' + name + '; Path=/' });
      }
      return send(currentOf(name), 200, { 'Set-Cookie': 'auth=' + name + '; Path=/' });
    }
    if (url.pathname.endsWith('/verify')) return send({ verified: true });
    if (url.pathname === '/api/1/auth/user/friends') return send(url.searchParams.get('offline') === 'true' ? [friendOf(name)] : []);
    if (url.pathname === '/api/1/auth') return send({ token: name || 'mock' });
    if (url.pathname === '/api/1/config') return send({ clientApiKey: 'mock' });
    if (url.pathname.startsWith('/api/1/users/')) return send({ id: url.pathname.split('/').at(-1) });
    if (url.pathname === '/status/status.json') return send({ status: { indicator: 'none', description: 'Operational' } });
    if (url.pathname === '/status/summary.json') return send({ components: [] });
    return send({}, 404);
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const wss = new WebSocketServer({ server: upstream });
  wss.on('connection', (ws) => { sockets.add(ws); ws.on('close', () => sockets.delete(ws)); });
  const base = 'http://127.0.0.1:' + upstream.address().port;
  const avatarDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-lifecycle-'));
  const runtime = buildApplication({ dbPath: ':memory:', avatarDir, logger: silent,
    apiBaseUrl: base + '/api/1', wsBaseUrl: base, vrcStatusUrl: base + '/status',
    accessToken: 'lifecycle-token', reconnectBaseMs: 20, jitterMs: 0,
    ...(qqPlatform ? { qqTokenUrl: qqPlatform.base + '/app/getAppAccessToken', qqApiBase: qqPlatform.base, qqWsUrl: qqPlatform.wsUrl } : {}) });
  const server = runtime.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    for (const hold of holds) hold.resume.resolve();
    runtime.monitor.stopTimers(); runtime.healthMonitor.stop(); runtime.avatarCache.stopTimers(); runtime.qq.stopAll();
    for (const { user } of runtime.monitor.activeUsers()) runtime.monitor.deactivateUser(user.vrchat_user_id);
    server.closeAllConnections(); await new Promise((r) => server.close(r));
    for (const socket of sockets) socket.terminate();
    await new Promise((r) => wss.close(r)); upstream.closeAllConnections(); await new Promise((r) => upstream.close(r));
    runtime.db.close(); fs.rmSync(avatarDir, { recursive: true, force: true });
  });
  const appBase = 'http://127.0.0.1:' + server.address().port;
  async function request(method, route, body) {
    const response = await fetch(appBase + route, { method,
      headers: { Authorization: 'Bearer lifecycle-token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  return {
    request, login: (name) => request('POST', '/api/login', { username: name, password: 'test-password', rememberMe: true }),
    holdNext(matches) {
      const hold = { matches, used: false, started: deferred(), resume: deferred() }; holds.push(hold);
      return { started: hold.started.promise, release: () => hold.resume.resolve() };
    },
    expireCookie: (name) => expired.add(name),
    invalidateSession: (name) => invalidSessions.add(name),
    requireTwoFactor: (name) => twoFactor.add(name)
  };
}
async function startQqPlatform(t) {
  const messages = [];
  const sockets = new Set();
  const connections = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url.includes('/v2/users/')) messages.push(JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(req.url.includes('getAppAccessToken') ? { access_token: 'mock-qq-token', expires_in: 7200 } : { id: 'message-ok' }));
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    sockets.add(ws); connections.push(ws);
    ws.on('close', () => sockets.delete(ws));
    ws.on('message', (data) => {
      const frame = JSON.parse(String(data));
      if (frame.op === 2) ws.send(JSON.stringify({ op: 0, s: 1, t: 'READY', d: {} }));
      if (frame.op === 1) ws.send(JSON.stringify({ op: 11 }));
    });
    ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }));
  });
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await new Promise((r) => wss.close(r)); server.closeAllConnections(); await new Promise((r) => server.close(r));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, wsUrl: base.replace('http:', 'ws:'), connections, messages };
}
module.exports = { startApplication, startQqPlatform, deferred, waitFor, sleep };
