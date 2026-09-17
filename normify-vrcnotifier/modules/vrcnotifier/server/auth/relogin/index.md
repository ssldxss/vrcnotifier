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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:20:59.990Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
