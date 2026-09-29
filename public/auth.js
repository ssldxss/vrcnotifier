'use strict';
// 视图切换与登录: 门禁/登录/主界面三态的切换、VRChat 登录与两步验证、进入主界面后的首屏数据。
// 从 app.js 拆出; 本文件仍是传统脚本、函数保持全局。

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

// 登录等待页 已拆到 boot.js + bootmath.js, 见 index.html 的脚本顺序
// 好友列表 已拆到 friends.js + friendmodel.js, 见 index.html 的脚本顺序
