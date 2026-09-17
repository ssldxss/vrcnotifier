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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.282Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
