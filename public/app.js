
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const LS_BASE = 'vrcn_base';
const LS_TOKEN = 'vrcn_token';
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
let currentUser = null;
let tempSessionId = null;
let twofaKind = 'emailOtp';
let friendsCache = [];
let searchQuery = ''; // 好友搜索关键词
let myInfo = null; // 当前用户信息(页面标题栏展示, 与好友行共用渲染)
let currentView = 'gate';        // 当前视图(断开弹窗只在非门禁页弹出)
let backendOnline = true;        // 后端连接状态(心跳维护)
let connModalCooldownUntil = 0;  // 取消断开弹窗后的冷却截止时间
let connTimer = null;

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
let lastLogSeq = null;        // 最新已展示的 seq(仅由真正插入 DOM 顶部的行维护; 补缺口起点)
let oldestSeqShown = null;   // 当前 DOM 中最早一行的 seq(向上翻页起点)
let hasOlder = true;         // 服务端是否还有更旧的历史
let loadingOlder = false;    // 防止重复翻页
let loadMoreRow = null;      // 底部「加载更早日志」占位行

// ---------- 日志行渲染(OpenClash 观感): [时间] [级别] [分类] 正文 → 级别词着色 + 分类徽章 ----------
const LOG_CATS = ['startup', 'server', 'auth', 'monitor', 'ws', 'vrcapi', 'world', 'group', 'qq', 'notify', 'avatar', 'status'];
let logLevelSel = null; // 多选下拉: 选中集合在 selectedValues (Set); 选中集合=显示集合, 默认全选
let logCatSel = null;   // 多选下拉: 选中集合在 selectedValues (Set)

function parseLogLine(line) {
  const m = /^\[([^\]]+)\] \[(debug|info|warn|error)\] \[([^\]]+)\] (.*)$/.exec(line);
  if (!m) return null;
  return { time: m[1], level: m[2], cat: m[3], body: m[4] };
}

function renderLogRow(div, line) {
  div.className = 'log-row';
  const p = parseLogLine(line);
  if (!p) { // 无法解析的行按原样显示, 始终显示(不受任何筛选)
    div.textContent = line;
    div.dataset.raw = '1';
    return;
  }
  delete div.dataset.raw; // 重渲染(令牌打码替换)时统一还原 raw 标记
  div.textContent = '';
  const tm = document.createElement('span');
  tm.className = 'log-time';
  tm.textContent = p.time.slice(11); // HH:mm:ss
  tm.title = p.time;                 // 完整日期时间悬浮显示
  const lv = document.createElement('span');
  lv.className = 'log-lv lv-' + p.level;
  lv.textContent = p.level;
  const cat = document.createElement('span');
  cat.className = 'log-cat cat-' + (LOG_CATS.includes(p.cat) ? p.cat : 'other');
  cat.textContent = p.cat;
  const body = document.createElement('span');
  body.className = 'log-body';
  body.textContent = p.body;
  div.append(tm, lv, cat, body);
  div.dataset.level = p.level;
  div.dataset.cat = LOG_CATS.includes(p.cat) ? p.cat : 'other';
}

function setRowVisible(row) {
  if (row.dataset.raw) { row.classList.remove('hidden'); return; } // 无法解析的行始终显示, 不受任何筛选
  const lvSel = logLevelSel ? logLevelSel.selectedValues : null;
  const catSel = logCatSel ? logCatSel.selectedValues : null;
  const show = (!lvSel || lvSel.has(row.dataset.level))
    && (!catSel || catSel.has(row.dataset.cat));
  row.classList.toggle('hidden', !show);
}

// 新日志: 插到顶部(seq 用于令牌行替换、翻页定位与去重)
function addLogLine(line, seq) {
  const box = $('#log');
  // 防重: SSE 直播行与 after 补缺口响应可能包含同一条(重连竞态), 已有该 seq 则跳过
  if (seq !== undefined && box.querySelector('div[data-seq="' + seq + '"]')) return;
  const div = document.createElement('div');
  renderLogRow(div, line);
  if (seq !== undefined) div.dataset.seq = seq;
  const wasAtTop = box.scrollTop <= 2;          // 是否正停留在顶部跟随最新
  const beforeH = box.scrollHeight;
  box.insertBefore(div, box.firstChild);        // 新的日志在上面
  trimLogWindow(box, 'live');                   // 总窗口封顶: 从底部裁最老行(可翻页拉回)
  updateOldestSeq();
  setRowVisible(div);
  // 最新已展示 seq 只由真正插入的行维护(补缺口以此为起点, 不多不少)
  if (seq !== undefined && (lastLogSeq == null || seq > lastLogSeq)) lastLogSeq = seq;
  if (wasAtTop) box.scrollTop = 0;              // 停顶部时保持跟随最新
  else box.scrollTop += box.scrollHeight - beforeH; // 正在阅读旧日志时保持视口不跳动
}

// 旧日志: 追加到底部(向上翻页加载), 不触发顶部跟随逻辑
function addOldLogLine(line, seq) {
  const box = $('#log');
  if (seq !== undefined && box.querySelector('div[data-seq="' + seq + '"]')) return; // 兜底去重
  const div = document.createElement('div');
  renderLogRow(div, line);
  if (seq !== undefined) div.dataset.seq = seq;
  if (loadMoreRow) box.insertBefore(div, loadMoreRow);
  else box.appendChild(div);
  trimLogWindow(box, 'older');                  // 总窗口封顶: 从顶部裁最新行(可 tail 重载拉回)
  updateOldestSeq();
  setRowVisible(div);
}

// 窗口裁剪: 直播/翻页统一 5000 行上限(VrcLogView.plan), 方向感知 —— 裁远离焦点的一侧
function trimLogWindow(box, mode) {
  const p = VrcLogView.plan({ totalRows: box.children.length, mode });
  for (let i = 0; i < p.count; i++) {
    if (p.side === 'bottom') {
      // 底部最老行: loadMoreRow 挂在最末时, 裁它前面的那一行
      const last = box.lastChild;
      if (!last) break;
      if (last === loadMoreRow) {
        if (!last.previousSibling) break;
        box.removeChild(last.previousSibling);
      } else {
        box.removeChild(last);
      }
    } else {
      const first = box.firstChild;
      if (!first) break;
      box.removeChild(first);
    }
  }
}

function updateOldestSeq() {
  const rows = $('#log').querySelectorAll('div[data-seq]');
  oldestSeqShown = rows.length ? Number(rows[rows.length - 1].dataset.seq) : null;
}

// 服务端日志行替换(令牌打码): 按 seq 同步已显示的行
function replaceLogLine(seq, line) {
  const el = $('#log').querySelector('div[data-seq="' + seq + '"]');
  if (!el) return;
  renderLogRow(el, line);
  setRowVisible(el);
}

function showLoadMore() {
  const box = $('#log');
  loadMoreRow = document.createElement('div');
  loadMoreRow.className = 'muted';
  loadMoreRow.textContent = '加载更早日志...';
  box.appendChild(loadMoreRow);
}
function clearLoadMore() {
  if (loadMoreRow) { loadMoreRow.remove(); loadMoreRow = null; }
}

// 当前筛选参数(等级/分类多选集合), 附加到所有日志请求: 服务端在文件里直接凑满一页匹配行,
// 避免「前端缓存里没有、后端文件里有」的历史消息翻不出来。
// 协议: 参数省略=该维度不过滤; 空串=不匹配任何行; 逗号分隔=选中集合。
function logFilterQuery() {
  const csv = (el) => Array.from(el.options).map((o) => o.value)
    .filter((v) => el.selectedValues.has(v)).join(',');
  let q = '';
  if (logLevelSel) q += '&level=' + encodeURIComponent(csv(logLevelSel));
  if (logCatSel) q += '&cat=' + encodeURIComponent(csv(logCatSel));
  return q;
}

// 后端日志: 拉取历史(tail) / 增量补齐(after, SSE 断线重连) / 向前翻页(before, 滚动加载)
function loadBackendLogs(opts = {}) {
  const fq = logFilterQuery();
  const query = opts.after
    ? 'after=' + opts.after + fq
    : opts.before
      ? 'before=' + opts.before + '&limit=100' + fq
      : 'tail=' + (opts.tail || 100) + fq;
  return api('GET', '/api/logs?' + query)
    .then((r) => {
      if (!r || !r.data || !Array.isArray(r.data.logs)) return;
      if (!opts.after && !opts.before) {
        const box = $('#log');
        box.textContent = '';
        oldestSeqShown = null;
        lastLogSeq = null;   // 最新已展示 seq 重置, 由随后插入的行重新建立
        hasOlder = true;     // 重载后重新允许翻页
      }
      if (opts.before) {
        // 服务端返回从旧到新; 倒序追加: 更旧的行垫底, 块内保持时间递减(新的在上面)
        for (let i = r.data.logs.length - 1; i >= 0; i--) {
          const entry = r.data.logs[i];
          addOldLogLine(entry.line, entry.seq);
        }
        hasOlder = r.data.logs.length >= 100; // 服务端凑不满一页 = 文件已扫完
      } else {
        for (const entry of r.data.logs) addLogLine(entry.line, entry.seq);
      }
      if (!opts.after && !opts.before && lastLogSeq != null) {
        // 重载期间可能有新行已写入文件(不在本次快照里): 补拉一次, 去重守卫保证不多不少
        loadBackendLogs({ after: lastLogSeq });
      }
    })
    .catch(() => {});
}

// 滚动到底自动加载更旧日志(后端多段文件存储, 跨段翻页; 前端不缓存, 随滚动实时加载)
$('#log').addEventListener('scroll', () => {
  const box = $('#log');
  if (!hasOlder || loadingOlder) return;
  if (oldestSeqShown != null && box.scrollHeight - box.scrollTop - box.clientHeight < 60) {
    loadingOlder = true;
    showLoadMore();
    loadBackendLogs({ before: oldestSeqShown }).finally(() => {
      clearLoadMore();
      loadingOlder = false;
    });
  }
});

function showView(name) {
  currentView = name;
  $('#gateView').classList.toggle('hidden', name !== 'gate');
  $('#loginView').classList.toggle('hidden', name !== 'login');
  $('#mainView').classList.toggle('hidden', name !== 'main');
  if (name === 'gate') fillGateForm();
  if (name === 'main') moveTabIndicator(); // 视图刚可见才能量出 tab 的位置(隐藏时全是 0)
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

// ---------- 会话 / 登录 ----------
async function checkSession() {
  const r = await api('GET', '/api/session');
  if (r.status === 401) { showView('gate'); return; }
  if (r.data.loggedIn && r.data.user) {
    currentUser = r.data.user;
    enterMain();
  } else {
    currentUser = null;
    showView('login');
  }
}

$('#loginBtn').addEventListener('click', async () => {
  const username = $('#loginUser').value.trim();
  const password = $('#loginPass').value;
  if (!username || !password) { $('#loginMsg').textContent = '请输入用户名和密码'; return; }
  $('#loginMsg').textContent = '登录中...';
  loginWaiting = true; // 允许后端「验证通过」事件把等待页淡进来
  let r;
  try {
    r = await api('POST', '/api/login', {
      username, password, rememberMe: $('#rememberMe').checked
    });
  } catch (e) {
    loginWaiting = false;
    bootHide(true);
    $('#loginMsg').textContent = e.message;
    return;
  }
  loginWaiting = false;
  if (r.data.requiresTwoFactorAuth) {
    tempSessionId = r.data.tempSessionId;
    twofaKind = r.data.requiresTwoFactorAuth[0] || 'emailOtp';
    $('#loginMsg').textContent = '';
    $('#twofaMsg').textContent = '请输入' + (twofaKind === 'emailOtp' ? '邮箱' : twofaKind === 'totp' ? 'TOTP' : '备用') + '验证码';
    switchLoginForm('twofa'); // 和页面切换同款: 旧的快速淡出, 新的淡入
    return;
  }
  if (r.data.ok) {
    currentUser = r.data.user;
    enterMain({ fromLogin: true }); // 等待页在用时由 enterMain 接着走完(等数据+首屏头像, 再淡出)
  } else {
    bootHide(true);
    $('#loginMsg').textContent = r.data.error || '登录失败';
  }
});

$('#twofaBtn').addEventListener('click', async () => {
  const code = $('#twofaCode').value.trim();
  if (!code) { $('#twofaMsg').textContent = '请输入验证码'; return; }
  $('#twofaMsg').textContent = '验证中...';
  loginWaiting = true;
  let r;
  try {
    r = await api('POST', '/api/login/2fa', { tempSessionId, code, kind: twofaKind });
  } catch (e) {
    loginWaiting = false;
    bootHide(true);
    $('#twofaMsg').textContent = e.message;
    return;
  }
  loginWaiting = false;
  if (r.data.ok) {
    currentUser = r.data.user;
    enterMain({ fromLogin: true });
  } else {
    bootHide(true); // 验证码错: 等待页收掉, 原地报错重试
    $('#twofaMsg').textContent = r.data.error || '验证失败';
  }
});

$('#twofaCancel').addEventListener('click', () => {
  tempSessionId = null;
  $('#twofaMsg').textContent = '';
  switchLoginForm('login'); // 取消回登录表单, 同样带切换动画
});

// 登录卡片内的表单切换(登录 ⇄ 两步验证): 沿用页面切换那套 —— 旧的快速淡出, 新的淡入。
// 直接 classList.add('hidden') 是硬切, 和站内其它切换不一致。
function switchLoginForm(name) {
  const forms = { login: $('#loginForm'), twofa: $('#twofaForm') };
  const to = forms[name];
  if (!to) return;
  const from = Object.keys(forms).map((k) => forms[k])
    .find((el) => el && el !== to && !el.classList.contains('hidden'));
  const show = () => {
    to.classList.remove('hidden');
    to.classList.remove('form-in');
    void to.offsetWidth;      // 强制重排: 入场动画从头播
    to.classList.add('form-in');
  };
  if (!from) { show(); return; }
  from.classList.add('form-fade-out');
  setTimeout(() => {
    from.classList.add('hidden');
    from.classList.remove('form-fade-out');
    show();
  }, 130); // 与 .form-fade-out 的 .12s 对齐(定时器兜底, 不依赖动画事件)
}

// 登出确认弹窗: 好友/监控配置/用户是登出必删的, 两个勾是额外的清理 ——
// 缓存(头像+世界名+群组名) / 彻底重置(设置+QQ 机器人凭据+绑定, 访问令牌保留)
$('#logoutBtn').addEventListener('click', () => {
  $('#logoutClearCache').checked = false;
  $('#logoutClearSettings').checked = false;
  $('#logoutModal').classList.remove('hidden');
});
$('#logoutCancel').addEventListener('click', () => {
  $('#logoutModal').classList.add('hidden');
});
$('#logoutConfirm').addEventListener('click', async () => {
  const clearCache = $('#logoutClearCache').checked ? 1 : 0;
  const clearSettings = $('#logoutClearSettings').checked ? 1 : 0;
  try {
    await api('POST', '/api/logout', { clearCache, clearSettings });
  } finally {
    location.reload(); // 登出后强制刷新界面, 重置全部前端状态
  }
});

// 两步验证弹窗(自动重登/会话挂起): 提交验证码, 成功由 SSE relogin-ok 刷新
$('#relogin2faConfirm').addEventListener('click', async () => {
  const code = $('#reloginCode').value.trim();
  if (!/^(\d{6}|\d{4}[- ]\d{4})$/.test(code)) {
    $('#relogin2faMsg').textContent = '请输入 6 位或 4-4 位验证码';
    return;
  }
  const btn = $('#relogin2faConfirm');
  btn.disabled = true;
  $('#relogin2faMsg').textContent = '验证中...';
  const r = await api('POST', '/api/relogin/2fa', { code });
  if (r.data.ok) {
    $('#relogin2faMsg').textContent = '验证成功, 正在刷新...';
    setTimeout(() => location.reload(), 400);
  } else {
    btn.disabled = false;
    $('#relogin2faMsg').textContent = r.data.error || '验证失败, 请重试';
  }
});
$('#relogin2faCancel').addEventListener('click', () => {
  $('#twofaReloginModal').classList.add('hidden');
});

function enterMain(opts = {}) {
  showView('main');
  myInfo = currentUser;
  renderSelf();
  $('#logoutBtn').classList.remove('hidden');
  // 登录进来固定看好友监控页, 不恢复上次停在哪(刷新页面才恢复)
  if (opts.fromLogin) switchTab('tab-friends', { instant: true });
  const ready = loadAll();
  loadBackendLogs({ tail: 100 }); // 初始日志尾部(SSE 已在登录页/此处建立, 去重+补齐机制防丢行)
  connectEvents();
  if (bootActive) {
    // 响应回来了 = 快照已完成: 前三行直接判完成(事件丢了也不会卡住), 第 4 行等主界面数据 + 首屏头像。
    // 百分比不在这里补成 100 —— 数字只跟随后端真实上报, 末页事件丢了就停在它报过的地方。
    bootMark(0); bootMark(1); bootMark(2);
    bootWaitReady(ready);
  }
}

function loadAll() {
  // 返回 Promise 供登录等待页判断"前端就绪"(唯一调用点是 enterMain)
  return Promise.allSettled([loadFriends(), loadSettings(), loadStatus(), loadWsStats()]);
}

// ---------- 登录等待页 ----------
// 时机全部由后端 SSE 决定: 「验证通过」才淡入(不是点提交就出现), 「取到实时连接凭据」点亮第 1 行,
// 「读到好友名册」点亮第 2 行; 第 3 行按实际拉取条数追赶百分比; 响应回来后才等前端就绪(第 4 行)。
// 这块展板只读事件、绝不用事件决定跳转 —— 跳转仍由 /api/login 的响应决定,
// 所以丢事件/断线最坏只是少点亮一格, 不会把人卡在等待页。
const BOOT_MIN_STEP_MS = 550;   // 每行最短停留: 登录再快也要把这一步放完
const BOOT_READY_MIN_MS = 1200; // 「等待前端就绪」最少停留(数据/头像再快也别一闪而过)
const BOOT_READY_MS = 10000;    // 该行总上限(超时): 主界面数据 + 首屏头像, 到点就走
const BOOT_PCT_NUM_MS = 4;      // 百分比: 每个数字 4ms(约 250 个/秒)连续 +1 滚过去, 不等屏幕逐帧显示
const BOOT_PCT_DRAW_MS = 30;    // 数字条的渲染节流: 滚一格要 0.18s, 每帧都改会糊成一团
const BOOT_HOLD_DONE_MS = 1200; // 「初始化完成」停留
const BOOT_FADE_MS = 900;       // 淡出时长(与 CSS .boot-screen.out 一致)
const BOOT_STEPS = ['bootStep0', 'bootStep1', 'bootStep2', 'bootStep3'];
let bootActive = false;         // 等待页是否在场(在场时展板才理会进度事件)
let bootPointer = -1;           // 当前正在跑的是第几行(黄字)
let bootStepAt = 0;             // 该行开始时间(最短停留用)
let bootMarks = [false, false, false, false]; // 各行的真实完成标记
let bootPctShown = 0;           // 已展示到的整数百分比
let bootPctTarget = null;       // 真实百分比; null = 一条真实进度都没收到 → 不显示(不编数字)
let bootPctFrom = 0;            // 本轮滚动起点
let bootPctAt = 0;              // 本轮滚动起点时刻
let bootPctRaf = null;          // 逐数滚动的 rAF 句柄
let bootPctRenderedAt = 0;      // 上次渲染数字条的时刻(节流用)
const bootHalos = new Map();    // 各行光环的 WAAPI 动画句柄(完成时要收到最小并停住)
let bootReadyText = '';         // 第 4 行右侧的"头像 x/y"(算完了也要等轮到自己才显示)
let bootTimer = null;           // 推进定时器
let bootHideTimer = null;       // 淡出收尾定时器
let bootToken = 0;              // 每次显示自增: 上一轮的异步回调据此作废
let loginWaiting = false;       // 正在等某个登录请求的响应(只有这时才理会 verified)

function bootSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 滚跳(与 WS 计数同款): 旧值向上滚出、新值从下滚入。CJK 不适用 ch 定宽, 由 .roll-wrap 裁剪。
function rollSwap(el, text, force) {
  if (!el || (!force && el.textContent === String(text))) return;
  const wrap = el.parentElement;
  if (!wrap) { el.textContent = String(text); return; }
  for (const old of wrap.querySelectorAll(':scope > .roll-old')) old.remove();
  const old = document.createElement('span');
  old.className = 'roll-old';
  old.textContent = el.textContent;
  el.textContent = String(text);
  el.getAnimations().forEach((a) => a.cancel()); // 打断进行中的动画, 避免叠加抖动
  el.classList.remove('roll');
  void el.offsetWidth;                            // 强制重排, 重启动画
  el.classList.add('roll');
  wrap.appendChild(old);
  old.addEventListener('animationend', () => old.remove(), { once: true });
  setTimeout(() => old.remove(), 600);            // 兜底: 动画被打断也不会留下残留层
}

function bootShow() {
  if (bootActive) return;
  bootActive = true;
  bootToken++;
  bootPointer = 0;
  bootStepAt = Date.now();
  bootMarks = [false, false, false, false];
  bootPctShown = 0;
  bootPctFrom = 0;
  bootPctAt = 0;
  bootPctTarget = null;       // 没有真实进度就一直是 null: 界面上不出现任何数字
  bootReadyText = '';
  if (bootPctRaf) { cancelAnimationFrame(bootPctRaf); bootPctRaf = null; }
  const pctBox = $('#bootPct');
  pctBox.dataset.ready = '';   // 上一轮的数字条丢掉: 没到第 3 行之前这一格必须是空的
  pctBox.innerHTML = '';
  $('#bootStep3 .boot-val').textContent = ''; // 上一轮留下的"头像 x/y"要清掉
  $('#bootTitle').textContent = '正在初始化';
  $('#bootTitleWrap').classList.remove('done');
  for (const id of BOOT_STEPS) $('#' + id).classList.remove('on', 'ok');
  bootHalosReset();           // 上一轮的光环动画(含填充效果)清干净
  bootSetStep(0, 'on');       // 第 1 行立刻转黄(走同一套: 光环开始呼吸)
  const scr = $('#bootScreen');
  scr.classList.remove('hidden', 'out');
  void scr.offsetWidth; // 强制重排: 让 opacity 过渡从 0 开始
  scr.classList.add('show');
  if (!bootTimer) bootTimer = setInterval(bootTick, 60);
}

function bootHide(immediate) {
  if (!bootActive) return;
  bootActive = false;
  bootToken++;
  if (bootTimer) { clearInterval(bootTimer); bootTimer = null; }
  if (bootPctRaf) { cancelAnimationFrame(bootPctRaf); bootPctRaf = null; }
  if (bootHideTimer) { clearTimeout(bootHideTimer); bootHideTimer = null; }
  const scr = $('#bootScreen');
  scr.classList.remove('show');
  const finish = () => { scr.classList.add('hidden'); scr.classList.remove('out'); };
  if (immediate) { finish(); return; }
  scr.classList.add('out');
  bootHideTimer = setTimeout(finish, BOOT_FADE_MS);
}

function bootMark(i) { bootMarks[i] = true; }

// 真实进度: 只认后端报的已拉条数/总数, 一条都没收到就不显示(绝不自己编一个终值)
function bootPercent(fetched, total) {
  if (!(total > 0)) return;
  const target = Math.min(100, Math.floor((fetched / total) * 100)); // 向下取整: 不虚报(150 好友分 3 页 = 33/66/100)
  if (bootPctTarget !== null && target <= bootPctTarget) return; // 只增不减
  bootPctTarget = target;
  bootPctKick();
}

// 每个数字都要走一遍: 按时间推进(每 BOOT_PCT_NUM_MS 一个数, 序列恒为 +1),
// 屏幕刷新率跟不上也没关系 —— 追到真实值就停在那, 等下一页来了再继续。
function bootPctKick() {
  if (bootPctRaf || !bootActive) return;
  bootPctFrom = bootPctShown;      // 本轮起点与起点时刻: 用经过的时间算该走到哪
  bootPctAt = performance.now();
  bootPctRaf = requestAnimationFrame(bootPctStep);
}
function bootPctStep() {
  bootPctRaf = null;
  if (!bootActive || bootPctTarget === null) return;
  if (bootPctShown >= bootPctTarget) { bootPctRender(bootPctShown); return; } // 到值: 落定, 停
  const want = Math.min(bootPctTarget, bootPctFrom + Math.floor((performance.now() - bootPctAt) / BOOT_PCT_NUM_MS));
  bootPctShown = want;
  // 渲染节流: 数字条滚一格要 0.18s, 每帧都改反而糊成一团; 到值时上面那条保证一定落定
  if (bootPointer >= 2 && performance.now() - bootPctRenderedAt >= BOOT_PCT_DRAW_MS) {
    bootPctRenderedAt = performance.now();
    bootPctRender(bootPctShown);
  }
  bootPctRaf = requestAnimationFrame(bootPctStep);
}

// 百分比的滚动里程表: 建 3 个数字位(百/十/个), 每位一条 0-9 竖排的数字条。
// 换数字只改 transform, 交给 transition 平滑滚过去 —— 既不重排文字, 也不会重启关键帧动画。
function bootPctBuild() {
  const box = $('#bootPct');
  if (!box) return;
  box.innerHTML = '';
  box.dataset.ready = '1';
  for (const role of ['h', 't', 'o']) {
    const slot = document.createElement('span');
    slot.className = 'pct-slot dim';
    slot.dataset.role = role;
    const strip = document.createElement('b');
    strip.className = 'pct-strip';
    for (let d = 0; d <= 9; d++) {
      const i = document.createElement('i');
      i.textContent = String(d);
      strip.appendChild(i);
    }
    slot.appendChild(strip);
    box.appendChild(slot);
  }
  const sign = document.createElement('span');
  sign.className = 'pct-sign';
  sign.textContent = '%';
  box.appendChild(sign);
}
function bootPctRender(n, instant) {
  const box = $('#bootPct');
  if (!box || box.dataset.ready !== '1') return;
  const v = Math.max(0, Math.min(100, Math.round(n)));
  const digits = String(v).padStart(3, '0');
  const roles = ['h', 't', 'o'];
  for (let i = 0; i < roles.length; i++) {
    const slot = box.querySelector(".pct-slot[data-role='" + roles[i] + "']");
    if (!slot) continue;
    // 前导零: 按"有效位数"判断该位要不要占宽度。
    // 注意不能写成 digits.slice(0,i).every(c => c==='0') —— i=0 时 slice 出来是空数组,
    // every 恒为 true, 会把百位永远藏掉(33 显示成 3、100 显示成 00)。
    slot.classList.toggle('dim', i < 3 - String(v).length);
    const strip = slot.firstChild;
    const y = -Number(digits[i]) * 1.2; // 每格 1.2em, 与 CSS 里 .pct-strip i 的高度一致
    if (instant) {
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(' + y + 'em)';
      void strip.offsetWidth; // 强制重排后再放开过渡
      strip.style.transition = '';
    } else {
      strip.style.transform = 'translateY(' + y + 'em)';
    }
  }
  box.setAttribute('aria-label', v + '%');
}

// 推进: 当前行"真做完了 && 停够最短时间(第 3 行还要等百分比动画追平)"才转绿, 下一行转黄
function bootTick() {
  if (!bootActive) return;
  const i = bootPointer;
  if (i < 0 || i > 3) return;
  if (!bootMarks[i]) return;
  if (Date.now() - bootStepAt < BOOT_MIN_STEP_MS) return;
  if (i === 2 && bootPctTarget !== null && bootPctShown < bootPctTarget) return; // 等数字跳到真实值
  bootSetStep(i, 'ok');       // 完成: 变绿 + 文字纵向滚跳一次
  bootPointer = i + 1;
  bootStepAt = Date.now();
  if (bootPointer > 3) { bootDone(); return; }
  bootSetStep(bootPointer, 'on');
  if (bootPointer === 2) bootPctStart();
  if (bootPointer === 3) bootReadyStart();
}

// 换状态: 加减类(颜色由 CSS 过渡) + 文字纵向滚跳一次 + 光环按状态收放
function bootSetStep(i, cls) {
  const li = $('#' + BOOT_STEPS[i]);
  if (!li) return;
  li.classList.remove('on', 'ok');
  li.classList.add(cls);
  const label = li.querySelector('.boot-label .roll-in');
  if (label) rollSwap(label, label.textContent, true);
  bootHalo(i, cls === 'on' ? 'breath' : cls === 'ok' ? 'settle' : 'off');
}

// 光环:
//   breath(当前步) —— 开始呼吸循环(1 → 2.1 → 1)
//   settle(已完成) —— 停掉循环, 从"此刻的姿态"平滑缩到最小并停住; 此刻已经最小就什么都不做
//   off(还没轮到) —— 停掉并复位
// 用 WAAPI 而不是 CSS 关键帧: 关键帧没法从当前帧平滑收到一个静止值(摘掉动画会瞬间弹回),
// getComputedStyle 能在动画进行中读到当前矩阵, 于是"缩小后保持最小"才是连续的。
function bootHalo(i, mode) {
  const halo = $('#' + BOOT_STEPS[i] + ' .boot-halo');
  if (!halo) return;
  let st = bootHalos.get(i);
  if (!st) { st = { anim: null }; bootHalos.set(i, st); }
  if (mode === 'breath') {
    if (!st.anim) {
      st.anim = halo.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(2.1)' }, { transform: 'scale(1)' }],
        { duration: 1700, iterations: Infinity, easing: 'cubic-bezier(.4,0,.6,1)' }
      );
    }
    return;
  }
  if (!st.anim) { halo.style.transform = 'scale(1)'; return; }
  const cur = window.getComputedStyle(halo).transform; // 动画进行中的实际姿态(矩阵)
  st.anim.cancel();
  st.anim = null;
  const scale = (/^matrix\(([-\d.]+)/.exec(cur || '') || [])[1];
  if (mode === 'settle' && scale !== undefined && Number(scale) > 1.02) {
    // 从此刻的姿态平滑缩到最小并停住
    halo.animate([{ transform: cur }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' });
  } else {
    // 已经是最小(或还没轮到): 直接落定, 不做任何放大
    halo.style.transform = 'scale(1)';
  }
}

function bootHalosReset() {
  for (const [, st] of bootHalos) { try { if (st.anim) st.anim.cancel(); } catch (e) { /* ignore */ } }
  bootHalos.clear();
  for (const id of BOOT_STEPS) {
    const halo = $('#' + id + ' .boot-halo');
    if (halo) halo.style.transform = '';
    const getAnim = halo && halo.getAnimations ? halo.getAnimations() : [];
    for (const a of getAnim) { try { a.cancel(); } catch (e) { /* ignore */ } }
  }
}

// 走到第 3 行才显示数字: 已有真实值就直接落上去(计数可能早就追完了), 否则等事件来了再出现
function bootPctStart() {
  bootPctBuild();                 // 走到这一行才建数字条(之前整块是空的, 不提前显示 %)
  bootPctRenderedAt = performance.now();
  bootPctRender(bootPctTarget === null ? 0 : bootPctShown, true);
}

// 同理: 头像计数可能在本行轮到之前就算完了, 到这一行才把它显示出来
function bootReadyStart() {
  if (bootReadyText) $('#bootStep3 .boot-val').textContent = bootReadyText;
}

async function bootDone() {
  if (!bootActive) return;
  const tok = bootToken;
  rollSwap($('#bootTitle'), '初始化完成');
  $('#bootTitleWrap').classList.add('done'); // 大字转绿
  await bootSleep(BOOT_HOLD_DONE_MS);
  if (tok !== bootToken || !bootActive) return;
  // 淡出的同时重放整页入场动画(概览条/页签/卡片/好友行), 就是刷新页面那套观感
  replayPageEntrance();
  bootHide();
}

// 快照已完成: 等主界面数据 + 首屏可见头像, 先到先走, 最多 BOOT_READY_MS;
// 但这一步本身至少停 BOOT_READY_MIN_MS, 否则快的时候一眨眼就过去了
async function bootWaitReady(dataPromise) {
  if (!bootActive) return;
  const tok = bootToken;
  const startedAt = Date.now();
  const deadline = startedAt + BOOT_READY_MS;
  try { await dataPromise; } catch (e) { /* 接口失败也照走, 到点即放行 */ }
  if (tok !== bootToken || !bootActive) return;
  // 头像逐个落定: 把"在等什么"显示出来, 否则这一步看不出在等。
  // 注意只在本行已经轮到(黄字)时才写进界面 —— 提前写就会出现"上一行还在跑, 下一行已经有数"。
  await waitImages(firstScreenAvatars(), Math.max(0, deadline - Date.now()), (done, total) => {
    if (tok !== bootToken) return;
    bootReadyText = '头像 ' + done + '/' + total;
    if (bootPointer >= 3) $('#bootStep3 .boot-val').textContent = bootReadyText;
  });
  if (tok !== bootToken || !bootActive) return;
  const rest = BOOT_READY_MIN_MS - (Date.now() - startedAt);
  if (rest > 0) await bootSleep(rest);
  if (tok !== bootToken || !bootActive) return;
  bootMark(3);
}

// 首屏可见的头像: 折叠分组里的 <img loading=lazy> 浏览器根本不会请求, 不能算进来
function firstScreenAvatars() {
  const vh = window.innerHeight || 800;
  const out = [];
  for (const img of document.querySelectorAll('#friendsList img.avatar')) {
    if (img.closest('.group-body.collapsed')) continue;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.top > vh + 120) break; // DOM 顺序即从上到下
    if (r.bottom > -120) out.push(img);
  }
  return out;
}

function waitImages(imgs, ms, onTick) {
  return new Promise((resolve) => {
    if (!imgs.length || ms <= 0) { resolve(); return; }
    const total = imgs.length;
    let settledCount = 0;
    let finished = false;
    const timer = setTimeout(() => { finished = true; resolve(); }, ms); // 超时兜底: 慢图不等了
    const one = () => {
      settledCount++;
      if (onTick) onTick(settledCount, total);
      if (settledCount >= total && !finished) { finished = true; clearTimeout(timer); resolve(); }
    };
    for (const img of imgs) {
      if (img.complete) { one(); continue; } // 已在缓存里: 立即算落定, 也要计数
      img.addEventListener('load', one, { once: true });
      img.addEventListener('error', one, { once: true });
    }
  });
}

// 淡出时重放整页入场: 概览条/页签/卡片靠重启 CSS 动画, 好友行靠重新编号 .enter
function replayPageEntrance() {
  const targets = [];
  for (const sel of ['#mainView .overview-item', '#mainView .tabs', '#mainView .card', '.site-mark']) {
    targets.push(...document.querySelectorAll(sel));
  }
  for (const el of targets) el.style.animation = 'none';
  const list = $('#friendsList');
  list.querySelectorAll('.enter').forEach((el) => el.classList.remove('enter'));
  void document.body.offsetWidth; // 一次强制重排, 让上面的清零生效(动画才会从头播)
  for (const el of targets) el.style.animation = '';
  markFriendsEntrance();
}

// SSE 进度事件 → 展板。只认语义阶段, 不绑具体 HTTP 请求(两条登录路的请求序列不一样)
function bootProgress(d) {
  if (!d || !d.stage) return;
  if (d.stage === 'verified') {
    if (loginWaiting) bootShow(); // 淡入时机: 凭据已验证+拿到用户信息, 不是点提交时
    return;
  }
  if (!bootActive) return; // 主界面上的 auth(WS 重连)之类一律忽略
  if (d.stage === 'auth') bootMark(0);
  else if (d.stage === 'roster') bootMark(1);
  else if (d.stage === 'friends') bootPercent(d.fetched, d.total);
}

// ---------- 好友与监控配置 ----------
async function loadFriends() {
  const r = await api('GET', '/api/friends');
  if (r.data.friends) {
    friendsCache = r.data.friends;
    $('#stMonitored').textContent = friendsCache.length + ' 人';
    renderFriends();
  }
}

// 信任等级 → 名字颜色类(严格使用 VRChat 官方 5 色)
const TRUST_CLASS = { 'Trusted User': 'tl-trusted', 'Known User': 'tl-known', 'User': 'tl-user', 'New User': 'tl-new', 'Visitor': 'tl-visitor' };

// 头像+VRCX 圆点+状态行: 好友行与页面标题栏"我"共用
function personParts(p) {
  const initial = escapeHtml((p.display_name || '?').charAt(0).toUpperCase());
  const avatarHtml = p.avatarKey
    ? "<img class=avatar src='" + avatarUrl(p.avatarKey) + "' loading='lazy' alt='' onerror=\"this.style.display='none';this.nextElementSibling.style.display='flex'\"><div class='avatar-fallback'>" + initial + '</div>'
    : "<div class='avatar-fallback' style='display:flex'>" + initial + '</div>';
  const statusCls = 'status-' + String(p.status || 'active').replace(/\s+/g, '');
  const wrapCls = 'st-' + (p.state || 'offline') + ' ' + statusCls;
  const worldTxt = p.world_id === 'private' ? '私密世界' : (p.world_name || '');
  const stateTxt = [worldTxt, p.status_description].filter(Boolean).map(escapeHtml).join(' · ');
  return {
    avatarWrap: "<div class='avatar-wrap " + wrapCls + "'>" + avatarHtml + '</div>',
    name: escapeHtml(p.display_name || p.friend_vrchat_id || p.vrchat_user_id || '?'),
    nameCls: p.trust_level ? ' ' + (TRUST_CLASS[p.trust_level] || '') : '',
    stateHtml: stateTxt ? "<div class='state'>" + stateTxt + '</div>' : ''
  };
}

// 世界名按需查到 → 定点更新涉及的那些行(不整页重渲染, 免得触发飞行动画)
function applyWorldName(worldId, worldName) {
  if (!worldId || typeof worldName !== 'string') return;
  let touchedFriends = false;
  for (const f of friendsCache) {
    if (f.world_id === worldId && f.world_name !== worldName) { f.world_name = worldName; touchedFriends = true; }
  }
  if (myInfo && myInfo.world_id === worldId && myInfo.world_name !== worldName) {
    myInfo.world_name = worldName;
    renderSelf();
  }
  if (!touchedFriends) return;
  const list = $('#friendsList');
  if (!list) return;
  for (const row of list.querySelectorAll('.friend')) {
    const f = friendsCache.find((x) => x.friend_vrchat_id === row.dataset.id);
    if (!f || f.world_id !== worldId) continue;
    const nameEl = row.querySelector('.name');
    if (!nameEl) continue;
    const p = personParts(f);
    nameEl.className = 'name' + p.nameCls;
    nameEl.innerHTML = p.name + p.stateHtml;
  }
}

function renderSelf() {
  const box = $('#selfInfo');
  if (!myInfo) { box.innerHTML = ''; return; }
  const p = personParts(myInfo);
  box.innerHTML = p.avatarWrap + "<div class='name" + p.nameCls + "'>" + p.name + p.stateHtml + '</div>';
}

// 好友分组折叠状态: 保存在浏览器 localStorage, 刷新/快照重渲染后恢复
// 离线组默认收起(大好友列表降噪; 用户手动展开/收起后以其选择为准并持久化)
const COLLAPSE_KEY = 'vrcn_groupCollapsed';
const COLLAPSE_DEFAULTS = { offline: true };
let groupCollapsed = {};
try { groupCollapsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; } catch (e) { groupCollapsed = {}; }
// 按 DOM 顺序(从上到下)给分组标题和每一行好友编号, 依次淡入; 底部文字跟在最后。
// 打开网页首次渲染和每次切换到好友页时都会调用(重新编号, 让级联从 0 立即开始)。
function markFriendsEntrance() {
  const list = $('#friendsList');
  let i = 0;
  const FADE_CAP = 30; // 阶梯上限: 好友再多也约 1s 内全部入场
  list.querySelectorAll('.group-title, .friend').forEach((el) => {
    el.classList.add('enter');
    el.style.setProperty('--i', String(Math.min(i++, FADE_CAP)));
  });
  const footer = document.querySelector('.site-mark');
  if (footer) footer.style.setProperty('--i', String(Math.min(i, FADE_CAP) + 1));
}
let friendsEntered = false; // 好友列表入场动画只在首次渲染播放(快照/搜索重渲染不重播)
function renderFriends() {
  const list = $('#friendsList');
  const kw = (searchQuery || '').trim().toLowerCase();
  const pool = kw
    ? friendsCache.filter((f) => (f.display_name || '').toLowerCase().includes(kw) || (f.world_name || '').toLowerCase().includes(kw) || (f.status_description || '').toLowerCase().includes(kw))
    : friendsCache;
  if (!pool.length) {
    list.innerHTML = '<p class=muted>' + (friendsCache.length ? '没有匹配的好友。' : '暂无好友数据, 点击上方「刷新」拉取。') + '</p>';
    $('#friendsCount').textContent = friendsCache.length ? '共 ' + friendsCache.length + ' 人' : '';
    return;
  }
  $('#friendsCount').textContent = '共 ' + friendsCache.length + ' 人';
  list.innerHTML = '';
  const renderRow = (f) => {
    const c = f.config || {};
    const isOn = (v) => v === 1; // 小开关默认关闭
    const row = document.createElement('div');
    row.className = 'friend';
    row.dataset.id = f.friend_vrchat_id;
    const p = personParts(f);
    row.innerHTML =
      p.avatarWrap +
      '<label class=switch title=特别关注><input type=checkbox class=favorite' + (c.favorite ? ' checked' : '') + '><span class=slider></span></label>' +
      '<div class="name' + p.nameCls + '">' + p.name + p.stateHtml + '</div>' +
      '<div class=checks>' +
      '<label><input type=checkbox data-k=notify_online' + (isOn(c.notify_online) ? ' checked' : '') + '>上线</label>' +
      '<label><input type=checkbox data-k=notify_offline' + (isOn(c.notify_offline) ? ' checked' : '') + '>下线</label>' +
      '<label><input type=checkbox data-k=notify_status_change' + (isOn(c.notify_status_change) ? ' checked' : '') + '>状态</label>' +
      '<label><input type=checkbox data-k=notify_world_change' + (isOn(c.notify_world_change) ? ' checked' : '') + '>世界</label>' +
      '</div>';
    return row;
  };
  const stateRank = { online: 0, active: 1, offline: 2 };
  const byState = (a, b) => (stateRank[a.state] ?? 3) - (stateRank[b.state] ?? 3);
  // 特别关注组内部按状态排序: 在线 -> 活动(网页在线) -> 离线
  const favList = pool.filter((f) => f.config && f.config.favorite === 1).sort(byState);
  // 其他好友按状态分类: 在线 -> 网页在线 -> 离线
  const otherList = pool.filter((f) => !(f.config && f.config.favorite === 1));
  const onlineOthers = otherList.filter((f) => f.state === 'online');
  const activeOthers = otherList.filter((f) => f.state === 'active');
  const offlineOthers = otherList.filter((f) => f.state === 'offline');
  const addGroup = (key, title, list2) => {
    const g = document.createElement('div');
    g.className = 'group-title';
    g.dataset.group = key;
    const btn = document.createElement('button');
    btn.className = 'group-toggle';
    btn.type = 'button';
    // 恢复浏览器保存的折叠状态; 未保存过则用默认值(离线组默认收起, 其余全开)
    const collapsed = groupCollapsed[key] !== undefined ? !!groupCollapsed[key] : !!COLLAPSE_DEFAULTS[key];
    btn.title = collapsed ? '展开' : '收起';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m6 9 6 6 6-6\"/></svg>';
    const label = document.createElement('span');
    label.textContent = title;
    g.appendChild(btn);
    g.appendChild(label);
    const body = document.createElement('div');
    body.className = 'group-body' + (collapsed ? ' collapsed' : '');
    body.dataset.group = key;
    g.classList.toggle('collapsed', collapsed);
    const inner = document.createElement('div');
    inner.className = 'group-inner';
    for (const f of list2) inner.appendChild(renderRow(f));
    body.appendChild(inner);
    list.appendChild(g);
    list.appendChild(body);
    btn.addEventListener('click', () => {
      const nowCollapsed = body.classList.toggle('collapsed');
      g.classList.toggle('collapsed', nowCollapsed);
      btn.title = nowCollapsed ? '展开' : '收起';
      btn.setAttribute('aria-label', btn.title);
      groupCollapsed[key] = nowCollapsed;
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(groupCollapsed)); } catch (e) {}
    });
  };
  if (favList.length) addGroup('fav', '⭐ 特别关注 (' + favList.length + ')', favList);
  if (onlineOthers.length) addGroup('online', '在线 (' + onlineOthers.length + ')', onlineOthers);
  if (activeOthers.length) addGroup('active', '网页在线 (' + activeOthers.length + ')', activeOthers);
  if (offlineOthers.length) addGroup('offline', '离线 (' + offlineOthers.length + ')', offlineOthers);
  // 首次渲染: 按 DOM 顺序(从上到下)给分组标题和每一行好友编号, 依次淡入; 底部文字跟在最后
  if (!friendsEntered) { markFriendsEntrance(); friendsEntered = true; }
}

// ---------- 特别关注切换 FLIP 动画: 行 + 分组标题 + 组体整体平滑移动, 不刷新页面 ----------
let flipRafId = 0;
let flipItems = []; // 进行中的动画元素: 被新动画打断时清理残留 transform/opacity
function flipKey(el) {
  if (el.classList.contains('friend')) return 'r:' + el.dataset.id;
  if (el.classList.contains('group-title')) return 'gt:' + el.dataset.group;
  if (el.classList.contains('group-body')) return 'gb:' + el.dataset.group;
  return null;
}
// 目标分组若处于折叠状态则先展开(折叠会裁剪行, 落位动画不可见), 并持久化到 localStorage
function expandGroupFor(f) {
  const c = f.config || {};
  const key = c.favorite ? 'fav' : (f.state === 'online' ? 'online' : (f.state === 'active' ? 'active' : 'offline'));
  if (groupCollapsed[key]) {
    groupCollapsed[key] = false;
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(groupCollapsed)); } catch (e) { /* ignore */ }
  }
}
function captureRowRects() {
  const rects = new Map();
  $('#friendsList').querySelectorAll('.friend, .group-title, .group-body').forEach((el) => {
    const k = flipKey(el);
    if (k) rects.set(k, el.getBoundingClientRect());
  });
  return rects;
}
function playRowFlip(oldRects, movedId, rowOpts = null) {
  if (flipRafId) {
    cancelAnimationFrame(flipRafId);
    for (const m of flipItems) { m.el.style.transform = ''; if (m.fade) m.el.style.opacity = ''; }
  }
  const items = [];
  const bodyDeltas = new Map(); // 组体位移: 行位移减去它, 避免组体+行双重移动
  $('#friendsList').querySelectorAll('.group-title, .group-body').forEach((el) => {
    const prev = oldRects.get(flipKey(el));
    if (!prev) return;
    const cur = el.getBoundingClientRect();
    const dx = prev.left - cur.left;
    const dy = prev.top - cur.top;
    if (el.classList.contains('group-body')) bodyDeltas.set(el.dataset.group, { dx, dy });
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    items.push({ el, dx, dy });
  });
  $('#friendsList').querySelectorAll('.friend').forEach((r) => {
    const prev = oldRects.get(flipKey(r));
    if (!prev) return;
    const ro = rowOpts ? rowOpts.get(r.dataset.id) : null;
    if (ro && ro.skip) return; // 不参与飞行(特别关注好友等)
    const cur = r.getBoundingClientRect();
    const body = r.closest('.group-body');
    const bd = body ? (bodyDeltas.get(body.dataset.group) || { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
    // 从原位完整飞到新位置(旧位置 - 新位置 - 所属组体位移, 避免双重移动)
    const dx = prev.left - cur.left - bd.dx;
    const dy = prev.top - cur.top - bd.dy;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    items.push({ el: r, dx, dy, fade: ro ? ro.fade : null });
  });
  if (!items.length) return;
  flipItems = items;
  const moved = movedId != null ? $('#friendsList').querySelector('.friend[data-id="' + movedId + '"]') : null;
  if (moved) moved.classList.add('fav-spot'); // 被移动行高光脉冲
  // 动画期间放开组内裁剪: 行飞越分组边界时才不会被 overflow:hidden 吞掉(折叠组保持裁剪)
  $('#friendsList').classList.add('flipping');
  // 飞行速度剖面: 起步瞬间加速度最小、随即增大, 0.2s 内达到峰值速度 7px/ms,
  // 之后匀速巡航, 末尾 0.2s 对称减速; 距离越远飞得越久
  const PEAK = 7;                    // px/ms 峰值速度
  const ACCEL = 200;                 // 加速段时长 ms(0.2s 内达到最大速度)
  const ACC_DIST = PEAK * ACCEL / 3; // 加速段覆盖距离(200px)
  const MIN_DUR = 160;
  const MAX_DUR = 2400;
  for (const m of items) {
    const d = Math.hypot(m.dx, m.dy);
    m.d = d;
    if (d >= 2 * ACC_DIST) {
      m.T = Math.min(MAX_DUR, 2 * ACCEL + (d - 2 * ACC_DIST) / PEAK);
      m.A = ACCEL;
    } else {
      m.T = Math.max(MIN_DUR, 2 * ACCEL * (d / (2 * ACC_DIST)));
      m.A = m.T / 2; // 短位移: 纯对称加速-减速, 无匀速段
    }
  }
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    let done = true;
    for (const m of items) {
      const p = Math.min(1, t / m.T);
      const tc = Math.min(t, m.T); // 截断: 到点即停在目标位置, 继续积分会导致过冲错位
      // 位置比例: 加速段 t³(加速度从 0 渐增)→ 匀速 → 对称减速
      let f;
      if (m.d >= 2 * ACC_DIST) {
        if (tc <= m.A) f = (PEAK * tc * tc * tc / (3 * m.A * m.A)) / m.d;
        else if (tc <= m.T - m.A) f = (ACC_DIST + PEAK * (tc - m.A)) / m.d;
        else { const tau = m.T - tc; f = 1 - (PEAK * tau * tau * tau / (3 * m.A * m.A)) / m.d; }
      } else {
        if (tc <= m.A) f = 0.5 * Math.pow(tc / m.A, 3);
        else f = 1 - 0.5 * Math.pow((m.T - tc) / m.A, 3);
      }
      m.el.style.transform = 'translate3d(' + (m.dx * (1 - f)).toFixed(2) + 'px, ' + (m.dy * (1 - f)).toFixed(2) + 'px, 0)';
      if (m.fade) m.el.style.opacity = (m.fade === 'in' ? (0.12 + 0.88 * f) : (1 - f)).toFixed(2);
      if (p < 1) done = false;
    }
    if (!done) {
      flipRafId = requestAnimationFrame(frame);
    } else {
      flipRafId = 0;
      flipItems = [];
      for (const m of items) { m.el.style.transform = ''; if (m.fade) m.el.style.opacity = ''; }
      if (moved) moved.classList.remove('fav-spot');
      $('#friendsList').classList.remove('flipping');
    }
  };
  flipRafId = requestAnimationFrame(frame);
}

// ---------- 上下线实时更新(纯前端 diff 动画): 换组的行飞行动画, 未换组的行状态文案翻动 ----------
let notifyMotionTimer = null;
function scheduleNotifyRefresh() {
  if (notifyMotionTimer) clearTimeout(notifyMotionTimer);
  notifyMotionTimer = setTimeout(() => {
    notifyMotionTimer = null;
    refreshFriendsWithMotion();
  }, 200); // 合并突发通知, 避免动画互相打断
}
function captureRowsState() {
  const rects = new Map();
  const rows = new Map();
  $('#friendsList').querySelectorAll('.friend, .group-title, .group-body').forEach((el) => {
    const k = flipKey(el);
    if (k) rects.set(k, el.getBoundingClientRect());
  });
  $('#friendsList').querySelectorAll('.friend').forEach((r) => {
    const body = r.closest('.group-body');
    const st = r.querySelector('.state');
    rows.set(r.dataset.id, {
      group: body ? body.dataset.group : null,
      collapsed: !!(body && body.classList.contains('collapsed')),
      stateTxt: st ? st.textContent : ''
    });
  });
  return { rects, rows };
}
// 状态文案翻动: 旧文案向上滚出、新文案从下方滚入(与「平均 x 次/分钟」同款观感)
function rollStateText(row, newTxt, oldTxt) {
  const st = row.querySelector('.state');
  if (!st || oldTxt === newTxt) return;
  st.innerHTML = "<span class='st-roll st-new'>" + escapeHtml(newTxt) + "</span><span class='st-roll st-old'>" + escapeHtml(oldTxt) + '</span>';
  const newEl = st.querySelector('.st-new');
  if (newEl) newEl.addEventListener('animationend', () => { st.textContent = newTxt; }, { once: true });
}
function refreshFriendsWithMotion() {
  const old = captureRowsState();
  loadFriends()
    .then(() => {
      const rowOpts = new Map();
      const flown = new Set();
      $('#friendsList').querySelectorAll('.friend').forEach((r) => {
        const info = old.rows.get(r.dataset.id);
        if (!info) return;
        const body = r.closest('.group-body');
        const newGroup = body ? body.dataset.group : null;
        const newCollapsed = !!(body && body.classList.contains('collapsed'));
        if (info.group === newGroup) return; // 未换组: 交给文案翻动
        if (info.collapsed && newCollapsed) return; // 始末两组都折叠: 不显示动画
        if (info.group === 'fav' || newGroup === 'fav') { rowOpts.set(r.dataset.id, { skip: true }); flown.add(r.dataset.id); return; } // 特别关注不参与飞行, 直接更新
        let fade = null;
        if (info.collapsed && !newCollapsed) fade = 'in';       // 从折叠标题飞出: 淡入
        else if (!info.collapsed && newCollapsed) fade = 'out'; // 飞入折叠标题: 淡出
        rowOpts.set(r.dataset.id, { fade });
        flown.add(r.dataset.id);
      });
      playRowFlip(old.rects, null, rowOpts);
      // 未换组的行: 世界/社交状态文案变化 → 上下翻动
      $('#friendsList').querySelectorAll('.friend').forEach((r) => {
        if (flown.has(r.dataset.id)) return;
        const info = old.rows.get(r.dataset.id);
        if (!info) return;
        const st = r.querySelector('.state');
        const newTxt = st ? st.textContent : '';
        if (info.stateTxt !== newTxt) rollStateText(r, newTxt, info.stateTxt);
      });
    })
    .catch(() => {});
}

$('#friendsList').addEventListener('change', async (e) => {
  const cb = e.target;
  const row = cb.closest('.friend');
  if (!row) return;
  const id = row.dataset.id;
  const cur = friendsCache.find((f) => f.friend_vrchat_id === id) || {};
  const c = cur.config || {};
  const body = {
    favorite: !!row.querySelector('.favorite').checked,
    notifyOnline: !!row.querySelector('[data-k=notify_online]').checked,
    notifyOffline: !!row.querySelector('[data-k=notify_offline]').checked,
    notifyStatusChange: !!row.querySelector('[data-k=notify_status_change]').checked,
    notifyWorldChange: !!row.querySelector('[data-k=notify_world_change]').checked
  };
  const isFav = cb.classList.contains('favorite');
  if (isFav) {
    // 乐观更新 + FLIP: 先按本地状态重排, 行平滑飞向新分组, 随后后台提交
    const oldRects = captureRowRects();
    cur.config = { ...c, favorite: body.favorite ? 1 : 0 }; // 注意用 0/1: renderFriends 按 === 1 分组, 布尔值会导致不重排、无动画
    expandGroupFor(cur); // 目标分组折叠时先展开, 否则行落进被裁剪的隐藏区域, 看不到动画
    renderFriends();
    playRowFlip(oldRects, id);
  }
  const r = await api('PUT', '/api/friends/' + encodeURIComponent(id) + '/config', body);
  if (r.data.ok) {
    cur.config = r.data.config;
    // 注意: 这里不再重渲染 —— 乐观渲染已把行放到正确分组,
    // 重渲染会重建 DOM 并瞬间打断进行中的 FLIP 动画
  } else if (isFav) {
    loadFriends(); // 提交失败: 回滚到服务端状态
  }
});

// 高光跟随鼠标(好友行/tab/概览卡片/门禁登录卡/弹窗): 事件委托 + rAF 补间, 只维护当前悬停元素
let spotRow = null;
let spotTarget = null;
let spotCurrent = null;
let spotRaf = null;
function tickSpotlight() {
  spotRaf = null;
  const row = spotRow;
  if (!row || !spotTarget || !spotCurrent) return;
  spotCurrent.x += (spotTarget.x - spotCurrent.x) * 0.24;
  spotCurrent.y += (spotTarget.y - spotCurrent.y) * 0.24;
  row.style.setProperty('--mx', spotCurrent.x.toFixed(1) + 'px');
  row.style.setProperty('--my', spotCurrent.y.toFixed(1) + 'px');
  if (Math.hypot(spotTarget.x - spotCurrent.x, spotTarget.y - spotCurrent.y) > 0.35) {
    spotRaf = requestAnimationFrame(tickSpotlight);
  }
}
document.addEventListener('mousemove', (e) => {
  const row = e.target.closest ? e.target.closest('.friend, .tab, .overview-item, #gateView .card, #loginView .login-main, .modal, .to-top') : null;
  if (!row) {
    spotRow = null;
    spotTarget = null;
    spotCurrent = null;
    return;
  }
  const rect = row.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (spotRow !== row) {
    spotRow = row;
    spotCurrent = { x, y };
    row.style.setProperty('--mx', x + 'px');
    row.style.setProperty('--my', y + 'px');
  }
  spotTarget = { x, y };
  if (!spotRaf) spotRaf = requestAnimationFrame(tickSpotlight);
});

// 手动触发对账刷新(工具栏「刷新」按钮与概览「上次刷新」卡共用); 结果提示 3s 后自动隐藏
let opMsgTimer = null;
function opMsgFlash(text) {
  const el = $('#opMsg');
  el.textContent = text;
  if (opMsgTimer) clearTimeout(opMsgTimer);
  opMsgTimer = setTimeout(() => { el.textContent = ''; opMsgTimer = null; }, 3000);
}
async function triggerSnapshot() {
  $('#opMsg').textContent = '刷新中...';
  const r = await api('POST', '/api/monitor/snapshot', {});
  if (r.data.ok) {
    opMsgFlash('刷新完成');
    loadFriends();
    loadStatus();
  } else {
    opMsgFlash(r.data.error || '刷新失败');
  }
}
$('#forceSnapshot').addEventListener('click', triggerSnapshot);

// 好友搜索(150ms 防抖)
let friendSearchTimer = null;
$('#friendSearch').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  clearTimeout(friendSearchTimer);
  friendSearchTimer = setTimeout(renderFriends, 150);
});

// ---------- 设置 ----------
// QQ 开关: 实时保存(成功不提示, 后端 [server] 更新通知设置 日志可在面板看到); 关闭时隐藏 AppID/AppSecret/说明/按钮
function syncQqFields() {
  const on = $('#sQqEnabled').checked;
  $('#qqFields').classList.toggle('hidden', !on);
  $('#qqDisabledHint').classList.toggle('hidden', on);
}

// 卡片提示: 2s 后自动消失(重复触发重置计时)
let settingsMsgTimer = null;
function flashSettingsMsg(text) {
  $('#settingsMsg').textContent = text;
  clearTimeout(settingsMsgTimer);
  settingsMsgTimer = setTimeout(() => { $('#settingsMsg').textContent = ''; }, 2000);
}

$('#sQqEnabled').addEventListener('change', async () => {
  const input = $('#sQqEnabled');
  const want = input.checked ? 1 : 0;
  try {
    const r = await api('PUT', '/api/settings', { qq_enabled: want });
    if (!r.data.ok) {
      input.checked = want !== 1; // 回滚本次提交的开关值
      flashSettingsMsg(r.data.error || '保存失败');
      return;
    }
  } catch (e) {
    input.checked = want !== 1;
    flashSettingsMsg(e.message || '保存失败');
    return;
  }
  syncQqFields();
});

async function loadSettings() {
  const r = await api('GET', '/api/settings');
  const s = r.data.settings || {};
  $('#sQqEnabled').checked = !!s.qq_enabled;
  $('#sQqAppId').value = s.qq_app_id || '';
  $('#sQqAppSecret').placeholder = s.qq_app_secret ? '已配置(留空保持不变)' : '未配置';
  // 站内通知类型开关: 缺省视为开(后端仅显式 0 关闭)
  $('#sNotifyGroupAnnouncement').checked = s.notify_group_announcement !== 0;
  $('#sNotifyBoop').checked = s.notify_boop !== 0;
  $('#sNotifyInvite').checked = s.notify_invite !== 0;
  syncQqFields();
}

// 保存按钮: 仅提交 AppID/AppSecret(开关已实时保存); 结果提示 2s 后消失
$('#saveSettings').addEventListener('click', async () => {
  const body = { qq_app_id: $('#sQqAppId').value.trim() || null };
  const qqSecret = $('#sQqAppSecret').value;
  if (qqSecret) body.qq_app_secret = qqSecret;
  const r = await api('PUT', '/api/settings', body);
  flashSettingsMsg(r.data.ok ? '已保存' : (r.data.error || '保存失败'));
  if (r.data.ok) {
    $('#sQqAppSecret').value = '';
    loadSettings();
  }
});

// 通知设置: 切换即时保存(无保存按钮); 成功不提示(后端 [server] 更新通知设置 日志可在面板看到), 失败时回滚开关 UI 并提示
function bindNotifyToggle(id, key) {
  $(id).addEventListener('change', async () => {
    const input = $(id);
    const want = input.checked ? 1 : 0;
    const r = await api('PUT', '/api/settings', { [key]: want });
    if (!r.data.ok) {
      input.checked = want !== 1; // 回滚本次提交的开关值
      $('#notifyMsg').textContent = r.data.error || '保存失败';
    }
  });
}
bindNotifyToggle('#sNotifyGroupAnnouncement', 'notify_group_announcement');
bindNotifyToggle('#sNotifyBoop', 'notify_boop');
bindNotifyToggle('#sNotifyInvite', 'notify_invite');

function bindTest(kind, btnId) {
  $(btnId).addEventListener('click', async () => {
    // 发送结果统一由后端日志流推送([server] 发送测试通知/成功/失败), 刷新后依然可见
    await api('POST', '/api/test/' + kind, {});
  });
}
bindTest('qq', '#testQq');

// ---------- 状态与事件 ----------
function renderQqStatus(info) {
  const el = $('#stQq');
  if (!info || info.configured === false) {
    el.textContent = '未配置';
    el.className = 'badge';
    el.title = 'QQ 机器人未配置';
    return;
  }
  el.textContent = info.connected ? '已连接' : '未连接';
  el.className = 'badge ' + (info.connected ? 'ok' : 'warn');
  el.title = info.connected ? 'QQ 机器人已连接' : 'QQ 机器人未连接';
}

// 渲染状态负载(SSE 'status' 事件直接调用; loadStatus 为进入主界面的 bootstrap)
function renderStatus(d) {
  if (!d) return;
  const ws = $('#stWs');
  if (!d.loggedIn) { ws.textContent = '-'; ws.className = 'badge'; }
  else if (d.wsConnected) { ws.textContent = '已连接'; ws.className = 'badge ok'; }
  else { ws.textContent = '未连接/重连中'; ws.className = 'badge warn'; }
  $('#stSnapshot').textContent = d.lastSnapshotAt ? new Date(d.lastSnapshotAt).toLocaleTimeString() : '-';
  if (d.user) { myInfo = d.user; renderSelf(); }
  if (!d.qq || !d.qq.configured) renderQqStatus({ configured: false });
  else renderQqStatus({ configured: true, connected: d.qq.connected });
}

async function loadStatus() {
  const r = await api('GET', '/api/status');
  renderStatus(r.data || {});
}

// VRC 服务器状态由后端判断(惰性请求 + 60s 缓存; 获取失败时沿用上次成功状态), 前端只负责展示三态(主界面与登录页共用)
function applyVrcStatus(badge, d) {
  if (!d || d.state === 'unknown') {
    // 获取失败(后端明确返回 unknown): 灰色徽章 + 「无法获取」; 未返回数据时保持「-」
    badge.textContent = (d && d.state === 'unknown') ? '无法获取' : '-';
    badge.className = 'badge';
    badge.title = (d && d.description)
      ? (d.description + (d.summary ? ' · ' + d.summary : ''))
      : 'VRChat 服务器状态检测中';
    return;
  }
  const detail = (d.description || '') +
    (d.summary ? ' · ' + d.summary : '') +
    (d.fetchedAt ? ' · 检测于 ' + new Date(d.fetchedAt).toLocaleTimeString() : '');
  if (d.state === 'normal') {
    badge.textContent = '正常';
    badge.className = 'badge ok';
    badge.title = 'VRChat 服务器正常';
  } else if (d.state === 'outage') {
    badge.textContent = '故障';
    badge.className = 'badge bad';
    badge.title = detail;
  } else {
    badge.textContent = '降级';
    badge.className = 'badge warn';
    badge.title = detail;
  }
}

// 延迟着色: 1-200 绿, 201-800 黄, 其余(0/负值/800以上)红
function latencyClass(ms) {
  if (ms >= 1 && ms <= 200) return 'lat-ok';
  if (ms >= 201 && ms <= 800) return 'lat-warn';
  return 'lat-bad';
}

function applyLatency(lat, d) {
  if (d.status === 'ok' && typeof d.latencyMs === 'number') {
    lat.textContent = '延迟: ' + d.latencyMs + ' ms';
    lat.className = 'ov-meta ' + latencyClass(d.latencyMs);
  } else {
    lat.textContent = '延迟: -';
    lat.className = 'ov-meta';
  }
}

async function loadHealth() {
  let r, s;
  try {
    [r, s] = await Promise.all([
      api('GET', '/api/health'),
      api('GET', '/api/vrc-status')
    ]);
  } catch (e) { return; } // 后端未正确连接时由门禁/心跳弹窗兜底, 此处不抛未捕获异常
  const d = r.data || {};
  applyLatency($('#stHealthLatency'), d);
  applyLatency($('#lgHealthLatency'), d);
  applyVrcStatus($('#stHealth'), s.data);
  applyVrcStatus($('#lgHealth'), s.data);
}

// WS 图表: canvas 绘制(单图层栅格, 无合成层残留伪影), 时间锚定匀速左移; 柱高与次数严格成正比(线性)
let wsChartBars = [];      // { t, n } t = 秒级时间戳
let wsChartMax = 1;        // 当前窗口最大值(高度基准)
let wsStatsBuckets = new Map(); // sec -> n(最近 60s 秒桶, 用于「平均次数」总数增减)
let wsStatsTotal = 0;
let wsChartRaf = 0;
let wsChartCv = null;      // canvas 元素
let wsChartGradCache = { c1: '', c2: '', at: 0 };
let wsChartThemeCache = { bg: '', line: '', at: 0 };

// 柱子渐变配色: 从隐藏探针读取解析后的主题色(accent-2 柱顶 / accent 柱底), 与品牌渐变一致
function wsChartGradientColors() {
  const now = Date.now();
  if (!wsChartGradCache.c1 || now - wsChartGradCache.at > 500) {
    const probe = $('#wsChartColors');
    const cs = probe && getComputedStyle(probe);
    wsChartGradCache.c1 = (cs && cs.color) || '#8b5cf6';            // 柱顶: --accent-2
    wsChartGradCache.c2 = (cs && cs.backgroundColor) || '#3b6fe0';  // 柱底: --accent
    wsChartGradCache.at = now;
  }
  return wsChartGradCache;
}

// 图表自身的背景/描边色(取自 #log 的 input-bg / line 解析值), 全部画进 canvas, 外层无任何 CSS 装饰
function wsChartTheme() {
  const now = Date.now();
  if (!wsChartThemeCache.bg || now - wsChartThemeCache.at > 500) {
    const log = $('#log');
    const cs = log && getComputedStyle(log);
    wsChartThemeCache.bg = (cs && cs.backgroundColor) || 'rgba(255,255,255,0.05)';
    wsChartThemeCache.line = (cs && cs.borderTopColor) || 'rgba(255,255,255,0.085)';
    wsChartThemeCache.at = now;
  }
  return wsChartThemeCache;
}

function wsChartRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wsChartDraw() {
  const cv = wsChartCv || (wsChartCv = $('#wsChart'));
  if (!cv) { wsChartRaf = 0; return; }
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, Math.round(cv.clientWidth * dpr));
  const h = Math.max(10, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  // 背景/描边在设备像素空间精确落格(避免亮边); 柱子横向用亚像素坐标保证滑动丝滑
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const theme = wsChartTheme();
  const radius = Math.round(7 * dpr);
  ctx.fillStyle = theme.bg;
  wsChartRoundRect(ctx, 0, 0, w, h, radius);
  ctx.fill();
  const nowSec = Date.now() / 1000;
  const sx = w / 300, sy = h / 28;
  // 清理滚出左端的柱子(峰值柱滚出后重算高度基准)
  let pruned = false;
  for (let i = wsChartBars.length - 1; i >= 0; i--) {
    const b = wsChartBars[i];
    if (300 - (nowSec - b.t) * 5 + 5 <= 0) { wsChartBars.splice(i, 1); pruned = true; }
  }
  if (pruned) {
    let m = 0;
    for (const b of wsChartBars) if (b.n > m) m = b.n;
    wsChartMax = m || 1;
  }
  ctx.globalAlpha = .95;
  const grad = wsChartGradientColors();
  const inset = Math.max(2, Math.round(2 * dpr));
  for (const b of wsChartBars) {
    if (!b.n) continue; // 0 条消息不显示柱子
    const x0 = (300 - (nowSec - b.t) * 5) * sx;
    if (x0 + 5 * sx <= 0) continue;
    const hh = 26 * (b.n / wsChartMax); // 相对高度严格和次数成正比
    const yBot = Math.round(28 * sy) - inset; // 底边留出描边 + 空隙
    const yTop = Math.min(Math.round((28 - hh) * sy), yBot - 1);
    const bw = 4 * sx;
    const bh = Math.max(1, yBot - yTop);
    // 长方体蓝色柱子(主题蓝 accent), 四角圆滑处理
    ctx.fillStyle = grad.c2;
    // 横向亚像素绘制: 每帧连续位移(此前取整导致 ~6 帧跳 1px 的卡顿感)
    wsChartRoundRect(ctx, x0, yTop, bw, bh, Math.min(1.6 * sx, bw / 2, bh / 2));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1; // 1 设备像素, 0.5 偏移精确落格
  wsChartRoundRect(ctx, 0.5, 0.5, w - 1, h - 1, radius);
  ctx.stroke();
  wsChartUpdateHover();
  wsChartRaf = requestAnimationFrame(wsChartDraw);
}
let wsChartTipVisible = false;   // 提示处于显示或淡出阶段
let wsChartTipHiding = false;    // 淡出进行中
let wsChartTipDoneTimer = 0;
let wsChartDwellTimer = 0;
let wsChartLastHitAt = 0;
let wsChartLastBar = null;
let wsChartTipEl = null;
let wsChartMouse = null;   // { x } viewBox 坐标, 鼠标在图表内时非空
let wsChartBound = false;
const WS_CHART_DWELL_MS = 500;  // 停留超过此时长才显示
const WS_CHART_GRACE_MS = 500;  // 离开柱子后的宽限(桥接柱间 1px 间隙), 之后开始淡出
const WS_CHART_FADE_MS = 1000;  // 淡入/淡出时长

function bindWsChartHover() {
  if (wsChartBound) return;
  wsChartBound = true;
  const svg = $('#wsChart');
  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    wsChartMouse = { x: (e.clientX - r.left) / r.width * 300 };
    wsChartUpdateHover();
  });
  svg.addEventListener('mouseleave', () => {
    wsChartMouse = null;
    wsChartUpdateHover();
  });
  // 失焦时收起提示并清空悬停状态(动画照常运行), 聚焦后鼠标移动会自然恢复
  window.addEventListener('blur', () => {
    wsChartMouse = null;
    if (wsChartDwellTimer) { clearTimeout(wsChartDwellTimer); wsChartDwellTimer = 0; }
    wsChartHideTip();
  });
}

function wsChartBarAt(mx) {
  const nowSec = Date.now() / 1000;
  const barW = 300 / 60;
  // 命中范围: 柱子本身 + 左右各 1 个柱宽(合计 3 个柱宽); 重叠时取距离最近的柱子
  let best = null;
  let bestD = Infinity;
  for (const b of wsChartBars) {
    const x = 300 - (nowSec - b.t) * barW;
    const d = Math.abs(mx - (x + barW / 2));
    if (d <= barW * 1.5 && d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function wsChartTrackTip(bar) {
  if (!wsChartTipEl || !bar) return;
  const svg = $('#wsChart');
  const r = svg.getBoundingClientRect();
  const nowSec = Date.now() / 1000;
  const barW = 300 / 60;
  const x = 300 - (nowSec - bar.t) * barW;
  wsChartTipEl.style.left = (r.left + (x + barW / 2) / 300 * r.width) + 'px';
  wsChartTipEl.style.top = (r.bottom + 8) + 'px'; // 提示框放在柱子下方
}

function wsChartShowTip(bar) {
  if (!bar) return;
  if (wsChartTipDoneTimer) { clearTimeout(wsChartTipDoneTimer); wsChartTipDoneTimer = 0; }
  wsChartTipHiding = false;
  wsChartTipVisible = true;
  if (!wsChartTipEl) {
    wsChartTipEl = document.createElement('div');
    wsChartTipEl.className = 'ws-chart-tip hidden';
    wsChartTipEl.style.transition = 'opacity ' + (WS_CHART_FADE_MS / 1000) + 's ease, transform ' + (WS_CHART_FADE_MS / 1000) + 's ease';
    document.body.appendChild(wsChartTipEl);
  }
  wsChartTipEl.textContent = bar.n + ' 条消息';
  wsChartTipEl.classList.remove('hidden');
  wsChartTrackTip(bar);
}

function wsChartHideTip() {
  if (!wsChartTipEl) return;
  wsChartTipHiding = true;
  wsChartTipEl.classList.add('hidden');
  if (!wsChartTipDoneTimer) {
    wsChartTipDoneTimer = setTimeout(() => {
      wsChartTipDoneTimer = 0;
      wsChartTipHiding = false;
      wsChartTipVisible = false;
    }, WS_CHART_FADE_MS);
  }
}

function wsChartUpdateHover() {
  const bar = (wsChartMouse && wsChartBars.length) ? wsChartBarAt(wsChartMouse.x) : null;
  const now = Date.now();
  if (bar) {
    wsChartLastHitAt = now;
    wsChartLastBar = bar;
    if (wsChartTipHiding) {
      wsChartShowTip(bar); // 淡出中重新命中: 取消淡出并恢复显示
    } else if (wsChartTipVisible) {
      wsChartShowTip(bar); // 已显示: 内容与位置随柱子每帧同步
    } else if (!wsChartDwellTimer) {
      // 停留超过阈值才显示
      wsChartDwellTimer = setTimeout(() => {
        wsChartDwellTimer = 0;
        if (Date.now() - wsChartLastHitAt <= WS_CHART_GRACE_MS) wsChartShowTip(wsChartLastBar);
      }, WS_CHART_DWELL_MS);
    }
  } else if (wsChartTipHiding) {
    wsChartTrackTip(wsChartLastBar); // 淡出期间继续跟随柱子移动
  } else if (wsChartTipVisible) {
    if (now - wsChartLastHitAt > WS_CHART_GRACE_MS) {
      wsChartHideTip(); // 鼠标离开或柱子移开超过宽限 → 开始淡出
    } else {
      wsChartTrackTip(wsChartLastBar); // 宽限期内(柱间间隙)仍跟随
    }
  } else if (wsChartDwellTimer && now - wsChartLastHitAt > WS_CHART_GRACE_MS) {
    clearTimeout(wsChartDwellTimer);
    wsChartDwellTimer = 0;
  }
}

function renderWsChart(series) {
  bindWsChartHover();
  if (!series || !series.length) { wsChartBars = []; wsChartMax = 1; return; }
  const nowSec = Date.now() / 1000;
  let max = 0;
  const buckets = [];
  for (let i = 0; i < series.length; i++) {
    const n = series[i];
    if (!n) continue;
    if (n > max) max = n;
    buckets.push({ t: nowSec - (series.length - 1 - i), n });
  }
  wsChartMax = max || 1;
  wsChartBars = buckets.filter((b) => 300 - (nowSec - b.t) * 5 + 5 > 0);
  if (!wsChartRaf) wsChartRaf = requestAnimationFrame(wsChartDraw);
  wsChartUpdateHover();
}

// 平均次数更新: 数值变化时旧值向上滚出、新值从下方滚入
function setWsTotal(total) {
  const num = $('#stWsNum');
  if (!num) return;
  const txt = String(total);
  if (num.dataset.val === txt) return;
  num.dataset.val = txt;
  const wrap = num.parentElement;
  const old = document.createElement('span');
  old.className = 'ws-old';
  old.textContent = num.textContent;
  // 滚动期间槽位宽度取新旧较宽者, 右对齐不变; 动画结束后收缩到新值宽度, 不留多余空格
  wrap.style.minWidth = Math.max(old.textContent.length, txt.length) + 'ch';
  num.textContent = txt;
  num.getAnimations().forEach((a) => a.cancel()); // 打断进行中的动画, 避免叠加抖动
  num.classList.remove('roll');
  void num.offsetWidth; // 强制重排, 重启动画
  num.classList.add('roll');
  wrap.appendChild(old);
  const done = () => {
    old.remove();
    wrap.style.minWidth = txt.length + 'ch';
  };
  old.addEventListener('animationend', done, { once: true });
}

// SSE 每秒推送: 追加/更新秒桶; 运动仍由 rAF 按时间锚定匀速左移, 与推送节奏无关
function wsChartPush(sec, n) {
  const nowSec = Date.now() / 1000;
  if (sec < nowSec - 60 || sec > nowSec + 1) return;
  const prev = wsStatsBuckets.get(sec) || 0;
  if (prev !== n) {
    wsStatsTotal += n - prev;
    wsStatsBuckets.set(sec, n);
    setWsTotal(wsStatsTotal);
  }
  let pruned = false;
  for (const s of [...wsStatsBuckets.keys()]) {
    if (s < nowSec - 60) { wsStatsTotal -= wsStatsBuckets.get(s) || 0; wsStatsBuckets.delete(s); pruned = true; }
  }
  if (pruned) setWsTotal(wsStatsTotal); // 过期秒桶退出窗口: 数字实时回落
  const i = wsChartBars.findIndex((b) => b.t === sec);
  if (n > 0) {
    if (i >= 0) wsChartBars[i].n = n;
    else wsChartBars.push({ t: sec, n });
    if (n > wsChartMax) wsChartMax = n;
  } else if (i >= 0) {
    wsChartBars.splice(i, 1); // 0 条消息不显示柱子
  }
  if (!wsChartRaf) wsChartRaf = requestAnimationFrame(wsChartDraw);
}

// 图表仅在视口内逐帧绘制: 滚动到下方(概览条离开屏幕)时暂停 rAF, 页面滚轮更丝滑
if ('IntersectionObserver' in window && $('#wsChart')) {
  new IntersectionObserver((entries) => {
    const vis = entries.some((e) => e.isIntersecting);
    if (vis) {
      if (!wsChartRaf) wsChartRaf = requestAnimationFrame(wsChartDraw);
    } else if (wsChartRaf) {
      cancelAnimationFrame(wsChartRaf);
      wsChartRaf = 0;
    }
  }).observe($('#wsChart'));
}

async function loadWsStats() {
  const r = await api('GET', '/api/ws-stats');
  if (!r.data || !Array.isArray(r.data.series)) return;
  // 权威序列 bootstrap(进入主界面/SSE 重连时): 重建本地秒桶与总量,
  // 覆盖断线期间漏掉的秒; 与推送重复的秒数据一致, 不产生重影
  wsStatsTotal = r.data.total || 0;
  wsStatsBuckets.clear();
  const endSec = Math.floor(Date.now() / 1000);
  for (let i = 0; i < r.data.series.length; i++) {
    const n = r.data.series[i];
    if (n) wsStatsBuckets.set(endSec - (r.data.series.length - 1 - i), n);
  }
  setWsTotal(wsStatsTotal);
  renderWsChart(r.data.series.slice(-60));
}

// SSE 连接(登录页与主界面共用): 日志/状态/健康/登录进度全部实时推送, 前端不再轮询
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

// ---------- 页面切换: 好友监控 / 设置(设置页含 QQ 机器人 + 后端日志) ----------
const PAGE_IDS = ['tab-friends', 'tab-settings'];
let fadeOutTimer = null;
// instant=true(用户点击切换): 旧页快速淡出 → 新页立即从 0 开始级联淡入;
// instant=false(启动恢复上次页面): 视为「打开网页」, 使用整页静态级联(概览条→导航→卡片→好友行→页脚)。
function switchTab(name, opts = {}) {
  if (!PAGE_IDS.includes(name)) name = PAGE_IDS[0];
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.target === name));
  const target = document.getElementById(name);
  if (opts.instant) {
    const finish = () => {
      PAGE_IDS.filter((id) => id !== name).forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.classList.remove('page-fade-out'); }
      });
      if (target) {
        target.classList.remove('page-fade-out');
        target.classList.add('switch-in'); // 标记本次是"切页进场"
        markCardsEntrance(target);         // 卡片按 0,1,2… 重新编号, 从头级联
        target.classList.remove('hidden');
        if (name === 'tab-friends') markFriendsEntrance(); // 好友行重新从上到下编号
      }
    };
    clearTimeout(fadeOutTimer);
    const old = PAGE_IDS.filter((id) => id !== name).map((id) => document.getElementById(id))
      .find((el) => el && !el.classList.contains('hidden'));
    if (old) {
      old.classList.add('page-fade-out');
      fadeOutTimer = setTimeout(finish, 120); // 快速淡出后立刻淡入(定时器兜底, 不依赖动画事件)
    } else {
      finish();
    }
  } else {
    clearTimeout(fadeOutTimer);
    PAGE_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('switch-in', 'page-fade-out');
      el.classList.toggle('hidden', id !== name);
    });
  }
  try { sessionStorage.setItem('vrcn_lastTab', name); } catch (e) {} // 刷新恢复所在页
  moveTabIndicator(); // 高亮滑块滑到当前 tab
  updateToTop(); // 切换后页面高度变化, 重新判定回到顶部按钮
}

// 切页进场: 把该页的直接 .card 按 DOM 顺序重新编号(0,1,2…), 每张延后 40ms 依次淡入。
// 原先是在 CSS 里写死 `#tab-settings.switch-in > .card:nth-child(1|2)`, 设置页加到第 3 张
// (后端日志)时漏了 —— 它带着静态 --i:9 出来, 比前两张晚 360ms, 看着像没动画。改成编号就不怕加卡片。
function markCardsEntrance(root) {
  let i = 0;
  for (const card of root.querySelectorAll(':scope > .card')) card.style.setProperty('--i', String(i++));
}

// 高亮滑块: 量出当前 tab 在容器里的位置与宽度, 交给 CSS 过渡滑过去(不是把背景在按钮之间跳)。
// 注意主界面隐藏时量出来全是 0, 所以除了切页, showView('main') 和窗口尺寸变化时也要重量。
function moveTabIndicator() {
  const bar = $('.tabs');
  const ind = $('#tabIndicator');
  const active = bar && bar.querySelector('.tab.active');
  if (!bar || !ind || !active) return;
  const b = bar.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  if (!a.width) return; // 还没布局(视图隐藏): 保持上一次的值, 等可见了再量
  const padLeft = bar.clientLeft || 0; // 左边框宽度(滑块的定位基准是 padding box)
  ind.style.width = a.width + 'px';
  ind.style.transform = 'translateX(' + (a.left - b.left - padLeft) + 'px)';
}
window.addEventListener('resize', moveTabIndicator);
$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.target, { instant: true }));
});
// QQ 机器人状态卡: 点击切换到设置页
const qqStatusItem = $('#stQq') ? $('#stQq').closest('.overview-item') : null;
if (qqStatusItem) {
  qqStatusItem.style.cursor = 'pointer';
  qqStatusItem.title = '点击打开设置页';
  qqStatusItem.addEventListener('click', () => switchTab('tab-settings', { instant: true }));
}
// 好友状态卡: 点击切回好友监控页面
const friendsStatusItem = $('#stMonitored') ? $('#stMonitored').closest('.overview-item') : null;
if (friendsStatusItem) {
  friendsStatusItem.style.cursor = 'pointer';
  friendsStatusItem.title = '点击回到好友监控页面';
  friendsStatusItem.addEventListener('click', () => switchTab('tab-friends', { instant: true }));
}
// 服务器状态卡: 点击打开 VRChat 官方状态页
const healthStatusItem = $('#stHealth') ? $('#stHealth').closest('.overview-item') : null;
if (healthStatusItem) {
  healthStatusItem.style.cursor = 'pointer';
  healthStatusItem.title = '点击打开 VRChat 官方状态页 (status.vrchat.com)';
  healthStatusItem.addEventListener('click', () => {
    window.open('https://status.vrchat.com', '_blank', 'noopener');
  });
}
// 外链(GitHub / QQ 开放平台): 与服务器状态卡一致 —— 无超链接, 点击经 JS window.open 打开新标签页; 视觉样式与原文字链接一致
$$('.ext-link').forEach((el) => {
  el.addEventListener('click', () => {
    const url = el.dataset.href;
    if (url) window.open(url, '_blank', 'noopener');
  });
});

// 回到顶部按钮: 页面切换按钮(.tabs)滚到吸顶标题栏处或更下方时显示; 固定右下角、最顶层悬浮
function updateToTop() {
  const btn = $('#toTopBtn');
  if (!btn) return;
  const tabs = document.querySelector('.tabs');
  let show = false;
  if (tabs && !tabs.closest('.hidden')) {
    const header = document.querySelector('header');
    const hh = header ? header.offsetHeight : 60;
    show = tabs.getBoundingClientRect().top <= hh;
  }
  btn.classList.toggle('off', !show);
}
window.addEventListener('scroll', updateToTop, { passive: true });
$('#toTopBtn').addEventListener('click', () => {
  if (window.__smoothScrollTo) window.__smoothScrollTo(0); // 复用惯性滚动滑回顶部
});
// 上次刷新卡: 点击手动触发对账刷新
const snapshotStatusItem = $('#stSnapshot') ? $('#stSnapshot').closest('.overview-item') : null;
if (snapshotStatusItem) {
  snapshotStatusItem.style.cursor = 'pointer';
  snapshotStatusItem.title = '点击立即刷新好友数据';
  snapshotStatusItem.addEventListener('click', () => triggerSnapshot());
}

// ---------- 主题: 自动(跟随系统)/浅色/深色 ----------
const THEME_KEY = 'vrcn_theme';
const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};
const THEME_LABELS = { auto: '主题: 跟随系统', light: '主题: 浅色', dark: '主题: 深色' };
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  localStorage.setItem(THEME_KEY, mode);
  $('#themeBtn').innerHTML = THEME_ICONS[mode];
  $('#themeBtn').title = THEME_LABELS[mode] + '(点击切换)';
}
$('#themeBtn').addEventListener('click', () => {
  const cur = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(cur === 'dark' ? 'auto' : (cur === 'auto' ? 'light' : 'dark'));
});
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

// ---------- 自定义下拉: 隐藏原生 select, 玻璃拟态菜单 + 动画 + 键盘导航 ----------
function makeDropdown(sel, opts = {}) {
  if (!sel || sel.dataset.dd) return sel ? sel.syncDd : null;
  sel.dataset.dd = '1';
  const multi = !!opts.multi; // 多选: 选中集合=显示集合; 单选保持原行为
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('dd-native');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn';
  btn.innerHTML = "<span class='dd-val'></span><svg class='dd-arrow' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>";
  const menu = document.createElement('div');
  menu.className = 'dd-menu'; // 开合由 .dd.open 驱动(全局 .hidden 是 display:none, 会跳过淡入淡出)
  const scroll = document.createElement('div');
  scroll.className = 'dd-scroll'; // 滚动收在内层, 关闭重开保留滚动位置(与 app.css .dd-scroll 同思路)
  menu.appendChild(scroll);
  wrap.append(btn, menu);
  const items = [];
  function checkEl() { const cb = document.createElement('span'); cb.className = 'dd-cb'; return cb; }
  function labelEl(text) { const lb = document.createElement('span'); lb.className = 'dd-lb'; lb.textContent = text; return lb; }
  let allRow = null;
  if (multi) {
    // 多选: 选中集合(默认全选); 「全选」行固定菜单顶部, 点击切换 全选/全不选
    sel.selectedValues = new Set(Array.from(sel.options).map((o) => o.value));
    allRow = document.createElement('div');
    allRow.className = 'dd-item dd-check'; // 复选框行: 全选中=对勾填满, 部分选中=横线
    allRow.append(checkEl(), labelEl('全选'));
    allRow.addEventListener('click', () => {
      const allVals = items.map((it) => it.dataset.v);
      const allSelected = allVals.length > 0 && allVals.every((v) => sel.selectedValues.has(v));
      if (allSelected) sel.selectedValues.clear();
      else allVals.forEach((v) => sel.selectedValues.add(v));
      sync();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    scroll.appendChild(allRow);
  }
  for (const opt of sel.options) {
    const it = document.createElement('div');
    it.className = 'dd-item dd-check'; // 统一复选框行样式: 单选模式只有一个勾选框被填满
    it.dataset.v = opt.value;
    it.append(checkEl(), labelEl(opt.textContent));
    it.addEventListener('click', () => {
      if (multi) {
        if (sel.selectedValues.has(opt.value)) sel.selectedValues.delete(opt.value);
        else sel.selectedValues.add(opt.value);
        sync();
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return; // 多选: 点完不关菜单, 继续勾选
      }
      if (sel.value !== opt.value) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync(); // 立即更新按钮文案, 不必等下次展开
      close();
    });
    scroll.appendChild(it);
    items.push(it);
  }
  function sync() {
    if (multi) {
      const allVals = items.map((it) => it.dataset.v);
      const n = allVals.filter((v) => sel.selectedValues.has(v)).length;
      const allSelected = allVals.length > 0 && n === allVals.length;
      // 按钮文案: 名称 + 选中/总数, 折叠状态一眼可见(等级 4/4、等级 2/4、分类 8/11)
      btn.querySelector('.dd-val').textContent = (opts.label ? opts.label + ' ' : '') + n + '/' + allVals.length;
      items.forEach((it) => it.classList.toggle('on', sel.selectedValues.has(it.dataset.v)));
      allRow.classList.toggle('on', allSelected);            // 全选中: 「全选」对勾填满
      allRow.classList.toggle('ind', !allSelected && n > 0); // 部分选中: 「全选」显示横线
    } else {
      btn.querySelector('.dd-val').textContent = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : String(sel.value || '');
      items.forEach((it) => it.classList.toggle('on', it.dataset.v === sel.value));
    }
  }
  function close() {
    wrap.classList.remove('open'); // CSS 过渡负责淡出
  }
  const navItems = multi ? [allRow, ...items] : items; // 多选时「全选」行也参与键盘导航
  navItems.forEach((it, i) => it.style.setProperty('--i', i)); // 逐行级联延迟的行号, 见 app.css .dd-item 的 animation-delay
  let activeIdx = -1;
  function markActive() {
    navItems.forEach((it, i) => it.classList.toggle('act', i === activeIdx));
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!wrap.classList.contains('open')) {
      $$('.dd.open').forEach((w) => w.classList.remove('open')); // 其他菜单同步淡出
      sync();
      activeIdx = navItems.findIndex((it) => it.classList.contains('on'));
      if (activeIdx < 0) activeIdx = 0; // 键盘导航默认落在第一行
      markActive();
      wrap.classList.add('open'); // CSS 过渡负责淡入
    } else {
      close();
    }
  });
  // 键盘导航: ↑↓ 移动, Enter/空格选中(多选为切换, 不关菜单), Esc 关闭
  wrap.addEventListener('keydown', (e) => {
    if (!wrap.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % navItems.length; markActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + navItems.length) % navItems.length; markActive(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const it = navItems[activeIdx]; if (it) it.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
  sync();
  sel.syncDd = sync; // 供外部改值后同步按钮文案
  return wrap;
}

// 初始化所有下拉(替代原生 select): 门禁/断开弹窗协议(单选)、日志等级与分类筛选(多选; QQ 启用已是开关)
makeDropdown($('#gateScheme'));
makeDropdown($('#connScheme'));
makeDropdown($('#logLevelSel'), { multi: true, label: '等级' });
makeDropdown($('#logCatSel'), { multi: true, label: '分类' });
logLevelSel = $('#logLevelSel');
logCatSel = $('#logCatSel');
// 筛选选择持久化: 恢复浏览器缓存(缓存里无效值丢弃, 只剩无效值按空集处理); 无缓存用默认全选
try {
  const saved = JSON.parse(localStorage.getItem('vrcnotifier.logFilter') || 'null');
  if (saved && typeof saved === 'object') {
    for (const [el, key] of [[logLevelSel, 'level'], [logCatSel, 'cat']]) {
      if (!el || !Array.isArray(saved[key])) continue;
      const valid = saved[key].filter((v) => Array.from(el.options).some((o) => o.value === v));
      el.selectedValues.clear();
      for (const v of valid) el.selectedValues.add(v);
      if (el.syncDd) el.syncDd();
    }
  }
} catch (e) { /* 缓存读取失败, 用默认全选 */ }
// 切换筛选 → 服务端按条件重新拉取尾部(文件里匹配的历史行都能翻出来), 并把选择写入缓存
function saveLogFilter() {
  try {
    localStorage.setItem('vrcnotifier.logFilter', JSON.stringify({
      level: logLevelSel ? Array.from(logLevelSel.selectedValues) : [],
      cat: logCatSel ? Array.from(logCatSel.selectedValues) : []
    }));
  } catch (e) { /* 存储不可用(隐私模式等)时忽略 */ }
}
$('#logLevelSel').addEventListener('change', () => { saveLogFilter(); loadBackendLogs({ tail: 100 }); });
$('#logCatSel').addEventListener('change', () => { saveLogFilter(); loadBackendLogs({ tail: 100 }); });

// ---------- 丝滑滚动: 替换默认滚轮为指数趋近的惯性滚动 ----------
// 起步跟手、尾段柔和; 日志卡/下拉菜单等内部滚动容器仍走原生。
// 不检测系统「减少动态效果」开关, 一律启用。
(function initSmoothScroll() {
  const NATIVE_SEL = '#log, .dd-menu'; // 内部滚动容器: 不拦截
  let target = window.scrollY;
  let current = window.scrollY;
  let rafId = null;
  const onWheel = (e) => {
    if (e.ctrlKey) return; // ctrl+滚轮 = 缩放, 交给浏览器
    const el = e.target && e.target.closest ? e.target.closest(NATIVE_SEL) : null;
    if (el) return; // 容器内部原生滚动
    e.preventDefault();
    let delta = e.deltaY || 0;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta = window.innerHeight * (delta > 0 ? 0.9 : -0.9);
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    target = Math.max(0, Math.min(max, target + delta * 1.15)); // 惯性加成: 快速拨轮/甩动滑得更远
    if (rafId === null) rafId = requestAnimationFrame(step);
  };
  const step = () => {
    current += (target - current) * 0.1; // 更柔的趋近: 尾段滑行更长、更丝滑
    if (Math.abs(target - current) < 0.3) {
      current = target;
      rafId = null;
    } else {
      rafId = requestAnimationFrame(step);
    }
    window.scrollTo(0, current);
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  // 其他滚动源(键盘/滚动条/锚点)直接改 scrollY 时同步目标, 避免相互对抗
  window.addEventListener('scroll', () => {
    if (rafId === null) { target = window.scrollY; current = window.scrollY; }
  }, { passive: true });
  // 供「回到顶部」按钮等调用: 复用同一惯性滚动
  window.__smoothScrollTo = (y) => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    target = Math.max(0, Math.min(max, Number(y) || 0));
    if (rafId === null) rafId = requestAnimationFrame(step);
  };
})();
// 启动时同步恢复上次视图(首帧前完成, 避免刷新瞬间闪出「连接后端」门禁页);
// 会话验证仍在后台进行, 无效时再由 checkSession 切到登录/门禁页。
try {
  const savedView = sessionStorage.getItem('vrcn_lastView');
  if (savedView === 'main' || savedView === 'login') showView(savedView);
} catch (e) {}
// 恢复上次所在页面(好友监控/设置), 首帧前完成
try {
  const savedTab = sessionStorage.getItem('vrcn_lastTab');
  if (savedTab === 'tab-friends' || savedTab === 'tab-settings') switchTab(savedTab);
} catch (e) {}
// 自动探测后端(同源优先 → 本机默认), 完成后拉配置; 探测结果用于未手动配置时的默认地址
(async () => {
  await discoverBase();
  loadConfig();
})();
startConnWatch();
fillGateForm(); // 先用默认地址预填门禁卡; discoverBase 完成后会再次刷新
