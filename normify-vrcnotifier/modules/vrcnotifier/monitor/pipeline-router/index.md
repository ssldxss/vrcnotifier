---
uid: 3b578667
id: vrcnotifier.monitor.pipeline-router
parent: vrcnotifier.monitor
name: {zh: "WS 事件路由", en: "WS Event Router"}
description:
  zh: >
      VRChat 推来的每条消息，先判断要不要管，再分给对应的地方。
      
  en: >
      Every message VRChat pushes is first checked, then handed to the right place.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:20:59.992Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
deps:
  - kind: call
    to: vrcnotifier.monitor.pipeline-router.dispatch
    label: {zh: "准入与分派", en: "Admission and dispatch"}
  - kind: call
    to: vrcnotifier.monitor.pipeline-router.reconnect
    label: {zh: "重连再同步", en: "Reconnect resync"}
  - kind: call
    to: vrcnotifier.monitor.state
    label: {zh: "把变化交给状态", en: "Hands changes to state"}
  - kind: call
    to: vrcnotifier.monitor.world-name
    label: {zh: "查世界名", en: "Looks up world names"}
  - kind: call
    to: vrcnotifier.monitor.notify
    label: {zh: "触达通知", en: "Triggers notifications"}
  - kind: call
    to: vrcnotifier.monitor.snapshot
    label: {zh: "必要时全量核对", en: "Triggers a full check"}
---
