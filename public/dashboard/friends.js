'use strict';
// Dashboard friends controller. Dependencies are explicit; local UI state stays private.
window.VrcDashboardFriends = {
  create(context) {
    const { escapeHtml, avatarUrl, state, FR, $, FM, api, loadFeed, toast, openSettings, renderTop, $$, syncFilterChips, showFriendChip } = context;
    // ---------- 好友列表 ----------
    const TRUST_GROUPS = window.VrcFriendLayout.GROUPS;
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
    const BELL_LABELS = window.VrcContracts.FRIEND_CONFIG.filter(([key]) => key !== 'favorite');

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
    async function toggleFavorite(id) {
      const f = findFriend(id);
      if (!f) return;
      const want = f.config && f.config.favorite === 1 ? 0 : 1;
      try {
        const r = await api('PUT', '/api/friends/' + encodeURIComponent(id) + '/config', { favorite: want });
        if (r.data && r.data.ok) {
          const current = findFriend(id);
          if (current) current.config = r.data.config || Object.assign({}, current.config, { favorite: want });
          if (updateFavoriteIds() && state.favoriteOnly) loadFeed(false);
          renderFriends();
        } else toast((r.data && r.data.error) || '保存失败');
      } catch (e) { toast(e.message || '保存失败'); }
    }

    function bellPopoverHtml(f) {
      const cfg = f.config || {};
      const on = (k) => cfg[k] === 1;
      return (
        '<div class="push-pop"><div class="pp-head"><span class="pp-title">推送设置</span><span class="pp-who">' + escapeHtml(f.display_name) + '</span></div>' +
        BELL_LABELS.map(([key, , label]) =>
          '<div class="pp-row"><span>' + label + '</span><label class="switch"><input type="checkbox" data-k="' + key + '"' + (on(key) ? ' checked' : '') + '><span class="slider"></span></label></div>'
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
        if (!key) return;
        try {
          // 请求和响应统一使用 snake_case
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
    function closeBellPopover(animate) {
      $$('.push-pop').forEach((el) => {
        if (!animate) { el.remove(); return; }
        if (el.classList.contains('closing')) return;
        el.classList.add('closing');
        setTimeout(() => el.remove(), 180);
      });
    }

    function updateFavoriteIds() {
      const next = new Set(state.friends.filter((f) => f.config && f.config.favorite === 1).map((f) => f.friend_vrchat_id));
      const changed = next.size !== state.favorites.size || [...next].some((id) => !state.favorites.has(id));
      state.favorites = next;
      return changed;
    }
    function receiveFriendState(update) {
      if (state.friendBackfill) state.friendBackfill.push(update);
      state.friends = FM.applyFriendState(state.friends, update);
      if (updateFavoriteIds() && state.favoriteOnly) loadFeed(false);
      renderFriends();
      renderTop();
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


    function bindFriends() {
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

      document.addEventListener('click', (e) => { if (!e.target.closest('.push-pop') && !e.target.closest('.push-bell')) closeBellPopover(true); });
    }

    return { bindFriends, loadFriends, renderFriends, receiveFriendState, closeBellPopover };
  }
};
