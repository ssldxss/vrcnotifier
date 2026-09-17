---
uid: 6363c35e
id: vrcnotifier.qq.templates.vars
parent: vrcnotifier.qq.templates
name: {zh: "模板变量与标签", en: "Template Variables & Labels"}
description:
  zh: >
      把状态换算成人话，并把昵称里的特殊符号转义。
  en: >
      Turns states into plain words, and escapes special characters in nicknames.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.820Z"
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
