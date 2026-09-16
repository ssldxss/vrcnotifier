---
uid: 2e3fe8fe
id: vrcnotifier.qq.templates
parent: vrcnotifier.qq
name: {zh: "消息模板", en: "Message Templates"}
description:
  zh: >
      把变更对象变成人读消息：占位符引擎、中文标签表、Markdown 转义，以及把“变化的”排在“没变的”之前的行序规则。
      
  en: >
      Turns a change object into a human-readable message: the placeholder engine, the Chinese label tables, markdown escaping and the ordering rules that put what changed before what did not.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
---
