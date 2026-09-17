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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.285Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
