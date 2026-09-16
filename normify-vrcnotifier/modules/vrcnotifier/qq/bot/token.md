---
uid: 962e1b78
id: vrcnotifier.qq.bot.token
parent: vrcnotifier.qq.bot
name: {zh: "访问令牌与凭据处理", en: "Access Token & Credential Handling"}
description:
  zh: >
      获取并缓存机器人访问令牌，在过期前留出安全余量刷新，并把并发刷新合并到同一个 promise 上。被服务端明确判定为无效的凭据按终止处理：清空 QQ 设置并停止机器人，让面板显示配置问题而不是无止境的循环重试。
      
  en: >
      Obtains and caches the bot access token, refreshing it with a safety margin before expiry and de-duplicating concurrent refreshes behind a single promise. Credentials that the server rejects outright are treated as terminal: the QQ settings are cleared and the bot stops, so the panel shows a configuration problem rather than an endless retry loop.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 7094142f722e044697a2766956a9f4f48c08f4bd9cb1e41a940418989de21016
source:
  - path: "src/qq.js"
    line: 57
    end_line: 128
apis:
  - protocol: rpc
    path: "ensureToken(bot, force)"
    description:
      zh: >
          获取并缓存应用访问令牌，合并并发请求。
          
      en: >
          Fetch and cache the app access token, coalescing concurrent requests.
          
  - protocol: rpc
    path: "handleInvalidCredentials(bot, detail)"
    description:
      zh: >
          凭据失效时清除 QQ 设置并停止机器人。
          
      en: >
          React to invalid credentials by clearing the QQ settings and stopping the bot.
          
  - protocol: http
    method: POST
    path: "https://bots.qq.com/app/getAppAccessToken"
    description:
      zh: >
          向令牌端点提交 AppID 与 AppSecret。
          
      en: >
          POST the app id and client secret to the token endpoint.
          
deps:
  - kind: call
    to: vrcnotifier.data.settings
    label: {zh: "读取 QQ 凭据", en: "Read QQ credentials"}
---
