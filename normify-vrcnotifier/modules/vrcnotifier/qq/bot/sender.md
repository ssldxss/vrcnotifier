---
uid: 40b908ef
id: vrcnotifier.qq.bot.sender
parent: vrcnotifier.qq.bot
name: {zh: "消息发送与重试", en: "Message Sending & Retry"}
description:
  zh: >
      唯一的发送收口。所有主动消息都经过按绑定 key 串行的 promise 链，使两条通知永远不会竞争，并保持最小发送间隔。网络错误、429 与 5xx 会重试，401/403 先强制刷新令牌再重试一次，其余 4xx 立即失败。被拒绝的 Markdown 被动回复会回退为纯文本。文本按平台上限截断。
      
  en: >
      The single send funnel. Every proactive message goes through a promise chain keyed by binding so two notifications can never race, with a minimum spacing between sends. Network errors, 429 and 5xx are retried, 401 and 403 force a token refresh then retry once, and other 4xx fail immediately. A markdown passive reply that is rejected falls back to plain text. Text is truncated to the platform limit.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
