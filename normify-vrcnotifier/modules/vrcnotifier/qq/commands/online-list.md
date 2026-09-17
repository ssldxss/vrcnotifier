---
uid: "9e709364"
id: vrcnotifier.qq.commands.online-list
parent: vrcnotifier.qq.commands
name: {zh: "在线列表渲染", en: "Online List Rendering"}
description:
  zh: >
      把在线好友整理成一张好读的列表。
      
  en: >
      Turns the online friends into a readable list.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.278Z"
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
