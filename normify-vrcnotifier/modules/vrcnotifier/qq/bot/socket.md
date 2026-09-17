---
uid: f3d60e01
id: vrcnotifier.qq.bot.socket
parent: vrcnotifier.qq.bot
name: {zh: "网关连接与心跳", en: "Gateway Socket & Heartbeat"}
description:
  zh: >
      和 QQ 服务器保持长连接，并定期报个到，让 QQ 知道它还活着。
      
  en: >
      Keeps a long-lived connection to QQ and reports in periodically so QQ knows it is still there.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.889Z"
fingerprint: 7094142f722e044697a2766956a9f4f48c08f4bd9cb1e41a940418989de21016
source:
  - path: "src/qq.js"
    line: 227
    end_line: 271
  - path: "src/qq.js"
    line: 272
    end_line: 373
  - path: "src/qq.js"
    line: 375
    end_line: 435
apis:
  - protocol: rpc
    path: "connect(bot)"
    description:
      zh: >
          打开网关、identify 并启动心跳。
          
      en: >
          Open the gateway, identify and start the heartbeat.
          
  - protocol: rpc
    path: "handleFrame(bot, ws, raw)"
    description:
      zh: >
          按 opcode 分发入站帧。
          
      en: >
          Dispatch an inbound frame by opcode.
          
  - protocol: rpc
    path: "sendIdentify(bot)"
    description:
      zh: >
          用配置的 intents 发送 op 2 identify。
          
      en: >
          Send op 2 identify with the configured intents.
          
  - protocol: rpc
    path: "startHeartbeat(bot)"
    description:
      zh: >
          发送 op 1 心跳，长时间无 ack 则终止连接。
          
      en: >
          Send op 1 heartbeats and terminate after idle acknowledgements.
          
  - protocol: ws
    path: "wss://api.sgroup.qq.com/websocket"
    description:
      zh: >
          连接 QQ 机器人网关。
          
      en: >
          Connect to the QQ bot gateway.
          
deps:
  - kind: call
    to: vrcnotifier.qq.bot.token
    label: {zh: "用令牌 identify", en: "Identify with a token"}
  - kind: call
    to: vrcnotifier.qq.bot.sender
    label: {zh: "发送被动回复", en: "Send passive replies"}
  - kind: call
    to: vrcnotifier.qq.commands.handler
    label: {zh: "处理聊天指令", en: "Handle chat commands"}
  - kind: call
    to: vrcnotifier.data.qq-binding
    label: {zh: "首条消息绑定", en: "Bind on first message"}
---
