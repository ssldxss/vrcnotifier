'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApplication } = require('../test/helpers/lifecycle');
const { launchBrowser } = require('./helpers');

async function statusDashboard(t, { loggedIn = true, officialStatus = {} } = {}) {
  let now = Date.now();
  const app = await startApplication(t, { serveStatic: true, officialStatus, now: () => now });
  if (loggedIn) await app.login('A');
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no unhandled browser errors'));
  await page.addInitScript(() => localStorage.setItem('vrcn_token', 'lifecycle-token'));
  await page.goto(app.base);
  await page.waitForSelector(loggedIn ? '#mainView:not(.hidden)' : '#loginView:not(.hidden)');
  await page.waitForFunction(() => document.querySelector('#stLatency').textContent.includes('ms'));
  return { ...app, page, advance: ms => { now += ms; } };
}

test('官方降级通过后端显示警告色、故障组件和可点击状态页', async (t) => {
  const { page } = await statusDashboard(t, { officialStatus: {
    description: 'Degraded Performance', indicator: 'minor',
    components: [{ name: 'API', status: 'degraded_performance' }, { name: 'Website', status: 'operational' }]
  } });
  assert.equal(await page.locator('#stHealthDot.warn').count(), 1);
  await page.locator('#stServerStatus').focus();
  await page.waitForSelector('#stVrcDetail', { state: 'visible' });
  assert.match(await page.locator('#stVrcDetail').textContent(), /Degraded Performance: API/);
  assert.equal(await page.locator('#stServerStatus').getAttribute('href'), 'https://status.vrchat.com');
});

test('后端探测通过 SSE 更新严重故障与恢复, 异常详情自动展示 5 秒', async (t) => {
  const { page, advance, setOfficialStatus, request } = await statusDashboard(t);
  await page.waitForFunction(() => document.querySelector('#stHealthDot').classList.contains('ok'));
  await page.clock.install();
  setOfficialStatus({ description: 'Major System Outage', indicator: 'major', components: [{ name: 'API', status: 'major_outage' }] });
  advance(60001);
  assert.equal((await request('GET', '/api/vrc-status?focus=1')).data.state, 'outage');
  await page.waitForSelector('#stHealthDot.bad');
  assert.equal(await page.locator('#stVrcDetail').isVisible(), true, '首次告警自动展开');
  assert.match(await page.locator('#stVrcDetail').textContent(), /Major System Outage: API/);
  await page.clock.fastForward(5100);
  assert.equal(await page.locator('#stVrcDetail').isVisible(), false);
  await page.locator('#stServerStatus').hover();
  assert.equal(await page.locator('#stVrcDetail').isVisible(), true);
  setOfficialStatus({ description: 'All Systems Operational', indicator: 'none', components: [] });
  advance(60001);
  await request('GET', '/api/vrc-status?focus=1');
  await page.waitForSelector('#stHealthDot.ok');
  assert.equal(await page.locator('#stVrcDetail').isVisible(), false);
  assert.equal(await page.locator('#stServerStatus').getAttribute('title'), 'VRChat 服务目前一切正常');
});

test('登录页显示故障警告, 获取失败显示灰色和无法获取状态, 恢复后隐藏提示', async (t) => {
  const { page, advance, setOfficialStatus, request } = await statusDashboard(t, { loggedIn: false, officialStatus: {
    description: 'Major System Outage', indicator: 'major', components: [{ name: 'API', status: 'major_outage' }]
  } });
  assert.equal(await page.locator('#loginVrcAlert.bad').count(), 1);
  assert.equal(await page.locator('#loginVrcAlert').isVisible(), true);
  assert.match(await page.locator('#loginVrcAlert').textContent(), /Major System Outage: API/);
  setOfficialStatus({ httpStatus: 503 });
  advance(60001);
  await request('GET', '/api/vrc-status?focus=1');
  await page.waitForSelector('#loginVrcAlert.unavailable');
  for (const prefix of ['lg', 'st']) {
    assert.equal(await page.locator('#' + prefix + 'HealthDot').getAttribute('class'), 'ss-dot');
    assert.equal(await page.locator('#' + prefix + 'VrcDetail strong').textContent(), '无法获取状态');
    assert.match(await page.locator('#' + prefix + 'ServerStatus').getAttribute('aria-label'), /无法获取状态/);
  }
  assert.match(await page.locator('#loginVrcAlert').textContent(), /无法获取状态/);
  assert.doesNotMatch(await page.locator('#loginVrcAlert').textContent(), /服务目前存在降级/);
  assert.doesNotMatch(await page.locator('#loginVrcAlert').textContent(), /Major System Outage: API/);
  assert.equal(await page.locator('#loginVrcAlert.bad').count(), 0);
  setOfficialStatus({ httpStatus: 200, description: 'All Systems Operational', indicator: 'none', components: [] });
  advance(60001);
  await request('GET', '/api/vrc-status?focus=1');
  await page.waitForSelector('#lgHealthDot.ok');
  assert.equal(await page.locator('#loginVrcAlert').isVisible(), false);
  assert.equal(await page.locator('#loginVrcAlert.unavailable').count(), 0);
});

test('窗口重新聚焦通过后端刷新, 60 秒内保留当前结果', async (t) => {
  const { page, advance, setOfficialStatus } = await statusDashboard(t);
  await page.waitForSelector('#stHealthDot.ok');
  setOfficialStatus({ description: 'Degraded Performance', indicator: 'minor' });
  const focus = () => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/vrc-status?focus=1'), { timeout: 2000 }),
    page.evaluate(() => window.dispatchEvent(new Event('focus')))
  ]);
  advance(60000);
  await focus();
  assert.equal(await page.locator('#stHealthDot.ok').count(), 1);
  advance(1);
  await focus();
  await page.waitForSelector('#stHealthDot.warn');
});

test('小屏幕竖屏与横屏都能完整查看故障详情', async (t) => {
  const { page } = await statusDashboard(t, { officialStatus: { description: 'Major System Outage', indicator: 'major' } });
  for (const viewport of [{ width: 375, height: 812 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await page.locator('#stServerStatus').focus();
    const rect = await page.locator('#stVrcDetail').boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width, '故障详情应在屏幕内');
  }
});

test('键盘可查看故障详情并用 Escape 收起, 重新聚焦可再次查看', async (t) => {
  const { page } = await statusDashboard(t, { officialStatus: { description: 'Degraded Performance', indicator: 'minor' } });
  await page.locator('#stServerStatus').focus();
  assert.equal(await page.locator('#stVrcDetail').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#stVrcDetail').isVisible(), false);
  await page.locator('#refreshBtn').focus();
  await page.locator('#stServerStatus').focus();
  assert.equal(await page.locator('#stVrcDetail').isVisible(), true);
});

test('浏览器新订阅 SSE 立即收到当前官方状态, 不必等待下一轮探测', async (t) => {
  const { page } = await statusDashboard(t);
  const status = await page.evaluate(() => new Promise(resolve => {
    const events = new EventSource('/api/events?token=lifecycle-token');
    const timer = setTimeout(() => { events.close(); resolve(null); }, 1500);
    events.addEventListener('vrc-status', event => {
      clearTimeout(timer);
      events.close();
      resolve(JSON.parse(event.data));
    }, { once: true });
  }));
  assert.equal(status?.state, 'normal');
});
