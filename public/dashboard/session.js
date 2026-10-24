'use strict';
// Dashboard session controller. Dependencies are explicit; local UI state stays private.
window.VrcDashboardSession = {
  create(context) {
    const { state, $, loadHealth, accessToken, connectEvents, baseUrl, LS_BASE, LS_TOKEN, api, renderTop, renderSelf, loadFriends, loadFeed, loadWsHistory, firstConnectBackfill, applyTheme, LS_THEME } = context;
    // ---------- 门禁 / 启动 ----------
    // ---------- 视图 / 门禁 / 登录 ----------
    function showView(name) {
      state.view = name;
      try { sessionStorage.setItem('vrcn_lastView', name); } catch (e) { /* ignore */ }
      $('#gateView').classList.toggle('hidden', name !== 'gate');
      $('#loginView').classList.toggle('hidden', name !== 'login');
      $('#mainView').classList.toggle('hidden', name !== 'main');
      if (name === 'gate') fillGateForm();
      if (name === 'login' || name === 'main') loadHealth();
      if (name === 'login' && accessToken()) connectEvents();
    }
    function setGateMsg(msg) { $('#gateMsg').textContent = msg || ''; }
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
    function composeBase(scheme, host, port) {
      const h = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const p = String(port || '').trim().replace(/\D/g, '');
      return (scheme || 'http://') + (h || '127.0.0.1') + (p ? ':' + p : '');
    }
    function fillGateForm() {
      const s = splitBase(baseUrl());
      $('#gateScheme').value = s.scheme;
      const dd = $('#gateScheme');
      if (dd.syncDd) dd.syncDd();
      $('#gateHost').value = s.host;
      $('#gatePort').value = s.port;
      $('#gateToken').value = accessToken();
      $('#gateTokenLabel').textContent = state.config.tokenRequired ? '访问令牌 *' : '访问令牌';
    }
    function switchLoginForm(name, onShown) {
      // 登录卡片 / 2FA 卡片: 两张卡都居中, 切换时淡出淡入; onShown 在目标卡片显示后回调
      const cards = { login: $('#loginCard'), twofa: $('#twofaCard') };
      const to = cards[name];
      if (!to) return;
      const from = Object.keys(cards).map((k) => cards[k])
        .find((el) => el && el !== to && !el.classList.contains('hidden'));
      const show = () => {
        to.classList.remove('hidden');
        to.classList.remove('form-in');
        void to.offsetWidth;
        to.classList.add('form-in');
        const focusEl = name === 'login' ? $('#loginUser') : $('#twofaCode');
        if (focusEl) setTimeout(() => { try { focusEl.focus(); } catch (e) { /* ignore */ } }, 80);
        if (typeof onShown === 'function') onShown();
      };
      if (!from) { show(); return; }
      from.classList.add('form-fade-out');
      setTimeout(() => {
        from.classList.add('hidden');
        from.classList.remove('form-fade-out');
        show();
      }, 130);
    }
    async function gateConnect() {
      const btn = $('#connectBtn');
      const token = $('#gateToken').value.trim();
      localStorage.setItem(LS_BASE, composeBase($('#gateScheme').value, $('#gateHost').value, $('#gatePort').value));
      localStorage.setItem(LS_TOKEN, token);
      btn.disabled = true;
      btn.innerHTML = "<span class='btn-spinner'></span>连接中...";
      setGateMsg('正在连接后端...');
      const fail = (msg) => {
        btn.disabled = false;
        btn.textContent = '连接';
        setGateMsg(msg);
      };
      try {
        const headers = token ? { Authorization: 'Bearer ' + token } : {};
        const res = await fetch(baseUrl() + '/api/session', { headers, signal: AbortSignal.timeout(5000) });
        if (res.status >= 500) return fail('后端服务异常 (HTTP ' + res.status + ')');
        if (res.status === 401) return fail('访问被拒绝, 请检查令牌');
        location.reload();
      } catch (e) {
        fail('无法连接后端: ' + (e && e.name === 'TimeoutError' ? '连接超时' : '网络错误'));
      }
    }
    async function loadAll() {
      const cfg = await api('GET', '/api/config', undefined, { noAuth: true });
      state.config = cfg.data || {};
      const session = await api('GET', '/api/session');
      if (!session.data || !session.data.ok || !session.data.loggedIn) {
        showView('login');
        return;
      }
      showView('main');
      state.status = (await api('GET', '/api/status')).data || {};
      renderTop();
      renderSelf();
      await Promise.all([loadFriends(), loadFeed(false), loadHealth(), loadWsHistory()]);
      state.initialLoaded = true;
      connectEvents();
      if (state.pendingFirstBackfill) firstConnectBackfill();
    }
    // ---------- 登录等待页(四步进度, 动画复用 app.css 的 .boot-* ) ----------
    const bootState = { active: false, timer: 0, finishing: false, doneCbs: [] };
    function bootStepEl(i) { return document.getElementById('bootStep' + i); }
    function bootReset() {
      for (let i = 0; i < 4; i++) { const li = bootStepEl(i); if (li) li.classList.remove('on', 'ok'); }
      const pct = $('#bootPct');
      if (pct) pct.textContent = '';
      const title = $('#bootTitle');
      if (title) { title.textContent = '正在初始化'; title.classList.remove('done'); }
    }
    function bootShow() {
      const el = $('#bootScreen');
      if (!el || bootState.active) return;
      bootState.active = true;
      bootReset();
      el.classList.remove('hidden', 'out');
      void el.offsetWidth;
      el.classList.add('show');
    }
    // 立即把等待页变成完全不透明(跳过淡入): 登录成功后主界面马上在背后渲染,
    // 若等待页还在淡入中, 会透出还没加载好的主界面。
    function bootForceOpaque() {
      const el = $('#bootScreen');
      if (!el) return;
      el.style.transition = 'none';
      el.classList.remove('hidden', 'out');
      el.classList.add('show');
      void el.offsetWidth;
      requestAnimationFrame(() => { el.style.transition = ''; });
    }
    function bootProgress(d) {
      if (!d || !d.stage) return;
      if (d.stage === 'verified') { if (state.loginWaiting) bootShow(); return; }
      if (!bootState.active) return;
      if (d.stage === 'auth') {
        const s0 = bootStepEl(0);
        const s1 = bootStepEl(1);
        if (s0) s0.classList.add('ok');
        if (s1) s1.classList.add('on');
      } else if (d.stage === 'roster') {
        const s0 = bootStepEl(0);
        const s1 = bootStepEl(1);
        const s2 = bootStepEl(2);
        if (s0) s0.classList.add('ok');
        if (s1) { s1.classList.add('ok'); s1.classList.remove('on'); }
        if (s2) s2.classList.add('on');
      } else if (d.stage === 'friends') {
        const s2 = bootStepEl(2);
        if (s2) s2.classList.add('on');
        const pct = $('#bootPct');
        if (pct) pct.textContent = d.total ? (d.fetched + '/' + d.total) : (d.fetched != null ? String(d.fetched) : '');
      }
    }
    function bootFlushDone() {
      const cbs = bootState.doneCbs.splice(0);
      for (const cb of cbs) { try { cb(); } catch (e) { /* ignore */ } }
    }
    // 收尾: 把还没亮的步骤按顺序补完, 再播"初始化完成 + 淡出"; 动画真正结束后才回调。
    // 登录成功后必须等这里回调再刷新进主界面, 否则会看到动画没播完就切到主页。
    function bootFinish(onDone) {
      if (onDone) bootState.doneCbs.push(onDone);
      if (!bootState.active) { bootFlushDone(); return; }
      if (bootState.finishing) return;
      bootState.finishing = true;
      clearTimeout(bootState.timer);
      const steps = [0, 1, 2, 3].map(bootStepEl);
      let i = 0;
      const step = () => {
        while (i < steps.length && steps[i] && steps[i].classList.contains('ok')) i++;
        if (i < steps.length) {
          const li = steps[i];
          if (li) { li.classList.remove('on'); li.classList.add('ok'); }
          i++;
          bootState.timer = setTimeout(step, 120);
          return;
        }
        const title = $('#bootTitle');
        if (title) { title.textContent = '初始化完成'; title.classList.add('done'); }
        bootState.timer = setTimeout(() => {
          const el = $('#bootScreen');
          if (!el) {
            bootState.finishing = false;
            bootState.active = false;
            bootFlushDone();
            return;
          }
          el.classList.add('out');
          el.classList.remove('show');
          bootState.timer = setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('out');
            bootState.finishing = false;
            bootState.active = false;
            bootFlushDone();
          }, 950);
        }, 420);
      };
      step();
    }
    function bootHide() {
      bootState.active = false;
      bootState.finishing = false;
      bootState.doneCbs = [];
      clearTimeout(bootState.timer);
      const el = $('#bootScreen');
      if (el) { el.classList.add('hidden'); el.classList.remove('show', 'out'); }
    }

    // 登录/2FA 成功: 保持加载页, 原地完成主界面数据加载后淡出, 直接露出主界面(不再 location.reload)。
    // 旧实现是"登录页上播完动画 -> 刷新": 淡出时背后还是登录/2FA 卡片, 然后才 reload 到主界面。
    let enteringMain = false;
    async function completeLoginAndEnterMain() {
      if (enteringMain) return;
      enteringMain = true;
      state.loginWaiting = false;
      if (!bootState.active) bootShow(); // 成功响应一到就显示加载页, 不给主界面提前露出的机会
      bootForceOpaque(); // 立即完全不透明, 防止主界面从仍在淡入的等待页下面透出来
      state.pendingFirstBackfill = false; // 登录后 loadAll 会重新拉一遍数据, 不需要首连补拉(否则两个 feed 请求会互相作废)
      try {
        await loadAll(); // 内部会 showView('main') 并加载好友/动态/健康等, 全部在加载页后面完成
      } catch (e) {
        enteringMain = false;
        bootHide();
        const msg = $('#loginMsg');
        if (msg) msg.textContent = (e && e.message) || '加载失败, 请重试';
        const btn = $('#loginBtn');
        if (btn) btn.disabled = false;
        return;
      }
      if (state.view !== 'main') {
        // 会话还没就绪(极少见): 收起加载页回到登录页, 让用户重试
        enteringMain = false;
        bootHide();
        return;
      }
      try { $('#loginPass').value = ''; $('#twofaCode').value = ''; } catch (e) { /* ignore */ }
      state.tempSessionId = null;
      // 等主界面完成一帧绘制再开始收尾动画, 避免"等待页结束但主界面还没画好"
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      bootFinish(); // 主界面已就绪, 播完剩余步骤并淡出, 背后直接是主界面
    }

    // ---------- 自动重登 2FA 弹窗 ----------
    function openReloginModal() {
      const modal = $('#twofaReloginModal');
      if (!modal) return;
      $('#reloginCode').value = '';
      $('#relogin2faMsg').textContent = '';
      const btn = $('#relogin2faConfirm');
      if (btn) btn.disabled = false;
      modal.classList.remove('hidden');
      setTimeout(() => { try { $('#reloginCode').focus(); } catch (e) { /* ignore */ } }, 60);
    }
    function closeReloginModal() { const m = $('#twofaReloginModal'); if (m) m.classList.add('hidden'); }

    // ---------- 断线看门狗 + 断线弹窗(改地址/令牌) ----------
    let connTimer = 0;
    function fillConnModal() {
      const sp = splitBase(baseUrl());
      const cs = $('#connScheme');
      cs.value = sp.scheme;
      if (cs.syncDd) cs.syncDd();
      $('#connHost').value = sp.host;
      $('#connPort').value = sp.port;
      $('#connToken').value = accessToken();
    }
    function showConnModal() { fillConnModal(); $('#connModal').classList.remove('hidden'); }
    function hideConnModal() { $('#connModal').classList.add('hidden'); }
    async function checkBackend() {
      try {
        const r = await fetch(baseUrl() + '/api/config', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (r.ok) hideConnModal(); else showConnModal();
      } catch (e) { showConnModal(); }
    }
    function startConnWatch() {
      if (connTimer) return;
      connTimer = setInterval(checkBackend, 15000);
    }

    // ---------- 启动 ----------
    async function bootApp() {
      applyTheme(localStorage.getItem(LS_THEME) || 'dark');
      // 首屏按上次视图恢复, 避免已登录用户刷新时先闪一下门禁页
      try {
        const savedView = sessionStorage.getItem('vrcn_lastView');
        if (savedView === 'main' && accessToken()) showView('main');
        else if (savedView === 'login') showView('login');
      } catch (e) { /* ignore */ }
      // 没存过后端地址: 同源优先探测, 再试独立前端模式的默认后端(127.0.0.1:3000)
      if (!localStorage.getItem(LS_BASE)) {
        const candidates = [location.origin, 'http://127.0.0.1:3000'];
        for (const c of candidates) {
          try {
            const probe = new window.VrcNotifier.Client({ baseUrl: c, token: '' });
            const b = await probe.request('GET', '/api/config', { noAuth: true, signal: AbortSignal.timeout(2500) });
            if (b && b.ok) { localStorage.setItem(LS_BASE, c); break; }
          } catch (e) { /* 试下一个候选 */ }
        }
      }
      try {
        const cfg = await api('GET', '/api/config', undefined, { noAuth: true });
        state.config = cfg.data || {};
        if (state.config.tokenRequired && !accessToken()) { showView('gate'); setGateMsg(''); return; }
        const session = await api('GET', '/api/session');
        if (session.data && session.data.loggedIn) { await loadAll(); return; }
        showView('login');
      } catch (e) {
        showView('gate');
        setGateMsg('无法连接后端: ' + (e.message || '网络错误'));
      }
    }

    function bindSession() {
      // 登出
      $('#logoutBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#logoutPop').classList.toggle('open'); });
      document.addEventListener('click', (e) => { if (!e.target.closest('.tb-logout')) $('#logoutPop').classList.remove('open'); });
      $('#logoutCancel').addEventListener('click', () => $('#logoutPop').classList.remove('open'));
      $('#logoutConfirm').addEventListener('click', async () => {
        const clearCache = $('#logoutClearCache').checked ? 1 : 0;
        const clearSettings = $('#logoutClearSettings').checked ? 1 : 0;
        try { await api('POST', '/api/logout', { clearCache, clearSettings }); } finally { location.reload(); }
      });
      // 门禁 / 登录
      $('#connectBtn').addEventListener('click', gateConnect);
      $('#loginBtn').addEventListener('click', async () => {
        const username = $('#loginUser').value.trim();
        const password = $('#loginPass').value;
        const btn = $('#loginBtn');
        if (!username || !password) { $('#loginMsg').textContent = '请输入用户名和密码'; return; }
        btn.disabled = true;
        $('#loginMsg').textContent = '登录中...';
        state.loginWaiting = true;
        // 与旧前端一致: 提交时只置 loginWaiting, 等待页由后端「验证通过」事件淡入;
        // 需要 2FA 时后端不会发 verified, 因此不会闪等待页, 直接切 2FA 卡片。
        try {
          const r = await api('POST', '/api/login', { username, password, rememberMe: true });
          if (r.data.requiresTwoFactorAuth) {
            state.loginWaiting = false;
            state.tempSessionId = r.data.tempSessionId;
            state.twofaKind = r.data.requiresTwoFactorAuth[0] || 'emailOtp';
            $('#loginMsg').textContent = '';
            $('#twofaMsg').textContent = '请输入' + (state.twofaKind === 'emailOtp' ? '邮箱' : state.twofaKind === 'totp' ? 'TOTP' : '备用') + '验证码';
            switchLoginForm('twofa');
            return;
          }
          state.loginWaiting = false;
          if (r.data.ok) completeLoginAndEnterMain();
          else { bootHide(); $('#loginMsg').textContent = r.data.error || '登录失败'; btn.disabled = false; }
        } catch (e) {
          state.loginWaiting = false;
          bootHide();
          $('#loginMsg').textContent = e.message || '登录失败';
          btn.disabled = false;
        }
      });
      $('#twofaBtn').addEventListener('click', async () => {
        const code = $('#twofaCode').value.trim();
        if (!code) { $('#twofaMsg').textContent = '请输入验证码'; return; }
        const btn = $('#twofaBtn');
        btn.disabled = true;
        $('#twofaMsg').textContent = '验证中...';
        // 和密码提交一样: 置 loginWaiting, 等待页只由后端 verified 事件淡入;
        // 这样同一时刻到达的 status(loggedIn=true) 不会提前触发 loadAll 把主界面闪出来。
        state.loginWaiting = true;
        try {
          const r = await api('POST', '/api/login/2fa', { tempSessionId: state.tempSessionId, code, kind: state.twofaKind });
          if (r.data.ok) completeLoginAndEnterMain();
          else {
            state.loginWaiting = false;
            bootHide(); // 若 SSE verified 已经把加载页拉出来, 失败时收起
            btn.disabled = false;
            $('#twofaMsg').textContent = r.data.error || '验证失败';
          }
        } catch (e) {
          state.loginWaiting = false;
          bootHide();
          btn.disabled = false;
          $('#twofaMsg').textContent = e.message || '验证失败';
        }
      });
      $('#twofaCancel').addEventListener('click', () => {
        state.tempSessionId = null;
        state.loginWaiting = false;
        $('#twofaCode').value = '';
        $('#twofaMsg').textContent = '';
        // 登录按钮在发起登录请求时被禁用, 进入 2FA 后一直没恢复; 取消时必须重新启用
        const loginBtn = $('#loginBtn');
        if (loginBtn) loginBtn.disabled = false;
        switchLoginForm('login');
      });
      // 自动重登 / 会话挂起时的 2FA 弹窗(SSE 2fa-needed 触发)
      $('#relogin2faConfirm').addEventListener('click', async () => {
        const code = $('#reloginCode').value.trim();
        if (!/^(\d{6}|\d{4}[- ]\d{4})$/.test(code)) {
          $('#relogin2faMsg').textContent = '请输入 6 位或 4-4 位验证码';
          return;
        }
        const btn = $('#relogin2faConfirm');
        btn.disabled = true;
        $('#relogin2faMsg').textContent = '验证中...';
        try {
          const r = await api('POST', '/api/relogin/2fa', { code });
          if (r.data.ok) {
            $('#relogin2faMsg').textContent = '验证成功, 正在刷新...';
            setTimeout(() => location.reload(), 400);
          } else {
            btn.disabled = false;
            $('#relogin2faMsg').textContent = r.data.error || '验证失败, 请重试';
          }
        } catch (e) {
          btn.disabled = false;
          $('#relogin2faMsg').textContent = e.message || '验证失败, 请重试';
        }
      });
      $('#relogin2faCancel').addEventListener('click', closeReloginModal);
      // 断线弹窗: 改地址/令牌后重连
      $('#connSave').addEventListener('click', () => {
        localStorage.setItem(LS_BASE, composeBase($('#connScheme').value, $('#connHost').value, $('#connPort').value));
        localStorage.setItem(LS_TOKEN, $('#connToken').value.trim());
        location.reload();
      });
      $('#connCancel').addEventListener('click', hideConnModal);
    }

    function isBootActive() { return bootState.active; }

    return { bindSession, showView, setGateMsg, loadAll, openReloginModal, bootProgress, isBootActive, bootApp, startConnWatch };
  }
};
