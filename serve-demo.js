'use strict';
// 本地测试玩具(不是产品代码, 不进 Docker/打包, 不碰 data/ 与真实实例):
// 一个端口同时当「静态前端 + 假后端」, 页面打开后自动走一遍真实登录流程 ——
// 登录 → 2FA → 后端推 login-progress → 等待页四行点亮 → 主界面,
// 所以【每次刷新都会重放一次登录动画】。
//
//   node serve-demo.js            默认 3100 端口
//   node serve-demo.js 3200       指定端口
//   ?manual                       不自动登录, 自己手填(验证码随便填; 填 000000 走失败分支)
//   ?friends=40                   假好友数量(默认 14), 用来把"获取好友信息"的百分比拉长看
//   ?pages=? 不适用               页大小固定 5, 页数 = ceil(好友数/5)
//
// 前端与假后端同源: public/app.js 的 discoverBase() 同源优先, 所以不用填地址也不用令牌。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.DEMO_PORT || process.argv[2] || 3100);
const ROOT = path.join(__dirname, 'public');
const PAGE_SIZE = 50;           // 进度按"每页 50 个"上报: 150 好友 = 3 次(33/66/100), 14 好友 = 1 次(0→100)
const T = {                     // 各段假耗时(ms), 想调节奏改这里
  api: 700,                     // 普通接口(好友/设置/状态/健康/日志)统一延迟: 让"等待前端就绪"那一步真的在等
  login: 1500,                  // POST /api/login 返回"需要 2FA"
  verify: 2500,                 // 假 VRChat 校验验证码
  auth: 1200,                   // 取实时连接凭据(GET /auth)
  roster: 1200,                 // 读好友名册(me())
  page: 1500,                   // 每页好友(比滚动慢, 停顿看得清)
  avatarBase: 0,                // 头像默认立即返回; 想模拟慢加载再把这几个调大
  avatarStep: 0,                //   (例: 400/60/500 = 错峰几百毫秒到几秒)
  avatarJitter: 0
};

// ---------- 假数据 ----------
const WORLDS = [
  ['wrld_demo_a', '中文吧 Chinese Bar 8.1.5'],
  ['wrld_demo_b', 'The Black Cat'],
  ['wrld_demo_c', 'Midnight Rooftop'],
  ['wrld_demo_d', '私密世界']
];
const NAMES = ['星野桑', '喵杂鱼', '夜行电车', '北极熊', '小满', '阿岚', '雾岛', '青栀', '长夏', '白鹭', '空山', '三日月', '橘子汽水', '半糖去冰', '拾光', '无声铃鹿'];
const TRUST = ['Trusted User', 'Known User', 'User', 'New User', 'Visitor'];

let friendCount = 150; // 默认 150 人 = 3 页: 打开就能看到 33/66/100 三段和中间的停顿(?friends=N 可改)
function makeFriends(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const state = i % 5 === 0 ? 'online' : i % 5 === 1 ? 'active' : 'offline';
    const [worldId, worldName] = WORLDS[i % WORLDS.length];
    const favorite = i % 7 === 3;
    out.push({
      friend_vrchat_id: 'usr_demo_' + String(i).padStart(3, '0'),
      display_name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : ''),
      state,
      status: state === 'online' ? 'join me' : state === 'active' ? 'active' : 'offline',
      status_description: state === 'online' ? '在摸鱼' : null,
      world_id: state === 'offline' ? null : worldId,
      world_name: state === 'offline' ? null : worldName,
      trust_level: TRUST[i % TRUST.length],
      avatarKey: 'file_demo_' + i + '_128_128',
      config: {
        favorite: favorite ? 1 : 0,
        notify_online: 1,
        notify_offline: 1,
        notify_status_change: 0,
        notify_world_change: 0
      }
    });
  }
  return out;
}
const SELF = () => ({
  vrchat_user_id: 'usr_demo_me',
  display_name: '演示账号',
  state: 'online',
  status: 'join me',
  status_description: '本地演示',
  world_id: WORLDS[0][0],
  world_name: WORLDS[0][1],
  trust_level: 'Trusted User',
  avatarKey: 'file_demo_me_128_128'
});

// ---------- SSE ----------
const sseClients = new Set();
const LOG_TAIL = 24;
let logSeq = 0;
let avatarSeq = 0;  // 头像请求序号: 写进图片里, 一眼能看出这是第几次请求(而且每次颜色都不同)
function sse(event, data) {
  const chunk = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (const c of sseClients) { try { c.write(chunk); } catch (e) { sseClients.delete(c); } }
}
function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
// 日志行同时进"历史尾部"和 SSE 实时流, 与真实后端一样
function pushLog(line, level) {
  logSeq++;
  const text = '[' + stamp() + '] [' + (level || 'info') + '] ' + line;
  sse('log', { seq: logSeq, line: text });
  return { seq: logSeq, line: text };
}
function seedLogs() {
  const lines = [
    '[startup] ======== vrcnotifier 运行开始(演示假后端) ========',
    '[startup] 演示模式: 每次刷新都会重放一次登录动画',
    '[server] 访问令牌验证成功',
    '[vrcapi] 完成: GET /auth/user (200)',
    '[server] 登录需要 2FA: username=demo, kinds=emailOtp'
  ];
  const out = lines.map((l) => pushLog(l));
  return out;
}
const TAIL = seedLogs();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

// ---------- 假后端 ----------
function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } });
  });
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  if (p === '/api/config') return json(res, 200, { ok: true, tokenRequired: false, version: 'demo', encryptionEnabled: false, confirmDelayMs: 30000, snapshotIntervalMs: 3600000 });
  // 永远"未登录": 刷新后回到登录页, 驱动脚本再自动登录一次 —— 这就是重放动画的开关
  if (p === '/api/session') { await sleep(T.api); return json(res, 200, { ok: true, loggedIn: false, user: null }); }
  if (p === '/api/demo/config') {
    const body = await readBody(req);
    if (body && typeof body.friends === 'number') friendCount = Math.max(0, Math.min(200, body.friends));
    return json(res, 200, { ok: true, friends: friendCount });
  }

  if (p === '/api/login') {
    await sleep(T.login);
    pushLog('[vrcapi] 完成: GET /auth/user (200)');
    pushLog('[server] 登录需要 2FA: username=demo, kinds=emailOtp');
    return json(res, 200, { ok: true, requiresTwoFactorAuth: ['emailOtp'], tempSessionId: 'demo-' + Date.now() });
  }

  if (p === '/api/login/2fa') {
    const body = await readBody(req);
    await sleep(T.verify);
    if (String(body.code || '') === '000000') { // 手填时可以用它试失败分支
      pushLog('[server] 2FA 验证失败: 验证码错误或已过期', 'warn');
      return json(res, 400, { error: '验证码错误或已过期' });
    }
    // 真实后端此时才记日志+推 verified(等待页在这一刻淡入, 不是点提交时)
    pushLog('[vrcapi] 完成: POST /auth/twofactorauth/emailotp/verify (200)');
    pushLog('[vrcapi] 完成: GET /auth/user (200)');
    pushLog('[server] 2FA 验证通过: 演示账号, 开始同步好友');
    sse('login-progress', { userId: 'usr_demo_me', stage: 'verified', at: Date.now() });

    await sleep(T.auth);
    pushLog('[vrcapi] 完成: GET /auth (200)');
    sse('login-progress', { userId: 'usr_demo_me', stage: 'auth', at: Date.now() });

    await sleep(T.roster);
    pushLog('[monitor] 激活用户 演示账号(usr_demo_me)');
    pushLog('[vrcapi] 完成: GET /auth/user (200)');
    pushLog('[monitor] 自己状态 userId=usr_demo_me: state=online status=join me world=' + WORLDS[0][0]);
    sse('login-progress', { userId: 'usr_demo_me', stage: 'roster', total: friendCount, at: Date.now() });

    for (let got = 0; got < friendCount; got += PAGE_SIZE) {
      await sleep(T.page);
      const fetched = Math.min(friendCount, got + PAGE_SIZE);
      pushLog('[vrcapi] 完成: GET /auth/user/friends (200)');
      sse('login-progress', { userId: 'usr_demo_me', stage: 'friends', fetched, total: friendCount, at: Date.now() });
    }
    pushLog('[monitor] 首次对账好友资料: 名册 ' + friendCount + ' 人, 拉回 ' + friendCount + ' 条');
    pushLog('[monitor] 快照完成 userId=usr_demo_me, 好友 ' + friendCount + ' 人');
    // 响应压在事件之后: 和真实后端一样, 前端要到这一刻才拿到结果
    return json(res, 200, { ok: true, user: SELF() });
  }

  if (p === '/api/logout') return json(res, 200, { ok: true });
  // SSE 与头像必须放在 T.api 延迟之前: 实时通道不能拖, 头像要立即返回
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    sseClients.add(res);
    const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* closed */ } }, 25000);
    req.on('close', () => { clearInterval(ka); sseClients.delete(res); });
    return;
  }
  if (p.startsWith('/api/avatar/')) {
    const key = decodeURIComponent(p.slice('/api/avatar/'.length));
    const m = /file_demo_(\d+)_/.exec(key);
    const idx = m ? Number(m[1]) : -1;                 // -1: 自己
    // 立即返回(不制造延迟); 想把加载做慢就把 T 里 avatarBase/Step/Jitter 调大
    const delay = T.avatarBase + (idx < 0 ? 0 : idx) * T.avatarStep + jitter([0, T.avatarJitter]);
    if (delay > 0) await sleep(delay);
    avatarSeq++;
    // 色相 = 好友下标 + 本次请求序号 → 同一页里互不相同, 每次刷新又都不一样(能看出确实重新取了图)
    const hue = ((idx < 0 ? 210 : idx * 47) + avatarSeq * 29) % 360;
    const ch = idx < 0 ? '我' : (NAMES[idx % NAMES.length] || '?').charAt(0);
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0' stop-color='hsl(" + hue + " 72% 60%)'/>" +
      "<stop offset='1' stop-color='hsl(" + ((hue + 38) % 360) + " 66% 36%)'/>" +
      '</linearGradient></defs>' +
      "<rect width='128' height='128' rx='64' fill='url(#g)'/>" +
      "<text x='64' y='86' font-size='60' font-family='sans-serif' fill='#fff' text-anchor='middle'>" + ch + '</text>' +
      "<text x='122' y='120' font-size='20' font-family='monospace' fill='rgba(255,255,255,.6)' text-anchor='end'>#" + avatarSeq + '</text>' +
      '</svg>';
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
    res.end(svg);
    return;
  }
  await sleep(T.api); // 普通接口统一延迟: 主界面数据/日志/健康都不是秒回
  if (p === '/api/friends') return json(res, 200, { ok: true, friends: makeFriends(friendCount) });
  if (p === '/api/me') return json(res, 200, { ok: true, user: SELF() });
  if (p === '/api/settings') return json(res, 200, { ok: true, settings: { qq_enabled: 0, qq_app_id: '', notify_group_announcement: 1, notify_boop: 1 } });
  if (p === '/api/status') {
    return json(res, 200, {
      ok: true, loggedIn: true, user: SELF(), activeUsers: ['usr_demo_me'],
      wsConnected: true, wsLastMessageAt: Date.now(), qq: { configured: false },
      lastSnapshotAt: Date.now(), pending2faCount: 0,
      config: { confirmDelayMs: 30000, snapshotIntervalMs: 3600000, watchdogMs: 3600000, dedupeWindowMs: 30000 }
    });
  }
  if (p === '/api/health') return json(res, 200, { status: 'ok', latencyMs: 42, serverName: 'demo-vrc', updatedAt: Date.now() });
  if (p === '/api/vrc-status') return json(res, 200, { state: 'normal', description: 'All Systems Operational', summary: '演示数据', fetchedAt: Date.now() });
  if (p === '/api/ws-stats') {
    const series = Array.from({ length: 60 }, () => Math.floor(Math.random() * 6));
    return json(res, 200, { ok: true, total: series.reduce((a, b) => a + b, 0), series });
  }
  if (p === '/api/logs') {
    const n = Math.min(Number(url.searchParams.get('tail') || 100) || 100, TAIL.length);
    return json(res, 200, { ok: true, logs: TAIL.slice(-n) });
  }
  return json(res, 404, { error: '演示后端没有这个接口: ' + p });
}

// ---------- 静态文件(只给 index.html 注入自动登录脚本) ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8'
};

const DRIVER = `(function () {
  var q = new URLSearchParams(location.search);
  if (q.has('manual')) return;                       // ?manual: 自己手填
  var friends = parseInt(q.get('friends') || '', 10);
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var el = function (id) { return document.getElementById(id); };
  async function waitFor(fn, ms) {
    var end = Date.now() + (ms || 15000);
    while (Date.now() < end) { if (fn()) return true; await sleep(80); }
    return false;
  }
  (async function () {
    // ① 等登录页出现(地址探测/门禁/会话检查都走完)
    await waitFor(function () { return el('loginBtn') && !el('loginView').classList.contains('hidden'); });
    if (!isNaN(friends)) { try { await fetch('/api/demo/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friends: friends }) }); } catch (e) {} }
    el('loginUser').value = 'demo';
    el('loginPass').value = 'demo-pass';
    el('rememberMe').checked = false;
    await sleep(700);                                // 停一下, 看得出这是"人点的登录"
    el('loginBtn').click();
    // ② 等两步验证表单, 假装在输入验证码
    await waitFor(function () { return !el('twofaForm').classList.contains('hidden'); });
    await sleep(900);
    el('twofaCode').value = '123456';
    el('twofaBtn').click();
    // ③ 之后全由后端 SSE 的 login-progress 事件驱动, 脚本不再插手
  })();
})();`;

function serveStatic(req, res, url) {
  let p = url.pathname;
  if (p === '/demo-driver.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
    res.end(DRIVER);
    return;
  }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    let body = data;
    if (p === '/index.html') {
      body = Buffer.from(String(data).replace('</body>', "<script src='/demo-driver.js'></script>\n</body>"), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) { res.writeHead(400); res.end('Bad Request'); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' }); res.end(); return; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => { try { json(res, 500, { error: e.message }); } catch (e2) { /* 已发头 */ } });
    return;
  }
  serveStatic(req, res, url);
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('[demo] 前端+假后端: http://127.0.0.1:' + PORT + '/');
    console.log('[demo] 每次刷新重放登录动画; ?manual 手动填, ?friends=40 拉长好友进度');
  });
}
module.exports = { server };
