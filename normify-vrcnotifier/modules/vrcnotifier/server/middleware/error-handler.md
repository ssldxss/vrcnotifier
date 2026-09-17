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
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:19.393Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
