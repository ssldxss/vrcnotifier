'use strict';
// 通知模板渲染(仅 QQ 渠道; 邮件/Gotify/NTFY/Webhook 已移除)。

const { statusEmoji } = require('./qq-commands');
function renderTemplate(template, vars) {
  if (!template) return '';
  let result = String(template);
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(value == null ? '' : String(value));
  }
  return result;
}

// 社交状态(status): active/join me/ask me/busy
const SOCIAL_STATUS_LABELS = { active: '在线', 'join me': '加入我', 'ask me': '询问我', busy: '忙碌' };
function statusLabel(status) {
  return SOCIAL_STATUS_LABELS[status] || String(status);
}

// 在线状态(state): offline/active(网页在线)/online(游戏在线)
const STATE_LABELS = { offline: '离线', active: '网页在线', online: '在线', web: '网页在线', unknown: '未知' };
function stateLabel(state) {
  return STATE_LABELS[state] || String(state);
}

/** 转义 markdown 特殊字符(昵称/世界名等动态内容插入前使用) */
function escapeMd(s) {
  return String(s).replace(/([\\`*_[\]{}()#+\-.>|~])/g, '\\$1');
}

function isVrcNotification(change) {
  return !!(change && (change.eventType === 'vrc_notification' || change.eventType === 'vrc_system'));
}

const NOTIFICATION_MESSAGE = '{notificationBody}\n发送者: {friendName}\n{categoryOrWorld}\n时间: {timestamp}';
/** 渲染站内通知消息; 空正文/无分类产生的空行直接剔除 */
function renderNotificationMessage(vars, template) {
  return renderTemplate(template || NOTIFICATION_MESSAGE, vars)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/** 统一变化变量; 空描述显示为 "无" */
function buildChangeVars(change) {
  const vars = {
    friendName: change.friendName || '',
    oldState: stateLabel(change.oldState) || '未知',
    newState: stateLabel(change.newState) || '未知',
    oldStatus: statusLabel(change.oldStatus) || '未知',
    newStatus: statusLabel(change.newStatus) || '未知',
    oldStatusEmoji: statusEmoji(change.oldStatus),
    newStatusEmoji: statusEmoji(change.newStatus),
    oldWorld: change.oldWorld || '-',
    newWorld: change.newWorld || '-',
    changeType: change.changeType || '',
    timestamp: change.timestamp || '',
    oldStatusDescription: change.oldStatusDescription || '无',
    newStatusDescription: change.newStatusDescription || '无',
    oldPlatform: change.oldPlatform === 'web' ? '网页端' : (change.oldPlatform || '未知'),
    newPlatform: change.newPlatform === 'web' ? '网页端' : (change.newPlatform || '未知'),
    notificationTitle: change.notificationTitle || '',
    notificationBody: change.notificationBody != null ? change.notificationBody : (change.newStatusDescription || ''),
    notificationCategory: change.notificationCategory || '',
    notificationCategoryLabel: change.notificationCategoryLabel || change.notificationCategory || '',
    categoryOrWorld: change.categoryOrWorld || ''
  };
  return vars;
}

/** 状态变化消息结构: 社交行(emoji+自定义状态, 无则社交状态名, 变化用箭头), 其余字段变化放前 */
function buildStatusLines(vars) {
  const oldSocial = `${vars.oldStatusEmoji} ${vars.oldStatusDescription !== '无' ? vars.oldStatusDescription : vars.oldStatus}`;
  const newSocial = `${vars.newStatusEmoji} ${vars.newStatusDescription !== '无' ? vars.newStatusDescription : vars.newStatus}`;
  const social = oldSocial !== newSocial ? `${oldSocial} → ${newSocial}` : newSocial;
  const fields = [
    { label: '状态', old: vars.oldState, cur: vars.newState },
    { label: '世界', old: vars.oldWorld, cur: vars.newWorld },
    { label: '平台', old: vars.oldPlatform, cur: vars.newPlatform }
  ];
  const changed = [];
  const unchanged = [];
  for (const f of fields) {
    if (f.old !== f.cur) changed.push(`${f.label}: ${f.old} → ${f.cur}`);
    else unchanged.push(`${f.label}: ${f.cur}`);
  }
  return { social, socialChanged: oldSocial !== newSocial, changed, unchanged };
}

function buildQq(change, opts = {}) {
  const vars = buildChangeVars(change);
  if (isVrcNotification(change)) {
    return {
      title: opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : `# ${escapeMd(vars.notificationTitle)}`,
      message: opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : escapeMd(renderNotificationMessage(vars))
    };
  }
  const title = opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : `# ${escapeMd(change.friendName)}${escapeMd(change.changeType)}`;
  const b = buildStatusLines(vars);
  const lines = [
    b.socialChanged ? `**${escapeMd(b.social)}**` : escapeMd(b.social),
    ...b.changed.map((l) => `**${escapeMd(l)}**`),
    ...b.unchanged.map((l) => escapeMd(l))
  ];
  const message = opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : `${lines.join('\n')}\n时间: ${vars.timestamp}`;
  return { title, message };
}

module.exports = {
  renderTemplate, statusLabel, stateLabel, escapeMd, buildChangeVars, buildQq
};
