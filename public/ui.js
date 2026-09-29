'use strict';
// 界面外壳: 页面切换(好友监控/设置) + 概览项引用 + 回顶 + 主题三态 + 自定义下拉 + 丝滑滚动。
// 从 app.js 拆出; 主题循环与滚动数学在 thememodel.js / scrollmath.js(均有单测)。
// 本文件仍是传统脚本、函数保持全局, 所以 app.js 里的调用点无需改动。

// ---------- 页面切换: 好友监控 / 设置(设置页含 QQ 机器人 + 后端日志) ----------
const PAGE_IDS = ['tab-friends', 'tab-settings'];
let fadeOutTimer = null;
// instant=true(用户点击切换): 旧页快速淡出 → 新页立即从 0 开始级联淡入;
// instant=false(启动恢复上次页面): 视为「打开网页」, 使用整页静态级联(概览条→导航→卡片→好友行→页脚)。
function switchTab(name, opts = {}) {
  if (!PAGE_IDS.includes(name)) name = PAGE_IDS[0];
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.target === name));
  const target = document.getElementById(name);
  if (opts.instant) {
    const finish = () => {
      PAGE_IDS.filter((id) => id !== name).forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.classList.remove('page-fade-out'); }
      });
      if (target) {
        target.classList.remove('page-fade-out');
        target.classList.add('switch-in'); // 标记本次是"切页进场"
        markCardsEntrance(target);         // 卡片按 0,1,2… 重新编号, 从头级联
        target.classList.remove('hidden');
        if (name === 'tab-friends') { markFriendsEntrance(); vUpdate(true); } // 切回来时页面刚可见, 窗口要重算 // 好友行重新从上到下编号
      }
    };
    clearTimeout(fadeOutTimer);
    const old = PAGE_IDS.filter((id) => id !== name).map((id) => document.getElementById(id))
      .find((el) => el && !el.classList.contains('hidden'));
    if (old) {
      old.classList.add('page-fade-out');
      fadeOutTimer = setTimeout(finish, 120); // 快速淡出后立刻淡入(定时器兜底, 不依赖动画事件)
    } else {
      finish();
    }
  } else {
    clearTimeout(fadeOutTimer);
    PAGE_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('switch-in', 'page-fade-out');
      el.classList.toggle('hidden', id !== name);
    });
  }
  try { sessionStorage.setItem('vrcn_lastTab', name); } catch (e) {} // 刷新恢复所在页
  moveTabIndicator(); // 高亮滑块滑到当前 tab
  updateToTop(); // 切换后页面高度变化, 重新判定回到顶部按钮
}

// 切页进场: 把该页的直接 .card 按 DOM 顺序重新编号(0,1,2…), 每张延后 40ms 依次淡入。
// 原先是在 CSS 里写死 `#tab-settings.switch-in > .card:nth-child(1|2)`, 设置页加到第 3 张
// (后端日志)时漏了 —— 它带着静态 --i:9 出来, 比前两张晚 360ms, 看着像没动画。改成编号就不怕加卡片。
function markCardsEntrance(root) {
  let i = 0;
  for (const card of root.querySelectorAll(':scope > .card')) card.style.setProperty('--i', String(i++));
}

// 高亮滑块: 量出当前 tab 在容器里的位置与宽度, 交给 CSS 过渡滑过去(不是把背景在按钮之间跳)。
// 注意主界面隐藏时量出来全是 0, 所以除了切页, showView('main') 和窗口尺寸变化时也要重量。
function moveTabIndicator() {
  const bar = $('.tabs');
  const ind = $('#tabIndicator');
  const active = bar && bar.querySelector('.tab.active');
  if (!bar || !ind || !active) return;
  const b = bar.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  if (!a.width) return; // 还没布局(视图隐藏): 保持上一次的值, 等可见了再量
  const padLeft = bar.clientLeft || 0; // 左边框宽度(滑块的定位基准是 padding box)
  ind.style.width = a.width + 'px';
  ind.style.transform = 'translateX(' + (a.left - b.left - padLeft) + 'px)';
}
window.addEventListener('resize', moveTabIndicator);
$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.target, { instant: true }));
});
// QQ 机器人状态卡: 点击切换到设置页
const qqStatusItem = $('#stQq') ? $('#stQq').closest('.overview-item') : null;
if (qqStatusItem) {
  qqStatusItem.style.cursor = 'pointer';
  qqStatusItem.title = '点击打开设置页';
  qqStatusItem.addEventListener('click', () => switchTab('tab-settings', { instant: true }));
}
// 好友状态卡: 点击切回好友监控页面
const friendsStatusItem = $('#stMonitored') ? $('#stMonitored').closest('.overview-item') : null;
if (friendsStatusItem) {
  friendsStatusItem.style.cursor = 'pointer';
  friendsStatusItem.title = '点击回到好友监控页面';
  friendsStatusItem.addEventListener('click', () => switchTab('tab-friends', { instant: true }));
}
// 服务器状态卡: 点击打开 VRChat 官方状态页
const healthStatusItem = $('#stHealth') ? $('#stHealth').closest('.overview-item') : null;
if (healthStatusItem) {
  healthStatusItem.style.cursor = 'pointer';
  healthStatusItem.title = '点击打开 VRChat 官方状态页 (status.vrchat.com)';
  healthStatusItem.addEventListener('click', () => {
    window.open('https://status.vrchat.com', '_blank', 'noopener');
  });
}
// 外链(GitHub / QQ 开放平台 / 好友头像·昵称·世界名): 与服务器状态卡一致 —— 无超链接,
// 点击经 JS window.open 打开新标签页; 视觉样式与原文字链接一致。
// 委托到 document: 好友行是动态渲染的, 一次性的 $$('.ext-link') 绑定盖不住后加进来的链接。
document.addEventListener('click', (e) => {
  const el = e.target && e.target.closest ? e.target.closest('.ext-link') : null;
  if (!el) return;
  const url = el.dataset.href;
  if (url) window.open(url, '_blank', 'noopener');
});

// 回到顶部按钮: 页面切换按钮(.tabs)滚到吸顶标题栏处或更下方时显示; 固定右下角、最顶层悬浮
function updateToTop() {
  const btn = $('#toTopBtn');
  if (!btn) return;
  const tabs = document.querySelector('.tabs');
  let show = false;
  if (tabs && !tabs.closest('.hidden')) {
    const header = document.querySelector('header');
    const hh = header ? header.offsetHeight : 60;
    show = tabs.getBoundingClientRect().top <= hh;
  }
  btn.classList.toggle('off', !show);
}
window.addEventListener('scroll', updateToTop, { passive: true });
$('#toTopBtn').addEventListener('click', () => {
  if (window.__smoothScrollTo) window.__smoothScrollTo(0); // 复用惯性滚动滑回顶部
});
// 上次刷新卡: 点击手动触发对账刷新
const snapshotStatusItem = $('#stSnapshot') ? $('#stSnapshot').closest('.overview-item') : null;
if (snapshotStatusItem) {
  snapshotStatusItem.style.cursor = 'pointer';
  snapshotStatusItem.title = '点击立即刷新好友数据';
  snapshotStatusItem.addEventListener('click', () => triggerSnapshot());
}

// ---------- 主题: 自动(跟随系统)/浅色/深色 ----------
const THEME_KEY = 'vrcn_theme';
const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};
const THEME_LABELS = { auto: '主题: 跟随系统', light: '主题: 浅色', dark: '主题: 深色' };
function applyTheme(mode) {
  const root = document.documentElement;
  const attr = VrcTheme.themeAttr(mode); // auto → null: 不写属性, 交给系统
  if (attr === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', attr);
  localStorage.setItem(THEME_KEY, mode);
  $('#themeBtn').innerHTML = THEME_ICONS[mode];
  $('#themeBtn').title = THEME_LABELS[mode] + '(点击切换)';
}
$('#themeBtn').addEventListener('click', () => {
  applyTheme(VrcTheme.nextTheme(localStorage.getItem(THEME_KEY)));
});
applyTheme(VrcTheme.initialTheme(localStorage.getItem(THEME_KEY)));

// ---------- 自定义下拉: 隐藏原生 select, 玻璃拟态菜单 + 动画 + 键盘导航 ----------
function makeDropdown(sel, opts = {}) {
  if (!sel || sel.dataset.dd) return sel ? sel.syncDd : null;
  sel.dataset.dd = '1';
  const multi = !!opts.multi; // 多选: 选中集合=显示集合; 单选保持原行为
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('dd-native');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn';
  btn.innerHTML = "<span class='dd-val'></span><svg class='dd-arrow' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>";
  const menu = document.createElement('div');
  menu.className = 'dd-menu'; // 开合由 .dd.open 驱动(全局 .hidden 是 display:none, 会跳过淡入淡出)
  const scroll = document.createElement('div');
  scroll.className = 'dd-scroll'; // 滚动收在内层, 关闭重开保留滚动位置(与 app.css .dd-scroll 同思路)
  menu.appendChild(scroll);
  wrap.append(btn, menu);
  const items = [];
  function checkEl() { const cb = document.createElement('span'); cb.className = 'dd-cb'; return cb; }
  function labelEl(text) { const lb = document.createElement('span'); lb.className = 'dd-lb'; lb.textContent = text; return lb; }
  let allRow = null;
  if (multi) {
    // 多选: 选中集合(默认全选); 「全选」行固定菜单顶部, 点击切换 全选/全不选
    sel.selectedValues = new Set(Array.from(sel.options).map((o) => o.value));
    allRow = document.createElement('div');
    allRow.className = 'dd-item dd-check'; // 复选框行: 全选中=对勾填满, 部分选中=横线
    allRow.append(checkEl(), labelEl('全选'));
    allRow.addEventListener('click', () => {
      const allVals = items.map((it) => it.dataset.v);
      const allSelected = allVals.length > 0 && allVals.every((v) => sel.selectedValues.has(v));
      if (allSelected) sel.selectedValues.clear();
      else allVals.forEach((v) => sel.selectedValues.add(v));
      sync();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    scroll.appendChild(allRow);
  }
  for (const opt of sel.options) {
    const it = document.createElement('div');
    it.className = 'dd-item dd-check'; // 统一复选框行样式: 单选模式只有一个勾选框被填满
    it.dataset.v = opt.value;
    it.append(checkEl(), labelEl(opt.textContent));
    it.addEventListener('click', () => {
      if (multi) {
        if (sel.selectedValues.has(opt.value)) sel.selectedValues.delete(opt.value);
        else sel.selectedValues.add(opt.value);
        sync();
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return; // 多选: 点完不关菜单, 继续勾选
      }
      if (sel.value !== opt.value) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync(); // 立即更新按钮文案, 不必等下次展开
      close();
    });
    scroll.appendChild(it);
    items.push(it);
  }
  function sync() {
    if (multi) {
      const allVals = items.map((it) => it.dataset.v);
      const n = allVals.filter((v) => sel.selectedValues.has(v)).length;
      const allSelected = allVals.length > 0 && n === allVals.length;
      // 按钮文案: 名称 + 选中/总数, 折叠状态一眼可见(等级 4/4、等级 2/4、分类 8/11)
      btn.querySelector('.dd-val').textContent = (opts.label ? opts.label + ' ' : '') + n + '/' + allVals.length;
      items.forEach((it) => it.classList.toggle('on', sel.selectedValues.has(it.dataset.v)));
      allRow.classList.toggle('on', allSelected);            // 全选中: 「全选」对勾填满
      allRow.classList.toggle('ind', !allSelected && n > 0); // 部分选中: 「全选」显示横线
    } else {
      btn.querySelector('.dd-val').textContent = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : String(sel.value || '');
      items.forEach((it) => it.classList.toggle('on', it.dataset.v === sel.value));
    }
  }
  function close() {
    wrap.classList.remove('open'); // CSS 过渡负责淡出
  }
  const navItems = multi ? [allRow, ...items] : items; // 多选时「全选」行也参与键盘导航
  navItems.forEach((it, i) => it.style.setProperty('--i', i)); // 逐行级联延迟的行号, 见 app.css .dd-item 的 animation-delay
  let activeIdx = -1;
  function markActive() {
    navItems.forEach((it, i) => it.classList.toggle('act', i === activeIdx));
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!wrap.classList.contains('open')) {
      $$('.dd.open').forEach((w) => w.classList.remove('open')); // 其他菜单同步淡出
      sync();
      activeIdx = navItems.findIndex((it) => it.classList.contains('on'));
      if (activeIdx < 0) activeIdx = 0; // 键盘导航默认落在第一行
      markActive();
      wrap.classList.add('open'); // CSS 过渡负责淡入
    } else {
      close();
    }
  });
  // 键盘导航: ↑↓ 移动, Enter/空格选中(多选为切换, 不关菜单), Esc 关闭
  wrap.addEventListener('keydown', (e) => {
    if (!wrap.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % navItems.length; markActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + navItems.length) % navItems.length; markActive(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const it = navItems[activeIdx]; if (it) it.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
  sync();
  sel.syncDd = sync; // 供外部改值后同步按钮文案
  return wrap;
}

// 初始化所有下拉(替代原生 select): 门禁/断开弹窗协议(单选)、日志等级与分类筛选(多选; QQ 启用已是开关)
makeDropdown($('#gateScheme'));
makeDropdown($('#connScheme'));
makeDropdown($('#logLevelSel'), { multi: true, label: '等级' });
makeDropdown($('#logCatSel'), { multi: true, label: '分类' });
logLevelSel = $('#logLevelSel');
logCatSel = $('#logCatSel');
// 筛选选择持久化: 恢复浏览器缓存(缓存里无效值丢弃, 只剩无效值按空集处理); 无缓存用默认全选
try {
  const saved = JSON.parse(localStorage.getItem('vrcnotifier.logFilter') || 'null');
  if (saved && typeof saved === 'object') {
    for (const [el, key] of [[logLevelSel, 'level'], [logCatSel, 'cat']]) {
      if (!el || !Array.isArray(saved[key])) continue;
      const valid = saved[key].filter((v) => Array.from(el.options).some((o) => o.value === v));
      el.selectedValues.clear();
      for (const v of valid) el.selectedValues.add(v);
      if (el.syncDd) el.syncDd();
    }
  }
} catch (e) { /* 缓存读取失败, 用默认全选 */ }
// 切换筛选 → 服务端按条件重新拉取尾部(文件里匹配的历史行都能翻出来), 并把选择写入缓存
function saveLogFilter() {
  try {
    localStorage.setItem('vrcnotifier.logFilter', JSON.stringify({
      level: logLevelSel ? Array.from(logLevelSel.selectedValues) : [],
      cat: logCatSel ? Array.from(logCatSel.selectedValues) : []
    }));
  } catch (e) { /* 存储不可用(隐私模式等)时忽略 */ }
}
$('#logLevelSel').addEventListener('change', () => { saveLogFilter(); loadBackendLogs({ tail: 100 }); });
$('#logCatSel').addEventListener('change', () => { saveLogFilter(); loadBackendLogs({ tail: 100 }); });

// ---------- 丝滑滚动: 替换默认滚轮为指数趋近的惯性滚动 ----------
// 起步跟手、尾段柔和; 日志卡/下拉菜单等内部滚动容器仍走原生。
// 不检测系统「减少动态效果」开关, 一律启用。
(function initSmoothScroll() {
  const NATIVE_SEL = '#log, .dd-menu'; // 内部滚动容器: 不拦截
  let target = window.scrollY;
  let current = window.scrollY;
  let rafId = null;
  const onWheel = (e) => {
    if (e.ctrlKey) return; // ctrl+滚轮 = 缩放, 交给浏览器
    const el = e.target && e.target.closest ? e.target.closest(NATIVE_SEL) : null;
    if (el) return; // 容器内部原生滚动
    e.preventDefault();
    const delta = VrcScroll.normalizeWheelDelta(e.deltaY, e.deltaMode, window.innerHeight);
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    target = VrcScroll.clampScroll(target + delta * 1.15, max); // 惯性加成: 快速拨轮/甩动滑得更远
    if (rafId === null) rafId = requestAnimationFrame(step);
  };
  const step = () => {
    current = VrcScroll.approach(current, target); // 更柔的趋近: 尾段滑行更长、更丝滑
    if (VrcScroll.isSettled(current, target)) {
      current = target;
      rafId = null;
    } else {
      rafId = requestAnimationFrame(step);
    }
    window.scrollTo(0, current);
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  // 其他滚动源(键盘/滚动条/锚点)直接改 scrollY 时同步目标, 避免相互对抗
  window.addEventListener('scroll', () => {
    if (rafId === null) { target = window.scrollY; current = window.scrollY; }
  }, { passive: true });
  // 供「回到顶部」按钮等调用: 复用同一惯性滚动
  window.__smoothScrollTo = (y) => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    target = VrcScroll.clampScroll(Number(y) || 0, max);
    if (rafId === null) rafId = requestAnimationFrame(step);
  };
})();
