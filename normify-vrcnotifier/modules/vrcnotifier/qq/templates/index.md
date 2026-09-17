---
uid: 2e3fe8fe
id: vrcnotifier.qq.templates
parent: vrcnotifier.qq
name: {zh: "消息模板", en: "Message Templates"}
description:
  zh: >
      消息长什么样：标题、正文，以及每种状态对应的说法和表情。
      
  en: >
      What messages look like: the title, the body, and the words and emoji used for each state.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:21:00.000Z"
fingerprint: 883db5c48ad541745ac77c62cb229bdaa5bab2bb5cdba1945ffc08164b19eb6e
source:
  - path: "src/templates.js"
deps:
  - kind: call
    to: vrcnotifier.qq.templates.vars
    label: {zh: "模板变量", en: "Template variables"}
  - kind: call
    to: vrcnotifier.qq.templates.message
    label: {zh: "消息组装", en: "Message assembly"}
  - kind: call
    to: vrcnotifier.qq.commands
    label: {zh: "取状态表情", en: "Gets status emoji"}
---
