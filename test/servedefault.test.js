'use strict';
// npm start 默认前后端同源: 静态目录默认托管 public/, 需要纯 API 时用 SERVE_STATIC=0 关掉。
// (容器里一直显式写 SERVE_STATIC=1, 那套写法照旧有效)

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { resolvePublicDir } = require('../src/index');

const PUBLIC = path.join(__dirname, '..', 'public');

test('不设 SERVE_STATIC → 托管 public/(默认同源)', () => {
  assert.equal(resolvePublicDir({}), PUBLIC);
  assert.equal(resolvePublicDir(), PUBLIC, '默认读 process.env');
});

test('空字符串算没设 → 仍然托管', () => {
  assert.equal(resolvePublicDir({ SERVE_STATIC: '' }), PUBLIC);
});

test('显式开启(兼容旧写法与容器配置) → 托管', () => {
  for (const v of ['1', 'true', 'yes', 'on', 'TRUE', 'On']) {
    assert.equal(resolvePublicDir({ SERVE_STATIC: v }), PUBLIC, 'SERVE_STATIC=' + JSON.stringify(v));
  }
});

test('显式关闭 → 不托管(纯 API)', () => {
  for (const v of ['0', 'false', 'no', 'off', 'FALSE', 'Off']) {
    assert.equal(resolvePublicDir({ SERVE_STATIC: v }), null, 'SERVE_STATIC=' + JSON.stringify(v));
  }
});
