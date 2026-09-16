---
uid: cb383a2d
id: vrcnotifier.monitor
parent: vrcnotifier
name: {zh: "好友监控编排", en: "Friend Monitoring Orchestration"}
description:
  zh: >
      监控编排层：WS 事件分发、REST 快照对账、状态机落地、通知去重与 WS 看门狗。持有会话表与下线确认定时器，把三类输入（实时事件、快照、pending 校验）统一收敛到好友状态机。
      
  en: >
      Monitoring orchestration: WS event dispatch, REST snapshot reconciliation, state-machine persistence, notification dedupe and the WS watchdog. It holds the session table and the pending-offline confirmation timers, and treats every input (live event, snapshot, pending check) as one call into the friend state machine.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
deps:
  - kind: call
    to: vrcnotifier.monitor.state
    label: {zh: "状态落地", en: "Persist presence"}
  - kind: call
    to: vrcnotifier.monitor.notify
    label: {zh: "通知分发", en: "Dispatch notifications"}
  - kind: call
    to: vrcnotifier.monitor.snapshot
    label: {zh: "快照对账", en: "Reconcile snapshots"}
  - kind: call
    to: vrcnotifier.monitor.pipeline-router
    label: {zh: "WS 事件路由", en: "Route WS events"}
---
