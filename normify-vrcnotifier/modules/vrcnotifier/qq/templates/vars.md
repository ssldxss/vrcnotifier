---
uid: 6363c35e
id: vrcnotifier.qq.templates.vars
parent: vrcnotifier.qq.templates
name: {zh: "模板变量与标签", en: "Template Variables & Labels"}
description:
  zh: >
      所有消息共用的渲染词汇。它把机器值映射为中文标签（三种在线状态、四种社交状态），对昵称与世界名等用户可控内容转义 Markdown 元字符，并把变更展开为自定义模板可引用的变量。状态行构造刻意保留未变化字段但不加粗，使只变一项的消息仍能显示上下文。
      
  en: >
      The rendering vocabulary shared by every message. It maps machine values to Chinese labels (three presence states, four social statuses), escapes markdown metacharacters in anything user-controlled such as nicknames and world names, and flattens a change into the template variables that custom templates can reference. The status line builder deliberately keeps unchanged fields visible but unbolded so a one-field change still shows its context.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:48.745Z"
fingerprint: 883db5c48ad541745ac77c62cb229bdaa5bab2bb5cdba1945ffc08164b19eb6e
source:
  - path: "src/templates.js"
    line: 5
    end_line: 88
apis:
  - protocol: rpc
    path: "renderTemplate(template, vars)"
    description:
      zh: >
          替换 {占位符}，null 视为空串。
      en: >
          Replace {placeholder} tokens, treating null as empty.
  - protocol: rpc
    path: "buildChangeVars(change)"
    description:
      zh: >
          把变更与标签/表情展开成模板变量集。
      en: >
          Flatten a change plus labels and emoji into the template variable set.
  - protocol: rpc
    path: "buildStatusLines(vars)"
    description:
      zh: >
          为消息排版把字段分为有变化与无变化两组。
      en: >
          Split changed and unchanged fields for the message layout.
  - protocol: rpc
    path: "escapeMd(s)"
    description:
      zh: >
          对动态值转义 Markdown 控制字符。
      en: >
          Escape markdown control characters in dynamic values.
---
