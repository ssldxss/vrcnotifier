---
uid: cd0cd7c5
id: vrcnotifier.qq
parent: vrcnotifier
name: {zh: "QQ 机器人推送", en: "QQ Bot Delivery"}
description:
  zh: >
      把所有消息送到你的 QQ：机器人连接、它回你的话，以及消息模板。
      
  en: >
      Gets every message to your QQ: the bot connection, the replies it sends, and the message templates.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.892Z"
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
  - kind: call
    to: vrcnotifier.data
    label: {zh: "读绑定与设置", en: "Reads bindings and settings"}
---
