---
uid: "9e709364"
id: vrcnotifier.qq.commands.online-list
parent: vrcnotifier.qq.commands
name: {zh: "在线列表渲染", en: "Online List Rendering"}
description:
  zh: >
      构造对任意聊天消息的回复：特别关注优先，其后是其他在线好友，世界尽量解析成名字，同时输出 Markdown 表格与按显示宽度对齐的纯文本（中日韩字符按两列计）。它还持有状态表情表与监控层首次连接时发送的启动文案。
      
  en: >
      Builds the reply to any chat message: favorites first, then other online friends, each world resolved to a name where possible, emitted both as a markdown table and as plain text with columns padded by display width (CJK counts as two columns). It also owns the status emoji table and the startup text that the monitor sends on first connect.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:48.745Z"
fingerprint: 652d724595a7f9952f451e353502dd7ab8b39d064c1b32db4ce6ed02cec64d20
source:
  - path: "src/qq-commands.js"
    line: 6
    end_line: 58
apis:
  - protocol: rpc
    path: "buildOnlineList(friends)"
    description:
      zh: >
          把在线好友渲染为 Markdown 表格与对齐的纯文本两份。
      en: >
          Render the online friends as both a markdown table and padded plain text.
  - protocol: rpc
    path: "statusEmoji(status)"
    description:
      zh: >
          把社交状态映射为表情符号。
      en: >
          Map a social status to its emoji.
  - protocol: rpc
    path: "displayWidth(s)"
    description:
      zh: >
          按宽字符占两列计算显示宽度。
      en: >
          Compute display width treating wide characters as two columns.
---
