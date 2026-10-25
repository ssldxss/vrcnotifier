'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dashboard } = require('./helpers');

const logLine = (text) => '[2026-10-24 12:00:00] [info] [server] ' + text;

test('dashboard boots with the real HTTP/SSE service and applies complete friend state independently of history', async (t) => {
  const { page, monitor } = await dashboard(t);
  assert.equal(await page.locator('#stFriends').textContent(), '1');
  await monitor.handlePipelineEvent('usr_me', '', { type: 'friend-online', content: {
    location: 'private', user: { id: 'usr_f', status: 'busy', statusDescription: 'Updated via state DTO' }
  } });
  await page.waitForFunction(() => document.querySelector('#stOnline').textContent === '1');
  assert.match(await page.locator('.friend[data-id="usr_f"]').textContent(), /Updated via state DTO/);
  assert.equal(await page.locator('#feedList .feed-item').count(), 1);
  await monitor.handlePipelineEvent('usr_me', '', { type: 'friend-delete', content: { userId: 'usr_f' } });
  await page.waitForFunction(() => document.querySelector('#stFriends').textContent === '0');
  assert.equal(await page.locator('#feedList .feed-item').count(), 1, 'deletion does not erase historical events');
});

test('retention settings preserve exponent input in both save and enable paths', async (t) => {
  const { page, db } = await dashboard(t);
  await page.click('#settingsBtn');
  await page.click('label.switch:has(#sAutoTrim)');
  await page.waitForFunction(() => !document.querySelector('#trimFields').classList.contains('hidden'));
  await page.fill('#sFriendEventLimit', '1e5');
  await page.click('#saveLimit');
  await page.waitForFunction(() => document.querySelector('#settingsMsg').textContent === '已保存');
  assert.equal(db.getGlobalSettings().friend_event_limit, 100000);
  await page.click('label.switch:has(#sAutoTrim)');
  await page.waitForFunction(() => document.querySelector('#trimFields').classList.contains('hidden'));
  await page.evaluate(() => { document.querySelector('#sFriendEventLimit').value = '1e5'; });
  await page.click('label.switch:has(#sAutoTrim)');
  await page.waitForFunction(() => document.querySelector('#sFriendEventLimit').value === '100000');
  assert.equal(db.getGlobalSettings().friend_event_limit, 100000);
});

test('changing a favorite refreshes the active favorite history filter', async (t) => {
  const { page } = await dashboard(t, { events: 3 });
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/friend-events?') && res.url().includes('favorite=1')),
    page.click('.chip[data-filter="favorite"]')
  ]);
  await page.click('.friend[data-id="usr_f"] [data-act="fav"]');
  await page.waitForFunction(() => document.querySelector('#feedList').textContent.includes('暂无动态'));
  assert.equal(await page.locator('#feedList .feed-item').count(), 0);
});

test('a delayed log tail merges live lines and replacements before subsequent lines arrive', async (t) => {
  const { page, logStream } = await dashboard(t);
  const first = logStream.push(logLine('first'));
  let release;
  let captured;
  const capturedPromise = new Promise((resolve) => { captured = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/logs?*', async (route) => {
    const response = await route.fetch();
    captured();
    await releasePromise;
    await route.fulfill({ response });
  }, { times: 1 });
  await page.click('#settingsBtn');
  await capturedPromise;
  const second = logStream.push(logLine('second'));
  logStream.update(second.seq, logLine('second masked'));
  release();
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('second masked'));
  const third = logStream.push(logLine('third'));
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('third'));
  const ids = await page.locator('#log [data-seq]').evaluateAll((rows) => rows.map((r) => Number(r.dataset.seq)));
  assert.deepEqual(ids, [third.seq, second.seq, first.seq]);
});

test('new events preserve the visible historical row across the next scroll', async (t) => {
  const { page, publish } = await dashboard(t, { events: 100 });
  const visible = () => page.evaluate(() => {
    const list = document.querySelector('#feedList');
    const top = list.getBoundingClientRect().top;
    const row = [...list.querySelectorAll('.feed-item')].find((el) => el.getBoundingClientRect().bottom > top + 2);
    return row && row.dataset.id;
  });
  await page.locator('#feedList').evaluate((el) => { el.scrollTop = 900; });
  await page.waitForTimeout(120);
  const before = await visible();
  for (let i = 0; i < 20; i++) publish();
  await page.waitForFunction(() => document.querySelector('#feedNew').textContent.includes('20'));
  assert.equal(await visible(), before);
  await page.locator('#feedList').evaluate((el) => { el.scrollTop += 1; });
  await page.waitForTimeout(100);
  assert.equal(await visible(), before);
});

test('mobile layout exposes feed and settings; repeated live arrivals keep DOM bounded', async (t) => {
  const { page, publish } = await dashboard(t, { events: 1, mobile: true });
  assert.ok((await page.locator('#feedList').boundingBox()).width <= 390);
  assert.ok((await page.locator('#settingsBtn').boundingBox()).x < 390);
  for (let i = 0; i < 200; i++) publish();
  await page.waitForFunction(() => document.querySelector('#feedTotal').textContent.includes('201'));
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#feedList .feed-item').count() <= 80);
  await page.click('#settingsBtn');
  assert.equal(await page.locator('#settingsView').isVisible(), true);
});

test('login errors stay on the login form and successful login enters the dashboard', async (t) => {
  const { page } = await dashboard(t, { loggedIn: false });
  await page.waitForSelector('#loginView:not(.hidden)');
  await page.fill('#loginUser', 'browser');
  await page.fill('#loginPass', 'wrong');
  await page.click('#loginBtn');
  await page.waitForFunction(() => document.querySelector('#loginMsg').textContent.includes('密码'));
  assert.equal(await page.locator('#loginView').isVisible(), true);
  await page.fill('#loginPass', 'correct');
  await page.click('#loginBtn');
  await page.waitForSelector('#mainView:not(.hidden)');
  await page.waitForFunction(() => !document.querySelector('#bootView') || document.querySelector('#bootView').classList.contains('hidden'));
});

test('cancelling 2FA restores the password login button', async (t) => {
  const { page } = await dashboard(t, { loggedIn: false, twofa: true });
  await page.waitForSelector('#loginView:not(.hidden)');
  await page.fill('#loginUser', 'browser');
  await page.fill('#loginPass', 'correct');
  await page.click('#loginBtn');
  await page.waitForSelector('#twofaCancel:visible');
  await page.click('#twofaCancel');
  await page.waitForSelector('#loginBtn:visible');
  assert.equal(await page.locator('#loginBtn').isEnabled(), true);
});

test('a delayed friend snapshot cannot overwrite a newer realtime state DTO', async (t) => {
  const { page, monitor } = await dashboard(t);
  let captured, release;
  const ready = new Promise((resolve) => { captured = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/friends', async (route) => {
    const response = await route.fetch(); captured(); await blocked; await route.fulfill({ response });
  }, { times: 1 });
  await page.click('#refreshBtn');
  await ready;
  await monitor.handlePipelineEvent('usr_me', '', { type: 'friend-online', content: {
    location: 'private', user: { id: 'usr_f', status: 'busy', statusDescription: 'newer than HTTP' }
  } });
  await page.waitForFunction(() => document.querySelector('#stOnline').textContent === '1');
  const response = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/friends');
  release(); await response;
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#stOnline').textContent(), '1');
  assert.match(await page.locator('.friend[data-id="usr_f"]').textContent(), /newer than HTTP/);
});

test('changing feed search blocks stale cursor requests and replaces the old list', async (t) => {
  const { page } = await dashboard(t, { events: 150 });
  let captured, release;
  const ready = new Promise((resolve) => { captured = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  let stalePages = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/friend-events' && url.searchParams.get('q') === 'Event 0' && url.searchParams.has('before')) stalePages++;
  });
  await page.route('**/api/friend-events?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') !== 'Event 0') return route.continue();
    const response = await route.fetch(); captured(); await blocked; await route.fulfill({ response });
  });
  await page.fill('#feedSearch', 'Event 0'); await ready;
  await page.locator('#feedList').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(100);
  assert.equal(stalePages, 0);
  release();
  await page.waitForFunction(() => document.querySelector('#feedTotal').textContent.includes('共 1 条'));
  assert.equal(await page.locator('#feedList .feed-item').count(), 1);
});

test('first SSE backfill recovers history recorded after the initial HTTP snapshot', async (t) => {
  const { page, publish } = await dashboard(t, { events: 1 });
  let captured, release;
  const ready = new Promise((resolve) => { captured = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/friend-events?*', async (route) => {
    const response = await route.fetch(); captured(); await blocked; await route.fulfill({ response });
  }, { times: 1 });
  const reload = page.reload(); await ready;
  const missed = publish({ body: 'written before first SSE open' });
  release(); await reload;
  await page.waitForSelector('.feed-item[data-id="' + missed.id + '"]');
  assert.match(await page.locator('#feedList').textContent(), /written before first SSE open/);
});

test('live arrivals preserve the historical anchor when reading at the bottom of the list', async (t) => {
  const { page, publish } = await dashboard(t, { events: 100 });
  const visible = () => page.evaluate(() => {
    const list = document.querySelector('#feedList'); const top = list.getBoundingClientRect().top;
    return [...list.querySelectorAll('.feed-item')].find((row) => row.getBoundingClientRect().bottom > top + 2)?.dataset.id;
  });
  await page.locator('#feedList').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(100);
  const before = await visible();
  for (let i = 0; i < 20; i++) publish();
  await page.waitForFunction(() => document.querySelector('#feedNew').textContent.includes('20'));
  await page.waitForTimeout(100);
  assert.equal(await visible(), before);
});

test('friend filtering supports multiple friends, highlights selected rows, and caps at five', async (t) => {
  const { page, monitor, publish } = await dashboard(t);
  const bringOnline = (id, displayName) => monitor.handlePipelineEvent('usr_me', '', {
    type: 'friend-online',
    content: { location: 'private', user: { id, displayName, status: 'active' } }
  });
  await bringOnline('usr_f', 'Alice');
  for (const [id, name] of [['usr_1', 'Bob'], ['usr_2', 'Cara'], ['usr_3', 'Dana'], ['usr_4', 'Evan'], ['usr_5', 'Finn']]) {
    await bringOnline(id, name);
  }
  await page.waitForFunction(() => document.querySelectorAll('#friendsList .friend').length === 6);

  // 点好友行的空白处(避开头像/昵称链接): 切换该好友的筛选
  const clickFriend = (id) => page.locator('.friend[data-id="' + id + '"]').click({ position: { x: 5, y: 5 } });
  const chipNames = () => page.locator('#feedFriendChips .friend-chip .fc-name').allTextContents();
  const filteringIds = () => page.evaluate(() => [...document.querySelectorAll('#friendsList .friend.filtering')].map((el) => el.dataset.id));

  await clickFriend('usr_f');
  await page.waitForFunction(() => document.querySelectorAll('#feedFriendChips .friend-chip').length === 1);
  assert.deepEqual(await chipNames(), ['Alice'], '选中的好友出现在「只看」chip 组');
  assert.deepEqual(await filteringIds(), ['usr_f'], '被筛中的好友行高亮');
  assert.equal(await page.locator('#feedFriendChips').evaluate((el) => el.classList.contains('hidden')), false);

  // 并集语义: 各好友的动态都保留, 不是交集(交集只会看到两人同时相关的事件 = 空)
  publish({ friend_vrchat_id: 'usr_f', body: 'Alice 专属动态' });
  publish({ friend_vrchat_id: 'usr_1', body: 'Bob 专属动态' });
  await page.waitForFunction(() => {
    const text = document.querySelector('#feedList').textContent;
    return text.includes('Alice 专属动态') && !text.includes('Bob 专属动态');
  }, null, { timeout: 5000 });
  await clickFriend('usr_1');
  await page.waitForFunction(() => {
    const text = document.querySelector('#feedList').textContent;
    return text.includes('Alice 专属动态') && text.includes('Bob 专属动态');
  }, null, { timeout: 5000 });

  // 一次筛选可以叠加多个好友(最多 5 个); 第 5 个好友加入时请求带上全部 ID
  for (const [id, want] of [['usr_2', 3], ['usr_3', 4]]) {
    await clickFriend(id);
    await page.waitForFunction((n) => document.querySelectorAll('#feedFriendChips .friend-chip').length === n, want);
  }
  const five = page.waitForRequest((req) => {
    if (!req.url().includes('/api/friend-events')) return false;
    return new URL(req.url()).searchParams.get('friendId') === 'usr_f,usr_1,usr_2,usr_3,usr_4';
  });
  await clickFriend('usr_4');
  await five;
  assert.deepEqual(await chipNames(), ['Alice', 'Bob', 'Cara', 'Dana', 'Evan']);
  assert.equal((await filteringIds()).length, 5, '5 个好友行同时高亮');

  // 第 6 个被拒绝: chip 仍为 5 个, 并给出提示
  await clickFriend('usr_5');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('最多'));
  assert.equal((await chipNames()).length, 5, '最多同时筛选 5 个好友');
  assert.deepEqual((await filteringIds()).sort(), ['usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_f']);
  assert.equal(await page.locator('.friend[data-id="usr_5"]').evaluate((el) => el.classList.contains('filtering')), false);

  // 点 chip 取消单个好友; 再点已选中的好友行也能取消
  await page.click('#feedFriendChips [data-friend-id="usr_2"]');
  await page.waitForFunction(() => document.querySelectorAll('#feedFriendChips .friend-chip').length === 4);
  assert.equal(await page.locator('.friend[data-id="usr_2"]').evaluate((el) => el.classList.contains('filtering')), false);
  await clickFriend('usr_1');
  await page.waitForFunction(() => document.querySelectorAll('#feedFriendChips .friend-chip').length === 3);

  // 全部取消后 chip 组隐藏、列表高亮清空
  while ((await page.locator('#feedFriendChips .friend-chip').count()) > 0) {
    const before = await page.locator('#feedFriendChips .friend-chip').count();
    await page.click('#feedFriendChips .friend-chip');
    await page.waitForFunction((n) => document.querySelectorAll('#feedFriendChips .friend-chip').length === n, before - 1);
  }
  await page.waitForFunction(() => document.querySelector('#feedFriendChips').classList.contains('hidden'));
  assert.deepEqual(await filteringIds(), [], '取消筛选后好友行不再高亮');
});
