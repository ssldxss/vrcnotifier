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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.903Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
