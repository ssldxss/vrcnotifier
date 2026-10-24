'use strict';
// Dashboard logs controller. Dependencies are explicit; local UI state stays private.
window.VrcDashboardLogs = {
  create(context) {
    const { $, state, api } = context;
    // ---------- 后端日志(复用旧前端 logparse.js 的解析与 app.css 的 #log 样式) ----------
    const LOG_TAIL = 120;
    const LOG_MORE = 100;
    const LOG_MAX_ROWS = 3000;
    const logState = { oldestSeq: null, lastSeq: null, hasOlder: true, loading: false, ready: false, reqId: 0, pendingReset: false, pendingLive: null };

    function logBox() { return $('#log'); }
    function logSelCsv(sel) {
      if (!sel || !sel.selectedValues) return '';
      return Array.from(sel.options).map((o) => o.value).filter((v) => sel.selectedValues.has(v)).join(',');
    }
    function logFilterQuery() {
      return '&level=' + encodeURIComponent(logSelCsv($('#logLevelSel'))) +
        '&cat=' + encodeURIComponent(logSelCsv($('#logCatSel')));
    }
    function logMatches(line) {
      const p = window.VrcLogParse.parseLogLine(line);
      if (!p) return true; // 解析不了的行始终显示(与旧前端一致)
      const levels = $('#logLevelSel').selectedValues;
      const cats = $('#logCatSel').selectedValues;
      if (levels && !levels.has(p.level)) return false;
      if (cats && !cats.has(p.cat)) return false;
      return true;
    }
    function renderLogRow(div, line) {
      div.className = 'log-row';
      const p = window.VrcLogParse.parseLogLine(line);
      if (!p) { div.textContent = line; div.dataset.raw = '1'; return; }
      delete div.dataset.raw;
      div.textContent = '';
      const tm = document.createElement('span');
      tm.className = 'log-time';
      tm.textContent = window.VrcLogParse.shortTime(p.time);
      tm.title = p.time;
      const lv = document.createElement('span');
      lv.className = 'log-lv lv-' + p.level;
      lv.textContent = p.level;
      const cat = document.createElement('span');
      cat.className = 'log-cat cat-' + window.VrcLogParse.catClass(p.cat);
      cat.textContent = p.cat;
      const body = document.createElement('span');
      body.className = 'log-body';
      body.textContent = p.body;
      div.append(tm, lv, cat, body);
    }
    // 方向性裁剪(复用 logview 的纯策略): 直播从底部裁最老, 翻旧页从顶部裁最新;
    // 否则翻页刚插入的旧日志会被立刻删掉, 游标却已前进 → 永久丢历史。
    function trimLogRows(mode) {
      const box = logBox();
      if (!box) return 0;
      const plan = window.VrcLogView.plan({ totalRows: box.children.length, maxRows: LOG_MAX_ROWS, mode });
      let removed = 0;
      for (let i = 0; i < plan.count; i++) {
        const child = plan.side === 'top' ? box.firstChild : box.lastChild;
        if (!child) break;
        box.removeChild(child);
        removed++;
      }
      return removed;
    }
    // 裁剪后按 DOM 里实际保留的最老一行回写 oldestSeq, 避免 before= 游标指向已被裁掉的历史
    function syncOldestSeqFromDom() {
      const box = logBox();
      if (!box) return;
      const rows = box.querySelectorAll('div[data-seq]');
      if (!rows.length) { logState.oldestSeq = null; return; }
      const oldest = Number(rows[rows.length - 1].dataset.seq);
      if (Number.isFinite(oldest)) logState.oldestSeq = oldest;
    }
    function setLoadMore(show) {
      const box = logBox();
      let row = box.querySelector('.log-more');
      if (show) {
        if (!row) {
          row = document.createElement('div');
          row.className = 'log-more muted';
          row.textContent = '加载更早日志…';
          box.appendChild(row);
        }
      } else if (row) row.remove();
    }
    function addLogLine(line, seq, older) {
      const box = logBox();
      if (!box) return;
      if (seq != null && box.querySelector('div[data-seq="' + seq + '"]')) return; // 去重(SSE 与补拉竞态)
      const div = document.createElement('div');
      renderLogRow(div, line);
      if (seq != null) div.dataset.seq = seq;
      if (older) {
        const more = box.querySelector('.log-more');
        if (more) box.insertBefore(div, more);
        else box.appendChild(div);
        trimLogRows('older');
        if (seq != null && (logState.oldestSeq == null || seq < logState.oldestSeq)) logState.oldestSeq = seq;
      } else {
        const wasAtTop = box.scrollTop <= 2;
        const beforeH = box.scrollHeight;
        box.insertBefore(div, box.firstChild);
        // 只有真的裁掉了行才重算游标(否则每次实时日志都扫一遍 DOM, 开销不必要)
        if (trimLogRows('live') > 0) syncOldestSeqFromDom();

        if (wasAtTop) box.scrollTop = 0;
        else box.scrollTop += box.scrollHeight - beforeH; // 阅读旧日志时视口不跳动
        if (seq != null && (logState.lastSeq == null || seq > logState.lastSeq)) logState.lastSeq = seq;
        if (logState.oldestSeq == null) logState.oldestSeq = seq;
      }
    }
    function receiveLog(entry, replacement = false) {
      if (!state.settingsOpen || !logState.inited || !entry || entry.seq == null) return;
      if (logState.pendingLive) logState.pendingLive.set(entry.seq, entry);
      if (replacement) replaceLogRecord(entry.seq, entry.line);
      else if (logMatches(entry.line)) addLogLine(entry.line, entry.seq, false);
    }
    async function loadLogs(reset) {
      const box = logBox();
      if (!box) return;
      if (logState.loading) {
        // 加载中改筛选: 记下待重载, 作废本轮响应, 等它结束后按新条件重拉
        if (reset !== false) { logState.reqId++; logState.pendingReset = true; }
        return;
      }
      logState.loading = true;
      const reqId = ++logState.reqId;
      if (reset !== false) logState.pendingLive = new Map();
      try {
        const q = reset === false && logState.oldestSeq != null
          ? 'before=' + logState.oldestSeq + '&limit=' + LOG_MORE
          : 'tail=' + LOG_TAIL;
        const r = await api('GET', '/api/logs?' + q + logFilterQuery());
        if (reqId !== logState.reqId) return; // 已被更新的筛选请求取代
        let logs = (r.data && r.data.logs) || [];
        if (reset !== false) {
          const merged = new Map(logs.map((entry) => [entry.seq, entry]));
          for (const [seq, entry] of logState.pendingLive || []) merged.set(seq, entry);
          logs = [...merged.values()].filter((entry) => logMatches(entry.line)).sort((a, b) => a.seq - b.seq);
          box.textContent = '';
          logState.lastSeq = null;
          logState.oldestSeq = null;
          logState.hasOlder = true;
          for (const entry of logs) addLogLine(entry.line, entry.seq, false);
          box.scrollTop = 0; // 最新日志在最上面
          if (!logs.length) box.innerHTML = '<div class="muted">暂无日志</div>';
        } else {
          for (let i = logs.length - 1; i >= 0; i--) addLogLine(logs[i].line, logs[i].seq, true);
          logState.hasOlder = logs.length >= LOG_MORE;
          if (!logState.hasOlder) setLoadMore(false);
        }
        logState.ready = true;
      } catch (e) { /* 保留已显示的日志 */ }
      finally {
        // 无论是否被新请求取代/异常, 都要释放 loading 并处理待重载, 否则日志面板会永久卡死
        logState.loading = false;
        logState.pendingLive = null;
        if (logState.pendingReset) { logState.pendingReset = false; loadLogs(true); }
      }
    }
    // SSE 重连补缺口: after= 已展示的最新 seq
    async function loadLogsGap() {
      if (!logState.ready || logState.lastSeq == null) return;
      try {
        const r = await api('GET', '/api/logs?after=' + logState.lastSeq + logFilterQuery());
        const logs = (r.data && r.data.logs) || [];
        for (const entry of logs) if (logMatches(entry.line)) addLogLine(entry.line, entry.seq, false);
      } catch (e) { /* ignore */ }
    }
    // 按 seq 替换一行(令牌打码后的行更新)
    function replaceLogRecord(seq, line) {
      const box = logBox();
      if (!box) return;
      const el = box.querySelector('div[data-seq="' + seq + '"]');
      if (!el) return;
      renderLogRow(el, line);
      el.dataset.seq = seq;
    }
    function initLogPanel() {
      if (logState.inited) { loadLogs(true); return; }
      logState.inited = true;
      window.VrcDropdown.makeDropdown($('#logLevelSel'), { multi: true, label: '等级' });
      window.VrcDropdown.makeDropdown($('#logCatSel'), { multi: true, label: '分类' });
      // 恢复旧前端保存的筛选(localStorage 同一个 key)
      try {
        const saved = JSON.parse(localStorage.getItem('vrcnotifier.logFilter') || 'null');
        if (saved && typeof saved === 'object') {
          for (const [el, key] of [[$('#logLevelSel'), 'level'], [$('#logCatSel'), 'cat']]) {
            if (!el || !el.selectedValues || !Array.isArray(saved[key])) continue;
            const valid = saved[key].filter((v) => Array.from(el.options).some((o) => o.value === v));
            el.selectedValues.clear();
            for (const v of valid) el.selectedValues.add(v);
            if (el.syncDd) el.syncDd();
          }
        }
      } catch (e) { /* 缓存不可用, 用默认全选 */ }
      const saveFilter = () => {
        try {
          localStorage.setItem('vrcnotifier.logFilter', JSON.stringify({
            level: Array.from($('#logLevelSel').selectedValues || []),
            cat: Array.from($('#logCatSel').selectedValues || [])
          }));
        } catch (e) { /* ignore */ }
      };
      for (const id of ['#logLevelSel', '#logCatSel']) {
        $(id).addEventListener('change', () => { saveFilter(); loadLogs(true); });
      }
      $('#log').addEventListener('scroll', () => {
        const b = $('#log');
        if (!logState.hasOlder || logState.loading) return;
        if (logState.oldestSeq != null && b.scrollHeight - b.scrollTop - b.clientHeight < 60) {
          setLoadMore(true);
          loadLogs(false).then(() => { if (!logState.loading) setLoadMore(false); });
        }
      });
      loadLogs(true);
    }

    return { initLogPanel, receiveLog, loadLogsGap };
  }
};
