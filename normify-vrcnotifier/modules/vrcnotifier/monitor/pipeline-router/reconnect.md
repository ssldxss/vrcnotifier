---
uid: 1efd6a11
id: vrcnotifier.monitor.pipeline-router.reconnect
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "重连再同步", en: "Reconnect Resynchronisation"}
description:
  zh: >
      断线重连后先整体核对一遍，看看这段时间漏了什么。
      
  en: >
      After a reconnect, re-checks everything first to catch whatever was missed while disconnected.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.270Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 660
    end_line: 667
apis:
  - protocol: rpc
    path: "handleWsReconnect(userId)"
    description:
      zh: >
          重连后先挡住 WS 消息并跑一次完整核对。
          
      en: >
          Block WS messages and run a full check after reconnecting.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    label: {zh: "重连后核对", en: "Reconcile after reconnect"}
---
