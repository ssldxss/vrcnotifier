---
uid: a84fbf8f
id: vrcnotifier.qq.bot
parent: vrcnotifier.qq
name: {zh: "QQ 机器人连接", en: "QQ Bot Connection"}
description:
  zh: >
      QQ 官方机器人（bot.q.qq.com OpenAPI，非 OneBot）：令牌获取、按绑定串行的 C2C 发送、带心跳与 identify 的网关连接、首条消息绑定与生命周期管理。
      
  en: >
      The QQ official bot (bot.q.qq.com OpenAPI, not OneBot): token acquisition, C2C message sending with a per-binding serial queue, gateway connection with heartbeat and identify, first-message binding and lifecycle management.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
---
