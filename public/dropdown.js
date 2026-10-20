'use strict';
// 自定义下拉(隐藏原生 select, 玻璃拟态菜单 + 动画 + 键盘导航)。
// 独立的玻璃拟态多选/单select组件, 样式在 app.css 的 .dd-* 里。
// 浏览器全局: window.VrcDropdown.makeDropdown(sel, { multi, label })
// Node 单测用: require('../public/dropdown').makeDropdown —— 需要 DOM, 这里只导出纯辅助判断。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VrcDropdown = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function makeDropdown(sel, opts) {
    const options = opts || {};
    if (!sel || sel.dataset.dd) return sel ? sel.syncDd : null;
    sel.dataset.dd = '1';
    const multi = !!options.multi; // 多选: 选中集合=显示集合; 单选保持原行为
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
    scroll.className = 'dd-scroll';
    menu.appendChild(scroll);
    wrap.append(btn, menu);
    const items = [];
    const checkEl = () => { const cb = document.createElement('span'); cb.className = 'dd-cb'; return cb; };
    const labelEl = (text) => { const lb = document.createElement('span'); lb.className = 'dd-lb'; lb.textContent = text; return lb; };
    let allRow = null;
    if (multi) {
      // 多选: 选中集合(默认全选); 「全选」行固定菜单顶部, 点击切换 全选/全不选
      sel.selectedValues = new Set(Array.from(sel.options).map((o) => o.value));
      allRow = document.createElement('div');
      allRow.className = 'dd-item dd-check';
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
      it.className = 'dd-item dd-check';
      it.dataset.v = opt.value;
      it.append(checkEl(), labelEl(opt.textContent));
      it.addEventListener('click', () => {
        if (multi) {
          if (sel.selectedValues.has(opt.value)) sel.selectedValues.delete(opt.value);
          else sel.selectedValues.add(opt.value);
          sync();
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        if (sel.value !== opt.value) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        sync();
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
        btn.querySelector('.dd-val').textContent = (options.label ? options.label + ' ' : '') + n + '/' + allVals.length;
        items.forEach((it) => it.classList.toggle('on', sel.selectedValues.has(it.dataset.v)));
        allRow.classList.toggle('on', allSelected);
        allRow.classList.toggle('ind', !allSelected && n > 0);
      } else {
        btn.querySelector('.dd-val').textContent = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : String(sel.value || '');
        items.forEach((it) => it.classList.toggle('on', it.dataset.v === sel.value));
      }
    }
    function close() {
      wrap.classList.remove('open');
    }
    const navItems = multi ? [allRow, ...items] : items;
    navItems.forEach((it, i) => it.style.setProperty('--i', i));
    let activeIdx = -1;
    function markActive() {
      navItems.forEach((it, i) => it.classList.toggle('act', i === activeIdx));
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!wrap.classList.contains('open')) {
        $$('.dd.open').forEach((w) => w.classList.remove('open'));
        sync();
        activeIdx = navItems.findIndex((it) => it.classList.contains('on'));
        if (activeIdx < 0) activeIdx = 0;
        markActive();
        wrap.classList.add('open');
      } else {
        close();
      }
    });
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
    sel.syncDd = sync;
    return wrap;
  }

  return { makeDropdown };
});
