---
uid: 631e65cc
id: vrcnotifier.vrc.api.auth
parent: vrcnotifier.vrc.api
name: {zh: "登录与身份接口", en: "Login & Identity Calls"}
description:
  zh: >
      登录、验证码、读自己的资料。
      
  en: >
      Signing in, verifying codes, and reading your own profile.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.907Z"
fingerprint: 41550317630bd0c2e6ca7b19edbe553bad6fd8b8e48ed4f731379e1a8333b2ec
source:
  - path: "src/vrcapi.js"
    line: 108
    end_line: 146
apis:
  - protocol: rpc
    path: "me(opts)"
    description:
      zh: >
          读取当前用户（GET /auth/user）。
          
      en: >
          GET /auth/user as the current user.
          
  - protocol: rpc
    path: "user(userId, opts)"
    description:
      zh: >
          读取指定用户的公开资料。
          
      en: >
          GET /users/{id} for a public profile.
          
  - protocol: rpc
    path: "authToken()"
    description:
      zh: >
          获取 WebSocket 令牌（GET /auth）。
          
      en: >
          GET /auth for the WebSocket token.
          
  - protocol: rpc
    path: "login(username, password)"
    description:
      zh: >
          用 HTTP Basic 凭据登录，需要时返回 2FA 挑战。
          
      en: >
          Login with HTTP Basic credentials; returns a 2FA challenge when required.
          
  - protocol: rpc
    path: "verify2fa(kind, code)"
    description:
      zh: >
          验证两步验证码，8 位邮箱码格式化为 xxxx-xxxx。
          
      en: >
          Verify a two-factor code; 8-digit email codes become xxxx-xxxx.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.transport
    label: {zh: "发出请求", en: "Send the request"}
---
