---
uid: ab072822
id: vrcnotifier.web.logview
parent: vrcnotifier.web
name: {zh: "日志窗口长度控制", en: "Keeping the Log Short"}
description:
  zh: >
      日志窗口太长时，决定该丢掉哪一头。
  en: >
      Decides which end of the log window to drop when it gets too long.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:37.674Z"
fingerprint: 460b15ef6d9cbc8053f581e474a5ad1c9e15ea4769edc72ba7438666fce2d73c
source:
  - path: "public/logview.js"
    line: 1
    end_line: 30
apis:
  - protocol: rpc
    path: "plan({totalRows, maxRows, mode})"
    description:
      zh: >
          决定从哪一侧裁剪以及裁多少行。
          
      en: >
          Decide which side to trim and by how many rows.
          
  - protocol: rpc
    path: "MAX_ROWS"
    description:
      zh: >
          日志面板的 DOM 行数上限。
          
      en: >
          The DOM row cap for the log panel.
          
---
