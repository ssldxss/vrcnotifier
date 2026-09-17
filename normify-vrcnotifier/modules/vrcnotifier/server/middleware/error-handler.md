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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.286Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
