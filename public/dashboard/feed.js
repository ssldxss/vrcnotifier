'use strict';
// Dashboard feed controller. Dependencies are explicit; local UI state stays private.
window.VrcDashboardFeed = {
  create(context) {
    const { escapeHtml, EM, state, $, api, $$ } = context;
    const FEED_PAGE = 100;
    const FEED_DOM_MAX = 80;
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

    function receiveFeedEvent(item) {

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
      const anchor = captureFeedAnchor();
      const merged = window.VrcFeedStore.mergeEvents(state.events, [item]);
      if (merged.added) {
        state.events = merged.events;
        state.feedDataVersion++;
        state.total++;
        invalidateFeedOffsets();
        restoreFeedAnchor(anchor);
        if (!state.feedRange) {
          // 空列表(新安装/清空日志后)没有渲染窗口, 增量插入不可用: 直接整窗渲染首条事件
          state.newCount = 0;
          updateFeedNew();
          renderFeed();
        } else {
          renderFeed();
          state.newCount += merged.added;
          updateFeedNew();
        }
      }
    }

    function captureFeedAnchor() {
      const list = $('#feedList');
      if (!state.events.length || list.scrollTop < 6) return null;
      const offsets = feedOffsets();
      const index = window.VrcVList.indexAt(offsets, list.scrollTop);
      return { id: state.events[index].id, delta: list.scrollTop - offsets[index] };
    }
    function restoreFeedAnchor(anchor) {
      if (!anchor) return;
      const index = state.events.findIndex((event) => event.id === anchor.id);
      if (index >= 0) $('#feedList').scrollTop = feedOffsets()[index] + anchor.delta;
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
      if (!older) state.feedBackfill = { reqId, events: [] };
      const anchor = opts && opts.keepScroll ? captureFeedAnchor() : null;
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
          state.total = (d.total ?? incoming.length) + extraTotal;
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
        restoreFeedAnchor(anchor);
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


    function bindFeed() {
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

    }

    return { bindFeed, loadFeed, renderFeed, receiveFeedEvent, patchFeedRowEl, syncFilterChips, showFriendChip };
  }
};
