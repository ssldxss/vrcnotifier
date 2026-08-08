'use strict';
// 通知渠道: 邮件(Gotify/NTFY/Webhook) 发送器。

const nodemailer = require('nodemailer');
const { buildEmail, buildGotify, buildNtfy, buildQq, buildWebhook, encodeRfc2047 } = require('./templates');
const { formatLocalTime } = require('./util');

function createNotifier({ logger = null, fetchImpl = fetch, createTransport = null, now = Date.now, qq = null, getSettings = null } = {}) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };

  // 通知配置统一来自全局 settings 表
  function globalConfig(user) {
    const settings = getSettings ? (getSettings() || {}) : {};
    return { id: user && user.id, ...settings };
  }

  async function sendEmail(user, change) {
    if (!user.smtp_enabled || !user.smtp_host || !user.smtp_user || !user.smtp_pass || !user.email) {
      return { ok: false, reason: '未配置SMTP或收件邮箱' };
    }
    try {
      const transportFactory = createTransport || nodemailer.createTransport;
      const transporter = transportFactory({
        host: user.smtp_host,
        port: user.smtp_port || 587,
        secure: !!user.smtp_secure,
        auth: { user: user.smtp_user, pass: user.smtp_pass }
      });
      const { subject, html } = buildEmail(change, {
        subjectTemplate: user.email_subject_template,
        bodyTemplate: user.email_body_template
      });
      const info = await transporter.sendMail({
        from: `"vrcnotifier" <${user.smtp_user}>`,
        to: user.email,
        subject,
        html
      });
      log.info(`[通知] 邮件已发送至 ${user.email}: ${subject}`);
      return { ok: true, info };
    } catch (e) {
      log.error(`[通知] 邮件发送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  async function sendGotify(user, change) {
    if (!user.gotify_enabled || !user.gotify_server_url || !user.gotify_app_token) {
      return { ok: false, reason: '未配置Gotify' };
    }
    try {
      const g = buildGotify(change, {
        titleTemplate: user.gotify_title_template,
        messageTemplate: user.gotify_message_template,
        priority: user.gotify_priority
      });
      const url = String(user.gotify_server_url).replace(/\/$/, '') + '/message?token=' + encodeURIComponent(user.gotify_app_token);
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: g.title, message: g.message, priority: g.priority, extras: g.extras })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log.info(`[通知] Gotify 已推送: ${g.title}`);
      return { ok: true };
    } catch (e) {
      log.error(`[通知] Gotify 推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  async function sendNtfy(user, change) {
    if (!user.ntfy_enabled || !user.ntfy_server_url || !user.ntfy_topic) {
      return { ok: false, reason: '未配置NTFY' };
    }
    try {
      const n = buildNtfy(change, {
        titleTemplate: user.ntfy_title_template,
        messageTemplate: user.ntfy_message_template,
        priority: user.ntfy_priority
      });
      const cleanTitle = n.title.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250) || 'vrcnotifier';
      const url = String(user.ntfy_server_url).replace(/\/$/, '') + '/' + encodeURIComponent(user.ntfy_topic);
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          Title: encodeRfc2047(cleanTitle),
          Priority: String(Math.max(1, Math.min(5, n.priority)))
        },
        body: n.message
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log.info(`[通知] NTFY 已推送: ${cleanTitle}`);
      return { ok: true };
    } catch (e) {
      log.error(`[通知] NTFY 推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  async function sendWebhook(user, change) {
    if (!user.webhook_enabled || !user.webhook_url) {
      return { ok: false, reason: '未配置Webhook' };
    }
    try {
      const w = buildWebhook(change, {
        url: user.webhook_url,
        method: user.webhook_method,
        headers: user.webhook_headers,
        bodyTemplate: user.webhook_body_template,
        contentType: user.webhook_content_type
      });
      const body = typeof w.body === 'string' ? w.body : JSON.stringify(w.body);
      const res = await fetchImpl(w.url, { method: w.method, headers: w.headers, body: w.method === 'GET' ? undefined : body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log.info(`[通知] Webhook 已推送: ${w.url}`);
      return { ok: true };
    } catch (e) {
      log.error(`[通知] Webhook 推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  async function sendQq(user, change) {
    if (!qq || !user.qq_enabled || !user.qq_app_id || !user.qq_app_secret) {
      return { ok: false, reason: '未配置QQ机器人' };
    }
    try {
      const q = buildQq(change);
      const text = q.title + '\n' + q.message;
      const result = await qq.sendText(user.id, text);
      return result || { ok: false, reason: '发送失败' };
    } catch (e) {
      log.error(`[通知] QQ 推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  /** 直接向绑定 QQ 用户发送原始文本(启动/恢复等系统消息, 不经模板) */
  async function sendQqText(dbId, text) {
    if (!qq) return { ok: false, reason: '未配置QQ机器人' };
    try {
      const result = await qq.sendText(dbId, text);
      return result || { ok: false, reason: '发送失败' };
    } catch (e) {
      log.error(`[通知] QQ 文本推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  async function sendAll(user, change) {
    const cfg = globalConfig(user);
    const [email, gotify, ntfy, webhook, qqRes] = await Promise.all([
      sendEmail(cfg, change), sendGotify(cfg, change), sendNtfy(cfg, change), sendWebhook(cfg, change), sendQq(cfg, change)
    ]);
    return { email, gotify, ntfy, webhook, qq: qqRes };
  }

  async function sendTest(user, kind) {
    const cfg = globalConfig(user);
    const testChange = {
      friendName: '测试好友',
      oldStatus: 'offline', newStatus: 'active',
      oldWorld: '-', newWorld: '测试世界',
      changeType: '测试通知',
      oldStatusDescription: '无', newStatusDescription: '这是一条测试通知',
      oldPlatform: 'unknown', newPlatform: 'standalonewindows',
      timestamp: formatLocalTime(now()),
      avatarUrl: '', eventType: 'test'
    };
    switch (kind) {
      case 'email': return sendEmail(cfg, testChange);
      case 'gotify': return sendGotify(cfg, testChange);
      case 'ntfy': return sendNtfy(cfg, testChange);
      case 'webhook': return sendWebhook(cfg, testChange);
      case 'qq': return sendQq(cfg, testChange);
      default: return { ok: false, reason: '未知渠道' };
    }
  }

  return { sendEmail, sendGotify, sendNtfy, sendWebhook, sendQq, sendQqText, sendAll, sendTest };
}

module.exports = { createNotifier };
