---
uid: 19fef64a
id: vrcnotifier.server.middleware
parent: vrcnotifier.server
name: {zh: "HTTP 中间件管线", en: "HTTP Middleware Pipeline"}
description:
  zh: >
      按注册顺序的请求管线及收尾：JSON 解析、CORS、Bearer 令牌门、未知 API 404、静态托管与兜底错误处理。
  en: >
      Request pipeline registered in order plus the tail: JSON body parsing, CORS, the Bearer-token gate, the unknown-API 404, static hosting and the fallback error handler.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:35:00Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
---
