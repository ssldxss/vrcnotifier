'use strict';
// 日志行解析(纯逻辑): 后端日志行的 [时间] [级别] [分类] 正文 拆解。
// 原先内联在 app.js 的 renderLogRow 里, 抽成模块后可在 Node 下单测(渲染仍由 logpanel.js 负责)。

const test = require('node:test');
const assert = require('node:assert');
const lp = require('../public/logparse');

test('parseLogLine: 标准行拆成 时间/级别/分类/正文', () => {
  assert.deepEqual(lp.parseLogLine('[2026-09-28 21:00:00] [info] [server] 已生成访问令牌'), {
    time: '2026-09-28 21:00:00', level: 'info', cat: 'server', body: '已生成访问令牌'
  });
});

test('parseLogLine: 四个级别都认', () => {
  for (const lv of ['debug', 'info', 'warn', 'error']) {
    assert.equal(lp.parseLogLine('[t] [' + lv + '] [ws] x').level, lv);
  }
});

test('parseLogLine: 级别不在白名单 → 不解析(按原文显示)', () => {
  assert.equal(lp.parseLogLine('[2026-09-28 21:00:00] [verbose] [server] x'), null);
  assert.equal(lp.parseLogLine('[2026-09-28 21:00:00] [INFO] [server] x'), null);
});

test('parseLogLine: 缺分类 / 缺级别 / 无方括号 → 不解析', () => {
  assert.equal(lp.parseLogLine('[2026-09-28 21:00:00] [info] x'), null);
  assert.equal(lp.parseLogLine('2026-09-28 21:00:00 [info] [server] x'), null);
  assert.equal(lp.parseLogLine('纯文本日志'), null);
  assert.equal(lp.parseLogLine(''), null);
});

test('parseLogLine: 正文里的方括号照原样保留, 允许为空', () => {
  assert.equal(lp.parseLogLine('[t] [info] [ws] a [b] c').body, 'a [b] c');
  assert.equal(lp.parseLogLine('[t] [info] [ws] ').body, '');
});

test('parseLogLine: 分类原样返回(是否已知由 catClass 判定)', () => {
  assert.equal(lp.parseLogLine('[t] [info] [group] x').cat, 'group');
  assert.equal(lp.parseLogLine('[t] [info] [某个新分类] x').cat, '某个新分类');
});

test('catClass: 已知分类用自己, 未知归 other', () => {
  for (const c of lp.LOG_CATS) assert.equal(lp.catClass(c), c);
  assert.equal(lp.catClass('某个新分类'), 'other');
  assert.equal(lp.catClass(''), 'other');
  assert.equal(lp.catClass(null), 'other');
});

test('shortTime: 取 HH:mm:ss(与时间戳前 10 个字符的日期对齐)', () => {
  assert.equal(lp.shortTime('2026-09-28 21:00:00'), '21:00:00');
  assert.equal(lp.shortTime('2026-09-28 09:05:07'), '09:05:07');
});

test('LOG_CATS: 与前端分类筛选项一致(顺序即展示顺序)', () => {
  assert.deepEqual(lp.LOG_CATS, ['startup', 'server', 'auth', 'monitor', 'ws', 'vrcapi', 'world', 'group', 'qq', 'notify', 'avatar', 'status']);
});
