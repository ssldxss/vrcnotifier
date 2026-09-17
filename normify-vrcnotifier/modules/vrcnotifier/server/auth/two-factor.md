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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.283Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
