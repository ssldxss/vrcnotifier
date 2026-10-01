'use strict';
// 本地测试玩具(不是产品代码, 不进 Docker/打包, 不碰 data/ 与真实实例):
// 一个端口同时当「静态前端 + 假后端」, 页面打开后自动走一遍真实登录流程 ——
// 登录 → 2FA → 后端推 login-progress → 等待页四行点亮 → 主界面,
// 所以【每次刷新都会重放一次登录动画】。
//
//   node serve-demo.js            默认 3100 端口
//   node serve-demo.js 3200       指定端口
//   ?manual                       不自动登录, 自己手填(验证码随便填; 填 000000 走失败分支)
//   ?friends=40                   假好友数量(默认 5000), 用来把"获取好友信息"的百分比拉长看
//   ?friends=20000                压测更大列表(上限 20000); 量大时每页间隔自动压缩, 整段仍约 4 秒
//   DEMO_FRIENDS=5000             同上, 但作为服务端默认值(URL 不带 ?friends= 时生效)
//   ?pages=? 不适用               页大小固定 50, 页数 = ceil(好友数/50)
//   POST /api/demo/reset          重置演示数据(好友通知设置/特别关注回默认; 对照脚本每次采集前会调)
//
// 好友构成默认 5000 = 3000 离线 + 1500 网页在线 + 500 在线(比例 6:3:1, 按 i%10 交错分配, 数量精确)。
// 好友通知设置与「特别关注」**真的能改**: PUT /api/friends/:id/config 写进本进程的内存表,
// 之后 GET /api/friends 会带上改过的 config(响应/日志与真实后端 src/server.js 同口径), 刷新页面不丢。
// (演示后端与真实后端一样是"进程内状态"; 重启 serve-demo.js 就回到默认值。)
//
// 前端与假后端同源: public/app.js 的 discoverBase() 同源优先, 所以不用填地址也不用令牌。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
// 与浏览器内假后端(public/demomock.js)共用同一份"逐好友配置"语义, 免得两边各写一遍再慢慢漂移。
// demomock 是 UMD: 浏览器挂 window.VrcDemoMock, Node 里直接 require。
const DemoMock = require('./public/demomock.js');

const PORT = Number(process.env.DEMO_PORT || process.argv[2] || 3100);
// DEMO_ROOT 可切到别的前端副本(如 .verify/frontend-baseline), 用来和新前端并排对照
const ROOT = path.resolve(process.env.DEMO_ROOT || path.join(__dirname, 'public'));
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

// 默认 5000 人(60% 离线 / 30% 网页在线 / 10% 在线)。
// ?friends=N 只影响**当前访客**(写 cookie), 不会改掉服务端默认值 —— 否则一次压测就会把演示的默认改掉。
const envFriends = Math.floor(Number(process.env.DEMO_FRIENDS));
const defaultFriendCount = Number.isFinite(envFriends) && envFriends > 0 ? Math.min(20000, envFriends) : 5000;
let friendCount = defaultFriendCount;
const FRIENDS_COOKIE = 'demo_friends';
function cookieValue(req, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec((req && req.headers && req.headers.cookie) || '');
  return m ? decodeURIComponent(m[1]) : null;
}
// 每个请求用哪个好友数: 访客 cookie 优先, 否则服务端默认
function friendCountFor(req) {
  const raw = cookieValue(req, FRIENDS_COOKIE);
  const n = Math.floor(Number(raw));
  if (raw !== null && Number.isFinite(n) && n > 0) return Math.max(0, Math.min(20000, n));
  return friendCount;
}
// 好友通知设置的内存表(演示后端 = 真实后端那样"进程内状态"): friendId -> config
const friendConfigs = new Map();
// 默认配置: 特别关注只挑一小撮, 上线/下线通知开, 状态/世界通知关(与前端默认一致)。
// 为什么要"一小撮": 真机上一个人的特别关注就是几个人, 而特别关注组是列表最上面那一组 ——
// 如果撒成 14%(旧值 i%7===3, 5000 人里 714 个), 这一组本身就高 4.3 万像素,
// 「好友换组」的滑动落位永远落在屏幕外, 演示里就只剩"飞出视口"那一下, 看着像没有动画。
// 451 与 10 互质 → 11 个特别关注会均匀落在在线/网页在线/离线三种状态里。
const FAV_EVERY = 451;
const FAV_REM = 3;
// 默认配置: 特别关注按上面的规则撒, 上线/下线通知开, 状态/世界通知关, 网页上线关(与前端默认一致)
function defaultConfigAt(i) {
  return {
    favorite: i % FAV_EVERY === FAV_REM ? 1 : 0,
    notify_online: 1,
    notify_web_online: 0,
    notify_offline: 1,
    notify_status_change: 0,
    notify_world_change: 0
  };
}
function idAt(i) { return 'usr_demo_' + String(i).padStart(3, '0'); }
function configOf(id, i) {
  const saved = friendConfigs.get(id);
  return saved ? { ...saved } : defaultConfigAt(i);
}
// 好友构成: 每 10 个一组 = 1 在线 + 3 网页在线 + 6 离线。
// 这样 5000 人正好是 500 / 1500 / 3000(用户要的分布), 而且是交错的、不是一段一段。
function stateAt(i) {
  const slot = i % 10;
  if (slot === 0) return 'online';
  if (slot <= 3) return 'active';
  return 'offline';
}
function makeFriends(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const state = stateAt(i);
    const [worldId, worldName] = WORLDS[i % WORLDS.length];
    out.push({
      friend_vrchat_id: idAt(i),
      display_name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : ''),
      state,
      status: state === 'online' ? 'join me' : state === 'active' ? 'active' : 'offline',
      status_description: state === 'online' ? '在摸鱼' : null,
      world_id: state === 'offline' ? null : worldId,
      world_name: state === 'offline' ? null : worldName,
      trust_level: TRUST[i % TRUST.length],
      avatarKey: 'file_demo_' + i + '_128_128',
      config: configOf(idAt(i), i)
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
// 日志行同时进"历史尾部"和 SSE 实时流, 与真实后端一样(之前只推了 SSE: 刷新后 GET /api/logs 看不到新日志)
const TAIL = [];
const TAIL_MAX = 200;
function pushLog(line, level) {
  logSeq++;
  const text = '[' + stamp() + '] [' + (level || 'info') + '] ' + line;
  const rec = { seq: logSeq, line: text };
  TAIL.push(rec);
  if (TAIL.length > TAIL_MAX) TAIL.splice(0, TAIL.length - TAIL_MAX);
  sse('log', { seq: logSeq, line: text });
  return rec;
}
[ '[startup] ======== vrcnotifier 运行开始(演示假后端) ========',
  '[startup] 演示模式: 每次刷新都会重放一次登录动画',
  '[server] 访问令牌验证成功',
  '[vrcapi] 完成: GET /auth/user (200)',
  '[server] 登录需要 2FA: username=demo, kinds=emailOtp'
].forEach((l) => pushLog(l));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

// ---------- 假后端 ----------
function json(res, code, body, headers) {
  const data = JSON.stringify(body);
  const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Content-Length': Buffer.byteLength(data) };
  if (headers) for (const k of Object.keys(headers)) h[k] = headers[k];
  res.writeHead(code, h);
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
  // 重置演示数据(好友通知设置/特别关注回到默认): 对照脚本每次采集前会调它, 保证两边起点一致
  if (p === '/api/demo/reset') {
    friendConfigs.clear();
    pushLog('[startup] 演示数据已重置: 好友通知设置/特别关注回到默认值');
    return json(res, 200, { ok: true });
  }
  if (p === '/api/demo/config') {
    const body = await readBody(req);
    // 只给当前访客写 cookie: 否则一次 ?friends=150 的压测会把演示的默认好友数永久改掉
    if (body && typeof body.friends === 'number') {
      const n = Math.max(0, Math.min(20000, Math.floor(body.friends)));
      return json(res, 200, { ok: true, friends: n }, { 'Set-Cookie': FRIENDS_COOKIE + '=' + n + '; Path=/; SameSite=Lax; Max-Age=86400' });
    }
    if (body && body.friends === null) {
      return json(res, 200, { ok: true, friends: friendCount }, { 'Set-Cookie': FRIENDS_COOKIE + '=; Path=/; SameSite=Lax; Max-Age=0' });
    }
    return json(res, 200, { ok: true, friends: friendCountFor(req) });
  }

  if (p === '/api/login') {
    await sleep(T.login);
    pushLog('[vrcapi] 完成: GET /auth/user (200)');
    pushLog('[server] 登录需要 2FA: username=demo, kinds=emailOtp');
    return json(res, 200, { ok: true, requiresTwoFactorAuth: ['emailOtp'], tempSessionId: 'demo-' + Date.now() });
  }

  if (p === '/api/login/2fa') {
    const body = await readBody(req);
    const nFriends = friendCountFor(req); // 本访客的好友数(进度按它上报)
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
    sse('login-progress', { userId: 'usr_demo_me', stage: 'roster', total: nFriends, at: Date.now() });

    // 每页间隔: 好友多时压缩等待, 让整段"获取好友信息"仍停在几秒量级
    // (5000 人 = 100 页, 若照旧 1500ms/页 要 150 秒才加载完)
    const pageDelayMs = nFriends > 500
      ? Math.max(5, Math.round(4000 / Math.max(1, Math.ceil(nFriends / PAGE_SIZE))))
      : T.page;
    for (let got = 0; got < nFriends; got += PAGE_SIZE) {
      await sleep(pageDelayMs);
      const fetched = Math.min(nFriends, got + PAGE_SIZE);
      pushLog('[vrcapi] 完成: GET /auth/user/friends (200)');
      sse('login-progress', { userId: 'usr_demo_me', stage: 'friends', fetched, total: nFriends, at: Date.now() });
    }
    pushLog('[monitor] 首次对账好友资料: 名册 ' + nFriends + ' 人, 拉回 ' + nFriends + ' 条');
    pushLog('[monitor] 快照完成 userId=usr_demo_me, 好友 ' + nFriends + ' 人');
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
  if (p === '/api/friends') return json(res, 200, { ok: true, friends: makeFriends(friendCountFor(req)) });
  // 好友通知设置 / 特别关注: 与真实后端(src/server.js 的 PUT /api/friends/:friendId/config)同口径 ——
  // 同样的请求体、同样的响应形状({ok, config})、同样记一条日志; 差别只是"库"是本进程的内存表。
  const mCfg = /^\/api\/friends\/([^/]+)\/config$/.exec(p);
  if (mCfg) {
    if (req.method !== 'PUT') return json(res, 405, { error: '只支持 PUT' });
    const fid = decodeURIComponent(mCfg[1]);
    const body = await readBody(req);
    const idx = (() => { const m = /([0-9]+)$/.exec(fid); return m ? Number(m[1]) : 0; })();
    // 不存在的好友: 与真实后端同口径 404 + 一条日志(不能假装成功)
    if (fid !== idAt(idx) || idx >= friendCountFor(req)) {
      pushLog('[server] 更新监控配置失败: 好友不存在 id=' + fid);
      return json(res, 404, { error: '好友不存在' });
    }
    // 不传不动: 只改显式传了的字段, 没传的保持原值(旧行为是"没传的 notify* 一律视为开")
    const cfg = DemoMock.patchConfig(friendConfigs.get(fid) || defaultConfigAt(idx), body);
    friendConfigs.set(fid, cfg);
    const name = NAMES[idx % NAMES.length] + (idx >= NAMES.length ? ' ' + (Math.floor(idx / NAMES.length) + 1) : '');
    pushLog('[server] 更新监控配置: 好友=' + name + ', 特别关注=' + (cfg.favorite ? '开' : '关') +
      ', 上线=' + cfg.notify_online + ', 网页上线=' + cfg.notify_web_online +
      ', 下线=' + cfg.notify_offline + ', 状态=' + cfg.notify_status_change + ', 世界=' + cfg.notify_world_change);
    return json(res, 200, { ok: true, config: configOf(fid, idx) });
  }
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
