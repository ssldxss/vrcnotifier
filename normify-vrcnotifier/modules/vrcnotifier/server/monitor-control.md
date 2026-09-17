---
uid: 68e7cd79
id: vrcnotifier.server.monitor-control
parent: vrcnotifier.server
name: {zh: "核对与测试通知路由", en: "Snapshot & Test Notification Routes"}
description:
  zh: >
      两个手动按钮：立即刷新一次好友状态、发一条测试通知。
      
  en: >
      Two manual buttons: refresh friend status right now, and send a test notification.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.902Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
    line: 938
    end_line: 954
  - path: "src/server.js"
    line: 988
    end_line: 1003
apis:
  - protocol: http
    method: POST
    path: "/api/monitor/snapshot"
    description:
      zh: >
          手动触发一次完整核对。
          
      en: >
          Manually trigger one full check.
          
  - protocol: http
    method: POST
    path: "/api/test/{kind}"
    description:
      zh: >
          按渠道类型发送测试通知。
          
      en: >
          Send a test notification for a channel kind.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    label: {zh: "执行一次核对", en: "Run one check"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "发送测试通知", en: "Send a test notification"}
---
