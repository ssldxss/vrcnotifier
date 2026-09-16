---
uid: 3b578667
id: vrcnotifier.monitor.pipeline-router
parent: vrcnotifier.monitor
name: {zh: "WS 事件路由", en: "WS Event Router"}
description:
  zh: >
      WS 侧唯一入口及其门禁：重连再同步、每帧必须通过的四道准入检查，以及按事件类型映射到好友/自身/通知三条处理链。
      
  en: >
      The only WS-side entry point and the gatekeeper around it: reconnection resynchronisation, the four admission checks every frame must pass, and the per-event-type mapping onto the friend, self and notification pipelines.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
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
---
