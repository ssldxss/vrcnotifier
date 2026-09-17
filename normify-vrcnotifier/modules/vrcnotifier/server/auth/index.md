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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.281Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
