---
uid: 01bd8f97
id: vrcnotifier.server.auth.relogin
parent: vrcnotifier.server.auth
name: {zh: "自动重登", en: "Automatic Re-login"}
description:
  zh: >
      cookie 失效（换 IP/会话挂起）时用已保存密码自动重登：每用户状态表、每小时滚动频控、指数退避，以及网页弹窗与 QQ 共用的验证码校验通道。
      
  en: >
      Re-login with the saved password when cookies go stale (IP change or suspended session): a per-user state map, rolling hourly rate limit, exponential backoff and the shared OTP verification path used by both the web modal and QQ.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
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
