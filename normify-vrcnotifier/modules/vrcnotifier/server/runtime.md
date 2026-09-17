---
uid: 975edfdc
id: vrcnotifier.server.runtime
parent: vrcnotifier.server
name: {zh: "应用组装与共享数据", en: "App Composition & Runtime State"}
description:
  zh: >
      组装网页服务本身，并记住当前是谁登录着。
      
  en: >
      Builds the web server itself and keeps track of who is currently logged in.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.678Z"
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
