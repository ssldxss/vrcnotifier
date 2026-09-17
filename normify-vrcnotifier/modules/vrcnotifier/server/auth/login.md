---
uid: "89119286"
id: vrcnotifier.server.auth.login
parent: vrcnotifier.server.auth
name: {zh: "密码登录", en: "Password Login"}
description:
  zh: >
      用账号密码登录；如果需要两步验证，就把验证码那一步交给下一环节。
      
  en: >
      Signs in with username and password; if a two-factor code is needed, hands that step on to the next module.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.896Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
    line: 682
    end_line: 695
  - path: "src/server.js"
    line: 697
    end_line: 739
apis:
  - protocol: http
    method: POST
    path: "/api/login"
    description:
      zh: >
          用户名密码登录，可能返回 2FA 挑战与临时会话 id。
          
      en: >
          Username/password login; may return a 2FA challenge and temp session id.
          
  - protocol: rpc
    path: "loginError(e)"
    description:
      zh: >
          把 VRChat 登录错误映射为可操作提示。
          
      en: >
          Map VRChat login errors to actionable messages.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.auth
    label: {zh: "提交凭据登录", en: "Log in with credentials"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "收尾建立会话", en: "Finalize the session"}
---
