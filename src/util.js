'use strict';
// 时间与日志工具。

/** 本地时间格式化 YYYY-MM-DD HH:mm:ss */
function formatLocalTime(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 全局日志流(createLogger 默认接入): 前端实时日志展示用。
// 应用启动时由 index.js setLogStream; 测试可注入/清空。
let globalLogStream = null;
function setLogStream(stream) { globalLogStream = stream; }
function getLogStream() { return globalLogStream; }

/** 创建带时间戳与级别前缀的日志器; out 可注入(默认 console.log) */
function createLogger(prefix = '', out = console.log) {
  const emit = (level, args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const line = `[${formatLocalTime()}] ${prefix ? `[${prefix}] ` : ''}[${level}] ${msg}`;
    out(line);
    if (globalLogStream) globalLogStream.push(line);
  };
  return {
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a)
  };
}

module.exports = { formatLocalTime, createLogger, setLogStream, getLogStream };
