'use strict';
// Dashboard events controller. Dependencies are explicit; local UI state stays private.
window.VrcDashboardEvents = {
  create(context) {
    const { syncClient, state, renderTop, renderSelf, isBootActive, loadAll, receiveFriendState, receiveFeedEvent, loadFriends, renderFriends, $, patchFeedRowEl, renderFeed, drawWsSpark, applyHealthUi, receiveLog, openReloginModal, bootProgress, showView, loadFeed, api, loadHealth, loadWsHistory, loadLogsGap } = context;
    let evt = null;
    function connectEvents() {
      const want = syncClient().eventsUrl();
      if (evt && evt.url === want) return;
      disconnectEvents();
      const handlers = {};
      handlers['status'] = (data) => {
        try {
          state.status = data;
          renderTop();
          renderSelf();
          // 后端重启等场景: 自动登录完成前可能短暂 401 切到登录页, 登录态恢复后自动回主界面
          if (state.status.loggedIn && state.view === 'login' && !state.loginWaiting && !isBootActive()) loadAll().catch(() => {});
        } catch (err) { /* ignore */ }
      };
      handlers['friend-state'] = (data) => receiveFriendState(data);
      handlers['friend-event'] = (data) => receiveFeedEvent(data);
      handlers['snapshot'] = () => { loadFriends(); };
      handlers['world-name'] = (data) => {
        try {
          const d = data;
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
      };
      handlers['ws-stats'] = (data) => {
        try {
          const d = data;
          // 服务端每秒补推最近 3 秒: 按 sec 幂等去重, 跳秒补 0
          const r = window.VrcWsChart.ingestSample(state.wsHistory, d.sec, d.n || 0, state.wsSec);
          state.wsHistory = r.history;
          state.wsSec = r.lastSec;
          drawWsSpark();
          renderTop();
        } catch (err) { /* ignore */ }
      };
      handlers['health'] = (data) => {
        try { applyHealthUi(data); } catch (err) { /* ignore */ }
      };
      handlers['log'] = (data) => receiveLog(data);
      handlers['log-update'] = (data) => receiveLog(data, true);
      handlers['qq-status'] = (data) => {
        try {
          const d = data;
          state.status.qq = Object.assign({}, state.status.qq, d || {});
          renderTop();
        } catch (err) { /* ignore */ }
      };
      handlers['notification'] = () => { loadFriends().catch(() => {}); };
      handlers['relogin-ok'] = () => location.reload();
      handlers['2fa-needed'] = () => openReloginModal();
      handlers['login-progress'] = (data) => {
        try { bootProgress(data); } catch (err) { /* ignore */ }
      };
      handlers['session-expired'] = () => { state.status = {}; disconnectEvents(); showView('login'); };
      // EventSource 自动重连: 重连成功后补齐断线期间的数据(服务端不重放 friend-event)
      const onOpen = () => {
        if (!state.sseOpened) {
          state.sseOpened = true;
          // 首次建连前产生的事件不会通过 SSE 补发: 立即补拉一次, 覆盖这段空窗
          if (state.initialLoaded) firstConnectBackfill();
          else state.pendingFirstBackfill = true;
          return;
        }
        resyncAfterReconnect();
      };
      evt = syncClient().subscribeEvents({ onOpen, onEvent: (type, data) => {
        if (handlers[type]) handlers[type](data);
      } });
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
        if (state.settingsOpen) await loadLogsGap();
      } catch (e) { /* 下一次重连再试 */ }
      state.resyncing = false;
    }


    function disconnectEvents() {
      if (evt) evt.close();
      evt = null;
    }

    return { connectEvents, firstConnectBackfill, disconnectEvents };
  }
};
