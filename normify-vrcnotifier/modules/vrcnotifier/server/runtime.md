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
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.793Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
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
