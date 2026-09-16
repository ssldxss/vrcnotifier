---
uid: 945d1a24
id: vrcnotifier.server.auth.two-factor
parent: vrcnotifier.server.auth
name: {zh: "登录两步验证", en: "Login Two-Factor Verification"}
description:
  zh: >
      POST /api/login/2fa：取出待验证会话，校验验证码（邮箱验证码按 xxxx-xxxx 格式化），重新读取当前用户，再用登录时暂存的凭据落地会话。验证码错误或过期回 400；限流经共享的登录错误映射处理。
      
  en: >
      POST /api/login/2fa: looks up the pending session, verifies the code (email OTP codes are formatted as xxxx-xxxx), re-reads the current user, then finalizes the session with the credentials captured at login time. Wrong or expired codes return 400; rate limiting is mapped through the shared login error table.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 741
    end_line: 777
apis:
  - protocol: http
    method: POST
    path: "/api/login/2fa"
    description:
      zh: >
          用临时会话 id 与验证码完成登录 2FA。
          
      en: >
          Complete login 2FA with a temp session id and code.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.auth
    label: {zh: "校验验证码", en: "Verify the code"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "落地会话", en: "Finalize the session"}
---
