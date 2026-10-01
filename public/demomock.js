'use strict';
// 浏览器内的"假后端"纯逻辑(静态演示 public/demo.html 用):
// 好友数据 / 好友通知设置与「特别关注」的存储 / 各接口的响应 —— 与 Node 版演示(serve-demo.js)
// 以及真实后端(src/server.js)保持同一套语义, 但状态放在浏览器里(localStorage 持久化)。
// 这里不碰 DOM 也不装拦截器: 那些在 public/demo-page.js, 这一层可单测(test/demomock.test.js)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VrcDemoMock = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_FRIENDS = 5000;                              // 3000 离线 + 1500 网页在线 + 500 在线
  const INJECT_ANCHOR = "<script src='base.js'></script>";   // demo.html 把 mock 脚本插在这行后面
  const PAGE_SIZE = 50;
  // 默认特别关注: 每 451 人挑 1 个(i ≡ 3)。**别改密**: 特别关注组是列表最上面那一组,
  // 撒到 14%(旧值 i%7===3)时 5000 人里有 714 个、组高 4.3 万像素, 「好友换组」的滑动落位
  // 永远在屏幕外, 演示里看着就像"没有位移动画"。451 与 10 互质 → 11 个均匀落在三种状态里。
  // 这一对常量与 serve-demo.js 的 FAV_EVERY/FAV_REM 必须一致。
  const FAV_EVERY = 451;
  const FAV_REM = 3;
  const T = { api: 700, login: 1500, verify: 2500, auth: 1200, roster: 1200, page: 1500 };
  const NAMES = ['星野桑', '喵杂鱼', '夜行电车', '北极熊', '小满', '阿岚', '雾岛', '青栀', '长夏', '白鹭', '空山', '三日月', '橘子汽水', '半糖去冰', '拾光', '无声铃鹿'];
  const WORLDS = [
    ['wrld_demo_a', '中文吧 Chinese Bar 8.1.5'],
    ['wrld_demo_b', 'The Black Cat'],
    ['wrld_demo_c', 'Midnight Rooftop'],
    ['wrld_demo_d', '私密世界']
  ];
  const TRUST = ['Trusted User', 'Known User', 'User', 'New User', 'Visitor'];

  // 每 10 个一组 = 1 在线 + 3 网页在线 + 6 离线(交错), 5000 人正好 500/1500/3000
  function stateAt(i) {
    const s = i % 10;
    if (s === 0) return 'online';
    if (s <= 3) return 'active';
    return 'offline';
  }
  function idAt(i) { return 'usr_demo_' + String(i).padStart(3, '0'); }
  function nameAt(i) { return NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : ''); }
  function indexOfId(id) { const m = /([0-9]+)$/.exec(String(id || '')); return m ? Number(m[1]) : 0; }
  function defaultConfig(i) {
    // 特别关注只挑一小撮(与 serve-demo.js 的 FAV_EVERY/FAV_REM 保持一致):
    // 撒太密的话特别关注组本身就有几万像素高, 「好友换组」的滑动落位永远在屏幕外。
    return { favorite: i % FAV_EVERY === FAV_REM ? 1 : 0, notify_online: 1, notify_offline: 1, notify_status_change: 0, notify_world_change: 0 };
  }
  function friendAt(i, config) {
    const state = stateAt(i);
    const w = WORLDS[i % WORLDS.length];
    return {
      friend_vrchat_id: idAt(i),
      display_name: nameAt(i),
      state,
      status: state === 'online' ? 'join me' : state === 'active' ? 'active' : 'offline',
      status_description: state === 'online' ? '在摸鱼' : null,
      world_id: state === 'offline' ? null : w[0],
      world_name: state === 'offline' ? null : w[1],
      trust_level: TRUST[i % TRUST.length],
      avatarKey: 'file_demo_' + i + '_128_128',
      config
    };
  }
  function selfUser() {
    const w = WORLDS[0];
    return {
      vrchat_user_id: 'usr_demo_me', display_name: '演示账号', state: 'online', status: 'join me',
      status_description: '浏览器内演示', world_id: w[0], world_name: w[1],
      trust_level: 'Trusted User', avatarKey: 'file_demo_me_128_128'
    };
  }
  // 请求体 → 新配置(存库形态)。与真实后端(src/server.js)一致: 只有显式传了的字段才改,
  // 没传的保持原值(旧行为是"没传的 notify* 一律视为 true", 与"新好友默认全关"正好相反)。
  // 注意存的是 0/1 而不是布尔: 前端判定分组用的是 favorite === 1(严格), 给 true 会不进特别关注组
  // (这个坑真踩过 —— 一开始用布尔, 界面刷新后那行就掉回原组了; 单测用宽松 deepEqual 还放过了它)
  function patchConfig(cur, body) {
    const c = normalizeConfig(cur);
    const b = body || {};
    const on = (v, dflt) => ((v === undefined ? dflt : !!v) ? 1 : 0);
    return {
      favorite: on(b.favorite, c.favorite),
      notify_online: on(b.notifyOnline, c.notify_online),
      notify_offline: on(b.notifyOffline, c.notify_offline),
      notify_status_change: on(b.notifyStatusChange, c.notify_status_change),
      notify_world_change: on(b.notifyWorldChange, c.notify_world_change)
    };
  }
  // 存库形态归一化: localStorage 里可能是旧版本写的布尔值, 恢复时统一成 0/1
  function normalizeConfig(c) {
    const d = defaultConfig(0);
    if (!c) return d;
    const on = (v, dflt) => (v === undefined || v === null ? dflt : (v ? 1 : 0));
    return {
      favorite: c.favorite ? 1 : 0,
      notify_online: on(c.notify_online, d.notify_online),
      notify_offline: on(c.notify_offline, d.notify_offline),
      notify_status_change: on(c.notify_status_change, d.notify_status_change),
      notify_world_change: on(c.notify_world_change, d.notify_world_change)
    };
  }

  // 静态站里 <img src=/api/avatar/...> 拦不到(图片请求不走 fetch), 所以头像直接用 data URL
  function avatarDataUrl(key) {
    const m = /file_demo_(\d+)_/.exec(String(key || ''));
    const idx = m ? Number(m[1]) : -1;
    const hue = idx < 0 ? 210 : (idx * 47) % 360;
    const ch = idx < 0 ? '我' : (NAMES[idx % NAMES.length] || '?').charAt(0);
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>" +
      "<rect width='128' height='128' rx='64' fill='hsl(" + hue + ",45%,42%)'/>" +
      "<text x='64' y='84' font-size='58' text-anchor='middle' fill='#fff' font-family='sans-serif'>" + ch + '</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function stamp(ts) {
    const d = new Date(ts);
    const p = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  const SEED_LINES = [
    '[startup] ======== vrcnotifier 运行开始(浏览器内假后端) ========',
    '[startup] 演示模式: 每次刷新都会重放一次登录动画',
    '[server] 访问令牌验证成功',
    '[vrcapi] 完成: GET /auth/user (200)',
    '[server] 登录需要 2FA: username=demo, kinds=emailOtp'
  ];

  /** 假后端实例: 好友数 + 配置表 + 日志, 以及路由 */
  function createBackend(opts) {
    const o = opts || {};
    const now = o.now || (() => Date.now());
    const state = {
      friends: Number.isFinite(o.friends) && o.friends > 0 ? Math.min(20000, Math.floor(o.friends)) : DEFAULT_FRIENDS,
      configs: new Map()
    };
    if (o.restored && Array.isArray(o.restored.configs)) {
      for (const pair of o.restored.configs) if (Array.isArray(pair)) state.configs.set(String(pair[0]), normalizeConfig(pair[1]));
    }
    const logs = [];
    const pushLog = (line, level) => {
      const rec = { seq: logs.length + 1, line: '[' + stamp(now()) + '] [' + (level || 'info') + '] ' + line };
      logs.push(rec);
      if (logs.length > 200) logs.splice(0, logs.length - 200);
      return rec;
    };
    SEED_LINES.forEach((l) => pushLog(l));
    const configOf = (id, i) => {
      const saved = state.configs.get(id);
      return saved ? { ...saved } : defaultConfig(i);
    };
    const makeFriends = (n) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push(friendAt(i, configOf(idAt(i), i)));
      return out;
    };
    function route(req) {
      const method = String((req && req.method) || 'GET').toUpperCase();
      const path = String((req && req.path) || '');
      const q = (req && req.query) || {};
      const body = (req && req.body) || {};
      if (path === '/api/config') return { status: 200, body: { ok: true, tokenRequired: false, version: 'demo-web', encryptionEnabled: false, confirmDelayMs: 30000, snapshotIntervalMs: 3600000 } };
      // 永远"未登录": 刷新后回到登录页, 靠页面里的驱动脚本再自动登录一次 —— 这就是重放动画的开关
      if (path === '/api/session') return { status: 200, body: { ok: true, loggedIn: false, user: null } };
      if (path === '/api/login') return { status: 200, body: { ok: true, requiresTwoFactorAuth: ['emailOtp'], tempSessionId: 'demo-' + now() } };
      if (path === '/api/login/2fa') {
        if (String(body.code || '') === '000000') return { status: 400, body: { error: '验证码错误或已过期' } };
        return { status: 200, body: { ok: true, user: selfUser() } };
      }
      if (path === '/api/logout') return { status: 200, body: { ok: true } };
      if (path === '/api/demo/config') {
        if (body && typeof body.friends === 'number') state.friends = Math.max(0, Math.min(20000, Math.floor(body.friends)));
        return { status: 200, body: { ok: true, friends: state.friends } };
      }
      if (path === '/api/demo/reset') {
        state.configs.clear();
        pushLog('[startup] 演示数据已重置: 好友通知设置/特别关注回到默认值');
        return { status: 200, body: { ok: true } };
      }
      if (path === '/api/friends' && method === 'GET') return { status: 200, body: { ok: true, friends: makeFriends(state.friends) } };
      const mCfg = /^\/api\/friends\/([^/]+)\/config$/.exec(path);
      if (mCfg && method === 'PUT') {
        const fid = decodeURIComponent(mCfg[1]);
        const i = indexOfId(fid);
        if (fid !== idAt(i) || i >= state.friends) {
          pushLog('[server] 更新监控配置失败: 好友不存在 id=' + fid);
          return { status: 404, body: { error: '好友不存在' } };
        }
        const cfg = patchConfig(configOf(fid, i), body);
        state.configs.set(fid, cfg);
        pushLog('[server] 更新监控配置: 好友=' + nameAt(i) + ', 特别关注=' + (cfg.favorite ? '开' : '关') +
          ', 上线=' + (cfg.notify_online ? 1 : 0) + ', 下线=' + (cfg.notify_offline ? 1 : 0) +
          ', 状态=' + (cfg.notify_status_change ? 1 : 0) + ', 世界=' + (cfg.notify_world_change ? 1 : 0));
        return { status: 200, body: { ok: true, config: configOf(fid, i) } };
      }
      if (path === '/api/me') return { status: 200, body: { ok: true, user: selfUser() } };
      if (path === '/api/settings') return { status: 200, body: { ok: true, settings: { qq_enabled: 0, qq_app_id: '', notify_group_announcement: 1, notify_boop: 1 } } };
      if (path === '/api/status') {
        return {
          status: 200,
          body: {
            ok: true, loggedIn: true, user: selfUser(), activeUsers: ['usr_demo_me'],
            wsConnected: true, wsLastMessageAt: now(), qq: { configured: false },
            lastSnapshotAt: now(), pending2faCount: 0,
            config: { confirmDelayMs: 30000, snapshotIntervalMs: 3600000, watchdogMs: 3600000, dedupeWindowMs: 30000 }
          }
        };
      }
      if (path === '/api/health') return { status: 200, body: { status: 'ok', latencyMs: 42, serverName: 'demo-web', updatedAt: now() } };
      if (path === '/api/vrc-status') return { status: 200, body: { state: 'normal', description: 'All Systems Operational', summary: '浏览器内演示数据', fetchedAt: now() } };
      if (path === '/api/ws-stats') {
        const series = [];
        for (let i = 0; i < 60; i++) series.push(Math.floor(Math.random() * 6));
        return { status: 200, body: { ok: true, total: series.reduce((a, b) => a + b, 0), series } };
      }
      if (path === '/api/logs') {
        const n = Math.min(Number(q.tail || 100) || 100, logs.length);
        return { status: 200, body: { ok: true, logs: logs.slice(-n) } };
      }
      return { status: 404, body: { error: '浏览器内假后端没有这个接口: ' + path } };
    }
    return {
      route,
      logs,
      pushLog,
      dump: () => ({ friends: state.friends, configs: Array.from(state.configs.entries()) }),
      restore: (data) => {
        if (!data) return;
        if (Number.isFinite(data.friends) && data.friends > 0) state.friends = Math.min(20000, Math.floor(data.friends));
        state.configs = new Map((data.configs || []).map((p) => [String(p[0]), p[1]]));
      },
      get friends() { return state.friends; },
      set friends(n) { state.friends = n; }
    };
  }

  return {
    DEFAULT_FRIENDS, INJECT_ANCHOR, PAGE_SIZE, T,
    FAV_EVERY, FAV_REM,
    NAMES, WORLDS, TRUST, SEED_LINES,
    stateAt, idAt, nameAt, defaultConfig, normalizeConfig, friendAt, selfUser, patchConfig, avatarDataUrl, stamp,
    createBackend
  };
});
