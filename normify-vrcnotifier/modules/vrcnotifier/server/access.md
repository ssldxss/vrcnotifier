---
uid: bdbed052
id: vrcnotifier.server.access
parent: vrcnotifier.server
name: {zh: "引导配置与访问校验", en: "Bootstrap Config & Access Verification"}
description:
  zh: >
      面板在拿到令牌之前需要的两个免鉴权端点：GET /api/config 返回是否需要令牌、各延迟阈值、加密状态与版本；POST /api/access/verify 告知浏览器输入的密钥是否正确并记录尝试。
      
  en: >
      The two unauthenticated endpoints the panel needs before it has a token: GET /api/config returns tokenRequired, the timing knobs, encryption state and version; POST /api/access/verify tells the browser whether the entered key is correct and logs the attempt.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:48.745Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 659
    end_line: 679
apis:
  - protocol: http
    method: GET
    path: "/api/config"
    description:
      zh: >
          前端引导配置，无需令牌。
      en: >
          Bootstrap configuration for the UI; no token required.
  - protocol: http
    method: POST
    path: "/api/access/verify"
    description:
      zh: >
          校验前端提交的访问令牌，无需令牌。
      en: >
          Verify a submitted access key; no token required.
---
