---
uid: 595f3218
id: vrcnotifier.server.middleware.access-token
parent: vrcnotifier.server.middleware
name: {zh: "访问令牌鉴权门", en: "Access Token Gate"}
description:
  zh: >
      Bearer 访问令牌门。未配置令牌时整体跳过；仅作用于 /api；白名单为 /api/config 与 /api/access/verify。路径先小写并去尾斜杠，避免大小写变体绕过令牌门却又命中路由；比较使用恒时算法。
      
  en: >
      Bearer access-token gate. Skipped entirely when no token is configured; applies to /api only; /api/config and /api/access/verify are whitelisted. The path is lowercased and stripped of trailing slashes so that case variants cannot bypass the gate while still matching Express routes; comparison is timing-safe.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:48.744Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
          除白名单外全部 /api 请求校验 Bearer 或查询串令牌。
      en: >
          Gate every /api request except the whitelist on a Bearer or query token.
  - protocol: rpc
    path: "tokenEquals(a, b)"
    description:
      zh: >
          先校长度再用恒时比较校验令牌。
      en: >
          Length-checked, timing-safe token comparison.
---
