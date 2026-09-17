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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.675Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
