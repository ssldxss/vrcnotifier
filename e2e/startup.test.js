'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { launchBrowser } = require('./helpers');

async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise((r) => server.close(r)); return port;
}
async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

test('production entry starts, serves the dashboard, persists settings and reconnects after restart', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-startup-'));
  let online = false;
  const upstream = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (data, status = 200, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
    const me = { id: 'usr_me', displayName: 'Startup User', friends: ['usr_f'],
      onlineFriends: online ? ['usr_f'] : [], activeFriends: [], offlineFriends: online ? [] : ['usr_f'] };
    if (url.pathname === '/api/1/auth/user') {
      if (req.headers.authorization?.startsWith('Basic ') || req.headers.cookie?.includes('auth=startup')) {
        return send(me, 200, { 'Set-Cookie': 'auth=startup; Path=/' });
      }
      return send({ error: { message: 'Missing Credentials' } }, 401);
    }
    if (url.pathname === '/api/1/auth') return send({ token: 'local-token' });
    if (url.pathname === '/api/1/auth/user/friends') return send(online ? [{ id: 'usr_f', displayName: 'Local Friend', status: 'active', location: 'private' }] : []);
    if (url.pathname === '/api/1/users/usr_f') return send({ id: 'usr_f', displayName: 'Local Friend' });
    if (url.pathname === '/api/1/users/usr_me') return send({ ...me, status: 'active' });
    if (url.pathname === '/api/1/config') return send({ clientApiKey: 'local' }, 200, { 'x-vrc-api-server': 'startup-mock' });
    if (url.pathname === '/status/status.json') return send({ status: { indicator: 'none', description: 'Operational' } });
    if (url.pathname === '/status/summary.json') return send({ components: [] });
    return send({ error: { message: 'Not found: ' + url.pathname } }, 404);
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const upstreamBase = 'http://127.0.0.1:' + upstream.address().port;
  const wss = new WebSocketServer({ server: upstream });
  const sockets = new Set();
  wss.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  const port = await freePort();
  const base = 'http://127.0.0.1:' + port;
  let child, browser, output = '';
  t.after(async () => {
    if (browser) await browser.close();
    await stopChild(child);
    for (const socket of sockets) socket.terminate();
    await new Promise((r) => wss.close(r));
    upstream.closeAllConnections(); await new Promise((r) => upstream.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function start() {
    child = spawn(process.execPath, ['src/index.js', '--no-encrypt'], { cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'app.db'), ACCESS_TOKEN: 'startup-token',
        VRC_API_URL: upstreamBase + '/api/1', VRC_WS_URL: upstreamBase.replace('http:', 'ws:'),
        VRC_STATUS_URL: upstreamBase + '/status', MASTER_KEY: '', SERVE_STATIC: '1', CONFIRM_DELAY_MS: '50' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { output += data; });
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) assert.fail('application exited: ' + output);
      try { if ((await fetch(base + '/api/config')).ok) return; } catch {}
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.fail('startup timeout: ' + output);
  }
  await start();
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('vrcn_token', 'startup-token'));
  await page.goto(base);
  await page.waitForSelector('#loginView:not(.hidden)');
  await page.fill('#loginUser', 'startup'); await page.fill('#loginPass', 'local-password'); await page.click('#loginBtn');
  await page.waitForFunction(() => document.querySelector('#stFriends').textContent === '1');
  const wsDeadline = Date.now() + 5000;
  while (!sockets.size && Date.now() < wsDeadline) await new Promise((r) => setTimeout(r, 20));
  assert.ok(sockets.size, 'real pipeline connected to local upstream');
  online = true;
  for (const socket of sockets) socket.send(JSON.stringify({ type: 'friend-online', content: JSON.stringify({
    location: 'private', user: { id: 'usr_f', status: 'busy', statusDescription: 'Real WS pipeline' }
  }) }));
  await page.waitForFunction(() => document.querySelector('#stOnline').textContent === '1');
  assert.match(await page.locator('.friend[data-id="usr_f"]').textContent(), /Real WS pipeline/);
  const save = await fetch(base + '/api/settings', { method: 'PUT', headers: { Authorization: 'Bearer startup-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_event_limit: 100000 }) });
  assert.equal(save.status, 200);
  await stopChild(child);
  assert.equal(child.exitCode, 0, 'SIGTERM exits cleanly');
  await start();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#stFriends').textContent === '1');
  const settings = await (await fetch(base + '/api/settings', { headers: { Authorization: 'Bearer startup-token' } })).json();
  assert.equal(settings.settings.friend_event_limit, 100000);
  const events = await (await fetch(base + '/api/friend-events', { headers: { Authorization: 'Bearer startup-token' } })).json();
  assert.ok(events.events.some((e) => e.type_code === 'friend_online'), 'history survived actual restart');
  assert.deepEqual(errors, []);
});
