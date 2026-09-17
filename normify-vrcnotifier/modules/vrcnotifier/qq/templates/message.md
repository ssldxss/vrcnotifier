---
uid: 05c84c9c
id: vrcnotifier.qq.templates.message
parent: vrcnotifier.qq.templates
name: {zh: "消息组装", en: "Message Assembly"}
description:
  zh: >
      按「好友变化」或「站内通知」两种格式拼出最终消息。
      
  en: >
      Assembles the final message, in either the friend-change or the in-app-notice format.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.893Z"
fingerprint: 883db5c48ad541745ac77c62cb229bdaa5bab2bb5cdba1945ffc08164b19eb6e
source:
  - path: "src/templates.js"
    line: 90
    end_line: 107
apis:
  - protocol: rpc
    path: "buildQq(change, opts)"
    description:
      zh: >
          由变更构造 QQ 消息的标题与正文。
          
      en: >
          Build the title and body of a QQ message from a change.
          
  - protocol: rpc
    path: "renderNotificationMessage(vars, template)"
    description:
      zh: >
          渲染站内通知正文，剔除空行。
          
      en: >
          Render an in-app notification body, dropping blank lines.
          
  - protocol: rpc
    path: "isVrcNotification(change)"
    description:
      zh: >
          判断是否为站内通知类系统事件。
          
      en: >
          True for in-app notification system events.
          
deps:
  - kind: call
    to: vrcnotifier.qq.templates.vars
    label: {zh: "构造变量", en: "Build variables"}
  - kind: call
    to: vrcnotifier.qq.commands.online-list
    label: {zh: "共用状态表情", en: "Share the status emoji"}
---
