---
uid: 70d372f6
id: vrcnotifier.server.auth
parent: vrcnotifier.server
name: {zh: "登录认证与会话", en: "Authentication & Session"}
description:
  zh: >
      VRChat 认证：密码登录与 2FA 挑战移交、2FA 完成、会话落地、登出、自动登录恢复，以及自动重登状态机。
      
  en: >
      VRChat authentication: password login with a 2FA challenge hand-off, 2FA completion, session finalization, logout, automatic login recovery and the auto-relogin state machine.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
deps:
  - kind: call
    to: vrcnotifier.server.auth.login
    label: {zh: "密码登录", en: "Password login"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "会话生命周期", en: "Session lifecycle"}
  - kind: call
    to: vrcnotifier.server.auth.auto-login
    label: {zh: "自动登录恢复", en: "Auto-login recovery"}
  - kind: call
    to: vrcnotifier.server.auth.relogin
    label: {zh: "自动重登", en: "Auto re-login"}
---
