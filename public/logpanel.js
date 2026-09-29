'use strict';
// 后端日志面板: 行渲染 / 顶部直播 / 底部翻页 / 按 seq 替换 / 窗口裁剪 / 筛选查询 / 拉取。
// 从 app.js 拆出; 纯解析逻辑在 logparse.js(有单测)。
// 本文件仍是传统脚本、函数保持全局, 所以 app.js 里的调用点无需改动。

let lastLogSeq = null;        // 最新已展示的 seq(仅由真正插入 DOM 顶部的行维护; 补缺口起点)
let oldestSeqShown = null;   // 当前 DOM 中最早一行的 seq(向上翻页起点)
let hasOlder = true;         // 服务端是否还有更旧的历史
let loadingOlder = false;    // 防止重复翻页
let loadMoreRow = null;      // 底部「加载更早日志」占位行

// ---------- 日志行渲染(OpenClash 观感): [时间] [级别] [分类] 正文 → 级别词着色 + 分类徽章 ----------
let logLevelSel = null; // 多选下拉: 选中集合在 selectedValues (Set); 选中集合=显示集合, 默认全选
let logCatSel = null;   // 多选下拉: 选中集合在 selectedValues (Set)


function renderLogRow(div, line) {
  div.className = 'log-row';
  const p = VrcLogParse.parseLogLine(line);
  if (!p) { // 无法解析的行按原样显示, 始终显示(不受任何筛选)
    div.textContent = line;
    div.dataset.raw = '1';
    return;
  }
  delete div.dataset.raw; // 重渲染(令牌打码替换)时统一还原 raw 标记
  div.textContent = '';
  const tm = document.createElement('span');
  tm.className = 'log-time';
  tm.textContent = VrcLogParse.shortTime(p.time); // HH:mm:ss
  tm.title = p.time;                 // 完整日期时间悬浮显示
  const lv = document.createElement('span');
  lv.className = 'log-lv lv-' + p.level;
  lv.textContent = p.level;
  const cat = document.createElement('span');
  cat.className = 'log-cat cat-' + (VrcLogParse.catClass(p.cat));
  cat.textContent = p.cat;
  const body = document.createElement('span');
  body.className = 'log-body';
  body.textContent = p.body;
  div.append(tm, lv, cat, body);
  div.dataset.level = p.level;
  div.dataset.cat = VrcLogParse.catClass(p.cat);
}

function setRowVisible(row) {
  if (row.dataset.raw) { row.classList.remove('hidden'); return; } // 无法解析的行始终显示, 不受任何筛选
  const lvSel = logLevelSel ? logLevelSel.selectedValues : null;
  const catSel = logCatSel ? logCatSel.selectedValues : null;
  const show = (!lvSel || lvSel.has(row.dataset.level))
    && (!catSel || catSel.has(row.dataset.cat));
  row.classList.toggle('hidden', !show);
}

// 新日志: 插到顶部(seq 用于令牌行替换、翻页定位与去重)
function addLogLine(line, seq) {
  const box = $('#log');
  // 防重: SSE 直播行与 after 补缺口响应可能包含同一条(重连竞态), 已有该 seq 则跳过
  if (seq !== undefined && box.querySelector('div[data-seq="' + seq + '"]')) return;
  const div = document.createElement('div');
  renderLogRow(div, line);
  if (seq !== undefined) div.dataset.seq = seq;
  const wasAtTop = box.scrollTop <= 2;          // 是否正停留在顶部跟随最新
  const beforeH = box.scrollHeight;
  box.insertBefore(div, box.firstChild);        // 新的日志在上面
  trimLogWindow(box, 'live');                   // 总窗口封顶: 从底部裁最老行(可翻页拉回)
  updateOldestSeq();
  setRowVisible(div);
  // 最新已展示 seq 只由真正插入的行维护(补缺口以此为起点, 不多不少)
  if (seq !== undefined && (lastLogSeq == null || seq > lastLogSeq)) lastLogSeq = seq;
  if (wasAtTop) box.scrollTop = 0;              // 停顶部时保持跟随最新
  else box.scrollTop += box.scrollHeight - beforeH; // 正在阅读旧日志时保持视口不跳动
}

// 旧日志: 追加到底部(向上翻页加载), 不触发顶部跟随逻辑
function addOldLogLine(line, seq) {
  const box = $('#log');
  if (seq !== undefined && box.querySelector('div[data-seq="' + seq + '"]')) return; // 兜底去重
  const div = document.createElement('div');
  renderLogRow(div, line);
  if (seq !== undefined) div.dataset.seq = seq;
  if (loadMoreRow) box.insertBefore(div, loadMoreRow);
  else box.appendChild(div);
  trimLogWindow(box, 'older');                  // 总窗口封顶: 从顶部裁最新行(可 tail 重载拉回)
  updateOldestSeq();
  setRowVisible(div);
}

// 窗口裁剪: 直播/翻页统一 5000 行上限(VrcLogView.plan), 方向感知 —— 裁远离焦点的一侧
function trimLogWindow(box, mode) {
  const p = VrcLogView.plan({ totalRows: box.children.length, mode });
  for (let i = 0; i < p.count; i++) {
    if (p.side === 'bottom') {
      // 底部最老行: loadMoreRow 挂在最末时, 裁它前面的那一行
      const last = box.lastChild;
      if (!last) break;
      if (last === loadMoreRow) {
        if (!last.previousSibling) break;
        box.removeChild(last.previousSibling);
      } else {
        box.removeChild(last);
      }
    } else {
      const first = box.firstChild;
      if (!first) break;
      box.removeChild(first);
    }
  }
}

function updateOldestSeq() {
  const rows = $('#log').querySelectorAll('div[data-seq]');
  oldestSeqShown = rows.length ? Number(rows[rows.length - 1].dataset.seq) : null;
}

// 服务端日志行替换(令牌打码): 按 seq 同步已显示的行
function replaceLogLine(seq, line) {
  const el = $('#log').querySelector('div[data-seq="' + seq + '"]');
  if (!el) return;
  renderLogRow(el, line);
  setRowVisible(el);
}

function showLoadMore() {
  const box = $('#log');
  loadMoreRow = document.createElement('div');
  loadMoreRow.className = 'muted';
  loadMoreRow.textContent = '加载更早日志...';
  box.appendChild(loadMoreRow);
}
function clearLoadMore() {
  if (loadMoreRow) { loadMoreRow.remove(); loadMoreRow = null; }
}

// 当前筛选参数(等级/分类多选集合), 附加到所有日志请求: 服务端在文件里直接凑满一页匹配行,
// 避免「前端缓存里没有、后端文件里有」的历史消息翻不出来。
// 协议: 参数省略=该维度不过滤; 空串=不匹配任何行; 逗号分隔=选中集合。
function logFilterQuery() {
  const csv = (el) => Array.from(el.options).map((o) => o.value)
    .filter((v) => el.selectedValues.has(v)).join(',');
  let q = '';
  if (logLevelSel) q += '&level=' + encodeURIComponent(csv(logLevelSel));
  if (logCatSel) q += '&cat=' + encodeURIComponent(csv(logCatSel));
  return q;
}

// 后端日志: 拉取历史(tail) / 增量补齐(after, SSE 断线重连) / 向前翻页(before, 滚动加载)
function loadBackendLogs(opts = {}) {
  const fq = logFilterQuery();
  const query = opts.after
    ? 'after=' + opts.after + fq
    : opts.before
      ? 'before=' + opts.before + '&limit=100' + fq
      : 'tail=' + (opts.tail || 100) + fq;
  return api('GET', '/api/logs?' + query)
    .then((r) => {
      if (!r || !r.data || !Array.isArray(r.data.logs)) return;
      if (!opts.after && !opts.before) {
        const box = $('#log');
        box.textContent = '';
        oldestSeqShown = null;
        lastLogSeq = null;   // 最新已展示 seq 重置, 由随后插入的行重新建立
        hasOlder = true;     // 重载后重新允许翻页
      }
      if (opts.before) {
        // 服务端返回从旧到新; 倒序追加: 更旧的行垫底, 块内保持时间递减(新的在上面)
        for (let i = r.data.logs.length - 1; i >= 0; i--) {
          const entry = r.data.logs[i];
          addOldLogLine(entry.line, entry.seq);
        }
        hasOlder = r.data.logs.length >= 100; // 服务端凑不满一页 = 文件已扫完
      } else {
        for (const entry of r.data.logs) addLogLine(entry.line, entry.seq);
      }
      if (!opts.after && !opts.before && lastLogSeq != null) {
        // 重载期间可能有新行已写入文件(不在本次快照里): 补拉一次, 去重守卫保证不多不少
        loadBackendLogs({ after: lastLogSeq });
      }
    })
    .catch(() => {});
}

// 滚动到底自动加载更旧日志(后端多段文件存储, 跨段翻页; 前端不缓存, 随滚动实时加载)
$('#log').addEventListener('scroll', () => {
  const box = $('#log');
  if (!hasOlder || loadingOlder) return;
  if (oldestSeqShown != null && box.scrollHeight - box.scrollTop - box.clientHeight < 60) {
    loadingOlder = true;
    showLoadMore();
    loadBackendLogs({ before: oldestSeqShown }).finally(() => {
      clearLoadMore();
      loadingOlder = false;
    });
  }
});
