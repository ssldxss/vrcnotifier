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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:23:01.489Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
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
