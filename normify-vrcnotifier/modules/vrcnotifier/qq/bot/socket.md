---
uid: f3d60e01
id: vrcnotifier.qq.bot.socket
parent: vrcnotifier.qq.bot
name: {zh: "网关连接与心跳", en: "Gateway Socket & Heartbeat"}
description:
  zh: >
      网关状态机。Hello 携带心跳间隔并触发 identify；op 0 分发 READY 与两个 C2C 消息事件；op 11 确认心跳，若连续三个间隔无确认则看门狗终止连接；op 7 要求重连，op 9 要求重建会话。两个关闭码表示机器人被永久停用，此时停止重连；其余情况按指数退避加抖动重连。
      
  en: >
      The gateway state machine. Hello carries the heartbeat interval and triggers identify; op 0 dispatches READY and the two C2C message events; op 11 acknowledges heartbeats and a watchdog terminates the socket after three idle intervals; op 7 asks for a reconnect and op 9 for a fresh session. Two close codes mean the bot is permanently disabled and reconnection stops, while everything else backs off exponentially with jitter.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
