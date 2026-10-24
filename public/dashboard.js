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
  const FEED_DOM_MAX = 80; // 实时插入时 DOM 行数上限, 超过就重算窗口(避免停留顶部长期累积)

  const EM = window.VrcEventModel;
  const FM = window.VrcFriendModel;
  const FR = window.VrcFriendRow;

  const state = {
    friends: [],
    friendLoadId: 0,
    friendBackfill: null,
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
    friendRowEls: new Map(),   // id -> 行 DOM(增量更新时复用)
    friendRowHtml: new Map(),  // id -> 上次渲染的 HTML(只替换变化的行)
    friendGroupEls: new Map(), // groupKey -> { titleEl, bodyEl, innerEl }
    friendRenderSig: null,     // 旧前端同款指纹: 数据/搜索/折叠都没变就不动 DOM
    search: '',
    expanded: null,
    loadingOlder: false,
    feedReqId: 0,
    feedGen: 0,           // 当前列表(筛选/搜索)代次: 旧代次的分页结果必须丢弃
    feedResetPending: false, // 新列表请求进行中: 暂停用旧游标翻页
    feedDataVersion: 0,
    feedRenderedVersion: -1,
    newCount: 0,
    unseenFrom: 0,
    wsHistory: window.VrcWsChart.emptyHistory(60),
    wsSec: null,
    favorites: new Set(),
    vrcAbnormal: false,
    sseOpened: false,
    initialLoaded: false,      // 首屏数据已加载完(用于决定首次 SSE 连接后的补拉)
    pendingFirstBackfill: false,
    feedBackfill: null,        // 首次连接补拉期间缓冲的实时事件: { reqId, events: [] }
    resyncing: false,
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
  const client = new window.VrcNotifier.Client({ baseUrl: baseUrl(), token: accessToken() });
  function syncClient() {
    client.baseUrl = baseUrl();
    client.token = accessToken();
    return client;
  }
  async function api(method, path, body, opts) {
    try {
      const data = await syncClient().request(method, path, { ...opts, body });
      return { status: 200, data };
    } catch (e) {
      if (!(e instanceof window.VrcNotifier.ApiError) || !e.status) throw e;
      if (e.status === 401 && !(opts && opts.noAuth)) {
        const msg = e.message;
        if (String(path).startsWith('/api/login')) throw e;
        if (msg.includes('未登录')) showView('login');
        else { showView('gate'); setGateMsg('访问令牌无效, 请重新填写'); }
        throw e;
      }
      return { status: e.status, data: e.data || { error: e.message } };
    }
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
  const THEME_ICONS = {
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.6 8.6 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8z"></path></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"></path></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"></circle><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"></path></svg>'
  };
  function applyTheme(mode) {
    const attr = mode === 'auto' ? null : mode;
    if (attr) document.documentElement.setAttribute('data-theme', attr);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(LS_THEME, mode);
    $('#themeBtn').title = { auto: '主题: 自动', dark: '主题: 深色', light: '主题: 浅色' }[mode];
    $('#themeBtn').innerHTML = THEME_ICONS[mode] || THEME_ICONS.dark;
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

  // 顶栏 + 登录页「服务器状态」卡共用: 健康探测(延迟/连通) 与官方状态(VRChat)分开显示
  function applyHealthUi(hd) {
    state.lastHealth = hd || null;
    const ok = !!hd && hd.status === 'ok';
    const lat = hd ? hd.latencyMs : null;
    const text = state.vrcAbnormal ? 'VRC 异常' : (ok ? '正常' : (hd ? '异常' : '-'));
    const latText = typeof lat === 'number' ? lat + ' ms' : '';
    // 主页顶栏和登录页右上角的状态条共用同一套字段(st/lg 前缀)
    for (const prefix of ['st', 'lg']) {
      const dot = document.getElementById(prefix + 'HealthDot');
      if (dot) setDot(dot, ok && !state.vrcAbnormal);
      const label = document.getElementById(prefix + 'Health');
      if (label) label.textContent = text;
      const meta = document.getElementById(prefix + 'Latency');
      if (meta) meta.textContent = latText;
    }
  }
  function applyVrcStatus(vd) {
    state.vrcStatus = vd || null;
    state.vrcAbnormal = !!(vd && vd.state && vd.state !== 'normal');
    if (state.lastHealth) applyHealthUi(state.lastHealth);
    else {
      for (const prefix of ['st', 'lg']) {
        const label = document.getElementById(prefix + 'Health');
        if (label) label.textContent = state.vrcAbnormal ? 'VRC 异常' : '-';
        if (state.vrcAbnormal) {
          const dot = document.getElementById(prefix + 'HealthDot');
          if (dot) setDot(dot, false);
        }
      }
    }
  }
  async function loadHealth() {
    try {
      const [h, v] = await Promise.all([api('GET', '/api/health'), api('GET', '/api/vrc-status')]);
      applyHealthUi(h.data || {});
      applyVrcStatus(v.data || {});
    } catch (e) { /* 顶栏保持 - */ }
  }

  // ---------- 好友列表 ----------
  const TRUST_GROUPS = [
    ['fav', '⭐ 特别关注', false],
    ['online', '在线', false],
    ['active', '网页在线', false],
    ['offline', '离线', true]
  ];
  const COLLAPSE_KEY = 'vrcn_groupCollapsed';
  const collapsed = { offline: true };
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(collapsed, saved);
  } catch (e) { /* 缓存不可用, 用默认 */ }
  function saveCollapsed() {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch (e) { /* ignore */ }
  }

  function groupTitleInnerHtml(key, title, count, isCollapsed) {
    return (
      '<button class="group-toggle" title="' + (isCollapsed ? '展开' : '收起') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>' +
      '</button><span>' + title + '</span><span class="gcount' + (key === 'fav' ? ' fav' : '') + '">' + count + '</span>'
    );
  }
  function groupTitleHtml(key, title, count, isCollapsed) {
    return '<div class="group-title' + (isCollapsed ? ' collapsed' : '') + '" data-group="' + key + '">' +
      groupTitleInnerHtml(key, title, count, isCollapsed) + '</div>';
  }
  function placeHtml(place, worldId) {
    if (!place) return '';
    if (place.kind === 'text') return '<span class="w">' + escapeHtml(place.text) + '</span>';
    const parts = [];
    if (place.flagClass) parts.push('<i class="flags ' + place.flagClass + '"></i>');
    if (place.worldName) {
      const w = window.VrcLinks
        ? window.VrcLinks.linkHtml('world', worldId, place.worldName)
        : escapeHtml(place.worldName);
      parts.push('<span class="w">' + w + '</span>');
    }
    if (place.accessLabel) parts.push('<span class="sep">·</span><span class="inst">' + escapeHtml(place.accessLabel) + '</span>');
    return parts.join('');
  }
  const STAR_ON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M12 3.5l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 17.3l-5.38 2.8 1.03-6L3.3 9.9l6-.9L12 3.5z"></path></svg>';
  const STAR_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 17.3l-5.38 2.8 1.03-6L3.3 9.9l6-.9L12 3.5z"></path></svg>';
  const BELL_HOLLOW = '<svg class="bh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"></path><path d="M13.7 20a2 2 0 0 1-3.4 0"></path></svg>';
  const BELL_SOLID = '<svg class="bs" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a6 6 0 0 0-6 6c0 5.2-2.1 6.7-2.8 7.2-.4.3-.2 1 .4 1h16.8c.6 0 .8-.7.4-1C20.1 14.7 18 13.2 18 8a6 6 0 0 0-6-6z"></path><path d="M9.8 19.6a2.4 2.4 0 0 0 4.4 0z"></path></svg>';
  const BELL_LABELS = [
    ['notify_online', 'notifyOnline', '上线'],
    ['notify_web_online', 'notifyWebOnline', '网页上线'],
    ['notify_offline', 'notifyOffline', '下线'],
    ['notify_status_change', 'notifyStatusChange', '状态变化'],
    ['notify_world_change', 'notifyWorldChange', '世界变化']
  ];

  function avatarInnerHtml(f, m) {
    const initial = escapeHtml((m.name || '?').charAt(0).toUpperCase());
    return f.avatarKey
      ? '<img class="avatar" src="' + avatarUrl(f.avatarKey) + '" loading="lazy" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="avatar-fallback">' + initial + '</div>'
      : '<div class="avatar-fallback" style="display:flex">' + initial + '</div>';
  }
  function bellClsOf(state) {
    return state === 'bad' ? ' bad' : (state === 'warn-solid' ? ' warn-solid' : (state === 'warn' ? ' warn' : ''));
  }
  function nameInnerHtml(f, m) {
    return window.VrcLinks
      ? window.VrcLinks.linkHtml('user', f.friend_vrchat_id, m.name)
      : escapeHtml(m.name);
  }
  function friendRowHtml(f) {
    const m = FR.rowModel(f);
    const av = avatarInnerHtml(f, m);
    return (
      '<div class="friend" data-id="' + escapeHtml(f.friend_vrchat_id) + '">' +
      '<span class="avatar-wrap ' + m.dotClasses + '" data-avatar-key="' + escapeHtml(f.avatarKey || '') + '">' +
      (window.VrcLinks ? window.VrcLinks.wrapHtml('user', f.friend_vrchat_id, av) : av) + '</span>' +
      '<div class="fmeta"><div class="frow1">' +
      '<span class="name ' + m.nameClass + '">' + nameInnerHtml(f, m) + '</span>' +
      (m.statusText ? '<span class="cstatus">' + escapeHtml(m.statusText) + '</span>' : '') +
      '</div><div class="floc">' + placeHtml(m.place, f.world_id) + '</div></div>' +
      '<span class="fx">' +
      '<button class="fav-star' + (m.favorite ? ' on' : '') + '" data-act="fav" title="' + (m.favorite ? '取消关心' : '关心(特别关注)') + '">' + (m.favorite ? STAR_ON : STAR_OFF) + '</button>' +
      '<button class="push-bell' + bellClsOf(m.bell) + '" data-act="bell" title="推送设置">' + BELL_HOLLOW + BELL_SOLID + '</button>' +
      '</span></div>'
    );
  }

  // 已存在的行只更新发生变化的子元素(头像圆点/昵称/自定义状态/位置/星标/铃铛), 不重建整行
  function patchFriendRowEl(el, f) {
    const m = FR.rowModel(f);
    const avWrap = el.querySelector('.avatar-wrap');
    if (avWrap) {
      avWrap.className = 'avatar-wrap ' + m.dotClasses;
      const key = f.avatarKey || '';
      if (avWrap.dataset.avatarKey !== key) {
        avWrap.dataset.avatarKey = key;
        const av = avatarInnerHtml(f, m);
        avWrap.innerHTML = window.VrcLinks ? window.VrcLinks.wrapHtml('user', f.friend_vrchat_id, av) : av;
      }
    }
    const nameEl = el.querySelector('.name');
    if (nameEl) {
      const wantHtml = nameInnerHtml(f, m);
      if (nameEl.innerHTML !== wantHtml) nameEl.innerHTML = wantHtml;
      const wantCls = 'name ' + m.nameClass;
      if (nameEl.className !== wantCls) nameEl.className = wantCls;
    }
    const row1 = el.querySelector('.frow1');
    if (row1) {
      let cs = row1.querySelector('.cstatus');
      if (m.statusText) {
        if (!cs) { cs = document.createElement('span'); cs.className = 'cstatus'; row1.appendChild(cs); }
        if (cs.textContent !== m.statusText) cs.textContent = m.statusText;
      } else if (cs) cs.remove();
    }
    const loc = el.querySelector('.floc');
    if (loc) {
      const want = placeHtml(m.place, f.world_id);
      if (loc.innerHTML !== want) loc.innerHTML = want;
    }
    const fav = el.querySelector('.fav-star');
    if (fav) {
      const wantHtml = m.favorite ? STAR_ON : STAR_OFF;
      if (fav.innerHTML !== wantHtml) fav.innerHTML = wantHtml;
      fav.classList.toggle('on', m.favorite);
      const wantTitle = m.favorite ? '取消关心' : '关心(特别关注)';
      if (fav.title !== wantTitle) fav.title = wantTitle;
    }
    const bell = el.querySelector('.push-bell');
    if (bell) {
      const wantCls = 'push-bell' + bellClsOf(m.bell);
      if (bell.className !== wantCls) bell.className = wantCls;
    }
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
  function virtualTargetRect(id, list) {
    const idx = state.friendItems.findIndex((it) => it.type === 'friend' && it.friend.friend_vrchat_id === id);
    if (idx < 0) return null;
    const offsets = friendOffsets();
    const listRect = list.getBoundingClientRect();
    const itemH = state.friendHeights.get('f:' + id) || 38;
    return { left: listRect.left + 12, top: listRect.top + offsets[idx] - list.scrollTop, width: Math.max(80, listRect.width - 24), height: itemH };
  }
  function renderFriendsVirtual(opts) {
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
    // 数据更新时: 记下重绘前的位置, 之后窗口内 FLIP、窗口外(没渲染出来的落点)克隆飞行体
    let oldRects = null;
    let oldClones = null;
    let oldGroups = null;
    if (opts && opts.animate) {
      oldRects = new Map();
      oldClones = new Map();
      oldGroups = new Map();
      let curGroup = null;
      for (const el of list.children) {
        if (el.classList.contains('group-title')) { curGroup = el.dataset.group; continue; }
        if (!el.classList.contains('friend')) continue;
        const key = 'r:' + el.dataset.id;
        oldRects.set(key, el.getBoundingClientRect());
        oldClones.set(key, el.cloneNode(true));
        oldGroups.set(el.dataset.id, curGroup);
      }
      for (const el of list.querySelectorAll(':scope > .group-title')) {
        oldRects.set('g:' + el.dataset.group, el.getBoundingClientRect());
      }
    }
    list.innerHTML = '<div class="vlist-gap" style="height:' + sp.before + 'px"></div>' +
      state.friendItems.slice(win.from, win.to + 1).map(friendItemHtml).join('') +
      '<div class="vlist-gap" style="height:' + sp.after + 'px"></div>';
    state.friendRange = win;
    if (oldRects && oldRects.size) {
      const listRect = list.getBoundingClientRect();
      const newEls = new Map();
      for (const el of list.querySelectorAll('.friend')) newEls.set('r:' + el.dataset.id, el);
      for (const el of list.querySelectorAll(':scope > .group-title')) newEls.set('g:' + el.dataset.group, el);
      for (const [key, oldRect] of oldRects) {
        const el = newEls.get(key);
        if (el) {
          const nr = el.getBoundingClientRect();
          const dx = oldRect.left - nr.left;
          const dy = oldRect.top - nr.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
          try {
            el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
              { duration: 300, easing: 'cubic-bezier(.22,.8,.3,1)' });
          } catch (e) { /* ignore */ }
        } else if (key.startsWith('r:')) {
          // 飞到没有渲染出来的位置: 先判断是否真的换了分组, 再按方向克隆飞过去
          const id = key.slice(2);
          const oldVisible = oldRect.bottom > listRect.top && oldRect.top < listRect.bottom;
          if (!oldVisible) continue;
          const item = state.friendItems.find((it) => it.type === 'friend' && it.friend.friend_vrchat_id === id);
          if (!item || oldGroups.get(id) === item.groupKey) continue;
          const clone = oldClones.get(key);
          const target = virtualTargetRect(id, list);
          if (clone && target) flyNode(clone, oldRect, target);
        }
      }
    }
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

  function ensureFriendGroupEls(key, title, count, isCollapsed) {
    let g = state.friendGroupEls.get(key);
    if (g) return g;
    const titleEl = document.createElement('div');
    titleEl.className = 'group-title' + (isCollapsed ? ' collapsed' : '');
    titleEl.dataset.group = key;
    titleEl.innerHTML = groupTitleInnerHtml(key, title, count, isCollapsed);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'group-body';
    bodyEl.dataset.group = key;
    const innerEl = document.createElement('div');
    innerEl.className = 'group-inner';
    bodyEl.appendChild(innerEl);
    g = { titleEl, bodyEl, innerEl };
    state.friendGroupEls.set(key, g);
    return g;
  }
  function makeFriendRowEl(f, enterIndex) {
    const tpl = document.createElement('template');
    tpl.innerHTML = friendRowHtml(f).trim();
    const el = tpl.content.firstElementChild;
    if (enterIndex != null) {
      el.classList.add('enter');
      el.style.setProperty('--i', String(Math.min(enterIndex, 24)));
      const clearEnter = () => { el.classList.remove('enter'); el.style.removeProperty('--i'); };
      el.addEventListener('animationend', clearEnter, { once: true });
      setTimeout(clearEnter, 1400); // 兜底: 动画被跳过/打断时也清掉, 防止以后重播
    }
    return el;
  }
  // 飞行体: 目标位置不在可视/已渲染区域时, 克隆当前行从原位朝目标方向飞过去(旧前端同款)
  const flyerNodes = [];
  const FLYER_MAX = 4;
  function flyNode(node, fromRect, toRect, opts) {
    if (!node || !fromRect || !toRect || flyerNodes.length >= FLYER_MAX) return false;
    node.classList.remove('enter', 'spot-on', 'v-in', 'v-out', 'fav-spot');
    const pop = node.querySelector('.push-pop');
    if (pop) pop.remove();
    node.classList.add('v-flyer');
    node.style.position = 'fixed';
    node.style.margin = '0';
    node.style.left = fromRect.left + 'px';
    node.style.top = fromRect.top + 'px';
    node.style.width = fromRect.width + 'px';
    node.style.height = fromRect.height + 'px';
    node.style.pointerEvents = 'none';
    node.style.zIndex = '60';
    document.body.appendChild(node);
    flyerNodes.push(node);
    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;
    const dist = Math.hypot(dx, dy);
    const dur = Math.min(520, Math.max(260, 240 + Math.sqrt(dist) * 8));
    const done = () => {
      node.remove();
      const i = flyerNodes.indexOf(node);
      if (i >= 0) flyerNodes.splice(i, 1);
    };
    try {
      const anim = node.animate([
        { transform: 'translate3d(0, 0, 0)', opacity: 1 },
        { transform: 'translate3d(' + (dx * 0.86).toFixed(1) + 'px, ' + (dy * 0.86).toFixed(1) + 'px, 0)', opacity: 0.9, offset: 0.7 },
        { transform: 'translate3d(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px, 0)', opacity: 0 }
      ], { duration: dur, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' });
      anim.onfinish = done;
      anim.oncancel = done;
    } catch (e) { done(); }
    return true;
  }
  function flyRowClone(rowEl, fromRect, toRect) {
    if (!rowEl) return false;
    return flyNode(rowEl.cloneNode(true), fromRect, toRect);
  }

  // 按目标顺序摆放子节点: 已经在该位置的节点不碰(避免重插入导致 CSS 动画重播)
  function syncChildren(parent, desiredEls) {
    for (let i = 0; i < desiredEls.length; i++) {
      const el = desiredEls[i];
      if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null);
    }
    while (parent.children.length > desiredEls.length) parent.removeChild(parent.lastElementChild);
  }
  // 增量更新: 只替换内容变化的行、移动换组的行(DOM 复用 + FLIP), 不再整表重建
  function renderFriendsIncremental(groups) {
    const list = $('#friendsList');
    // 清掉上一次的空状态提示
    for (const child of [...list.children]) {
      if (!child.classList.contains('group-title') && !child.classList.contains('group-body')) child.remove();
    }
    const order = [];
    for (const [key, title, defaultCollapsed] of TRUST_GROUPS) {
      if ((groups[key] || []).length) order.push({ key, title, defaultCollapsed, list: groups[key] });
    }
    if (!order.length) {
      list.innerHTML = '<p class="muted" style="padding:10px">没有好友</p>';
      state.friendRowEls.clear();
      state.friendRowHtml.clear();
      state.friendGroupEls.clear();
      return;
    }
    const wanted = new Set();
    const orderedGroups = [];
    for (const g of order) for (const f of g.list) wanted.add(f.friend_vrchat_id);
    // 先量旧位置(FLIP 的 First): 行和分组标题都要平滑飞过去(只平移, 不重建)
    const oldRects = new Map();
    const oldGroups = new Map();
    for (const [id, el] of state.friendRowEls) {
      if (!el.isConnected) continue;
      oldRects.set('r:' + id, el.getBoundingClientRect());
      const b = el.closest('.group-body');
      oldGroups.set(id, b ? b.dataset.group : '');
    }
    for (const [key, g] of state.friendGroupEls) {
      if (g.titleEl.isConnected) oldRects.set('g:' + key, g.titleEl.getBoundingClientRect());
    }
    // 删掉已经不在列表里的行(搜索/离线删除等)
    for (const [id, el] of [...state.friendRowEls]) {
      if (!wanted.has(id)) {
        el.remove();
        state.friendRowEls.delete(id);
        state.friendRowHtml.delete(id);
      }
    }
    for (const { key, title, defaultCollapsed, list: arr } of order) {
      const isCollapsed = collapsed[key] !== undefined ? collapsed[key] : defaultCollapsed;
      const g = ensureFriendGroupEls(key, title, arr.length, isCollapsed);
      g.titleEl.className = 'group-title' + (isCollapsed ? ' collapsed' : '');
      g.titleEl.dataset.group = key;
      const titleSig = title + '|' + arr.length + '|' + (isCollapsed ? '1' : '0');
      if (g.titleSig !== titleSig) {
        // 只更新变化的那几个子节点, 不重建整块标题
        const toggleBtn = g.titleEl.querySelector('.group-toggle');
        if (toggleBtn) {
          const wantBtnTitle = isCollapsed ? '展开' : '收起';
          if (toggleBtn.title !== wantBtnTitle) { toggleBtn.title = wantBtnTitle; toggleBtn.setAttribute('aria-label', wantBtnTitle); }
        }
        const labelEl = g.titleEl.children[1];
        if (labelEl && labelEl.textContent !== title) labelEl.textContent = title;
        const countEl = g.titleEl.querySelector('.gcount');
        if (countEl && countEl.textContent !== String(arr.length)) countEl.textContent = String(arr.length);
        g.titleSig = titleSig;
      }
      g.bodyEl.className = 'group-body' + (isCollapsed ? ' collapsed' : '');
      g.bodyEl.dataset.group = key;
      // 按分组顺序摆放标题+内容(顺序没变的节点不移动)
      orderedGroups.push(g);
      const rowEls = [];
      arr.forEach((f, idx) => {
        const id = f.friend_vrchat_id;
        const html = friendRowHtml(f);
        let el = state.friendRowEls.get(id);
        if (el) {
          // 已存在的行: 只 patch 变化的子元素, 整行节点/头像/动画都不重建
          if (state.friendRowHtml.get(id) !== html) {
            patchFriendRowEl(el, f);
            state.friendRowHtml.set(id, html);
          }
        } else {
          el = makeFriendRowEl(f, idx);
          state.friendRowEls.set(id, el);
          state.friendRowHtml.set(id, html);
        }
        rowEls.push(el);
      });
      syncChildren(g.innerEl, rowEls);
    }
    syncChildren(list, orderedGroups.flatMap((g) => [g.titleEl, g.bodyEl]));
    // 移除变空的分组
    for (const [key, g] of [...state.friendGroupEls]) {
      if (!order.some((o) => o.key === key)) {
        g.titleEl.remove();
        g.bodyEl.remove();
        state.friendGroupEls.delete(key);
      }
    }
    // FLIP: 换组/排序后, 行与分组标题都平滑平移到新位置;
    // 若落点不在当前可视区域(折叠组/窗口外), 克隆一行判断方向后飞过去
    const listRect = list.getBoundingClientRect();
    for (const [key, oldRect] of oldRects) {
      let el = null;
      if (key.startsWith('r:')) el = state.friendRowEls.get(key.slice(2));
      else {
        const g = state.friendGroupEls.get(key.slice(2));
        el = g ? g.titleEl : null;
      }
      if (!el || !el.isConnected) continue;
      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      if (key.startsWith('r:')) {
        const id = key.slice(2);
        const body = el.closest('.group-body');
        const newGroup = body ? body.dataset.group : '';
        const collapsedTarget = !!(body && body.classList.contains('collapsed'));
        const oldVisible = oldRect.bottom > listRect.top && oldRect.top < listRect.bottom;
        const newVisible = newRect.bottom > listRect.top && newRect.top < listRect.bottom;
        // 只有换了分组的行飞向"没加载出来"的落点时才用飞行体;
        // 同组内被挤动的行仍走普通 FLIP(避免一次折叠冒出一堆克隆行)
        if (oldGroups.get(id) !== newGroup && oldVisible && (collapsedTarget || !newVisible)) {
          flyRowClone(el, oldRect, newRect);
          continue;
        }
      }
      try {
        el.animate(
          [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
          { duration: 300, easing: 'cubic-bezier(.22,.8,.3,1)' }
        );
      } catch (e) { /* WAAPI 不可用时直接落位 */ }
    }
  }

  // 好友列表回到顶部: 只有滚过一段距离才显示
  function updateFriendsTop() {
    const list = $('#friendsList');
    const btn = $('#friendsTop');
    if (!list || !btn) return;
    btn.classList.toggle('hidden', list.scrollTop < 80);
  }

  function renderFriends() {
    const list = $('#friendsList');
    const groups = FM.splitGroups(state.friends, state.friendsQuery || '');
    $('#friendsCount').textContent = state.friends.length;
    if (state.friends.length > state.friendVlistAt) {
      // 超大同好列表: 退回窗口渲染(此模式重建固定窗口, 不做增量)
      list.classList.add('virtual');
      state.friendRowEls.clear();
      state.friendRowHtml.clear();
      state.friendGroupEls.clear();
      state.friendRenderSig = null;
      state.friendItems = window.VrcFriendLayout.layout(groups, collapsed);
      state.friendOffsets = null;
      state.friendRange = null;
      renderFriendsVirtual({ animate: true });
      updateFriendsTop();
      return;
    }
    if (list.classList.contains('virtual')) {
      list.innerHTML = '';
      list.classList.remove('virtual');
      state.friendRowEls.clear();
      state.friendRowHtml.clear();
      state.friendGroupEls.clear();
    }
    // 旧前端同款: 数据/搜索词/折叠状态都没变 → 什么都不做(避免无意义的全局刷新)
    const sig = FM.renderSignature(state.friends, state.friendsQuery || '', collapsed);
    if (sig === state.friendRenderSig && list.querySelector('.group-title')) return;
    renderFriendsIncremental(groups);
    state.friendRenderSig = sig;
    updateFriendsTop();
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
        updateFavoriteIds();
        renderFriends();
      } else toast((r.data && r.data.error) || '保存失败');
    } catch (e) { toast(e.message || '保存失败'); }
  }

  function bellPopoverHtml(f) {
    const cfg = f.config || {};
    const on = (k) => cfg[k] === 1;
    return (
      '<div class="push-pop"><div class="pp-head"><span class="pp-title">推送设置</span><span class="pp-who">' + escapeHtml(f.display_name) + '</span></div>' +
      BELL_LABELS.map(([key, camel, label]) =>
        '<div class="pp-row"><span>' + label + '</span><label class="switch"><input type="checkbox" data-k="' + key + '" data-camel="' + camel + '"' + (on(key) ? ' checked' : '') + '><span class="slider"></span></label></div>'
      ).join('') +
      '<div class="pp-foot"><button class="link-btn" data-act="settings">全部通知设置</button></div></div>'
    );
  }

  function openBellPopover(row, f) {
    closeBellPopover(false);
    row.insertAdjacentHTML('beforeend', bellPopoverHtml(f));
    const pop = row.querySelector('.push-pop');
    pop.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ev.target.closest('[data-act="settings"]')) { closeBellPopover(true); openSettings(); }
    });
    pop.addEventListener('change', async (ev) => {
      const input = ev.target;
      const key = input && input.getAttribute && input.getAttribute('data-k');
      const camel = input && input.getAttribute && input.getAttribute('data-camel');
      if (!key) return;
      try {
        // 接口要驼峰字段(notifyOnline...), GET /api/friends 返回的是下划线配置
        const r = await api('PUT', '/api/friends/' + encodeURIComponent(f.friend_vrchat_id) + '/config', { [camel || key]: input.checked ? 1 : 0 });
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
  function closeBellPopover(animate) {
    $$('.push-pop').forEach((el) => {
      if (!animate) { el.remove(); return; }
      if (el.classList.contains('closing')) return;
      el.classList.add('closing');
      setTimeout(() => el.remove(), 180);
    });
  }

  function updateFavoriteIds() {
    state.favorites = new Set(
      state.friends.filter((f) => f.config && f.config.favorite === 1).map((f) => f.friend_vrchat_id)
    );
  }
  async function loadFriends() {
    const reqId = ++state.friendLoadId;
    const updates = [];
    state.friendBackfill = updates;
    try {
      const r = await api('GET', '/api/friends');
      if (reqId !== state.friendLoadId || !r.data || !r.data.ok) return;
      let friends = r.data.friends || [];
      for (const update of updates) friends = FM.applyFriendState(friends, update);
      state.friends = friends;
      updateFavoriteIds();
      renderFriends();
      renderTop();
    } finally {
      if (reqId === state.friendLoadId) state.friendBackfill = null;
    }
  }

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
      '<span class="fr-name">' + (window.VrcLinks ? window.VrcLinks.linkHtml('user', e.friend_vrchat_id, e.friend_name || '') : escapeHtml(e.friend_name || '')) + '</span>' +
      '<span class="fr-desc">' + summaryHtml(e) + '</span>' +
      '<svg class="fr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>' +
      '</div>' +
      '<div class="feed-detail"><div class="feed-detail-clip"><div class="feed-detail-inner">' + changeHtml(e) + '</div></div></div>' +
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

  function makeFeedItemEl(e, enter) {
    const tpl = document.createElement('template');
    tpl.innerHTML = feedItemHtml(e).trim();
    const el = tpl.content.firstElementChild;
    if (enter) {
      el.classList.add('feed-enter');
      setTimeout(() => el.classList.remove('feed-enter'), 420);
    }
    return el;
  }
  function patchFeedRowEl(el, e) {
    if (!el) return;
    const desc = el.querySelector('.fr-desc');
    if (desc) desc.innerHTML = summaryHtml(e);
    const detail = el.querySelector('.feed-detail-inner');
    if (detail) detail.innerHTML = changeHtml(e);
  }

  // 实时新动态: 只插入一行, 其他行用 FLIP 往下平移, 不重建整个窗口
  // 实时插入后的收尾合并到一帧: 批量事件时避免每个事件各更新一次 range/占位,
  // 同时把 DOM 行数收回到窗口上限内(长期停在顶部也不会无限累积节点)
  let feedPrependSettleRaf = 0;
  function scheduleFeedPrependSettle() {
    if (feedPrependSettleRaf) return;
    feedPrependSettleRaf = requestAnimationFrame(() => {
      feedPrependSettleRaf = 0;
      const list = $('#feedList');
      if (!list) return;
      const items = list.querySelectorAll('.feed-item');
      if (!items.length) return;
      if (items.length > FEED_DOM_MAX) {
        state.feedRenderedVersion = -1;
        renderFeed();
        return;
      }
      invalidateFeedOffsets();
      for (const el of items) measureFeedRowEl(el);
      if (state.feedRange && state.feedRange.from === 0) state.feedRange = { from: 0, to: items.length - 1 };
      state.feedRenderedVersion = state.feedDataVersion;
      const offsets = feedOffsets();
      const rangeNow = state.feedRange || { from: 0, to: state.events.length - 1 };
      const sp = window.VrcVList.spacersFor({ offsets, from: rangeNow.from, to: rangeNow.to });
      const gaps = list.querySelectorAll('.vlist-gap');
      if (gaps.length === 2) {
        gaps[0].style.height = sp.before + 'px';
        gaps[1].style.height = sp.after + 'px';
      }
      $('#feedTotal').textContent = state.total ? '共 ' + state.total.toLocaleString() + ' 条' : '';
      updateFeedNew();
    });
  }

  function prependFeedEvent(item) {
    const list = $('#feedList');
    if (!list || !state.feedRange) return false;
    if (state.events.some((ev) => ev.id === item.id)) return false;
    const renderedItems = list.querySelectorAll('.feed-item');
    // 突发大量实时事件时不再给每一行做 FLIP(50+ 行的逐个测量没有意义, 还会拖慢插入)
    const animateRows = renderedItems.length <= 60;
    const oldRects = [];
    if (animateRows) for (const el of renderedItems) oldRects.push([el, el.getBoundingClientRect()]);
    const merged = window.VrcFeedStore.mergeEvents(state.events, [item]);
    state.events = merged.events;
    state.feedDataVersion++;
    state.total++;
    const el = makeFeedItemEl(item, true);
    const firstGap = list.querySelector('.vlist-gap');
    if (firstGap) firstGap.after(el); else list.prepend(el);
    // FLIP: 原有行只平移, 不重绘
    for (const [oldEl, rect] of (animateRows ? oldRects : [])) {
      const nr = oldEl.getBoundingClientRect();
      const dy = rect.top - nr.top;
      if (Math.abs(dy) < 0.5) continue;
      try {
        oldEl.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.22,.8,.3,1)' });
      } catch (e) { /* ignore */ }
    }
    scheduleFeedPrependSettle();
    return true;
  }

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
    // 区间没变 + 数据没变: 只更新上下占位高度, 不动行 DOM(保住 hover/展开动画)。
    // 数据变了(换筛选/搜索/新事件)必须重建, 否则会一直显示上一批数据的行。
    const dataChanged = state.feedRenderedVersion !== state.feedDataVersion;
    if (!dataChanged && state.feedRange && window.VrcVList.sameRange(state.feedRange, win)) {
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
    state.feedRenderedVersion = state.feedDataVersion;
    measureFeedRows();
  }
  let feedToggleTimer = 0;
  function measureFeedRowEl(el) {
    if (!el) return;
    const id = Number(el.getAttribute('data-id'));
    const h = Math.round(el.getBoundingClientRect().height * 100) / 100;
    state.feedHeights.set(id, h);
  }
  // 展开/收起动画结束后统一量高并修正虚拟列表占位(不重建窗口 → 视口不跳)
  function settleFeedToggle() {
    const list = $('#feedList');
    if (!list) return;
    invalidateFeedOffsets();
    for (const el of list.querySelectorAll('.feed-item')) measureFeedRowEl(el);
    if (!state.feedRange) return;
    const gaps = list.querySelectorAll('.vlist-gap');
    if (gaps.length !== 2) return;
    invalidateFeedOffsets();
    const sp = window.VrcVList.spacersFor({ offsets: feedOffsets(), from: state.feedRange.from, to: state.feedRange.to });
    // 若收起/展开的是窗口上方的行, 顶部占位变化会推挤视口: 用 scrollTop 补偿, 保持阅读位置不动
    const beforeH = parseFloat(gaps[0].style.height) || 0;
    if (Math.abs(sp.before - beforeH) > 0.5) list.scrollTop += sp.before - beforeH;
    gaps[0].style.height = sp.before + 'px';
    gaps[1].style.height = sp.after + 'px';
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
  async function loadFeed(older, opts) {
    // 只拦「加载更旧」的重复滚动请求; 筛选/搜索连续点击时以最后一次为准(请求序号防乱序)。
    // 关键: 翻页不能开启新一代请求序号 —— 否则会把正在返回的筛选响应误判成过时丢掉。
    // 注意: 新列表请求(筛选/搜索)还没返回时不能翻页 —— 那会用旧列表末尾的游标去请求,
    //       结果却被当成新列表的一页合并进来(中间记录丢失/hasMore 被带偏)。
    if (older && (state.loadingOlder || state.feedResetPending)) return;
    if (older) state.loadingOlder = true;
    const gen = state.feedGen;
    const reqId = older ? state.feedReqId : ++state.feedReqId;
    if (!older) { state.feedGen++; state.feedResetPending = true; }
    if (!older && opts && opts.mergePending) state.feedBackfill = { reqId, events: [] };
    try {
      const r = await api('GET', '/api/friend-events?' + feedQuery(older));
      if (reqId !== state.feedReqId) return; // 筛选已换代: 丢弃这次(可能是旧游标的)响应
      if (older && gen !== state.feedGen) return; // 翻页请求发出后列表已换代: 旧游标结果作废
      const d = r.data || {};
      if (older) {
        state.events = window.VrcFeedStore.mergeEvents(state.events, d.events || []).events;
      } else {
        let incoming = d.events || [];
        let extraTotal = 0;
        // 首次连接补拉: 把请求期间实时到达、已被正常插入过的事件再并回来(按 id 去重),
        // 避免补拉响应覆盖掉 SSE 刚推来的事件。
        if (state.feedBackfill && state.feedBackfill.reqId === reqId && state.feedBackfill.events.length) {
          const merged = window.VrcFeedStore.mergeEvents(incoming, state.feedBackfill.events);
          incoming = merged.events;
          extraTotal = merged.added;
        }
        state.events = incoming;
        state.total = (d.total || incoming.length) + extraTotal; // 翻旧页时后端 total 只是「更旧部分」的计数, 不能覆盖总数
        if (!(opts && opts.keepScroll)) {
          // 换筛选/搜索后回到最新: 清掉展开态与滚动位置, 让结果从顶部可见
          state.expanded = null;
          state.newCount = 0;
          updateFeedNew();
          $('#feedList').scrollTop = 0;
        }
      }
      state.hasMore = !!d.hasMore;
      state.feedDataVersion++;
      invalidateFeedOffsets();
      renderFeed();
    } catch (e) {
      if (reqId === state.feedReqId && state.events.length === 0) {
        $('#feedList').innerHTML = '<p class="muted" style="padding:14px">加载失败: ' + escapeHtml(e.message) + '</p>';
      }
    } finally {
      if (state.feedBackfill && state.feedBackfill.reqId === reqId) state.feedBackfill = null;
      if (older) state.loadingOlder = false;
      else if (reqId === state.feedReqId) state.feedResetPending = false;
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
  const logState = { oldestSeq: null, lastSeq: null, hasOlder: true, loading: false, ready: false, reqId: 0, pendingReset: false };

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
  // 方向性裁剪(复用 logview 的纯策略): 直播从底部裁最老, 翻旧页从顶部裁最新;
  // 否则翻页刚插入的旧日志会被立刻删掉, 游标却已前进 → 永久丢历史。
  function trimLogRows(mode) {
    const box = logBox();
    if (!box) return 0;
    const plan = window.VrcLogView.plan({ totalRows: box.children.length, maxRows: LOG_MAX_ROWS, mode });
    let removed = 0;
    for (let i = 0; i < plan.count; i++) {
      const child = plan.side === 'top' ? box.firstChild : box.lastChild;
      if (!child) break;
      box.removeChild(child);
      removed++;
    }
    return removed;
  }
  // 裁剪后按 DOM 里实际保留的最老一行回写 oldestSeq, 避免 before= 游标指向已被裁掉的历史
  function syncOldestSeqFromDom() {
    const box = logBox();
    if (!box) return;
    const rows = box.querySelectorAll('div[data-seq]');
    if (!rows.length) { logState.oldestSeq = null; return; }
    const oldest = Number(rows[rows.length - 1].dataset.seq);
    if (Number.isFinite(oldest)) logState.oldestSeq = oldest;
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
      trimLogRows('older');
      if (seq != null && (logState.oldestSeq == null || seq < logState.oldestSeq)) logState.oldestSeq = seq;
    } else {
      const wasAtTop = box.scrollTop <= 2;
      const beforeH = box.scrollHeight;
      box.insertBefore(div, box.firstChild);
      // 只有真的裁掉了行才重算游标(否则每次实时日志都扫一遍 DOM, 开销不必要)
      if (trimLogRows('live') > 0) syncOldestSeqFromDom();

      if (wasAtTop) box.scrollTop = 0;
      else box.scrollTop += box.scrollHeight - beforeH; // 阅读旧日志时视口不跳动
      if (seq != null && (logState.lastSeq == null || seq > logState.lastSeq)) logState.lastSeq = seq;
      if (logState.oldestSeq == null) logState.oldestSeq = seq;
    }
  }
  async function loadLogs(reset) {
    const box = logBox();
    if (!box) return;
    if (logState.loading) {
      // 加载中改筛选: 记下待重载, 作废本轮响应, 等它结束后按新条件重拉
      if (reset !== false) { logState.reqId++; logState.pendingReset = true; }
      return;
    }
    logState.loading = true;
    const reqId = ++logState.reqId;
    try {
      const q = reset === false && logState.oldestSeq != null
        ? 'before=' + logState.oldestSeq + '&limit=' + LOG_MORE
        : 'tail=' + LOG_TAIL;
      const r = await api('GET', '/api/logs?' + q + logFilterQuery());
      if (reqId !== logState.reqId) return; // 已被更新的筛选请求取代
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
    finally {
      // 无论是否被新请求取代/异常, 都要释放 loading 并处理待重载, 否则日志面板会永久卡死
      logState.loading = false;
      if (logState.pendingReset) { logState.pendingReset = false; loadLogs(true); }
    }
  }
  // SSE 重连补缺口: after= 已展示的最新 seq
  async function loadLogsGap() {
    if (!logState.ready || logState.lastSeq == null) return;
    try {
      const r = await api('GET', '/api/logs?after=' + logState.lastSeq + logFilterQuery());
      const logs = (r.data && r.data.logs) || [];
      for (const entry of logs) if (logMatches(entry.line)) addLogLine(entry.line, entry.seq, false);
    } catch (e) { /* ignore */ }
  }
  // 按 seq 替换一行(令牌打码后的行更新)
  function replaceLogRecord(seq, line) {
    const box = logBox();
    if (!box) return;
    const el = box.querySelector('div[data-seq="' + seq + '"]');
    if (!el) return;
    renderLogRow(el, line);
    el.dataset.seq = seq;
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
    closeBellPopover(true);
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
        // 后端重启等场景: 自动登录完成前可能短暂 401 切到登录页, 登录态恢复后自动回主界面
        if (state.status.loggedIn && state.view === 'login' && !state.loginWaiting && !bootState.active) loadAll().catch(() => {});
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('friend-state', (e) => {
      try {
        const update = JSON.parse(e.data);
        if (state.friendBackfill) state.friendBackfill.push(update);
        state.friends = FM.applyFriendState(state.friends, update);
        updateFavoriteIds();
        renderFriends();
        renderTop();
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('friend-event', (e) => {
      try {
        const item = JSON.parse(e.data);
        // 2) 动态流: 只有命中当前筛选才插入/计数
        const matched = window.VrcEventModel.eventMatchesFilters(item, {
          codes: window.VrcEventModel.filterCodes(state.filters),
          favoriteIds: state.favoriteOnly ? state.favorites : null,
          friendId: state.friendId,
          search: state.search
        });
        if (!matched) return;
        // 首次连接补拉期间: 同时缓冲一份供补拉响应合并(正常插入照旧), 避免响应覆盖实时事件
        if (state.feedBackfill) state.feedBackfill.events.push(item);
        const atTop = $('#feedList').scrollTop < 6;
        if (atTop && prependFeedEvent(item)) return; // 已增量插入(其他行只平移)
        const merged = window.VrcFeedStore.mergeEvents(state.events, [item]);
        if (merged.added) {
          state.events = merged.events;
          state.feedDataVersion++;
          state.total++;
          invalidateFeedOffsets();
          if (!state.feedRange) {
            // 空列表(新安装/清空日志后)没有渲染窗口, 增量插入不可用: 直接整窗渲染首条事件
            state.newCount = 0;
            updateFeedNew();
            renderFeed();
          } else {
            state.newCount += merged.added;
            updateFeedNew();
          }
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
        if (feedChanged) {
          state.feedDataVersion++;
          let patched = 0;
          for (const ev of state.events) {
            if (ev.world_id !== d.worldId && ev.old_world_id !== d.worldId) continue;
            const el = $('#feedList').querySelector('.feed-item[data-id="' + ev.id + '"]');
            if (el) { patchFeedRowEl(el, ev); patched++; }
          }
          if (patched) state.feedRenderedVersion = state.feedDataVersion;
          else renderFeed();
        }
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('ws-stats', (e) => {
      try {
        const d = JSON.parse(e.data);
        // 服务端每秒补推最近 3 秒: 按 sec 幂等去重, 跳秒补 0
        const r = window.VrcWsChart.ingestSample(state.wsHistory, d.sec, d.n || 0, state.wsSec);
        state.wsHistory = r.history;
        state.wsSec = r.lastSec;
        drawWsSpark();
        renderTop();
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('health', (e) => {
      try { applyHealthUi(JSON.parse(e.data)); } catch (err) { /* ignore */ }
    });
    evt.addEventListener('log', (e) => {
      if (!state.settingsOpen || !logState.inited) return;
      try {
        const d = JSON.parse(e.data);
        if (d && d.line && logMatches(d.line)) addLogLine(d.line, d.seq, false);
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('log-update', (e) => {
      try { const d = JSON.parse(e.data); if (d && d.line && d.seq != null) replaceLogRecord(d.seq, d.line); } catch (err) { /* ignore */ }
    });
    evt.addEventListener('qq-status', (e) => {
      try {
        const d = JSON.parse(e.data);
        state.status.qq = Object.assign({}, state.status.qq, d || {});
        renderTop();
      } catch (err) { /* ignore */ }
    });
    evt.addEventListener('notification', () => { loadFriends().catch(() => {}); });
    evt.addEventListener('relogin-ok', () => location.reload());
    evt.addEventListener('2fa-needed', () => openReloginModal());
    evt.addEventListener('login-progress', (e) => {
      try { bootProgress(JSON.parse(e.data)); } catch (err) { /* ignore */ }
    });
    evt.addEventListener('session-expired', () => { state.status = {}; if (evt) { evt.close(); evt = null; } showView('login'); });
    // EventSource 自动重连: 重连成功后补齐断线期间的数据(服务端不重放 friend-event)
    evt.onopen = () => {
      if (!state.sseOpened) {
        state.sseOpened = true;
        // 首次建连前产生的事件不会通过 SSE 补发: 立即补拉一次, 覆盖这段空窗
        if (state.initialLoaded) firstConnectBackfill();
        else state.pendingFirstBackfill = true;
        return;
      }
      resyncAfterReconnect();
    };
    evt.onerror = () => { /* 由断线看门狗负责提示, EventSource 自己会重连 */ };
  }

  let firstConnectBackfillStarted = false;
  // 首次 SSE 连接后的补拉: 建连前的事件已持久化, 重新拉一次动态尾部 + 好友状态。
  // 补拉响应会与「补拉期间实时到达的事件」按 id 合并(见 loadFeed 的 mergePending)。
  async function firstConnectBackfill() {
    if (firstConnectBackfillStarted || !state.initialLoaded) return;
    firstConnectBackfillStarted = true;
    state.pendingFirstBackfill = false;
    try {
      await Promise.all([
        loadFriends(),
        loadFeed(false, { keepScroll: true, mergePending: true })
      ]);
      renderTop();
    } catch (e) { /* 下一次重连 resync 会再补 */ }
  }

  // 重连补齐: 重新拉一遍状态/好友/动态尾部/日志缺口/WS 历史
  async function resyncAfterReconnect() {
    if (state.resyncing) return;
    state.resyncing = true;
    try {
      const statusRes = await api('GET', '/api/status');
      await Promise.all([loadFriends(), loadFeed(false, { keepScroll: true }), loadHealth(), loadWsHistory()]);
      state.status = statusRes.data || state.status;
      renderTop();
      renderSelf();
      if (state.settingsOpen && logState.inited) await loadLogsGap();
    } catch (e) { /* 下一次重连再试 */ }
    state.resyncing = false;
  }

  // ---------- 鼠标跟随高光(旧前端同款: 事件委托 + rAF 补间, 只维护当前悬停元素) ----------
  const SPOT_SELECTOR = '.friend, .group-title, .feed-row, .chip, .tb-btn, .mini, .card, .modal, .dd-item, .overview-item, .self-card';
  let spotRow = null;
  let spotTarget = null;
  let spotCurrent = null;
  let spotRaf = 0;
  function spotTick() {
    spotRaf = 0;
    if (!spotRow || !spotTarget || !spotCurrent) return;
    spotCurrent.x += (spotTarget.x - spotCurrent.x) * 0.24;
    spotCurrent.y += (spotTarget.y - spotCurrent.y) * 0.24;
    spotRow.style.setProperty('--mx', spotCurrent.x.toFixed(1) + 'px');
    spotRow.style.setProperty('--my', spotCurrent.y.toFixed(1) + 'px');
    if (Math.hypot(spotTarget.x - spotCurrent.x, spotTarget.y - spotCurrent.y) > 0.35) {
      spotRaf = requestAnimationFrame(spotTick);
    }
  }
  function startSpotlight() {
    document.addEventListener('pointermove', (e) => {
      const target = e.target && e.target.closest ? e.target.closest(SPOT_SELECTOR) : null;
      if (!target) {
        if (spotRow) spotRow.classList.remove('spot-on');
        spotRow = null;
        spotTarget = null;
        spotCurrent = null;
        return;
      }
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (spotRow !== target) {
        if (spotRow) spotRow.classList.remove('spot-on');
        spotRow = target;
        spotCurrent = { x, y };
        target.classList.add('spot-on');
        target.style.setProperty('--mx', x + 'px');
        target.style.setProperty('--my', y + 'px');
      }
      spotTarget = { x, y };
      if (!spotRaf) spotRaf = requestAnimationFrame(spotTick);
    });
    document.addEventListener('pointerleave', () => {
      if (spotRow) spotRow.classList.remove('spot-on');
      spotRow = null;
      spotTarget = null;
      spotCurrent = null;
    });
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
    document.addEventListener('click', (e) => { if (!e.target.closest('.push-pop') && !e.target.closest('.push-bell')) closeBellPopover(true); });
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
    // QQ 机器人: 「快速创建 QQBot」是按钮(不是链接), 点击新页面打开 QQ 开放平台
    $('#createQqBot').addEventListener('click', () => {
      window.open('https://q.qq.com/qqbot/openclaw/login.html', '_blank', 'noopener');
    });
    // 好友「强制刷新快照」
    $('#snapshotBtn').addEventListener('click', async () => {
      const btn = $('#snapshotBtn');
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('spinning');
      try {
        const r = await api('POST', '/api/monitor/snapshot', {});
        const ok = r.status < 400 && (!r.data || r.data.ok !== false);
        const n = r.data && (r.data.count != null ? r.data.count : (r.data.friends ? r.data.friends.length : null));
        toast(ok ? '快照刷新完成' + (n != null ? '（好友 ' + n + ' 人）' : '') : '快照刷新失败');
        if (ok) await loadFriends();
      } catch (e) {
        toast(e.message || '快照刷新失败');
      } finally {
        btn.disabled = false;
        btn.classList.remove('spinning');
      }
    });

    // VRChat 外链(昵称/世界名/头像): 统一走 window.open
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.ext-link[data-href]');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(link.getAttribute('data-href'), '_blank', 'noopener');
    });
    // 好友列表
    $('#friendsList').addEventListener('click', (e) => {
      if (e.target.closest('.ext-link')) return; // 外链交给上面的全局委托
      const row = e.target.closest('.friend');
      const group = e.target.closest('.group-title');
      if (group) {
        const key = group.getAttribute('data-group');
        if ($('#friendsList').classList.contains('virtual')) {
          const item = state.friendItems.find((it) => it.type === 'group' && it.key === key);
          collapsed[key] = item ? !item.collapsed : true;
          saveCollapsed();
          renderFriends();
          return;
        }
        const body = group.nextElementSibling;
        if (!body) return;
        body.classList.add('animating'); // 过渡期间裁掉溢出, 结束后展开态恢复 visible 给铃铛气泡
        const now = body.classList.toggle('collapsed');
        group.classList.toggle('collapsed', now);
        collapsed[key] = now;
        saveCollapsed();
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
        if (kind === 'bell') {
          e.stopPropagation();
          // 再点同一个铃铛 = 关闭卡片；点其它铃铛 = 换成那一行
          if (row.querySelector('.push-pop')) { closeBellPopover(true); return; }
          closeBellPopover(false);
          const f = findFriend(id);
          if (f) openBellPopover(row, f);
          return;
        }
        if (kind === 'settings') { closeBellPopover(true); openSettings(); return; }
        return;
      }
      const f = findFriend(id);
      if (!f) return;
      closeBellPopover(true);
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
      updateFriendsTop();
      if (state.friends.length > state.friendVlistAt) renderFriendsVirtual();
    });
    $('#friendsTop').addEventListener('click', () => {
      $('#friendsList').scrollTo({ top: 0, behavior: 'smooth' });
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
      const prevId = state.expanded;
      // 打开新的一条时先收起上一条(支持"已展开时再点别的行")
      if (prevId != null && prevId !== id) {
        const prevEl = $('#feedList .feed-item[data-id="' + prevId + '"]');
        if (prevEl) prevEl.classList.remove('open');
        else state.feedHeights.delete(prevId); // 已滚出窗口: 按收起态估算
      }
      if (prevId === id) {
        state.expanded = null;
        item.classList.remove('open');
      } else {
        state.expanded = id;
        item.classList.add('open');
      }
      clearTimeout(feedToggleTimer);
      feedToggleTimer = setTimeout(settleFeedToggle, 340);
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
      try {
        const r = await api('POST', '/api/test/qq', {});
        const ok = r.status < 400 && (!r.data || r.data.ok !== false);
        if (ok) flashSettings('已发送测试推送');
        else flashSettings('测试推送失败: ' + ((r.data && r.data.error) || ('HTTP ' + r.status)));
      } catch (e) { flashSettings(e.message || '测试推送失败'); }
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
          const r = await fetch(c + '/api/config', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
          if (!r.ok) continue;
          const b = await r.json();
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
  bind();
  startSpotlight();
  if (window.VrcDropdown) {
    window.VrcDropdown.makeDropdown($('#gateScheme'));
    window.VrcDropdown.makeDropdown($('#connScheme'));
  }
  startConnWatch();
  bootApp();
})();
