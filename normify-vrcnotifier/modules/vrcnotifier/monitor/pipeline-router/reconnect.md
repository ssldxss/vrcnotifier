---
uid: 1efd6a11
id: vrcnotifier.monitor.pipeline-router.reconnect
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "重连再同步", en: "Reconnect Resynchronisation"}
description:
  zh: >
      重连意味着本地画面可能已经过时，因此把该用户放入等待对账集合并立即触发全量对账；在对账完成之前丢弃所有 WebSocket 消息并记一条日志。用少量消息丢失换取一个保证：不会基于前端未曾见过的状态缺口推导状态。
      
  en: >
      A reconnect means the local picture may be stale, so the user is put into the awaiting-snapshot set and a full reconciliation is triggered; until it finishes every WebSocket message is dropped with a log line. This trades a little message loss for the guarantee that no state is derived from a gap the panel never saw.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
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
          重连后先拦截 WS 消息并跑一次全量对账。
          
      en: >
          Block WS messages and run a full reconciliation after reconnecting.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    label: {zh: "重连后对账", en: "Reconcile after reconnect"}
---
