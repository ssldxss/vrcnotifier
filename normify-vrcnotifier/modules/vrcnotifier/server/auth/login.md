---
uid: "89119286"
id: vrcnotifier.server.auth.login
parent: vrcnotifier.server.auth
name: {zh: "密码登录", en: "Password Login"}
description:
  zh: >
      POST /api/login：校验入参、清理过期的 pending 2FA 记录，用新的无 jar 客户端登录；VRChat 要求 2FA 时存入临时会话（密码在 TTL 内驻留内存）并返回可用的验证方式，否则直接落地会话。在耗时的好友同步之前先发 sync-progress verified，让等待页按顺序逐行点亮。
      
  en: >
      POST /api/login: validates the body, prunes expired pending-2FA entries, logs in with a fresh jar-less client; when VRChat demands 2FA it stores a temp session (password held in memory for the TTL) and returns the accepted factors, otherwise it finalizes the session. Emits sync-progress verified before the slow friend sync so the boot overlay lights up in order.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
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
    from_api: "POST /api/login"
    to_api: "rpc:login(username, password)"
    label: {zh: "提交凭据登录", en: "Log in with credentials"}
  - kind: call
    to: vrcnotifier.server.auth.session
    from_api: "POST /api/login"
    to_api: "rpc:finalizeLogin(vrcapi, currentUser, opts)"
    label: {zh: "落地会话", en: "Finalize the session"}
---
