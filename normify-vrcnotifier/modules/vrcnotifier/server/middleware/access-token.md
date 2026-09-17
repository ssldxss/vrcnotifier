---
uid: 595f3218
id: vrcnotifier.server.middleware.access-token
parent: vrcnotifier.server.middleware
name: {zh: "访问令牌鉴权门", en: "Access Token Gate"}
description:
  zh: >
      检查请求有没有带对的访问令牌。
      
  en: >
      Checks that a request carries the right access token.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.794Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
source:
  - path: "src/server.js"
    line: 136
    end_line: 140
  - path: "src/server.js"
    line: 642
    end_line: 657
apis:
  - protocol: rpc
    path: "requireAccessToken(req, res, next)"
    description:
      zh: >
          除白名单外全部 /api 请求都要检查 Bearer 或查询串里的令牌。
          
      en: >
          Gate every /api request except the whitelist on a Bearer or query token.
          
  - protocol: rpc
    path: "tokenEquals(a, b)"
    description:
      zh: >
          先比长度，再用恒定耗时的方式比较令牌。
          
      en: >
          Length-checked, timing-safe token comparison.
          
---
