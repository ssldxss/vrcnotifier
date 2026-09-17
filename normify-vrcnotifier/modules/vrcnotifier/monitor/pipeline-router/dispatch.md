---
uid: 39b9f5ea
id: vrcnotifier.monitor.pipeline-router.dispatch
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "消息分流", en: "Message Dispatch"}
description:
  zh: >
      决定这条消息收不收、归谁管：未完成对账前一律忽略，会话不存在时丢弃，没有 content 的消息直接丢弃，其余按 type 分派。
      
  en: >
      Decides whether to accept a message and which part should handle it: messages are ignored until reconciliation finishes, dropped when the caller's session is gone, and dropped outright when content is missing; everything else is dispatched by type.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.881Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
