const test = require('node:test');
const assert = require('node:assert');
const { formatLocalTime, createLogger, setLogStream, getLogStream } = require('../src/util');
const { createLogStream } = require('../src/logstream');

test('formatLocalTime returns local YYYY-MM-DD HH:mm:ss', () => {
  const d = new Date(2026, 0, 2, 3, 4, 5); // local
  const s = formatLocalTime(d.getTime());
  assert.match(s, /^2026-01-02 03:04:05$/);
});

test('createLogger prefixes timestamp and level', () => {
  const out = [];
  const log = createLogger('test', (s) => out.push(s));
  log.info('hello %s', 'x');
  assert.equal(out.length, 1);
  assert.match(out[0], /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[info\] \[test\] hello %s x$/);
});

test('createLogger pushes lines to global log stream when set', () => {
  const stream = createLogStream();
  const prev = getLogStream();
  try {
    setLogStream(stream);
    const log = createLogger('test', () => {});
    log.warn('注意 %s', 'A');
    log.error('出错 %s', 'B');
    assert.equal(stream.size(), 2);
    assert.match(stream.tail(10)[0].line, /\[warn\] \[test\] 注意 %s A$/);
    assert.match(stream.tail(10)[1].line, /\[error\] \[test\] 出错 %s B$/);
  } finally {
    setLogStream(prev);
  }
});

test('getLogStream returns null by default', () => {
  assert.equal(getLogStream(), null);
});
