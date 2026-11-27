'use strict';
// Dashboard overview controller. Dependencies are explicit; local UI state stays private.
window.VrcDashboardOverview = {
  create(context) {
    const { state, $, escapeHtml, FR, avatarUrl, api } = context;
    // ---------- 顶部状态条 / 自己 ----------
    function countsOf(friends) {
      const c = { online: 0, active: 0, offline: 0 };
      for (const f of friends) {
        const s = f.display_state || f.state;
        if (s === 'online') c.online++;
        else if (s === 'active') c.active++;
        else if (s === 'offline') c.offline++;
      }
      return c;
    }
    function setDot(el, ok) {
      el.className = 'ss-dot' + (ok ? ' ok' : '');
    }
    function renderTop() {
      const counts = countsOf(state.friends);
      $('#stFriends').textContent = state.friends.length;
      $('#stOnline').textContent = counts.online;
      $('#stWeb').textContent = counts.active;
      $('#stOffline').textContent = counts.offline;
      const qq = state.status.qq;
      const qqConfigured = !!(qq && qq.configured);
      const qqConnected = !!(qqConfigured && qq.connected);
      const qqBound = !!(qq && qq.bound);
      $('#stQq').textContent = !qqConfigured ? '未配置' : (qqConnected ? (qqBound ? '已连接' : '未绑定') : '未连接');
      const qqDot = $('#stQqDot');
      if (qqDot) qqDot.className = 'ss-dot' + (qqConnected ? (qqBound ? ' ok' : ' warn') : '');
      const qqItem = $('#stQqItem');
      if (qqItem) {
        qqItem.classList.toggle('qq-warn', qqConnected && !qqBound);
        let qqTip = '';
        if (!qqConfigured) qqTip = 'QQ 机器人未配置: 在设置 → QQ 机器人填写 AppID / AppSecret 并启用';
        else if (!qqConnected) qqTip = 'QQ 机器人已配置但未连接' + (qq.lastError ? ': ' + qq.lastError : '');
        else if (!qqBound) qqTip = 'QQ 机器人已连接, 但还没有绑定 QQ 用户: 在 QQ 里给机器人发一条任意消息即可完成绑定';
        else qqTip = 'QQ 机器人已连接' + (qq.bound && qq.bound.nickname ? ', 已绑定: ' + qq.bound.nickname : '');
        if (qqItem.title !== qqTip) qqItem.title = qqTip;
      }
      const wsOn = !!state.status.wsConnected;
      $('#stWs').textContent = state.status.loggedIn ? (wsOn ? '已连接' : '重连中') : '-';
      setDot($('#stWsDot'), wsOn);
      // VRCX 同款: 最近 60 秒窗口内消息数之和 = 次/分
      $('#stWsRate').textContent = '平均 ' + window.VrcWsChart.perMinute(state.wsHistory) + ' 次/分';
      const t = state.status.lastSnapshotAt;
      $('#syncAt').textContent = t ? '最近同步 ' + new Date(t).toLocaleTimeString() : '';
      const enc = state.config && (state.config.encryptionEnabled === false || state.config.encryptionMode === 'none');
      $('#warnBadge').classList.toggle('hidden', !enc);
    }
    function renderSelf() {
      const u = state.status.user;
      if (!u) {
        $('#selfName').textContent = '-';
        $('#selfState').textContent = '未登录';
        $('#selfAvatar').removeAttribute('src');
        return;
      }
      $('#selfName').innerHTML = window.VrcLinks
        ? window.VrcLinks.linkHtml('user', u.vrchat_user_id || u.id, u.display_name || u.username || '-')
        : escapeHtml(u.display_name || u.username || '-');
      $('#selfState').textContent = FR.selfStateText(u);
      $('#selfAvatarWrap').className = 'avatar-wrap ' + FR.selfDotClasses(u);
      $('#selfName').title = [u.display_name, $('#selfState').textContent].filter(Boolean).join(' · ');
      if (u.avatarKey) $('#selfAvatar').src = avatarUrl(u.avatarKey);
    }
    // WebSocket 速率折线(VRCX 同款): 60 个采样点, 只描线, 按窗口最大值缩放
    const WS_SPARK_W = 96;
    const WS_SPARK_H = 16;
    function drawWsSpark() {
      const cv = $('#wsSpark');
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(WS_SPARK_W * dpr);
      const pxH = Math.round(WS_SPARK_H * dpr);
      if (cv.width !== pxW || cv.height !== pxH) { cv.width = pxW; cv.height = pxH; }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WS_SPARK_W, WS_SPARK_H);
      const points = window.VrcWsChart.sparklinePoints(state.wsHistory, WS_SPARK_W, WS_SPARK_H);
      if (!points.length) return;
      // 自定义属性里可能是 light-dark(...), 直接读 getPropertyValue 得到的是未解析 token;
      // 用一个 hidden 探针拿它的 computed color(--accent), 才能拿到当前主题的真实颜色。
      const probe = $('#wsProbe');
      let accent = probe ? getComputedStyle(probe).color : '';
      if (!accent || accent === 'rgba(0, 0, 0, 0)') {
        accent = document.documentElement.getAttribute('data-theme') === 'light' ? '#3b6fe0' : '#8b5cf6';
      }
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    async function loadWsHistory() {
      try {
        const r = await api('GET', '/api/ws-stats');
        const series = (r.data && r.data.series) || [];
        if (series.length) state.wsHistory = series.slice(-60);
        while (state.wsHistory.length < 60) state.wsHistory.unshift(0);
        // 服务端 series 最后一格是「上一秒」, 用它与后续 ws-stats 的 sec 对齐去重
        state.wsSec = Math.floor(Date.now() / 1000) - 1;
        drawWsSpark();
        renderTop();
      } catch (e) { drawWsSpark(); }
    }

    // API 健康探测只显示延迟, 不覆盖官方状态的颜色和故障详情。
    function applyHealthUi(hd) {
      state.lastHealth = hd || null;
      const lat = hd ? hd.latencyMs : null;
      const latText = typeof lat === 'number' ? lat + ' ms' : '';
      // 主页顶栏和登录页右上角的状态条共用同一套字段(st/lg 前缀)
      for (const prefix of ['st', 'lg']) {
        const meta = document.getElementById(prefix + 'Latency');
        if (meta) {
          meta.textContent = latText;
          meta.title = hd && hd.status === 'ok' ? 'VRChat API 延迟' : 'VRChat API 探测失败';
        }
      }
    }
    let statusDetailTimer = null;
    function applyVrcStatus(vd) {
      const hadIssue = state.vrcAbnormal;
      state.vrcStatus = vd || null;
      state.vrcAbnormal = !!(vd && vd.state && vd.state !== 'normal');
      const isMajor = !!(vd && vd.indicator === 'major');
      const text = state.vrcAbnormal
        ? [vd.description, vd.summary].filter(Boolean).join(': ')
        : 'VRChat 服务目前一切正常';
      for (const prefix of ['st', 'lg']) {
        const dot = document.getElementById(prefix + 'HealthDot');
        if (dot) dot.className = 'ss-dot' + (state.vrcAbnormal ? (isMajor ? ' bad' : ' warn') : (vd && vd.state === 'normal' ? ' ok' : ''));
        const link = document.getElementById(prefix + 'ServerStatus');
        if (link) {
          link.title = text;
          link.setAttribute('aria-label', '服务器: ' + text);
          if (state.vrcAbnormal) link.setAttribute('aria-describedby', prefix + 'VrcDetail');
          else link.removeAttribute('aria-describedby');
        }
        const detail = document.getElementById(prefix + 'VrcDetail');
        if (detail) detail.classList.toggle('hidden', !state.vrcAbnormal);
        const description = document.getElementById(prefix + 'VrcText');
        if (description) description.textContent = state.vrcAbnormal ? text : '';
        if (!state.vrcAbnormal) document.getElementById(prefix + 'ServerWrap')?.classList.remove('auto-open');
      }
      const loginAlert = $('#loginVrcAlert');
      if (loginAlert) {
        loginAlert.classList.toggle('hidden', !state.vrcAbnormal);
        loginAlert.classList.toggle('bad', isMajor);
        $('#loginVrcText').textContent = state.vrcAbnormal ? text : '';
      }
      if (!state.vrcAbnormal) clearTimeout(statusDetailTimer);
      else if (!hadIssue) {
        for (const prefix of ['st', 'lg']) document.getElementById(prefix + 'ServerWrap')?.classList.add('auto-open');
        clearTimeout(statusDetailTimer);
        statusDetailTimer = setTimeout(() => {
          for (const prefix of ['st', 'lg']) document.getElementById(prefix + 'ServerWrap')?.classList.remove('auto-open');
        }, 5000);
      }
    }
    async function loadHealth({ focus = false } = {}) {
      try {
        const previousHealth = state.lastHealth;
        const [h, v] = await Promise.all([api('GET', '/api/health'), api('GET', '/api/vrc-status' + (focus ? '?focus=1' : ''))]);
        // 等待 HTTP 期间收到的 SSE 更新优先, 避免旧响应覆盖已切换的延迟。
        if (state.lastHealth === previousHealth) applyHealthUi(h.data || {});
        applyVrcStatus(v.data || {});
      } catch (e) { /* 顶栏保持 - */ }
    }

    window.addEventListener('focus', () => {
      if (state.view === 'main' || state.view === 'login') loadHealth({ focus: true });
    });

    for (const prefix of ['st', 'lg']) {
      const wrap = document.getElementById(prefix + 'ServerWrap');
      if (!wrap) continue;
      wrap.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          wrap.classList.add('detail-dismissed');
          wrap.classList.remove('auto-open');
        }
      });
      wrap.addEventListener('mouseleave', () => wrap.classList.remove('detail-dismissed'));
      wrap.addEventListener('focusout', (event) => {
        if (!wrap.contains(event.relatedTarget)) wrap.classList.remove('detail-dismissed');
      });
    }


    return { renderTop, renderSelf, drawWsSpark, applyHealthUi, applyVrcStatus, loadHealth, loadWsHistory };
  }
};
