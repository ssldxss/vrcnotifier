const test = require('node:test');
const assert = require('node:assert');
const { formatLocalTime, formatDateSafe, createLogger } = require('../src/util');

test('formatLocalTime returns local YYYY-MM-DD HH:mm:ss', () => {
  const d = new Date(2026, 0, 2, 3, 4, 5); // local
  const s = formatLocalTime(d.getTime());
  assert.match(s, /^2026-01-02 03:04:05$/);
});

test('formatDateSafe returns dashes not slashes', () => {
  const d = new Date(2026, 0, 2, 3, 4, 5);
  assert.match(formatDateSafe(d), /^2026-01-02 03:04:05$/);
  assert.ok(!formatDateSafe(d).includes('/'));
});

test('createLogger prefixes timestamp and level', () => {
  const out = [];
  const log = createLogger('test', (s) => out.push(s));
  log.info('hello %s', 'x');
  assert.equal(out.length, 1);
  assert.match(out[0], /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[test\] \[info\] hello x$/);
});
