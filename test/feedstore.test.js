'use strict';
// 好友动态列表的纯数据逻辑: 实时事件合并/去重/排序。
// 浏览器用 <script src="feedstore.js">(挂 window.VrcFeedStore); Node 用 require(单测)。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('../public/feedstore');

test('mergeEvents: 按 id 去重并倒序, 返回真正新增条数', () => {
  const { events, added } = fs.mergeEvents([{ id: 5 }, { id: 3 }], [{ id: 4 }, { id: 3 }, { id: 6 }]);
  assert.deepStrictEqual(events.map((e) => e.id), [6, 5, 4, 3]);
  assert.equal(added, 2);
  // 空列表/无新增
  assert.deepStrictEqual(fs.mergeEvents([], [{ id: 1 }]).events.map((e) => e.id), [1]);
  assert.equal(fs.mergeEvents([{ id: 1 }], [{ id: 1 }]).added, 0);
});
