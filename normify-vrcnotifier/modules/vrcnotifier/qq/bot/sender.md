---
uid: 40b908ef
id: vrcnotifier.qq.bot.sender
parent: vrcnotifier.qq.bot
name: {zh: "消息发送与重试", en: "Message Sending & Retry"}
description:
  zh: >
      把消息发给 QQ；发太快会排队，失败了会重试。
  en: >
      Sends messages to QQ, queuing them so they do not go out too fast, and retrying failures.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.819Z"
fingerprint: 7094142f722e044697a2766956a9f4f48c08f4bd9cb1e41a940418989de21016
source:
  - path: "src/qq.js"
    line: 32
    end_line: 56
  - path: "src/qq.js"
    line: 129
    end_line: 225
apis:
  - protocol: rpc
    path: "sendText(dbId, text, opts)"
    description:
      zh: >
          发送主动文本或 Markdown 消息，按配置截断并重试。
          
      en: >
          Send a proactive text or markdown message, truncating and retrying as configured.
          
  - protocol: rpc
    path: "sendPassive(bot, openid, msgId, reply)"
    description:
      zh: >
          针对入站消息 id 做被动回复。
          
      en: >
          Reply passively to an inbound message id.
          
  - protocol: rpc
    path: "enqueueSend(bindingKey, task)"
    description:
      zh: >
          按绑定串行发送，并保持最小间隔。
          
      en: >
          Serialize sends per binding with a minimum spacing between them.
          
  - protocol: http
    method: POST
    path: "https://api.sgroup.qq.com/v2/users/{openid}/messages"
    description:
      zh: >
          向 C2C 端点投递消息。
          
      en: >
          POST a message to the C2C endpoint.
          
deps:
  - kind: call
    to: vrcnotifier.qq.bot.token
    label: {zh: "取访问令牌", en: "Get the access token"}
---
