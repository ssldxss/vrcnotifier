---
uid: ab072822
id: vrcnotifier.web.logview
parent: vrcnotifier.web
name: {zh: "日志窗口裁剪策略", en: "Log Window Trimming Policy"}
description:
  zh: >
      日志面板的裁剪策略，独立成模块以便脱离浏览器做单元测试。它感知方向：实时模式下新行从顶部插入，因此裁掉底部最旧的行；向前翻页时旧行追加到底部，因此裁掉顶部最新的行。两种情况下被裁内容都可再生——前者经后端口径翻回，后者经实时流补回。
      
  en: >
      The log panel's trimming policy, extracted so it can be unit tested without a browser. It is direction aware: in live mode new rows arrive at the top so the oldest rows at the bottom are trimmed, while when paging back through history rows are appended at the bottom and the newest rows at the top are trimmed. Either way the trimmed content is regenerable, from the backend by paging or from the live stream.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
