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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.898Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
