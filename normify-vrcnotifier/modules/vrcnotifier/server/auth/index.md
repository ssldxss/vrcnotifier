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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.895Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
