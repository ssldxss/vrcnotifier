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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.286Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
source:
  - path: "src/server.js"
---
