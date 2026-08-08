'use strict';
// 通知模板渲染与各渠道 payload 构建。

function renderTemplate(template, vars) {
  if (!template) return '';
  let result = String(template);
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(value == null ? '' : String(value));
  }
  return result;
}

function statusLabel(status) {
  const map = {
    offline: '离线', active: '在线', 'join me': '加入我', 'ask me': '询问我', busy: '忙碌',
    web: '网页端', online: '在线', unknown: '未知'
  };
  return map[status] || String(status);
}

/** RFC 2047 编码(用于 NTFY Title 等只支持 ASCII header 的场景) */
function encodeRfc2047(text) {
  const s = String(text || '');
  if (/^[\x20-\x7E]+$/.test(s)) return s;
  const buf = Buffer.from(s, 'utf8');
  return '=?UTF-8?B?' + buf.toString('base64') + '?=';
}

function isVrcNotification(change) {
  return !!(change && change.eventType === 'vrc_notification');
}

const NOTIFICATION_MESSAGE = '{notificationBody}\n发送者: {friendName}\n{categoryOrWorld}\n时间: {timestamp}';
/** 渲染站内通知消息; 空正文/无分类产生的空行直接剔除 */
function renderNotificationMessage(vars, template) {
  return renderTemplate(template || NOTIFICATION_MESSAGE, vars)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}
const NOTIFICATION_EMAIL_SUBJECT = '【VRChat通知】{notificationTitle}';
const NOTIFICATION_EMAIL_BODY = [
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px">',
  '  <h2 style="margin-top:0">VRChat 通知</h2>',
  '  <p style="font-size:16px"><b>{notificationTitle}</b></p>',
  '  <p style="white-space:pre-wrap">{notificationBody}</p>',
  '  <table style="width:100%;border-collapse:collapse">',
  '    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">发送者</td><td style="padding:8px;border-bottom:1px solid #eee">{friendName}</td></tr>',
  '  </table>',
  '  <p style="color:#999;font-size:12px">时间: {timestamp}</p>',
  '</div>'
].join('\n');

/** 统一变化变量; 空描述显示为 "无" */
function buildChangeVars(change) {
  const vars = {
    friendName: change.friendName || '',
    oldStatus: statusLabel(change.oldStatus) || '未知',
    newStatus: statusLabel(change.newStatus) || '未知',
    oldWorld: change.oldWorld || '-',
    newWorld: change.newWorld || '-',
    changeType: change.changeType || '',
    timestamp: change.timestamp || '',
    oldStatusDescription: change.oldStatusDescription || '无',
    newStatusDescription: change.newStatusDescription || '无',
    oldPlatform: statusLabel(change.oldPlatform) || '未知',
    newPlatform: statusLabel(change.newPlatform) || '未知',
    notificationTitle: change.notificationTitle || '',
    notificationBody: change.notificationBody != null ? change.notificationBody : (change.newStatusDescription || ''),
    notificationCategory: change.notificationCategory || '',
    notificationCategoryLabel: change.notificationCategoryLabel || change.notificationCategory || '',
    categoryOrWorld: change.categoryOrWorld || ''
  };
  vars.statusLines = buildStatusLines(vars).join('\n');
  return vars;
}

const DEFAULT_EMAIL_SUBJECT = '[VRC-Notifier] {changeType}: {friendName}';
const DEFAULT_EMAIL_BODY = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px">
  <h2 style="margin-top:0">{changeType}</h2>
  <p>好友 <b>{friendName}</b> 的状态发生了变化</p>
  <p style="white-space:pre-wrap">{statusLines}</p>
  <p style="color:#999;font-size:12px">时间: {timestamp}</p>
</div>`;



/** QQ 状态变化消息: 有变化的字段放最前(旧 → 新), 无变化只显示当前值 */
function buildStatusLines(vars) {
  const fields = [
    { label: '状态', old: vars.oldStatus, cur: vars.newStatus },
    { label: '世界', old: vars.oldWorld, cur: vars.newWorld },
    { label: '自定义状态', old: vars.oldStatusDescription, cur: vars.newStatusDescription },
    { label: '平台', old: vars.oldPlatform, cur: vars.newPlatform }
  ];
  const changed = [];
  const unchanged = [];
  for (const f of fields) {
    const line = f.old !== f.cur ? `${f.label}: ${f.old} → ${f.cur}` : `${f.label}: ${f.cur}`;
    (f.old !== f.cur ? changed : unchanged).push(line);
  }
  return [...changed, ...unchanged];
}

function buildEmail(change, opts = {}) {
  const vars = buildChangeVars(change);
  if (isVrcNotification(change)) {
    return {
      subject: renderTemplate(opts.subjectTemplate || NOTIFICATION_EMAIL_SUBJECT, vars),
      html: renderTemplate(opts.bodyTemplate || NOTIFICATION_EMAIL_BODY, vars)
    };
  }
  const subject = renderTemplate(opts.subjectTemplate || DEFAULT_EMAIL_SUBJECT, vars);
  const html = renderTemplate(opts.bodyTemplate || DEFAULT_EMAIL_BODY, vars);
  return { subject, html };
}

function buildGotify(change, opts = {}) {
  const vars = buildChangeVars(change);
  if (isVrcNotification(change)) {
    return {
      title: opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : vars.notificationTitle,
      message: opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : renderNotificationMessage(vars),
      priority: opts.priority == null ? 5 : opts.priority,
      extras: { 'client::display': { contentType: 'text/markdown' } }
    };
  }
  const title = opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : `${change.changeType}: ${change.friendName}`;
  const message = opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : `${vars.statusLines}\n时间: ${vars.timestamp}`;
  return {
    title,
    message,
    priority: opts.priority == null ? 5 : opts.priority,
    extras: { 'client::display': { contentType: 'text/markdown' } }
  };
}

function buildNtfy(change, opts = {}) {
  const vars = buildChangeVars(change);
  if (isVrcNotification(change)) {
    return {
      title: opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : vars.notificationTitle,
      message: opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : renderNotificationMessage(vars),
      priority: opts.priority == null ? 3 : opts.priority,
      tags: null
    };
  }
  const title = opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : `${change.changeType}: ${change.friendName}`;
  const message = opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : `${vars.statusLines}\n时间: ${vars.timestamp}`;
  return { title, message, priority: opts.priority == null ? 3 : opts.priority, tags: null };
}

function buildQq(change, opts = {}) {
  const vars = buildChangeVars(change);
  if (isVrcNotification(change)) {
    return {
      title: opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : vars.notificationTitle,
      message: opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : renderNotificationMessage(vars)
    };
  }
  const title = opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : `${change.changeType}: ${change.friendName}`;
  const message = opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : `${buildStatusLines(vars).join('\n')}\n时间: ${vars.timestamp}`;
  return { title, message };
}

function buildWebhook(change, opts = {}) {
  const vars = buildChangeVars(change);
  let headers = { 'Content-Type': opts.contentType || 'application/json' };
  if (opts.headers) {
    try { headers = { ...headers, ...JSON.parse(opts.headers) }; } catch (e) { /* 忽略非法 headers */ }
  }
  let body;
  if (opts.bodyTemplate) {
    body = renderTemplate(opts.bodyTemplate, vars);
    if (headers['Content-Type'] === 'application/json') {
      try { body = JSON.parse(body); } catch (e) { /* 保持字符串 */ }
    }
  } else if (isVrcNotification(change)) {
    body = {
      event: 'vrc_notification',
      timestamp: change.timestamp || '',
      friend: { name: change.friendName, avatar: change.avatarUrl || '' },
      notification: { category: change.notificationCategory || '', title: change.notificationTitle || '', body: change.notificationBody || change.newStatusDescription || '' }
    };
  } else {
    body = {
      event: change.eventType || 'status_change',
      timestamp: change.timestamp || '',
      friend: { name: change.friendName, avatar: change.avatarUrl || '' },
      change: {
        type: change.changeType,
        oldStatus: statusLabel(change.oldStatus),
        newStatus: statusLabel(change.newStatus),
        oldWorld: change.oldWorld,
        newWorld: change.newWorld,
        oldStatusDescription: change.oldStatusDescription || '无',
        newStatusDescription: change.newStatusDescription || '无',
        oldPlatform: statusLabel(change.oldPlatform),
        newPlatform: statusLabel(change.newPlatform)
      }
    };
  }
  return { method: opts.method || 'POST', url: opts.url, headers, body };
}

module.exports = {
  renderTemplate, statusLabel, encodeRfc2047, buildChangeVars,
  buildEmail, buildGotify, buildNtfy, buildQq, buildWebhook
};
