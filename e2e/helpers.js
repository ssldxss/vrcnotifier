'use strict';
const { chromium } = require('playwright');
const { EventEmitter } = require('node:events');
const { once } = require('node:events');
const path = require('node:path');
const { createDb } = require('../src/db');
const { createWorldName } = require('../src/world');
const { createMonitor } = require('../src/monitor');
const { createApp } = require('../src/server');
const { CookieJar } = require('../src/cookiejar');
const { createLogStream } = require('../src/logstream');

const logger = { debug() {}, info() {}, warn() {}, error() {} };
async function launchBrowser() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
}
async function dashboard(t, { events = 0, favorite = true, loggedIn = true, twofa = false, mobile = false } = {}) {
  const db = createDb(':memory:');
  const bus = new EventEmitter();
  const logStream = createLogStream();
  const user = { id: 'usr_me', displayName: 'Browser Test', friends: ['usr_f'],
    onlineFriends: [], activeFriends: [], offlineFriends: ['usr_f'] };
  const api = {
    jar: new CookieJar(),
    login: async (name, password) => {
      if (password === 'wrong') { const e = new Error('wrong password'); e.status = 401; throw e; }
      return twofa ? { requiresTwoFactorAuth: ['emailOtp'] } : user;
    },
    me: async () => user, user: async () => null,
    verify2fa: async () => ({ verified: true }),
    friends: async () => [], setCookiesChanged() {}
  };
  const pipeline = { connect() {}, disconnect() {}, isConnected: () => true,
    status: () => ({ connected: true }), lastMessageAt: () => Date.now(),
    messageSeries: () => ({ series: Array(60).fill(0), total: 0 }) };
  const notifier = { sendAll: async () => ({}), sendTest: async () => ({ ok: true }) };
  const worldName = createWorldName({ db, bus, logger, fetchWorld: async (id) => ({ id, name: 'Local world' }) });
  const monitor = createMonitor({ db, bus, pipeline, notifier, logger, worldName });
  const { app } = createApp({ db, monitor, pipeline, notifier, vrcapiFactory: () => api,
    config: { accessToken: 'browser-token' }, logger, logStream, publicDir: path.join(__dirname, '../public'),
    healthMonitor: { status: () => ({ status: 'ok', latencyMs: 1, serverName: 'local-mock' }) },
    vrcStatus: { status: async () => ({ state: 'normal' }) } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, body) => {
    const res = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer browser-token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return res.json();
  };
  if (loggedIn) await request('/api/login', { username: 'browser', password: 'test' });
  db.upsertFriend('usr_f', { displayName: 'Alice', state: 'offline' });
  db.setFriendConfig('usr_f', { favorite });
  for (let i = 0; i < events; i++) db.addFriendEvent({ type: 'boop', at: Date.now(), friend_vrchat_id: 'usr_f', body: 'Event ' + i });
  let browser;
  const errors = [];
  t.after(async () => {
    if (browser) await browser.close();
    monitor.deactivateUser('usr_me'); monitor.stopTimers();
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    db.close();
    require('node:assert/strict').deepEqual(errors, [], 'browser must have no unhandled JavaScript errors');
  });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  let feedReads = 0;
  page.on('response', (res) => { if (res.url().includes('/api/friend-events') && res.status() === 200) feedReads++; });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('vrcn_token', 'browser-token'); });
  await page.goto(base);
  if (loggedIn && !twofa) {
    await page.waitForFunction(() => !document.querySelector('#mainView').classList.contains('hidden'));
    // The first SSE open intentionally backfills once. Wait for both HTTP reads.
    const deadline = Date.now() + 5000;
    while (feedReads < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    require('node:assert/strict').ok(feedReads >= 2, 'initial SSE backfill completed');
    await page.waitForTimeout(100);
  }
  const publish = (fields = {}) => {
    const event = db.addFriendEvent({ type: 'boop', at: Date.now(), friend_vrchat_id: 'usr_f', ...fields });
    bus.emit('friend-event', event);
    return event;
  };
  return { page, db, bus, monitor, base, logStream, request, publish, user };
}
module.exports = { dashboard, launchBrowser };
