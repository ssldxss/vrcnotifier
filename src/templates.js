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

/** 统一变化变量; 空描述显示为 "无" */
function buildChangeVars(change) {
  return {
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
    newPlatform: statusLabel(change.newPlatform) || '未知'
  };
}

const DEFAULT_EMAIL_SUBJECT = '[VRC-Notifier] {changeType}: {friendName}';
const DEFAULT_EMAIL_BODY = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px">
  <h2 style="margin-top:0">{changeType}</h2>
  <p>好友 <b>{friendName}</b> 的状态发生了变化</p>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">变化类型</td><td style="padding:8px;border-bottom:1px solid #eee">{changeType}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">状态</td><td style="padding:8px;border-bottom:1px solid #eee">{oldStatus} → {newStatus}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">世界</td><td style="padding:8px;border-bottom:1px solid #eee">{oldWorld} → {newWorld}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">自定义状态</td><td style="padding:8px;border-bottom:1px solid #eee">{oldStatusDescription} → {newStatusDescription}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">平台</td><td style="padding:8px;border-bottom:1px solid #eee">{oldPlatform} → {newPlatform}</td></tr>
  </table>
  <p style="color:#999;font-size:12px">时间: {timestamp}</p>
</div>`;

const DEFAULT_GOTIFY_MESSAGE = '好友 {friendName} {changeType}\n\n状态: {oldStatus} → {newStatus}\n世界: {newWorld}\n自定义状态: {newStatusDescription}\n\n时间: {timestamp}';

function buildEmail(change, opts = {}) {
  const vars = buildChangeVars(change);
  const subject = renderTemplate(opts.subjectTemplate || DEFAULT_EMAIL_SUBJECT, vars);
  const html = renderTemplate(opts.bodyTemplate || DEFAULT_EMAIL_BODY, vars);
  return { subject, html };
}

function buildGotify(change, opts = {}) {
  const vars = buildChangeVars(change);
  const title = opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : `${change.friendName} ${change.changeType}`;
  const message = opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : renderTemplate(DEFAULT_GOTIFY_MESSAGE, vars);
  return {
    title,
    message,
    priority: opts.priority == null ? 5 : opts.priority,
    extras: { 'client::display': { contentType: 'text/markdown' } }
  };
}

function buildNtfy(change, opts = {}) {
  const vars = buildChangeVars(change);
  const title = opts.titleTemplate ? renderTemplate(opts.titleTemplate, vars) : `${change.friendName} ${change.changeType}`;
  const message = opts.messageTemplate ? renderTemplate(opts.messageTemplate, vars) : renderTemplate(DEFAULT_GOTIFY_MESSAGE, vars);
  return { title, message, priority: opts.priority == null ? 3 : opts.priority, tags: null };
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
  buildEmail, buildGotify, buildNtfy, buildWebhook
};
