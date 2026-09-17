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
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.798Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
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
