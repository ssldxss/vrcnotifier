---
uid: f0bb20d6
id: vrcnotifier.server.middleware.error-handler
parent: vrcnotifier.server.middleware
name: {zh: "兜底错误处理", en: "Fallback Error Handler"}
description:
  zh: >
      Express 兜底错误处理：记录失败并回 500 JSON；若响应头已发出则跳过写回，避免破坏已部分写出的响应。
      
  en: >
      Final Express error handler: logs the failure and answers 500 JSON, skipping the response when headers have already been sent so a partially written reply is never corrupted.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:48.744Z"
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
