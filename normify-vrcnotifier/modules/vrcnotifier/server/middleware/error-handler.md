---
uid: f0bb20d6
id: vrcnotifier.server.middleware.error-handler
parent: vrcnotifier.server.middleware
name: {zh: "兜底错误处理", en: "Fallback Error Handler"}
description:
  zh: >
      万一出错，记下原因并回一句「服务器内部错误」，而不是直接崩掉。
      
  en: >
      If something throws, logs the reason and answers with a plain server error instead of crashing.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.901Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
    line: 1069
    end_line: 1074
apis:
  - protocol: rpc
    path: "errorHandler(err, req, res, next)"
    description:
      zh: >
          记录错误并在未发头时返回 500 JSON。
          
      en: >
          Log the error and return 500 JSON unless headers were sent.
          
---
