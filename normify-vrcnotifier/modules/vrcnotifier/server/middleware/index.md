---
uid: 19fef64a
id: vrcnotifier.server.middleware
parent: vrcnotifier.server
name: {zh: "HTTP 中间件管线", en: "HTTP Middleware Pipeline"}
description:
  zh: >
      每个请求都要先过的几道关：解析内容、允许跨域、检查令牌、出错兜底。
      
  en: >
      The checks every request passes through: parse the body, allow cross-origin calls, verify the token, and catch errors.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.901Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
---
