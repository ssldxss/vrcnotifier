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
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.801Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
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
