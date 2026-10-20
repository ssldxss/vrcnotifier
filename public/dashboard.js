'use strict';
// 新版概览页(单页): 顶部一行状态 + 好友动态(虚拟列表/就地展开) + 右侧自己/好友列表 + 设置页。
// 纯逻辑在 instance/eventmodel/bellstate/friendrow/feedstore/friendmodel/vlist 里(有单测), 这里只做 DOM 装配。
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const LS_BASE = 'vrcn_base';
  const LS_TOKEN = 'vrcn_token';
  const LS_THEME = 'vrcn_theme';
  const FEED_PAGE = 100;

  const EM = window.VrcEventModel;
  const FM = window.VrcFriendModel;
  const FR = window.VrcFriendRow;

  const state = {
    friends: [],
    events: [],
    total: 0,
    hasMore: false,
    filters: [],
    favoriteOnly: false,
    friendId: null,
    friendName: '',
    friendsQuery: '',
    friendVlistAt: Number(localStorage.getItem('vrcn_friendVlistAt')) || 120,
    friendHeights: new Map(),
    friendRange: null,
    friendOffsets: null,
    friendItems: [],
    search: '',
    expanded: null,
    loadingOlder: false,
    feedReqId: 0,
    newCount: 0,
    unseenFrom: 0,
    wsHistory: window.VrcWsChart.emptyHistory(60),
    config: {},
    status: {},
    settingsOpen: false,
    settingsLoaded: false
  };

  // ---------- 基础 ----------
  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function baseUrl() {
    const saved = localStorage.getItem(LS_BASE);
    return (saved || (location.protocol.startsWith('http') ? location.origin : 'http://127.0.0.1:3000')).replace(/\/+$/, '');
  }
  function accessToken() {
    return localStorage.getItem(LS_TOKEN) || '';
  }
  function avatarUrl(key) {
    return baseUrl() + '/api/avatar/' + encodeURIComponent(key) + '?token=' + encodeURIComponent(accessToken());
  }
  async function api(method, path, body, opts) {
    const o = opts || {};
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!o.noAuth && accessToken()) headers.Authorization = 'Bearer ' + accessToken();
    let res;
    try {
      res = await fetch(baseUrl() + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store'
      });
    } catch (e) {
      throw new Error('无法连接后端');
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('后端响应不是 JSON');
    }
    if (res.status === 401 && !o.noAuth) {
      const msg = String((data && data.error) || '');
      if (msg.includes('未登录')) showView('login');
      else { showView('gate'); setGateMsg('访问令牌无效, 请重新填写'); }
      throw new Error(msg || '访问被拒绝');
    }
    return { status: res.status, data };
  }
  let toastTimer = null;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  // ---------- 主题 ----------
  function nextTheme(cur) {
    const c = cur || 'dark';
    return c === 'dark' ? 'auto' : (c === 'auto' ? 'light' : 'dark');
  }
  function applyTheme(mode) {
    const attr = mode === 'auto' ? null : mode;
    if (attr) document.documentElement.setAttribute('data-theme', attr);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(LS_THEME, mode);
    $('#themeBtn').title = { auto: '主题: 自动', dark: '主题: 深色', light: '主题: 浅色' }[mode];
  }

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
  function setBadge(el, ok, okText, badText) {
    el.textContent = ok ? okText : badText;
    el.className = 'badge ' + (ok ? 'ok' : 'warn');
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
    const qqOn = !!(qq && qq.configured && qq.connected);
    $('#stQq').textContent = qq && qq.configured ? (qq.connected ? '已连接' : '未连接') : '未配置';
    setDot($('#stQqDot'), !!(qq && qq.configured && qq.connected));
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
    $('#selfName').textContent = u.display_name || u.username || '-';
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
      drawWsSpark();
      renderTop();
    } catch (e) { drawWsSpark(); }
  }

  async function loadHealth() {
    try {
      const [h, v] = await Promise.all([api('GET', '/api/health'), api('GET', '/api/vrc-status')]);
      const hd = h.data || {};
      const ok = hd.status === 'ok';
      setDot($('#stHealthDot'), ok);
      $('#stHealth').textContent = ok ? '正常' : '异常';
      $('#stLatency').textContent = typeof hd.latencyMs === 'number' ? hd.latencyMs + ' ms' : '';
      const vd = v.data || {};
      if (vd.state && vd.state !== 'normal') {
        $('#stHealth').textContent = 'VRC 异常';
        setDot($('#stHealthDot'), false);
      }
    } catch (e) { /* 顶栏保持 - */ }
  }

  // ---------- 好友列表 ----------
  const TRUST_GROUPS = [
    ['fav', '⭐ 特别关注', false],
    ['online', '在线', false],
    ['active', '网页在线', false],
    ['offline', '离线', true]
  ];
  const collapsed = { offline: true };

  function groupTitleHtml(key, title, count, isCollapsed) {
    return (
      '<div class="group-title' + (isCollapsed ? ' collapsed' : '') + '" data-group="' + key + '">' +
      '<button class="group-toggle" title="' + (isCollapsed ? '展开' : '收起') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>' +
      '</button><span>' + title + '</span><span class="gcount' + (key === 'fav' ? ' fav' : '') + '">' + count + '</span></div>'
    );
  }
  function placeHtml(place) {
    if (!place) return '';
    if (place.kind === 'text') return '<span class="w">' + escapeHtml(place.text) + '</span>';
    const parts = [];
    if (place.flagClass) parts.push('<i class="flags ' + place.flagClass + '"></i>');
    if (place.worldName) parts.push('<span class="w">' + escapeHtml(place.worldName) + '</span>');
    if (place.accessLabel) parts.push('<span class="sep">·</span><span class="inst">' + escapeHtml(place.accessLabel) + '</span>');
    return parts.join('');
  }
  const STAR_ON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M12 3.5l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 17.3l-5.38 2.8 1.03-6L3.3 9.9l6-.9L12 3.5z"></path></svg>';
  const STAR_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 17.3l-5.38 2.8 1.03-6L3.3 9.9l6-.9L12 3.5z"></path></svg>';
  const BELL_HOLLOW = '<svg class="bh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"></path><path d="M13.7 20a2 2 0 0 1-3.4 0"></path></svg>';
  const BELL_SOLID = '<svg class="bs" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a6 6 0 0 0-6 6c0 5.2-2.1 6.7-2.8 7.2-.4.3-.2 1 .4 1h16.8c.6 0 .8-.7.4-1C20.1 14.7 18 13.2 18 8a6 6 0 0 0-6-6z"></path><path d="M9.8 19.6a2.4 2.4 0 0 0 4.4 0z"></path></svg>';
  const BELL_LABELS = [
    ['notify_online', '上线'],
    ['notify_web_online', '网页上线'],
    ['notify_offline', '下线'],
    ['notify_status_change', '状态变化'],
    ['notify_world_change', '世界变化']
  ];

  function friendRowHtml(f) {
    const m = FR.rowModel(f);
    const av = f.avatarKey
      ? '<img class="avatar" src="' + avatarUrl(f.avatarKey) + '" loading="lazy" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="avatar-fallback">' + escapeHtml((m.name || '?').charAt(0).toUpperCase()) + '</div>'
      : '<div class="avatar-fallback" style="display:flex">' + escapeHtml((m.name || '?').charAt(0).toUpperCase()) + '</div>';
    const bellCls = m.bell === 'bad' ? ' bad' : (m.bell === 'warn-solid' ? ' warn-solid' : (m.bell === 'warn' ? ' warn' : ''));
    return (
      '<div class="friend" data-id="' + escapeHtml(f.friend_vrchat_id) + '">' +
      '<span class="avatar-wrap ' + m.dotClasses + '">' + av + '</span>' +
      '<div class="fmeta"><div class="frow1">' +
      '<span class="name ' + m.nameClass + '">' + escapeHtml(m.name) + '</span>' +
      (m.statusText ? '<span class="cstatus">' + escapeHtml(m.statusText) + '</span>' : '') +
      '</div><div class="floc">' + placeHtml(m.place) + '</div></div>' +
      '<span class="fx">' +
      '<button class="fav-star' + (m.favorite ? ' on' : '') + '" data-act="fav" title="' + (m.favorite ? '取消关心' : '关心(特别关注)') + '">' + (m.favorite ? STAR_ON : STAR_OFF) + '</button>' +
      '<button class="push-bell' + bellCls + '" data-act="bell" title="推送设置">' + BELL_HOLLOW + BELL_SOLID + '</button>' +
      '</span></div>'
    );
  }

  // 好友超过阈值时切换虚拟滚动(复用 vlist): 扁平项 = 分组标题 + 好友行
  const FRIEND_ROW_EST = 48;
  const FRIEND_GROUP_EST = 32;
  function friendItemHeight(item) {
    const key = item.type === 'group' ? 'g:' + item.key : 'f:' + item.friend.friend_vrchat_id;
    return state.friendHeights.get(key) || (item.type === 'group' ? FRIEND_GROUP_EST : FRIEND_ROW_EST);
  }
  function friendOffsets() {
    if (!state.friendOffsets) {
      state.friendOffsets = window.VrcVList.buildOffsets(state.friendItems.map(friendItemHeight));
    }
    return state.friendOffsets;
  }
  function friendItemHtml(item) {
    if (item.type === 'group') {
      return groupTitleHtml(item.key, item.title, item.count, item.collapsed);
    }
    return friendRowHtml(item.friend);
  }
  function renderFriendsVirtual() {
    const list = $('#friendsList');
    list.classList.add('virtual');
    const offsets = friendOffsets();
    const viewportH = list.clientHeight || 420;
    const overscan = Math.max(240, Math.round(viewportH * 0.6));
    const inView = window.VrcVList.visibleRange({ offsets, groupTop: 0, scrollTop: list.scrollTop, viewportH, overscan }) || { from: 0, to: -1 };
    const win = window.VrcVList.renderRange({ inView, count: state.friendItems.length, buffer: 6 });
    if (!win) { list.innerHTML = ''; state.friendRange = null; return; }
    const sp = window.VrcVList.spacersFor({ offsets, from: win.from, to: win.to });
    if (state.friendRange && window.VrcVList.sameRange(state.friendRange, win)) {
      const gaps = list.querySelectorAll(':scope > .vlist-gap');
      if (gaps.length === 2) {
        gaps[0].style.height = sp.before + 'px';
        gaps[1].style.height = sp.after + 'px';
      }
      return;
    }
    list.innerHTML = '<div class="vlist-gap" style="height:' + sp.before + 'px"></div>' +
      state.friendItems.slice(win.from, win.to + 1).map(friendItemHtml).join('') +
      '<div class="vlist-gap" style="height:' + sp.after + 'px"></div>';
    state.friendRange = win;
    requestAnimationFrame(() => {
      let changed = false;
      for (const el of list.querySelectorAll(':scope > .group-title, :scope > .friend')) {
        const isGroup = el.classList.contains('group-title');
        const key = isGroup ? 'g:' + el.getAttribute('data-group') : 'f:' + el.getAttribute('data-id');
        const h = Math.round(el.getBoundingClientRect().height * 100) / 100;
        const prev = state.friendHeights.get(key);
        if (prev == null || Math.abs(prev - h) > 0.6) {
          state.friendHeights.set(key, h);
          changed = true;
        }
      }
      if (!changed) return;
      state.friendOffsets = null;
      renderFriendsVirtual();
    });
  }

  function renderFriends() {
    const groups = FM.splitGroups(state.friends, state.friendsQuery || '');
    $('#friendsCount').textContent = state.friends.length;
    if (state.friends.length > state.friendVlistAt) {
      state.friendItems = window.VrcFriendLayout.layout(groups, collapsed);
      state.friendOffsets = null;
      state.friendRange = null;
      renderFriendsVirtual();
      return;
    }
    $('#friendsList').classList.remove('virtual');
    let html = '';
    for (const [key, title, defaultCollapsed] of TRUST_GROUPS) {
      const list = groups[key] || [];
      if (!list.length) continue;
      const isCollapsed = collapsed[key] !== undefined ? collapsed[key] : defaultCollapsed;
      html += groupTitleHtml(key, title, list.length, isCollapsed);
      html += '<div class="group-body' + (isCollapsed ? ' collapsed' : '') + '"><div class="group-inner">';
      html += list.map((f, i) => {
        const row = friendRowHtml(f);
        // 入场错峰: 复用 app.css 的 .friend.enter 动画
        return row.replace('class="friend"', 'class="friend enter" style="--i:' + i + '"');
      }).join('');
      html += '</div></div>';
    }
    $('#friendsList').innerHTML = html || '<p class="muted" style="padding:10px">没有好友</p>';
  }

  function findFriend(id) {
    return state.friends.find((f) => f.friend_vrchat_id === id);
  }
  function findFriendByName(name) {
    return state.friends.find((f) => (f.display_name || '') === name);
  }

  async function toggleFavorite(id) {
    const f = findFriend(id);
    if (!f) return;
    const want = f.config && f.config.favorite === 1 ? 0 : 1;
    try {
      const r = await api('PUT', '/api/friends/' + encodeURIComponent(id) + '/config', { favorite: want });
      if (r.data && r.data.ok) {
        f.config = r.data.config || Object.assign({}, f.config, { favorite: want });
        renderFriends();
      } else toast((r.data && r.data.error) || '保存失败');
    } catch (e) { toast(e.message || '保存失败'); }
  }

  function bellPopoverHtml(f) {
    const cfg = f.config || {};
    const on = (k) => cfg[k] === 1;
    return (
      '<div class="push-pop"><div class="pp-head"><span class="pp-title">推送设置</span><span class="pp-who">' + escapeHtml(f.display_name) + '</span></div>' +
      BELL_LABELS.map(([key, label]) =>
        '<div class="pp-row"><span>' + label + '</span><label class="switch"><input type="checkbox" data-k="' + key + '"' + (on(key) ? ' checked' : '') + '><span class="slider"></span></label></div>'
      ).join('') +
      '<div class="pp-foot"><button class="link-btn" data-act="settings">全部通知设置</button></div></div>'
    );
  }

  function openBellPopover(row, f) {
    closeBellPopover();
    row.insertAdjacentHTML('beforeend', bellPopoverHtml(f));
    const pop = row.querySelector('.push-pop');
    pop.addEventListener('click', (ev) => ev.stopPropagation());
    pop.addEventListener('change', async (ev) => {
      const input = ev.target;
      const key = input && input.getAttribute && input.getAttribute('data-k');
      if (!key) return;
      try {
        const r = await api('PUT', '/api/friends/' + encodeURIComponent(f.friend_vrchat_id) + '/config', { [key]: input.checked ? 1 : 0 });
        if (r.data && r.data.ok) {
          f.config = r.data.config || Object.assign({}, f.config, { [key]: input.checked ? 1 : 0 });
          row.querySelector('.push-bell').className = 'push-bell' + ({ off: '', warn: ' warn', 'warn-solid': ' warn-solid', bad: ' bad' }[window.VrcBellState.bellState(f.config)]);
          renderTop();
        } else {
          input.checked = !input.checked;
          toast((r.data && r.data.error) || '保存失败');
        }
      } catch (e) {
        input.checked = !input.checked;
        toast(e.message || '保存失败');
      }
    });
  }
  function closeBellPopover() {
    $$('.push-pop').forEach((el) => el.remove());
  }

  async function loadFriends() {
    const r = await api('GET', '/api/friends');
    state.friends = (r.data && r.data.friends) || [];
    renderFriends();
    renderTop();
  }

  // ---------- 好友动态 ----------
  const FEED_KIND_CLASS = {
    friend_online: 't-online',
    friend_offline: 't-offline',
    friend_web_online: 't-web',
    friend_web_offline: 't-web',
    status_change: 't-status',
    status_description_change: 't-desc',
    location_change: 't-loc',
    group_announcement: 't-notif',
    boop: 't-notif',
    invite: 't-notif',
    request_invite: 't-notif'
  };
  // 统一「月/日 时:分」单行显示, 避免旧记录换行把行高撑大
  function timeText(at) {
    const d = new Date(at);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.toTimeString().slice(0, 5);
  }
  function locText(loc) {
    if (!loc) return '';
    const parts = [];
    if (loc.flagClass) parts.push('<i class="flags ' + loc.flagClass + '"></i>');
    if (loc.worldName) parts.push('<span>' + escapeHtml(loc.worldName) + '</span>');
    if (loc.accessLabel) parts.push('<span>· ' + escapeHtml(loc.accessLabel) + '</span>');
    return parts.join(' ');
  }
  function locHtml(loc) {
    if (!loc) return '<span class="w muted">-</span>';
    const parts = [];
    if (loc.flagClass) parts.push('<i class="flags ' + loc.flagClass + '"></i>');
    if (loc.worldName) parts.push('<span class="w">' + escapeHtml(loc.worldName) + '</span>');
    if (loc.accessLabel) parts.push('<span class="sep">·</span><span class="inst">' + escapeHtml(loc.accessLabel) + '</span>');
    return parts.join('') || '<span class="w muted">-</span>';
  }
  function dotsHtml(dots) {
    const arrow = '<span class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></span>';
    return '<span class="sdots"><i class="sd ' + dots.old + '"></i>' + arrow + '<i class="sd ' + dots.new + '"></i></span>';
  }
  function summaryHtml(e) {
    const s = EM.summaryOf(e);
    if ((s.kind === 'location' || s.kind === 'presence') && s.location) return locHtml(s.location);
    if (s.kind === 'presence') return '<span class="w">' + escapeHtml(s.text) + '</span>';
    if (s.kind === 'status') return dotsHtml(s.dots);
    if (s.kind === 'description') return s.text ? '<span class="w">“' + escapeHtml(s.text) + '”</span>' : '<span class="w muted">（空）</span>';
    if (s.kind === 'notification') return '<span class="w">' + escapeHtml(s.text) + '</span>';
    return '<span class="w muted">-</span>';
  }
  function changeHtml(e) {
    const c = EM.changeOf(e);
    const arrow = '<span class="chg-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></span>';
    const arrowDown = '<span class="chg-arrow down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"></path></svg></span>';
    // 位置变化: 旧位置一行、箭头、新位置一行(世界名/房间类型长时可换行看全)
    if (c.kind === 'location') {
      return '<div class="feed-change change-lines">' +
        '<div class="chg-line chg-old">' + locText(c.old) + '</div>' +
        '<div class="chg-line chg-new">' + arrowDown + locHtml(c.new) + '</div>' +
        '</div>';
    }
    if (c.kind === 'status') return '<div class="feed-change">' + dotsHtml(c.dots) + '</div>';
    if (c.kind === 'description') {
      return '<div class="feed-change change-lines">' +
        '<div class="chg-line chg-old">' + escapeHtml(c.old == null ? '（空）' : c.old) + '</div>' +
        '<div class="chg-line chg-new">' + arrowDown + escapeHtml(c.new == null ? '（空）' : c.new) + '</div>' +
        '</div>';
    }
    if (c.kind === 'presence') return '<div class="feed-change"><span class="chg-old">' + escapeHtml(c.old.label) + '</span>' + arrow + '<span class="chg-new">' + escapeHtml(c.new.label) + '</span></div>';
    if (c.kind === 'notification') {
      // 群组公告等长文本: 标题 + 正文完整换行显示, 不再压成一行
      const title = escapeHtml(c.title || '');
      const body = c.body ? escapeHtml(c.body) : '';
      return '<div class="feed-change change-lines">' +
        (title ? '<div class="chg-line chg-new">' + title + '</div>' : '') +
        (body ? '<div class="chg-line chg-body">' + body + '</div>' : '') +
        '</div>';
    }
    return '';
  }
  function feedItemHtml(e) {
    const code = EM.typeCode(e);
    const label = EM.typeLabel(code);
    const labelCls = 'type-label ' + (FEED_KIND_CLASS[code] || 't-status');
    const open = state.expanded === e.id;
    return (
      '<div class="feed-item' + (open ? ' open' : '') + '" data-id="' + e.id + '">' +
      '<div class="feed-row">' +
      '<span class="fr-time">' + timeText(e.at) + '</span>' +
      '<span class="' + labelCls + '">' + escapeHtml(label) + '</span>' +
      '<span class="fr-name">' + escapeHtml(e.friend_name || '') + '</span>' +
      '<span class="fr-desc">' + summaryHtml(e) + '</span>' +
      '<svg class="fr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>' +
      '</div>' +
      (open ? '<div class="feed-detail">' + changeHtml(e) + '</div>' : '') +
      '</div>'
    );
  }
  // ---------- 动态流虚拟列表(复用 vlist 的纯计算) ----------
  const FEED_ROW_EST = 41;   // 行高估计(实测后修正)
  const FEED_OPEN_EST = 110; // 展开行估计
  state.feedHeights = new Map();
  state.feedRange = null;
  state.feedOffsets = null;
  let feedMeasureRaf = 0;

  function feedItemHeight(e) {
    return state.feedHeights.get(e.id) || (state.expanded === e.id ? FEED_OPEN_EST : FEED_ROW_EST);
  }
  function feedOffsets() {
    if (!state.feedOffsets) {
      state.feedOffsets = window.VrcVList.buildOffsets(state.events.map(feedItemHeight));
    }
    return state.feedOffsets;
  }
  function invalidateFeedOffsets() { state.feedOffsets = null; }

  function renderFeed() {
    const list = $('#feedList');
    $('#feedTotal').textContent = state.total ? '共 ' + state.total.toLocaleString() + ' 条' : '';
    updateFeedNew();
    if (!state.events.length) {
      list.innerHTML = '<p class="muted" style="padding:14px">暂无动态</p>';
      state.feedRange = null;
      return;
    }
    const offsets = feedOffsets();
    const viewportH = list.clientHeight || 520;
    const overscan = Math.max(320, Math.round(viewportH * 0.6));
    const inView = window.VrcVList.visibleRange({
      offsets, groupTop: 0, scrollTop: list.scrollTop, viewportH, overscan
    }) || { from: 0, to: -1 };
    const win = window.VrcVList.renderRange({ inView, count: state.events.length, buffer: 6 });
    if (!win) { list.innerHTML = ''; state.feedRange = null; return; }
    const sp = window.VrcVList.spacersFor({ offsets, from: win.from, to: win.to });
    // 区间没变: 只更新上下占位高度, 不动行 DOM(保住 hover/展开动画)
    if (state.feedRange && window.VrcVList.sameRange(state.feedRange, win)) {
      const gaps = list.querySelectorAll('.vlist-gap');
      if (gaps.length === 2) {
        gaps[0].style.height = sp.before + 'px';
        gaps[1].style.height = sp.after + 'px';
      }
      return;
    }
    list.innerHTML = '<div class="vlist-gap" style="height:' + sp.before + 'px"></div>' +
      state.events.slice(win.from, win.to + 1).map(feedItemHtml).join('') +
      '<div class="vlist-gap" style="height:' + sp.after + 'px"></div>';
    state.feedRange = win;
    measureFeedRows();
  }
  // 渲染后量真实行高(展开行/长公告会更高), 修正占位; 不重建窗口, 避免滚动时抖动
  function measureFeedRows() {
    if (feedMeasureRaf) return;
    feedMeasureRaf = requestAnimationFrame(() => {
      feedMeasureRaf = 0;
      const list = $('#feedList');
      if (!list) return;
      let changed = false;
      for (const el of list.querySelectorAll('.feed-item')) {
        const id = Number(el.getAttribute('data-id'));
        const h = Math.round(el.getBoundingClientRect().height * 100) / 100;
        const prev = state.feedHeights.get(id);
        if (prev == null || Math.abs(prev - h) > 0.6) {
          state.feedHeights.set(id, h);
          changed = true;
        }
      }
      if (!changed) return;
      invalidateFeedOffsets();
      const gaps = list.querySelectorAll('.vlist-gap');
      if (!gaps.length || !state.feedRange) return;
      const sp = window.VrcVList.spacersFor({ offsets: feedOffsets(), from: state.feedRange.from, to: state.feedRange.to });
      gaps[0].style.height = sp.before + 'px';
      gaps[1].style.height = sp.after + 'px';
    });
  }
  function updateFeedNew() {
    const btn = $('#feedNew');
    if (state.newCount > 0) {
      btn.textContent = '↑ ' + state.newCount + ' 条新动态';
      btn.classList.remove('hidden');
    } else btn.classList.add('hidden');
  }
  function feedQuery(older) {
    const params = new URLSearchParams({ limit: String(FEED_PAGE) });
    const types = EM.filterCodes(state.filters);
    if (types) params.set('types', types.join(','));
    if (state.favoriteOnly) params.set('favorite', '1');
    if (state.friendId) params.set('friendId', state.friendId);
    if (state.search) params.set('q', state.search);
    if (older && state.events.length) params.set('before', String(state.events[state.events.length - 1].id));
    return params.toString();
  }
  async function loadFeed(older) {
    // 只拦「加载更旧」的重复滚动请求; 筛选/搜索连续点击时以最后一次为准(请求序号防乱序)
    if (older && state.loadingOlder) return;
    if (older) state.loadingOlder = true;
    const reqId = ++state.feedReqId;
    try {
      const r = await api('GET', '/api/friend-events?' + feedQuery(older));
      if (reqId !== state.feedReqId) return; // 已有更新的筛选/搜索请求, 丢弃这次响应
      const d = r.data || {};
      if (older) {
        state.events = window.VrcFeedStore.mergeEvents(state.events, d.events || []).events;
      } else {
        state.events = d.events || [];
        state.total = d.total || state.events.length; // 翻旧页时后端 total 只是「更旧部分」的计数, 不能覆盖总数
      }
      state.hasMore = !!d.hasMore;
      invalidateFeedOffsets();
      renderFeed();
    } catch (e) {
      if (reqId === state.feedReqId && state.events.length === 0) {
        $('#feedList').innerHTML = '<p class="muted" style="padding:14px">加载失败: ' + escapeHtml(e.message) + '</p>';
      }
    } finally {
      if (older) state.loadingOlder = false;
    }
  }

  // ---------- 设置页 ----------
  function syncTrimFields() {
    $('#trimFields').classList.toggle('hidden', !$('#sAutoTrim').checked);
  }
  function syncQqFields() {
    const on = $('#sQqEnabled').checked;
    $('#qqFields').classList.toggle('hidden', !on);
    const disabledHint = $('#qqDisabledHint');
    if (disabledHint) disabledHint.classList.toggle('hidden', on);
  }
  let settingsMsgTimer = null;
  function flashSettings(text) {
    $('#settingsMsg').textContent = text;
    clearTimeout(settingsMsgTimer);
    settingsMsgTimer = setTimeout(() => { $('#settingsMsg').textContent = ''; }, 2000);
  }
  async function loadSettings() {
    const r = await api('GET', '/api/settings');
    const s = (r.data && r.data.settings) || {};
    $('#sQqEnabled').checked = !!s.qq_enabled;
    $('#sQqAppId').value = s.qq_app_id || '';
    $('#sQqAppSecret').value = '';
    $('#sQqAppSecret').placeholder = s.qq_app_secret ? '已配置(留空保持不变)' : '未配置';
    $('#sNotifyGroupAnnouncement').checked = s.notify_group_announcement !== 0;
    $('#sNotifyBoop').checked = s.notify_boop !== 0;
    $('#sNotifyInvite').checked = s.notify_invite !== 0;
    const trimLimit = Number(s.friend_event_limit) || 0;
    $('#sAutoTrim').checked = trimLimit > 0;
    $('#sFriendEventLimit').value = trimLimit > 0 ? trimLimit : '';
    syncTrimFields();
    syncQqFields();
    state.settingsLoaded = true;
  }
  // ---------- 后端日志(复用旧前端 logparse.js 的解析与 app.css 的 #log 样式) ----------
  const LOG_TAIL = 120;
  const LOG_MORE = 100;
  const LOG_MAX_ROWS = 3000;
  const logState = { oldestSeq: null, lastSeq: null, hasOlder: true, loading: false, ready: false };

  function logBox() { return $('#log'); }
  function logSelCsv(sel) {
    if (!sel || !sel.selectedValues) return '';
    return Array.from(sel.options).map((o) => o.value).filter((v) => sel.selectedValues.has(v)).join(',');
  }
  function logFilterQuery() {
    return '&level=' + encodeURIComponent(logSelCsv($('#logLevelSel'))) +
      '&cat=' + encodeURIComponent(logSelCsv($('#logCatSel')));
  }
  function logMatches(line) {
    const p = window.VrcLogParse.parseLogLine(line);
    if (!p) return true; // 解析不了的行始终显示(与旧前端一致)
    const levels = $('#logLevelSel').selectedValues;
    const cats = $('#logCatSel').selectedValues;
    if (levels && !levels.has(p.level)) return false;
    if (cats && !cats.has(p.cat)) return false;
    return true;
  }
  function renderLogRow(div, line) {
    div.className = 'log-row';
    const p = window.VrcLogParse.parseLogLine(line);
    if (!p) { div.textContent = line; div.dataset.raw = '1'; return; }
    delete div.dataset.raw;
    div.textContent = '';
    const tm = document.createElement('span');
    tm.className = 'log-time';
    tm.textContent = window.VrcLogParse.shortTime(p.time);
    tm.title = p.time;
    const lv = document.createElement('span');
    lv.className = 'log-lv lv-' + p.level;
    lv.textContent = p.level;
    const cat = document.createElement('span');
    cat.className = 'log-cat cat-' + window.VrcLogParse.catClass(p.cat);
    cat.textContent = p.cat;
    const body = document.createElement('span');
    body.className = 'log-body';
    body.textContent = p.body;
    div.append(tm, lv, cat, body);
  }
  function trimLogRows() {
    const box = logBox();
    while (box.children.length > LOG_MAX_ROWS) box.removeChild(box.lastChild);
  }
  function setLoadMore(show) {
    const box = logBox();
    let row = box.querySelector('.log-more');
    if (show) {
      if (!row) {
        row = document.createElement('div');
        row.className = 'log-more muted';
        row.textContent = '加载更早日志…';
        box.appendChild(row);
      }
    } else if (row) row.remove();
  }
  function addLogLine(line, seq, older) {
    const box = logBox();
    if (!box) return;
    if (seq != null && box.querySelector('div[data-seq="' + seq + '"]')) return; // 去重(SSE 与补拉竞态)
    const div = document.createElement('div');
    renderLogRow(div, line);
    if (seq != null) div.dataset.seq = seq;
    if (older) {
      const more = box.querySelector('.log-more');
      if (more) box.insertBefore(div, more);
      else box.appendChild(div);
      trimLogRows();
      if (seq != null && (logState.oldestSeq == null || seq < logState.oldestSeq)) logState.oldestSeq = seq;
    } else {
      const wasAtTop = box.scrollTop <= 2;
      const beforeH = box.scrollHeight;
      box.insertBefore(div, box.firstChild);
      trimLogRows();
      if (wasAtTop) box.scrollTop = 0;
      else box.scrollTop += box.scrollHeight - beforeH; // 阅读旧日志时视口不跳动
      if (seq != null && (logState.lastSeq == null || seq > logState.lastSeq)) logState.lastSeq = seq;
      if (logState.oldestSeq == null) logState.oldestSeq = seq;
    }
  }
  async function loadLogs(reset) {
    const box = logBox();
    if (!box || logState.loading) return;
    logState.loading = true;
    try {
      const q = reset === false && logState.oldestSeq != null
        ? 'before=' + logState.oldestSeq + '&limit=' + LOG_MORE
        : 'tail=' + LOG_TAIL;
      const r = await api('GET', '/api/logs?' + q + logFilterQuery());
      const logs = (r.data && r.data.logs) || [];
      if (reset !== false) {
        box.textContent = '';
        logState.lastSeq = null;
        logState.oldestSeq = null;
        logState.hasOlder = true;
        for (const entry of logs) addLogLine(entry.line, entry.seq, false);
        box.scrollTop = 0; // 最新日志在最上面
        if (!logs.length) box.innerHTML = '<div class="muted">暂无日志</div>';
      } else {
        for (let i = logs.length - 1; i >= 0; i--) addLogLine(logs[i].line, logs[i].seq, true);
        logState.hasOlder = logs.length >= LOG_MORE;
        if (!logState.hasOlder) setLoadMore(false);
      }
      logState.ready = true;
    } catch (e) { /* 保留已显示的日志 */ }
    logState.loading = false;
  }
  function initLogPanel() {
    if (logState.inited) { loadLogs(true); return; }
    logState.inited = true;
    window.VrcDropdown.makeDropdown($('#logLevelSel'), { multi: true, label: '等级' });
    window.VrcDropdown.makeDropdown($('#logCatSel'), { multi: true, label: '分类' });
    // 恢复旧前端保存的筛选(localStorage 同一个 key)
    try {
      const saved = JSON.parse(localStorage.getItem('vrcnotifier.logFilter') || 'null');
      if (saved && typeof saved === 'object') {
        for (const [el, key] of [[$('#logLevelSel'), 'level'], [$('#logCatSel'), 'cat']]) {
          if (!el || !el.selectedValues || !Array.isArray(saved[key])) continue;
          const valid = saved[key].filter((v) => Array.from(el.options).some((o) => o.value === v));
          el.selectedValues.clear();
          for (const v of valid) el.selectedValues.add(v);
          if (el.syncDd) el.syncDd();
        }
      }
    } catch (e) { /* 缓存不可用, 用默认全选 */ }
    const saveFilter = () => {
      try {
        localStorage.setItem('vrcnotifier.logFilter', JSON.stringify({
          level: Array.from($('#logLevelSel').selectedValues || []),
          cat: Array.from($('#logCatSel').selectedValues || [])
        }));
      } catch (e) { /* ignore */ }
    };
    for (const id of ['#logLevelSel', '#logCatSel']) {
      $(id).addEventListener('change', () => { saveFilter(); loadLogs(true); });
    }
    $('#log').addEventListener('scroll', () => {
      const b = $('#log');
      if (!logState.hasOlder || logState.loading) return;
      if (logState.oldestSeq != null && b.scrollHeight - b.scrollTop - b.clientHeight < 60) {
        setLoadMore(true);
        loadLogs(false).then(() => { if (!logState.loading) setLoadMore(false); });
      }
    });
    loadLogs(true);
  }
  function openSettings() {
    state.settingsOpen = true;
    const el = $('#settingsView');
    el.classList.remove('hidden', 'closing');
    closeBellPopover();
    if (!state.settingsLoaded) loadSettings();
    initLogPanel();
  }
  function closeSettings() {
    const el = $('#settingsView');
    if (!state.settingsOpen) return;
    state.settingsOpen = false;
    el.classList.add('closing');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('closing'); }, 170);
  }

  // ---------- 门禁 / 启动 ----------
  // ---------- 视图 / 门禁 / 登录 ----------
  function showView(name) {
    state.view = name;
    $('#gateView').classList.toggle('hidden', name !== 'gate');
    $('#loginView').classList.toggle('hidden', name !== 'login');
    $('#mainView').classList.toggle('hidden', name !== 'main');
    if (name === 'gate') fillGateForm();
    if (name === 'login' || name === 'main') loadHealth();
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
  function switchLoginForm(name) {
    const forms = { login: $('#loginForm'), twofa: $('#twofaForm') };
    const to = forms[name];
    if (!to) return;
    const from = Object.keys(forms).map((k) => forms[k])
      .find((el) => el && el !== to && !el.classList.contains('hidden'));
    const show = () => {
      to.classList.remove('hidden');
      to.classList.remove('form-in');
      void to.offsetWidth;
      to.classList.add('form-in');
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
    connectEvents();
  }
  let evt = null;
  function connectEvents() {
    const want = baseUrl() + '/api/events?token=' + encodeURIComponent(accessToken());
    if (evt && evt.url === want) return;
    if (evt) evt.close();
    evt = new EventSource(want);
    evt.addEventListener('status', (e) => {
      try {
        state.status = JSON.parse(e.data);
        renderTop();
        renderSelf();
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('friend-event', (e) => {
      try {
        const item = JSON.parse(e.data);
        const merged = window.VrcFeedStore.mergeEvents(state.events, [item]);
        if (merged.added) {
          state.events = merged.events;
          state.total++;
          invalidateFeedOffsets();
          const atTop = $('#feedList').scrollTop < 6;
          if (atTop) renderFeed();
          else { state.newCount += merged.added; updateFeedNew(); }
        }
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('snapshot', () => { loadFriends(); });
    evt.addEventListener('world-name', (e) => {
      try {
        const d = JSON.parse(e.data);
        let changed = false;
        for (const f of state.friends) if (f.world_id === d.worldId && f.world_name !== d.worldName) { f.world_name = d.worldName; changed = true; }
        if (changed) renderFriends();
        let feedChanged = false;
        for (const ev of state.events) {
          if (ev.world_id === d.worldId && ev.world_name !== d.worldName) { ev.world_name = d.worldName; feedChanged = true; }
          if (ev.old_world_id === d.worldId && ev.old_world_name !== d.worldName) { ev.old_world_name = d.worldName; feedChanged = true; }
        }
        if (feedChanged) renderFeed();
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('ws-stats', (e) => {
      try {
        const d = JSON.parse(e.data);
        state.wsHistory = window.VrcWsChart.pushSample(state.wsHistory, d.n || 0);
        drawWsSpark();
        renderTop();
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('health', (e) => {
      try {
        const d = JSON.parse(e.data);
        $('#stLatency').textContent = typeof d.latencyMs === 'number' ? d.latencyMs + ' ms' : '';
        if (typeof d.status === 'string') {
          setDot($('#stHealthDot'), d.status === 'ok');
          $('#stHealth').textContent = d.status === 'ok' ? '正常' : '异常';
        }
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('log', (e) => {
      if (!state.settingsOpen || !logState.inited) return;
      try {
        const d = JSON.parse(e.data);
        if (d && d.line && logMatches(d.line)) addLogLine(d.line, d.seq, false);
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('session-expired', () => { state.status = {}; if (evt) { evt.close(); evt = null; } showView('login'); });
    evt.onerror = () => { /* EventSource 自动重连 */ };
  }

  // ---------- 事件绑定 ----------
  function bind() {
    // 顶栏
    $('#themeBtn').addEventListener('click', () => {
      const cur = localStorage.getItem(LS_THEME) || 'dark';
      applyTheme(nextTheme(cur));
      drawWsSpark();
    });
    $('#refreshBtn').addEventListener('click', () => { loadFriends(); loadFeed(false); loadHealth(); });
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsBack').addEventListener('click', closeSettings);
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
      try {
        const r = await api('POST', '/api/login', { username, password, rememberMe: $('#rememberMe').checked });
        if (r.data.requiresTwoFactorAuth) {
          state.tempSessionId = r.data.tempSessionId;
          state.twofaKind = r.data.requiresTwoFactorAuth[0] || 'emailOtp';
          $('#loginMsg').textContent = '';
          $('#twofaMsg').textContent = '请输入' + (state.twofaKind === 'emailOtp' ? '邮箱' : state.twofaKind === 'totp' ? 'TOTP' : '备用') + '验证码';
          switchLoginForm('twofa');
          return;
        }
        if (r.data.ok) location.reload();
        else { $('#loginMsg').textContent = r.data.error || '登录失败'; btn.disabled = false; }
      } catch (e) {
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
      try {
        const r = await api('POST', '/api/login/2fa', { tempSessionId: state.tempSessionId, code, kind: state.twofaKind });
        if (r.data.ok) location.reload();
        else { btn.disabled = false; $('#twofaMsg').textContent = r.data.error || '验证失败'; }
      } catch (e) {
        btn.disabled = false;
        $('#twofaMsg').textContent = e.message || '验证失败';
      }
    });
    $('#twofaCancel').addEventListener('click', () => {
      state.tempSessionId = null;
      $('#twofaMsg').textContent = '';
      switchLoginForm('login');
    });

    // 好友列表
    $('#friendsList').addEventListener('click', (e) => {
      const row = e.target.closest('.friend');
      const group = e.target.closest('.group-title');
      if (group) {
        const key = group.getAttribute('data-group');
        if ($('#friendsList').classList.contains('virtual')) {
          const item = state.friendItems.find((it) => it.type === 'group' && it.key === key);
          collapsed[key] = item ? !item.collapsed : true;
          renderFriends();
          return;
        }
        const body = group.nextElementSibling;
        if (!body) return;
        body.classList.add('animating'); // 过渡期间裁掉溢出, 结束后展开态恢复 visible 给铃铛气泡
        const now = body.classList.toggle('collapsed');
        group.classList.toggle('collapsed', now);
        collapsed[key] = now;
        setTimeout(() => body.classList.remove('animating'), 340);
        return;
      }
      if (!row) return;
      const id = row.getAttribute('data-id');
      const act = e.target.closest('[data-act]');
      if (act) {
        e.stopPropagation();
        const kind = act.getAttribute('data-act');
        if (kind === 'fav') {
          act.classList.add('pop');
          setTimeout(() => act.classList.remove('pop'), 320);
          return toggleFavorite(id);
        }
        if (kind === 'bell') { closeBellPopover(); const f = findFriend(id); if (f) openBellPopover(row, f); return; }
        if (kind === 'settings') { closeBellPopover(); openSettings(); return; }
        return;
      }
      const f = findFriend(id);
      if (!f) return;
      closeBellPopover();
      state.friendId = id;
      state.friendName = f.display_name || id;
      state.filters = [];
      syncFilterChips();
      showFriendChip();
      loadFeed(false);
    });
    $('#friendSearch').addEventListener('input', () => {
      clearTimeout(state.friendSearchTimer);
      state.friendSearchTimer = setTimeout(() => {
        state.friendsQuery = $('#friendSearch').value.trim();
        renderFriends();
      }, 160);
    });
    $('#friendsList').addEventListener('scroll', () => {
      if (state.friends.length > state.friendVlistAt) renderFriendsVirtual();
    });

    // 动态
    $('#feedChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const key = chip.getAttribute('data-filter');
      if (key === 'all') {
        state.filters = []; // 全部: 清空类型筛选; 特别关注是独立开关, 保持不动
      } else if (key === 'favorite') {
        state.favoriteOnly = !state.favoriteOnly;
      } else {
        const i = state.filters.indexOf(key);
        if (i >= 0) state.filters.splice(i, 1);
        else state.filters.push(key);
        // 手动选满所有类型 -> 归一化为「全部」点亮、其他全灭(数据仍是全部)
        state.filters = EM.normalizeFilters(state.filters);
      }
      syncFilterChips();
      loadFeed(false);
    });
    let feedSearchTimer = null;
    $('#feedSearch').addEventListener('input', () => {
      clearTimeout(feedSearchTimer);
      feedSearchTimer = setTimeout(() => {
        state.search = $('#feedSearch').value.trim();
        loadFeed(false);
      }, 250);
    });
    $('#feedList').addEventListener('click', (e) => {
      const item = e.target.closest('.feed-item');
      if (!item) return;
      const id = Number(item.getAttribute('data-id'));
      state.expanded = state.expanded === id ? null : id;
      state.feedHeights.delete(id); // 展开/收起后重新量这一行
      invalidateFeedOffsets();
      renderFeed();
    });
    $('#feedList').addEventListener('scroll', () => {
      $('#feedTop').classList.toggle('hidden', $('#feedList').scrollTop < 300);
      if (state.events.length) renderFeed();
      if (state.newCount > 0 && $('#feedList').scrollTop < 6) {
        state.newCount = 0;
        updateFeedNew();
        loadFeed(false);
      }
      if (state.hasMore && !state.loadingOlder) {
        const el = $('#feedList');
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadFeed(true);
      }
    });
    $('#feedTop').addEventListener('click', () => {
      const el = $('#feedList');
      el.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#feedNew').addEventListener('click', () => {
      $('#feedList').scrollTop = 0;
      state.newCount = 0;
      updateFeedNew();
      loadFeed(false);
    });
    $('#feedFriendChip').addEventListener('click', () => {
      state.friendId = null;
      state.friendName = '';
      hideFriendChip();
      loadFeed(false);
    });

    // 设置页
    $('#sQqEnabled').addEventListener('change', async () => {
      const input = $('#sQqEnabled');
      const want = input.checked ? 1 : 0;
      try {
        const r = await api('PUT', '/api/settings', { qq_enabled: want });
        if (!r.data.ok) { input.checked = !input.checked; flashSettings(r.data.error || '保存失败'); return; }
        syncQqFields();
      } catch (e) { input.checked = !input.checked; flashSettings(e.message); }
    });
    $('#saveSettings').addEventListener('click', async () => {
      const body = { qq_app_id: $('#sQqAppId').value.trim() || null };
      const secret = $('#sQqAppSecret').value;
      if (secret) body.qq_app_secret = secret;
      try {
        const r = await api('PUT', '/api/settings', body);
        flashSettings(r.data.ok ? '已保存' : (r.data.error || '保存失败'));
        if (r.data.ok) { $('#sQqAppSecret').value = ''; loadSettings(); }
      } catch (e) { flashSettings(e.message); }
    });
    $('#testQq').addEventListener('click', async () => {
      try { await api('POST', '/api/test/qq', {}); flashSettings('已发送测试推送'); } catch (e) { flashSettings(e.message); }
    });
    for (const [id, key] of [['#sNotifyGroupAnnouncement', 'notify_group_announcement'], ['#sNotifyBoop', 'notify_boop'], ['#sNotifyInvite', 'notify_invite']]) {
      $(id).addEventListener('change', async () => {
        const input = $(id);
        const want = input.checked ? 1 : 0;
        try {
          const r = await api('PUT', '/api/settings', { [key]: want });
          if (!r.data.ok) { input.checked = !input.checked; flashSettings(r.data.error || '保存失败'); }
        } catch (e) { input.checked = !input.checked; flashSettings(e.message); }
      });
    }
    $('#sAutoTrim').addEventListener('change', async () => {
      const on = $('#sAutoTrim').checked;
      const n = parseInt($('#sFriendEventLimit').value, 10);
      const limit = on ? (Number.isFinite(n) && n > 0 ? n : 50000) : 0;
      try {
        const r = await api('PUT', '/api/settings', { friend_event_limit: on ? limit : null });
        if (!r.data.ok) { $('#sAutoTrim').checked = !on; flashSettings(r.data.error || '保存失败'); return; }
        if (on) $('#sFriendEventLimit').value = limit;
        syncTrimFields();
      } catch (e) { $('#sAutoTrim').checked = !on; flashSettings(e.message); }
    });
    $('#saveLimit').addEventListener('click', async () => {
      const n = parseInt($('#sFriendEventLimit').value, 10);
      try {
        const r = await api('PUT', '/api/settings', { friend_event_limit: Number.isFinite(n) && n > 0 ? n : 50000 });
        if (r.data.ok) { $('#sFriendEventLimit').value = Number.isFinite(n) && n > 0 ? n : 50000; flashSettings('已保存'); }
        else flashSettings(r.data.error || '保存失败');
      } catch (e) { flashSettings(e.message); }
    });
    $('#clearLogs').addEventListener('click', async () => {
      if (!window.confirm('确定清空全部好友日志？此操作不可恢复')) return;
      try {
        const r = await api('DELETE', '/api/friend-events');
        toast(r.data.ok ? '已清空 ' + r.data.removed + ' 条' : '清空失败');
        loadFeed(false);
      } catch (e) { toast(e.message); }
    });
  }

  function syncFilterChips() {
    $$('#feedChips .chip').forEach((c) => {
      const key = c.getAttribute('data-filter');
      if (key === 'all') c.classList.toggle('active', state.filters.length === 0);
      else if (key === 'favorite') c.classList.toggle('active', state.favoriteOnly);
      else c.classList.toggle('active', state.filters.includes(key));
    });
  }
  function showFriendChip() {
    const el = $('#feedFriendChip');
    el.textContent = '只看 ' + state.friendName + ' ×';
    el.classList.remove('hidden');
  }
  function hideFriendChip() {
    $('#feedFriendChip').classList.add('hidden');
  }

  // ---------- 启动 ----------
  async function bootApp() {
    applyTheme(localStorage.getItem(LS_THEME) || 'dark');
    // 没存过后端地址: 同源优先探测(容器/反代场景直接可用)
    if (!localStorage.getItem(LS_BASE)) {
      try {
        const r = await fetch(location.origin + '/api/config', { cache: 'no-store' });
        if (r.ok) {
          const b = await r.json();
          if (b && b.ok) localStorage.setItem(LS_BASE, location.origin);
        }
      } catch (e) { /* 忽略: 用默认地址 */ }
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
  bind();
  if (window.VrcDropdown) window.VrcDropdown.makeDropdown($('#gateScheme'));
  bootApp();
})();
