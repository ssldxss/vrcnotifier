'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dashboard } = require('./helpers');

const feedUrl = (request) => new URL(request.url());
const isOlder = (request) => feedUrl(request).pathname === '/api/friend-events' && feedUrl(request).searchParams.has('before');
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
async function startPrefetch(page) {
  return page.locator('#feedList').evaluate((el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight * 3;
    return { height: el.scrollHeight, top: el.scrollTop, remaining: el.scrollHeight - el.scrollTop - el.clientHeight };
  });
}
async function idle(page) {
  await page.waitForFunction(() => document.querySelector('#feedList').getAttribute('aria-busy') === 'false');
}
async function assertHistoryPreserved(page) {
  // 虚拟列表会把估计行高修正成实测行高，不能用 scrollHeight 不变判断是否丢数据。
  await page.locator('#feedList').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForSelector('#feedList .feed-item[data-id="201"]');
  await page.locator('#feedList').evaluate((el) => { el.scrollTop = 0; });
  await page.waitForSelector('#feedList .feed-item[data-id="300"]');
  assert.match(await page.locator('#feedTotal').textContent(), /共 300 条/);
}

test('feed prefetches before the bottom, serializes requests and continues after a short page without another scroll', async (t) => {
  const { page } = await dashboard(t, { events: 300 });
  const pending = deferred();
  t.after(() => pending.resolve());
  const cursors = [];
  await page.route('**/api/friend-events?*', async (route) => {
    if (!isOlder(route.request())) return route.continue();
    cursors.push(feedUrl(route.request()).searchParams.get('before'));
    const response = await route.fetch();
    if (cursors.length === 1) {
      const data = await response.json();
      await pending.promise;
      return route.fulfill({ json: { ...data, events: data.events.slice(0, 5) } });
    }
    return route.fulfill({ response });
  });
  const started = page.waitForRequest(isOlder);
  const before = await startPrefetch(page);
  assert.ok(before.remaining > 200, 'starts well before the previous 200px boundary');
  await started;
  assert.match(await page.locator('#feedLoadText').textContent(), /加载更早/);
  await page.locator('#feedList').evaluate((el) => {
    for (let i = 0; i < 10; i++) el.dispatchEvent(new Event('scroll'));
  });
  assert.equal(cursors.length, 1, 'scroll bursts cannot start concurrent pages');
  pending.resolve();
  await page.waitForFunction((height) => document.querySelector('#feedList').scrollHeight > height + 3000, before.height);
  await idle(page);
  assert.deepEqual(cursors, ['201', '196'], 'next cursor follows the short response, with no further scroll');
  const after = await page.locator('#feedList').evaluate((el) => el.scrollTop);
  assert.ok(Math.abs(after - before.top) < 2, 'appending history preserves the reading position');
});

test('feed retries network and HTTP failures with the same cursor and recovers automatically', async (t) => {
  const { page } = await dashboard(t, { events: 300 });
  const cursors = [];
  await page.route('**/api/friend-events?*', async (route) => {
    if (!isOlder(route.request())) return route.continue();
    cursors.push(feedUrl(route.request()).searchParams.get('before'));
    if (cursors.length === 1) return route.abort('connectionfailed');
    if (cursors.length === 2) return route.fulfill({ status: 503, json: { error: '暂时不可用' } });
    return route.continue();
  });
  const before = await startPrefetch(page);
  await page.waitForFunction(() => document.querySelector('#feedLoadText').textContent.includes('正在重试'));
  await page.waitForFunction((height) => document.querySelector('#feedList').scrollHeight > height + 3000, before.height);
  await idle(page);
  assert.deepEqual(cursors, ['201', '201', '201']);
  assert.equal(await page.locator('#feedRetry').isVisible(), false);
});

test('a failed initial load exposes retry and recovers without reloading the page', async (t) => {
  const { page } = await dashboard(t, { events: 150, loggedIn: false });
  let failing = true;
  await page.route('**/api/friend-events?*', async (route) => {
    if (failing) return route.fulfill({ status: 400, json: { error: '动态加载失败' } });
    return route.continue();
  });
  await page.fill('#loginUser', 'browser');
  await page.fill('#loginPass', 'test');
  const initialFailed = page.waitForResponse((response) => feedUrl(response).pathname === '/api/friend-events' && response.status() === 400);
  await page.click('#loginBtn');
  await initialFailed;
  await page.waitForSelector('#feedRetry:not(.hidden)');
  await idle(page);
  assert.equal(await page.locator('#feedList .feed-item').count(), 0);
  failing = false;
  await page.click('#feedRetry');
  await page.waitForSelector('#feedList .feed-item');
  await idle(page);
  assert.match(await page.locator('#feedTotal').textContent(), /共 150 条/);
});

test('exhausted retries preserve history and cursor; keyboard retry resumes pagination on mobile', async (t) => {
  const { page } = await dashboard(t, { events: 300, mobile: true });
  await page.setViewportSize({ width: 375, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  let failing = true;
  const cursors = [];
  await page.route('**/api/friend-events?*', async (route) => {
    if (!isOlder(route.request())) return route.continue();
    cursors.push(feedUrl(route.request()).searchParams.get('before'));
    if (failing) return route.fulfill({ status: 503, json: { error: '服务暂时不可用' } });
    return route.continue();
  });
  const before = await startPrefetch(page);
  await page.waitForSelector('#feedRetry:not(.hidden)');
  await idle(page);
  assert.equal(cursors.length, 3, 'automatic retries are bounded');
  await assertHistoryPreserved(page);
  await page.locator('#feedList').evaluate((el) => el.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(150);
  assert.equal(cursors.length, 3, 'scrolling cannot restart an exhausted retry loop');
  failing = false;
  await page.locator('#feedRetry').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((height) => document.querySelector('#feedList').scrollHeight > height + 3000, before.height);
  await idle(page);
  assert.deepEqual(cursors, ['201', '201', '201', '201']);
  const box = await page.locator('.feed-load-state').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, 'status stays within the mobile viewport');
});

for (const [name, status, data] of [
  ['HTTP 400', 400, { error: '请求无效' }],
  ['malformed success', 200, { ok: true }],
  ['non-advancing page', 200, { ok: true, events: [{ id: 201 }], hasMore: true }]
]) {
  test('feed treats ' + name + ' as a recoverable error, not an empty final page', async (t) => {
    const { page } = await dashboard(t, { events: 300 });
    let reads = 0;
    await page.route('**/api/friend-events?*', async (route) => {
      if (!isOlder(route.request())) return route.continue();
      reads++;
      if (reads === 1) return route.fulfill({ status, json: data });
      return route.continue();
    });
    const before = await startPrefetch(page);
    await page.waitForSelector('#feedRetry:not(.hidden)');
    await idle(page);
    assert.equal(reads, 1, 'permanent or invalid responses are not automatically retried');
    await assertHistoryPreserved(page);
    await page.click('#feedRetry');
    await page.waitForFunction((height) => document.querySelector('#feedList').scrollHeight > height + 3000, before.height);
    assert.equal(reads, 2, 'hasMore and cursor survive the failed response');
  });
}

test('a hung feed request times out, releases the attempt and retries successfully', async (t) => {
  const { page } = await dashboard(t, { events: 300 });
  await page.clock.install();
  const pending = deferred();
  t.after(() => pending.resolve());
  let reads = 0;
  await page.route('**/api/friend-events?*', async (route) => {
    if (!isOlder(route.request())) return route.continue();
    reads++;
    if (reads === 1) {
      const response = await route.fetch();
      await pending.promise;
      return route.fulfill({ response });
    }
    return route.continue();
  });
  const failed = page.waitForEvent('requestfailed', { predicate: isOlder });
  const started = page.waitForRequest(isOlder);
  const before = await startPrefetch(page);
  await started;
  await page.clock.fastForward(15001);
  await failed;
  await page.waitForFunction(() => document.querySelector('#feedLoadText').textContent.includes('正在重试'));
  await page.clock.fastForward(1001);
  await page.waitForFunction((height) => document.querySelector('#feedList').scrollHeight > height + 3000, before.height);
  await idle(page);
  assert.equal(reads, 2);
  pending.resolve();
});

test('changing search aborts an old page without releasing the replacement request lock', async (t) => {
  const { page } = await dashboard(t, { events: 300 });
  const oldPage = deferred(), newSearch = deferred();
  t.after(() => { oldPage.resolve(); newSearch.resolve(); });
  await page.route('**/api/friend-events?*', async (route) => {
    const url = feedUrl(route.request());
    if (!isOlder(route.request()) && !url.searchParams.has('q')) return route.continue();
    const response = await route.fetch();
    await (isOlder(route.request()) ? oldPage.promise : newSearch.promise);
    return route.fulfill({ response });
  });
  const cancelled = page.waitForEvent('requestfailed', { predicate: isOlder });
  const started = page.waitForRequest(isOlder);
  await startPrefetch(page);
  await started;
  const searchStarted = page.waitForRequest((request) => feedUrl(request).searchParams.get('q') === 'Event 0');
  await page.fill('#feedSearch', 'Event 0');
  await searchStarted;
  await cancelled;
  oldPage.resolve();
  assert.equal(await page.locator('#feedList').getAttribute('aria-busy'), 'true', 'old finally cannot release the new request');
  newSearch.resolve();
  await page.waitForFunction(() => document.querySelector('#feedTotal').textContent.includes('共 1 条'));
  await idle(page);
  assert.equal(await page.locator('#feedList .feed-item').count(), 1);
});

test('changing filters cancels a pending retry rather than sending another old page', async (t) => {
  const { page } = await dashboard(t, { events: 300 });
  let reads = 0;
  await page.route('**/api/friend-events?*', async (route) => {
    if (!isOlder(route.request())) return route.continue();
    reads++;
    return route.fulfill({ status: 503, json: { error: '暂时不可用' } });
  });
  await startPrefetch(page);
  await page.waitForFunction(() => document.querySelector('#feedLoadText').textContent.includes('正在重试'));
  await page.click('#feedChips [data-filter="online"]');
  await idle(page);
  await page.waitForTimeout(1200);
  assert.equal(reads, 1);
  assert.equal(await page.locator('#feedList .feed-item').count(), 0);
  assert.equal(await page.locator('#feedRetry').isVisible(), false);
});

test('resizing the feed triggers prefetch without a scroll event', async (t) => {
  const { page } = await dashboard(t, { events: 300 });
  const requested = page.waitForRequest(isOlder);
  await page.setViewportSize({ width: 1440, height: 1800 });
  await requested;
  await page.waitForFunction(() => document.querySelector('#feedList').scrollHeight > 7000);
  await idle(page);
});
