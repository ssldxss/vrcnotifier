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
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.793Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
source:
  - path: "src/server.js"
---
