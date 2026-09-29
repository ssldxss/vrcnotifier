'use strict';
// 与后端的全部往来: 地址与令牌、api() 封装、地址探测、访问密钥门禁、连接心跳弹窗、SSE 连接与事件分发。
// 从 app.js 拆出; 本文件仍是传统脚本、函数保持全局, 所以其它文件里的调用点无需改动。

let discoveredBase = null; // 未手动配置后端地址时自动探测的结果(同源优先 → 本机默认)

function baseUrl() {
  return (localStorage.getItem(LS_BASE) || discoveredBase || 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

// 首次打开(未保存过后端地址)时自动探测后端: 同源(Docker 单容器/同域反代) → 本机 3000(独立前端开发)。
// /api/config 无需 token, 探测成功即以此为默认地址, 门禁页无需手动填写。
// 注意: 只认「JSON 且 ok:true」的响应 —— SPA 兜底路由/CDN 错误页同样会回 200+HTML, 不能当作后端存在。
async function discoverBase() {
  const candidates = [];
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    candidates.push(window.location.origin);
  }
  if (!candidates.includes('http://127.0.0.1:3000')) candidates.push('http://127.0.0.1:3000');
  for (const c of candidates) {
    try {
      const r = await fetch(c + '/api/config', { signal: AbortSignal.timeout(2000) });
      if (!r.ok) continue;
      if (!/json/i.test(r.headers.get('content-type') || '')) continue;
      const body = await r.json();
      if (body && body.ok === true) { discoveredBase = c; break; }
    } catch (e) { /* 下一个候选 */ }
  }
  if (currentView === 'gate') fillGateForm(); // 探测完成后刷新门禁卡预填
  // 恢复视图时可能已用兜底地址连过 SSE: 探测结果出来后换到真正的后端
  if (currentView === 'login' || currentView === 'main') connectEvents();
}
function accessToken() { return localStorage.getItem(LS_TOKEN) || ''; }
function avatarUrl(key) { return baseUrl() + '/api/avatar/' + encodeURIComponent(key) + '?token=' + encodeURIComponent(accessToken()); }
// 地址拼接/拆分: 门禁卡与断开弹窗共用(协议 + 主机 + 端口)
function composeBase(scheme, host, port) {
  const h = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const p = String(port || '').trim().replace(/\D/g, '');
  return (scheme || 'http://') + (h || '127.0.0.1') + (p ? ':' + p : '');
}
function splitBase(b) {
  const m = String(b || '').match(/^(https?):\/\/([^\/:]+)(?::(\d+))?/);
  const host = m ? m[2] : '127.0.0.1';
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  return {
    scheme: (m && m[1] === 'https') ? 'https://' : 'http://',
    host,
    port: (m && m[3]) ? m[3] : (isLocal ? '3000' : '')
  };
}

function saveConnection() {
  const t = $('#gateToken').value.trim();
  localStorage.setItem(LS_BASE, composeBase($('#gateScheme').value, $('#gateHost').value, $('#gatePort').value));
  localStorage.setItem(LS_TOKEN, t);
  return t;
}

// 门禁页表单预填(从已保存的地址解析出协议/主机/端口)
function fillGateForm() {
  const s = splitBase(baseUrl());
  const gs = $('#gateScheme');
  gs.value = s.scheme;
  if (gs.syncDd) gs.syncDd();
  $('#gateHost').value = s.host;
  $('#gatePort').value = s.port;
  $('#gateToken').value = accessToken();
  $('#gateTokenLabel').textContent = appConfig.tokenRequired ? '访问令牌 *' : '访问令牌';
}

let appConfig = { tokenRequired: false };
function updateEncryptionHint() {
  const el = $('#encryptionBadge');
  if (!el) return;
  const enabled = appConfig.encryptionEnabled;
  const mode = appConfig.encryptionMode;
  const show = enabled === false || mode === 'none' || mode === 'missing';
  el.classList.toggle('hidden', !show);
}

// 停止 SSE(401 令牌错误时调用, 防止用旧令牌无限重试刷日志; 状态/健康/图表已全部走 SSE, 无其他轮询)
function stopPolling() {
  if (window.__evt) { try { window.__evt.close(); } catch (e) { /* ignore */ } window.__evt = null; }
}

async function api(method, path, body, opts = {}) {
  const url = baseUrl() + path;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.noAuth && accessToken()) headers['Authorization'] = 'Bearer ' + accessToken();
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal, cache: 'no-store' });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    // 非 JSON 响应(SPA 兜底路由回 index.html / 代理错误页): 按「未正确连接后端」抛出,
    // 不能吞成空数据 —— 否则 /api/session 200+HTML 会被误判为「未登录」而跳过门禁页
    throw new Error(res.ok ? '后端响应不是 JSON (可能 /api 反代配置错误或命中 SPA 兜底路由)' : '后端响应不是 JSON (HTTP ' + res.status + ')');
  }
  if (res.status === 401 && !opts.noAuth && headers['Authorization'] && path !== '/api/login' && path !== '/api/login/2fa') {
    const errMsg = String((data && data.error) || '');
    bootHide(true); // 会话没了: 等待页必须收掉, 否则盖着登录页
    if (errMsg.includes('未登录')) {
      showView('login'); // 会话未登录: 回登录页, 不停轮询/SSE
    } else {
      stopPolling(); // 令牌错误: 先停所有轮询与 SSE, 再切门禁页
      showView('gate');
      $('#gateMsg').textContent = '\u8bbf\u95ee\u88ab\u62d2\u7edd, \u8bf7\u68c0\u67e5\u4ee4\u724c';
    }
  }
  return { status: res.status, data };
}
// 后端日志面板(渲染/翻页/筛选/拉取)已拆到 logpanel.js + logparse.js, 见 index.html 的脚本顺序

function showView(name) {
  currentView = name;
  $('#gateView').classList.toggle('hidden', name !== 'gate');
  $('#loginView').classList.toggle('hidden', name !== 'login');
  $('#mainView').classList.toggle('hidden', name !== 'main');
  if (name === 'gate') fillGateForm();
  if (name === 'main') { moveTabIndicator(); vUpdate(true); } // 视图刚可见: tab 位置要量, 好友列表窗口也要重算
  try { sessionStorage.setItem('vrcn_lastView', name); } catch (e) {} // 刷新时恢复, 避免门禁页闪烁
  // 登录/主界面: 首次拉取健康与状态(此后由 SSE 推送更新, 不再轮询), 并确保 SSE 已连接
  if (name === 'login' || name === 'main') {
    loadHealth();
    connectEvents();
  }
}

// ---------- 访问密钥门禁 ----------
async function loadConfig() {
  try {
    const r = await api('GET', '/api/config', undefined, { noAuth: true, signal: AbortSignal.timeout(5000) });
    appConfig = r.data || {};
    updateEncryptionHint();
    if (appConfig.tokenRequired && !accessToken()) {
      $('#gateMsg').textContent = '';
      showView('gate');
      return;
    }
    await checkSession(); // 置于 try 内: 会话请求失败(含非 JSON 响应)统一回落门禁页, 不留未捕获异常
  } catch (e) {
    showView('gate');
    $('#gateMsg').textContent = '\u65e0\u6cd5\u8fde\u63a5\u540e\u7aef: ' + (e && e.name === 'TimeoutError' ? '连接超时' : e.message);
  }
}

$('#connectBtn').addEventListener('click', async () => {
  const t = saveConnection();
  if (!t && appConfig.tokenRequired) {
    $('#gateMsg').textContent = '未填写访问令牌, 无法连接';
    return;
  }
  const btn = $('#connectBtn');
  const fail = (msg) => {
    btn.disabled = false;
    btn.textContent = '连接';
    $('#gateMsg').textContent = msg;
  };
  btn.disabled = true;
  btn.innerHTML = "<span class='btn-spinner'></span>连接中...";
  $('#gateMsg').textContent = '正在连接后端...';
  try {
    const headers = accessToken() ? { Authorization: 'Bearer ' + accessToken() } : {};
    const res = await fetch(baseUrl() + '/api/session', { method: 'GET', headers, signal: AbortSignal.timeout(5000) });
    if (res.status >= 500) { fail('后端服务异常 (HTTP ' + res.status + ')'); return; }
    if (res.status === 401) { fail('访问被拒绝, 请检查令牌'); return; }
    location.reload(); // 连接验证通过才刷新页面
  } catch (e) {
    fail('无法连接后端: ' + (e && e.name === 'TimeoutError' ? '连接超时' : '网络错误'));
  }
});

// ---------- 后端连接心跳: 断开立即弹窗(可改地址/令牌), 恢复自动关闭 ----------
function fillConnModal() {
  const s = splitBase(baseUrl());
  const cs = $('#connScheme');
  cs.value = s.scheme;
  if (cs.syncDd) cs.syncDd();
  $('#connHost').value = s.host;
  $('#connPort').value = s.port;
  $('#connToken').value = accessToken();
}

function maybeShowConnModal() {
  if (currentView === 'gate') return; // 门禁页本身就是连接界面
  if ($('#connModal') && !$('#connModal').classList.contains('hidden')) return;
  if (Date.now() < connModalCooldownUntil) return;
  fillConnModal();
  $('#connModal').classList.remove('hidden');
}

async function pingBackend() {
  let ok = false;
  try {
    const res = await fetch(baseUrl() + '/api/config', { method: 'GET', signal: AbortSignal.timeout(5000) });
    ok = res.status < 500; // 能拿到响应即视为在线(401/403 属于令牌问题, 不算断开)
  } catch (e) { ok = false; }
  if (ok) {
    if (!backendOnline) {
      backendOnline = true;
      connModalCooldownUntil = 0;
      $('#connModal').classList.add('hidden'); // 连接恢复: 自动关闭弹窗
    }
  } else {
    backendOnline = false;
    maybeShowConnModal();
  }
}

function startConnWatch() {
  if (connTimer) clearInterval(connTimer);
  connTimer = setInterval(pingBackend, 4000);
}

$('#connCancel').addEventListener('click', () => {
  $('#connModal').classList.add('hidden');
  connModalCooldownUntil = Date.now() + 30000; // 取消后 30s 内不再弹出
});
$('#connSave').addEventListener('click', () => {
  localStorage.setItem(LS_BASE, composeBase($('#connScheme').value, $('#connHost').value, $('#connPort').value));
  localStorage.setItem(LS_TOKEN, $('#connToken').value.trim());
  location.reload();
});


function connectEvents() {
  const want = baseUrl() + '/api/events?token=' + encodeURIComponent(accessToken());
  // 启动时若直接从 sessionStorage 恢复视图(第二次打开), 这里会在地址探测完成前先连一次,
  // 那时 baseUrl() 只有本机 3000 的兜底值 —— 连错后端就整页收不到日志/状态/登录进度。
  // 所以按最终 URL 判重: 地址变了就换连(探测完成后 showView 会再调一次本函数)。
  if (window.__evt && window.__evt.url === want) return;
  if (window.__evt) { try { window.__evt.close(); } catch (e) { /* ignore */ } window.__evt = null; }
  const evt = new EventSource(want);
  window.__evt = evt;
  // 后端日志实时推送(最新已展示 seq 由 addLogLine 内部维护, 去重守卫防重复)
  evt.addEventListener('log', (e) => {
    const d = JSON.parse(e.data);
    if (d && d.line) addLogLine(d.line, d.seq);
  });
  // 服务端替换已显示的日志行(访问令牌打码): 按 seq 同步
  evt.addEventListener('log-update', (e) => {
    const d = JSON.parse(e.data);
    if (d && d.line) replaceLogLine(d.seq, d.line);
  });
  // 状态推送: 快照/WS 连接/QQ 状态等变化时后端直接推完整状态负载
  evt.addEventListener('status', (e) => {
    try { renderStatus(JSON.parse(e.data)); } catch (err) { /* 忽略异常帧 */ }
  });
  // 健康探测: 后端每轮采样完成推送
  evt.addEventListener('health', (e) => {
    try {
      const d = JSON.parse(e.data);
      applyLatency($('#stHealthLatency'), d);
      applyLatency($('#lgHealthLatency'), d);
    } catch (err) { /* 忽略异常帧 */ }
  });
  // WS 图表: 每秒推送刚结束那一秒的消息数, 前端 rAF 按时间锚定自行驱动匀速左移
  evt.addEventListener('ws-stats', (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d && typeof d.sec === 'number') wsChartPush(d.sec, d.n || 0);
    } catch (err) { /* 忽略异常帧 */ }
  });
  // SSE 断线自动重连: 以「真正展示的最顶行」为起点补缺口(服务端从文件读, 不丢行);
  // 同时 bootstrap 一次 WS 图表权威序列(覆盖断线期间漏掉的秒)
  evt.onopen = () => {
    if (lastLogSeq != null) loadBackendLogs({ after: lastLogSeq });
    loadWsStats();
  };
  // 登录进度(后端在验证通过/取凭据/读名册/拉好友各阶段推送): 等待页照它逐行点亮
  evt.addEventListener('login-progress', (e) => {
    let d = null;
    try { d = JSON.parse(e.data); } catch (err) { return; /* 忽略异常帧 */ }
    bootProgress(d);
  });
  // 事件驱动 UI 刷新(状态渲染已由 'status' 推送, 这里只刷新数据列表)
  evt.addEventListener('notification', () => { scheduleNotifyRefresh(); });
  evt.addEventListener('snapshot', () => { loadFriends(); });
  // 世界名按需查询: 前端从不等待, 查到一条补一条
  evt.addEventListener('world-name', (e) => {
    let d = null;
    try { d = JSON.parse(e.data); } catch (err) { return; /* 忽略异常帧 */ }
    if (d) applyWorldName(d.worldId, d.worldName);
  });
  evt.addEventListener('self-state', () => { /* 'status' 推送已覆盖 */ });
  evt.addEventListener('qq-status', (e) => {
    let d = null;
    try { d = JSON.parse(e.data); } catch (err) { /* 忽略异常帧 */ }
    if (d) renderQqStatus({ configured: true, connected: !!d.connected });
  });
  evt.addEventListener('session-expired', () => { currentUser = null; showView('login'); });
  evt.addEventListener('relogin-ok', () => { location.reload(); }); // 自动重登成功: 刷新回到主界面
  evt.addEventListener('2fa-needed', () => {
    $('#reloginCode').value = '';
    $('#relogin2faMsg').textContent = '';
    $('#relogin2faConfirm').disabled = false;
    $('#twofaReloginModal').classList.remove('hidden');
  });
  evt.addEventListener('ws-failure', () => { /* 后端日志已记录 */ });
}
