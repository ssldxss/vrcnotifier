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
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.797Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
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
