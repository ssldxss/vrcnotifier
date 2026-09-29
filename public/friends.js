'use strict';
// 好友列表与监控配置: 好友行渲染 / 分组折叠 / 入场动画 / 特别关注切换 / 上下线动效 / 悬停高光 / 搜索。
// 从 app.js 拆出; 分组/搜索/排序/指纹的纯逻辑在 friendmodel.js(有单测)。
// 本文件仍是传统脚本、函数保持全局, 所以 app.js 里的调用点无需改动。

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

// 头像+VRCX 圆点+状态行: 好友行与页面标题栏"我"共用。
// 头像/昵称/世界名都点开对应 VRChat 网页(见 vrclinks.js); id 不合法时那里会自动退化为纯文本。
function personParts(p) {
  const userId = p.friend_vrchat_id || p.vrchat_user_id || null;
  const initial = escapeHtml((p.display_name || '?').charAt(0).toUpperCase());
  const avatarInner = p.avatarKey
    ? "<img class=avatar src='" + avatarUrl(p.avatarKey) + "' loading='lazy' alt='' onerror=\"this.style.display='none';this.nextElementSibling.style.display='flex'\"><div class='avatar-fallback'>" + initial + '</div>'
    : "<div class='avatar-fallback' style='display:flex'>" + initial + '</div>';
  // img 与字首兜底必须同处一个 <a> 内且保持相邻 —— onerror 依赖 nextElementSibling 找到兜底
  const avatarHtml = VrcLinks.wrapHtml('user', userId, avatarInner);
  const statusCls = 'status-' + String(p.status || 'active').replace(/\s+/g, '');
  const wrapCls = 'st-' + (p.state || 'offline') + ' ' + statusCls;
  const worldTxt = p.world_id === 'private' ? '私密世界' : (p.world_name || '');
  // 世界名可点开世界页; 名字还没到(或 private/离线)时那段文字本来就是空的, 无可点内容
  const worldHtml = worldTxt ? VrcLinks.linkHtml('world', p.world_id, worldTxt) : '';
  const descHtml = p.status_description ? escapeHtml(p.status_description) : '';
  const stateInner = [worldHtml, descHtml].filter(Boolean).join(' · ');
  return {
    avatarWrap: "<div class='avatar-wrap " + wrapCls + "'>" + avatarHtml + '</div>',
    name: VrcLinks.linkHtml('user', userId, p.display_name || p.friend_vrchat_id || p.vrchat_user_id || '?'),
    nameCls: p.trust_level ? ' ' + (TRUST_CLASS[p.trust_level] || '') : '',
    stateHtml: stateInner ? "<div class='state'>" + stateInner + '</div>' : ''
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
const FADE_CAP = 30;   // 阶梯上限: 好友再多也约 1s 内全部入场
const ENTER_MAX = 120; // 只给"可能出现在首屏"的元素打入场标记; 几百行以后都在屏幕外, 给了也看不见
function markFriendsEntrance() {
  const list = $('#friendsList');
  const els = list.querySelectorAll('.group-title, .friend');
  els.forEach((el, idx) => {
    if (idx >= ENTER_MAX) return; // 屏幕外: 不启动动画(5000 行时少 4880 个同时播放的动画)
    el.classList.add('enter');
    el.style.setProperty('--i', String(Math.min(idx, FADE_CAP)));
  });
  const footer = document.querySelector('.site-mark');
  if (footer) footer.style.setProperty('--i', String(Math.min(els.length, FADE_CAP) + 1));
}
// 折叠组里的行, 入场动画在首屏那一帧就播完了(被 overflow:hidden 裁着, 人眼看不到), 展开时补播一遍 ——
// 否则屏幕上只有容器在动, 行是"啪"地出现(容器那 0.3s 的前段全花在屏幕外, 详见 docs 待办 #13)。
// 必须先 remove → 强制重排 → add: 同一元素上的同名动画不做一次重排是不会重播的。
// 只补播前 FADE_CAP + 1 行: 视口里只看得到最前面几行, 而 --i 到 FADE_CAP 就封顶, 再往后的行延迟完全一样。
function replayGroupEntrance(body) {
  const rows = body.querySelectorAll('.friend');
  const n = Math.min(rows.length, FADE_CAP + 1);
  if (!n) return;
  for (let k = 0; k < n; k++) rows[k].classList.remove('enter');
  void body.offsetWidth; // 一次强制重排, 让上面的 remove 落到计算样式上
  for (let k = 0; k < n; k++) {
    rows[k].classList.add('enter');
    rows[k].style.setProperty('--i', String(k));
  }
}
let friendsEntered = false; // 好友列表入场动画只在首次渲染播放(快照/搜索重渲染不重播)
let lastRenderSig = null;   // renderFriends 的输入指纹: 输入没变就不重建 DOM

// ---------- 虚拟列表: 只把视口附近的行放进 DOM ----------
// 分组标题/组体常驻, 组内没渲染的部分由 .group-inner 的 ::before/::after 撑出等高空白(见 app.css),
// 所以**静止时页面总高与"全量渲染"一致**。代价: 依赖绝对位置的飞行动画没有了 ——
// 位置变化一律改成淡入淡出, 且只有渲染出来的行(即"显示的部分")才有动画。
const V = window.VrcVList;   // 纯计算在 public/vlist.js(有单测)
const V_OVERSCAN_PX = 600;   // 视口上下各多渲染这么多像素(快速滚动不露白)
const V_EST_ROW_H = 61;      // 未测量行的兜底高(实测 60/61/63.58/62.58, 61 最常见)
const V_FADE_IN_MS = 180;    // 行淡入时长(与 CSS 的 .v-in 一致)
const V_FADE_OUT_MS = 150;   // 行淡出时长(与 CSS 的 .v-out 一致)
const vRowHeights = new Map();   // friendId -> 实测行高(px)
const vSum = { sum: 0, count: 0 }; // 已测量行的均值统计, 给未测量行当估计
const vRendered = new Map();     // groupKey -> { from, to }
let vModel = null;               // { groups: [{ key, ids, collapsed, titleEl, body, inner, offsets, total }] }
let vByFriend = new Map();       // friendId -> 好友对象(渲染窗口时按 id 取)
let vUpdateRaf = 0;

function vRowHeight(id) {
  const h = vRowHeights.get(id);
  if (h !== undefined) return h;
  return V.estimateHeight({ sum: vSum.sum, count: vSum.count, fallback: V_EST_ROW_H });
}
// 任何行高变化都要让所有组的前缀和失效 —— 漏了就会用过期偏移量算占位高度,
// 表现为某个组凭空少一行的高度(实测差 60px)。宁可重建也不要用脏数据。
function vInvalidateOffsets() {
  if (!vModel) return;
  for (const g of vModel.groups) g.offsets = null;
}

// 前缀和按需构建并缓存: 只有实测高变化时才失效重建
function vOffsets(g) {
  if (!g.offsets) {
    // 缓存里存的是"带下边框"的内容高(渲染窗口不同也不会变); 而真实列表里每组的末行没有下边框
    // (CSS: .friend:last-child), 少 1px —— 在这里一次性应用, 之后前缀和就是"生效高度"。
    const hs = g.ids.map(vRowHeight);
    if (hs.length) hs[hs.length - 1] = Math.max(0, hs[hs.length - 1] - 1);
    g.offsets = V.buildOffsets(hs);
    g.total = g.offsets[hs.length];
  }
  return g.offsets;
}

// 单行 HTML(与拆分前逐字节一致; moreAfter: 后面还有没渲染的行, 需要补回分隔线)
function renderRow(f, moreAfter) {
  const c = f.config || {};
  const isOn = (v) => v === 1; // 小开关默认关闭
  const p = personParts(f);
  return '<div class="friend' + (moreAfter ? ' v-more' : '') + '" data-id="' + escapeAttr(f.friend_vrchat_id) + '">' +
    p.avatarWrap +
    '<label class=switch title=特别关注><input type=checkbox class=favorite' + (c.favorite ? ' checked' : '') + '><span class=slider></span></label>' +
    '<div class="name' + p.nameCls + '">' + p.name + p.stateHtml + '</div>' +
    '<div class=checks>' +
    '<label><input type=checkbox data-k=notify_online' + (isOn(c.notify_online) ? ' checked' : '') + '>上线</label>' +
    '<label><input type=checkbox data-k=notify_offline' + (isOn(c.notify_offline) ? ' checked' : '') + '>下线</label>' +
    '<label><input type=checkbox data-k=notify_status_change' + (isOn(c.notify_status_change) ? ' checked' : '') + '>状态</label>' +
    '<label><input type=checkbox data-k=notify_world_change' + (isOn(c.notify_world_change) ? ' checked' : '') + '>世界</label>' +
    '</div></div>';
}

// 把 [from, to] 这些行放进 DOM, 其余高度交给首尾空白(一行都不渲染时整组高度挂顶部)
function vPaintWindow(g, from, to) {
  const off = vOffsets(g);
  const sp = V.spacersFor({ offsets: off, from, to });
  g.inner.style.setProperty('--vtop', sp.before + 'px');
  g.inner.style.setProperty('--vbot', sp.after + 'px');
  if (to < from) {
    g.inner.innerHTML = '';
    vRendered.set(g.key, { from: 0, to: -1 });
    return;
  }
  const html = [];
  for (let i = from; i <= to; i++) {
    const f = vByFriend.get(g.ids[i]);
    if (f) html.push(renderRow(f, i === to && to < g.ids.length - 1));
  }
  g.inner.innerHTML = html.join('');
  vRendered.set(g.key, { from, to });
}

// 按当前滚动位置重算每个组的窗口。折叠组不动它 —— 它的高度是 0, 内容留着由容器过渡裁剪。
function vUpdate(force) {
  if (!vModel) return;
  const list = $('#friendsList');
  if (!list) return;
  const vh = window.innerHeight || 800;
  const st = window.scrollY || document.documentElement.scrollTop || 0;
  let y = list.getBoundingClientRect().top + st;
  const painted = [];
  for (const g of vModel.groups) {
    const cs = getComputedStyle(g.titleEl);
    y += (parseFloat(cs.marginTop) || 0) + g.titleEl.getBoundingClientRect().height + (parseFloat(cs.marginBottom) || 0);
    if (g.collapsed) continue; // 折叠: 不渲染也不动它(留给容器过渡)
    const off = vOffsets(g);
    const range = V.visibleRange({ offsets: off, groupTop: y, scrollTop: st, viewportH: vh, overscan: V_OVERSCAN_PX });
    y += g.total;
    const want = range || { from: 0, to: -1 };
    const cur = vRendered.get(g.key);
    if (force || !cur || cur.from !== want.from || cur.to !== want.to) {
      vPaintWindow(g, want.from, want.to);
      painted.push(g);
    }
  }
  if (painted.length) vMeasure(painted);
}

// 量已渲染的行高: 首次实测入库, 有变化就重建前缀和并把首尾空白同步过来
function vMeasure(groups) {
  for (const g of groups) {
    const cur = vRendered.get(g.key);
    if (!cur || cur.to < cur.from) continue;
    let changed = false;
    for (const el of g.inner.querySelectorAll('.friend')) {
      const id = el.dataset.id;
      // 列表此刻不可见时(切到设置页/页面隐藏) getBoundingClientRect 全是 0。
      // 必须在**补 1px 之前**判掉: 否则 0 + 1 = 1 会绕过守卫, 把 1px 当成行高缓存进去,
      // 该组就凭空少一行高度(实测整整少 60px)。
      const raw = el.getBoundingClientRect().height;
      if (!(raw > 0)) continue;
      // 渲染窗口的末行可能是 :last-child(没有下边框) —— 补回那 1px, 让缓存只表示"内容高"。
      // 但带 .v-more 的行分隔线已经被补回来了, 不能再加。
      const isLastChild = el === el.parentElement.lastElementChild && !el.classList.contains('v-more');
      const h = raw + (isLastChild ? 1 : 0);
      const prev = vRowHeights.get(id);
      if (prev === undefined) { vRowHeights.set(id, h); vSum.sum += h; vSum.count++; changed = true; }
      else if (Math.abs(prev - h) > 0.02) { vSum.sum += h - prev; vRowHeights.set(id, h); changed = true; }
    }
    if (!changed) continue;
    g.offsets = null; // 本组失效
    const sp = V.spacersFor({ offsets: vOffsets(g), from: cur.from, to: cur.to });
    g.inner.style.setProperty('--vtop', sp.before + 'px');
    g.inner.style.setProperty('--vbot', sp.after + 'px');
  }
}

// 首屏把**每一行**的真实高度量一遍(挂在屏幕外、visibility:hidden, 量完立刻丢弃)。
// 为什么要付这个代价: 占位空白 = 未渲染行高之和, 用估计值累计的偏差会让可见行整体偏移
// (实测: 只用均值估计时, 展开后的离线组可见行整体偏 ~22px)。量一遍后每行都是实测值,
// 占位高度与真实布局逐像素一致, 静止时的位置/尺寸才与"全量渲染"完全相同。
// 行高只跟内容有关, 量一次可长期复用; 内容变了(如世界名解析出来)由 vMeasure 单独修正。
function vMeasureAll() {
  if (!vModel) return;
  if (!vModel.groups.some((g) => g.ids.some((id) => !vRowHeights.has(id)))) return; // 都量过了
  const list = $('#friendsList');
  // 用真实的小数宽度: 取整会改变换行, 个别行会差 1px
  const width = Math.max(1, list.getBoundingClientRect().width);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;width:' + width + 'px';
  document.body.appendChild(host);
  try {
    for (const g of vModel.groups) {
      const wrap = document.createElement('div');
      // 末尾塞一个占位元素: 让 .friend 都不是 :last-child —— 保证量到的是"带下边框"的高度
      // 已经因为 CSS(.friend:last-child 无下边框) 少了 1px, 再统一扣一次就重复了
      wrap.innerHTML = g.ids.map((id) => { const f = vByFriend.get(id); return f ? renderRow(f, false) : ''; }).join('') + '<i></i>';
      host.appendChild(wrap);
      for (const el of wrap.querySelectorAll('.friend')) {
        const h = el.getBoundingClientRect().height;
        if (h > 0) vRowHeights.set(el.dataset.id, h); // 量不到就别记(见 vMeasure 里的同款说明)
      }
    }
  } finally {
    host.remove();
  }
  vInvalidateOffsets(); // 量到的新高度要立刻生效
}

// 滚动/尺寸变化时重算窗口(每帧最多一次)
window.addEventListener('scroll', () => {
  if (vUpdateRaf) return;
  vUpdateRaf = requestAnimationFrame(() => { vUpdateRaf = 0; vUpdate(false); });
}, { passive: true });
window.addEventListener('resize', () => vUpdate(true));

function renderFriends() {
  const list = $('#friendsList');
  const FM = window.VrcFriendModel; // 分组/搜索/排序/指纹的纯逻辑(public/friendmodel.js, 有单测)
  // 指纹 = 搜索词 + 折叠状态 + 好友数据。算一次约 4ms, 而重建整页 DOM 更贵 —— 一样就没必要重建。
  const sig = FM.renderSignature(friendsCache, searchQuery, groupCollapsed);
  if (sig === lastRenderSig) return;
  const pool = FM.filterPool(friendsCache, searchQuery);
  if (!pool.length) {
    list.innerHTML = '<p class=muted>' + (friendsCache.length ? '没有匹配的好友。' : '暂无好友数据, 点击上方「刷新」拉取。') + '</p>';
    $('#friendsCount').textContent = friendsCache.length ? '共 ' + friendsCache.length + ' 人' : '';
    vModel = null;
    vRendered.clear();
    lastRenderSig = sig;
    return;
  }
  $('#friendsCount').textContent = '共 ' + friendsCache.length + ' 人';
  list.innerHTML = '';
  vRendered.clear();
  vByFriend = new Map(friendsCache.map((f) => [f.friend_vrchat_id, f]));
  vModel = { groups: [] };
  const { fav: favList, online: onlineOthers, active: activeOthers, offline: offlineOthers } = FM.splitGroups(friendsCache, searchQuery);
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
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
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
    body.appendChild(inner);
    list.appendChild(g);
    list.appendChild(body);
    const model = { key, ids: list2.map((f) => f.friend_vrchat_id), collapsed, titleEl: g, body, inner, offsets: null, total: 0 };
    vModel.groups.push(model);
    btn.addEventListener('click', () => {
      const nowCollapsed = body.classList.toggle('collapsed');
      g.classList.toggle('collapsed', nowCollapsed);
      btn.title = nowCollapsed ? '展开' : '收起';
      btn.setAttribute('aria-label', btn.title);
      groupCollapsed[key] = nowCollapsed;
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(groupCollapsed)); } catch (e) {}
      model.collapsed = nowCollapsed;
      vUpdate(true); // 折叠/展开都要立刻重算窗口(展开时把视口内的行补上)
      if (!nowCollapsed) replayGroupEntrance(body); // 展开时补播行级入场(收起方向本来就看得见)
    });
  };
  if (favList.length) addGroup('fav', '⭐ 特别关注 (' + favList.length + ')', favList);
  if (onlineOthers.length) addGroup('online', '在线 (' + onlineOthers.length + ')', onlineOthers);
  if (activeOthers.length) addGroup('active', '网页在线 (' + activeOthers.length + ')', activeOthers);
  if (offlineOthers.length) addGroup('offline', '离线 (' + offlineOthers.length + ')', offlineOthers);
  vMeasureAll(); // 先把每行真实高量一遍(占位空白必须与真实布局逐像素一致)
  vUpdate(true); // 再按视口渲染窗口, 最后给这些行打入场标记
  // 首次渲染: 按 DOM 顺序(从上到下)给分组标题和每一行好友编号, 依次淡入(虚拟化后只有视口附近的行)
  if (!friendsEntered) { markFriendsEntrance(); friendsEntered = true; }
  lastRenderSig = sig; // 渲染成功才记账: 中途抛错时下次仍会重建
}

// ---------- 位置变化 → 淡入淡出(替代原来的 FLIP 飞行) ----------
// 只有"已经渲染出来的行"才有动画 —— 不在窗口里的行没有 DOM, 无从播起(这正是"只有显示的部分才有动画")。
function vRowEls() {
  const m = new Map();
  $('#friendsList').querySelectorAll('.friend').forEach((el) => m.set(el.dataset.id, el));
  return m;
}
function vFade(ids, cls) {
  const els = vRowEls();
  for (const id of ids) {
    const el = els.get(id);
    if (!el || el.classList.contains(cls)) continue;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }
}
function vFadeIn(ids) { vFade(ids, 'v-in'); }
function vFadeOut(ids) { vFade(ids, 'v-out'); }

// 当前每个好友在哪个组(用于判断"换组")
function currentGroupMap() {
  const m = {};
  if (vModel) for (const g of vModel.groups) for (const id of g.ids) m[id] = g.key;
  return m;
}
// 数据里的分组(与渲染同一套规则: 走 splitGroups, 免得分组语义漂移)
function groupsFromData(data) {
  const m = {};
  const split = window.VrcFriendModel.splitGroups(data, '');
  for (const key of ['fav', 'online', 'active', 'offline']) for (const f of split[key]) m[f.friend_vrchat_id] = key;
  return m;
}
// 目标分组若处于折叠状态则先展开, 并持久化到 localStorage
function expandGroupFor(f) {
  const key = window.VrcFriendModel.groupOf(f);
  if (groupCollapsed[key]) {
    groupCollapsed[key] = false;
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(groupCollapsed)); } catch (e) { /* ignore */ }
  }
}

// ---------- 上下线实时更新: 换组的行淡出→重绘→淡入, 未换组的行状态文案翻动 ----------
let notifyMotionTimer = null;
function scheduleNotifyRefresh() {
  if (notifyMotionTimer) clearTimeout(notifyMotionTimer);
  notifyMotionTimer = setTimeout(() => {
    notifyMotionTimer = null;
    refreshFriendsWithMotion();
  }, 200); // 合并突发通知, 避免动画互相打断
}
// 状态文案翻动: 旧文案向上滚出、新文案从下方滚入(与「平均 x 次/分钟」同款观感)。
// 必须收 HTML 而不是文本: 状态行里可能含世界名链接, 用 textContent 回写会把 <a> 抹成纯文本。
function rollStateText(row, newHtml, newTxt, oldHtml, oldTxt) {
  const st = row.querySelector('.state');
  if (!st || oldTxt === newTxt) return;
  st.innerHTML = "<span class='st-roll st-new'>" + newHtml + "</span><span class='st-roll st-old'>" + oldHtml + '</span>';
  const newEl = st.querySelector('.st-new');
  if (newEl) newEl.addEventListener('animationend', () => { st.innerHTML = newHtml; }, { once: true });
}
function refreshFriendsWithMotion() {
  const before = currentGroupMap();
  const beforeText = new Map();
  $('#friendsList').querySelectorAll('.friend').forEach((r) => {
    const st = r.querySelector('.state');
    beforeText.set(r.dataset.id, { txt: st ? st.textContent : '', html: st ? st.innerHTML : '' });
  });
  api('GET', '/api/friends').then(async (res) => {
    const data = res && res.data ? res.data.friends : null;
    if (!data) return;
    const ch = V.groupChanges(before, groupsFromData(data));
    const leaving = ch.moved.concat(ch.left);
    if (leaving.length) { vFadeOut(leaving); await new Promise((r) => setTimeout(r, V_FADE_OUT_MS)); }
    friendsCache = data;
    renderFriends();
    if (ch.moved.length) vFadeIn(ch.moved);      // 换组的: 在新位置淡入(不在窗口里的自然没有动画)
    if (ch.entered.length) vFadeIn(ch.entered);  // 新出现的
    // 没换组的行: 世界/社交状态文案变化 → 上下翻动(与位置无关, 保留)
    const skipped = new Set([...ch.moved, ...ch.entered, ...ch.left]);
    for (const r of $('#friendsList').querySelectorAll('.friend')) {
      const id = r.dataset.id;
      if (skipped.has(id)) continue;
      const info = beforeText.get(id);
      if (!info) continue;
      const st = r.querySelector('.state');
      const newTxt = st ? st.textContent : '';
      const newHtml = st ? st.innerHTML : '';
      // 比较用纯文本(只有 href 变化时不白播一次动画), 渲染用 HTML(保住世界名链接)
      if (info.txt !== newTxt) rollStateText(r, newHtml, newTxt, info.html, info.txt);
    }
  }).catch(() => {});
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
    // 乐观更新 + 位置变化淡入淡出(原来的 FLIP 飞行已按虚拟列表的要求换掉)
    const fromKey = row.closest('.group-body') ? row.closest('.group-body').dataset.group : null;
    cur.config = { ...c, favorite: body.favorite ? 1 : 0 }; // 注意用 0/1: 渲染按 === 1 分组, 布尔值会导致不重排
    expandGroupFor(cur); // 目标分组折叠时先展开, 否则行落在被裁剪的隐藏区域, 看不到
    const toKey = window.VrcFriendModel.groupOf(cur);
    const apply = () => {
      renderFriends();
      vFadeIn([id]);
      const el = $('#friendsList').querySelector('.friend[data-id="' + id + '"]');
      if (el) { el.classList.add('fav-spot'); setTimeout(() => el.classList.remove('fav-spot'), 800); }
    };
    if (fromKey !== toKey) { vFadeOut([id]); setTimeout(apply, V_FADE_OUT_MS); }
    else apply();
  }
  const r = await api('PUT', '/api/friends/' + encodeURIComponent(id) + '/config', body);
  if (r.data.ok) {
    cur.config = r.data.config;
    // 注意: 这里不再重渲染 —— 乐观渲染已把行放到正确分组, 重渲染会打断正在进行的淡入
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

