'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createLogStream } = require('../src/logstream');

test('push appends entries with increasing seq', () => {
  const s = createLogStream({ capacity: 3 });
  s.push('a');
  s.push('b');
  const e = s.push('c');
  assert.equal(e.seq, 3);
  assert.equal(e.line, 'c');
  assert.equal(s.size(), 3);
});

test('tail returns last n entries', () => {
  const s = createLogStream({ capacity: 10 });
  s.push('a'); s.push('b'); s.push('c');
  assert.deepEqual(s.tail(2).map((x) => x.line), ['b', 'c']);
  assert.deepEqual(s.tail(0), []);
});

test('capacity trims oldest entries (ring buffer)', () => {
  const s = createLogStream({ capacity: 2 });
  s.push('a'); s.push('b'); s.push('c');
  assert.deepEqual(s.tail(10).map((x) => x.line), ['b', 'c']);
});

test('after returns only entries newer than given seq', () => {
  const s = createLogStream({ capacity: 100 });
  s.push('a'); s.push('b'); s.push('c');
  const r = s.after(1);
  assert.deepEqual(r.map((x) => x.line), ['b', 'c']);
  assert.deepEqual(s.after(3), []);
});

test('subscribe receives every pushed line and unsubscribe stops', () => {
  const s = createLogStream();
  const got = [];
  const unsub = s.subscribe((e) => got.push(e.line));
  s.push('x'); s.push('y');
  unsub();
  s.push('z');
  assert.deepEqual(got, ['x', 'y']);
});

test('subscriber error does not break subsequent pushes', () => {
  const s = createLogStream();
  s.subscribe(() => { throw new Error('boom'); });
  s.push('ok');
  assert.equal(s.size(), 1);
});

test('clear empties buffer', () => {
  const s = createLogStream();
  s.push('a');
  s.clear();
  assert.equal(s.size(), 0);
  assert.deepEqual(s.tail(10), []);
});

test('lastSeq reflects latest entry', () => {
  const s = createLogStream();
  assert.equal(s.lastSeq(), 0);
  s.push('a');
  assert.equal(s.lastSeq(), 1);
});

test('push 支持外部 seq(文件层推导); lastSeq 取历史最大, 不被乱序拉低', () => {
  const s = createLogStream();
  s.push('a', 5000);
  s.push('b', 2); // 乱序到达不回退水位
  const e = s.push('c'); // 未带 seq: 内部计数兜底
  assert.equal(s.tail(10)[0].seq, 5000);
  assert.equal(s.lastSeq(), 5000);
  assert.ok(e.seq >= 1);
  assert.deepEqual(s.after(4999).map((x) => x.line), ['a']);
  assert.deepEqual(s.after(5000).map((x) => x.line), []);
});
