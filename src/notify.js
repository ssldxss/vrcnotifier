'use strict';
// 通知渠道: 邮件(Gotify/NTFY/Webhook) 发送器。

const nodemailer = require('nodemailer');
const { buildEmail, buildGotify, buildNtfy, buildWebhook, encodeRfc2047 } = require('./templates');

function createNotifier({ logger = null, fetchImpl = fetch, createTransport = null, now = Date.now } = {}) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };

  async function sendEmail(user, change) {
    if (!user.smtp_host || !user.smtp_user || !user.smtp_pass || !user.email) {
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

  async function sendAll(user, change) {
    const [email, gotify, ntfy, webhook] = await Promise.all([
      sendEmail(user, change), sendGotify(user, change), sendNtfy(user, change), sendWebhook(user, change)
    ]);
    return { email, gotify, ntfy, webhook };
  }

  async function sendTest(user, kind) {
    const testChange = {
      friendName: '测试好友',
      oldStatus: 'offline', newStatus: 'active',
      oldWorld: '-', newWorld: '测试世界',
      changeType: '测试通知',
      oldStatusDescription: '无', newStatusDescription: '这是一条测试通知',
      oldPlatform: 'unknown', newPlatform: 'standalonewindows',
      timestamp: new Date(now()).toLocaleString('zh-CN'),
      avatarUrl: '', eventType: 'test'
    };
    switch (kind) {
      case 'email': return sendEmail(user, testChange);
      case 'gotify': return sendGotify(user, testChange);
      case 'ntfy': return sendNtfy(user, testChange);
      case 'webhook': return sendWebhook(user, testChange);
      default: return { ok: false, reason: '未知渠道' };
    }
  }

  return { sendEmail, sendGotify, sendNtfy, sendWebhook, sendAll, sendTest };
}

module.exports = { createNotifier };
