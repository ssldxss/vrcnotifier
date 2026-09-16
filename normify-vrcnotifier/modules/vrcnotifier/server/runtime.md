---
uid: 975edfdc
id: vrcnotifier.server.runtime
parent: vrcnotifier.server
name: {zh: "应用装配与共享运行态", en: "App Composition & Runtime State"}
description:
  zh: >
      HTTP 层的组合根：注入协作者，派生共享的事件总线/世界名/日志引用，声明单用户运行态（当前会话、pending 2FA 表、重登表、SSE 客户端集、退避参数），返回 app 与自动登录/连接状态/认证指令入口。
      
  en: >
      Composition root of the HTTP layer: injects collaborators, derives the shared bus/world-name/log references, declares single-user runtime state (current session, pending-2FA map, relogin map, SSE clients, backoff knobs) and returns the app plus the auto-login, connection-status and auth-command entry points.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:45.133Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 34
    end_line: 73
  - path: "src/server.js"
    line: 1065
    end_line: 1076
apis:
  - protocol: rpc
    path: "createApp(opts)"
    description:
      zh: >
          创建 Express 应用及自动登录入口。
      en: >
          Create the Express app plus the auto-login entry.
  - protocol: rpc
    path: "autoLogin()"
    description:
      zh: >
          从已保存 cookie 恢复会话（即发即忘）。
      en: >
          Fire-and-forget session restore from saved cookies.
---
