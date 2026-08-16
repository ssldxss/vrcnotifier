'use strict';
// 日志重构测试: 输出格式 [时间] [级别] [分类] 正文 / 流内行替换 / 文件日志分页与轮转。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, setLogStream, setFileLog, maskKey } = require('../src/util');
const { createLogStream } = require('../src/logstream');
const { createFileLog } = require('../src/filelog');

test('日志格式: [时间] [级别] [分类] 正文, 内嵌标签被提取为统一分类', () => {
  const out = [];
  setLogStream(null);
  setFileLog(null);
  const log = createLogger('app', (l) => out.push(l));
  log.info('[ws] 已连接 userId=u1');
  log.warn('[通知] QQ 推送失败: x');
  log.error('[monitor] 连接故障超过 5 分钟未恢复, 已推送故障通知 userId=u1');
  log.info('[启动] ======== 运行开始 ========');
  log.warn('[health] 探测异常: boom');
  assert.match(out[0], /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[info\] \[ws\] 已连接 userId=u1$/);
  assert.match(out[1], /^\[[^\]]*\] \[warn\] \[notify\] QQ 推送失败: x$/);
  assert.match(out[2], /^\[[^\]]*\] \[error\] \[monitor\] 连接故障超过 5 分钟未恢复, 已推送故障通知 userId=u1$/);
  assert.match(out[3], /^\[[^\]]*\] \[info\] \[startup\] ======== 运行开始 ========$/);
  assert.match(out[4], /^\[[^\]]*\] \[warn\] \[status\] 探测异常: boom$/);
});

test('日志流 update 替换行并通知订阅者(令牌打码用)', () => {
  const stream = createLogStream();
  const entry = stream.push('[t] [info] [startup] 已生成访问令牌: secret123');
  const seen = [];
  stream.subscribe((e, kind) => seen.push([e.seq, kind, e.line]));
  const updated = stream.update(entry.seq, '[t] [info] [startup] 已生成访问令牌: ****');
  assert.equal(updated.line, '[t] [info] [startup] 已生成访问令牌: ****');
  assert.deepEqual(seen[0], [entry.seq, 'update', '[t] [info] [startup] 已生成访问令牌: ****']);
  assert.equal(stream.findLast((e) => e.line.includes('已生成访问令牌')).seq, entry.seq);
});

test('文件日志: 追加/向前翻页/写满轮转覆盖(seq 与内存流一致)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-log-'));
  try {
    const file = path.join(dir, 'vrcnotifier.log');
    const fl = createFileLog({ file, maxBytes: 300 });
    fl.open();
    fl.append('[t] [info] [ws] line1', 1);
    fl.append('[t] [info] [ws] line2', 2);
    const before = fl.readBefore(2, 10);
    assert.deepEqual(before.map((e) => e.seq), [1]);
    assert.ok(before[0].line.includes('line1'));
    // 写满触发轮转: 旧行从文件消失, 新行保留且 seq 不重置
    assert.equal(fl.willOverflow('x'.repeat(300)), true);
    fl.rotate();
    fl.append('[t] [info] [vrcapi] line3', 3);
    assert.equal(fl.readBefore(3, 10).length, 0); // 轮转后旧行已被覆盖
    fl.append('[t] [info] [vrcapi] line4', 4);
    assert.deepEqual(fl.readBefore(5, 10).map((e) => e.seq), [3, 4]);
    fl.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('logger 同时写入内存流与文件(文件保留明文, seq 对齐)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-log-'));
  try {
    const stream = createLogStream();
    setLogStream(stream);
    const fl = createFileLog({ file: path.join(dir, 'vrcnotifier.log') });
    fl.open();
    setFileLog(fl);
    const out = [];
    const log = createLogger('app', (l) => out.push(l));
    const e1 = log.info('[startup] 已生成访问令牌: SECRET-TOKEN-12345678');
    log.warn('[qq] 断开 appId=1');
    // 文件内容: 按 seq 可翻页读到, 且保留明文
    const rows = fl.readBefore(e1.seq + 2, 10);
    assert.deepEqual(rows.map((r) => r.seq), [e1.seq, e1.seq + 1]);
    assert.ok(rows[0].line.includes('SECRET-TOKEN-12345678'));
    // 流内 update 不影响文件(文件保留明文)
    stream.update(e1.seq, rows[0].line.replace('SECRET-TOKEN-12345678', '****'));
    assert.ok(fl.readBefore(e1.seq + 2, 10)[0].line.includes('SECRET-TOKEN-12345678'));
    fl.close();
    setLogStream(null);
    setFileLog(null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('maskKey 保留前 4 后 4, 过短全掩', () => {
  assert.equal(maskKey('abcdefgh12345678'), 'abcd****5678');
  assert.equal(maskKey('short'), '****');
});
