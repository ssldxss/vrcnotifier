---
uid: 631e65cc
id: vrcnotifier.vrc.api.auth
parent: vrcnotifier.vrc.api
name: {zh: "登录与身份接口", en: "Login & Identity Calls"}
description:
  zh: >
      客户端的身份部分：密码登录并自动识别 2FA 挑战（邮箱验证码会重新格式化为 VRChat 期望的 xxxx-xxxx），验证码校验，当前用户与任意用户资料读取，以及用于打开 WebSocket 的 auth token。这些调用都绕开重试循环，让凭据问题立即暴露。
      
  en: >
      The identity half of the client: password login with automatic detection of the 2FA challenge (email OTP codes are reformatted into the xxxx-xxxx shape VRChat expects), code verification, current-user and arbitrary-user reads, and the auth token used to open the WebSocket. All of these bypass the retry loop so that credential problems surface immediately.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
          校验两步验证码，8 位邮箱码格式化为 xxxx-xxxx。
          
      en: >
          Verify a two-factor code; 8-digit email codes become xxxx-xxxx.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.transport
    from_api: "rpc:login(username, password)"
    to_api: "rpc:request(path, opts)"
    label: {zh: "发出请求", en: "Send the request"}
---
