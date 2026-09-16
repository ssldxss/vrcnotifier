---
uid: aadb16f3
id: vrcnotifier.server
parent: vrcnotifier
name: {zh: "HTTP 服务与 REST API", en: "HTTP Server & REST API"}
description:
  zh: >
      全项目唯一的 Express 5 HTTP 面：VRChat 登录与 2FA、会话恢复、好友列表与逐好友通知配置、全局设置、测试通知、监控状态、日志查询、唯一 SSE 流、头像文件与静态 UI。
      
  en: >
      The single Express 5 HTTP surface: VRChat login and 2FA, session restore, friend list and per-friend notification config, global settings, test notifications, monitor status, log query, one SSE stream, avatar file serving and the static UI.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
deps:
  - kind: call
    to: vrcnotifier.server.auth
    label: {zh: "认证路由", en: "Authentication routes"}
  - kind: call
    to: vrcnotifier.server.sse
    label: {zh: "事件流", en: "Event stream"}
  - kind: call
    to: vrcnotifier.server.logs
    label: {zh: "日志接口", en: "Log API"}
---
