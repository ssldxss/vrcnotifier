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

// 全局文件日志(可选): data/logs/vrcnotifier.log, 终端与文件均保留明文, 不参与前端打码。
let globalFileLog = null;
function setFileLog(f) { globalFileLog = f; }
function getFileLog() { return globalFileLog; }

/** 令牌打码: 保留前 4 后 4(过短则全掩) */
function maskKey(token) {
  if (!token) return '****';
  return token.length > 8 ? token.slice(0, 4) + '****' + token.slice(-4) : '****';
}

/** VRChat 信任等级: 好友 tags 按优先级映射(官方等级, 入库/展示统一用返回值) */
function trustLevelFromTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  if (list.includes('system_trust_veteran')) return 'Trusted User';
  if (list.includes('system_trust_trusted')) return 'Known User';
  if (list.includes('system_trust_known')) return 'User';
  if (list.includes('system_trust_basic')) return 'New User';
  return 'Visitor';
}

// 分类规范化: 把正文开头的旧式内嵌标签(如 [启动]/[通知])提取为统一分类。
const CATEGORY_ALIASES = {
  '启动': 'startup', '退出': 'startup', 'startup': 'startup', '轮转': 'startup',
  'server': 'server', 'auth': 'auth',
  'monitor': 'monitor', 'ws': 'ws', 'vrcapi': 'vrcapi', 'qq': 'qq',
  '通知': 'notify', 'notify': 'notify',
  'avatar': 'avatar',
  'health': 'status', 'vrcstatus': 'status', 'status': 'status',
  'world': 'world', '世界': 'world'
};

function parseCategory(msg) {
  const m = /^\[([^\]]+)\]/.exec(msg);
  if (!m) return { category: null, body: msg };
  const cat = CATEGORY_ALIASES[m[1]] || m[1].toLowerCase();
  return { category: cat, body: msg.slice(m[0].length).trim() };
}

/**
 * 创建日志器。行格式: [时间] [级别] [分类] 正文。
 * 输出同时进 console(明文)与本地日志文件(明文); 内存日志流供前端展示(服务层负责打码)。
 * 文件写满 10MB 时清空从头覆盖(先在流内发一行轮转说明)。
 * 方法返回日志流条目(无流时为 null), 供调用方后续替换(令牌打码)。
 */
function createLogger(defaultCategory = 'app', out = console.log) {
  const emit = (level, args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const { category, body } = parseCategory(msg);
    const line = `[${formatLocalTime()}] [${level}] [${category || defaultCategory}] ${body}`;
    // 文件写满: 清空后从头覆盖旧日志
    if (globalFileLog && globalFileLog.willOverflow(line)) {
      const marker = `[${formatLocalTime()}] [info] [startup] 日志文件已达 ${Math.round(globalFileLog.maxBytes / 1024 / 1024)}MB 上限, 清空后从头覆盖旧日志`;
      out(marker);
      globalFileLog.rotate();
      if (globalLogStream) globalLogStream.push(marker);
    }
    out(line);
    let entry = null;
    if (globalLogStream) entry = globalLogStream.push(line);
    if (globalFileLog) globalFileLog.append(line, entry ? entry.seq : null); // 文件保留明文
    return entry;
  };
  return {
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a)
  };
}

module.exports = { formatLocalTime, createLogger, setLogStream, getLogStream, setFileLog, getFileLog, maskKey, trustLevelFromTags };
