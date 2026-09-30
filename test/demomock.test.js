'use strict';
// 浏览器内假后端(public/demomock.js): 好友构成 / 配置落库 / 路由。
// 抽出来单测的原因: 这是"静态站也能开演示"的核心, 路由和配置语义必须和真实后端一致,
// 而这些在浏览器里点一遍很慢、也很难覆盖边界。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../public/demomock');

const NAMES = ['星野桑', '喵杂鱼'];

test('stateAt: 6:3:1 交错(在线:网页在线:离线), 5000 人正好是 500/1500/3000', () => {
  const c = { online: 0, active: 0, offline: 0 };
  for (let i = 0; i < 5000; i++) c[M.stateAt(i)]++;
  assert.deepEqual(c, { online: 500, active: 1500, offline: 3000 });
  assert.equal(M.stateAt(0), 'online');
  assert.equal(M.stateAt(1), 'active');
  assert.equal(M.stateAt(4), 'offline');
});

test('makeFriends: 数量/字段/config 都对, 默认特别关注按 FAV_EVERY/FAV_REM 稀疏撒', () => {
  const be = M.createBackend({ friends: 10 });
  const list = be.route({ method: 'GET', path: '/api/friends' }).body.friends;
  assert.equal(list.length, 10);
  assert.equal(list[0].friend_vrchat_id, 'usr_demo_000');
  assert.equal(list[0].state, 'online');
  assert.equal(list[3].config.favorite, 1); // 3 % FAV_EVERY === FAV_REM
  assert.equal(list[0].config.favorite, 0);
  assert.equal(list[0].config.notify_online, 1);
  assert.equal(list[0].world_name === null, false); // 在线的人要有世界
  assert.equal(list[4].world_name, null);           // 离线的人没有世界
});

test('默认特别关注必须稀疏: 5000 人里只有一小撮(否则演示里"换组落位"永远在屏幕外)', () => {
  const be = M.createBackend({ friends: 5000 });
  const list = be.route({ method: 'GET', path: '/api/friends' }).body.friends;
  const favs = list.filter((f) => f.config.favorite === 1);
  assert.ok(favs.length >= 5 && favs.length <= 20, '特别关注数量应在几个人量级, 实为 ' + favs.length);
  // 特别关注组是列表最上面那一组: 它的高度必须小于一屏, 否则同屏落位看不见
  const groupPx = favs.length * 61 + 46; // 行高 + 标题
  assert.ok(groupPx < 900, '特别关注组高度应小于一屏(720), 实为 ' + groupPx + 'px');
  // 稀疏且要落在不同状态里(451 与 10 互质)
  const states = new Set(favs.map((f) => f.state));
  assert.ok(states.size >= 2, '特别关注不该全挤在同一种状态: ' + Array.from(states).join(','));
  assert.equal(M.FAV_EVERY, 451);
  assert.equal(M.FAV_REM, 3);
});

test('配置落库: PUT 之后 GET /api/friends 带的就是改过的值', () => {
  const be = M.createBackend({ friends: 20 });
  const r = be.route({ method: 'PUT', path: '/api/friends/usr_demo_000/config', body: { favorite: true, notifyOnline: false, notifyOffline: true, notifyStatusChange: true, notifyWorldChange: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.deepStrictEqual(r.body.config, { favorite: 1, notify_online: 0, notify_offline: 1, notify_status_change: 1, notify_world_change: 0 });
  assert.strictEqual(typeof r.body.config.favorite, 'number', '必须是数字: 前端用 favorite === 1 判分组');
  const again = be.route({ method: 'GET', path: '/api/friends' }).body.friends.find((f) => f.friend_vrchat_id === 'usr_demo_000');
  assert.deepStrictEqual(again.config, r.body.config);
});

test('配置语义与真实后端一致: 没传的 notify* 视为 true', () => {
  const be = M.createBackend({ friends: 5 });
  const r = be.route({ method: 'PUT', path: '/api/friends/usr_demo_001/config', body: { favorite: true } });
  assert.equal(r.body.config.favorite, 1);
  assert.strictEqual(r.body.config.notify_online, 1);
  assert.strictEqual(r.body.config.notify_status_change, 1);
  assert.strictEqual(r.body.config.favorite, 1);
});

test('改配置会写一条和真实后端同格式的日志', () => {
  const be = M.createBackend({ friends: 5 });
  be.route({ method: 'PUT', path: '/api/friends/usr_demo_000/config', body: { favorite: true, notifyOnline: true, notifyOffline: false, notifyStatusChange: false, notifyWorldChange: false } });
  const last = be.logs[be.logs.length - 1];
  assert.match(last.line, /\[server\] 更新监控配置: 好友=.+, 特别关注=开, 上线=1, 下线=0, 状态=0, 世界=0/);
});

test('dump/restore: 配置能存进 localStorage 再读回来(刷新不丢)', () => {
  const be = M.createBackend({ friends: 5 });
  be.route({ method: 'PUT', path: '/api/friends/usr_demo_003/config', body: { favorite: true, notifyOnline: false, notifyOffline: false, notifyStatusChange: false, notifyWorldChange: false } });
  const saved = JSON.stringify(be.dump());
  const be2 = M.createBackend({ friends: 5, restored: JSON.parse(saved) });
  assert.strictEqual(be2.route({ method: 'GET', path: '/api/friends' }).body.friends[3].config.favorite, 1);
  assert.equal(be2.route({ method: 'GET', path: '/api/friends' }).body.friends[3].config.notify_online, 0);
});

test('restore: 旧 localStorage 里的布尔配置会被归一化成 0/1(true 不进特别关注组那个坑)', () => {
  const be = M.createBackend({ friends: 5, restored: { configs: [['usr_demo_000', { favorite: true, notify_online: false, notify_offline: 1, notify_status_change: 0, notify_world_change: 1 }]] } });
  const cfg = be.route({ method: 'GET', path: '/api/friends' }).body.friends[0].config;
  assert.deepStrictEqual(cfg, { favorite: 1, notify_online: 0, notify_offline: 1, notify_status_change: 0, notify_world_change: 1 });
});

test('reset: 回到默认(和 Node 演示的 /api/demo/reset 一样)', () => {
  const be = M.createBackend({ friends: 5 });
  be.route({ method: 'PUT', path: '/api/friends/usr_demo_000/config', body: { favorite: true } });
  be.route({ method: 'POST', path: '/api/demo/reset' });
  assert.equal(be.route({ method: 'GET', path: '/api/friends' }).body.friends[0].config.favorite, 0);
});

test('route: 会话永远"未登录"(靠这个每次刷新重放登录动画)', () => {
  const be = M.createBackend({ friends: 5 });
  assert.deepEqual(be.route({ method: 'GET', path: '/api/session' }).body, { ok: true, loggedIn: false, user: null });
});

test('route: 登录两步 / 2FA 失败分支 / 未知路径 404', () => {
  const be = M.createBackend({ friends: 5 });
  const l = be.route({ method: 'POST', path: '/api/login', body: {} });
  assert.deepEqual(l.body.requiresTwoFactorAuth, ['emailOtp']);
  assert.equal(be.route({ method: 'POST', path: '/api/login/2fa', body: { code: '000000' } }).status, 400);
  const ok = be.route({ method: 'POST', path: '/api/login/2fa', body: { code: '123456' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.user.vrchat_user_id, 'usr_demo_me');
  assert.equal(be.route({ method: 'GET', path: '/api/nope' }).status, 404);
});

test('route: 主界面要用的那些接口都在', () => {
  const be = M.createBackend({ friends: 5 });
  for (const p of ['/api/me', '/api/settings', '/api/status', '/api/health', '/api/vrc-status', '/api/ws-stats', '/api/config']) {
    const r = be.route({ method: 'GET', path: p });
    assert.equal(r.status, 200, p + ' 应该有响应');
    assert.equal(r.body.ok === undefined ? true : r.body.ok, true, p + ' 应 ok');
  }
  assert.equal(be.route({ method: 'GET', path: '/api/logout' }).body.ok, true);
  assert.ok(Array.isArray(be.route({ method: 'GET', path: '/api/logs', query: { tail: '10' } }).body.logs));
});

test('头像: 静态站里 <img> 拦不到, 所以直接用 data URL', () => {
  const u = M.avatarDataUrl('file_demo_7_128_128');
  assert.match(u, /^data:image\/svg\+xml/);
  assert.match(decodeURIComponent(u), /星|喵|<\w+/);
});

test('demo.html 的注入锚点必须和 index.html 对得上(否则静态演示起不来)', () => {
  const root = path.join(__dirname, '..', 'public');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const demo = fs.readFileSync(path.join(root, 'demo.html'), 'utf8');
  assert.ok(index.includes(M.INJECT_ANCHOR), 'index.html 里应有注入锚点: ' + M.INJECT_ANCHOR);
  assert.ok(demo.includes('demomock.js') && demo.includes('demo-page.js'), 'demo.html 要引 mock 两个文件');
  assert.ok(fs.existsSync(path.join(root, 'demo-page.js')), 'demo-page.js 应存在');
});
