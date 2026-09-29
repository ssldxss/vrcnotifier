'use strict';
// 主题三态(自动/浅色/深色)的纯逻辑: 当前值 → 下一个值 / → 该往 <html> 上写什么属性。
// 原先内联在 app.js 的 applyTheme 与主题按钮回调里, 抽出来后可在 Node 下单测。

const test = require('node:test');
const assert = require('node:assert');
const tm = require('../public/thememodel');

test('initialTheme: 没存过就是深色(与首屏内联脚本的默认一致)', () => {
  assert.equal(tm.initialTheme(null), 'dark');
  assert.equal(tm.initialTheme(''), 'dark');
  assert.equal(tm.initialTheme('light'), 'light');
  assert.equal(tm.initialTheme('auto'), 'auto');
});

test('nextTheme: 深色 → 自动 → 浅色 → 深色 循环', () => {
  assert.equal(tm.nextTheme('dark'), 'auto');
  assert.equal(tm.nextTheme('auto'), 'light');
  assert.equal(tm.nextTheme('light'), 'dark');
});

test('nextTheme: 未存过按默认深色处理(→自动); 存了怪值 → 深色', () => {
  assert.equal(tm.nextTheme(null), 'auto');
  assert.equal(tm.nextTheme(undefined), 'auto');
  assert.equal(tm.nextTheme('weird'), 'dark');
});

test('themeAttr: auto 不写属性(交给系统), 其余写自己', () => {
  assert.equal(tm.themeAttr('auto'), null);
  assert.equal(tm.themeAttr('light'), 'light');
  assert.equal(tm.themeAttr('dark'), 'dark');
});
