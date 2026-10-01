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

// ---------- 虚拟列表(virt-list 式: 双层范围 + 节点复用 + 滚动路径零布局读取) ----------
// 分组标题/组体常驻, 组内没渲染的部分由 .group-inner 的 ::before/::after 撑出等高空白,
// 所以**静止时页面总高与"全量渲染"逐像素一致**。
// 三条关键点(照着 kolarorz/virt-list 的思路改的, 之前每次跨行都 innerHTML 重建整窗, 动画必被打断):
//   1. 双层范围: inView(严格可见) 与 range(可见 ± buffer)。先比 inView, 再比 range ——
//      两层都没变就一个节点都不动, 滚动过程中大部分帧 DOM 完全静止。
//   2. 节点复用: 窗口平移时只增删两端差集, 中间节点原地保留(DOM 节点就是动画载体, 重建即丢动画)。
//   3. 滚动路径零布局读取: 列表位置/标题高度缓存在 vLayout, 行高靠 ResizeObserver 回调更新,
//      滚动时只读 window.scrollY。
const V = window.VrcVList;    // 纯计算在 public/vlist.js(有单测)
const V_BUFFER_ROWS = 12;     // 渲染范围在可见范围外各多留几行
const V_EST_ROW_H = 61;       // 未测量行的兜底高(实测 60/61/63.58/62.58, 61 最常见)
const V_FADE_IN_MS = 180;     // 行淡入时长(与 CSS 的 .v-in 一致)
const V_FADE_OUT_MS = 150;    // 行淡出时长(与 CSS 的 .v-out 一致)
const vRowHeights = new Map();     // friendId -> 实测行高(存"带下边框的内容高", 与渲染窗口无关)
const vSum = { sum: 0, count: 0 }; // 已测量行的均值统计, 给未测量行当估计
let vModel = null;                 // { groups: [{ key, ids, collapsed, titleEl, body, inner, offsets, total, nodes, rendered, inView, range }] }
let vByFriend = new Map();         // friendId -> 好友对象(渲染窗口时按 id 取)
let vUpdateRaf = 0;
let vLayout = null;                // 缓存的几何: { listTopDoc, mt[], mb[], titleH[] } —— 滚动时不再读布局
let vMeasuredWidth = 0;            // 量行高时用的列表宽度; 宽度变了(窗口缩放)所有行高都要重量
let vLastScrollUsed = -1;          // 上一次 vUpdate 实际用到的 scrollY(重绘后据此判断要不要按原位置重算)

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

// 把单行 HTML 变成节点(只给"新进窗口"的行用; 复用旧节点才是常态)
const vRowTmp = document.createElement('div');
function vRowNode(f, moreAfter) {
  vRowTmp.innerHTML = renderRow(f, moreAfter);
  const el = vRowTmp.firstElementChild;
  vRowTmp.removeChild(el);
  return el;
}

// 缓存列表在文档里的位置 + 各分组标题的高度与上下外边距。
// 这些只在重排时变, 滚动时不用再读 —— 这是"滚动不卡"的关键之一(getComputedStyle + rect 会强制重排)。
function vCacheLayout() {
  const list = $('#friendsList');
  if (!vModel || !list) { vLayout = null; return; }
  const st = window.scrollY || document.documentElement.scrollTop || 0;
  const mt = []; const mb = []; const titleH = [];
  for (const g of vModel.groups) {
    const cs = getComputedStyle(g.titleEl);
    mt.push(parseFloat(cs.marginTop) || 0);
    mb.push(parseFloat(cs.marginBottom) || 0);
    titleH.push(g.titleEl.getBoundingClientRect().height);
  }
  vLayout = { listTopDoc: list.getBoundingClientRect().top + st, mt, mb, titleH };
}

// 窗口 => DOM。核心是"只动差集": 复用窗口里仍然存在的节点(保住正在播的动画), 只删离开的、建进来的。
function vPatchWindow(g, range) {
  const from = range ? range.from : 0;
  const to = range ? range.to : -1;
  const off = vOffsets(g);
  const sp = V.spacersFor({ offsets: off, from, to });
  g.inner.style.setProperty('--vtop', sp.before + 'px'); // 未渲染部分的高度(撑住页面)
  g.inner.style.setProperty('--vbot', sp.after + 'px');
  const ids = [];
  for (let i = from; i <= to; i++) ids.push(g.ids[i]);
  const plan = V.reconcileIds(g.rendered || [], ids);
  for (const id of plan.remove) {
    const el = g.nodes.get(id);
    if (el) {
      if (vResizeObserver) vResizeObserver.unobserve(el);
      el.remove();
      g.nodes.delete(id);
    }
  }
  let ref = g.inner.firstElementChild;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const moreAfter = i === ids.length - 1 && to < g.ids.length - 1;
    let el = g.nodes.get(id);
    if (!el) {
      const f = vByFriend.get(id);
      if (!f) continue;
      el = vRowNode(f, moreAfter);
      g.nodes.set(id, el);
      if (vResizeObserver) vResizeObserver.observe(el); // 行高变了会回调, 滚动路径上不用量
      g.inner.insertBefore(el, ref);
      continue;
    }
    el.classList.toggle('v-more', moreAfter);
    if (el !== ref) g.inner.insertBefore(el, ref); // 复用 = 原节点搬家, 动画不中断
    else ref = ref.nextElementSibling;
  }
  g.rendered = ids;
  g.range = range;
  if (!vResizeObserver && ids.length) vMeasureGroup(g); // 老浏览器兜底: 打完补丁再量一次
}

// 按当前滚动位置重算窗口。折叠组不动它 —— 它的高度是 0, 内容留着由容器过渡裁剪。
function vUpdate(force) {
  if (!vModel) return;
  const list = $('#friendsList');
  if (!list) return;
  if (force || !vLayout) vCacheLayout();
  if (!vLayout) return;
  const vh = window.innerHeight || 800;
  const st = window.scrollY || document.documentElement.scrollTop || 0;
  vLastScrollUsed = st; // 给 renderFriends 判"这次算窗口用的滚动位置对不对"(见那里的注释)
  let y = vLayout.listTopDoc;
  for (let i = 0; i < vModel.groups.length; i++) {
    const g = vModel.groups[i];
    y += vLayout.mt[i] + vLayout.titleH[i] + vLayout.mb[i];
    if (g.collapsed) continue; // 折叠: 不渲染也不动它(留给容器过渡)
    const inView = V.visibleRange({ offsets: vOffsets(g), groupTop: y, scrollTop: st, viewportH: vh, overscan: 0 });
    y += g.total;
    // ★ 双层判断: 可见范围没变 → 一个节点都不动; 可见范围变了但渲染范围还罩得住 → 也不动
    if (!force && V.sameRange(inView, g.inView)) continue;
    g.inView = inView;
    const want = V.renderRange({ inView, count: g.ids.length, buffer: V_BUFFER_ROWS });
    if (!force && V.sameRange(want, g.range)) continue;
    vPatchWindow(g, want);
  }
}

// 量一个组里已渲染的行高(老浏览器兜底; 现代浏览器走 ResizeObserver)
function vMeasureGroup(g) {
  let changed = false;
  for (const el of g.inner.children) {
    const id = el.dataset.id;
    if (!id) continue;
    // 列表不可见时 rect 全是 0; 必须在补 1px **之前**判掉(0+1=1 会绕过守卫变成 1px 混进缓存)
    const raw = el.getBoundingClientRect().height;
    if (!(raw > 0)) continue;
    const isLastChild = el === el.parentElement.lastElementChild && !el.classList.contains('v-more');
    const h = raw + (isLastChild ? 1 : 0);
    const prev = vRowHeights.get(id);
    if (prev === undefined) { vRowHeights.set(id, h); vSum.sum += h; vSum.count++; changed = true; }
    else if (Math.abs(prev - h) > 0.02) { vSum.sum += h - prev; vRowHeights.set(id, h); changed = true; }
  }
  if (!changed) return;
  vInvalidateOffsets();
  g.offsets = null;
}

// 行高变化 → 前缀和与占位高度都要重算。走回调(不在滚动路径上), 所以可以放心读布局。
const vResizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
  let changed = false;
  for (const e of entries) {
    const el = e.target;
    const id = el.dataset.id;
    if (!id) continue;
    let raw = el.getBoundingClientRect().height;
    if (e.borderBoxSize && e.borderBoxSize[0]) raw = e.borderBoxSize[0].blockSize;
    if (!(raw > 0)) continue;
    const isLastChild = el === el.parentElement.lastElementChild && !el.classList.contains('v-more');
    const h = raw + (isLastChild ? 1 : 0);
    const prev = vRowHeights.get(id);
    if (prev === undefined) { vRowHeights.set(id, h); vSum.sum += h; vSum.count++; changed = true; }
    else if (Math.abs(prev - h) > 0.02) { vSum.sum += h - prev; vRowHeights.set(id, h); changed = true; }
  }
  if (changed) { vInvalidateOffsets(); vUpdate(true); }
}) : null;

// 首屏把**每一行**的真实高度量一遍(挂在屏幕外、visibility:hidden, 量完立刻丢弃)。
// 为什么要付这个代价: 占位空白 = 未渲染行高之和, 用估计值累计的偏差会让可见行整体偏移
// (实测: 只用均值估计时, 展开后的离线组可见行整体偏 ~22px)。量一遍后每行都是实测值,
// 占位高度与真实布局逐像素一致, 静止时的位置/尺寸才与"全量渲染"完全相同。
// 行高只跟内容有关, 量一次可长期复用; 内容变了(如世界名解析出来)由 ResizeObserver 单独修正。
function vMeasureAll() {
  if (!vModel) return;
  const list = $('#friendsList');
  // 用真实的小数宽度: 取整会改变换行, 个别行会差 1px
  const width = Math.max(0, list.getBoundingClientRect().width);
  if (!(width > 1)) return; // 列表不可见(切到设置页等): 量不到真值, 别污染缓存
  if (Math.abs(width - vMeasuredWidth) > 0.5) { // 宽度变了 → 所有行高失效(换行会变)
    vRowHeights.clear();
    vSum.sum = 0; vSum.count = 0;
    vMeasuredWidth = width;
    vInvalidateOffsets();
  }
  if (!vModel.groups.some((g) => g.ids.some((id) => !vRowHeights.has(id)))) return; // 都量过了
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;width:' + width + 'px';
  document.body.appendChild(host);
  try {
    for (const g of vModel.groups) {
      const wrap = document.createElement('div');
      // 末尾塞一个占位元素: 让 .friend 都不是 :last-child —— 保证量到的是"带下边框"的高度
      wrap.innerHTML = g.ids.map((id) => { const f = vByFriend.get(id); return f ? renderRow(f, false) : ''; }).join('') + '<i></i>';
      host.appendChild(wrap);
      for (const el of wrap.querySelectorAll('.friend')) {
        const h = el.getBoundingClientRect().height;
        if (h > 0) vRowHeights.set(el.dataset.id, h); // 量不到就别记
      }
    }
  } finally {
    host.remove();
  }
  vInvalidateOffsets(); // 量到的新高度要立刻生效
}

// 滚动/尺寸变化时重算窗口(每帧最多一次; 这条路径上不读任何布局)
window.addEventListener('scroll', () => {
  if (vUpdateRaf) return;
  vUpdateRaf = requestAnimationFrame(() => { vUpdateRaf = 0; vUpdate(false); });
}, { passive: true });
window.addEventListener('resize', () => { vMeasureAll(); vUpdate(true); });

function renderFriends() {
  const list = $('#friendsList');
  const FM = window.VrcFriendModel; // 分组/搜索/排序/指纹的纯逻辑(public/friendmodel.js, 有单测)
  // 指纹 = 搜索词 + 折叠状态 + 好友数据。算一次约 4ms, 而重建整页 DOM 更贵 —— 一样就没必要重建。
  const sig = FM.renderSignature(friendsCache, searchQuery, groupCollapsed);
  if (sig === lastRenderSig) return;
  // ★ 重绘前先记住滚动位置: 下面 list.innerHTML='' 会让页面瞬间塌高, 浏览器把滚动位置夹到顶部,
  //   于是 vCacheLayout / vUpdate 全在"塌高"的坐标下算窗口 —— 实测后果是: 在列表深处切换特别关注,
  //   重绘后视口里一行都没有(整片占位空白), 要滚一下才恢复。所以撑高之后必须把位置放回去再算一次。
  const keepScroll = window.scrollY || document.documentElement.scrollTop || 0;
  const pool = FM.filterPool(friendsCache, searchQuery);
  if (!pool.length) {
    list.innerHTML = '<p class=muted>' + (friendsCache.length ? '没有匹配的好友。' : '暂无好友数据, 点击上方「刷新」拉取。') + '</p>';
    $('#friendsCount').textContent = friendsCache.length ? '共 ' + friendsCache.length + ' 人' : '';
    vModel = null;
    vLayout = null;
    lastRenderSig = sig;
    return;
  }
  $('#friendsCount').textContent = '共 ' + friendsCache.length + ' 人';
  list.innerHTML = '';
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
    const model = { key, ids: list2.map((f) => f.friend_vrchat_id), collapsed, titleEl: g, body, inner, offsets: null, total: 0, nodes: new Map(), rendered: [], inView: null, range: null };
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
      setTimeout(() => vUpdate(true), 340); // 容器过渡走完再算一次: 过渡期间后面各组的位置是变的
      if (!nowCollapsed) replayGroupEntrance(body); // 展开时补播行级入场(收起方向本来就看得见)
    });
  };
  if (favList.length) addGroup('fav', '⭐ 特别关注 (' + favList.length + ')', favList);
  if (onlineOthers.length) addGroup('online', '在线 (' + onlineOthers.length + ')', onlineOthers);
  if (activeOthers.length) addGroup('active', '网页在线 (' + activeOthers.length + ')', activeOthers);
  if (offlineOthers.length) addGroup('offline', '离线 (' + offlineOthers.length + ')', offlineOthers);
  vMeasureAll();  // 先把每行真实高量一遍(占位空白必须与真实布局逐像素一致)
  vCacheLayout(); // 缓存列表/标题几何: 之后滚动时不再读布局
  vUpdate(true);  // 按视口渲染窗口, 最后给这些行打入场标记
  // 占位撑回去之后把滚动位置放回去, 并按"放回去之后"的位置再算一次窗口。
  // 判据是 vUpdate **实际用到的** scrollY(而不是当前值): 被夹取后浏览器可能已经自己把位置还原了,
  // 那时当前值看着没错, 但窗口是按夹取到的坐标算的 —— 结果就是视口整片空白(实测踩到)。
  if (keepScroll > 0 && Math.abs(vLastScrollUsed - keepScroll) > 1) {
    window.scrollTo(0, keepScroll);
    vUpdate(true);
  }
  // 首次渲染: 按 DOM 顺序(从上到下)给分组标题和每一行好友编号, 依次淡入(虚拟化后只有视口附近的行)
  if (!friendsEntered) { markFriendsEntrance(); friendsEntered = true; }
  lastRenderSig = sig; // 渲染成功才记账: 中途抛错时下次仍会重建
}

// ---------- 位置变化动画: 窗口内 FLIP 位移 + 窗口外飞出视口的飞行体 ----------
// 只有"已经渲染出来的行"才有 DOM, 也才有动画(这正是"只有显示的部分才有动画")。
function vRowEls() {
  const m = new Map();
  $('#friendsList').querySelectorAll('.friend').forEach((el) => m.set(el.dataset.id, el));
  return m;
}
function vFade(ids, cls) {
  const want = cls === 'v-in' ? 'vFadeIn' : 'vFadeOut';
  const els = vRowEls();
  for (const id of ids) {
    const el = els.get(id);
    if (!el || el.classList.contains(cls)) continue;
    // 只认自己那条动画的结束事件: 行上可能还有入场级联(riseIn)等别的动画, 它们的 animationend
    // 会把这个类提前摘掉 —— 结果就是"淡出根本没看见就没了"(实测踩到)
    const onEnd = (ev) => {
      if (ev.animationName !== want) return;
      el.classList.remove(cls);
      el.removeEventListener('animationend', onEnd);
    };
    el.addEventListener('animationend', onEnd);
    el.classList.add(cls);
  }
}
function vFadeIn(ids) { vFade(ids, 'v-in'); }
function vFadeOut(ids) { vFade(ids, 'v-out'); }

// 被移动行的高光脉冲(与位移同步; 旧版 FLIP 里也这么做)
function vSpot(el) {
  if (!el) return;
  el.classList.add('fav-spot');
  setTimeout(() => el.classList.remove('fav-spot'), 700);
}

// ---------- FLIP: 先量旧位置 → 重绘 → 把"旧位置−新位置"当初始位移播回去 ----------
// 速度剖面(起步慢加速 → 7px/ms 巡航 → 对称减速, 160~2400ms)在 public/flightmath.js(有单测),
// 与 00a09dd 那版逐字一致 —— 旧实现留在 .verify/frontend-baseline/app.js:1143-1256。
// 与旧版的三处必要差异:
//   1. 位置用**文档绝对坐标**采集。重绘时页面会瞬间塌高、浏览器会把滚动位置夹一次(见 renderFriends),
//      用视口相对坐标会让位移差出几万像素 —— 实测过: 切换特别关注后整片视口空白。
//   2. 只有"重绘前后都存在"的行/标题/组体才飞(虚拟列表里屏幕外的行没有 DOM)。
//   3. 被点的那一行若落到渲染窗口外, 用飞行体把它送出去(旧版全量渲染时它本来就在 DOM 里)。
const FLIGHT = window.VrcFlight;
const V_FLYER_MAX = 4; // 一次最多放几个飞行体: 突发上下线时别在屏幕上撒一片克隆行
let flipRafId = 0;
let flipItems = [];   // 进行中的动画元素: 被新动画打断时清理残留 transform/opacity
let flyers = [];      // 飞出视口的克隆行: [{ el, startDoc, targetDoc, plan, t0 }]
let flyerRafId = 0;

function flipKey(el) {
  if (el.classList.contains('friend')) return 'r:' + el.dataset.id;
  if (el.classList.contains('group-title')) return 'gt:' + el.dataset.group;
  if (el.classList.contains('group-body')) return 'gb:' + el.dataset.group;
  return null;
}
function vDocPos(el) {
  const r = el.getBoundingClientRect();
  return { top: r.top + (window.scrollY || 0), left: r.left + (window.scrollX || 0) };
}
// hits(可选): 额外收一份"好友行 → 节点 + 视口 rect", 给需要克隆飞出视口的行当起点
function captureRects(hits) {
  const rects = new Map();
  const list = $('#friendsList');
  if (!list) return rects;
  for (const el of list.querySelectorAll('.friend, .group-title, .group-body')) {
    const k = flipKey(el);
    if (!k) continue;
    const r = el.getBoundingClientRect();
    rects.set(k, { top: r.top + (window.scrollY || 0), left: r.left + (window.scrollX || 0) });
    if (hits && el.classList.contains('friend')) hits.set(el.dataset.id, { node: el, rect: r });
  }
  return rects;
}
function stopFlip() {
  if (flipRafId) { cancelAnimationFrame(flipRafId); flipRafId = 0; }
  for (const m of flipItems) { m.el.style.transform = ''; if (m.fade) m.el.style.opacity = ''; }
  flipItems = [];
}
// 返回"真的飞了"的好友 id 集合(调用方据此避免同一行既飞又淡入)
function playRowFlip(oldRects, movedId, rowOpts) {
  stopFlip();
  const flown = new Set();
  const list = $('#friendsList');
  if (!list || !FLIGHT || !oldRects || !oldRects.size) return flown;
  const items = [];
  const bodyDeltas = new Map(); // 组体位移: 行位移减去它, 避免组体+行双重移动
  for (const el of list.querySelectorAll('.group-title, .group-body')) {
    const prev = oldRects.get(flipKey(el));
    if (!prev) continue;
    const cur = vDocPos(el);
    const dx = prev.left - cur.left;
    const dy = prev.top - cur.top;
    if (el.classList.contains('group-body')) bodyDeltas.set(el.dataset.group, { dx, dy });
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
    items.push({ el, dx, dy });
  }
  for (const r of list.querySelectorAll('.friend')) {
    const prev = oldRects.get('r:' + r.dataset.id);
    if (!prev) continue;
    const ro = rowOpts ? rowOpts.get(r.dataset.id) : null;
    if (ro && ro.skip) continue; // 不参与飞行(如始末都折叠的组)
    const cur = vDocPos(r);
    const body = r.closest('.group-body');
    const bd = body ? (bodyDeltas.get(body.dataset.group) || { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
    // 从原位完整飞到新位置(旧位置 − 新位置 − 所属组体位移)
    const dx = prev.left - cur.left - bd.dx;
    const dy = prev.top - cur.top - bd.dy;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
    items.push({ el: r, dx, dy, fade: ro ? ro.fade : null });
    flown.add(r.dataset.id);
  }
  if (!items.length) return flown;
  for (const m of items) m.plan = FLIGHT.plan(Math.hypot(m.dx, m.dy));
  const moved = movedId != null ? list.querySelector('.friend[data-id="' + movedId + '"]') : null;
  if (moved) vSpot(moved);
  // 动画期间放开组内裁剪: 行飞越分组边界时才不会被 overflow:hidden 吞掉(折叠组保持裁剪)
  list.classList.add('flipping');
  flipItems = items;
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    let done = true;
    for (const m of items) {
      if (!m.el.isConnected) continue; // 被虚拟列表回收了: 不再写样式(下次渲染是新节点)
      const f = FLIGHT.progress(t, m.plan);
      m.el.style.transform = 'translate3d(' + (m.dx * (1 - f)).toFixed(2) + 'px, ' + (m.dy * (1 - f)).toFixed(2) + 'px, 0)';
      if (m.fade) m.el.style.opacity = (m.fade === 'in' ? (0.12 + 0.88 * f) : (1 - f)).toFixed(2);
      if (t < m.plan.T) done = false;
    }
    if (!done) { flipRafId = requestAnimationFrame(frame); return; }
    flipRafId = 0;
    for (const m of items) { m.el.style.transform = ''; if (m.fade) m.el.style.opacity = ''; }
    flipItems = [];
    list.classList.remove('flipping');
  };
  flipRafId = requestAnimationFrame(frame);
  return flown;
}

// ---------- 飞行体: 换组后落到渲染窗口外时, 让它照样"飞出视口" ----------
function stopFlyers() {
  if (flyerRafId) { cancelAnimationFrame(flyerRafId); flyerRafId = 0; }
  for (const f of flyers) f.el.remove();
  flyers = [];
}
function flyerFrame(now) {
  const st = window.scrollY || 0;
  let alive = 0;
  for (const f of flyers) {
    const t = now - f.t0;
    if (t >= f.plan.T) { f.el.remove(); continue; } // 到点即撤(不留残留节点)
    const k = FLIGHT.progress(t, f.plan);
    // 飞行体定位在**旧位置**, 所以位移是 d*f(0→d); FLIP 那套 d*(1-f) 是"元素已在终点、先拉回起点"的写法。
    // top 每帧按当前 scrollY 重算 → 用户滚动时飞行体跟着页面走, 而不是钉在视口上。
    f.el.style.top = (f.startDoc - st).toFixed(2) + 'px';
    f.el.style.transform = 'translate3d(0, ' + ((f.targetDoc - f.startDoc) * k).toFixed(2) + 'px, 0)';
    alive++;
  }
  flyers = flyers.filter((f) => f.el.isConnected);
  flyerRafId = alive ? requestAnimationFrame(flyerFrame) : 0;
}
// 目标位置的文档纵坐标: 直接用虚拟列表的模型算(vLayout + vOffsets 都是现成的), 不读布局。
// 窗口外的那一行本来就没有 DOM, 所以没有 rect 可用 —— 这是唯一能拿到落点的办法。
function docTopOfRow(id, groupKey) {
  if (!vModel || !vLayout) return null;
  let y = vLayout.listTopDoc;
  for (let i = 0; i < vModel.groups.length; i++) {
    const g = vModel.groups[i];
    y += vLayout.mt[i] + vLayout.titleH[i] + vLayout.mb[i];
    if (g.key === groupKey) {
      if (g.collapsed) return y; // 折叠组: 落点就是组体顶部(行会被容器裁掉)
      const idx = g.ids.indexOf(id);
      return idx < 0 ? null : y + vOffsets(g)[idx];
    }
    if (!g.collapsed) y += g.total;
  }
  return null;
}
// 克隆这一行 → fixed 定位在旧位置 → 按同一套剖面飞到目标坐标 → 自行删除。
// 用 position:fixed 而不是让它留在文档流里: 它不参与页面可滚动溢出, 不会把页面撑高。
function flyRowOut(node, rect, targetDocTop) {
  if (!node || !FLIGHT || targetDocTop == null || flyers.length >= V_FLYER_MAX) return false;
  const startDoc = rect.top + (window.scrollY || 0);
  const d = targetDocTop - startDoc;
  if (Math.abs(d) < 2) return false; // 本来就在落点附近: 没有可看的位移
  const el = node.cloneNode(true);
  el.classList.remove('v-in', 'v-out', 'enter');
  el.classList.add('v-flyer');
  el.style.left = rect.left + 'px';
  el.style.top = rect.top + 'px';
  el.style.width = rect.width + 'px';
  document.body.appendChild(el);
  flyers.push({ el, startDoc, targetDoc: targetDocTop, plan: FLIGHT.plan(Math.abs(d)), t0: performance.now() });
  if (!flyerRafId) flyerRafId = requestAnimationFrame(flyerFrame);
  return true;
}

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
  const oldHit = new Map(); // id -> { node, rect }: 落到窗口外的行要拿它克隆飞行体
  $('#friendsList').querySelectorAll('.friend').forEach((r) => {
    const st = r.querySelector('.state');
    beforeText.set(r.dataset.id, { txt: st ? st.textContent : '', html: st ? st.innerHTML : '' });
  });
  api('GET', '/api/friends').then(async (res) => {
    const data = res && res.data ? res.data.friends : null;
    if (!data) return;
    const after = groupsFromData(data);
    const ch = V.groupChanges(before, after);
    const renderedNow = new Set(vRowEls().keys());
    // 只有"数据里彻底消失"的行才先原位淡出。换组的行不能先淡出: 它在重绘后会以 opacity 1 的新节点
    // 飞出去, 先淡到 0 再亮着飞会闪一下(而且旧版本来就只有"飞出视口"这一种消失方式)。
    const leaving = ch.left;
    if (leaving.length) { vFadeOut(leaving); await new Promise((r) => setTimeout(r, V_FADE_OUT_MS)); }
    const oldRects = captureRects(oldHit); // FLIP 的 First 必须在重绘前量(淡出只动 opacity, 不影响布局)
    friendsCache = data;
    renderFriends();
    // 换组的行: 重绘前后都在窗口里的 → 平滑飞到新位置(旧版就是这么做的); 飞不了的按情况淡入
    const flown = playRowFlip(oldRects, null);
    // 换组后落到渲染窗口外的行: 旧版会从原位"飞出视口", 这里用飞行体补上(限流, 免得突发上下线撒一片)
    for (const id of ch.moved) {
      if (flyers.length >= V_FLYER_MAX) break;
      if (flown.has(id) || !oldHit.has(id)) continue;
      if ($('#friendsList').querySelector('.friend[data-id="' + id + '"]')) continue; // 还在窗口里(已由 FLIP 处理)
      flyRowOut(oldHit.get(id).node, oldHit.get(id).rect, docTopOfRow(id, after[id]));
    }
    const enterIds = ch.moved.concat(ch.entered).filter((id) => !flown.has(id) && !renderedNow.has(id));
    if (enterIds.length) vFadeIn(enterIds);
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

// 提交失败时的回滚: 把这一行的勾选状态与内存配置恢复成提交前。
// 必须按 id 重新找节点 —— await 期间列表可能已经重绘、甚至把这个 DOM 节点回收给了别的好友。
function rollbackFriendConfig(id, prev) {
  const fresh = friendsCache.find((f) => f.friend_vrchat_id === id);
  if (fresh) fresh.config = { ...prev };
  const row = $('#friendsList').querySelector('.friend[data-id="' + id + '"]');
  if (!row) return;
  const fav = row.querySelector('.favorite');
  if (fav) fav.checked = prev.favorite === 1;
  for (const snake of Object.values(window.VrcFriendModel.CONFIG_FIELDS)) {
    const el = row.querySelector('[data-k=' + snake + ']');
    if (el) el.checked = prev[snake] === 1;
  }
}

$('#friendsList').addEventListener('change', async (e) => {
  const cb = e.target;
  const row = cb.closest('.friend');
  if (!row) return;
  const id = row.dataset.id;
  const cur = friendsCache.find((f) => f.friend_vrchat_id === id) || {};
  const body = {
    favorite: !!row.querySelector('.favorite').checked,
    notifyOnline: !!row.querySelector('[data-k=notify_online]').checked,
    notifyOffline: !!row.querySelector('[data-k=notify_offline]').checked,
    notifyStatusChange: !!row.querySelector('[data-k=notify_status_change]').checked,
    notifyWorldChange: !!row.querySelector('[data-k=notify_world_change]').checked
  };
  const isFav = cb.classList.contains('favorite');
  // 乐观展示: 先把用户点的样子记进内存(分组/勾选都按它渲染), 提交失败再回滚。
  // 语义与后端 PUT 一致(不传不动), 所以用同一份 patchConfig 算.
  const prev = window.VrcFriendModel.normalizeConfig(cur.config);
  const next = window.VrcFriendModel.patchConfig(prev, body);
  if (isFav) {
    // 乐观更新 + FLIP: 先量旧位置, 再按本地状态重排, 行平滑飞向新分组, 随后后台提交。
    // 同步做完(旧版也是同步的): 中间插一个"原位淡出"的等待会让 First 与 Last 之间多出一次
    // 可能的滚动/回收, 而且淡出与飞行叠在一起看着很怪。
    stopFlyers(); // 连点两下: 上一次的飞行体先撤掉, 免得两个克隆行同时在天上
    const hit = new Map();
    const oldRects = captureRects(hit);
    const start = hit.get(id);
    cur.config = next; // 注意用 0/1: 渲染按 === 1 分组, 布尔值会导致不重排
    expandGroupFor(cur); // 目标分组折叠时先展开, 否则行落在被裁剪的隐藏区域, 看不到
    renderFriends();
    // 重绘前后都在窗口里的行(含被点行自己)→ FLIP 飞过去
    playRowFlip(oldRects, id);
    const landed = $('#friendsList').querySelector('.friend[data-id="' + id + '"]');
    // 被点行落到渲染窗口外(比如在列表深处点到顶部的特别关注组): 它在 DOM 里没有落点,
    // 用飞行体把它从旧位置送出去, 否则用户只看到"周围的行滑动一下, 被点的行凭空消失"
    if (!landed && start) flyRowOut(start.node, start.rect, docTopOfRow(id, window.VrcFriendModel.groupOf(cur)));
  } else {
    cur.config = next;
  }
  let err = '';
  try {
    const r = await api('PUT', '/api/friends/' + encodeURIComponent(id) + '/config', body);
    if (r.data.ok) {
      // 注意: 这里不再重渲染 —— 乐观渲染已把行放到正确分组, 重渲染会打断正在进行的淡入
      const fresh = friendsCache.find((f) => f.friend_vrchat_id === id);
      if (fresh) fresh.config = window.VrcFriendModel.normalizeConfig(r.data.config || next);
      return;
    }
    err = r.data.error || '保存失败';
  } catch (ex) {
    err = (ex && ex.message) || '保存失败'; // 后端不可达/响应非 JSON: api() 会抛, 同样要回滚
  }
  rollbackFriendConfig(id, prev);
  opMsgFlash(err);
  if (isFav) loadFriends(); // 特别关注失败: 分组也要回滚, 直接按服务端状态重拉
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

