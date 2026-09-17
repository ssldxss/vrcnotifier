---
uid: a84fbf8f
id: vrcnotifier.qq.bot
parent: vrcnotifier.qq
name: {zh: "QQ 机器人连接", en: "QQ Bot Connection"}
description:
  zh: >
      QQ 官方机器人的连接与收发。
      
  en: >
      The connection and message handling for the official QQ bot.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.888Z"
fingerprint: 7094142f722e044697a2766956a9f4f48c08f4bd9cb1e41a940418989de21016
source:
  - path: "src/qq.js"
deps:
  - kind: call
    to: vrcnotifier.qq.bot.token
    label: {zh: "访问令牌", en: "Access token"}
  - kind: call
    to: vrcnotifier.qq.bot.sender
    label: {zh: "消息发送", en: "Message sending"}
  - kind: call
    to: vrcnotifier.qq.bot.socket
    label: {zh: "网关连接", en: "Gateway socket"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    label: {zh: "机器人注册表", en: "Bot registry"}
  - kind: call
    to: vrcnotifier.qq.commands
    label: {zh: "注册指令", en: "Registers commands"}
---
