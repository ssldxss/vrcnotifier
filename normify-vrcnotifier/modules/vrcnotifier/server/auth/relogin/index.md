---
uid: 01bd8f97
id: vrcnotifier.server.auth.relogin
parent: vrcnotifier.server.auth
name: {zh: "自动重登", en: "Automatic Re-login"}
description:
  zh: >
      登录过期时用保存的密码自动重新登录；需要验证码时会到 QQ 上问你。
      
  en: >
      Re-logs in with the saved password when a session expires, and asks you for a code over QQ when needed.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.896Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
deps:
  - kind: call
    to: vrcnotifier.server.auth.relogin.loop
    label: {zh: "重登循环", en: "Re-login loop"}
  - kind: call
    to: vrcnotifier.server.auth.relogin.two-factor
    label: {zh: "验证码入口", en: "2FA intake"}
---
