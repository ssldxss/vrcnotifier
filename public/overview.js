'use strict';
// 概览条 + VRChat 状态 + WebSocket 曲线(canvas): 状态徽章、健康延迟、每分钟消息数、悬停气泡。
// 从 app.js 拆出; 纯映射在 statusmodel.js(有单测)。
// 本文件仍是传统脚本、函数保持全局, 所以 app.js 里的调用点无需改动。

// ---------- 状态与事件 ----------
function renderQqStatus(info) {
  const el = $('#stQq');
  if (!info || info.configured === false) {
    el.textContent = '未配置';
    el.className = 'badge';
    el.title = 'QQ 机器人未配置';
    return;
  }
  el.textContent = info.connected ? '已连接' : '未连接';
  el.className = 'badge ' + (info.connected ? 'ok' : 'warn');
  el.title = info.connected ? 'QQ 机器人已连接' : 'QQ 机器人未连接';
}

// 渲染状态负载(SSE 'status' 事件直接调用; loadStatus 为进入主界面的 bootstrap)
function renderStatus(d) {
  if (!d) return;
  const ws = $('#stWs');
  if (!d.loggedIn) { ws.textContent = '-'; ws.className = 'badge'; }
  else if (d.wsConnected) { ws.textContent = '已连接'; ws.className = 'badge ok'; }
  else { ws.textContent = '未连接/重连中'; ws.className = 'badge warn'; }
  $('#stSnapshot').textContent = d.lastSnapshotAt ? new Date(d.lastSnapshotAt).toLocaleTimeString() : '-';
  if (d.user) { myInfo = d.user; renderSelf(); }
  if (!d.qq || !d.qq.configured) renderQqStatus({ configured: false });
  else renderQqStatus({ configured: true, connected: d.qq.connected });
}

async function loadStatus() {
  const r = await api('GET', '/api/status');
  renderStatus(r.data || {});
}

// VRC 服务器状态由后端判断(惰性请求 + 60s 缓存; 获取失败时沿用上次成功状态), 前端只负责展示三态(主界面与登录页共用)
function applyVrcStatus(badge, d) {
  if (!d || d.state === 'unknown') {
    // 获取失败(后端明确返回 unknown): 灰色徽章 + 「无法获取」; 未返回数据时保持「-」
    const b = d ? VrcStatus.vrcBadge('unknown') : { text: '-', cls: 'badge' };
    badge.textContent = b.text;
    badge.className = b.cls;
    badge.title = (d && d.description)
      ? (d.description + (d.summary ? ' · ' + d.summary : ''))
      : 'VRChat 服务器状态检测中';
    return;
  }
  const detail = (d.description || '') +
    (d.summary ? ' · ' + d.summary : '') +
    (d.fetchedAt ? ' · 检测于 ' + new Date(d.fetchedAt).toLocaleTimeString() : '');
  const b = VrcStatus.vrcBadge(d.state);
  badge.textContent = b.text;
  badge.className = b.cls;
  badge.title = d.state === 'normal' ? 'VRChat 服务器正常' : detail;
}


function applyLatency(lat, d) {
  if (d.status === 'ok' && typeof d.latencyMs === 'number') {
    lat.textContent = '延迟: ' + d.latencyMs + ' ms';
    lat.className = 'ov-meta ' + VrcStatus.latencyClass(d.latencyMs);
  } else {
    lat.textContent = '延迟: -';
    lat.className = 'ov-meta';
  }
}

async function loadHealth() {
  let r, s;
  try {
    [r, s] = await Promise.all([
      api('GET', '/api/health'),
      api('GET', '/api/vrc-status')
    ]);
  } catch (e) { return; } // 后端未正确连接时由门禁/心跳弹窗兜底, 此处不抛未捕获异常
  const d = r.data || {};
  applyLatency($('#stHealthLatency'), d);
  applyLatency($('#lgHealthLatency'), d);
  applyVrcStatus($('#stHealth'), s.data);
  applyVrcStatus($('#lgHealth'), s.data);
}

// WS 图表: canvas 绘制(单图层栅格, 无合成层残留伪影), 时间锚定匀速左移; 柱高与次数严格成正比(线性)
let wsChartBars = [];      // { t, n } t = 秒级时间戳
let wsChartMax = 1;        // 当前窗口最大值(高度基准)
let wsStatsBuckets = new Map(); // sec -> n(最近 60s 秒桶, 用于「平均次数」总数增减)
let wsStatsTotal = 0;
let wsChartRaf = 0;
let wsChartCv = null;      // canvas 元素
let wsChartGradCache = { c1: '', c2: '', at: 0 };
let wsChartThemeCache = { bg: '', line: '', at: 0 };

// 柱子渐变配色: 从隐藏探针读取解析后的主题色(accent-2 柱顶 / accent 柱底), 与品牌渐变一致
function wsChartGradientColors() {
  const now = Date.now();
  if (!wsChartGradCache.c1 || now - wsChartGradCache.at > 500) {
    const probe = $('#wsChartColors');
    const cs = probe && getComputedStyle(probe);
    wsChartGradCache.c1 = (cs && cs.color) || '#8b5cf6';            // 柱顶: --accent-2
    wsChartGradCache.c2 = (cs && cs.backgroundColor) || '#3b6fe0';  // 柱底: --accent
    wsChartGradCache.at = now;
  }
  return wsChartGradCache;
}

// 图表自身的背景/描边色(取自 #log 的 input-bg / line 解析值), 全部画进 canvas, 外层无任何 CSS 装饰
function wsChartTheme() {
  const now = Date.now();
  if (!wsChartThemeCache.bg || now - wsChartThemeCache.at > 500) {
    const log = $('#log');
    const cs = log && getComputedStyle(log);
    wsChartThemeCache.bg = (cs && cs.backgroundColor) || 'rgba(255,255,255,0.05)';
    wsChartThemeCache.line = (cs && cs.borderTopColor) || 'rgba(255,255,255,0.085)';
    wsChartThemeCache.at = now;
  }
  return wsChartThemeCache;
}

function wsChartRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wsChartDraw() {
  const cv = wsChartCv || (wsChartCv = $('#wsChart'));
  if (!cv) { wsChartRaf = 0; return; }
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, Math.round(cv.clientWidth * dpr));
  const h = Math.max(10, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  // 背景/描边在设备像素空间精确落格(避免亮边); 柱子横向用亚像素坐标保证滑动丝滑
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const theme = wsChartTheme();
  const radius = Math.round(7 * dpr);
  ctx.fillStyle = theme.bg;
  wsChartRoundRect(ctx, 0, 0, w, h, radius);
  ctx.fill();
  const nowSec = Date.now() / 1000;
  const sx = w / 300, sy = h / 28;
  // 清理滚出左端的柱子(峰值柱滚出后重算高度基准)
  let pruned = false;
  for (let i = wsChartBars.length - 1; i >= 0; i--) {
    const b = wsChartBars[i];
    if (300 - (nowSec - b.t) * 5 + 5 <= 0) { wsChartBars.splice(i, 1); pruned = true; }
  }
  if (pruned) {
    let m = 0;
    for (const b of wsChartBars) if (b.n > m) m = b.n;
    wsChartMax = m || 1;
  }
  ctx.globalAlpha = .95;
  const grad = wsChartGradientColors();
  const inset = Math.max(2, Math.round(2 * dpr));
  for (const b of wsChartBars) {
    if (!b.n) continue; // 0 条消息不显示柱子
    const x0 = (300 - (nowSec - b.t) * 5) * sx;
    if (x0 + 5 * sx <= 0) continue;
    const hh = 26 * (b.n / wsChartMax); // 相对高度严格和次数成正比
    const yBot = Math.round(28 * sy) - inset; // 底边留出描边 + 空隙
    const yTop = Math.min(Math.round((28 - hh) * sy), yBot - 1);
    const bw = 4 * sx;
    const bh = Math.max(1, yBot - yTop);
    // 长方体蓝色柱子(主题蓝 accent), 四角圆滑处理
    ctx.fillStyle = grad.c2;
    // 横向亚像素绘制: 每帧连续位移(此前取整导致 ~6 帧跳 1px 的卡顿感)
    wsChartRoundRect(ctx, x0, yTop, bw, bh, Math.min(1.6 * sx, bw / 2, bh / 2));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1; // 1 设备像素, 0.5 偏移精确落格
  wsChartRoundRect(ctx, 0.5, 0.5, w - 1, h - 1, radius);
  ctx.stroke();
  wsChartUpdateHover();
  wsChartRaf = requestAnimationFrame(wsChartDraw);
}
let wsChartTipVisible = false;   // 提示处于显示或淡出阶段
let wsChartTipHiding = false;    // 淡出进行中
let wsChartTipDoneTimer = 0;
let wsChartDwellTimer = 0;
let wsChartLastHitAt = 0;
let wsChartLastBar = null;
let wsChartTipEl = null;
let wsChartMouse = null;   // { x } viewBox 坐标, 鼠标在图表内时非空
let wsChartBound = false;
const WS_CHART_DWELL_MS = 500;  // 停留超过此时长才显示
const WS_CHART_GRACE_MS = 500;  // 离开柱子后的宽限(桥接柱间 1px 间隙), 之后开始淡出
const WS_CHART_FADE_MS = 1000;  // 淡入/淡出时长

function bindWsChartHover() {
  if (wsChartBound) return;
  wsChartBound = true;
  const svg = $('#wsChart');
  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    wsChartMouse = { x: (e.clientX - r.left) / r.width * 300 };
    wsChartUpdateHover();
  });
  svg.addEventListener('mouseleave', () => {
    wsChartMouse = null;
    wsChartUpdateHover();
  });
  // 失焦时收起提示并清空悬停状态(动画照常运行), 聚焦后鼠标移动会自然恢复
  window.addEventListener('blur', () => {
    wsChartMouse = null;
    if (wsChartDwellTimer) { clearTimeout(wsChartDwellTimer); wsChartDwellTimer = 0; }
    wsChartHideTip();
  });
}

function wsChartBarAt(mx) {
  const nowSec = Date.now() / 1000;
  const barW = 300 / 60;
  // 命中范围: 柱子本身 + 左右各 1 个柱宽(合计 3 个柱宽); 重叠时取距离最近的柱子
  let best = null;
  let bestD = Infinity;
  for (const b of wsChartBars) {
    const x = 300 - (nowSec - b.t) * barW;
    const d = Math.abs(mx - (x + barW / 2));
    if (d <= barW * 1.5 && d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function wsChartTrackTip(bar) {
  if (!wsChartTipEl || !bar) return;
  const svg = $('#wsChart');
  const r = svg.getBoundingClientRect();
  const nowSec = Date.now() / 1000;
  const barW = 300 / 60;
  const x = 300 - (nowSec - bar.t) * barW;
  wsChartTipEl.style.left = (r.left + (x + barW / 2) / 300 * r.width) + 'px';
  wsChartTipEl.style.top = (r.bottom + 8) + 'px'; // 提示框放在柱子下方
}

function wsChartShowTip(bar) {
  if (!bar) return;
  if (wsChartTipDoneTimer) { clearTimeout(wsChartTipDoneTimer); wsChartTipDoneTimer = 0; }
  wsChartTipHiding = false;
  wsChartTipVisible = true;
  if (!wsChartTipEl) {
    wsChartTipEl = document.createElement('div');
    wsChartTipEl.className = 'ws-chart-tip hidden';
    wsChartTipEl.style.transition = 'opacity ' + (WS_CHART_FADE_MS / 1000) + 's ease, transform ' + (WS_CHART_FADE_MS / 1000) + 's ease';
    document.body.appendChild(wsChartTipEl);
  }
  wsChartTipEl.textContent = bar.n + ' 条消息';
  wsChartTipEl.classList.remove('hidden');
  wsChartTrackTip(bar);
}

function wsChartHideTip() {
  if (!wsChartTipEl) return;
  wsChartTipHiding = true;
  wsChartTipEl.classList.add('hidden');
  if (!wsChartTipDoneTimer) {
    wsChartTipDoneTimer = setTimeout(() => {
      wsChartTipDoneTimer = 0;
      wsChartTipHiding = false;
      wsChartTipVisible = false;
    }, WS_CHART_FADE_MS);
  }
}

function wsChartUpdateHover() {
  const bar = (wsChartMouse && wsChartBars.length) ? wsChartBarAt(wsChartMouse.x) : null;
  const now = Date.now();
  if (bar) {
    wsChartLastHitAt = now;
    wsChartLastBar = bar;
    if (wsChartTipHiding) {
      wsChartShowTip(bar); // 淡出中重新命中: 取消淡出并恢复显示
    } else if (wsChartTipVisible) {
      wsChartShowTip(bar); // 已显示: 内容与位置随柱子每帧同步
    } else if (!wsChartDwellTimer) {
      // 停留超过阈值才显示
      wsChartDwellTimer = setTimeout(() => {
        wsChartDwellTimer = 0;
        if (Date.now() - wsChartLastHitAt <= WS_CHART_GRACE_MS) wsChartShowTip(wsChartLastBar);
      }, WS_CHART_DWELL_MS);
    }
  } else if (wsChartTipHiding) {
    wsChartTrackTip(wsChartLastBar); // 淡出期间继续跟随柱子移动
  } else if (wsChartTipVisible) {
    if (now - wsChartLastHitAt > WS_CHART_GRACE_MS) {
      wsChartHideTip(); // 鼠标离开或柱子移开超过宽限 → 开始淡出
    } else {
      wsChartTrackTip(wsChartLastBar); // 宽限期内(柱间间隙)仍跟随
    }
  } else if (wsChartDwellTimer && now - wsChartLastHitAt > WS_CHART_GRACE_MS) {
    clearTimeout(wsChartDwellTimer);
    wsChartDwellTimer = 0;
  }
}

function renderWsChart(series) {
  bindWsChartHover();
  if (!series || !series.length) { wsChartBars = []; wsChartMax = 1; return; }
  const nowSec = Date.now() / 1000;
  let max = 0;
  const buckets = [];
  for (let i = 0; i < series.length; i++) {
    const n = series[i];
    if (!n) continue;
    if (n > max) max = n;
    buckets.push({ t: nowSec - (series.length - 1 - i), n });
  }
  wsChartMax = max || 1;
  wsChartBars = buckets.filter((b) => 300 - (nowSec - b.t) * 5 + 5 > 0);
  if (!wsChartRaf) wsChartRaf = requestAnimationFrame(wsChartDraw);
  wsChartUpdateHover();
}

// 平均次数更新: 数值变化时旧值向上滚出、新值从下方滚入
function setWsTotal(total) {
  const num = $('#stWsNum');
  if (!num) return;
  const txt = String(total);
  if (num.dataset.val === txt) return;
  num.dataset.val = txt;
  const wrap = num.parentElement;
  const old = document.createElement('span');
  old.className = 'ws-old';
  old.textContent = num.textContent;
  // 滚动期间槽位宽度取新旧较宽者, 右对齐不变; 动画结束后收缩到新值宽度, 不留多余空格
  wrap.style.minWidth = Math.max(old.textContent.length, txt.length) + 'ch';
  num.textContent = txt;
  num.getAnimations().forEach((a) => a.cancel()); // 打断进行中的动画, 避免叠加抖动
  num.classList.remove('roll');
  void num.offsetWidth; // 强制重排, 重启动画
  num.classList.add('roll');
  wrap.appendChild(old);
  const done = () => {
    old.remove();
    wrap.style.minWidth = txt.length + 'ch';
  };
  old.addEventListener('animationend', done, { once: true });
}

// SSE 每秒推送: 追加/更新秒桶; 运动仍由 rAF 按时间锚定匀速左移, 与推送节奏无关
function wsChartPush(sec, n) {
  const nowSec = Date.now() / 1000;
  if (sec < nowSec - 60 || sec > nowSec + 1) return;
  const prev = wsStatsBuckets.get(sec) || 0;
  if (prev !== n) {
    wsStatsTotal += n - prev;
    wsStatsBuckets.set(sec, n);
    setWsTotal(wsStatsTotal);
  }
  let pruned = false;
  for (const s of [...wsStatsBuckets.keys()]) {
    if (s < nowSec - 60) { wsStatsTotal -= wsStatsBuckets.get(s) || 0; wsStatsBuckets.delete(s); pruned = true; }
  }
  if (pruned) setWsTotal(wsStatsTotal); // 过期秒桶退出窗口: 数字实时回落
  const i = wsChartBars.findIndex((b) => b.t === sec);
  if (n > 0) {
    if (i >= 0) wsChartBars[i].n = n;
    else wsChartBars.push({ t: sec, n });
    if (n > wsChartMax) wsChartMax = n;
  } else if (i >= 0) {
    wsChartBars.splice(i, 1); // 0 条消息不显示柱子
  }
  if (!wsChartRaf) wsChartRaf = requestAnimationFrame(wsChartDraw);
}

// 图表仅在视口内逐帧绘制: 滚动到下方(概览条离开屏幕)时暂停 rAF, 页面滚轮更丝滑
if ('IntersectionObserver' in window && $('#wsChart')) {
  new IntersectionObserver((entries) => {
    const vis = entries.some((e) => e.isIntersecting);
    if (vis) {
      if (!wsChartRaf) wsChartRaf = requestAnimationFrame(wsChartDraw);
    } else if (wsChartRaf) {
      cancelAnimationFrame(wsChartRaf);
      wsChartRaf = 0;
    }
  }).observe($('#wsChart'));
}

async function loadWsStats() {
  const r = await api('GET', '/api/ws-stats');
  if (!r.data || !Array.isArray(r.data.series)) return;
  // 权威序列 bootstrap(进入主界面/SSE 重连时): 重建本地秒桶与总量,
  // 覆盖断线期间漏掉的秒; 与推送重复的秒数据一致, 不产生重影
  wsStatsTotal = r.data.total || 0;
  wsStatsBuckets.clear();
  const endSec = Math.floor(Date.now() / 1000);
  for (let i = 0; i < r.data.series.length; i++) {
    const n = r.data.series[i];
    if (n) wsStatsBuckets.set(endSec - (r.data.series.length - 1 - i), n);
  }
  setWsTotal(wsStatsTotal);
  renderWsChart(r.data.series.slice(-60));
}
