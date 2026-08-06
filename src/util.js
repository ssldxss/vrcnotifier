'use strict';
// 时间与日志工具。

/** 本地时间格式化 YYYY-MM-DD HH:mm:ss */
function formatLocalTime(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 安全时间格式(横杠, 避免被识别为电话号码), 用于 NTFY 等场景 */
function formatDateSafe(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 创建带时间戳与级别前缀的日志器; out 可注入(默认 console.log) */
function createLogger(prefix = '', out = console.log) {
  const emit = (level, args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    out(`[${formatLocalTime()}] ${prefix ? `[${prefix}] ` : ''}[${level}] ${msg}`);
  };
  return {
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a)
  };
}

module.exports = { formatLocalTime, formatDateSafe, createLogger };
