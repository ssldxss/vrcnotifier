'use strict';
// QQ 快捷命令: 绑定用户发消息触发, 基于好友表生成文本回复。

// 状态圆点与 VRCX 一致: 在线绿/加入我蓝/询问我橙/忙碌红
const STATUS_EMOJI = { active: '🟢', 'join me': '🔵', 'ask me': '🟠', busy: '🔴' };

function statusEmoji(status) {
  return STATUS_EMOJI[status] || '⚪';
}

// 启动说明: 服务器启动连接成功与首次输入时推送, 提示输入任意消息查看在线列表
const STARTUP_TEXT = '✅ 服务已启动, 好友监控运行中\n输入任意消息即可查看在线列表';

function displayWidth(s) {
  let w = 0;
  for (const ch of String(s || '')) w += ch.codePointAt(0) > 0xff ? 2 : 1;
  return w;
}

function padEnd(s, len) {
  return String(s || '') + ' '.repeat(Math.max(0, len - displayWidth(s)));
}

/** 在线列表: 只统计游戏在线(state=online), 列: 状态圆点 + 昵称 + 世界名。返回 { text, markdown } 供通道选择渲染 */
function buildOnlineList(friends) {
  const online = (friends || []).filter((f) => f.state === 'online');
  if (!online.length) return { text: '当前没有游戏在线的朋友。' };
  const rows = online.map((f) => ({
    emoji: statusEmoji(f.status),
    name: f.display_name || f.friend_vrchat_id || '?',
    world: f.world_name || '-'
  }));
  const nameW = Math.max(...rows.map((r) => displayWidth(r.name)));
  const text = `【在线列表】${online.length} 人在线\n${rows.map((r) => `${r.emoji} ${padEnd(r.name, nameW)}  ${r.world}`).join('\n')}`;
  const header = `### 在线列表 (${online.length})`;
  const table = `| 昵称 | 世界 |\n| :--- | :--- |\n${rows.map((r) => `| ${r.emoji} ${r.name} | ${r.world} |`).join('\n')}`;
  const markdown = `${header}\n\n${table}`;
  // 流式输出: 第一片标题, 第二片完整表格
  return { text, markdown, streamChunks: [header, `\n\n${table}`] };
}

function createQqCommands({ db, logger = null }) {
  const log = logger || { info: () => {}, warn: () => {}, error: () => {} };
  return async function handleCommand(ctx) {
    const { dbId } = ctx;
    // 只有在线列表一个功能: 首次提示由绑定消息承担, 任意输入直接输出表格
    const reply = buildOnlineList(db.listFriends(dbId));
    log.info('[qq] 命令: 在线列表');
    return reply;
  };
}

module.exports = { createQqCommands, buildOnlineList, statusEmoji, STARTUP_TEXT };
