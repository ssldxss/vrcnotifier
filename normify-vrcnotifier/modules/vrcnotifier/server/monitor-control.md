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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:23:01.487Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
