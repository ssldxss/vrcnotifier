---
uid: cd0cd7c5
id: vrcnotifier.qq
parent: vrcnotifier
name: {zh: "QQ 机器人推送", en: "QQ Bot Delivery"}
description:
  zh: >
      QQ 官方机器人投递：网关连接、凭据处理、限速发送、以在线列表作答的聊天指令，以及通知分发与 Markdown 消息模板。
      
  en: >
      QQ official-bot delivery: the gateway connection, credential handling, rate-limited sending, chat commands that answer with the online list, plus the notification fan-out and the Markdown message templates.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: a7062d3ab86b06e87dece803a89437f40798c540c10c93596d055ef636885920
source:
  - path: "src/qq.js"
  - path: "src/qq-commands.js"
  - path: "src/notify.js"
  - path: "src/templates.js"
deps:
  - kind: call
    to: vrcnotifier.qq.bot
    label: {zh: "机器人连接", en: "Bot connection"}
  - kind: call
    to: vrcnotifier.qq.commands
    label: {zh: "聊天指令", en: "Chat commands"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "通知分发", en: "Notification fan-out"}
  - kind: call
    to: vrcnotifier.qq.templates
    label: {zh: "消息模板", en: "Message templates"}
---
