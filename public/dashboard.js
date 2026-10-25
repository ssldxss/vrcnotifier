'use strict';
// 新版概览页(单页): 顶部一行状态 + 好友动态(虚拟列表/就地展开) + 右侧自己/好友列表 + 设置页。
// 纯模型与各面板控制器分别维护规则和交互；此文件只负责共享状态、主题及应用装配。
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const LS_BASE = 'vrcn_base';
  const LS_TOKEN = 'vrcn_token';
  const LS_THEME = 'vrcn_theme';

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
    friendFilters: [],    // 好友筛选: [{ id, name }], 最多 5 个; 点好友行切换, 命中任一好友即显示
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
    return syncClient().avatarUrl(key);
  }
  const client = new window.VrcNotifier.Client({ baseUrl: baseUrl(), token: accessToken() });
  function syncClient() {
    client.baseUrl = baseUrl();
    client.token = accessToken();
    return client;
  }
  async function api(method, path, body, opts) {
    try {
      return await syncClient().requestResponse(method, path, { ...opts, body });
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
    // VRChat 外链(昵称/世界名/头像): 统一走 window.open
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.ext-link[data-href]');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(link.getAttribute('data-href'), '_blank', 'noopener');
    });

  }

  // Compose panels once. Cross-panel calls are callbacks to avoid initialization cycles.
  const { renderTop, renderSelf, drawWsSpark, applyHealthUi, loadHealth, loadWsHistory } = window.VrcDashboardOverview.create({
    state, $, escapeHtml, FR, avatarUrl, api
  });
  const { initLogPanel, receiveLog, loadLogsGap } = window.VrcDashboardLogs.create({
    $, state, api
  });
  const { bindFeed, loadFeed, renderFeed, receiveFeedEvent, patchFeedRowEl, toggleFriendFilter } = window.VrcDashboardFeed.create({
    escapeHtml, EM, state, $, api, $$, toast
  });
  const { bindFriends, loadFriends, renderFriends, receiveFriendState, closeBellPopover } = window.VrcDashboardFriends.create({
    escapeHtml, avatarUrl, state, FR, $, FM, api,
    loadFeed: (...args) => loadFeed(...args), toast,
    openSettings: (...args) => openSettings(...args),
    renderTop: (...args) => renderTop(...args), $$,
    toggleFriendFilter: (...args) => toggleFriendFilter(...args)
  });
  const { bindSettings, openSettings, closeSettings } = window.VrcDashboardSettings.create({
    $, api, state,
    closeBellPopover: (...args) => closeBellPopover(...args),
    initLogPanel: (...args) => initLogPanel(...args), toast,
    loadFeed: (...args) => loadFeed(...args)
  });
  const { bindSession, showView, setGateMsg, loadAll, openReloginModal, bootProgress, isBootActive, bootApp, startConnWatch } = window.VrcDashboardSession.create({
    state, $,
    loadHealth: (...args) => loadHealth(...args), accessToken,
    connectEvents: (...args) => connectEvents(...args), baseUrl, LS_BASE, LS_TOKEN, api,
    renderTop: (...args) => renderTop(...args),
    renderSelf: (...args) => renderSelf(...args),
    loadFriends: (...args) => loadFriends(...args),
    loadFeed: (...args) => loadFeed(...args),
    loadWsHistory: (...args) => loadWsHistory(...args),
    firstConnectBackfill: (...args) => firstConnectBackfill(...args), applyTheme, LS_THEME
  });
  const { connectEvents, firstConnectBackfill, disconnectEvents } = window.VrcDashboardEvents.create({
    syncClient, state,
    renderTop: (...args) => renderTop(...args),
    renderSelf: (...args) => renderSelf(...args),
    isBootActive: (...args) => isBootActive(...args),
    loadAll: (...args) => loadAll(...args),
    receiveFriendState: (...args) => receiveFriendState(...args),
    receiveFeedEvent: (...args) => receiveFeedEvent(...args),
    loadFriends: (...args) => loadFriends(...args),
    renderFriends: (...args) => renderFriends(...args), $,
    patchFeedRowEl: (...args) => patchFeedRowEl(...args),
    renderFeed: (...args) => renderFeed(...args),
    drawWsSpark: (...args) => drawWsSpark(...args),
    applyHealthUi: (...args) => applyHealthUi(...args),
    receiveLog: (...args) => receiveLog(...args),
    openReloginModal: (...args) => openReloginModal(...args),
    bootProgress: (...args) => bootProgress(...args),
    showView: (...args) => showView(...args),
    loadFeed: (...args) => loadFeed(...args), api,
    loadHealth: (...args) => loadHealth(...args),
    loadWsHistory: (...args) => loadWsHistory(...args),
    loadLogsGap: (...args) => loadLogsGap(...args)
  });

  bindFriends();
  bindFeed();
  bindSettings();
  bindSession();
  bind();
  startSpotlight();
  if (window.VrcDropdown) {
    window.VrcDropdown.makeDropdown($('#gateScheme'));
    window.VrcDropdown.makeDropdown($('#connScheme'));
  }
  startConnWatch();
  bootApp();
})();
