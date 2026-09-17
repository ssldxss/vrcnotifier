---
uid: 945d1a24
id: vrcnotifier.server.auth.two-factor
parent: vrcnotifier.server.auth
name: {zh: "登录两步验证", en: "Login Two-Factor Verification"}
description:
  zh: >
      验证登录时的两步验证码，通过后正式建立登录状态。
      
  en: >
      Checks the two-factor code during login and, once correct, establishes the session.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.676Z"
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
    label: {zh: "验证验证码", en: "Verify the code"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "收尾建立会话", en: "Finalize the session"}
---
