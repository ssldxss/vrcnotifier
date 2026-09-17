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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.281Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
