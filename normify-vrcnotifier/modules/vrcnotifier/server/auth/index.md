---
uid: 70d372f6
id: vrcnotifier.server.auth
parent: vrcnotifier.server
name: {zh: "登录认证与会话", en: "Authentication & Session"}
description:
  zh: >
      登录相关的全部环节：密码登录、两步验证、自动重登、退出。
      
  en: >
      Everything about signing in: password login, two-factor codes, automatic re-login, and logout.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-17T00:14:58.619Z"
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
