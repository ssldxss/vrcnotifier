'use strict';
// 好友行的"对外呈现"语义: pending 未决时优先展示目标态, 并标记为"可能<状态>"。
// pending_state 是待确认的目标态, state 是已确认(起始)态 —— 面板分组、QQ 在线列表都走这里,
// 不在各自的地方散判, 免得两边口径漂移。

const STATE_LABELS = { offline: '离线', active: '网页在线', online: '在线', web: '网页在线', unknown: '未知' };

/** 读层展示用的状态: 有 pending 就呈现目标态, 否则用已确认态 */
function displayState(row) {
  if (!row) return null;
  return row.pending_state || row.state || null;
}

/** 该行是否处于"待确认"窗口 */
function isPending(row) {
  return !!(row && row.pending_state);
}

function stateLabelOf(state) {
  return STATE_LABELS[state] || String(state);
}

/** pending 时的状态文案("可能离线"/"可能在线"/"可能网页在线"); 非 pending 返回 null */
function pendingLabel(row) {
  return isPending(row) ? `可能${stateLabelOf(displayState(row))}` : null;
}

module.exports = { STATE_LABELS, displayState, isPending, stateLabelOf, pendingLabel };
