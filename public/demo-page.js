'use strict';
// 静态演示(public/demo.html)的浏览器胶水层: 把 public/demomock.js 那套"假后端"接进真实前端。
//   · 拦 fetch      -> /api/* 由假后端应答(含延迟), 其余原样走网络
//   · 换 EventSource -> 伪造 SSE: log / login-progress 等, 与 Node 演示和真实后端同序列
//   · 换 avatarUrl   -> 头像用 data URL(静态站里 <img> 请求拦不到)
//   · 自动登录驱动   -> 与 serve-demo.js 注入的 DRIVER 一模一样, 每次刷新重放登录动画
// 所有状态挂在 window.__vrcDemo 上: document.open()/write() 只换文档, 不换 window, 所以补丁与状态都在。
(function () {
  const PAGE_STATE = window.__vrcDemo || (window.__vrcDemo = { backend: null, subs: new Set(), installed: false, started: false, phase: 'outer' });
  const M = window.VrcDemoMock;
  if (!M) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const params = new URLSearchParams(location.search);
  const LS_KEY = 'vrcnotifier_demo_state';

  // ---------- 假后端实例(配置存 localStorage: 刷新不丢) ----------
  function getBackend() {
    if (PAGE_STATE.backend) return PAGE_STATE.backend;
    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { /* 忽略坏数据 */ }
    const be = M.createBackend({ restored });
    const n = parseInt(params.get('friends') || '', 10);
    if (!isNaN(n) && n > 0) be.friends = Math.min(20000, n);
    PAGE_STATE.backend = be;
    return be;
  }
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(getBackend().dump())); } catch (e) { /* 存不进去就算了 */ }
  }

  // ---------- SSE 广播: 假 EventSource ----------
  function emit(type, data) {
    for (const es of Array.from(PAGE_STATE.subs)) es.__emit(type, data);
  }
  function pushLog(line, level) {
    const rec = getBackend().pushLog(line, level);
    emit('log', rec);
    return rec;
  }
  class FakeEventSource {
    constructor(url) {
      this.url = String(url);
      this.readyState = 0;
      this.onopen = null;
      this.onerror = null;
      this.onmessage = null;
      this.__listeners = {};
      PAGE_STATE.subs.add(this);
      setTimeout(() => {
        if (!PAGE_STATE.subs.has(this)) return;
        this.readyState = 1;
        if (this.onopen) this.onopen({ type: 'open' });
      }, 0);
    }
    addEventListener(type, fn) { (this.__listeners[type] = this.__listeners[type] || []).push(fn); }
    removeEventListener(type, fn) {
      const a = this.__listeners[type];
      if (a) this.__listeners[type] = a.filter((f) => f !== fn);
    }
    __emit(type, data) {
      const frame = { type, data: JSON.stringify(data) };
      for (const fn of (this.__listeners[type] || []).slice()) { try { fn(frame); } catch (e) { /* 单个监听器出错不影响其它 */ } }
      if (type === 'message' && this.onmessage) this.onmessage(frame);
    }
    close() { this.readyState = 2; PAGE_STATE.subs.delete(this); }
  }

  // ---------- 延迟: 与 serve-demo.js 的 T 对齐 ----------
  function delayFor(path, method) {
    if (path === '/api/login') return M.T.login;
    if (path === '/api/session') return M.T.api;
    return M.T.api;
  }
  function toResponse(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  // ---------- 登录第二步: 推 SSE 进度(等待页靠它逐行点亮), 序列与 Node 演示一致 ----------
  async function login2fa(body) {
    const be = getBackend();
    if (String(body.code || '') === '000000') { // 手填时可以用它试失败分支
      await sleep(M.T.verify);
      pushLog('[server] 2FA 验证失败: 验证码错误或已过期', 'warn');
      return toResponse(400, { error: '验证码错误或已过期' });
    }
    await sleep(M.T.verify);
    pushLog('[vrcapi] 完成: POST /auth/twofactorauth/emailotp/verify (200)');
    pushLog('[vrcapi] 完成: GET /auth/user (200)');
    pushLog('[server] 2FA 验证通过: 演示账号, 开始同步好友');
    emit('login-progress', { userId: 'usr_demo_me', stage: 'verified', at: Date.now() });
    await sleep(M.T.auth);
    pushLog('[vrcapi] 完成: GET /auth (200)');
    emit('login-progress', { userId: 'usr_demo_me', stage: 'auth', at: Date.now() });
    await sleep(M.T.roster);
    pushLog('[monitor] 激活用户 演示账号(usr_demo_me)');
    pushLog('[vrcapi] 完成: GET /auth/user (200)');
    pushLog('[monitor] 自己状态 userId=usr_demo_me: state=online status=join me world=' + M.WORLDS[0][0]);
    const total = be.friends;
    emit('login-progress', { userId: 'usr_demo_me', stage: 'roster', total, at: Date.now() });
    // 好友多时压缩每页间隔, 让整段"获取好友信息"仍停在几秒量级(和 Node 演示同一条公式)
    const pageDelay = total > 500 ? Math.max(5, Math.round(4000 / Math.max(1, Math.ceil(total / M.PAGE_SIZE)))) : M.T.page;
    for (let got = 0; got < total; got += M.PAGE_SIZE) {
      await sleep(pageDelay);
      pushLog('[vrcapi] 完成: GET /auth/user/friends (200)');
      emit('login-progress', { userId: 'usr_demo_me', stage: 'friends', fetched: Math.min(total, got + M.PAGE_SIZE), total, at: Date.now() });
    }
    pushLog('[monitor] 首次对账好友资料: 名册 ' + total + ' 人, 拉回 ' + total + ' 条');
    pushLog('[monitor] 快照完成 userId=usr_demo_me, 好友 ' + total + ' 人');
    return toResponse(200, { ok: true, user: M.selfUser() });
  }

  // ---------- 安装补丁(幂等; document.open() 不动 window, 所以第二次执行是空转) ----------
  function install() {
    if (PAGE_STATE.installed) return;
    PAGE_STATE.installed = true;
    const realFetch = window.fetch.bind(window);
    PAGE_STATE.realFetch = realFetch;
    window.fetch = async function (input, init) {
      const raw = typeof input === 'string' ? input : (input && input.url) || String(input);
      let u = null;
      try { u = new URL(raw, location.href); } catch (e) { return realFetch(input, init); }
      if (!u.pathname.startsWith('/api/')) return realFetch(input, init); // 非接口一律原样走
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      let body = {};
      if (init && init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch (e) { body = {}; } }
      const query = {};
      u.searchParams.forEach((v, k) => { query[k] = v; });
      // 真实后端也要花时间: 不秒回, 免得等待动画没得看
      await sleep(delayFor(u.pathname, method));
      if (u.pathname === '/api/login/2fa' && method === 'POST') return login2fa(body);
      if (u.pathname === '/api/logout') return toResponse(200, { ok: true });
      const r = getBackend().route({ method, path: u.pathname, query, body });
      if (method === 'PUT' && /\/config$/.test(u.pathname)) {
        persist(); // 改了就落 localStorage: 刷新页面还在
        const rec = getBackend().logs[getBackend().logs.length - 1];
        if (rec) emit('log', rec); // 后端改了配置会推日志(真实后端也是这样)
      }
      return toResponse(r.status, r.body);
    };
    window.EventSource = FakeEventSource;
  }

  // 头像: net.js 的 avatarUrl() 在渲染每一行时被调用, 这里换成 data URL
  function patchAvatar(retry) {
    if (typeof window.avatarUrl === 'function' && !PAGE_STATE.avatarPatched) {
      const orig = window.avatarUrl;
      window.avatarUrl = (key) => (key ? M.avatarDataUrl(key) : orig(key));
      PAGE_STATE.avatarPatched = true;
      return;
    }
    if ((retry || 0) < 20) setTimeout(() => patchAvatar((retry || 0) + 1), 50);
  }

  // ---------- 自动登录(与 serve-demo.js 注入的 DRIVER 一致; ?manual 则不插手) ----------
  async function drive() {
    if (params.has('manual')) return;
    const el = (id) => document.getElementById(id);
    const waitFor = async (fn, ms) => { const end = Date.now() + (ms || 15000); while (Date.now() < end) { if (fn()) return true; await sleep(80); } return false; };
    await waitFor(() => el('loginBtn') && el('loginView') && !el('loginView').classList.contains('hidden'));
    if (!el('loginUser')) return;
    el('loginUser').value = 'demo';
    el('loginPass').value = 'demo-pass';
    el('rememberMe').checked = false;
    await sleep(700); // 停一下, 看得出这是"人点的登录"
    el('loginBtn').click();
    await waitFor(() => el('twofaForm') && !el('twofaForm').classList.contains('hidden'));
    await sleep(900);
    el('twofaCode').value = '123456';
    el('twofaBtn').click();
    // 之后全由 SSE 的 login-progress 驱动, 这里不再插手
  }

  // ---------- 启动 ----------
  function start() {
    if (PAGE_STATE.started) return;
    PAGE_STATE.started = true;
    getBackend();
    patchAvatar(0);
    drive();
  }

  async function loadAndWrite() {
    const prep = document.getElementById('prep');
    let html = '';
    try {
      const r = await PAGE_STATE.realFetch('index.html', { cache: 'no-store' });
      html = await r.text();
    } catch (e) {
      if (prep) prep.textContent = '加载 index.html 失败: ' + e.message;
      return;
    }
    if (html.indexOf(M.INJECT_ANCHOR) < 0) {
      if (prep) prep.textContent = 'index.html 里找不到注入锚点, 演示无法启动';
      return;
    }
    const inject = M.INJECT_ANCHOR + "\n<script src='demomock.js'></script>\n<script src='demo-page.js'></script>";
    PAGE_STATE.phase = 'injected';
    // index.html 是 no-store 抓的, 但它里面的 js/css 会按静态服务器的缓存策略走(GitHub Pages 默认就有
    // max-age, python http.server 也发 Last-Modified) —— 改了前端之后普通刷新可能还是旧副本,
    // 表现成"演示里新功能完全没有"。给所有本地 js/css 打上一次性版本号, 刷新必拿最新。
    const v = String(Date.now());
    const busted = html.replace(M.INJECT_ANCHOR, inject).replace(/(src|href)='([^']+\.(?:js|css))'/g, "$1='$2?v=" + v + "'");
    document.open();
    document.write(busted);
    document.close();
    setTimeout(start, 0); // 注入后的脚本跑完(avatarUrl 已定义)再启动
  }

  if (PAGE_STATE.phase === 'outer') {
    install();
    loadAndWrite();
  } else {
    // 注入后的第二次执行: 文档是全新的, 补丁还在; 直接启动
    install();
    start();
  }
})();
