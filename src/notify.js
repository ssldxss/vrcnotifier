'use strict';
// 通知渠道: 仅 QQ 官方机器人推送(邮件/Gotify/NTFY/Webhook 已移除)。

const { buildQq } = require('./templates');
const { formatLocalTime } = require('./util');

function createNotifier({ logger = null, now = Date.now, qq = null, getSettings = null } = {}) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };

  // 通知配置统一来自全局 settings 表
  function globalConfig(user) {
    const settings = getSettings ? (getSettings() || {}) : {};
    return { id: user && user.id, ...settings };
  }

  async function sendQq(user, change) {
    if (!qq || !user.qq_enabled || !user.qq_app_id || !user.qq_app_secret) {
      return { ok: false, reason: '未配置QQ机器人' };
    }
    try {
      const q = buildQq(change);
      const text = q.title + '\n' + q.message;
      const result = await qq.sendText(user.id, text, { markdown: true });
      return result || { ok: false, reason: '发送失败' };
    } catch (e) {
      log.error(`[通知] QQ 推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  /** 直接向绑定 QQ 用户发送原始文本(启动/恢复等系统消息, 不经模板) */
  async function sendQqText(dbId, text, opts = {}) {
    if (!qq) return { ok: false, reason: '未配置QQ机器人' };
    try {
      const result = await qq.sendText(dbId, text, opts);
      return result || { ok: false, reason: '发送失败' };
    } catch (e) {
      log.error(`[通知] QQ 文本推送失败: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  /** 全渠道分发: 当前仅 QQ */
  async function sendAll(user, change) {
    const cfg = globalConfig(user);
    const qqRes = await sendQq(cfg, change);
    return { qq: qqRes };
  }

  async function sendTest(user, kind) {
    if (kind !== 'qq') return { ok: false, reason: '未知渠道' };
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
    return sendQq(cfg, testChange);
  }

  return { sendQq, sendQqText, sendAll, sendTest };
}

module.exports = { createNotifier };
