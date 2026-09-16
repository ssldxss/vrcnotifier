---
uid: 1513e0f7
id: vrcnotifier.server.auth.relogin.loop
parent: vrcnotifier.server.auth.relogin
name: {zh: "重登循环与退避", en: "Re-login Loop & Backoff"}
description:
  zh: >
      按 VRCX 同款方式重登：先复用旧 cookie jar 带上上下文，再用保存的密码登录。遇到 2FA 挑战则挂起并同时经 QQ 与 SSE 2fa-needed 通知；成功后落地会话并广播 relogin-ok；401 立即失败，网络/429/5xx 走退避。滚动 1 小时上限防止持续冲击登录接口。
      
  en: >
      Executes re-login the VRCX way: reuse the old cookie jar so the request carries context, then log in with the saved password. A 2FA challenge parks the attempt and notifies over QQ plus an SSE 2fa-needed event; success finalizes the session and broadcasts relogin-ok; a 401 fails fast while network, 429 and 5xx errors back off. A rolling hourly cap prevents hammering the login endpoint.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 354
    end_line: 377
  - path: "src/server.js"
    line: 399
    end_line: 427
  - path: "src/server.js"
    line: 429
    end_line: 475
apis:
  - protocol: rpc
    path: "runRelogin(userId, reason, savedJar, opts)"
    description:
      zh: >
          带着旧 cookie 与保存的密码执行一次重登。
          
      en: >
          Run one re-login attempt with old cookies plus the saved password.
          
  - protocol: rpc
    path: "scheduleReloginRetry(userId, st, reason, savedJar)"
    description:
      zh: >
          为失败的重登排期退避重试。
          
      en: >
          Schedule a backoff retry for a failed re-login.
          
  - protocol: rpc
    path: "giveUpRelogin(userId)"
    description:
      zh: >
          放弃重登、停用用户并发出会话失效事件。
          
      en: >
          Give up, deactivate the user and emit session-expired.
          
  - protocol: rpc
    path: "reloginAttempts(userId, atMs)"
    description:
      zh: >
          用于频控的滚动 1 小时尝试计数。
          
      en: >
          Rolling one-hour attempt counter for rate limiting.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.auth
    label: {zh: "用保存密码重登", en: "Log in with saved password"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "成功则落地", en: "Finalize on success"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "推送重登进展", en: "Notify about the attempt"}
  - kind: call
    to: vrcnotifier.data.users
    label: {zh: "读取已存凭据", en: "Read saved credentials"}
---
