'use strict';
// QQ 快捷命令: 绑定用户发消息触发, 基于好友表生成文本回复。

const { formatLocalTime } = require('./util');

// 状态圆点与 VRCX 一致: 在线绿/加入我蓝/询问我橙/忙碌红
const STATUS_EMOJI = { active: '🟢', 'join me': '🔵', 'ask me': '🟠', busy: '🔴' };

function statusEmoji(status) {
  return STATUS_EMOJI[status] || '⚪';
}

// 启动说明: 服务器启动连接成功与首次输入时推送, 提示输入任意消息查看在线列表
const STARTUP_TEXT = '# ✅ 服务已启动\n好友监控运行中\n输入任意消息即可查看在线列表';

function displayWidth(s) {
  let w = 0;
  for (const ch of String(s || '')) w += ch.codePointAt(0) > 0xff ? 2 : 1;
  return w;
}

function padEnd(s, len) {
  return String(s || '') + ' '.repeat(Math.max(0, len - displayWidth(s)));
}

/** 在线列表: 特别关注好友(不管在线与否)优先, 其余游戏在线好友; 列: 状态圆点 + 昵称 + 世界名 */
function buildOnlineList(friends) {
  const all = friends || [];
  const fav = all.filter((f) => f.favorite === 1);
  const online = all.filter((f) => f.favorite !== 1 && f.state === 'online');
  const toRows = (list) => list.map((f) => ({
    emoji: f.state === 'online' ? statusEmoji(f.status) : '⚪',
    name: f.display_name || f.friend_vrchat_id || '?',
    world: f.state === 'online' ? (f.world_name || '-') : '离线'
  }));
  if (!fav.length && !online.length) return { text: '当前没有游戏在线的朋友。' };
  const onlineCount = all.filter((f) => f.state === 'online').length;
  const renderTable = (rows) => `| 昵称 | 世界 |\n| :--- | :--- |\n${rows.map((r) => `| ${r.emoji} ${r.name} | ${r.world} |`).join('\n')}`;
  const sections = [];
  if (fav.length) sections.push(`## ⭐ 特别关注\n\n${renderTable(toRows(fav))}`);
  if (online.length) sections.push(`## 其他在线\n\n${renderTable(toRows(online))}`);
  const header = `# 在线列表 (${onlineCount})`;
  const markdown = `${header}\n\n${sections.join('\n\n')}`;
  // 纯文本: 同样分块
  const allRows = [...toRows(fav), ...toRows(online)];
  const nameW = Math.max(...allRows.map((r) => displayWidth(r.name)));
  const textParts = [`【在线列表】${onlineCount} 人在线`];
  if (fav.length) textParts.push(`【特别关注】\n${toRows(fav).map((r) => `${r.emoji} ${padEnd(r.name, nameW)}  ${r.world}`).join('\n')}`);
  if (online.length) textParts.push(`【其他在线】\n${toRows(online).map((r) => `${r.emoji} ${padEnd(r.name, nameW)}  ${r.world}`).join('\n')}`);
  const text = textParts.join('\n');
  return { text, markdown };
}

function createQqCommands({ db, logger = null, getStatus = null }) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  return async function handleCommand(ctx) {
    const { dbId } = ctx;
    // 只有在线列表一个功能: 首次提示由绑定消息承担, 任意输入直接输出表格
    const configs = new Map(db.listConfigs(dbId).map((c) => [c.friend_vrchat_id, c]));
    const friends = db.listFriends(dbId).map((f) => ({
      ...f,
      favorite: configs.get(f.friend_vrchat_id)?.favorite === 1 ? 1 : 0
    }));
    const reply = buildOnlineList(friends);
    // 连接异常(WS 重连中 / 401 未恢复): 头部提示数据截止时间, 后面仍是原列表
    const st = getStatus ? getStatus(dbId) : null;
    if (st && !st.connected && st.since) {
      const head = `当前未连接, 数据截止至 ${formatLocalTime(st.since)}`;
      reply.text = `${head}\n\n${reply.text}`;
      if (reply.markdown) reply.markdown = `${head}\n\n${reply.markdown}`;
    }
    log.info('[qq] 命令: 在线列表');
    return reply;
  };
}

module.exports = { createQqCommands, buildOnlineList, statusEmoji, STARTUP_TEXT };
