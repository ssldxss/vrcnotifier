---
uid: 1513e0f7
id: vrcnotifier.server.auth.relogin.loop
parent: vrcnotifier.server.auth.relogin
name: {zh: "重登循环与退避", en: "Re-login Loop & Backoff"}
description:
  zh: >
      一次次尝试重新登录：成功就继续，一直失败就放弃并告诉你。
      
  en: >
      Keeps attempting the re-login, carries on when it succeeds, and gives up with a notice if it keeps failing.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.677Z"
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
    label: {zh: "成功后建会话", en: "Finalize on success"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "推送重登进展", en: "Notify about the attempt"}
  - kind: call
    to: vrcnotifier.data.users
    label: {zh: "读取已存凭据", en: "Read saved credentials"}
---
