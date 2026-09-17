---
uid: 39b9f5ea
id: vrcnotifier.monitor.pipeline-router.dispatch
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "消息分流", en: "Message Dispatch"}
description:
  zh: >
      决定这条消息收不收、归谁管。
  en: >
      Decides whether to accept a message and which part should handle it.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:39.661Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 669
    end_line: 682
  - path: "src/monitor.js"
    line: 811
    end_line: 832
apis:
  - protocol: rpc
    path: "handlePipelineEvent(userId, raw, parsed)"
    description:
      zh: >
          准入检查、按类型分派与外层异常兜底。
          
      en: >
          Admission checks, per-type dispatch and the outer error guard.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.pipeline-router.friend-events
    label: {zh: "好友事件映射", en: "Friend event mapping"}
  - kind: call
    to: vrcnotifier.monitor.pipeline-router.self-events
    label: {zh: "自身事件映射", en: "Self event mapping"}
  - kind: call
    to: vrcnotifier.monitor.notify.vrc-notification
    label: {zh: "站内通知", en: "In-app notifications"}
---
