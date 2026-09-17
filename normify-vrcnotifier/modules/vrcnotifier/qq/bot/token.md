---
uid: 962e1b78
id: vrcnotifier.qq.bot.token
parent: vrcnotifier.qq.bot
name: {zh: "访问令牌与凭据处理", en: "Access Token & Credential Handling"}
description:
  zh: >
      领取并缓存机器人的访问凭据；凭据失效就提示你重新配置。
      
  en: >
      Gets and caches the bot's access credential; if it is rejected, tells you to set it up again.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.890Z"
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
